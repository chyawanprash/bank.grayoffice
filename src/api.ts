/**
 * HTTP API layer. Every route validates its input with the zod schemas in
 * types.ts before touching the generator, per the "validate all input
 * parameters" security requirement.
 */
import { z } from "zod";
import {
	BatchRequestSchema,
	GenerateRequestSchema,
	Jurisdiction,
	type AnyDocument,
	type Env,
	type Invoice,
} from "./types";
import { generateDocument, type InvoiceGenOptions } from "./generators/index";
import { RENDER_MUTATIONS, COMMUNICATION_MUTATIONS, applyMutations } from "./mutations";
import { render, type ExportFormat } from "./renderers/index";
import type { PdfTemplate } from "./renderers/pdf";
import { Rng, hashStringToSeed } from "./utils";
import { runScenario, SCENARIOS } from "./scenarios";
import { generateEmail, toEml } from "./communications";
import { zipFiles, type ZipEntry } from "./zip";

const MAX_BATCH = 200; // ponytail: fixed cap, raise if a real workload needs more

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } });
}

function badRequest(message: string, details?: unknown): Response {
	return json({ error: message, details }, 400);
}

async function docKey(testId: string): Promise<string> {
	return `document:${testId}`;
}

async function storeDocument(env: Env, doc: AnyDocument): Promise<void> {
	await env.DOCS.put(await docKey(doc.metadata.test_id), JSON.stringify(doc), { expirationTtl: 60 * 60 * 24 * 7 });
}

// ---------------------------------------------------------------------------
// Simple fixed-window rate limiter backed by KV.
// ponytail: coarse per-minute counter, not sliding-window accurate under
// concurrent bursts - swap for Durable Object counter if abuse becomes real.
// ---------------------------------------------------------------------------
export async function checkRateLimit(env: Env, ip: string, limit = 60, scope = "default", windowMs = 60_000): Promise<boolean> {
	const bucket = Math.floor(Date.now() / windowMs);
	const key = `ratelimit:${scope}:${ip}:${bucket}`;
	const current = Number((await env.DOCS.get(key)) ?? "0");
	if (current >= limit) return false;
	await env.DOCS.put(key, String(current + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
	return true;
}

function sanitizeString(input: unknown): unknown {
	if (typeof input === "string") return input.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 5000);
	if (Array.isArray(input)) return input.map(sanitizeString);
	if (input && typeof input === "object") {
		return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, sanitizeString(v)]));
	}
	return input;
}

export async function handleHealth(): Promise<Response> {
	return json({ status: "ok", service: "synthetic-finance-data-generator", time: new Date().toISOString() });
}

export async function handleListScenarios(): Promise<Response> {
	return json({ scenarios: SCENARIOS });
}

export async function handleGenerate(request: Request, env: Env): Promise<Response> {
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (!(await checkRateLimit(env, ip))) return json({ error: "rate limit exceeded" }, 429);

	let body: unknown;
	try {
		body = sanitizeString(await request.json());
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = GenerateRequestSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const req = parsed.data;

	const seed = req.seed ?? hashStringToSeed(`${req.jurisdiction}:${req.document_type}:${req.scenario}:${Date.now()}`);
	const testId = `TEST-${req.document_type.toUpperCase()}-${seed}`;
	const opts: InvoiceGenOptions = { documentType: req.document_type, testId, scenarioId: req.scenario, seed, self: req.self };

	const doc = generateDocument(req.jurisdiction, req.document_type, opts);
	const rng = new Rng(seed);
	const mutationIds = req.scenario && req.scenario !== "clean" ? [req.scenario] : [];
	const dataExceptions = applyMutations(doc, mutationIds, rng);
	doc.metadata.expected_exceptions = dataExceptions;

	await storeDocument(env, doc);

	const renderFlags = mutationIds.filter((m) => RENDER_MUTATIONS.has(m));

	if (req.format === "eml") {
		if (!("invoice" in doc)) return badRequest("eml format is only supported for invoice-family document types");
		const pdfBytes = await render(doc, "pdf", (req.template as PdfTemplate) ?? "modern", renderFlags, req.orientation);
		const emailScenario = COMMUNICATION_MUTATIONS.has(req.scenario) ? (req.scenario as any) : "standard_invoice";
		const email = generateEmail(new Rng(seed).fork("email"), emailScenario, doc, {
			scenarioId: req.scenario,
			vendorDomain: "vendor.example.com",
			recipientDomain: "acmecorp.example.com",
		});
		const eml = toEml(email, pdfBytes.bytes);
		return new Response(eml, {
			headers: {
				"content-type": "message/rfc822",
				"content-disposition": `inline; filename="${testId}.eml"`,
				"x-test-id": testId,
				"x-synthetic": "true",
			},
		});
	}

	const artifact = await render(doc, req.format as ExportFormat, (req.template as PdfTemplate) ?? "modern", renderFlags, req.orientation);

	return new Response(artifact.bytes, {
		headers: {
			"content-type": artifact.contentType,
			"content-disposition": `inline; filename="${testId}.${artifact.extension}"`,
			"x-test-id": testId,
			"x-synthetic": "true",
		},
	});
}

const MAX_BUNDLE = 50; // ponytail: rendering (esp. PDF) is CPU-bound; keep a lower cap for the zip-bundle path than plain metadata batches

export async function handleBatch(request: Request, env: Env): Promise<Response> {
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (!(await checkRateLimit(env, ip, 10))) return json({ error: "rate limit exceeded" }, 429);

	let body: unknown;
	try {
		body = sanitizeString(await request.json());
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = BatchRequestSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const req = parsed.data;
	if (req.count > MAX_BATCH) return badRequest(`count exceeds maximum batch size of ${MAX_BATCH}`);
	if (req.bundle && req.count > MAX_BUNDLE) return badRequest(`count exceeds maximum bundle size of ${MAX_BUNDLE} when bundle=true`);

	const isScenario = SCENARIOS.some((s) => s.scenario_id === req.scenario);
	const baseSeed = req.seed ?? hashStringToSeed(`${req.jurisdiction}:${req.scenario}:${Date.now()}`);
	const results: Record<string, unknown>[] = [];
	const zipEntries: ZipEntry[] = [];

	for (let i = 0; i < req.count; i++) {
		const seed = baseSeed + i;
		let docsForZip: { testId: string; label: string; document: AnyDocument }[] = [];

		if (isScenario) {
			const bundle = runScenario(req.scenario, req.jurisdiction, seed);
			for (const { document } of bundle.documents) await storeDocument(env, document);
			results.push({
				run_id: `${req.scenario}-${req.jurisdiction}-${seed}`,
				test_ids: bundle.documents.map((d) => d.document.metadata.test_id),
				expected_exceptions: bundle.expected_exceptions,
			});
			docsForZip = bundle.documents.map((d) => ({ testId: d.document.metadata.test_id, label: d.label, document: d.document }));
		} else {
			const documentType = req.document_type ?? (req.jurisdiction === "IN" ? "gst_invoice" : "commercial_invoice");
			const testId = `TEST-BATCH-${documentType.toUpperCase()}-${seed}`;
			const doc = generateDocument(req.jurisdiction, documentType, {
				documentType,
				testId,
				scenarioId: req.scenario,
				seed,
				self: req.self,
			});
			await storeDocument(env, doc);
			results.push({ test_id: testId });
			docsForZip = [{ testId, label: doc.document_type, document: doc }];
		}

		if (req.bundle) {
			for (const { testId, label, document } of docsForZip) {
				for (const format of req.formats) {
					if (format === "eml" && !("invoice" in document)) continue; // eml only makes sense for invoice-family docs
					const artifact = format === "eml" ? await renderEmlArtifact(document as Invoice, req.scenario) : await render(document, format, "modern", [], req.orientation);
					zipEntries.push({ name: `${testId}__${label}.${artifact.extension}`, data: artifact.bytes });
				}
			}
		}
	}

	if (req.bundle) {
		const zipBytes = zipFiles(zipEntries);
		return new Response(zipBytes, {
			headers: {
				"content-type": "application/zip",
				"content-disposition": `attachment; filename="batch-${req.scenario}-${req.jurisdiction}.zip"`,
				"x-synthetic": "true",
				"x-file-count": String(zipEntries.length),
			},
		});
	}

	return json({ count: results.length, formats: req.formats, results });
}

async function renderEmlArtifact(invoice: Invoice, scenarioId: string): Promise<{ bytes: Uint8Array; extension: string }> {
	const pdf = await render(invoice, "pdf");
	const email = generateEmail(new Rng(hashStringToSeed(invoice.metadata.test_id)).fork("email"), "standard_invoice", invoice, {
		scenarioId,
		vendorDomain: "vendor.example.com",
		recipientDomain: "acmecorp.example.com",
	});
	const eml = toEml(email, pdf.bytes);
	return { bytes: new TextEncoder().encode(eml), extension: "eml" };
}

const ScenarioRequestSchema = z.object({
	scenario_id: z.string(),
	jurisdiction: Jurisdiction,
	seed: z.number().int().optional(),
});

export async function handleRunScenario(request: Request, env: Env): Promise<Response> {
	let body: unknown;
	try {
		body = sanitizeString(await request.json());
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = ScenarioRequestSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const { scenario_id, jurisdiction, seed } = parsed.data;
	if (!SCENARIOS.some((s) => s.scenario_id === scenario_id)) return badRequest(`Unknown scenario_id: ${scenario_id}`);

	let bundle;
	try {
		bundle = runScenario(scenario_id, jurisdiction, seed);
	} catch (e) {
		return badRequest((e as Error).message);
	}
	const runId = `${scenario_id}-${jurisdiction}-${bundle.seed}`;
	for (const { document } of bundle.documents) await storeDocument(env, document);
	await env.DOCS.put(`scenario:${runId}`, JSON.stringify(bundle), { expirationTtl: 60 * 60 * 24 * 7 });

	return json({ run_id: runId, ...bundle });
}

export async function handleGetScenario(runId: string, env: Env): Promise<Response> {
	const stored = await env.DOCS.get(`scenario:${runId}`);
	if (!stored) return json({ error: "scenario run not found" }, 404);
	return new Response(stored, { headers: { "content-type": "application/json" } });
}

export async function getDocumentByTestId(
	testId: string,
	format: ExportFormat,
	template: PdfTemplate,
	env: Env,
	orientation: "auto" | "portrait" | "landscape" = "auto",
): Promise<Response> {
	const stored = await env.DOCS.get(await docKey(testId));
	if (!stored) return json({ error: "document not found" }, 404);
	const doc = JSON.parse(stored) as AnyDocument;
	if (format === "json") return new Response(stored, { headers: { "content-type": "application/json" } });
	const artifact = await render(doc, format, template, [], orientation);
	return new Response(artifact.bytes, { headers: { "content-type": artifact.contentType, "content-disposition": `inline; filename="${testId}.${artifact.extension}"` } });
}
