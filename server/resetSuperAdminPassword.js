import { createTransaction } from './database/transaction.js'

export async function resetSuperAdminPassword({
  database,
  password,
  hashPassword,
  organizationId = 'default-organization',
  email,
}) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('La contraseña debe tener entre 12 y 256 caracteres.')
  }

  const account = email
    ? database.prepare(`
      SELECT id, email, organization_id FROM users
      WHERE role = 'SUPER_ADMIN' AND is_active = 1 AND email = ?
    `).get(email.trim().toLowerCase())
    : database.prepare(`
      SELECT id, email, organization_id FROM users
      WHERE role = 'SUPER_ADMIN' AND is_active = 1 AND organization_id = ?
    `).get(organizationId)
  if (!account) {
    throw new Error('No se encontró una cuenta activa de superadministrador.')
  }

  const passwordHash = await hashPassword(password)
  const transaction = createTransaction(database)
  transaction(() => {
    const result = database.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = 0
      WHERE id = ? AND role = 'SUPER_ADMIN' AND is_active = 1 AND organization_id = ?
    `).run(passwordHash, account.id, account.organization_id)
    if (result.changes !== 1) {
      throw new Error('La cuenta de superadministrador cambió durante el restablecimiento.')
    }

    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(account.id)
    database.prepare('DELETE FROM otp_challenges WHERE user_id = ?').run(account.id)
  })

  return { email: account.email }
}
