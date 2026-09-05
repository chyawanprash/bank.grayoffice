import type { JournalEntry, JournalLine, ReconciliationReport, Jurisdiction } from "../types";
import { Rng, docNumber, isoDate, round2 } from "../utils";
import { buildMetadata, type InvoiceGenOptions } from "./in";

const JOURNAL_SCENARIOS: Record<string, (rng: Rng, currency: string) => JournalLine[]> = {
	accrual: (rng, c) => balanced(rng, "6010", "Accrued Expenses", "2210", "Accrued Liabilities", c),
	prepaid_amortization: (rng, c) => balanced(rng, "6210", "Insurance Expense", "1410", "Prepaid Expenses", c),
	depreciation: (rng, c) => balanced(rng, "6310", "Depreciation Expense", "1610", "Accumulated Depreciation", c),
	payroll: (rng, c) => balanced(rng, "6110", "Salaries Expense", "2110", "Salaries Payable", c),
	bank_fee: (rng, c) => balanced(rng, "6510", "Bank Charges", "1010", "Cash and Cash Equivalents", c),
	fx_adjustment: (rng, c) => balanced(rng, "6610", "FX Loss", "1010", "Cash and Cash Equivalents", c),
	intercompany: (rng, c) => balanced(rng, "1310", "Intercompany Receivable", "2310", "Intercompany Payable", c),
	revenue_recognition: (rng, c) => balanced(rng, "1210", "Unbilled Revenue", "4010", "Revenue", c),
	tax_provision: (rng, c) => balanced(rng, "6710", "Tax Provision Expense", "2410", "Income Tax Payable", c),
	reversal: (rng, c) => balanced(rng, "2210", "Accrued Liabilities", "6010", "Accrued Expenses", c),
};

function balanced(rng: Rng, drCode: string, drName: string, crCode: string, crName: string, currency: string): JournalLine[] {
	const amount = round2(rng.float(500, 50000));
	return [
		{ account_code: drCode, account_name: drName, debit: amount, credit: 0, memo: `Synthetic ${drName} entry`, department: "Finance", cost_center: "CC-100" },
		{ account_code: crCode, account_name: crName, debit: 0, credit: amount, memo: `Synthetic ${crName} entry`, department: "Finance", cost_center: "CC-100" },
	];
}

export function buildJournalEntry(rng: Rng, opts: InvoiceGenOptions, jurisdiction: Jurisdiction): JournalEntry {
	const scenarioType = rng.pick(Object.keys(JOURNAL_SCENARIOS));
	const currency = jurisdiction === "IN" ? "INR" : "USD";
	const lines = JOURNAL_SCENARIOS[scenarioType](rng, currency);
	return {
		jurisdiction,
		document_type: "journal_entry",
		journal_id: docNumber("JE", rng),
		journal_date: isoDate(new Date()),
		description: `${scenarioType.replace(/_/g, " ")} journal entry`,
		reference: docNumber("REF", rng, 6),
		entity: jurisdiction === "IN" ? "Entity India Pvt Ltd" : "Entity US Inc",
		currency,
		scenario_type: scenarioType,
		lines,
		metadata: buildMetadata(opts),
	};
}

export function buildReconciliationReport(
	rng: Rng,
	opts: InvoiceGenOptions,
	jurisdiction: Jurisdiction,
	reportType: "bank" | "ap" | "gst" = "bank",
): ReconciliationReport {
	if (reportType === "bank") {
		const bank_balance = round2(rng.float(50000, 500000));
		const outstanding_deposits = round2(rng.float(0, 20000));
		const outstanding_payments = round2(rng.float(0, 15000));
		const bank_charges = round2(rng.float(0, 500));
		const ledger_balance = round2(bank_balance + outstanding_deposits - outstanding_payments - bank_charges);
		return {
			jurisdiction,
			document_type: "reconciliation_report",
			report_type: "bank",
			period_start: isoDate(new Date()),
			period_end: isoDate(new Date()),
			bank_balance,
			ledger_balance,
			outstanding_deposits,
			outstanding_payments,
			bank_charges,
			unidentified_transactions: 0,
			adjustments: 0,
			reconciled_balance: ledger_balance,
			difference: 0,
			line_items: [],
			metadata: buildMetadata(opts),
		};
	}
	if (reportType === "ap") {
		const rows = Array.from({ length: rng.int(5, 15) }, () => {
			const invoice_amount = round2(rng.float(1000, 50000));
			const payment_amount = rng.bool(0.7) ? invoice_amount : round2(invoice_amount * rng.float(0, 0.9));
			return {
				vendor: `Vendor-${rng.int(100, 999)}`,
				invoice_number: docNumber("INV", rng),
				invoice_amount,
				payment_amount,
				outstanding: round2(invoice_amount - payment_amount),
				status: invoice_amount === payment_amount ? "PAID" : "OUTSTANDING",
			};
		});
		return {
			jurisdiction,
			document_type: "reconciliation_report",
			report_type: "ap",
			period_start: isoDate(new Date()),
			period_end: isoDate(new Date()),
			difference: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
			line_items: rows,
			metadata: buildMetadata(opts),
		};
	}
	const rows = Array.from({ length: rng.int(5, 15) }, () => ({
		supplier_gstin: `SYN${rng.int(1000000000, 2000000000)}`,
		invoice_number: docNumber("INV", rng),
		match_status: rng.bool(0.85) ? "MATCHED" : "MISMATCH",
		mismatch_reason: rng.bool(0.85) ? "" : rng.pick(["TAX_MISMATCH", "VALUE_MISMATCH", "MISSING_IN_2B"]),
	}));
	return {
		jurisdiction,
		document_type: "reconciliation_report",
		report_type: "gst",
		period_start: isoDate(new Date()),
		period_end: isoDate(new Date()),
		difference: 0,
		line_items: rows,
		metadata: buildMetadata(opts),
	};
}
