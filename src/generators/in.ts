/**
 * India document generators. All invoice-family variants share one core
 * builder (`buildInvoiceIN`) parameterized by variant, matching the spec's
 * canonical invoice schema so the renderer/validators/mutations stay generic.
 */
import type {
	BankStatement,
	BankTransaction,
	CreditDebitNote,
	DocumentType,
	EInvoiceInfo,
	Grn,
	GstDataset,
	Invoice,
	LineItem,
	Metadata,
	Party,
	PurchaseOrder,
	Receipt,
	VendorMaster,
} from "../types";
import {
	Rng,
	addDays,
	amountInWordsIN,
	docNumber,
	isoDate,
	maskAccountNumber,
	round2,
	synthAccountNumber,
	synthAddress,
	synthCompanyName,
	synthDomain,
	synthEmail,
	synthGstin,
	synthIfsc,
	synthPan,
	synthPersonName,
	synthPhone,
} from "../utils";

const GOODS = [
	{ desc: "Cotton Fabric Roll", hsn: "5208", unit: "MTR" },
	{ desc: "Steel Fasteners (Box of 100)", hsn: "7318", unit: "BOX" },
	{ desc: "LED Panel Light 40W", hsn: "9405", unit: "PCS" },
	{ desc: "Packaged Basmati Rice 25kg", hsn: "1006", unit: "BAG" },
	{ desc: "Industrial Ball Bearing", hsn: "8482", unit: "PCS" },
	{ desc: "Corrugated Packaging Box", hsn: "4819", unit: "PCS" },
];
const SERVICES = [
	{ desc: "Software Consulting Services", sac: "9983", unit: "HRS" },
	{ desc: "Annual Maintenance Contract", sac: "9987", unit: "NOS" },
	{ desc: "Freight and Logistics Services", sac: "9965", unit: "NOS" },
	{ desc: "Digital Marketing Retainer", sac: "9983", unit: "MON" },
	{ desc: "Legal Advisory Services", sac: "9982", unit: "HRS" },
];
const GST_RATES = [5, 12, 18, 28];
const BANK_NAMES = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
const BANK_CODES: Record<string, string> = {
	"HDFC Bank": "HDFC",
	"ICICI Bank": "ICIC",
	"State Bank of India": "SBIN",
	"Axis Bank": "UTIB",
	"Kotak Mahindra Bank": "KKBK",
};

function synthPartyIN(rng: Rng, opts: { withGstin: boolean; sezFlag?: boolean; countryOverride?: string }): Party {
	const legal_name = synthCompanyName(rng, "IN");
	const addr = synthAddress(rng, "IN");
	const person = synthPersonName(rng);
	const country = opts.countryOverride ?? "India";
	return {
		legal_name,
		trade_name: legal_name,
		address: addr.address,
		city: opts.countryOverride ? "Overseas" : addr.city,
		state: opts.countryOverride ? "N/A" : addr.state,
		state_code: opts.countryOverride ? undefined : addr.state_code,
		postal_code: opts.countryOverride ? "00000" : addr.postal_code,
		country,
		gstin: opts.withGstin && !opts.countryOverride ? synthGstin(rng, addr.state_code ?? "27") : undefined,
		pan: synthPan(rng),
		email: synthEmail(person, synthDomain(legal_name)),
		phone: synthPhone(rng, "IN"),
	};
}

function buildLineItemsIN(
	rng: Rng,
	kind: "goods" | "services" | "mixed",
	taxMode: "igst" | "cgst_sgst" | "zero_rated" | "none",
): LineItem[] {
	const count = rng.int(1, 5);
	const pool = kind === "goods" ? GOODS : kind === "services" ? SERVICES : [...GOODS, ...SERVICES];
	const items: LineItem[] = [];
	for (let i = 0; i < count; i++) {
		const p = rng.pick(pool);
		const quantity = rng.int(1, 50);
		const unit_price = rng.float(100, 15000);
		const discount = rng.bool(0.3) ? round2(quantity * unit_price * rng.float(0.01, 0.1)) : 0;
		const taxable_value = round2(quantity * unit_price - discount);
		const gst_rate = taxMode === "zero_rated" || taxMode === "none" ? 0 : rng.pick(GST_RATES);
		const item: LineItem = {
			line_number: i + 1,
			description: p.desc,
			hsn_or_sac: "hsn" in p ? p.hsn : p.sac,
			quantity,
			unit: p.unit,
			unit_price,
			discount,
			taxable_value,
			tax_rate: gst_rate,
			line_total: 0,
		};
		if (taxMode === "igst") {
			item.igst_rate = gst_rate;
			item.igst_amount = round2((taxable_value * gst_rate) / 100);
			item.line_total = round2(taxable_value + (item.igst_amount ?? 0));
		} else if (taxMode === "cgst_sgst") {
			item.cgst_rate = gst_rate / 2;
			item.sgst_rate = gst_rate / 2;
			item.cgst_amount = round2((taxable_value * gst_rate) / 200);
			item.sgst_amount = round2((taxable_value * gst_rate) / 200);
			item.line_total = round2(taxable_value + (item.cgst_amount ?? 0) + (item.sgst_amount ?? 0));
		} else {
			item.line_total = taxable_value;
		}
		items.push(item);
	}
	return items;
}

/** Builds invoice line items that mirror a given quantity/price list (e.g. a PO's items) rather than random ones, so PO/GRN/Invoice chains stay comparable for 3-way matching. */
export function lineItemsFromQuantitiesIN(
	rng: Rng,
	source: { description: string; quantity: number; unit_price: number; unit: string; hsn_or_sac?: string }[],
	taxMode: "igst" | "cgst_sgst" | "zero_rated" | "none",
): LineItem[] {
	return source.map((s, i) => {
		const taxable_value = round2(s.quantity * s.unit_price);
		const gst_rate = taxMode === "zero_rated" || taxMode === "none" ? 0 : rng.pick(GST_RATES);
		const item: LineItem = {
			line_number: i + 1,
			description: s.description,
			hsn_or_sac: s.hsn_or_sac,
			quantity: s.quantity,
			unit: s.unit,
			unit_price: s.unit_price,
			discount: 0,
			taxable_value,
			tax_rate: gst_rate,
			line_total: 0,
		};
		if (taxMode === "igst") {
			item.igst_rate = gst_rate;
			item.igst_amount = round2((taxable_value * gst_rate) / 100);
			item.line_total = round2(taxable_value + item.igst_amount);
		} else if (taxMode === "cgst_sgst") {
			item.cgst_rate = gst_rate / 2;
			item.sgst_rate = gst_rate / 2;
			item.cgst_amount = round2((taxable_value * gst_rate) / 200);
			item.sgst_amount = round2((taxable_value * gst_rate) / 200);
			item.line_total = round2(taxable_value + item.cgst_amount + item.sgst_amount);
		} else {
			item.line_total = taxable_value;
		}
		return item;
	});
}

export function totalsFromLineItemsIN(items: LineItem[]) {
	const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const discount = round2(items.reduce((s, i) => s + i.discount, 0));
	const taxable_amount = round2(items.reduce((s, i) => s + i.taxable_value, 0));
	const cgst = round2(items.reduce((s, i) => s + (i.cgst_amount ?? 0), 0));
	const sgst = round2(items.reduce((s, i) => s + (i.sgst_amount ?? 0), 0));
	const igst = round2(items.reduce((s, i) => s + (i.igst_amount ?? 0), 0));
	const tax = round2(cgst + sgst + igst);
	const rawTotal = taxable_amount + tax;
	const grand_total = Math.round(rawTotal);
	const round_off = round2(grand_total - rawTotal);
	return { subtotal, discount, taxable_amount, cgst, sgst, igst, tax, grand_total, round_off };
}

function synthEInvoice(rng: Rng): EInvoiceInfo {
	const irn = Array.from({ length: 64 }, () => rng.int(0, 15).toString(16)).join("");
	return {
		irn,
		ack_number: String(rng.int(100000000000, 999999999999)),
		ack_date: isoDate(new Date()),
		signed_invoice_reference: `SIGV1.${irn.slice(0, 12)}`,
		signed_qr_payload: `SYNTHETIC-QR::${irn.slice(0, 20)}`,
		e_invoice_status: "GENERATED",
	};
}

export interface SelfParty {
	/** which side of the invoice this party sits on */
	role: "supplier" | "customer";
	legal_name: string;
	trade_name?: string;
	gstin?: string;
	state?: string;
	state_code?: string;
	city?: string;
	address?: string;
	postal_code?: string;
	email?: string;
	phone?: string;
}

export interface InvoiceGenOptions {
	documentType: DocumentType;
	testId: string;
	scenarioId: string;
	seed: number;
	/** Override one party with a caller-supplied company (e.g. "we are the buyer"). */
	self?: SelfParty;
}

/** Overwrite the fields the caller supplied; keep synthetic values for the rest. */
function applySelf(party: Party, self: SelfParty): Party {
	return {
		...party,
		legal_name: self.legal_name,
		trade_name: self.trade_name ?? self.legal_name,
		address: self.address ?? party.address,
		city: self.city ?? party.city,
		state: self.state ?? party.state,
		state_code: self.state_code ?? party.state_code,
		postal_code: self.postal_code ?? party.postal_code,
		gstin: self.gstin ?? party.gstin,
		email: self.email ?? party.email,
		phone: self.phone ?? party.phone,
	};
}

export function buildInvoiceIN(rng: Rng, opts: InvoiceGenOptions): Invoice {
	const dt = opts.documentType;
	let supplier = synthPartyIN(rng, { withGstin: true });
	const isExport = dt === "export_invoice";
	const isSez = dt === "sez_invoice";
	const isB2C = dt === "b2c_invoice";
	const isBillOfSupply = dt === "bill_of_supply" || dt === "invoice_cum_bill_of_supply";
	const isReverseCharge = dt === "reverse_charge_invoice";

	let customer = synthPartyIN(rng, {
		withGstin: !isB2C && !isExport,
		countryOverride: isExport ? rng.pick(["United States", "United Arab Emirates", "United Kingdom", "Singapore"]) : undefined,
	});

	if (opts.self?.role === "supplier") supplier = applySelf(supplier, opts.self);
	if (opts.self?.role === "customer") customer = applySelf(customer, opts.self);

	let taxMode: "igst" | "cgst_sgst" | "zero_rated" | "none";
	if (isExport || isSez) taxMode = "zero_rated";
	else if (isBillOfSupply) taxMode = "none";
	else if (dt === "interstate_invoice") taxMode = "igst";
	else if (dt === "intrastate_invoice") taxMode = "cgst_sgst";
	else taxMode = supplier.state_code === customer.state_code ? "cgst_sgst" : "igst";

	const kind = rng.pick(["goods", "services", "mixed"] as const);
	const line_items = buildLineItemsIN(rng, kind, taxMode);
	const t = totalsFromLineItemsIN(line_items);

	const invoiceDate = new Date();
	const dueDate = addDays(invoiceDate, rng.pick([15, 30, 45, 60]));
	const bankName = rng.pick(BANK_NAMES);

	const invoice: Invoice = {
		jurisdiction: "IN",
		document_type: dt,
		document_status: "issued",
		supplier,
		customer,
		invoice: {
			invoice_number: docNumber("INV", rng),
			invoice_date: isoDate(invoiceDate),
			due_date: isoDate(dueDate),
			supply_date: isoDate(invoiceDate),
			currency: isExport ? "USD" : "INR",
			payment_terms: rng.pick(["Net 15", "Net 30", "Net 45", "Due on Receipt"]),
			purchase_order_number: rng.bool(0.6) ? docNumber("PO", rng) : undefined,
			place_of_supply: `${customer.state} (${customer.state_code ?? "96"})`,
			reverse_charge: isReverseCharge,
			notes: "Goods once sold will not be taken back or exchanged.",
			terms_and_conditions: "Payment due within the agreed credit period. Interest @18% p.a. on delayed payments.",
		},
		line_items,
		totals: {
			subtotal: t.subtotal,
			discount: t.discount,
			taxable_amount: t.taxable_amount,
			cgst: t.cgst,
			sgst: t.sgst,
			igst: t.igst,
			cess: 0,
			tax: t.tax,
			shipping: 0,
			other_charges: 0,
			round_off: t.round_off,
			grand_total: t.grand_total,
			amount_in_words: isExport ? `USD ${t.grand_total} Only` : amountInWordsIN(t.grand_total),
		},
		payment: {
			bank_name: bankName,
			account_name: supplier.legal_name,
			account_identifier: maskAccountNumber(synthAccountNumber(rng)),
			routing_identifier: synthIfsc(rng, BANK_CODES[bankName]),
			upi_id: `${supplier.legal_name.toLowerCase().replace(/\s+/g, "")}@okhdfcbank`,
			payment_method: "Bank Transfer",
			payment_reference: docNumber("PMT", rng),
		},
		e_invoice: !isB2C && rng.bool(0.7) ? synthEInvoice(rng) : undefined,
		metadata: buildMetadata(opts),
	};
	return invoice;
}

export function buildCreditOrDebitNoteIN(rng: Rng, opts: InvoiceGenOptions): CreditDebitNote {
	let supplier = synthPartyIN(rng, { withGstin: true });
	let customer = synthPartyIN(rng, { withGstin: true });
	if (opts.self?.role === "supplier") supplier = applySelf(supplier, opts.self);
	if (opts.self?.role === "customer") customer = applySelf(customer, opts.self);
	const taxMode = supplier.state_code === customer.state_code ? "cgst_sgst" : "igst";
	const line_items = buildLineItemsIN(rng, "goods", taxMode).map((li) => ({
		...li,
		original_quantity: li.quantity,
		returned_quantity: Math.max(1, Math.round(li.quantity * rng.float(0.2, 1))),
	}));
	const t = totalsFromLineItemsIN(line_items);
	const noteDate = new Date();
	return {
		jurisdiction: "IN",
		document_type: opts.documentType,
		original_invoice_number: docNumber("INV", rng),
		original_invoice_date: isoDate(addDays(noteDate, -rng.int(5, 40))),
		note_number: docNumber(opts.documentType === "credit_note" ? "CN" : "DN", rng),
		note_date: isoDate(noteDate),
		reason: rng.pick(["Product return", "Pricing correction", "Tax correction", "Damaged goods", "Duplicate invoice correction"]),
		supplier,
		customer,
		line_items,
		totals: {
			subtotal: t.subtotal,
			discount: t.discount,
			taxable_amount: t.taxable_amount,
			cgst: t.cgst,
			sgst: t.sgst,
			igst: t.igst,
			cess: 0,
			tax: t.tax,
			shipping: 0,
			other_charges: 0,
			round_off: t.round_off,
			grand_total: t.grand_total,
			amount_in_words: amountInWordsIN(t.grand_total),
		},
		metadata: buildMetadata(opts),
	};
}

export function buildPurchaseOrderIN(rng: Rng, opts: InvoiceGenOptions): PurchaseOrder {
	const supplier = synthPartyIN(rng, { withGstin: true });
	const buyer = synthPartyIN(rng, { withGstin: true });
	const count = rng.int(1, 5);
	const items = Array.from({ length: count }, (_, i) => {
		const p = rng.pick(GOODS);
		const quantity = rng.int(10, 500);
		const unit_price = rng.float(100, 5000);
		const discount = 0;
		const tax = round2(quantity * unit_price * 0.18);
		return {
			line_number: i + 1,
			description: p.desc,
			quantity,
			unit: p.unit,
			unit_price,
			discount,
			tax,
			total: round2(quantity * unit_price + tax),
		};
	});
	const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(items.reduce((s, i) => s + i.tax, 0));
	const shipping = rng.float(0, 2000);
	return {
		jurisdiction: "IN",
		document_type: "purchase_order",
		po_number: docNumber("PO", rng),
		po_date: isoDate(new Date()),
		supplier,
		buyer,
		currency: "INR",
		payment_terms: rng.pick(["Net 30", "Net 45"]),
		delivery_date: isoDate(addDays(new Date(), rng.int(7, 30))),
		items,
		subtotal,
		tax,
		shipping,
		grand_total: round2(subtotal + tax + shipping),
		department: rng.pick(["Procurement", "Operations", "Manufacturing", "IT"]),
		cost_center: `CC-${rng.int(100, 999)}`,
		approval_status: rng.pick(["Approved", "Pending Approval"]),
		metadata: buildMetadata(opts),
	};
}

export function buildGrnIN(rng: Rng, opts: InvoiceGenOptions, poItems?: PurchaseOrder["items"]): Grn {
	const supplier = synthPartyIN(rng, { withGstin: true });
	const sourceItems = poItems ?? buildPurchaseOrderIN(rng, opts).items;
	const items = sourceItems.map((poItem, i) => ({
		line_number: i + 1,
		description: poItem.description,
		ordered_quantity: poItem.quantity,
		received_quantity: poItem.quantity,
		rejected_quantity: 0,
		unit: poItem.unit,
		condition: "Good",
		batch_number: `B${rng.int(1000, 9999)}`,
	}));
	return {
		jurisdiction: "IN",
		document_type: "grn",
		grn_number: docNumber("GRN", rng),
		grn_date: isoDate(new Date()),
		po_number: docNumber("PO", rng),
		supplier,
		warehouse: rng.pick(["Warehouse A", "Warehouse B", "Central DC"]),
		delivery_location: synthAddress(rng, "IN").city,
		received_by: synthPersonName(rng),
		items,
		notes: "",
		metadata: buildMetadata(opts),
	};
}

const IN_TXN_TYPES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash Deposit", "Cash Withdrawal", "Bank Charges", "Interest", "EMI", "Refund", "Vendor Payment", "Customer Receipt", "Salary", "GST Payment", "TDS Payment", "Utility Payment"];

export function buildBankStatementIN(rng: Rng, opts: InvoiceGenOptions): BankStatement {
	const bankName = rng.pick(BANK_NAMES);
	const start = addDays(new Date(), -30);
	let balance = rng.float(50000, 500000);
	const opening_balance = balance;
	const transactions: BankTransaction[] = [];
	const count = rng.int(15, 40);
	for (let i = 0; i < count; i++) {
		const type = rng.pick(IN_TXN_TYPES);
		const isCredit = ["Interest", "Refund", "Customer Receipt", "Salary"].includes(type) ? true : rng.bool(0.35);
		const amount = round2(rng.float(500, 85000));
		if (isCredit) balance = round2(balance + amount);
		else balance = round2(balance - amount);
		transactions.push({
			date: isoDate(addDays(start, Math.floor((i / count) * 30))),
			value_date: isoDate(addDays(start, Math.floor((i / count) * 30))),
			transaction_id: docNumber("TXN", rng, 8),
			cheque_or_check_number: type === "Cheque" ? String(rng.int(100000, 999999)) : undefined,
			type,
			description: `${type} - ${synthCompanyName(rng, "IN")}`,
			reference: docNumber("REF", rng, 6),
			debit: isCredit ? null : amount,
			credit: isCredit ? amount : null,
			balance,
		});
	}
	return {
		jurisdiction: "IN",
		document_type: "bank_statement",
		bank_name: bankName,
		branch: `${synthAddress(rng, "IN").city} Branch`,
		routing_identifier: synthIfsc(rng, BANK_CODES[bankName]),
		account_holder: synthCompanyName(rng, "IN"),
		account_number_masked: maskAccountNumber(synthAccountNumber(rng)),
		account_type: "Current Account",
		currency: "INR",
		period_start: isoDate(start),
		period_end: isoDate(new Date()),
		opening_balance: round2(opening_balance),
		closing_balance: balance,
		transactions,
		metadata: buildMetadata(opts),
	};
}

export function buildReceiptIN(rng: Rng, opts: InvoiceGenOptions): Receipt {
	const merchant = synthCompanyName(rng, "IN");
	const count = rng.int(1, 5);
	const items = Array.from({ length: count }, () => {
		const p = rng.pick(GOODS);
		const quantity = rng.int(1, 5);
		const unit_price = rng.float(50, 2000);
		const discount = 0;
		const tax = round2(quantity * unit_price * 0.18);
		return { description: p.desc, quantity, unit_price, discount, tax, total: round2(quantity * unit_price + tax) };
	});
	const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(items.reduce((s, i) => s + i.tax, 0));
	return {
		jurisdiction: "IN",
		document_type: "expense_receipt",
		receipt_style: "retail",
		merchant_name: merchant,
		merchant_address: synthAddress(rng, "IN").address,
		merchant_phone: synthPhone(rng, "IN"),
		gstin: synthGstin(rng, "27"),
		receipt_number: docNumber("RCPT", rng),
		date: isoDate(new Date()),
		time: `${rng.int(9, 20)}:${String(rng.int(0, 59)).padStart(2, "0")}`,
		cashier_or_server: synthPersonName(rng),
		items,
		subtotal,
		tax,
		total: round2(subtotal + tax),
		payment_method: rng.pick(["Cash", "UPI", "Card"]),
		transaction_id: docNumber("TXN", rng, 8),
		metadata: buildMetadata(opts),
	};
}

export function buildVendorMasterIN(rng: Rng, opts: InvoiceGenOptions): VendorMaster {
	const legal_name = synthCompanyName(rng, "IN");
	const addr = synthAddress(rng, "IN");
	const bankName = rng.pick(BANK_NAMES);
	const person = synthPersonName(rng);
	return {
		jurisdiction: "IN",
		document_type: "vendor_master",
		vendor_id: docNumber("VEND", rng, 4),
		legal_name,
		trade_name: legal_name,
		gstin: synthGstin(rng, addr.state_code ?? "27"),
		pan: synthPan(rng),
		tan: `${addr.state_code}${Array.from({ length: 4 }, () => String.fromCharCode(65 + rng.int(0, 25))).join("")}${rng.int(10000, 99999)}`,
		registered_address: addr.address,
		billing_address: addr.address,
		contact_name: person,
		email: synthEmail(person, synthDomain(legal_name)),
		phone: synthPhone(rng, "IN"),
		bank_name: bankName,
		account_number_masked: maskAccountNumber(synthAccountNumber(rng)),
		routing_identifier: synthIfsc(rng, BANK_CODES[bankName]),
		payment_terms: rng.pick(["Net 30", "Net 45", "Net 60"]),
		tds_section: rng.pick(["194C", "194J", "194Q"]),
		tds_rate: rng.pick([1, 2, 10]),
		vendor_status: "Active",
		metadata: buildMetadata(opts),
	};
}

export function buildGstDataset(rng: Rng, opts: InvoiceGenOptions): GstDataset {
	const rowCount = rng.int(10, 25);
	const rows = Array.from({ length: rowCount }, () => {
		const taxable_value = rng.float(5000, 200000);
		const rate = rng.pick(GST_RATES);
		const igst = round2((taxable_value * rate) / 100);
		return {
			supplier_gstin: synthGstin(rng, "27"),
			invoice_number: docNumber("INV", rng),
			invoice_date: isoDate(addDays(new Date(), -rng.int(1, 60))),
			invoice_value: round2(taxable_value + igst),
			taxable_value,
			cgst: round2(igst / 2),
			sgst: round2(igst / 2),
			igst: 0,
			books_status: "Filed",
			gstr2b_status: rng.bool(0.85) ? "Matched" : "Unmatched",
			match_status: rng.bool(0.85) ? "MATCHED" : "MISMATCH",
		};
	});
	return {
		jurisdiction: "IN",
		document_type: opts.documentType as GstDataset["document_type"],
		period: isoDate(new Date()).slice(0, 7),
		entity_gstin: synthGstin(rng, "27"),
		rows,
		metadata: buildMetadata(opts),
	};
}

export function buildMetadata(opts: InvoiceGenOptions): Metadata {
	return {
		synthetic: true,
		test_id: opts.testId,
		scenario_id: opts.scenarioId,
		generated_at: new Date().toISOString(),
		seed: opts.seed,
		expected_exceptions: [],
	};
}
