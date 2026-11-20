import { createTransaction } from './database/transaction.js'

export async function resetSuperAdminPassword({ database, password, hashPassword }) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('La contraseña debe tener entre 12 y 256 caracteres.')
  }

  const account = database
    .prepare("SELECT id, email FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1")
    .get()
  if (!account) {
    throw new Error('No se encontró una cuenta activa de superadministrador.')
  }

  const passwordHash = await hashPassword(password)
  const transaction = createTransaction(database)
  transaction(() => {
    const result = database.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = 0
      WHERE id = ? AND role = 'SUPER_ADMIN' AND is_active = 1
    `).run(passwordHash, account.id)
    if (result.changes !== 1) {
      throw new Error('La cuenta de superadministrador cambió durante el restablecimiento.')
    }

    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(account.id)
    database.prepare('DELETE FROM otp_challenges WHERE user_id = ?').run(account.id)
  })

  return { email: account.email }
}
