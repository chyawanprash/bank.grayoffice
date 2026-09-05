/**
 * Mutation library: deliberate corruptions applied to otherwise-consistent
 * synthetic data so the finance agent under test has something to catch.
 *
 * Data-level mutations (identity/invoice/matching/bank) edit the generated
 * document in place and record the exception code(s) they imply.
 * Render-level and communication-level mutation ids don't touch the document
 * at all — the PDF renderer and email/Slack generators check for their
 * presence in the scenario's mutation list directly.
 */
import type { AnyDocument, Invoice, BankStatement, PurchaseOrder, Grn } from "./types";
import { Rng, round2, synthEin, synthGstin, docNumber } from "./utils";

export const RENDER_MUTATIONS = new Set([
	"rotated_page",
	"blurry_scan",
	"low_quality_image",
	"multi_page_invoice",
	"missing_page",
	"cropped_field",
	"handwritten_note",
	"inconsistent_filename",
]);

export const COMMUNICATION_MUTATIONS = new Set([
	"missing_attachment",
	"multiple_attachments",
	"wrong_attachment",
	"forwarded_email",
	"reply_chain_email",
	"ambiguous_human_request",
	"duplicate_invoice_email",
	"corrected_invoice_email",
]);

interface MutationDef {
	exceptions: string[];
	apply: (doc: AnyDocument, rng: Rng) => void;
}

function isInvoiceLike(doc: AnyDocument): doc is Invoice {
	return "invoice" in doc && "line_items" in doc;
}

export const MUTATIONS: Record<string, MutationDef> = {
	// --- Identity -----------------------------------------------------------
	wrong_gstin: {
		exceptions: ["GSTIN_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc) && doc.supplier.gstin) {
				doc.supplier.gstin = synthGstin(rng, "99");
			}
		},
	},
	wrong_pan: {
		exceptions: ["PAN_MISMATCH"],
		apply: (doc) => {
			if (isInvoiceLike(doc) && doc.supplier.pan) doc.supplier.pan = "AAAAA0000A";
		},
	},
	wrong_ein: {
		exceptions: ["EIN_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc) && doc.supplier.ein) doc.supplier.ein = synthEin(rng);
		},
	},
	wrong_vendor_name: {
		exceptions: ["VENDOR_NAME_MISMATCH"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.supplier.legal_name = `${doc.supplier.legal_name} (Unverified Entity)`;
		},
	},
	wrong_address: {
		exceptions: ["ADDRESS_MISMATCH"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.supplier.address = "Unknown / Unverified Address";
		},
	},
	wrong_bank_account: {
		exceptions: ["BANK_DETAILS_CHANGED", "REQUIRES_HUMAN_VERIFICATION"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) {
				doc.payment.account_identifier = `XXXX${rng.int(1000, 9999)}`;
				doc.payment.bank_name = `${doc.payment.bank_name} (New)`;
			}
		},
	},

	// --- Invoice --------------------------------------------------------------
	duplicate_invoice: {
		exceptions: ["DUPLICATE_INVOICE"],
		apply: () => {
			/* handled at scenario level by re-emitting the same invoice_number */
		},
	},
	missing_invoice_number: {
		exceptions: ["MISSING_INVOICE_NUMBER"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.invoice.invoice_number = "";
		},
	},
	incorrect_invoice_number: {
		exceptions: ["INVALID_INVOICE_NUMBER_FORMAT"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.invoice.invoice_number = "???-INVALID???";
		},
	},
	future_invoice_date: {
		exceptions: ["FUTURE_INVOICE_DATE"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) {
				const future = new Date();
				future.setUTCFullYear(future.getUTCFullYear() + 1);
				doc.invoice.invoice_date = future.toISOString().slice(0, 10);
			}
		},
	},
	incorrect_due_date: {
		exceptions: ["DUE_DATE_BEFORE_INVOICE_DATE"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) {
				const invDate = new Date(doc.invoice.invoice_date);
				invDate.setUTCDate(invDate.getUTCDate() - 5);
				doc.invoice.due_date = invDate.toISOString().slice(0, 10);
			}
		},
	},
	missing_po: {
		exceptions: ["MISSING_PURCHASE_ORDER"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.invoice.purchase_order_number = undefined;
		},
	},
	incorrect_po: {
		exceptions: ["PO_NOT_FOUND"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) doc.invoice.purchase_order_number = docNumber("PO", rng);
		},
	},
	incorrect_tax: {
		exceptions: ["TAX_CALCULATION_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) {
				doc.totals.tax = round2(doc.totals.tax * rng.float(1.1, 1.4));
				doc.totals.grand_total = round2(doc.totals.taxable_amount + doc.totals.tax + doc.totals.shipping);
			}
		},
	},
	incorrect_subtotal: {
		exceptions: ["SUBTOTAL_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) doc.totals.subtotal = round2(doc.totals.subtotal * rng.float(0.7, 0.95));
		},
	},
	incorrect_grand_total: {
		exceptions: ["INVOICE_TOTAL_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) doc.totals.grand_total = round2(doc.totals.grand_total + rng.float(50, 500));
		},
	},
	negative_line_item: {
		exceptions: ["NEGATIVE_LINE_ITEM"],
		apply: (doc) => {
			if (isInvoiceLike(doc) && doc.line_items.length) {
				doc.line_items[0].line_total = -Math.abs(doc.line_items[0].line_total);
			}
		},
	},
	duplicate_line_item: {
		exceptions: ["DUPLICATE_LINE_ITEM"],
		apply: (doc) => {
			if (isInvoiceLike(doc) && doc.line_items.length) {
				doc.line_items.push({ ...doc.line_items[0], line_number: doc.line_items.length + 1 });
			}
		},
	},
	wrong_currency: {
		exceptions: ["CURRENCY_MISMATCH"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.invoice.currency = doc.invoice.currency === "USD" ? "EUR" : "USD";
		},
	},

	// --- Matching -------------------------------------------------------------
	po_quantity_mismatch: {
		exceptions: ["PO_QUANTITY_MISMATCH"],
		apply: (doc, rng) => {
			const po = doc as PurchaseOrder;
			if ("items" in po) po.items.forEach((i) => (i.quantity = Math.round(i.quantity * rng.float(0.7, 0.9))));
		},
	},
	invoice_quantity_mismatch: {
		exceptions: ["INVOICE_QUANTITY_EXCEEDS_PO"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) doc.line_items.forEach((i) => (i.quantity = Math.round(i.quantity * rng.float(1.1, 1.3))));
		},
	},
	grn_mismatch: {
		exceptions: ["RECEIPT_QUANTITY_MISMATCH"],
		apply: (doc, rng) => {
			const grn = doc as Grn;
			if ("items" in grn && "received_quantity" in (grn.items[0] ?? {})) {
				grn.items.forEach((i) => (i.received_quantity = Math.round(i.ordered_quantity * rng.float(0.7, 0.95))));
			}
		},
	},
	price_mismatch: {
		exceptions: ["UNIT_PRICE_MISMATCH"],
		apply: (doc, rng) => {
			if (isInvoiceLike(doc)) doc.line_items.forEach((i) => (i.unit_price = round2(i.unit_price * rng.float(1.15, 1.4))));
		},
	},
	vendor_mismatch: {
		exceptions: ["VENDOR_NOT_FOUND"],
		apply: (doc) => {
			if (isInvoiceLike(doc)) doc.supplier.legal_name = "Unregistered Vendor Pvt Ltd";
		},
	},

	// --- Bank -------------------------------------------------------------
	unidentified_transaction: {
		exceptions: ["UNIDENTIFIED_TRANSACTION"],
		apply: (doc, rng) => {
			const stmt = doc as BankStatement;
			if ("transactions" in stmt) {
				stmt.transactions.push({
					date: stmt.period_end,
					transaction_id: docNumber("TXN", rng, 8),
					type: "Unknown",
					description: "UNIDENTIFIED CREDIT - NO REFERENCE",
					debit: null,
					credit: round2(rng.float(1000, 20000)),
					balance: stmt.closing_balance,
				});
			}
		},
	},
	duplicate_bank_transaction: {
		exceptions: ["DUPLICATE_TRANSACTION"],
		apply: (doc) => {
			const stmt = doc as BankStatement;
			if ("transactions" in stmt && stmt.transactions.length) {
				stmt.transactions.push({ ...stmt.transactions[0] });
			}
		},
	},
	missing_bank_transaction: {
		exceptions: ["MISSING_TRANSACTION"],
		apply: (doc) => {
			const stmt = doc as BankStatement;
			if ("transactions" in stmt && stmt.transactions.length > 1) stmt.transactions.splice(0, 1);
		},
	},
	incorrect_debit: {
		exceptions: ["INCORRECT_DEBIT_AMOUNT"],
		apply: (doc, rng) => {
			const stmt = doc as BankStatement;
			const t = (stmt.transactions ?? []).find((x) => x.debit);
			if (t) t.debit = round2((t.debit ?? 0) * rng.float(1.2, 1.6));
		},
	},
	incorrect_credit: {
		exceptions: ["INCORRECT_CREDIT_AMOUNT"],
		apply: (doc, rng) => {
			const stmt = doc as BankStatement;
			const t = (stmt.transactions ?? []).find((x) => x.credit);
			if (t) t.credit = round2((t.credit ?? 0) * rng.float(1.2, 1.6));
		},
	},
	unexpected_bank_charge: {
		exceptions: ["UNEXPECTED_BANK_CHARGE"],
		apply: (doc, rng) => {
			const stmt = doc as BankStatement;
			if ("transactions" in stmt) {
				stmt.transactions.push({
					date: stmt.period_end,
					transaction_id: docNumber("TXN", rng, 8),
					type: "Bank Charges",
					description: "Unexplained service charge",
					debit: round2(rng.float(100, 1500)),
					credit: null,
					balance: stmt.closing_balance,
				});
			}
		},
	},
	bank_reconciliation_difference: {
		exceptions: ["BANK_RECONCILIATION_DIFFERENCE"],
		apply: (doc, rng) => {
			const stmt = doc as BankStatement;
			if ("closing_balance" in stmt) stmt.closing_balance = round2(stmt.closing_balance + rng.float(-2000, 2000));
		},
	},
};

/** Applies each requested mutation id in order and returns the union of exception codes triggered. */
export function applyMutations(doc: AnyDocument, mutationIds: string[], rng: Rng): string[] {
	const exceptions: string[] = [];
	for (const id of mutationIds) {
		const def = MUTATIONS[id];
		if (!def) continue; // render/communication mutations are handled elsewhere
		def.apply(doc, rng);
		exceptions.push(...def.exceptions);
	}
	return exceptions;
}
