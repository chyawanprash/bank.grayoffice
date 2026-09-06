/**
 * Bearer API keys for the Bank of Apna Nagar - an alternative caller identity
 * to a Better Auth session for the /bank/* routes. Gray Office (and any other
 * client) mints one per user and passes it as `Authorization: Bearer gobk_...`.
 *
 * The whole bank is a clearly-marked synthetic sandbox, so POST /bank/keys is
 * open (rate-limited) and just needs an email - it upserts the `user` row.
 * ponytail: no real bank sign-up / key rotation UI - add before this is
 * anything but a demo.
 */
import type { Env } from "../types";

const PREFIX = "gobk";

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hex(bytes: number): string {
	return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upsert a bank `user` by email, mint a key, return the full secret once. */
export async function mintApiKey(
	env: Env,
	{ email, name, label }: { email: string; name: string; label?: string },
): Promise<{ key: string; key_id: string; user_id: string }> {
	const now = new Date().toISOString();
	const existing = await env.BANK_DB.prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{ id: string }>();
	let userId = existing?.id;
	if (!userId) {
		userId = crypto.randomUUID();
		await env.BANK_DB.prepare(
			"INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 1, NULL, ?, ?)",
		)
			.bind(userId, name || email, email, now, now)
			.run();
	}

	const keyId = hex(6);
	const secret = hex(24);
	const key = `${PREFIX}_${keyId}_${secret}`;
	await env.BANK_DB.prepare(
		"INSERT INTO api_keys (id, key_hash, user_id, label, created_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(keyId, await sha256Hex(secret), userId, label ?? null, now)
		.run();

	return { key, key_id: keyId, user_id: userId };
}

/** Resolve `Authorization: Bearer gobk_<id>_<secret>` to a user id, or null. */
export async function resolveApiKey(env: Env, request: Request): Promise<{ userId: string } | null> {
	const header = request.headers.get("authorization") ?? "";
	const m = header.match(/^Bearer\s+(gobk_[0-9a-f]+_[0-9a-f]+)$/i);
	if (!m) return null;
	const [, , secret] = m[1].split("_");
	const row = await env.BANK_DB.prepare("SELECT id, user_id FROM api_keys WHERE key_hash = ?")
		.bind(await sha256Hex(secret))
		.first<{ id: string; user_id: string }>();
	if (!row) return null;
	await env.BANK_DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
		.bind(new Date().toISOString(), row.id)
		.run();
	return { userId: row.user_id };
}
