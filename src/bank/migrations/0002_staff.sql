-- Adds leadership (CEO/CFO) and per-branch employees, and gives every
-- branch manager a photo. Run once against a DB created from the original
-- schema.sql (before manager_image/leadership/employees existed):
--   wrangler d1 execute BANK_DB --file=src/bank/migrations/0002_staff.sql [--remote]

ALTER TABLE branches ADD COLUMN manager_image TEXT NOT NULL DEFAULT '';

UPDATE branches SET manager_image = '/images/Makkhan-Singh-Rathee.png' WHERE code = 'SCHOOL';
UPDATE branches SET manager_image = '/images/Dubey.png' WHERE code = 'THEZOO';
UPDATE branches SET manager_image = '/images/Bindiya.png' WHERE code = 'WATERP';
UPDATE branches SET manager_image = '/images/Yogiraj.png' WHERE code = 'THEPRK';
UPDATE branches SET manager_name = 'Gyan Singh', manager_image = '/images/Gyan Singh.png' WHERE code = 'HOSPTL';
UPDATE branches SET manager_image = '/images/Patel.png' WHERE code = 'BADRIC';
UPDATE branches SET manager_name = 'Savina', manager_image = '/images/Savina.png' WHERE code = 'BUDHEV';

CREATE TABLE IF NOT EXISTS leadership (
	role TEXT PRIMARY KEY,
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

INSERT OR IGNORE INTO leadership (role, name, image) VALUES
	('CEO', 'Badrinath', '/images/Badrinath.png'),
	('CFO', 'Budhdev', '/images/Budhdev.png');

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
