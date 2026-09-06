/**
 * Canonical schemas for every synthetic finance artifact the generator can
 * produce. One shared shape per concept (party, line item, totals...) reused
 * across document types, per the "universal synthetic-data schema" design.
 */
import { z } from "zod";

export const Jurisdiction = z.enum(["IN", "US"]);
export type Jurisdiction = z.infer<typeof Jurisdiction>;

export const DocumentType = z.enum([
	// India
	"gst_invoice",
	"b2c_invoice",
	"interstate_invoice",
	"intrastate_invoice",
	"export_invoice",
	"sez_invoice",
	"reverse_charge_invoice",
	"bill_of_supply",
	"invoice_cum_bill_of_supply",
	"credit_note",
	"debit_note",
	"purchase_order",
	"grn",
	"bank_statement",
	"credit_card_statement",
	"expense_receipt",
	"vendor_master",
	"gst_reconciliation_report",
	"gstr1_report",
	"gstr2b_report",
	"tds_report",
	"journal_entry",
	"reconciliation_report",
	// US
	"commercial_invoice",
	"service_invoice",
	"recurring_invoice",
	"subscription_invoice",
	"purchase_invoice",
	"credit_memo",
	"debit_memo",
	"receiving_report",
	"w9",
	"1099_nec",
	"1099_misc",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const INVOICE_TYPES: DocumentType[] = [
	"gst_invoice",
	"b2c_invoice",
	"interstate_invoice",
	"intrastate_invoice",
	"export_invoice",
	"sez_invoice",
	"reverse_charge_invoice",
	"bill_of_supply",
	"invoice_cum_bill_of_supply",
	"commercial_invoice",
	"service_invoice",
	"recurring_invoice",
	"subscription_invoice",
	"purchase_invoice",
];

export const PartySchema = z.object({
	legal_name: z.string(),
	trade_name: z.string().optional(),
	address: z.string(),
	city: z.string(),
	state: z.string(),
	state_code: z.string().optional(),
	postal_code: z.string(),
	country: z.string(),
	tax_identifier: z.string().optional(), // GSTIN (IN) or EIN (US)
	pan: z.string().optional(),
	gstin: z.string().optional(),
	ein: z.string().optional(),
	email: z.string(),
	phone: z.string(),
});
export type Party = z.infer<typeof PartySchema>;

export const LineItemSchema = z.object({
	line_number: z.number(),
	sku: z.string().optional(),
	description: z.string(),
	hsn_or_sac: z.string().optional(),
	quantity: z.number(),
	unit: z.string(),
	unit_price: z.number(),
	discount: z.number(),
	taxable_value: z.number(),
	tax_rate: z.number(),
	cgst_rate: z.number().optional(),
	cgst_amount: z.number().optional(),
	sgst_rate: z.number().optional(),
	sgst_amount: z.number().optional(),
	igst_rate: z.number().optional(),
	igst_amount: z.number().optional(),
	cess_rate: z.number().optional(),
	cess_amount: z.number().optional(),
	sales_tax_rate: z.number().optional(),
	sales_tax_amount: z.number().optional(),
	line_total: z.number(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const TotalsSchema = z.object({
	subtotal: z.number(),
	discount: z.number(),
	taxable_amount: z.number(),
	cgst: z.number().optional(),
	sgst: z.number().optional(),
	igst: z.number().optional(),
	cess: z.number().optional(),
	tax: z.number(),
	shipping: z.number(),
	other_charges: z.number(),
	round_off: z.number(),
	grand_total: z.number(),
	amount_in_words: z.string(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const PaymentSchema = z.object({
	bank_name: z.string(),
	account_name: z.string(),
	account_identifier: z.string(),
	routing_identifier: z.string().optional(), // IFSC (IN) or routing number (US)
	upi_id: z.string().optional(),
	payment_method: z.string(),
	payment_reference: z.string(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const InvoiceHeaderSchema = z.object({
	invoice_number: z.string(),
	invoice_date: z.string(),
	due_date: z.string(),
	supply_date: z.string().optional(),
	currency: z.string(),
	payment_terms: z.string(),
	purchase_order_number: z.string().optional(),
	place_of_supply: z.string().optional(),
	reverse_charge: z.boolean().optional(),
	notes: z.string().optional(),
	terms_and_conditions: z.string().optional(),
});
export type InvoiceHeader = z.infer<typeof InvoiceHeaderSchema>;

export const EInvoiceSchema = z.object({
	irn: z.string(),
	ack_number: z.string(),
	ack_date: z.string(),
	signed_invoice_reference: z.string(),
	signed_qr_payload: z.string(),
	e_invoice_status: z.enum(["GENERATED", "CANCELLED", "INVALID"]),
});
export type EInvoiceInfo = z.infer<typeof EInvoiceSchema>;

/** Metadata every generated artifact carries. Never disable synthetic=true. */
export const MetadataSchema = z.object({
	synthetic: z.literal(true),
	test_id: z.string(),
	scenario_id: z.string(),
	generated_at: z.string(),
	seed: z.number(),
	expected_exceptions: z.array(z.string()),
});
export type Metadata = z.infer<typeof MetadataSchema>;

/** The canonical invoice document, reused for every IN/US invoice variant. */
export const InvoiceSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: DocumentType,
	document_status: z.string().default("issued"),
	template: z.string().optional(),
	supplier: PartySchema,
	customer: PartySchema,
	invoice: InvoiceHeaderSchema,
	line_items: z.array(LineItemSchema),
	totals: TotalsSchema,
	payment: PaymentSchema,
	e_invoice: EInvoiceSchema.optional(),
	metadata: MetadataSchema,
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const CreditDebitNoteSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: DocumentType,
	original_invoice_number: z.string(),
	original_invoice_date: z.string(),
	note_number: z.string(),
	note_date: z.string(),
	reason: z.string(),
	supplier: PartySchema,
	customer: PartySchema,
	line_items: z.array(
		LineItemSchema.extend({
			original_quantity: z.number().optional(),
			returned_quantity: z.number().optional(),
		}),
	),
	totals: TotalsSchema,
	metadata: MetadataSchema,
});
export type CreditDebitNote = z.infer<typeof CreditDebitNoteSchema>;

export const PurchaseOrderSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("purchase_order"),
	po_number: z.string(),
	po_date: z.string(),
	supplier: PartySchema,
	buyer: PartySchema,
	currency: z.string(),
	payment_terms: z.string(),
	delivery_date: z.string(),
	items: z.array(
		z.object({
			line_number: z.number(),
			sku: z.string().optional(),
			description: z.string(),
			quantity: z.number(),
			unit: z.string(),
			unit_price: z.number(),
			discount: z.number(),
			tax: z.number(),
			total: z.number(),
		}),
	),
	subtotal: z.number(),
	tax: z.number(),
	shipping: z.number(),
	grand_total: z.number(),
	department: z.string(),
	cost_center: z.string(),
	approval_status: z.string(),
	metadata: MetadataSchema,
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const GrnSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.union([z.literal("grn"), z.literal("receiving_report")]),
	grn_number: z.string(),
	grn_date: z.string(),
	po_number: z.string(),
	supplier: PartySchema,
	warehouse: z.string(),
	delivery_location: z.string(),
	received_by: z.string(),
	items: z.array(
		z.object({
			line_number: z.number(),
			sku: z.string().optional(),
			description: z.string(),
			ordered_quantity: z.number(),
			received_quantity: z.number(),
			rejected_quantity: z.number(),
			unit: z.string(),
			condition: z.string(),
			batch_number: z.string().optional(),
		}),
	),
	notes: z.string().optional(),
	metadata: MetadataSchema,
});
export type Grn = z.infer<typeof GrnSchema>;

export const BankTransactionSchema = z.object({
	date: z.string(),
	posted_date: z.string().optional(),
	value_date: z.string().optional(),
	transaction_id: z.string(),
	cheque_or_check_number: z.string().optional(),
	type: z.string(),
	description: z.string(),
	reference: z.string().optional(),
	merchant: z.string().optional(),
	category: z.string().optional(),
	debit: z.number().nullable(),
	credit: z.number().nullable(),
	balance: z.number(),
});
export type BankTransaction = z.infer<typeof BankTransactionSchema>;

export const BankStatementSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("bank_statement"),
	bank_name: z.string(),
	branch: z.string().optional(),
	routing_identifier: z.string(), // IFSC/MICR (IN) or routing number (US)
	account_holder: z.string(),
	account_number_masked: z.string(),
	account_type: z.string(),
	currency: z.string(),
	period_start: z.string(),
	period_end: z.string(),
	opening_balance: z.number(),
	closing_balance: z.number(),
	transactions: z.array(BankTransactionSchema),
	metadata: MetadataSchema,
});
export type BankStatement = z.infer<typeof BankStatementSchema>;

export const CreditCardStatementSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("credit_card_statement"),
	issuer: z.string(),
	account_name: z.string(),
	account_last4: z.string(),
	statement_period_start: z.string(),
	statement_period_end: z.string(),
	statement_date: z.string(),
	payment_due_date: z.string(),
	minimum_payment: z.number(),
	previous_balance: z.number(),
	payments: z.number(),
	credits: z.number(),
	purchases: z.number(),
	fees: z.number(),
	interest: z.number(),
	new_balance: z.number(),
	credit_limit: z.number(),
	transactions: z.array(
		z.object({
			transaction_date: z.string(),
			posting_date: z.string(),
			merchant: z.string(),
			description: z.string(),
			category: z.string(),
			amount: z.number(),
			currency: z.string(),
		}),
	),
	metadata: MetadataSchema,
});
export type CreditCardStatement = z.infer<typeof CreditCardStatementSchema>;

export const ReceiptSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("expense_receipt"),
	receipt_style: z.enum(["retail", "restaurant", "business_expense", "hotel"]),
	merchant_name: z.string(),
	merchant_address: z.string(),
	merchant_phone: z.string(),
	gstin: z.string().optional(),
	receipt_number: z.string(),
	date: z.string(),
	time: z.string(),
	cashier_or_server: z.string(),
	employee_name: z.string().optional(),
	department: z.string().optional(),
	business_purpose: z.string().optional(),
	expense_category: z.string().optional(),
	table_number: z.string().optional(),
	guest_count: z.number().optional(),
	items: z.array(
		z.object({
			description: z.string(),
			quantity: z.number(),
			unit_price: z.number(),
			discount: z.number(),
			tax: z.number(),
			total: z.number(),
		}),
	),
	subtotal: z.number(),
	tax: z.number(),
	service_charge: z.number().optional(),
	tip: z.number().optional(),
	total: z.number(),
	payment_method: z.string(),
	transaction_id: z.string(),
	metadata: MetadataSchema,
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const VendorMasterSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("vendor_master"),
	vendor_id: z.string(),
	legal_name: z.string(),
	trade_name: z.string().optional(),
	gstin: z.string().optional(),
	pan: z.string().optional(),
	tan: z.string().optional(),
	ein: z.string().optional(),
	registered_address: z.string(),
	billing_address: z.string(),
	contact_name: z.string(),
	email: z.string(),
	phone: z.string(),
	bank_name: z.string(),
	account_number_masked: z.string(),
	routing_identifier: z.string(),
	payment_terms: z.string(),
	tds_section: z.string().optional(),
	tds_rate: z.number().optional(),
	vendor_status: z.string(),
	metadata: MetadataSchema,
});
export type VendorMaster = z.infer<typeof VendorMasterSchema>;

export const JournalLineSchema = z.object({
	account_code: z.string(),
	account_name: z.string(),
	department: z.string().optional(),
	cost_center: z.string().optional(),
	debit: z.number(),
	credit: z.number(),
	memo: z.string().optional(),
});
export type JournalLine = z.infer<typeof JournalLineSchema>;

export const JournalEntrySchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("journal_entry"),
	journal_id: z.string(),
	journal_date: z.string(),
	description: z.string(),
	reference: z.string(),
	entity: z.string(),
	currency: z.string(),
	scenario_type: z.string(),
	lines: z.array(JournalLineSchema),
	metadata: MetadataSchema,
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const ReconciliationReportSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: z.literal("reconciliation_report"),
	report_type: z.enum(["bank", "ap", "gst"]),
	period_start: z.string(),
	period_end: z.string(),
	bank_balance: z.number().optional(),
	ledger_balance: z.number().optional(),
	outstanding_deposits: z.number().optional(),
	outstanding_payments: z.number().optional(),
	bank_charges: z.number().optional(),
	unidentified_transactions: z.number().optional(),
	adjustments: z.number().optional(),
	reconciled_balance: z.number().optional(),
	difference: z.number(),
	line_items: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
	metadata: MetadataSchema,
});
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;

export const GstDatasetSchema = z.object({
	jurisdiction: z.literal("IN"),
	document_type: z.union([
		z.literal("gst_reconciliation_report"),
		z.literal("gstr1_report"),
		z.literal("gstr2b_report"),
		z.literal("tds_report"),
	]),
	period: z.string(),
	entity_gstin: z.string(),
	rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
	metadata: MetadataSchema,
});
export type GstDataset = z.infer<typeof GstDatasetSchema>;

export const W9Schema = z.object({
	jurisdiction: z.literal("US"),
	document_type: z.literal("w9"),
	legal_name: z.string(),
	business_name: z.string().optional(),
	federal_tax_classification: z.string(),
	address: z.string(),
	city: z.string(),
	state: z.string(),
	zip: z.string(),
	tin_type: z.enum(["SSN", "EIN"]),
	tin: z.string(),
	exempt_payee_code: z.string().optional(),
	fatca_code: z.string().optional(),
	signature: z.string(),
	signature_date: z.string(),
	metadata: MetadataSchema,
});
export type W9 = z.infer<typeof W9Schema>;

export const Form1099Schema = z.object({
	jurisdiction: z.literal("US"),
	document_type: z.union([z.literal("1099_nec"), z.literal("1099_misc")]),
	tax_year: z.number(),
	payer_name: z.string(),
	payer_tin: z.string(),
	payer_address: z.string(),
	recipient_name: z.string(),
	recipient_tin: z.string(),
	recipient_address: z.string(),
	box1_amount: z.number(),
	federal_tax_withheld: z.number(),
	metadata: MetadataSchema,
});
export type Form1099 = z.infer<typeof Form1099Schema>;

/** Union of every document body this generator can produce. */
export type AnyDocument =
	| Invoice
	| CreditDebitNote
	| PurchaseOrder
	| Grn
	| BankStatement
	| CreditCardStatement
	| Receipt
	| VendorMaster
	| JournalEntry
	| ReconciliationReport
	| GstDataset
	| W9
	| Form1099;

export const PdfOrientationSchema = z.enum(["auto", "portrait", "landscape"]);

export const GenerateRequestSchema = z.object({
	jurisdiction: Jurisdiction,
	document_type: DocumentType,
	template: z.string().optional(),
	/** PDF page orientation. "auto" (default) goes landscape for wide line-item tables; "portrait" forces a vertical page even when that cramps a wide table - useful for testing how an agent handles a genuinely tight real-world layout. Ignored for non-PDF formats. */
	orientation: PdfOrientationSchema.optional().default("auto"),
	scenario: z.string().optional().default("clean"),
	seed: z.number().int().optional(),
	format: z.enum(["pdf", "png", "csv", "xlsx", "json", "eml", "txt"]).optional().default("json"),
	/** Override one party with a real company so an agent can test "we are the seller / buyer". IN invoice family only. */
	self: z
		.object({
			role: z.enum(["supplier", "customer"]),
			legal_name: z.string().min(1).max(160),
			trade_name: z.string().max(160).optional(),
			gstin: z.string().max(20).optional(),
			state: z.string().max(60).optional(),
			state_code: z.string().max(4).optional(),
			city: z.string().max(80).optional(),
			address: z.string().max(240).optional(),
			postal_code: z.string().max(12).optional(),
			email: z.string().max(120).optional(),
			phone: z.string().max(24).optional(),
		})
		.optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const BatchRequestSchema = z.object({
	jurisdiction: Jurisdiction,
	scenario: z.string(),
	/** Non-scenario batches generate this document type; defaults to a plain invoice when omitted. Ignored when `scenario` names a registered scenario. */
	document_type: DocumentType.optional(),
	count: z.number().int().min(1).max(200),
	formats: z.array(z.enum(["pdf", "png", "csv", "xlsx", "json", "eml", "txt"])).default(["json"]),
	orientation: PdfOrientationSchema.optional().default("auto"),
	seed: z.number().int().optional(),
	/** When true, returns one .zip containing every rendered document instead of just a JSON summary. */
	bundle: z.boolean().optional().default(false),
});
export type BatchRequest = z.infer<typeof BatchRequestSchema>;

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	expected_exceptions: string[];
}

export interface Env {
	DOCS: KVNamespace;
	BANK_DB: D1Database;
	AUTH_SECRET: string;
}
