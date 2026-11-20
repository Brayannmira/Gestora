import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { resetSuperAdminPassword } from './resetSuperAdminPassword.js'

describe('restablecimiento de contraseña del superadministrador', () => {
  let database

  function createDatabase() {
    database = new DatabaseSync(':memory:')
    database.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE otp_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      INSERT INTO users VALUES ('admin-1', 'admin@example.test', 'SUPER_ADMIN', 1, 'old-hash', 1);
      INSERT INTO sessions VALUES ('session-1', 'admin-1');
      INSERT INTO otp_challenges VALUES ('otp-1', 'admin-1');
    `)
    return database
  }

  afterEach(() => {
    database?.close()
    database = undefined
  })

  it('updates the password and revokes existing sessions and OTPs', async () => {
    const database = createDatabase()
    const result = await resetSuperAdminPassword({
      database,
      password: 'a-new-secret-123',
      hashPassword: async (password) => `hashed:${password}`,
    })

    expect(result.email).toBe('admin@example.test')
    expect(database.prepare('SELECT password_hash, must_change_password FROM users').get())
      .toEqual({ password_hash: 'hashed:a-new-secret-123', must_change_password: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(0)
    expect(database.prepare('SELECT COUNT(*) AS count FROM otp_challenges').get().count).toBe(0)
  })

  it('rejects short passwords without changing the account', async () => {
    const database = createDatabase()

    await expect(resetSuperAdminPassword({
      database,
      password: 'too-short',
      hashPassword: async (password) => `hashed:${password}`,
    })).rejects.toThrow('12 y 256')

    expect(database.prepare('SELECT password_hash FROM users').get().password_hash).toBe('old-hash')
  })

  it('does not reset an inactive or missing superadministrator', async () => {
    const database = createDatabase()
    database.prepare('UPDATE users SET is_active = 0').run()

    await expect(resetSuperAdminPassword({
      database,
      password: 'a-new-secret-123',
      hashPassword: async (password) => `hashed:${password}`,
    })).rejects.toThrow('No se encontró una cuenta activa')
  })
})
