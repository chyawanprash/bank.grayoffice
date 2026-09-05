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
