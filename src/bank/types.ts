import { z } from "zod";

/** The 7 branches seeded into D1 by schema.sql - kept here too so requests can be validated without a query. */
export const BRANCH_CODES = ["SCHOOL", "THEZOO", "WATERP", "THEPRK", "HOSPTL", "BADRIC", "BUDHEV"] as const;
export type BranchCode = (typeof BRANCH_CODES)[number];

export const CreateAccountSchema = z.object({
	branch_code: z.enum(BRANCH_CODES),
	opening_balance: z.number().min(0).max(10_000_000).optional().default(0),
});

export const AmountSchema = z.object({
	amount: z.number().positive().max(10_000_000),
	description: z.string().max(200).optional().default(""),
});

export const TRANSFER_METHODS = ["neft", "imps", "upi", "wire"] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];

/** Per-rail ceilings in rupees (mirrors real India rails; wire capped by AmountSchema). */
export const TRANSFER_LIMITS: Record<TransferMethod, number> = {
	neft: 10_000_000,
	imps: 500_000,
	upi: 100_000,
	wire: 10_000_000,
};

export const TransferSchema = z
	.object({
		method: z.enum(TRANSFER_METHODS),
		amount: z.number().positive(),
		description: z.string().max(200).optional().default(""),
		to_account: z.string().min(4).max(34).optional(),
		beneficiary_name: z.string().min(1).max(120).optional(),
		beneficiary_ifsc: z.string().min(4).max(20).optional(),
		beneficiary_bank: z.string().min(1).max(120).optional(),
		upi_id: z.string().min(3).max(80).optional(),
		swift: z.string().min(8).max(11).optional(),
	})
	.superRefine((v, ctx) => {
		if (v.amount > TRANSFER_LIMITS[v.method])
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: `${v.method.toUpperCase()} limit is ${TRANSFER_LIMITS[v.method]}` });
		const need = (field: keyof typeof v, msg: string) => {
			if (!v[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: msg });
		};
		if (v.method === "upi") need("upi_id", "upi_id is required for UPI transfers");
		if (v.method === "neft" || v.method === "imps") {
			need("to_account", `to_account is required for ${v.method.toUpperCase()}`);
			if (v.to_account && !v.to_account.startsWith("APNA")) {
				need("beneficiary_name", "beneficiary_name is required for external transfers");
				need("beneficiary_ifsc", "beneficiary_ifsc is required for external transfers");
			}
		}
		if (v.method === "wire") {
			need("to_account", "to_account (IBAN/account no) is required for wire transfers");
			need("beneficiary_name", "beneficiary_name is required for wire transfers");
			need("swift", "swift/BIC is required for wire transfers");
		}
	});

export const SubscribeSchema = z.object({
	company_name: z.string().min(1).max(100),
	charge_amount: z.number().positive().max(1_000_000),
});

export interface Branch {
	code: string;
	name: string;
	ifsc: string;
	address: string;
	manager_name: string;
	manager_image: string;
}

export interface Leadership {
	role: string;
	name: string;
	image: string;
}

export interface Employee {
	id: string;
	name: string;
	branch_code: string;
	created_at: string;
}

export interface Account {
	id: string;
	branch_code: string;
	holder_name: string;
	avatar: string | null;
	user_id: string | null;
	balance_cents: number;
	created_at: string;
}

export interface BankTxn {
	id: string;
	account_id: string;
	type: "credit" | "debit";
	amount_cents: number;
	balance_after_cents: number;
	description: string;
	created_at: string;
}
