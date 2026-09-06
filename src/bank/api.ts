/**
 * Bank of Apna Nagar - a dummy bank simulator (/bank routes) backed by its
 * own D1 database (BANK_DB, schema in schema.sql). Separate from the
 * synthetic *document* generator above: this is live, mutable account state,
 * not a rendered artifact.
 */
import type { Env } from "../types";
import { checkRateLimit } from "../api";
import { createAuth } from "../auth";
import { AmountSchema, CreateAccountSchema, SubscribeSchema, TransferSchema, type Account, type Branch, type BankTxn, type Employee, type Leadership } from "./types";

/** Every employee shares this avatar - they're dummy staff with no individual identity. */
export const EMPLOYEE_PFP = "/images/mukesh.png";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } });
}
function badRequest(message: string, details?: unknown): Response {
	return json({ error: message, details }, 400);
}

function genAccountId(): string {
	const digits = crypto.getRandomValues(new Uint32Array(3))
		.reduce((s, n) => s + String(n).padStart(10, "0"), "")
		.slice(0, 12);
	return `APNA${digits}`;
}

async function accountExists(env: Env, id: string): Promise<boolean> {
	const row = await env.BANK_DB.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(id).first();
	return row !== null;
}

export async function handleListBranches(env: Env): Promise<Response> {
	const { results: branches } = await env.BANK_DB.prepare("SELECT * FROM branches ORDER BY name").all<Branch>();
	const { results: employees } = await env.BANK_DB.prepare("SELECT * FROM employees ORDER BY name").all<Employee>();
	const withStaff = branches.map((b) => ({
		...b,
		employees: employees.filter((e) => e.branch_code === b.code).map((e) => ({ name: e.name, pfp: EMPLOYEE_PFP })),
	}));
	return json({ branches: withStaff });
}

export async function handleListLeadership(env: Env): Promise<Response> {
	const { results } = await env.BANK_DB.prepare("SELECT * FROM leadership").all<Leadership>();
	return json({ leadership: results });
}

export async function handleCreateAccount(request: Request, env: Env): Promise<Response> {
	const auth = createAuth(env, new URL(request.url).origin);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) return json({ error: "sign in required" }, 401);

	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (!(await checkRateLimit(env, ip, 2, "bank-account-create", 3_600_000))) return json({ error: "rate limit exceeded: max 2 accounts per hour per IP" }, 429);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = CreateAccountSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const { branch_code, opening_balance } = parsed.data;

	const branch = await env.BANK_DB.prepare("SELECT * FROM branches WHERE code = ?").bind(branch_code).first<Branch>();
	if (!branch) return badRequest(`Unknown branch_code: ${branch_code}`);

	let id = genAccountId();
	for (let i = 0; i < 5 && (await accountExists(env, id)); i++) id = genAccountId();

	const holder_name = session.user.name;
	const avatar = session.user.image ?? null;
	const balance_cents = Math.round(opening_balance * 100);
	const created_at = new Date().toISOString();
	await env.BANK_DB.prepare("INSERT INTO accounts (id, branch_code, holder_name, avatar, user_id, balance_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(id, branch_code, holder_name, avatar, session.user.id, balance_cents, created_at)
		.run();

	return json({ account_id: id, branch, holder_name, avatar, balance: balance_cents / 100, created_at }, 201);
}

/** Public leaderboard: every account is visible - name, avatar, balance and transaction count, richest first. */
export async function handleLeaderboard(env: Env): Promise<Response> {
	const { results } = await env.BANK_DB.prepare(
		`SELECT a.id AS account_id, a.holder_name, a.avatar, a.balance_cents, a.branch_code, b.name AS branch_name,
			(SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS transaction_count
		 FROM accounts a LEFT JOIN branches b ON b.code = a.branch_code
		 ORDER BY a.balance_cents DESC LIMIT 100`,
	).all<{ account_id: string; holder_name: string; avatar: string | null; balance_cents: number; branch_code: string; branch_name: string; transaction_count: number }>();

	const sinceIso = new Date(Date.now() - 60_000).toISOString();
	const totals = await env.BANK_DB.prepare(
		`SELECT (SELECT COALESCE(SUM(balance_cents), 0) FROM accounts) AS economy_cents,
			(SELECT COUNT(*) FROM accounts) AS account_count,
			(SELECT COUNT(*) FROM transactions) AS transaction_count,
			(SELECT COUNT(*) FROM transactions WHERE created_at >= ?1) AS last_minute_count`,
	).bind(sinceIso).first<{ economy_cents: number; account_count: number; transaction_count: number; last_minute_count: number }>();

	return json({
		total_economy: (totals?.economy_cents ?? 0) / 100,
		total_accounts: totals?.account_count ?? 0,
		total_transactions: totals?.transaction_count ?? 0,
		transactions_per_minute: totals?.last_minute_count ?? 0,
		leaderboard: results.map((r) => ({
			account_id: r.account_id,
			holder_name: r.holder_name,
			avatar: r.avatar,
			balance: r.balance_cents / 100,
			branch_code: r.branch_code,
			branch_name: r.branch_name,
			transaction_count: r.transaction_count,
		})),
	});
}

export async function handleGetAccount(id: string, env: Env): Promise<Response> {
	const account = await env.BANK_DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Account>();
	if (!account) return json({ error: "account not found" }, 404);
	const branch = await env.BANK_DB.prepare("SELECT * FROM branches WHERE code = ?").bind(account.branch_code).first<Branch>();
	return json({ account_id: account.id, holder_name: account.holder_name, avatar: account.avatar, balance: account.balance_cents / 100, branch, created_at: account.created_at });
}

export async function handleListTransactions(id: string, env: Env): Promise<Response> {
	if (!(await accountExists(env, id))) return json({ error: "account not found" }, 404);
	const { results } = await env.BANK_DB.prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 100").bind(id).all<BankTxn>();
	return json({ transactions: results.map((t) => ({ ...t, amount: t.amount_cents / 100, balance_after: t.balance_after_cents / 100 })) });
}

async function recordTxn(env: Env, accountId: string, type: "credit" | "debit", amountCents: number, balanceAfterCents: number, description: string, createdAt = new Date().toISOString()): Promise<void> {
	await env.BANK_DB.prepare("INSERT INTO transactions (id, account_id, type, amount_cents, balance_after_cents, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(crypto.randomUUID(), accountId, type, amountCents, balanceAfterCents, description, createdAt)
		.run();
}

/**
 * Shared authz guard for every account-mutating route: the caller must be
 * signed in AND own the account. This is the single choke point - credit,
 * debit, subscribe, transfer and tick all go through it, so ownership can't
 * be forgotten on one path.
 */
async function requireOwnedAccount(request: Request, env: Env, id: string): Promise<{ account: Account } | Response> {
	const auth = createAuth(env, new URL(request.url).origin);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) return json({ error: "sign in required" }, 401);
	const account = await env.BANK_DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Account>();
	if (!account) return json({ error: "account not found" }, 404);
	if (account.user_id !== session.user.id) return json({ error: "not your account" }, 403);
	return { account };
}

export async function handleCredit(id: string, request: Request, env: Env): Promise<Response> {
	const owned = await requireOwnedAccount(request, env, id);
	if (owned instanceof Response) return owned;
	const { account } = owned;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = AmountSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const { amount, description } = parsed.data;

	const amountCents = Math.round(amount * 100);
	const newBalance = account.balance_cents + amountCents;
	await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(newBalance, id).run();
	await recordTxn(env, id, "credit", amountCents, newBalance, description || "Credit");

	return json({ account_id: id, balance: newBalance / 100 });
}

export async function handleDebit(id: string, request: Request, env: Env): Promise<Response> {
	const owned = await requireOwnedAccount(request, env, id);
	if (owned instanceof Response) return owned;
	const { account } = owned;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = AmountSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const { amount, description } = parsed.data;

	const amountCents = Math.round(amount * 100);
	if (amountCents > account.balance_cents) return badRequest("insufficient balance");

	const newBalance = account.balance_cents - amountCents;
	await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(newBalance, id).run();
	await recordTxn(env, id, "debit", amountCents, newBalance, description || "Debit");

	return json({ account_id: id, balance: newBalance / 100 });
}

/** UTR (NEFT/IMPS), RRN (UPI) or wire reference - synthetic but shaped right. */
function genRef(method: string): string {
	const n = crypto.getRandomValues(new Uint32Array(4)).reduce((s, x) => s + String(x).padStart(10, "0"), "");
	if (method === "upi") return n.slice(0, 12); // 12-digit RRN
	if (method === "wire") return `WIRE${n.slice(0, 16)}`;
	return `APNA${new Date().getFullYear()}${n.slice(0, 18)}`; // UTR-ish
}

/**
 * Outbound bank transfer over NEFT / IMPS / UPI / wire. Debits the caller's
 * account; if the destination is an internal APNA account it credits it in
 * the same call (funds move instantly), otherwise it's an external payout
 * and only the debit is recorded. ponytail: no fees, no scheduling windows,
 * no reversal flow - add when a scenario needs them.
 */
export async function handleTransfer(id: string, request: Request, env: Env): Promise<Response> {
	const owned = await requireOwnedAccount(request, env, id);
	if (owned instanceof Response) return owned;
	const { account } = owned;

	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	if (!(await checkRateLimit(env, ip, 20, "bank-transfer", 3_600_000))) return json({ error: "rate limit exceeded: max 20 transfers per hour per IP" }, 429);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = TransferSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const t = parsed.data;

	const amountCents = Math.round(t.amount * 100);
	if (amountCents > account.balance_cents) return badRequest("insufficient balance");
	if (t.to_account === id) return badRequest("cannot transfer to the same account");

	const reference = genRef(t.method);
	const rail = t.method.toUpperCase();

	// Internal transfer: destination is an APNA account that exists here.
	const internal = t.to_account?.startsWith("APNA")
		? await env.BANK_DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(t.to_account).first<Account>()
		: null;

	const srcBalance = account.balance_cents - amountCents;
	await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(srcBalance, id).run();
	const payee = internal ? internal.holder_name : t.beneficiary_name || t.upi_id || t.to_account || "external";
	await recordTxn(env, id, "debit", amountCents, srcBalance, `${rail} to ${payee} (Ref ${reference})${t.description ? ` - ${t.description}` : ""}`);

	if (internal) {
		const dstBalance = internal.balance_cents + amountCents;
		await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(dstBalance, internal.id).run();
		await recordTxn(env, internal.id, "credit", amountCents, dstBalance, `${rail} from ${account.holder_name} (Ref ${reference})${t.description ? ` - ${t.description}` : ""}`);
	}

	return json(
		{
			account_id: id,
			method: t.method,
			reference,
			amount: amountCents / 100,
			balance: srcBalance / 100,
			destination: internal ? { type: "internal", account_id: internal.id, holder_name: internal.holder_name } : { type: "external", to_account: t.to_account ?? null, upi_id: t.upi_id ?? null, beneficiary_name: t.beneficiary_name ?? null, beneficiary_ifsc: t.beneficiary_ifsc ?? null, swift: t.swift ?? null },
			status: internal ? "completed" : "sent",
		},
		201,
	);
}

export async function handleSubscribe(id: string, request: Request, env: Env): Promise<Response> {
	const owned = await requireOwnedAccount(request, env, id);
	if (owned instanceof Response) return owned;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body");
	}
	const parsed = SubscribeSchema.safeParse(body);
	if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());
	const { company_name, charge_amount } = parsed.data;

	const subId = crypto.randomUUID();
	await env.BANK_DB.prepare("INSERT INTO subscriptions (id, account_id, company_name, charge_cents, active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
		.bind(subId, id, company_name, Math.round(charge_amount * 100), new Date().toISOString())
		.run();

	return json({ subscription_id: subId, account_id: id, company_name, charge_amount }, 201);
}

/**
 * Adds ONE random transaction, for a client-driven "live ticking" dashboard
 * (the browser calls this on an interval for up to 10 minutes - see
 * account.html). Deliberately a single small write per call, not a batch
 * job or a Durable Object/cron, and rate-limited per account so it can
 * never be hammered into real Cloudflare usage: this is the guardrail that
 * keeps the feature inside the free tier no matter what the client does.
 */
export async function handleTick(id: string, request: Request, env: Env): Promise<Response> {
	const owned = await requireOwnedAccount(request, env, id);
	if (owned instanceof Response) return owned;
	const { account } = owned;

	// Max 6 ticks/minute per account - one every ~10s, matching the client's
	// interval with headroom, regardless of what actually calls this.
	if (!(await checkRateLimit(env, id, 6, "bank-tick", 60_000))) return json({ error: "rate limit exceeded" }, 429);

	let isCredit = Math.random() < 0.5;
	let amountCents = 1000 + Math.floor(Math.random() * 49000); // ₹10 - ₹500
	if (!isCredit && amountCents > account.balance_cents) isCredit = true; // never go negative
	if (!isCredit) amountCents = Math.min(amountCents, account.balance_cents);
	const balance = isCredit ? account.balance_cents + amountCents : account.balance_cents - amountCents;

	await recordTxn(env, id, isCredit ? "credit" : "debit", amountCents, balance, "Live transaction");
	await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(balance, id).run();

	return json({ account_id: id, balance: balance / 100 });
}

/**
 * Hourly cron: every active dummy-company subscription debits its account.
 * Skips (doesn't charge, doesn't go negative) when the balance can't cover
 * it - ponytail: no overdraft/retry logic, add if a scenario needs it.
 */
export async function runHourlyCharges(env: Env): Promise<{ charged: number; skipped: number }> {
	const { results } = await env.BANK_DB.prepare("SELECT * FROM subscriptions WHERE active = 1").all<{ id: string; account_id: string; company_name: string; charge_cents: number }>();
	let charged = 0;
	let skipped = 0;
	for (const sub of results) {
		const account = await env.BANK_DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(sub.account_id).first<Account>();
		if (!account || account.balance_cents < sub.charge_cents) {
			skipped++;
			continue;
		}
		const newBalance = account.balance_cents - sub.charge_cents;
		await env.BANK_DB.prepare("UPDATE accounts SET balance_cents = ? WHERE id = ?").bind(newBalance, sub.account_id).run();
		await recordTxn(env, sub.account_id, "debit", sub.charge_cents, newBalance, `Auto-charge: ${sub.company_name}`);
		charged++;
	}
	return { charged, skipped };
}
