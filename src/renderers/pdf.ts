/**
 * Generic PDF renderer built on pdf-lib. One layout engine, parameterized by
 * template style, covers every document type instead of one bespoke
 * template per doc type x style — see code-prompt.md's template catalog.
 * The DUMMY/SYNTHETIC marker is always drawn and can never be disabled.
 */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from "pdf-lib";
import type { AnyDocument } from "../types";
import { flattenDocument } from "./tabular";

export type PdfTemplate = "modern" | "traditional" | "erp_style" | "spreadsheet_style" | "scanned_style";
export type PdfOrientation = "auto" | "portrait" | "landscape";

const A4_PORTRAIT = { width: 595, height: 842 };
const A4_LANDSCAPE = { width: 842, height: 595 };
const MARGIN = 40;
const TABLE_FONT_SIZE = 7;

// Columns matching these keywords get more horizontal room (free text);
// everything else (quantities, rates, amounts, codes) stays narrow.
const WIDE_COLUMN_HINTS = ["description", "name", "memo", "reason", "address", "notes"];

function columnWeight(header: string): number {
	const h = header.toLowerCase();
	if (WIDE_COLUMN_HINTS.some((hint) => h.includes(hint))) return 3;
	if (h.includes("id") || h.includes("number") || h.includes("code") || h.includes("date")) return 1.5;
	return 1;
}

function computeColumnWidths(headers: string[], availableWidth: number): number[] {
	const weights = headers.map(columnWeight);
	const totalWeight = weights.reduce((s, w) => s + w, 0);
	const minWidth = 32;
	const raw = weights.map((w) => (w / totalWeight) * availableWidth);
	// Enforce a minimum so narrow numeric columns don't collapse to nothing,
	// redistributing the shortfall proportionally from the wider columns.
	const deficit = raw.reduce((s, w, i) => s + Math.max(0, minWidth - w), 0);
	const flexibleTotal = raw.reduce((s, w) => s + (w > minWidth ? w : 0), 0);
	return raw.map((w) => (w < minWidth ? minWidth : w - (deficit * w) / (flexibleTotal || 1)));
}

/** Trims text to whatever actually fits the column (measured in points), not a fixed character count. */
function truncateToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
	if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		const candidate = text.slice(0, mid) + "…";
		if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return lo <= 0 ? "" : text.slice(0, lo) + "…";
}

function docTitle(doc: AnyDocument): string {
	return doc.document_type
		.split("_")
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(" ");
}

export async function renderPdf(
	doc: AnyDocument,
	template: PdfTemplate = "modern",
	renderFlags: string[] = [],
	orientation: PdfOrientation = "auto",
): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	pdfDoc.setTitle(`SYNTHETIC ${docTitle(doc)} - ${doc.metadata.test_id}`);
	pdfDoc.setSubject("Synthetic test document - not a real financial record");
	pdfDoc.setKeywords(["synthetic", "test", doc.metadata.scenario_id, doc.metadata.test_id]);

	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	const isScanned = template === "scanned_style" || renderFlags.includes("blurry_scan") || renderFlags.includes("low_quality_image");
	const rotated = renderFlags.includes("rotated_page");
	const missingPage = renderFlags.includes("missing_page");

	const { headers, rows } = flattenDocument(doc);
	// "auto" gives wide tables (many line-item columns) a landscape page so
	// columns have room to breathe; forcing "portrait" deliberately keeps
	// them cramped, which is the point when testing how an agent copes with
	// a narrow real-world layout instead of an artificially roomy one.
	const PAGE =
		orientation === "portrait" ? A4_PORTRAIT : orientation === "landscape" ? A4_LANDSCAPE : headers.length > 7 ? A4_LANDSCAPE : A4_PORTRAIT;
	const isMultiPage = renderFlags.includes("multi_page_invoice") || rows.length > 24;

	const accent = template === "erp_style" ? rgb(0.12, 0.29, 0.49) : template === "traditional" ? rgb(0.35, 0.1, 0.1) : rgb(0.95, 0.51, 0.12);

	let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
	let y = PAGE.height - 40;

	drawSyntheticMarker(page, fontBold, PAGE);

	y = drawHeader(page, font, fontBold, doc, template, accent, y, PAGE);
	y -= 10;
	y = drawParties(page, font, fontBold, doc, y);
	y -= 10;

	const rowsPerPage = 22;
	let rowIdx = 0;
	let pageNum = 1;
	if (!missingPage || pageNum !== 2) {
		y = drawTable(page, font, fontBold, headers, rows.slice(0, rowsPerPage), y, accent, PAGE);
	}
	rowIdx += rowsPerPage;

	while (rowIdx < rows.length && isMultiPage) {
		pageNum++;
		page = pdfDoc.addPage([PAGE.width, PAGE.height]);
		drawSyntheticMarker(page, fontBold, PAGE);
		y = PAGE.height - 60;
		page.drawText(`${docTitle(doc)} (continued) - page ${pageNum}`, { x: MARGIN, y, size: 10, font: fontBold });
		y -= 20;
		if (missingPage && pageNum === 2) {
			page.drawText("[ PAGE INTENTIONALLY OMITTED IN THIS TEST FIXTURE ]", { x: MARGIN, y, size: 10, font, color: rgb(0.6, 0, 0) });
		} else {
			y = drawTable(page, font, fontBold, headers, rows.slice(rowIdx, rowIdx + rowsPerPage), y, accent, PAGE);
		}
		rowIdx += rowsPerPage;
	}

	drawFooter(page, font, doc, PAGE);

	if (renderFlags.includes("handwritten_note")) {
		page.drawText("*checked - ok, release for payment*", {
			x: PAGE.width - 260,
			y: 120,
			size: 12,
			font,
			color: rgb(0.1, 0.1, 0.6),
			rotate: degrees(-6),
		});
	}
	if (renderFlags.includes("cropped_field")) {
		page.drawRectangle({ x: MARGIN, y: PAGE.height - 140, width: 200, height: 16, color: rgb(1, 1, 1) });
	}
	if (isScanned) {
		page.drawText("SCANNED COPY", {
			x: PAGE.width / 2 - 150,
			y: PAGE.height / 2,
			size: 60,
			font: fontBold,
			color: rgb(0.85, 0.85, 0.85),
			rotate: degrees(35),
			opacity: 0.5,
		});
	}
	if (rotated) {
		// Simulated by adding a visible rotated-scan artifact rather than actually
		// rotating page content (pdf-lib page rotation would make text unreadable
		// for downstream OCR testing, which defeats the point of the fixture).
		page.drawText("[ SCAN ROTATED ~3° - TEST FIXTURE ]", { x: MARGIN, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
	}

	return pdfDoc.save();
}

function drawSyntheticMarker(page: PDFPage, fontBold: PDFFont, PAGE: { width: number; height: number }) {
	const text = "DUMMY / SYNTHETIC TEST DOCUMENT";
	const size = 8;
	const width = fontBold.widthOfTextAtSize(text, size);
	page.drawRectangle({ x: PAGE.width - width - 50, y: PAGE.height - 28, width: width + 10, height: 16, color: rgb(1, 0.95, 0.85) });
	page.drawText(text, { x: PAGE.width - width - 45, y: PAGE.height - 24, size, font: fontBold, color: rgb(0.7, 0.2, 0) });
}

function drawHeader(
	page: PDFPage,
	font: PDFFont,
	fontBold: PDFFont,
	doc: AnyDocument,
	template: PdfTemplate,
	accent: ReturnType<typeof rgb>,
	y: number,
	PAGE: { width: number; height: number },
): number {
	page.drawRectangle({ x: 0, y: y - 6, width: PAGE.width, height: 3, color: accent });
	page.drawText(docTitle(doc).toUpperCase(), { x: MARGIN, y: y - 30, size: 20, font: fontBold, color: accent });
	page.drawText(`Template: ${template}  |  Jurisdiction: ${doc.jurisdiction}`, { x: MARGIN, y: y - 46, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
	if ("invoice" in doc) {
		page.drawText(`No: ${(doc as any).invoice.invoice_number}   Date: ${(doc as any).invoice.invoice_date}`, { x: MARGIN, y: y - 62, size: 10, font });
	}
	return y - 80;
}

function drawParties(page: PDFPage, font: PDFFont, fontBold: PDFFont, doc: AnyDocument, y: number): number {
	const supplier = (doc as any).supplier;
	const customer = (doc as any).customer ?? (doc as any).buyer;
	if (!supplier) return y;
	page.drawText("From:", { x: MARGIN, y, size: 9, font: fontBold });
	page.drawText(supplier.legal_name ?? "", { x: MARGIN, y: y - 12, size: 9, font });
	page.drawText(supplier.address ?? "", { x: MARGIN, y: y - 24, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
	page.drawText(`${supplier.city ?? ""}, ${supplier.state ?? ""}`, { x: MARGIN, y: y - 36, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
	if (supplier.gstin) page.drawText(`GSTIN: ${supplier.gstin}`, { x: MARGIN, y: y - 48, size: 8, font });
	if (supplier.ein) page.drawText(`EIN: ${supplier.ein}`, { x: MARGIN, y: y - 48, size: 8, font });

	if (customer) {
		page.drawText("To:", { x: 320, y, size: 9, font: fontBold });
		page.drawText(customer.legal_name ?? "", { x: 320, y: y - 12, size: 9, font });
		page.drawText(customer.address ?? "", { x: 320, y: y - 24, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
		page.drawText(`${customer.city ?? ""}, ${customer.state ?? ""}`, { x: 320, y: y - 36, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
	}
	return y - 60;
}

function drawTable(
	page: PDFPage,
	font: PDFFont,
	fontBold: PDFFont,
	headers: string[],
	rows: (string | number)[][],
	y: number,
	accent: ReturnType<typeof rgb>,
	PAGE: { width: number; height: number },
): number {
	const availableWidth = PAGE.width - MARGIN * 2;
	const colWidths = computeColumnWidths(headers, availableWidth);
	const colX: number[] = [];
	let x = MARGIN;
	for (const w of colWidths) {
		colX.push(x);
		x += w;
	}
	const cellPadding = 4;

	page.drawRectangle({ x: MARGIN, y: y - 16, width: availableWidth, height: 16, color: accent, opacity: 0.15 });
	headers.forEach((h, i) => {
		const text = truncateToWidth(fontBold, h, TABLE_FONT_SIZE, colWidths[i] - cellPadding);
		page.drawText(text, { x: colX[i] + cellPadding / 2, y: y - 12, size: TABLE_FONT_SIZE, font: fontBold });
	});

	let rowY = y - 30;
	for (const row of rows) {
		if (rowY < 60) break;
		row.forEach((cell, i) => {
			const text = truncateToWidth(font, String(cell), TABLE_FONT_SIZE, colWidths[i] - cellPadding);
			page.drawText(text, { x: colX[i] + cellPadding / 2, y: rowY, size: TABLE_FONT_SIZE, font });
		});
		rowY -= 14;
	}
	// Faint column separators so adjacent truncated cells never read as one run-on value.
	for (let i = 1; i < colX.length; i++) {
		page.drawLine({ start: { x: colX[i], y: y - 16 }, end: { x: colX[i], y: rowY + 10 }, thickness: 0.25, color: rgb(0.85, 0.85, 0.85) });
	}
	return rowY;
}

function drawFooter(page: PDFPage, font: PDFFont, doc: AnyDocument, PAGE: { width: number; height: number }) {
	page.drawText(
		`Synthetic test document. test_id=${doc.metadata.test_id} scenario_id=${doc.metadata.scenario_id} generated_at=${doc.metadata.generated_at}`,
		{ x: MARGIN, y: 20, size: 6, font, color: rgb(0.5, 0.5, 0.5) },
	);
	page.drawText("NOT A REAL FINANCIAL RECORD", { x: MARGIN, y: 30, size: 8, font, color: rgb(0.7, 0.2, 0) });
}
