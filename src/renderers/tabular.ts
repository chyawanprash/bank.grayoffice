/**
 * Generic tabular export (CSV/XLSX) + JSON/TXT. `flattenDocument` finds
 * whichever array field represents a document's line items - line_items,
 * items, transactions, lines, rows - so one renderer covers every doc type.
 */
import * as XLSX from "xlsx";
import type { AnyDocument } from "../types";

const LINE_ARRAY_KEYS = ["line_items", "items", "transactions", "lines", "rows"];

export function flattenDocument(doc: AnyDocument): { headers: string[]; rows: (string | number)[][] } {
	const anyDoc = doc as any;
	const key = LINE_ARRAY_KEYS.find((k) => Array.isArray(anyDoc[k]) && anyDoc[k].length > 0);
	if (!key) return { headers: ["field", "value"], rows: Object.entries(anyDoc).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]) };
	const items: Record<string, unknown>[] = anyDoc[key];
	const headers = Array.from(new Set(items.flatMap((i) => Object.keys(i))));
	const rows = items.map((item) => headers.map((h) => formatCell((item as any)[h])));
	return { headers, rows };
}

function formatCell(v: unknown): string | number {
	if (v === null || v === undefined) return "";
	if (typeof v === "number" || typeof v === "string") return v;
	return JSON.stringify(v);
}

export function toCsv(doc: AnyDocument): string {
	const { headers, rows } = flattenDocument(doc);
	const escape = (v: string | number) => {
		const s = String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

export function toXlsx(doc: AnyDocument): Uint8Array {
	const { headers, rows } = flattenDocument(doc);
	const sheetData = [headers, ...rows];
	const ws = XLSX.utils.aoa_to_sheet(sheetData);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Data");

	const metaWs = XLSX.utils.aoa_to_sheet([
		["SYNTHETIC / DUMMY TEST DOCUMENT - NOT A REAL FINANCIAL RECORD"],
		["document_type", doc.document_type],
		["jurisdiction", doc.jurisdiction],
		["test_id", doc.metadata.test_id],
		["scenario_id", doc.metadata.scenario_id],
		["generated_at", doc.metadata.generated_at],
	]);
	XLSX.utils.book_append_sheet(wb, metaWs, "Metadata");

	// SheetJS picks its return shape (ArrayBuffer vs Uint8Array vs number[])
	// based on runtime feature detection, so normalize it ourselves.
	const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
	return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

export function toTxt(doc: AnyDocument): string {
	const anyDoc = doc as any;
	const lines: string[] = ["*** SYNTHETIC / DUMMY TEST DOCUMENT - NOT A REAL FINANCIAL RECORD ***", ""];
	lines.push(`Document Type: ${doc.document_type}`, `Jurisdiction: ${doc.jurisdiction}`, `Test ID: ${doc.metadata.test_id}`, "");
	if (anyDoc.supplier) lines.push(`Supplier: ${anyDoc.supplier.legal_name}`);
	if (anyDoc.customer) lines.push(`Customer: ${anyDoc.customer.legal_name}`);
	if (anyDoc.invoice) lines.push(`Invoice #: ${anyDoc.invoice.invoice_number}`, `Date: ${anyDoc.invoice.invoice_date}`, `Due: ${anyDoc.invoice.due_date}`);
	if (anyDoc.totals) lines.push(`Grand Total: ${anyDoc.totals.grand_total}`, `Amount in words: ${anyDoc.totals.amount_in_words}`);
	lines.push("", toCsv(doc));
	return lines.join("\n");
}

export function toJson(doc: AnyDocument): string {
	return JSON.stringify(doc, null, 2);
}
