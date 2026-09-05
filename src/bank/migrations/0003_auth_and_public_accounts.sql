-- Better Auth's core tables (user/session/account/verification), hand-written
-- to match its default SQLite/D1 field mapping (camelCase columns, boolean
-- as INTEGER, dates as TEXT) since D1 is passed to betterAuth() directly and
-- there's no CLI migration path for a raw D1 binding. Also links bank
-- accounts to their owning user and gives them an optional avatar, for the
-- public leaderboard.
--
-- wrangler d1 execute BANK_DB --file=src/bank/migrations/0003_auth_and_public_accounts.sql [--remote]

CREATE TABLE IF NOT EXISTS user (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	emailVerified INTEGER NOT NULL,
	image TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON user(email);

CREATE TABLE IF NOT EXISTS session (
	id TEXT PRIMARY KEY,
	expiresAt TEXT NOT NULL,
	token TEXT NOT NULL,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL,
	ipAddress TEXT,
	userAgent TEXT,
	userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);

CREATE TABLE IF NOT EXISTS account (
	id TEXT PRIMARY KEY,
	issuer TEXT NOT NULL,
	accountId TEXT NOT NULL,
	providerId TEXT NOT NULL,
	userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
	accessToken TEXT,
	refreshToken TEXT,
	idToken TEXT,
	accessTokenExpiresAt TEXT,
	refreshTokenExpiresAt TEXT,
	scope TEXT,
	password TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_issuer_accountId ON account(issuer, accountId);
CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
	id TEXT PRIMARY KEY,
	identifier TEXT NOT NULL,
	value TEXT NOT NULL,
	expiresAt TEXT NOT NULL,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);

ALTER TABLE accounts ADD COLUMN user_id TEXT REFERENCES user(id);
ALTER TABLE accounts ADD COLUMN avatar TEXT;
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
