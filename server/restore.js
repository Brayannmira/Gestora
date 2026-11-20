import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, realpathSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { databasePath, db } from './database.js'
import { assertDatabaseIntegrity, createVerifiedBackup } from './database/backupFile.js'

export async function restoreBackup(sourcePath, { renameFile = renameSync } = {}) {
  const inputPath = path.resolve(sourcePath)
  const normalizePath = (value) => process.platform === 'win32'
    ? path.resolve(value).toLocaleLowerCase('en-US')
    : path.resolve(value)
  if (
    normalizePath(inputPath) === normalizePath(databasePath) ||
    (existsSync(inputPath) && existsSync(databasePath) &&
      normalizePath(realpathSync(inputPath)) === normalizePath(realpathSync(databasePath)))
  ) {
    throw new Error('Selecciona un archivo de respaldo distinto a la base activa.')
  }
  if (!existsSync(inputPath)) throw new Error(`No se encontró el archivo de respaldo: ${inputPath}`)

  const source = new DatabaseSync(inputPath, { readOnly: true })
  const suffix = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
  const temporaryPath = `${databasePath}.${suffix}.restore`
  const safetyPath = `${databasePath}.${suffix}.before-restore`
  const originalPath = `${databasePath}.restore-source-${suffix}`
  let originalMoved = false
  let sourceOpen = true
  let restoreCommitted = false
  try {
    assertDatabaseIntegrity(source)
    await createVerifiedBackup(source, temporaryPath, { renameFile })
    await createVerifiedBackup(db, safetyPath, { renameFile })
    source.close()
    sourceOpen = false
    db.close()
    for (const suffixName of ['-wal', '-shm']) {
      const sidecar = `${databasePath}${suffixName}`
      if (existsSync(sidecar)) rmSync(sidecar)
    }

    renameFile(databasePath, originalPath)
    originalMoved = true
    renameFile(temporaryPath, databasePath)
    if (process.platform !== 'win32') chmodSync(databasePath, 0o600)
    const restored = new DatabaseSync(databasePath, { readOnly: true })
    try {
      assertDatabaseIntegrity(restored)
    } finally {
      restored.close()
    }
    restoreCommitted = true

    let cleanupWarning
    try {
      rmSync(originalPath)
    } catch (error) {
      cleanupWarning = `No se pudo eliminar la copia temporal ${originalPath}: ${error.message}`
    }
    return { safetyPath, cleanupWarning }
  } catch (error) {
    if (!restoreCommitted && originalMoved) {
      try {
        if (existsSync(databasePath)) rmSync(databasePath)
        renameFile(originalPath, databasePath)
        originalMoved = false
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `La restauración falló y no se pudo recuperar la base anterior. Está conservada en ${originalPath}.`,
          { cause: rollbackError },
        )
      }
    }
    throw error
  } finally {
    if (sourceOpen) source.close()
    if (existsSync(temporaryPath)) rmSync(temporaryPath)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    process.stderr.write('Uso: npm run db:restore -- <ruta-al-respaldo.sqlite>\n')
    process.exitCode = 1
  } else {
    restoreBackup(process.argv[2])
      .then(({ safetyPath, cleanupWarning }) => {
        process.stdout.write(`Base restaurada. Respaldo anterior: ${safetyPath}\n`)
        if (cleanupWarning) process.stderr.write(`Advertencia: ${cleanupWarning}\n`)
      })
      .catch((error) => {
        process.stderr.write(`No se pudo restaurar: ${error.message}\n`)
        process.exitCode = 1
      })
  }
}
