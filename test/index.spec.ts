/**
 * Self-check suite: the smallest set of assertions that would fail if the
 * core pipeline (generate -> mutate -> validate -> render -> scenario) broke.
 */
import { describe, it, expect } from "vitest";
import { generateDocument, generatePoGrnInvoiceChain } from "../src/generators/index";
import { applyMutations } from "../src/mutations";
import { validateDocument, validateThreeWayMatch } from "../src/validators";
import { render } from "../src/renderers/index";
import { runScenario, SCENARIOS } from "../src/scenarios";
import { Rng, amountInWordsIN, amountInWordsUS } from "../src/utils";
import { InvoiceSchema } from "../src/types";
import type { Invoice, PurchaseOrder, Grn } from "../src/types";

const opts = (seed: number) => ({ documentType: "gst_invoice" as const, testId: `T-${seed}`, scenarioId: "clean", seed });

/** Strips wall-clock fields (generated_at) before deep-equality checks, since only the seeded RNG output is meant to be reproducible. */
function stableJson(value: unknown): string {
	return JSON.stringify(value, (key, v) => (key === "generated_at" || key === "sent_at" ? undefined : v));
}

describe("generators", () => {
	it("produces a schema-valid, internally consistent IN invoice", () => {
		const doc = generateDocument("IN", "gst_invoice", opts(1));
		expect(() => InvoiceSchema.parse(doc)).not.toThrow();
		const result = validateDocument(doc);
		expect(result.errors).toEqual([]);
	});

	it("produces a schema-valid, internally consistent US invoice", () => {
		const doc = generateDocument("US", "commercial_invoice", opts(2));
		expect(() => InvoiceSchema.parse(doc)).not.toThrow();
		expect(validateDocument(doc).errors).toEqual([]);
	});

	it("is deterministic for a given seed", () => {
		const a = generateDocument("IN", "gst_invoice", opts(99));
		const b = generateDocument("IN", "gst_invoice", opts(99));
		expect(stableJson(a)).toEqual(stableJson(b));
	});
});

describe("mutations", () => {
	it("incorrect_tax mutation makes the totals inconsistent and is caught by the validator", () => {
		const doc = generateDocument("IN", "gst_invoice", opts(3)) as Invoice;
		expect(validateDocument(doc).errors).toEqual([]);
		const rng = new Rng(3);
		const exceptions = applyMutations(doc, ["incorrect_tax"], rng);
		expect(exceptions).toContain("TAX_CALCULATION_MISMATCH");
		const result = validateDocument(doc);
		expect(result.valid).toBe(false);
		expect(result.expected_exceptions).toContain("TAX_CALCULATION_MISMATCH");
	});
});

describe("three-way match", () => {
	it("flags a short-received PO/GRN/Invoice chain the way the spec's example does (PO=100, GRN=95, Invoice=100)", () => {
		const chain = generatePoGrnInvoiceChain("IN", opts(777), 0.95);
		const result = validateThreeWayMatch(chain.po as PurchaseOrder, chain.grn as Grn, chain.invoice as Invoice);
		expect(result.invoice_total_quantity).toEqual(result.po_total_quantity);
		expect(result.grn_total_received).toBeLessThan(result.po_total_quantity);
		expect(result.expected_exceptions).toContain("RECEIPT_QUANTITY_MISMATCH");
	});

	it("passes a fully matched chain with no discrepancy", () => {
		const chain = generatePoGrnInvoiceChain("IN", opts(5), 1);
		const result = validateThreeWayMatch(chain.po as PurchaseOrder, chain.grn as Grn, chain.invoice as Invoice);
		expect(result.valid).toBe(true);
		expect(result.expected_exceptions).toEqual([]);
	});
});

describe("scenario engine", () => {
	it("runs every registered scenario for both jurisdictions without throwing", () => {
		for (const s of SCENARIOS) {
			for (const jurisdiction of ["IN", "US"] as const) {
				expect(() => runScenario(s.scenario_id, jurisdiction, 42)).not.toThrow();
			}
		}
	});

	it("clean_invoice has no expected exceptions; duplicate_invoice does", () => {
		expect(runScenario("clean_invoice", "IN", 1).expected_exceptions).toEqual([]);
		expect(runScenario("duplicate_invoice", "IN", 1).expected_exceptions).toContain("DUPLICATE_INVOICE");
	});

	it("is deterministic for a given seed", () => {
		const a = runScenario("invoice_grn_mismatch", "IN", 321);
		const b = runScenario("invoice_grn_mismatch", "IN", 321);
		expect(stableJson(a)).toEqual(stableJson(b));
	});
});

describe("renderers", () => {
	it("renders every export format without throwing and always embeds the synthetic marker", async () => {
		const doc = generateDocument("IN", "gst_invoice", opts(9));
		for (const format of ["pdf", "png", "csv", "xlsx", "json", "txt"] as const) {
			const artifact = await render(doc, format);
			expect(artifact.bytes.length).toBeGreaterThan(0);
		}
		const json = await render(doc, "json");
		const text = new TextDecoder().decode(json.bytes);
		expect(text).toContain('"synthetic": true');
	});
});

describe("amount-in-words", () => {
	it("renders Indian lakh/crore grouping", () => {
		expect(amountInWordsIN(1234567)).toMatch(/Lakh/);
	});
	it("renders US million/thousand grouping", () => {
		expect(amountInWordsUS(1234567)).toMatch(/Million/);
	});
});
