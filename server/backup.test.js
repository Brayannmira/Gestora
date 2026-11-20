import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

describe('copias de seguridad y restauración SQLite', () => {
  let directory
  let database
  let databasePath
  let createBackup
  let restoreBackup
  let originalEnvironment

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'gestora-backup-'))
    const environmentKeys = ['NODE_ENV', 'DB_FILE', 'SESSION_SECRET', 'APP_ORIGIN']
    originalEnvironment = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]]),
    )
    process.env.NODE_ENV = 'test'
    process.env.DB_FILE = path.join(directory, 'active.sqlite')
    process.env.SESSION_SECRET = 'test-backup-session-secret-long-enough'
    process.env.APP_ORIGIN = 'http://frontend.example.test'
    vi.resetModules()

    const [databaseModule, backupModule, restoreModule] = await Promise.all([
      import('./database.js'),
      import('./backup.js'),
      import('./restore.js'),
    ])
    database = databaseModule.db
    databasePath = databaseModule.databasePath
    createBackup = backupModule.createBackup
    restoreBackup = restoreModule.restoreBackup
    database.prepare(`
      INSERT INTO users
        (id, email, name, password_hash, role, organization_id, created_at)
      VALUES ('backup-user', 'backup@example.test', 'Backup User', 'test-hash', 'SUPER_ADMIN', ?, ?)
    `).run(databaseModule.defaultOrganizationId, new Date().toISOString())
    database.prepare(`
      INSERT INTO products
        (id, name, stock, minimum_stock, organization_id, branch_id, created_by, created_at)
      VALUES ('backup-product', 'Producto guardado', 7, 2, ?, ?, 'backup-user', ?)
    `).run(
      databaseModule.defaultOrganizationId,
      database.prepare('SELECT id FROM branches WHERE organization_id = ?')
        .get(databaseModule.defaultOrganizationId).id,
      new Date().toISOString(),
    )
  })

  afterEach(async () => {
    if (database?.isOpen) database.close()
    await rm(directory, { recursive: true, force: true })
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('crea y verifica una copia consistente mientras la base está abierta', async () => {
    const destination = path.join(directory, 'nested', 'backup.sqlite')
    const result = await createBackup(destination)
    expect(result).toBe(destination)

    const backupDatabase = new DatabaseSync(destination, { readOnly: true })
    try {
      expect(backupDatabase.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
      expect(backupDatabase.prepare('SELECT stock FROM products WHERE id = ?')
        .get('backup-product').stock).toBe(7)
    } finally {
      backupDatabase.close()
    }
  })

  it('rechaza sobrescribir la base activa o un archivo existente', async () => {
    await expect(createBackup(databasePath)).rejects.toThrow('no puede sobrescribir')
    const destination = path.join(directory, 'already-exists.sqlite')
    writeFileSync(destination, 'preserve this file')
    await expect(createBackup(destination)).rejects.toThrow('El archivo ya existe')
    expect(await readFile(destination, 'utf8')).toBe('preserve this file')
  })

  it('no publica archivos parciales si falla el renombrado atómico', async () => {
    const destination = path.join(directory, 'backup.sqlite')
    await expect(createBackup(destination, {
      renameFile() {
        throw new Error('Fallo de publicación simulado.')
      },
    })).rejects.toThrow('Fallo de publicación simulado')
    expect(existsSync(destination)).toBe(false)
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('rechaza una base corrupta sin cerrar ni alterar la base activa', async () => {
    const corruptPath = path.join(directory, 'corrupt.sqlite')
    writeFileSync(corruptPath, 'esto no es una base SQLite')
    await expect(restoreBackup(corruptPath)).rejects.toThrow()
    expect(database.isOpen).toBe(true)
    expect(database.prepare('SELECT stock FROM products WHERE id = ?')
      .get('backup-product').stock).toBe(7)

    const incompatiblePath = path.join(directory, 'incompatible.sqlite')
    const incompatibleDatabase = new DatabaseSync(incompatiblePath)
    incompatibleDatabase.close()
    await expect(restoreBackup(incompatiblePath)).rejects.toThrow('esquema de base de datos esperado')
    expect(database.isOpen).toBe(true)
  })

  it('restaura los datos y conserva una copia de seguridad de la base anterior', async () => {
    const sourcePath = path.join(directory, 'source.sqlite')
    await createBackup(sourcePath)
    database.prepare('UPDATE products SET name = ? WHERE id = ?')
      .run('Estado actual', 'backup-product')

    const result = await restoreBackup(sourcePath)
    expect(existsSync(result.safetyPath)).toBe(true)

    const restoredDatabase = new DatabaseSync(databasePath, { readOnly: true })
    const safetyDatabase = new DatabaseSync(result.safetyPath, { readOnly: true })
    try {
      expect(restoredDatabase.prepare('SELECT name FROM products WHERE id = ?')
        .get('backup-product').name).toBe('Producto guardado')
      expect(safetyDatabase.prepare('SELECT name FROM products WHERE id = ?')
        .get('backup-product').name).toBe('Estado actual')
    } finally {
      restoredDatabase.close()
      safetyDatabase.close()
    }
  })

  it('recupera la base anterior si falla la sustitución', async () => {
    const sourcePath = path.join(directory, 'source.sqlite')
    await createBackup(sourcePath)
    database.prepare('UPDATE products SET name = ? WHERE id = ?')
      .run('Estado que debe recuperarse', 'backup-product')
    let injectedFailure = false
    const renameWithFailure = (from, to) => {
      if (!injectedFailure && to === databasePath) {
        injectedFailure = true
        throw new Error('Fallo de sustitución simulado.')
      }
      renameSync(from, to)
    }

    await expect(restoreBackup(sourcePath, { renameFile: renameWithFailure }))
      .rejects.toThrow('Fallo de sustitución simulado')
    expect(injectedFailure).toBe(true)
    const recoveredDatabase = new DatabaseSync(databasePath, { readOnly: true })
    try {
      expect(recoveredDatabase.prepare('SELECT name FROM products WHERE id = ?')
        .get('backup-product').name).toBe('Estado que debe recuperarse')
    } finally {
      recoveredDatabase.close()
    }
  })
})
