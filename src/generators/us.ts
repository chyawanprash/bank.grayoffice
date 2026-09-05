/**
 * US document generators, mirroring in.ts but with US sales-tax logic
 * (state/county/city rate) instead of GST, and EIN instead of GSTIN/PAN.
 */
import type {
	BankStatement,
	BankTransaction,
	CreditCardStatement,
	CreditDebitNote,
	Form1099,
	Grn,
	Invoice,
	LineItem,
	Party,
	PurchaseOrder,
	Receipt,
	W9,
} from "../types";
import {
	Rng,
	addDays,
	amountInWordsUS,
	docNumber,
	isoDate,
	maskAccountNumber,
	round2,
	synthAccountNumber,
	synthAddress,
	synthCompanyName,
	synthDomain,
	synthEin,
	synthEmail,
	synthPersonName,
	synthPhone,
} from "../utils";
import { buildMetadata, type InvoiceGenOptions } from "./in";

const SKUS = [
	{ desc: "Industrial Shelving Unit", unit: "EA" },
	{ desc: "Wireless Barcode Scanner", unit: "EA" },
	{ desc: "Cloud Software Subscription (Per Seat)", unit: "SEAT" },
	{ desc: "Consulting Services", unit: "HR" },
	{ desc: "Office Furniture Set", unit: "SET" },
	{ desc: "Packaging Supplies (Case of 50)", unit: "CASE" },
];
const BANK_NAMES = ["Chase", "Bank of America", "Wells Fargo", "Citibank", "PNC Bank"];

function synthPartyUS(rng: Rng): Party {
	const legal_name = synthCompanyName(rng, "US");
	const addr = synthAddress(rng, "US");
	const person = synthPersonName(rng);
	return {
		legal_name,
		address: addr.address,
		city: addr.city,
		state: addr.state,
		postal_code: addr.postal_code,
		country: "United States",
		ein: synthEin(rng),
		email: synthEmail(person, synthDomain(legal_name)),
		phone: synthPhone(rng, "US"),
	};
}

function buildLineItemsUS(rng: Rng, taxRate: number): LineItem[] {
	const count = rng.int(1, 5);
	return Array.from({ length: count }, (_, i) => {
		const p = rng.pick(SKUS);
		const quantity = rng.int(1, 30);
		const unit_price = rng.float(20, 3000);
		const discount = rng.bool(0.25) ? round2(quantity * unit_price * rng.float(0.02, 0.1)) : 0;
		const taxable_value = round2(quantity * unit_price - discount);
		const sales_tax_amount = round2((taxable_value * taxRate) / 100);
		return {
			line_number: i + 1,
			sku: `SKU-${rng.int(1000, 9999)}`,
			description: p.desc,
			quantity,
			unit: p.unit,
			unit_price,
			discount,
			taxable_value,
			tax_rate: taxRate,
			sales_tax_rate: taxRate,
			sales_tax_amount,
			line_total: round2(taxable_value + sales_tax_amount),
		};
	});
}

/** Builds invoice line items that mirror a given quantity/price list (e.g. a PO's items) rather than random ones, so PO/GRN/Invoice chains stay comparable for 3-way matching. */
export function lineItemsFromQuantitiesUS(
	source: { description: string; quantity: number; unit_price: number; unit: string; sku?: string }[],
	taxRate: number,
): LineItem[] {
	return source.map((s, i) => {
		const taxable_value = round2(s.quantity * s.unit_price);
		const sales_tax_amount = round2((taxable_value * taxRate) / 100);
		return {
			line_number: i + 1,
			sku: s.sku,
			description: s.description,
			quantity: s.quantity,
			unit: s.unit,
			unit_price: s.unit_price,
			discount: 0,
			taxable_value,
			tax_rate: taxRate,
			sales_tax_rate: taxRate,
			sales_tax_amount,
			line_total: round2(taxable_value + sales_tax_amount),
		};
	});
}

export function buildInvoiceUS(rng: Rng, opts: InvoiceGenOptions): Invoice {
	const supplier = synthPartyUS(rng);
	const customer = synthPartyUS(rng);
	const isSubscription = opts.documentType === "subscription_invoice" || opts.documentType === "recurring_invoice";
	const taxRate = rng.bool(0.15) ? 0 : rng.float(4, 9.5, 2);
	const line_items = buildLineItemsUS(rng, taxRate);

	const subtotal = round2(line_items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const discount = round2(line_items.reduce((s, i) => s + i.discount, 0));
	const taxable_amount = round2(line_items.reduce((s, i) => s + i.taxable_value, 0));
	const tax = round2(line_items.reduce((s, i) => s + (i.sales_tax_amount ?? 0), 0));
	const shipping = rng.bool(0.4) ? rng.float(5, 75) : 0;
	const rawTotal = taxable_amount + tax + shipping;
	const grand_total = round2(rawTotal);

	const invoiceDate = new Date();
	const dueDate = addDays(invoiceDate, rng.pick([15, 30, 45]));
	const bankName = rng.pick(BANK_NAMES);

	return {
		jurisdiction: "US",
		document_type: opts.documentType,
		document_status: "issued",
		supplier,
		customer,
		invoice: {
			invoice_number: docNumber("INV", rng),
			invoice_date: isoDate(invoiceDate),
			due_date: isoDate(dueDate),
			currency: "USD",
			payment_terms: rng.pick(["Net 15", "Net 30", "Due on Receipt"]),
			purchase_order_number: rng.bool(0.5) ? docNumber("PO", rng) : undefined,
			notes: isSubscription ? "Recurring billing - auto-renews unless cancelled." : undefined,
		},
		line_items,
		totals: {
			subtotal,
			discount,
			taxable_amount,
			tax,
			shipping,
			other_charges: 0,
			round_off: round2(grand_total - rawTotal),
			grand_total,
			amount_in_words: amountInWordsUS(grand_total),
		},
		payment: {
			bank_name: bankName,
			account_name: supplier.legal_name,
			account_identifier: maskAccountNumber(synthAccountNumber(rng, 10)),
			routing_identifier: String(rng.int(100000000, 999999999)),
			payment_method: rng.pick(["ACH", "Wire", "Check"]),
			payment_reference: docNumber("PMT", rng),
		},
		metadata: buildMetadata(opts),
	};
}

export function buildCreditOrDebitMemoUS(rng: Rng, opts: InvoiceGenOptions): CreditDebitNote {
	const supplier = synthPartyUS(rng);
	const customer = synthPartyUS(rng);
	const line_items = buildLineItemsUS(rng, rng.float(4, 9.5)).map((li) => ({
		...li,
		original_quantity: li.quantity,
		returned_quantity: Math.max(1, Math.round(li.quantity * rng.float(0.2, 1))),
	}));
	const subtotal = round2(line_items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(line_items.reduce((s, i) => s + (i.sales_tax_amount ?? 0), 0));
	const grand_total = round2(subtotal + tax);
	const noteDate = new Date();
	return {
		jurisdiction: "US",
		document_type: opts.documentType,
		original_invoice_number: docNumber("INV", rng),
		original_invoice_date: isoDate(addDays(noteDate, -rng.int(5, 40))),
		note_number: docNumber(opts.documentType === "credit_memo" ? "CM" : "DM", rng),
		note_date: isoDate(noteDate),
		reason: rng.pick(["Product return", "Billing correction", "Pricing dispute", "Damaged goods"]),
		supplier,
		customer,
		line_items,
		totals: {
			subtotal,
			discount: 0,
			taxable_amount: subtotal,
			tax,
			shipping: 0,
			other_charges: 0,
			round_off: 0,
			grand_total,
			amount_in_words: amountInWordsUS(grand_total),
		},
		metadata: buildMetadata(opts),
	};
}

export function buildPurchaseOrderUS(rng: Rng, opts: InvoiceGenOptions): PurchaseOrder {
	const supplier = synthPartyUS(rng);
	const buyer = synthPartyUS(rng);
	const count = rng.int(1, 5);
	const items = Array.from({ length: count }, (_, i) => {
		const p = rng.pick(SKUS);
		const quantity = rng.int(5, 200);
		const unit_price = rng.float(20, 2000);
		const tax = round2(quantity * unit_price * 0.07);
		return {
			line_number: i + 1,
			sku: `SKU-${rng.int(1000, 9999)}`,
			description: p.desc,
			quantity,
			unit: p.unit,
			unit_price,
			discount: 0,
			tax,
			total: round2(quantity * unit_price + tax),
		};
	});
	const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(items.reduce((s, i) => s + i.tax, 0));
	const shipping = rng.float(0, 150);
	return {
		jurisdiction: "US",
		document_type: "purchase_order",
		po_number: docNumber("PO", rng),
		po_date: isoDate(new Date()),
		supplier,
		buyer,
		currency: "USD",
		payment_terms: rng.pick(["Net 30", "Net 45"]),
		delivery_date: isoDate(addDays(new Date(), rng.int(7, 21))),
		items,
		subtotal,
		tax,
		shipping,
		grand_total: round2(subtotal + tax + shipping),
		department: rng.pick(["Procurement", "Operations", "IT", "Facilities"]),
		cost_center: `CC-${rng.int(100, 999)}`,
		approval_status: rng.pick(["Approved", "Pending Approval"]),
		metadata: buildMetadata(opts),
	};
}

export function buildReceivingReportUS(rng: Rng, opts: InvoiceGenOptions, poItems?: PurchaseOrder["items"]): Grn {
	const supplier = synthPartyUS(rng);
	const sourceItems = poItems ?? buildPurchaseOrderUS(rng, opts).items;
	const items = sourceItems.map((poItem, i) => ({
		line_number: i + 1,
		sku: poItem.sku,
		description: poItem.description,
		ordered_quantity: poItem.quantity,
		received_quantity: poItem.quantity,
		rejected_quantity: 0,
		unit: poItem.unit,
		condition: "Good",
	}));
	return {
		jurisdiction: "US",
		document_type: "receiving_report",
		grn_number: docNumber("RR", rng),
		grn_date: isoDate(new Date()),
		po_number: docNumber("PO", rng),
		supplier,
		warehouse: rng.pick(["DC-East", "DC-West", "Main Warehouse"]),
		delivery_location: synthAddress(rng, "US").city,
		received_by: synthPersonName(rng),
		items,
		notes: "",
		metadata: buildMetadata(opts),
	};
}

const US_TXN_TYPES = ["ACH Credit", "ACH Debit", "Wire", "Check", "Card Transaction", "Payroll", "Rent", "Vendor Payment", "Customer Payment", "Bank Fee", "Interest", "Loan Repayment", "Refund"];

export function buildBankStatementUS(rng: Rng, opts: InvoiceGenOptions): BankStatement {
	const bankName = rng.pick(BANK_NAMES);
	const start = addDays(new Date(), -30);
	let balance = rng.float(20000, 400000);
	const opening_balance = balance;
	const transactions: BankTransaction[] = [];
	const count = rng.int(15, 40);
	for (let i = 0; i < count; i++) {
		const type = rng.pick(US_TXN_TYPES);
		const isCredit = ["ACH Credit", "Interest", "Refund", "Customer Payment"].includes(type) ? true : rng.bool(0.3);
		const amount = round2(rng.float(50, 60000));
		balance = round2(isCredit ? balance + amount : balance - amount);
		transactions.push({
			date: isoDate(addDays(start, Math.floor((i / count) * 30))),
			posted_date: isoDate(addDays(start, Math.floor((i / count) * 30) + 1)),
			transaction_id: docNumber("TXN", rng, 8),
			cheque_or_check_number: type === "Check" ? String(rng.int(1000, 9999)) : undefined,
			type,
			description: `${type} - ${synthCompanyName(rng, "US")}`,
			merchant: type === "Card Transaction" ? synthCompanyName(rng, "US") : undefined,
			category: type,
			debit: isCredit ? null : amount,
			credit: isCredit ? amount : null,
			balance,
		});
	}
	return {
		jurisdiction: "US",
		document_type: "bank_statement",
		bank_name: bankName,
		routing_identifier: String(rng.int(100000000, 999999999)),
		account_holder: synthCompanyName(rng, "US"),
		account_number_masked: maskAccountNumber(synthAccountNumber(rng, 10)),
		account_type: "Business Checking",
		currency: "USD",
		period_start: isoDate(start),
		period_end: isoDate(new Date()),
		opening_balance: round2(opening_balance),
		closing_balance: balance,
		transactions,
		metadata: buildMetadata(opts),
	};
}

export function buildCreditCardStatementUS(rng: Rng, opts: InvoiceGenOptions): CreditCardStatement {
	const previous_balance = rng.float(0, 8000);
	const purchases = rng.float(500, 12000);
	const payments = rng.float(0, previous_balance + 100);
	const credits = rng.bool(0.3) ? rng.float(0, 300) : 0;
	const fees = rng.bool(0.2) ? rng.float(0, 50) : 0;
	const interest = previous_balance > 0 ? round2(previous_balance * 0.0199) : 0;
	const new_balance = round2(previous_balance + purchases + fees + interest - payments - credits);
	const start = addDays(new Date(), -30);
	const count = rng.int(10, 30);
	const transactions = Array.from({ length: count }, (_, i) => ({
		transaction_date: isoDate(addDays(start, Math.floor((i / count) * 30))),
		posting_date: isoDate(addDays(start, Math.floor((i / count) * 30) + 1)),
		merchant: synthCompanyName(rng, "US"),
		description: rng.pick(["Office Supplies", "SaaS Subscription", "Travel", "Client Dinner", "Hardware Purchase"]),
		category: rng.pick(["Office", "Software", "Travel", "Meals", "Equipment"]),
		amount: round2(rng.float(10, 2500)),
		currency: "USD",
	}));
	return {
		jurisdiction: "US",
		document_type: "credit_card_statement",
		issuer: rng.pick(["Chase Ink", "Amex Business", "Capital One Spark"]),
		account_name: synthCompanyName(rng, "US"),
		account_last4: String(rng.int(1000, 9999)),
		statement_period_start: isoDate(start),
		statement_period_end: isoDate(new Date()),
		statement_date: isoDate(new Date()),
		payment_due_date: isoDate(addDays(new Date(), 21)),
		minimum_payment: round2(Math.max(25, new_balance * 0.02)),
		previous_balance,
		payments,
		credits,
		purchases,
		fees,
		interest,
		new_balance,
		credit_limit: rng.pick([10000, 25000, 50000, 100000]),
		transactions,
		metadata: buildMetadata(opts),
	};
}

export function buildReceiptUS(rng: Rng, opts: InvoiceGenOptions): Receipt {
	const merchant = synthCompanyName(rng, "US");
	const count = rng.int(1, 5);
	const items = Array.from({ length: count }, () => {
		const p = rng.pick(SKUS);
		const quantity = rng.int(1, 4);
		const unit_price = rng.float(10, 500);
		const tax = round2(quantity * unit_price * 0.0725);
		return { description: p.desc, quantity, unit_price, discount: 0, tax, total: round2(quantity * unit_price + tax) };
	});
	const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
	const tax = round2(items.reduce((s, i) => s + i.tax, 0));
	return {
		jurisdiction: "US",
		document_type: "expense_receipt",
		receipt_style: rng.pick(["retail", "restaurant", "business_expense"]),
		merchant_name: merchant,
		merchant_address: synthAddress(rng, "US").address,
		merchant_phone: synthPhone(rng, "US"),
		receipt_number: docNumber("RCPT", rng),
		date: isoDate(new Date()),
		time: `${rng.int(9, 20)}:${String(rng.int(0, 59)).padStart(2, "0")}`,
		cashier_or_server: synthPersonName(rng),
		employee_name: synthPersonName(rng),
		department: rng.pick(["Sales", "Engineering", "Operations"]),
		business_purpose: rng.pick(["Client meeting", "Business travel", "Team offsite", "Office supplies"]),
		expense_category: rng.pick(["Meals", "Travel", "Office Supplies", "Software"]),
		items,
		subtotal,
		tax,
		total: round2(subtotal + tax),
		payment_method: rng.pick(["Credit Card", "Cash", "Corporate Card"]),
		transaction_id: docNumber("TXN", rng, 8),
		metadata: buildMetadata(opts),
	};
}

export function buildW9(rng: Rng, opts: InvoiceGenOptions): W9 {
	const legal_name = synthPersonName(rng);
	const business_name = synthCompanyName(rng, "US");
	const addr = synthAddress(rng, "US");
	return {
		jurisdiction: "US",
		document_type: "w9",
		legal_name,
		business_name,
		federal_tax_classification: rng.pick(["Individual/sole proprietor", "C Corporation", "S Corporation", "LLC", "Partnership"]),
		address: addr.address,
		city: addr.city,
		state: addr.state,
		zip: addr.postal_code,
		tin_type: rng.bool(0.5) ? "SSN" : "EIN",
		tin: rng.bool(0.5) ? `${rng.int(100, 999)}-${rng.int(10, 99)}-${rng.int(1000, 9999)}` : synthEin(rng),
		signature: legal_name,
		signature_date: isoDate(new Date()),
		metadata: buildMetadata(opts),
	};
}

export function buildForm1099(rng: Rng, opts: InvoiceGenOptions): Form1099 {
	const payer = synthPartyUS(rng);
	const recipientName = synthPersonName(rng);
	const recipientAddr = synthAddress(rng, "US");
	const box1_amount = rng.float(600, 150000);
	return {
		jurisdiction: "US",
		document_type: opts.documentType as Form1099["document_type"],
		tax_year: new Date().getUTCFullYear() - 1,
		payer_name: payer.legal_name,
		payer_tin: payer.ein ?? synthEin(rng),
		payer_address: payer.address,
		recipient_name: recipientName,
		recipient_tin: synthEin(rng),
		recipient_address: recipientAddr.address,
		box1_amount,
		federal_tax_withheld: rng.bool(0.2) ? round2(box1_amount * 0.24) : 0,
		metadata: buildMetadata(opts),
	};
}
