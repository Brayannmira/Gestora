import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'

const requiredColumns = {
  users: ['id', 'email', 'name', 'password_hash', 'role', 'created_at'],
  products: ['id', 'name', 'stock', 'minimum_stock', 'created_by', 'created_at'],
  requests: [
    'id',
    'title',
    'description',
    'priority',
    'status',
    'product_id',
    'product_name',
    'quantity',
    'stock_deducted',
    'created_by',
    'created_at',
  ],
  inventory_movements: [
    'id',
    'product_id',
    'product_name',
    'type',
    'quantity',
    'previous_stock',
    'new_stock',
    'delta',
    'reason',
    'request_id',
    'actor_id',
    'created_at',
  ],
}
const tenantColumns = {
  users: ['organization_id'],
  products: ['organization_id'],
  requests: ['organization_id'],
  inventory_movements: ['organization_id'],
  audit_events: ['organization_id'],
}

export function assertDatabaseIntegrity(database) {
  const result = database.prepare('PRAGMA integrity_check').get()
  if (result.integrity_check !== 'ok') {
    throw new Error('La verificación de integridad del respaldo falló.')
  }

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const tableColumns = new Set(
      database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name),
    )
    if (!columns.every((column) => tableColumns.has(column))) {
      throw new Error('El archivo no tiene el esquema de base de datos esperado por Gestora.')
    }
  }

  const organizationsTableExists = Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'organizations'
  `).get())
  const anyTenantColumnExists = Object.keys(tenantColumns).some((table) => (
    database.prepare(`PRAGMA table_info(${table})`).all()
      .some((column) => column.name === 'organization_id')
  ))
  if (organizationsTableExists || anyTenantColumnExists) {
    if (!organizationsTableExists) {
      throw new Error('El respaldo tiene un esquema multiempresa incompleto.')
    }
    const organizationTableColumns = new Set(
      database.prepare('PRAGMA table_info(organizations)').all().map((column) => column.name),
    )
    if (!['id', 'name', 'created_at'].every((column) => organizationTableColumns.has(column))) {
      throw new Error('El respaldo tiene un esquema multiempresa incompleto.')
    }
    for (const [table, columns] of Object.entries(tenantColumns)) {
      const tableColumns = new Set(
        database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name),
      )
      if (!columns.every((column) => tableColumns.has(column))) {
        throw new Error('El respaldo tiene un esquema multiempresa incompleto.')
      }
    }
  }

  if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
    throw new Error('La base seleccionada contiene referencias de datos inválidas.')
  }
}

export async function createVerifiedBackup(database, destination, { renameFile = renameSync } = {}) {
  const outputPath = path.resolve(destination)
  if (existsSync(outputPath)) throw new Error(`El archivo ya existe: ${outputPath}`)
  mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 })
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.tmp`,
  )

  try {
    await backup(database, temporaryPath)
    chmodSync(temporaryPath, 0o600)
    const verificationDatabase = new DatabaseSync(temporaryPath, { readOnly: true })
    try {
      assertDatabaseIntegrity(verificationDatabase)
    } finally {
      verificationDatabase.close()
    }
    renameFile(temporaryPath, outputPath)
    return outputPath
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) rmSync(temporaryPath)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `No se pudo completar ni limpiar el respaldo temporal ${temporaryPath}.`,
        { cause: cleanupError },
      )
    }
    throw error
  }
}
