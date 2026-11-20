import { db, transaction } from './database.js'
import { PLANS } from './plans.js'
import { createOrganizationsRepository } from './repositories/organizationsRepository.js'

const [organizationId, planKey] = process.argv.slice(2)
if (!organizationId || !Object.hasOwn(PLANS, planKey)) {
  process.stderr.write('Uso: npm run plan:set -- <organization-id> <prueba|empresa>\n')
  process.exitCode = 1
} else {
  const organizations = createOrganizationsRepository(db)
  const organization = organizations.getOrganization(organizationId)
  if (!organization) {
    process.stderr.write('No se encontró la empresa indicada.\n')
    process.exitCode = 1
  } else {
    const updatedAt = new Date().toISOString()
    const trialEndsAt = planKey === 'prueba'
      ? new Date(Date.parse(updatedAt) + PLANS.prueba.trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null
    transaction(() => {
      organizations.setSubscription({
        organizationId,
        planKey,
        status: planKey === 'prueba' ? 'trial' : 'active',
        trialEndsAt,
        updatedAt,
      })
    })
    process.stdout.write(`Plan ${PLANS[planKey].name} asignado a ${organization.name}.\n`)
  }
}

db.close()
