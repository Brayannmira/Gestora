import { db, transaction } from './database.js'
import { createOrganizationsRepository } from './repositories/organizationsRepository.js'

if (!process.argv.includes('--confirm')) {
  process.stderr.write('La purga es irreversible. Repite con --confirm para borrar empresas vencidas.\n')
  process.exitCode = 1
} else {
  const organizations = createOrganizationsRepository(db)
  const due = organizations.listDueClosures(new Date().toISOString())
  for (const organization of due) {
    transaction(() => organizations.purgeOrganization(organization.id))
  }
  process.stdout.write(`Empresas eliminadas: ${due.length}.\n`)
}

db.close()
