/**
 * Synthetic Finance Data Generator - Cloudflare Worker entry point.
 *
 * Pipeline: Scenario -> Structured Data -> Mutations -> Validation ->
 * Document Renderer -> Export (PDF/PNG/CSV/XLSX/JSON/EML/TXT) -> API.
 *
 * @see code-prompt.md for the full product spec this implements.
 */
import type { Env } from "./types";
import {
	handleBatch,
	handleGenerate,
	handleGetScenario,
	handleHealth,
	handleListScenarios,
	handleRunScenario,
	getDocumentByTestId,
} from "./api";
import type { ExportFormat } from "./renderers/index";
import type { PdfTemplate } from "./renderers/pdf";
import {
	handleListBranches,
	handleListLeadership,
	handleLeaderboard,
	handleCreateAccount,
	handleGetAccount,
	handleListTransactions,
	handleCredit,
	handleDebit,
	handleSubscribe,
	handleTick,
	runHourlyCharges,
} from "./bank/api";
import { createAuth } from "./auth";

function withCors(res: Response): Response {
	const headers = new Headers(res.headers);
	headers.set("access-control-allow-origin", "*");
	headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
	headers.set("access-control-allow-headers", "content-type");
	return new Response(res.body, { status: res.status, headers });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

		const url = new URL(request.url);
		const path = url.pathname;

		if (path.startsWith("/api/auth")) return createAuth(env, url.origin).handler(request);

		try {
			if (path === "/health" && request.method === "GET") return withCors(await handleHealth());
			if (path === "/scenario" && request.method === "GET") return withCors(await handleListScenarios());
			if (path === "/generate" && request.method === "POST") return withCors(await handleGenerate(request, env));
			if (path === "/generate/batch" && request.method === "POST") return withCors(await handleBatch(request, env));
			if (path === "/scenario" && request.method === "POST") return withCors(await handleRunScenario(request, env));

			const scenarioMatch = path.match(/^\/scenario\/([^/]+)$/);
			if (scenarioMatch && request.method === "GET") return withCors(await handleGetScenario(decodeURIComponent(scenarioMatch[1]), env));

			const documentMatch = path.match(/^\/document\/([^/]+)$/);
			if (documentMatch && request.method === "GET") {
				const format = (url.searchParams.get("format") ?? "json") as ExportFormat;
				const template = (url.searchParams.get("template") ?? "modern") as PdfTemplate;
				const orientation = (url.searchParams.get("orientation") ?? "auto") as "auto" | "portrait" | "landscape";
				return withCors(await getDocumentByTestId(decodeURIComponent(documentMatch[1]), format, template, env, orientation));
			}

			// Bank of Apna Nagar - dummy bank simulator, backed by D1 (see src/bank/).
			if (path === "/bank/branches" && request.method === "GET") return withCors(await handleListBranches(env));
			if (path === "/bank/leadership" && request.method === "GET") return withCors(await handleListLeadership(env));
			if (path === "/bank/leaderboard" && request.method === "GET") return withCors(await handleLeaderboard(env));
			if (path === "/bank/account" && request.method === "POST") return withCors(await handleCreateAccount(request, env));

			const acctMatch = path.match(/^\/bank\/account\/([^/]+)$/);
			if (acctMatch && request.method === "GET") return withCors(await handleGetAccount(decodeURIComponent(acctMatch[1]), env));

			const txnMatch = path.match(/^\/bank\/account\/([^/]+)\/transactions$/);
			if (txnMatch && request.method === "GET") return withCors(await handleListTransactions(decodeURIComponent(txnMatch[1]), env));

			const creditMatch = path.match(/^\/bank\/account\/([^/]+)\/credit$/);
			if (creditMatch && request.method === "POST") return withCors(await handleCredit(decodeURIComponent(creditMatch[1]), request, env));

			const debitMatch = path.match(/^\/bank\/account\/([^/]+)\/debit$/);
			if (debitMatch && request.method === "POST") return withCors(await handleDebit(decodeURIComponent(debitMatch[1]), request, env));

			const subscribeMatch = path.match(/^\/bank\/account\/([^/]+)\/subscribe$/);
			if (subscribeMatch && request.method === "POST") return withCors(await handleSubscribe(decodeURIComponent(subscribeMatch[1]), request, env));

			const tickMatch = path.match(/^\/bank\/account\/([^/]+)\/tick$/);
			if (tickMatch && request.method === "POST") return withCors(await handleTick(decodeURIComponent(tickMatch[1]), request, env));

			return withCors(new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } }));
		} catch (err) {
			console.error("Unhandled error:", err);
			return withCors(new Response(JSON.stringify({ error: "internal server error" }), { status: 500, headers: { "content-type": "application/json" } }));
		}
	},

	async scheduled(_event: ScheduledController, env: Env): Promise<void> {
		const { charged, skipped } = await runHourlyCharges(env);
		console.log(`Bank of Apna Nagar hourly charges: ${charged} charged, ${skipped} skipped`);
	},
} satisfies ExportedHandler<Env>;
