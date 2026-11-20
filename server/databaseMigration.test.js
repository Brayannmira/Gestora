import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

describe('migración del esquema multiempresa', () => {
  let directory
  let database
  let previousDbFile

  afterEach(async () => {
    if (database?.isOpen) database.close()
    database = undefined
    if (previousDbFile === undefined) delete process.env.DB_FILE
    else process.env.DB_FILE = previousDbFile
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('asigna los registros existentes a Gestora y conserva el aislamiento al reiniciar', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'gestora-migration-'))
    const databasePath = path.join(directory, 'legacy.sqlite')
    const legacy = new DatabaseSync(databasePath)
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL,
        must_change_password INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE otp_challenges (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL,
        resend_after INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, stock INTEGER NOT NULL,
        minimum_stock INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE requests (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
        priority TEXT NOT NULL, status TEXT NOT NULL, product_id TEXT NOT NULL,
        product_name TEXT NOT NULL, quantity INTEGER NOT NULL,
        stock_deducted INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL,
        created_at TEXT NOT NULL, completed_at TEXT
      );
      CREATE TABLE inventory_movements (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
        type TEXT NOT NULL, quantity INTEGER NOT NULL, previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
        request_id TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
        action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT,
        details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO organizations VALUES
        ('default-organization', 'Gestora', '2025-01-01');
      CREATE TABLE user_invitations (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT,
        created_by TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'ADMIN')),
        token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
        accepted_at TEXT, cancelled_at TEXT, created_at TEXT NOT NULL
      );
      INSERT INTO users VALUES
        ('legacy-user', 'legacy@example.test', 'Legacy User', 'hash', 'SUPER_ADMIN', 1, 0, '2025-01-01');
      INSERT INTO products VALUES
        ('legacy-product', 'Legacy product', 5, 1, 'legacy-user', '2025-01-01');
      INSERT INTO requests VALUES
        ('legacy-request', 'Legacy request', '', 'normal', 'pendiente',
         'legacy-product', 'Legacy product', 1, 0, 'legacy-user', '2025-01-01', NULL);
      INSERT INTO inventory_movements VALUES
        ('legacy-movement', 'legacy-product', 'Legacy product', 'ajuste',
         5, 0, 5, 5, 'Opening balance', NULL, 'legacy-user', '2025-01-01');
      INSERT INTO audit_events VALUES
        ('legacy-audit', 'legacy-user', 'Legacy User', 'legacy.action',
         'product', 'legacy-product', '{}', '2025-01-01');
      INSERT INTO user_invitations VALUES
        ('legacy-invitation', 'default-organization', NULL, 'legacy-user',
         'invite@example.test', 'Invited User', 'EMPLOYEE', 'legacy-token-hash',
         '2026-01-01', NULL, NULL, '2025-01-01');
    `)
    legacy.close()

    previousDbFile = process.env.DB_FILE
    process.env.DB_FILE = databasePath
    vi.resetModules()
    const migrated = await import('./database.js')
    database = migrated.db

    expect(database.prepare('SELECT name FROM organizations').get().name).toBe('Gestora')
    expect(database.prepare('SELECT email FROM user_invitations WHERE id = ?')
      .get('legacy-invitation').email).toBe('invite@example.test')
    database.prepare(`
      UPDATE user_invitations SET cancelled_at = ? WHERE id = ?
    `).run(new Date().toISOString(), 'legacy-invitation')
    expect(() => database.prepare(`
      INSERT INTO user_invitations
        (id, organization_id, created_by, email, name, role, token_hash,
          expires_at, created_at)
      VALUES ('replacement-invitation', 'default-organization', 'legacy-user',
        'invite@example.test', 'Invited User', 'EMPLOYEE', 'replacement-token-hash',
        '2099-01-01', ?)
    `).run(new Date().toISOString())).not.toThrow()
    const organizationId = migrated.defaultOrganizationId
    for (const [table, id] of [
      ['users', 'legacy-user'],
      ['products', 'legacy-product'],
      ['requests', 'legacy-request'],
      ['inventory_movements', 'legacy-movement'],
      ['audit_events', 'legacy-audit'],
    ]) {
      expect(database.prepare(`SELECT organization_id FROM ${table} WHERE id = ?`).get(id)
        .organization_id).toBe(organizationId)
    }

    database.close()
    database = undefined
    vi.resetModules()
    const restarted = await import('./database.js')
    database = restarted.db
    expect(database.prepare('SELECT COUNT(*) AS count FROM organizations').get().count).toBe(1)
    expect(database.prepare('SELECT organization_id FROM products WHERE id = ?')
      .get('legacy-product').organization_id).toBe(organizationId)
  })
})
