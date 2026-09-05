import type { AnyDocument, DocumentType, Jurisdiction } from "../types";
import { Rng, round2 } from "../utils";
import * as IN from "./in";
import * as US from "./us";
import { buildJournalEntry, buildReconciliationReport } from "./common";
import type { InvoiceGenOptions } from "./in";

export type { InvoiceGenOptions };

const IN_CREDIT_DEBIT = new Set<DocumentType>(["credit_note", "debit_note"]);
const US_CREDIT_DEBIT = new Set<DocumentType>(["credit_memo", "debit_memo"]);
const IN_GST_DATASETS = new Set<DocumentType>(["gst_reconciliation_report", "gstr1_report", "gstr2b_report", "tds_report"]);

/**
 * Single dispatch point: (jurisdiction, document_type) -> canonical document.
 * Keeps generators/* focused purely on building one document each; adding a
 * new document type only means adding one branch here and one builder.
 */
export function generateDocument(jurisdiction: Jurisdiction, documentType: DocumentType, opts: InvoiceGenOptions): AnyDocument {
	const rng = new Rng(opts.seed);

	if (jurisdiction === "IN") {
		if (IN_CREDIT_DEBIT.has(documentType)) return IN.buildCreditOrDebitNoteIN(rng, opts);
		if (IN_GST_DATASETS.has(documentType)) return IN.buildGstDataset(rng, opts);
		switch (documentType) {
			case "purchase_order":
				return IN.buildPurchaseOrderIN(rng, opts);
			case "grn":
				return IN.buildGrnIN(rng, opts);
			case "bank_statement":
				return IN.buildBankStatementIN(rng, opts);
			case "expense_receipt":
				return IN.buildReceiptIN(rng, opts);
			case "vendor_master":
				return IN.buildVendorMasterIN(rng, opts);
			case "journal_entry":
				return buildJournalEntry(rng, opts, "IN");
			case "reconciliation_report":
				return buildReconciliationReport(rng, opts, "IN", rng.pick(["bank", "ap", "gst"]));
			default:
				return IN.buildInvoiceIN(rng, opts);
		}
	}

	// US
	if (US_CREDIT_DEBIT.has(documentType)) return US.buildCreditOrDebitMemoUS(rng, opts);
	switch (documentType) {
		case "purchase_order":
			return US.buildPurchaseOrderUS(rng, opts);
		case "receiving_report":
			return US.buildReceivingReportUS(rng, opts);
		case "bank_statement":
			return US.buildBankStatementUS(rng, opts);
		case "credit_card_statement":
			return US.buildCreditCardStatementUS(rng, opts);
		case "expense_receipt":
			return US.buildReceiptUS(rng, opts);
		case "w9":
			return US.buildW9(rng, opts);
		case "1099_nec":
		case "1099_misc":
			return US.buildForm1099(rng, opts);
		case "journal_entry":
			return buildJournalEntry(rng, opts, "US");
		case "reconciliation_report":
			return buildReconciliationReport(rng, opts, "US", rng.pick(["bank", "ap"]));
		default:
			return US.buildInvoiceUS(rng, opts);
	}
}

/** Builds a linked PO -> GRN/Receiving Report -> Invoice chain for 3-way-match scenarios. */
export function generatePoGrnInvoiceChain(
	jurisdiction: Jurisdiction,
	opts: InvoiceGenOptions,
	receiptFactor = 1,
): { po: ReturnType<typeof IN.buildPurchaseOrderIN>; grn: ReturnType<typeof IN.buildGrnIN>; invoice: AnyDocument } {
	const rng = new Rng(opts.seed);
	if (jurisdiction === "IN") {
		const po = IN.buildPurchaseOrderIN(rng.fork("po"), opts);
		const grnRng = rng.fork("grn");
		const grn = IN.buildGrnIN(grnRng, opts, po.items);
		grn.po_number = po.po_number;
		if (receiptFactor !== 1) {
			grn.items = grn.items.map((item) => ({
				...item,
				received_quantity: Math.round(item.ordered_quantity * receiptFactor),
				rejected_quantity: item.ordered_quantity - Math.round(item.ordered_quantity * receiptFactor),
			}));
		}
		const invoiceRng = rng.fork("invoice");
		const invoice = IN.buildInvoiceIN(invoiceRng, { ...opts, documentType: "gst_invoice" });
		invoice.invoice.purchase_order_number = po.po_number;
		const taxMode: "igst" | "cgst_sgst" = po.supplier.state_code === po.buyer.state_code ? "cgst_sgst" : "igst";
		invoice.line_items = IN.lineItemsFromQuantitiesIN(invoiceRng, po.items, taxMode);
		const t = IN.totalsFromLineItemsIN(invoice.line_items);
		invoice.totals = {
			...invoice.totals,
			subtotal: t.subtotal,
			discount: t.discount,
			taxable_amount: t.taxable_amount,
			cgst: t.cgst,
			sgst: t.sgst,
			igst: t.igst,
			tax: t.tax,
			round_off: t.round_off,
			grand_total: t.grand_total,
		};
		invoice.supplier = po.supplier;
		invoice.customer = po.buyer;
		return { po, grn, invoice };
	}
	const po = US.buildPurchaseOrderUS(rng.fork("po"), opts);
	const grn = US.buildReceivingReportUS(rng.fork("grn"), opts, po.items);
	grn.po_number = po.po_number;
	if (receiptFactor !== 1) {
		grn.items = grn.items.map((item) => ({
			...item,
			received_quantity: Math.round(item.ordered_quantity * receiptFactor),
			rejected_quantity: item.ordered_quantity - Math.round(item.ordered_quantity * receiptFactor),
		}));
	}
	const invoice = US.buildInvoiceUS(rng.fork("invoice"), { ...opts, documentType: "commercial_invoice" });
	invoice.invoice.purchase_order_number = po.po_number;
	const taxRate = invoice.line_items[0]?.sales_tax_rate ?? 0;
	invoice.line_items = US.lineItemsFromQuantitiesUS(po.items, taxRate);
	const subtotal = round2(invoice.line_items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(invoice.line_items.reduce((s, i) => s + (i.sales_tax_amount ?? 0), 0));
	invoice.totals = { ...invoice.totals, subtotal, taxable_amount: subtotal, tax, grand_total: round2(subtotal + tax) };
	invoice.supplier = po.supplier;
	invoice.customer = po.buyer;
	return { po: po as any, grn: grn as any, invoice };
}
