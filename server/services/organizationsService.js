import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'
import { getPlanLimits } from '../plans.js'

export function createOrganizationsService({
  organizations,
  branches,
  users,
  invitations,
  inventory,
  transaction,
  security,
  audit,
  sendTestEmail: sendTestEmailMessage,
  sendInvitation,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  async function createOrganization({ name, ownerName, email, actor }) {
    if (organizations.findByName(name)) {
      throw new HttpError(409, 'Ya existe una empresa con ese nombre.')
    }

    const organizationId = createId()
    const branchId = createId()
    const invitationId = createId()
    const token = security.createSessionToken()
    const tokenHash = security.hashSessionToken(token)
    const createdAt = now()
    const trialEndsAt = new Date(
      Date.parse(createdAt) + getPlanLimits('prueba').trialDays * 24 * 60 * 60 * 1000,
    ).toISOString()

    transaction(() => {
      invitations.cancelExpiredForEmail(email, createdAt)
      if (users.emailExists(email) || invitations.pendingEmailExists(email, createdAt)) {
        throw new HttpError(409, 'Ya existe una cuenta o una invitación pendiente con ese correo.')
      }
      organizations.create({ id: organizationId, name, createdAt })
      organizations.createSubscription({
        organizationId,
        planKey: 'prueba',
        status: 'trial',
        trialEndsAt,
        updatedAt: createdAt,
      })
      branches.create({
        id: branchId,
        organizationId,
        name: 'Principal',
        createdAt,
      })
      invitations.create({
        id: invitationId,
        organizationId,
        branchId: null,
        createdBy: actor.id,
        email,
        name: ownerName,
        role: 'SUPER_ADMIN',
        tokenHash,
        expiresAt: new Date(Date.parse(createdAt) + 48 * 60 * 60 * 1000).toISOString(),
        createdAt,
      })
    })

    try {
      await sendInvitation(email, ownerName, name, token)
    } catch (error) {
      transaction(() => organizations.deleteOrganization(organizationId))
      process.stderr.write('[Gestora] No se pudo enviar la invitación de una empresa.\n')
      if (!(error instanceof Error)) throw error
      throw new HttpError(503, 'No se pudo enviar la invitación. La empresa no fue creada.')
    }

    audit.record({
      actor,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organizationId,
      details: { name },
    })
    return {
      organization: {
        id: organizationId,
        name,
        planKey: 'prueba',
        subscriptionStatus: 'trial',
        trialEndsAt,
      },
      invitation: { email, expiresAt: new Date(Date.parse(createdAt) + 48 * 60 * 60 * 1000).toISOString() },
    }
  }

  function getCurrentSubscription(actor) {
    const organization = organizations.getOrganization(actor.organization_id)
    const subscription = organizations.getSubscription(actor.organization_id)
    if (!organization || !subscription) {
      throw new HttpError(404, 'No se encontró la empresa o su plan.')
    }
    const effectiveStatus = subscription.status === 'trial' &&
      Date.parse(subscription.trial_ends_at) <= Date.parse(now())
      ? 'expired'
      : subscription.status
    const plan = getPlanLimits(subscription.plan_key)
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        status: organization.status,
        deletionRequestedAt: organization.deletion_requested_at,
      },
      subscription: {
        planKey: subscription.plan_key,
        planName: plan.name,
        status: effectiveStatus,
        trialEndsAt: subscription.trial_ends_at,
        limits: {
          users: plan.maxUsers,
          branches: plan.maxBranches,
          products: plan.maxProducts,
        },
        usage: {
          users: users.countActiveUsers(actor.organization_id),
          pendingInvitations: invitations.countPending(actor.organization_id, now()),
          branches: branches.count(actor.organization_id),
          products: inventory.countProducts(actor.organization_id),
        },
      },
    }
  }

  function exportOrganization(actor) {
    return organizations.getExportData(actor.organization_id)
  }

  function requestClosure(actor) {
    const requestedAt = now()
    const purgeAfter = new Date(Date.parse(requestedAt) + 30 * 24 * 60 * 60 * 1000).toISOString()
    transaction(() => {
      const result = organizations.scheduleClosure(actor.organization_id, requestedAt)
      if (result.changes !== 1) {
        throw new HttpError(409, 'La empresa ya está cerrada o tiene una baja programada.')
      }
      audit.record({
        actor,
        action: 'organization.closure_requested',
        entityType: 'organization',
        entityId: actor.organization_id,
        details: { purgeAfter },
      })
    })
    return { status: 'closing', deletionRequestedAt: requestedAt, purgeAfter }
  }

  function cancelClosure(actor) {
    return transaction(() => {
      const result = organizations.cancelClosure(actor.organization_id)
      if (result.changes !== 1) {
        throw new HttpError(409, 'No hay una baja pendiente para cancelar.')
      }
      audit.record({
        actor,
        action: 'organization.closure_cancelled',
        entityType: 'organization',
        entityId: actor.organization_id,
      })
      return { status: 'active' }
    })
  }

  async function sendTestEmail(actor) {
    try {
      await sendTestEmailMessage(actor.email)
    } catch (error) {
      process.stderr.write('[Gestora] No se pudo enviar un correo de prueba.\n')
      if (!(error instanceof Error)) throw error
      throw new HttpError(503, 'No se pudo enviar el correo de prueba. Verifica la configuración SMTP.')
    }
  }

  function purgeDueOrganizations(cutoff) {
    const due = organizations.listDueClosures(cutoff)
    for (const organization of due) {
      transaction(() => organizations.purgeOrganization(organization.id))
    }
    return due.length
  }

  return {
    createOrganization,
    getCurrentSubscription,
    exportOrganization,
    requestClosure,
    cancelClosure,
    sendTestEmail,
    purgeDueOrganizations,
  }
}
