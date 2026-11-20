import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createTransaction } from './database/transaction.js'

export const databasePath = path.resolve(
  process.env.DB_FILE ?? path.join(process.cwd(), 'data', 'gestora.sqlite'),
)
mkdirSync(path.dirname(databasePath), { recursive: true })

export const db = new DatabaseSync(databasePath)

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_super_admin_idx
    ON users(role) WHERE role = 'SUPER_ADMIN';

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    resend_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0),
    minimum_stock INTEGER NOT NULL CHECK (minimum_stock >= 0),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('urgente', 'importante', 'normal')),
    status TEXT NOT NULL CHECK (status IN ('pendiente', 'en-proceso', 'completada', 'cancelada')),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    stock_deducted INTEGER NOT NULL DEFAULT 0 CHECK (stock_deducted IN (0, 1)),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entrada', 'salida', 'ajuste')),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
    new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    request_id TEXT REFERENCES requests(id) ON DELETE RESTRICT,
    actor_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS requests_creator_idx ON requests(created_by);
  CREATE INDEX IF NOT EXISTS movements_product_idx ON inventory_movements(product_id, created_at);
`)

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

addColumnIfMissing('users', 'is_active', 'INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))')
addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))')
addColumnIfMissing('requests', 'completed_at', 'TEXT')

db.exec(`
  DROP TRIGGER IF EXISTS max_two_admins_insert;
  DROP TRIGGER IF EXISTS max_two_admins_update;

  CREATE TRIGGER max_two_admins_insert
    BEFORE INSERT ON users
    WHEN NEW.role = 'ADMIN' AND NEW.is_active = 1
      AND (SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_active = 1) >= 2
    BEGIN
      SELECT RAISE(ABORT, 'admin_limit');
    END;

  CREATE TRIGGER max_two_admins_update
    BEFORE UPDATE OF role, is_active ON users
    WHEN NEW.role = 'ADMIN' AND NEW.is_active = 1
      AND (SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id != OLD.id) >= 2
    BEGIN
      SELECT RAISE(ABORT, 'admin_limit');
    END;
`)

export { createTransaction }
export const transaction = createTransaction(db)
