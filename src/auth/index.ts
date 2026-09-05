/**
 * Better Auth instance for the Bank of Apna Nagar. Accounts are created
 * inline against the same D1 database (BANK_DB) - passing a D1Database
 * binding directly is natively supported, no adapter needed.
 * Mounted at /api/auth/* in src/index.ts.
 */
import { betterAuth } from "better-auth";
import type { Env } from "../types";

export function createAuth(env: Env, baseURL: string) {
	return betterAuth({
		baseURL,
		basePath: "/api/auth",
		secret: env.AUTH_SECRET,
		database: env.BANK_DB,
		emailAndPassword: { enabled: true },
		session: {
			cookieCache: { enabled: true, maxAge: 300 },
		},
		trustedOrigins: [baseURL],
	});
}

export type Auth = ReturnType<typeof createAuth>;
