import type { AnyDocument } from "../types";
import { renderPdf, type PdfTemplate, type PdfOrientation } from "./pdf";
import { renderPng } from "./png";
import { toCsv, toXlsx, toJson, toTxt } from "./tabular";

export type ExportFormat = "pdf" | "png" | "csv" | "xlsx" | "json" | "txt";

export interface RenderedArtifact {
	bytes: Uint8Array;
	contentType: string;
	extension: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
	pdf: "application/pdf",
	png: "image/png",
	csv: "text/csv",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	json: "application/json",
	txt: "text/plain",
};

const encoder = new TextEncoder();

export async function render(
	doc: AnyDocument,
	format: ExportFormat,
	template: PdfTemplate = "modern",
	renderFlags: string[] = [],
	orientation: PdfOrientation = "auto",
): Promise<RenderedArtifact> {
	switch (format) {
		case "pdf":
			return { bytes: await renderPdf(doc, template, renderFlags, orientation), contentType: CONTENT_TYPES.pdf, extension: "pdf" };
		case "png":
			return { bytes: renderPng(doc), contentType: CONTENT_TYPES.png, extension: "png" };
		case "csv":
			return { bytes: encoder.encode(toCsv(doc)), contentType: CONTENT_TYPES.csv, extension: "csv" };
		case "xlsx":
			return { bytes: toXlsx(doc), contentType: CONTENT_TYPES.xlsx, extension: "xlsx" };
		case "txt":
			return { bytes: encoder.encode(toTxt(doc)), contentType: CONTENT_TYPES.txt, extension: "txt" };
		case "json":
		default:
			return { bytes: encoder.encode(toJson(doc)), contentType: CONTENT_TYPES.json, extension: "json" };
	}
}
