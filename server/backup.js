import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { databasePath, db } from './database.js'
import { createVerifiedBackup } from './database/backupFile.js'

export async function createBackup(destination, options) {
  const outputPath = path.resolve(destination)
  const normalizePath = (value) => process.platform === 'win32'
    ? path.resolve(value).toLocaleLowerCase('en-US')
    : path.resolve(value)
  if (
    normalizePath(outputPath) === normalizePath(databasePath) ||
    (existsSync(outputPath) && existsSync(databasePath) &&
      normalizePath(realpathSync(outputPath)) === normalizePath(realpathSync(databasePath)))
  ) {
    throw new Error('El respaldo no puede sobrescribir la base activa.')
  }
  return createVerifiedBackup(db, outputPath, options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const timestamp = new Date().toISOString().replaceAll(':', '-')
  const destination = process.argv[2] ?? path.join(process.cwd(), 'backups', `gestora-${timestamp}.sqlite`)
  createBackup(destination)
    .then((outputPath) => process.stdout.write(`Respaldo verificado: ${outputPath}\n`))
    .catch((error) => {
      process.stderr.write(`No se pudo crear el respaldo: ${error.message}\n`)
      process.exitCode = 1
    })
}
