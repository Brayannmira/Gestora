import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createTransaction } from './database/transaction.js'

export const databasePath = path.resolve(
  process.env.DB_FILE ?? path.join(process.cwd(), 'data', 'gestora.sqlite'),
)
process.umask(0o077)
mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })

export const db = new DatabaseSync(databasePath)
if (process.platform !== 'win32') chmodSync(databasePath, 0o600)

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closing')),
    deletion_requested_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organization_subscriptions (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan_key TEXT NOT NULL CHECK (plan_key IN ('prueba', 'empresa')),
    status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'expired', 'suspended')),
    trial_ends_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (organization_id, name)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN')),
    organization_id TEXT REFERENCES organizations(id),
    branch_id TEXT REFERENCES branches(id),
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
    organization_id TEXT REFERENCES organizations(id),
    branch_id TEXT REFERENCES branches(id),
    barcode TEXT,
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
    organization_id TEXT REFERENCES organizations(id),
    branch_id TEXT REFERENCES branches(id),
    approval_status TEXT NOT NULL DEFAULT 'aprobada'
      CHECK (approval_status IN ('pendiente', 'aprobada', 'rechazada')),
    approved_by TEXT REFERENCES users(id),
    approved_at TEXT,
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
    organization_id TEXT REFERENCES organizations(id),
    branch_id TEXT REFERENCES branches(id),
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

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id TEXT REFERENCES organizations(id),
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_invitations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id),
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    email TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS requests_creator_idx ON requests(created_by);
  CREATE INDEX IF NOT EXISTS movements_product_idx ON inventory_movements(product_id, created_at);
  CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS notifications_recipient_idx
    ON notifications(recipient_id, read_at, created_at DESC);
  CREATE INDEX IF NOT EXISTS invitations_organization_idx
    ON user_invitations(organization_id, expires_at) WHERE accepted_at IS NULL AND cancelled_at IS NULL;
`)

const invitationTable = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_invitations'
`).get()
if (
  invitationTable &&
  (
    invitationTable.sql.includes('email TEXT NOT NULL UNIQUE') ||
    !invitationTable.sql.includes("'SUPER_ADMIN'"))
) {
  db.exec(`
    BEGIN;
    ALTER TABLE user_invitations RENAME TO user_invitations_legacy;
    CREATE TABLE user_invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      email TEXT NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN', 'SUPER_ADMIN')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO user_invitations
      (id, organization_id, branch_id, created_by, email, name, role, token_hash,
        expires_at, accepted_at, cancelled_at, created_at)
    SELECT id, organization_id, branch_id, created_by, email, name, role, token_hash,
      expires_at, accepted_at, cancelled_at, created_at
    FROM user_invitations_legacy;
    DROP TABLE user_invitations_legacy;
    COMMIT;
  `)
}
db.exec(`
  CREATE INDEX IF NOT EXISTS invitations_organization_idx
    ON user_invitations(organization_id, expires_at) WHERE accepted_at IS NULL AND cancelled_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_email_idx
    ON user_invitations(email) WHERE accepted_at IS NULL AND cancelled_at IS NULL;
`)

export const defaultOrganizationId = 'default-organization'
db.prepare(`
  INSERT OR IGNORE INTO organizations (id, name, created_at)
  VALUES (?, ?, ?)
`).run(
  defaultOrganizationId,
  process.env.DEFAULT_ORGANIZATION_NAME?.trim() || 'Gestora',
  new Date().toISOString(),
)
db.prepare(`
  INSERT OR IGNORE INTO organization_subscriptions
    (organization_id, plan_key, status, trial_ends_at, updated_at)
  SELECT id, 'empresa', 'active', NULL, created_at FROM organizations
`).run()

const branchesByOrganization = new Map()
for (const organization of db.prepare('SELECT id FROM organizations').all()) {
  let branch = db.prepare(`
    SELECT id FROM branches WHERE organization_id = ? ORDER BY created_at, id LIMIT 1
  `).get(organization.id)
  if (!branch) {
    branch = { id: randomUUID() }
    db.prepare(`
      INSERT INTO branches (id, organization_id, name, created_at)
      VALUES (?, ?, 'Principal', ?)
    `).run(branch.id, organization.id, new Date().toISOString())
  }
  branchesByOrganization.set(organization.id, branch.id)
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

addColumnIfMissing('users', 'is_active', 'INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))')
addColumnIfMissing('organizations', 'status', "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closing'))")
addColumnIfMissing('organizations', 'deletion_requested_at', 'TEXT')
addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))')
addColumnIfMissing('requests', 'completed_at', 'TEXT')
addColumnIfMissing('users', 'organization_id', 'TEXT REFERENCES organizations(id)')
addColumnIfMissing('products', 'organization_id', 'TEXT REFERENCES organizations(id)')
addColumnIfMissing('requests', 'organization_id', 'TEXT REFERENCES organizations(id)')
addColumnIfMissing('inventory_movements', 'organization_id', 'TEXT REFERENCES organizations(id)')
addColumnIfMissing('audit_events', 'organization_id', 'TEXT REFERENCES organizations(id)')
addColumnIfMissing('users', 'branch_id', 'TEXT REFERENCES branches(id)')
addColumnIfMissing('products', 'branch_id', 'TEXT REFERENCES branches(id)')
addColumnIfMissing('products', 'barcode', 'TEXT')
addColumnIfMissing('requests', 'branch_id', 'TEXT REFERENCES branches(id)')
addColumnIfMissing('requests', 'approval_status', "TEXT NOT NULL DEFAULT 'aprobada' CHECK (approval_status IN ('pendiente', 'aprobada', 'rechazada'))")
addColumnIfMissing('requests', 'approved_by', 'TEXT REFERENCES users(id)')
addColumnIfMissing('requests', 'approved_at', 'TEXT')
addColumnIfMissing('inventory_movements', 'branch_id', 'TEXT REFERENCES branches(id)')

for (const table of ['users', 'products', 'requests', 'inventory_movements', 'audit_events']) {
  db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`)
    .run(defaultOrganizationId)
}
for (const [organizationId, branchId] of branchesByOrganization) {
  db.prepare(`
    UPDATE users SET branch_id = ?
    WHERE organization_id = ? AND role = 'EMPLOYEE' AND branch_id IS NULL
  `).run(branchId, organizationId)
  for (const table of ['products', 'requests', 'inventory_movements']) {
    db.prepare(`UPDATE ${table} SET branch_id = ? WHERE organization_id = ? AND branch_id IS NULL`)
      .run(branchId, organizationId)
  }
}

db.exec(`
  DROP INDEX IF EXISTS one_super_admin_idx;
  CREATE UNIQUE INDEX one_super_admin_idx
    ON users(organization_id) WHERE role = 'SUPER_ADMIN';

  CREATE INDEX IF NOT EXISTS users_organization_idx ON users(organization_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS branches_organization_idx ON branches(organization_id, name);
  CREATE INDEX IF NOT EXISTS products_organization_idx ON products(organization_id, name);
  CREATE UNIQUE INDEX IF NOT EXISTS products_branch_barcode_idx
    ON products(organization_id, branch_id, barcode) WHERE barcode IS NOT NULL;
  CREATE INDEX IF NOT EXISTS requests_organization_idx ON requests(organization_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS requests_branch_approval_idx
    ON requests(organization_id, branch_id, approval_status, created_at DESC);
  CREATE INDEX IF NOT EXISTS movements_organization_idx ON inventory_movements(organization_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS audit_organization_idx ON audit_events(organization_id, created_at DESC, id DESC);

  DROP TRIGGER IF EXISTS max_two_admins_insert;
  DROP TRIGGER IF EXISTS max_two_admins_update;
  DROP TRIGGER IF EXISTS users_organization_guard;
  DROP TRIGGER IF EXISTS products_organization_guard;
  DROP TRIGGER IF EXISTS requests_organization_guard;
  DROP TRIGGER IF EXISTS movements_organization_guard;
  DROP TRIGGER IF EXISTS audit_organization_guard;
  DROP TRIGGER IF EXISTS users_organization_immutable;
  DROP TRIGGER IF EXISTS products_organization_immutable;
  DROP TRIGGER IF EXISTS requests_organization_immutable;
  DROP TRIGGER IF EXISTS movements_organization_immutable;
  DROP TRIGGER IF EXISTS audit_organization_immutable;
  DROP TRIGGER IF EXISTS users_branch_guard;
  DROP TRIGGER IF EXISTS products_branch_guard;
  DROP TRIGGER IF EXISTS requests_branch_guard;
  DROP TRIGGER IF EXISTS movements_branch_guard;
  DROP TRIGGER IF EXISTS users_branch_update_guard;
  DROP TRIGGER IF EXISTS products_branch_immutable;
  DROP TRIGGER IF EXISTS requests_branch_immutable;
  DROP TRIGGER IF EXISTS movements_branch_immutable;
  DROP TRIGGER IF EXISTS requests_approval_guard;

  CREATE TRIGGER max_two_admins_insert
    BEFORE INSERT ON users
    WHEN NEW.role = 'ADMIN' AND NEW.is_active = 1
      AND (SELECT COUNT(*) FROM users
        WHERE role = 'ADMIN' AND is_active = 1
          AND organization_id = NEW.organization_id) >= 2
    BEGIN
      SELECT RAISE(ABORT, 'admin_limit');
    END;

  CREATE TRIGGER max_two_admins_update
    BEFORE UPDATE OF role, is_active ON users
    WHEN NEW.role = 'ADMIN' AND NEW.is_active = 1
      AND (SELECT COUNT(*) FROM users
        WHERE role = 'ADMIN' AND is_active = 1
          AND organization_id = NEW.organization_id AND id != OLD.id) >= 2
    BEGIN
      SELECT RAISE(ABORT, 'admin_limit');
    END;

  CREATE TRIGGER users_organization_guard
    BEFORE INSERT ON users
    WHEN NEW.organization_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id)
    BEGIN SELECT RAISE(ABORT, 'organization_required'); END;

  CREATE TRIGGER products_organization_guard
    BEFORE INSERT ON products
    WHEN NEW.organization_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.created_by AND organization_id = NEW.organization_id
      )
    BEGIN SELECT RAISE(ABORT, 'organization_mismatch'); END;

  CREATE TRIGGER requests_organization_guard
    BEFORE INSERT ON requests
    WHEN NEW.organization_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products
        WHERE id = NEW.product_id AND organization_id = NEW.organization_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.created_by AND organization_id = NEW.organization_id
      )
    BEGIN SELECT RAISE(ABORT, 'organization_mismatch'); END;

  CREATE TRIGGER movements_organization_guard
    BEFORE INSERT ON inventory_movements
    WHEN NEW.organization_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products
        WHERE id = NEW.product_id AND organization_id = NEW.organization_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.actor_id AND organization_id = NEW.organization_id
      )
      OR (NEW.request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM requests
        WHERE id = NEW.request_id AND organization_id = NEW.organization_id
      ))
    BEGIN SELECT RAISE(ABORT, 'organization_mismatch'); END;

  CREATE TRIGGER audit_organization_guard
    BEFORE INSERT ON audit_events
    WHEN NEW.organization_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.actor_id AND organization_id = NEW.organization_id
      )
    BEGIN SELECT RAISE(ABORT, 'organization_mismatch'); END;

  CREATE TRIGGER users_organization_immutable
      BEFORE UPDATE OF organization_id ON users
      WHEN NEW.organization_id IS NOT OLD.organization_id
      BEGIN SELECT RAISE(ABORT, 'organization_immutable'); END;

  CREATE TRIGGER products_organization_immutable
      BEFORE UPDATE OF organization_id ON products
      WHEN NEW.organization_id IS NOT OLD.organization_id
      BEGIN SELECT RAISE(ABORT, 'organization_immutable'); END;

  CREATE TRIGGER requests_organization_immutable
      BEFORE UPDATE OF organization_id ON requests
      WHEN NEW.organization_id IS NOT OLD.organization_id
      BEGIN SELECT RAISE(ABORT, 'organization_immutable'); END;

  CREATE TRIGGER movements_organization_immutable
      BEFORE UPDATE OF organization_id ON inventory_movements
      WHEN NEW.organization_id IS NOT OLD.organization_id
      BEGIN SELECT RAISE(ABORT, 'organization_immutable'); END;

  CREATE TRIGGER audit_organization_immutable
      BEFORE UPDATE OF organization_id ON audit_events
      WHEN NEW.organization_id IS NOT OLD.organization_id
      BEGIN SELECT RAISE(ABORT, 'organization_immutable'); END;

  CREATE TRIGGER users_branch_guard
    BEFORE INSERT ON users
    WHEN (NEW.role = 'EMPLOYEE' AND NEW.branch_id IS NULL)
      OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM branches
        WHERE id = NEW.branch_id AND organization_id = NEW.organization_id
      ))
    BEGIN SELECT RAISE(ABORT, 'branch_mismatch'); END;

  CREATE TRIGGER users_branch_update_guard
    BEFORE UPDATE OF branch_id ON users
    WHEN (NEW.role = 'EMPLOYEE' AND NEW.branch_id IS NULL)
      OR (NEW.branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM branches
        WHERE id = NEW.branch_id AND organization_id = NEW.organization_id
      ))
    BEGIN SELECT RAISE(ABORT, 'branch_mismatch'); END;

  CREATE TRIGGER products_branch_guard
    BEFORE INSERT ON products
    WHEN NEW.branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM branches
      WHERE id = NEW.branch_id AND organization_id = NEW.organization_id
    )
    BEGIN SELECT RAISE(ABORT, 'branch_mismatch'); END;

  CREATE TRIGGER requests_branch_guard
    BEFORE INSERT ON requests
    WHEN NEW.branch_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products
        WHERE id = NEW.product_id
          AND organization_id = NEW.organization_id
          AND branch_id = NEW.branch_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.created_by AND organization_id = NEW.organization_id
          AND (role != 'EMPLOYEE' OR branch_id = NEW.branch_id)
      )
    BEGIN SELECT RAISE(ABORT, 'branch_mismatch'); END;

  CREATE TRIGGER movements_branch_guard
    BEFORE INSERT ON inventory_movements
    WHEN NEW.branch_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products
        WHERE id = NEW.product_id
          AND organization_id = NEW.organization_id
          AND branch_id = NEW.branch_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.actor_id AND organization_id = NEW.organization_id
      )
      OR (NEW.request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM requests
        WHERE id = NEW.request_id
          AND organization_id = NEW.organization_id
          AND branch_id = NEW.branch_id
      ))
    BEGIN SELECT RAISE(ABORT, 'branch_mismatch'); END;

  CREATE TRIGGER products_branch_immutable
    BEFORE UPDATE OF branch_id ON products
    WHEN NEW.branch_id IS NOT OLD.branch_id
    BEGIN SELECT RAISE(ABORT, 'branch_immutable'); END;

  CREATE TRIGGER requests_branch_immutable
    BEFORE UPDATE OF branch_id ON requests
    WHEN NEW.branch_id IS NOT OLD.branch_id
    BEGIN SELECT RAISE(ABORT, 'branch_immutable'); END;

  CREATE TRIGGER movements_branch_immutable
    BEFORE UPDATE OF branch_id ON inventory_movements
    WHEN NEW.branch_id IS NOT OLD.branch_id
    BEGIN SELECT RAISE(ABORT, 'branch_immutable'); END;

  CREATE TRIGGER requests_approval_guard
    BEFORE UPDATE OF status ON requests
    WHEN NEW.status IN ('en-proceso', 'completada') AND NEW.approval_status != 'aprobada'
    BEGIN SELECT RAISE(ABORT, 'request_not_approved'); END;
`)

export { createTransaction }
export const transaction = createTransaction(db)
