import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, defaultOrganizationId } from './database.js'
import { hashPassword } from './security.js'

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

if (!email || !name || !password || password.length < 12) {
  throw new Error(
    'Define BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME y BOOTSTRAP_ADMIN_PASSWORD (12 caracteres mínimo) en .env.',
  )
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL debe ser un correo válido.')
}
if (db.prepare(
  "SELECT 1 FROM users WHERE role = 'SUPER_ADMIN' AND organization_id = ?",
).get(defaultOrganizationId)) {
  throw new Error('Ya existe un superadministrador; no se puede crear otro.')
}

db.prepare(`
  INSERT INTO users
    (id, email, name, password_hash, role, organization_id, created_at)
  VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, ?)
`).run(
  randomUUID(),
  email,
  name,
  await hashPassword(password),
  defaultOrganizationId,
  new Date().toISOString(),
)

process.stderr.write(`Superadministrador creado para ${email}.\n`)
