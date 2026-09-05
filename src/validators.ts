/**
 * Validation engine: checks internal consistency of a generated document
 * (arithmetic, tax, totals, dates) and, for a linked PO/GRN/Invoice bundle,
 * the 3-way-match relationships. Scenarios may intentionally fail selected
 * checks via mutations — that's expected, not a bug in the generator.
 */
import type { AnyDocument, Invoice, ValidationResult, Grn, PurchaseOrder } from "./types";

const EPSILON = 0.02;

function isInvoiceLike(doc: AnyDocument): doc is Invoice {
	return "invoice" in doc && "line_items" in doc;
}

export function validateDocument(doc: AnyDocument): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const expected_exceptions: string[] = [];

	if (isInvoiceLike(doc)) {
		const computedTaxable = doc.line_items.reduce((s, i) => s + i.taxable_value, 0);
		if (Math.abs(computedTaxable - doc.totals.taxable_amount) > EPSILON) {
			errors.push("Sum of line item taxable values does not equal totals.taxable_amount");
			expected_exceptions.push("SUBTOTAL_MISMATCH");
		}
		const computedTax = doc.line_items.reduce(
			(s, i) => s + (i.cgst_amount ?? 0) + (i.sgst_amount ?? 0) + (i.igst_amount ?? 0) + (i.sales_tax_amount ?? 0),
			0,
		);
		if (Math.abs(computedTax - doc.totals.tax) > EPSILON) {
			errors.push("Sum of line item tax amounts does not equal totals.tax");
			expected_exceptions.push("TAX_CALCULATION_MISMATCH");
		}
		const expectedGrandTotal = doc.totals.taxable_amount + doc.totals.tax + doc.totals.shipping + doc.totals.round_off;
		if (Math.abs(expectedGrandTotal - doc.totals.grand_total) > EPSILON) {
			errors.push("totals.grand_total does not reconcile with taxable_amount + tax + shipping + round_off");
			expected_exceptions.push("INVOICE_TOTAL_MISMATCH");
		}
		if (!doc.invoice.invoice_number) {
			errors.push("Missing invoice_number");
			expected_exceptions.push("MISSING_INVOICE_NUMBER");
		}
		if (new Date(doc.invoice.due_date) < new Date(doc.invoice.invoice_date)) {
			errors.push("due_date is before invoice_date");
			expected_exceptions.push("DUE_DATE_BEFORE_INVOICE_DATE");
		}
		if (new Date(doc.invoice.invoice_date) > new Date()) {
			warnings.push("invoice_date is in the future");
			expected_exceptions.push("FUTURE_INVOICE_DATE");
		}
		if (doc.line_items.some((i) => i.line_total < 0)) {
			errors.push("A line item has a negative total");
			expected_exceptions.push("NEGATIVE_LINE_ITEM");
		}
	}

	if ("closing_balance" in doc && "transactions" in doc && "opening_balance" in doc) {
		const stmt = doc as any;
		const computedClosing = stmt.transactions.reduce(
			(bal: number, t: any) => bal + (t.credit ?? 0) - (t.debit ?? 0),
			stmt.opening_balance,
		);
		if (Math.abs(computedClosing - stmt.closing_balance) > EPSILON) {
			warnings.push("Bank statement closing_balance does not reconcile against transaction sum");
			expected_exceptions.push("BANK_RECONCILIATION_DIFFERENCE");
		}
	}

	return { valid: errors.length === 0, errors, warnings, expected_exceptions };
}

export interface ThreeWayMatchResult extends ValidationResult {
	po_total_quantity: number;
	grn_total_received: number;
	invoice_total_quantity: number;
}

/** PO -> GRN -> Invoice three-way match, the core reconciliation workflow. */
export function validateThreeWayMatch(po: PurchaseOrder, grn: Grn, invoice: Invoice): ThreeWayMatchResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const expected_exceptions: string[] = [];

	const poQty = po.items.reduce((s, i) => s + i.quantity, 0);
	const grnQty = grn.items.reduce((s, i) => s + i.received_quantity, 0);
	const invoiceQty = invoice.line_items.reduce((s, i) => s + i.quantity, 0);

	if (invoice.invoice.purchase_order_number !== po.po_number) {
		errors.push(`Invoice references PO ${invoice.invoice.purchase_order_number ?? "<none>"}, expected ${po.po_number}`);
		expected_exceptions.push(invoice.invoice.purchase_order_number ? "PO_NOT_FOUND" : "MISSING_PURCHASE_ORDER");
	}
	if (grn.po_number !== po.po_number) {
		errors.push(`GRN references PO ${grn.po_number}, expected ${po.po_number}`);
		expected_exceptions.push("PO_NOT_FOUND");
	}
	if (grnQty < poQty) {
		warnings.push(`Received quantity (${grnQty}) is less than ordered quantity (${poQty})`);
		expected_exceptions.push("RECEIPT_QUANTITY_MISMATCH");
	}
	if (invoiceQty > grnQty) {
		errors.push(`Invoiced quantity (${invoiceQty}) exceeds received quantity (${grnQty})`);
		expected_exceptions.push("INVOICE_QUANTITY_EXCEEDS_PO");
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		expected_exceptions,
		po_total_quantity: poQty,
		grn_total_received: grnQty,
		invoice_total_quantity: invoiceQty,
	};
}
