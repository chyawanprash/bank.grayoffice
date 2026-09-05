-- Bank of Apna Nagar - D1 schema.
-- Apply with: wrangler d1 execute BANK_DB --file=src/bank/schema.sql [--remote]

CREATE TABLE IF NOT EXISTS branches (
	code TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	ifsc TEXT NOT NULL UNIQUE,
	address TEXT NOT NULL,
	manager_name TEXT NOT NULL,
	manager_image TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leadership (
	role TEXT PRIMARY KEY, -- 'CEO' | 'CFO'
	name TEXT NOT NULL,
	image TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	branch_code TEXT NOT NULL REFERENCES branches(code),
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_code);

-- Better Auth's core tables, matching its default D1/SQLite field mapping
-- (camelCase columns, boolean as INTEGER). See migrations/0003 for details.
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

CREATE TABLE IF NOT EXISTS accounts (
	id TEXT PRIMARY KEY,
	branch_code TEXT NOT NULL REFERENCES branches(code),
	holder_name TEXT NOT NULL,
	avatar TEXT,
	user_id TEXT REFERENCES user(id),
	balance_cents INTEGER NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL REFERENCES accounts(id),
	type TEXT NOT NULL, -- 'credit' | 'debit'
	amount_cents INTEGER NOT NULL,
	balance_after_cents INTEGER NOT NULL,
	description TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

CREATE TABLE IF NOT EXISTS subscriptions (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL REFERENCES accounts(id),
	company_name TEXT NOT NULL,
	charge_cents INTEGER NOT NULL,
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id);

INSERT OR IGNORE INTO branches (code, name, ifsc, address, manager_name, manager_image) VALUES
	('SCHOOL', 'Apna School', 'APNA0SCHOOL', '12 Vidya Marg, Apna Nagar', 'Makkhan Singh Rathee', '/images/Makkhan-Singh-Rathee.png'),
	('THEZOO', 'Apna Zoo', 'APNA0THEZOO', '45 Jungle Path, Apna Nagar', 'Mr Dubey', '/images/Dubey.png'),
	('WATERP', 'Apna Water Park', 'APNA0WATERP', '78 Splash Road, Apna Nagar', 'Bindiya', '/images/Bindiya.png'),
	('THEPRK', 'Apna Park', 'APNA0THEPRK', '3 Green Avenue, Apna Nagar', 'Yogiraj', '/images/Yogiraj.png'),
	('HOSPTL', 'Apna Hospital', 'APNA0HOSPTL', '9 Arogya Street, Apna Nagar', 'Gyan Singh', '/images/Gyan Singh.png'),
	('BADRIC', 'Badri Chowk', 'APNA0BADRIC', '1 Badri Chowk, Apna Nagar', 'Patel', '/images/Patel.png'),
	('BUDHEV', 'Budhdev Colony', 'APNA0BUDHEV', '22 Budhdev Colony, Apna Nagar', 'Savina', '/images/Savina.png');

INSERT OR IGNORE INTO leadership (role, name, image) VALUES
	('CEO', 'Badrinath', '/images/Badrinath.png'),
	('CFO', 'Budhdev', '/images/Budhdev.png');

-- Employees have no individual identity - the UI shows every one of them
-- with the same generic /images/mukesh.png avatar.
INSERT OR IGNORE INTO employees (id, name, branch_code, created_at) VALUES
	('emp-mukesh', 'Mukesh', 'SCHOOL', '2026-09-05T00:00:00.000Z'),
	('emp-vimlesh', 'Vimlesh', 'SCHOOL', '2026-09-05T00:00:00.000Z'),
	('emp-avdhesh', 'Avdhesh', 'SCHOOL', '2026-09-05T00:00:00.000Z'),
	('emp-ramesh', 'Ramesh', 'THEZOO', '2026-09-05T00:00:00.000Z'),
	('emp-dinesh', 'Dinesh', 'THEZOO', '2026-09-05T00:00:00.000Z'),
	('emp-kapilesh', 'Kapilesh', 'THEZOO', '2026-09-05T00:00:00.000Z'),
	('emp-suresh', 'Suresh', 'WATERP', '2026-09-05T00:00:00.000Z'),
	('emp-ganesh', 'Ganesh', 'WATERP', '2026-09-05T00:00:00.000Z'),
	('emp-himesh', 'Himesh', 'WATERP', '2026-09-05T00:00:00.000Z'),
	('emp-lokesh', 'Lokesh', 'THEPRK', '2026-09-05T00:00:00.000Z'),
	('emp-mahesh', 'Mahesh', 'THEPRK', '2026-09-05T00:00:00.000Z'),
	('emp-rangesh', 'Rangesh', 'THEPRK', '2026-09-05T00:00:00.000Z'),
	('emp-yogesh', 'Yogesh', 'HOSPTL', '2026-09-05T00:00:00.000Z'),
	('emp-vignesh', 'Vignesh', 'HOSPTL', '2026-09-05T00:00:00.000Z'),
	('emp-ritesh', 'Ritesh', 'HOSPTL', '2026-09-05T00:00:00.000Z'),
	('emp-brijesh', 'Brijesh', 'BADRIC', '2026-09-05T00:00:00.000Z'),
	('emp-janesh', 'Janesh', 'BADRIC', '2026-09-05T00:00:00.000Z'),
	('emp-rajesh', 'Rajesh', 'BUDHEV', '2026-09-05T00:00:00.000Z'),
	('emp-sailesh', 'Sailesh', 'BUDHEV', '2026-09-05T00:00:00.000Z');
