import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'
import { enforcePlanLimit } from '../plans.js'

const invitationLifetimeMs = 48 * 60 * 60 * 1000

export function createInvitationsService({
  invitations,
  users,
  organizations,
  transaction,
  security,
  hashPassword,
  sendInvitation,
  audit,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function list(actor) {
    return invitations.list(actor.organization_id, now())
  }

  async function create({ email, name, role, branchId, actor }) {
    if (!['EMPLOYEE', 'ADMIN'].includes(role)) {
      throw new HttpError(400, 'El rol de invitación no es válido.')
    }
    const subscription = organizations.getSubscription(actor.organization_id)
    if (!subscription || subscription.status === 'expired' || subscription.status === 'suspended') {
      throw new HttpError(403, 'El plan de esta empresa no permite invitar usuarios.')
    }
    const invitationId = createId()
    const token = security.createSessionToken()
    const tokenHash = security.hashSessionToken(token)
    const createdAt = now()
    const expiresAt = new Date(Date.parse(createdAt) + invitationLifetimeMs).toISOString()
    const branch = role === 'EMPLOYEE'
      ? users.findBranch(branchId || users.findDefaultBranchId(actor.organization_id), actor.organization_id)
      : null
    if (role === 'EMPLOYEE' && !branch) {
      throw new HttpError(404, 'No se encontró la sucursal del empleado.')
    }

    transaction(() => {
      invitations.cancelExpiredForEmail(email, createdAt)
      if (users.emailExists(email) || invitations.pendingEmailExists(email, createdAt)) {
        throw new HttpError(409, 'Ya existe una cuenta o una invitación pendiente con ese correo.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'users',
        count: users.countActiveUsers(actor.organization_id) +
          invitations.countPending(actor.organization_id, createdAt),
      })
      if (role === 'ADMIN' && users.countActiveAdmins(actor.organization_id) +
        invitations.countPendingAdmins(actor.organization_id, createdAt) >= 2) {
        throw new HttpError(409, 'El límite de administradores activos o invitados ya se alcanzó.')
      }
      invitations.create({
        id: invitationId,
        organizationId: actor.organization_id,
        branchId: branch?.id ?? null,
        createdBy: actor.id,
        email,
        name,
        role,
        tokenHash,
        expiresAt,
        createdAt,
      })
    })

    try {
      await sendInvitation(email, name, actor.organization_name, token)
    } catch (error) {
      transaction(() => invitations.cancel(invitationId, actor.organization_id, now()))
      process.stderr.write('[Gestora] No se pudo enviar un correo de invitación.\n')
      if (error instanceof Error && error.message.startsWith('Configura SMTP_')) {
        throw new HttpError(503, 'El correo no está configurado. No se creó la invitación.')
      }
      throw new HttpError(503, 'No se pudo enviar la invitación. Inténtalo más tarde.')
    }
    audit.record({
      actor,
      action: 'user.invited',
      entityType: 'invitation',
      entityId: invitationId,
      details: { role, branchId: branch?.id ?? null },
    })
    return { id: invitationId, email, name, role, expiresAt }
  }

  function cancel({ invitationId, actor }) {
    return transaction(() => {
      const result = invitations.cancel(invitationId, actor.organization_id, now())
      if (result.changes !== 1) throw new HttpError(404, 'No se encontró una invitación pendiente.')
      audit.record({
        actor,
        action: 'user.invitation_cancelled',
        entityType: 'invitation',
        entityId: invitationId,
      })
    })
  }

  function preview(token) {
    const invitation = invitations.findByTokenHash(security.hashSessionToken(token))
    if (
      !invitation ||
      invitation.organization_status !== 'active' ||
      Date.parse(invitation.expires_at) <= Date.parse(now())
    ) {
      throw new HttpError(404, 'La invitación es inválida o venció.')
    }
    return {
      email: invitation.email,
      name: invitation.name,
      organizationName: invitation.organization_name,
      role: invitation.role,
    }
  }

  async function accept({ token, password }) {
    if (password.length < 12) {
      throw new HttpError(400, 'La contraseña debe tener al menos 12 caracteres.')
    }
    const tokenHash = security.hashSessionToken(token)
    const passwordHash = await hashPassword(password)
    const createdUser = transaction(() => {
      const invitation = invitations.findByTokenHash(tokenHash)
      if (
        !invitation ||
        invitation.organization_status !== 'active' ||
        Date.parse(invitation.expires_at) <= Date.parse(now())
      ) {
        throw new HttpError(400, 'La invitación es inválida o venció.')
      }
      const subscription = organizations.getSubscription(invitation.organization_id)
      if (
        !subscription ||
        subscription.status === 'expired' ||
        subscription.status === 'suspended' ||
        (subscription.status === 'trial' &&
          Date.parse(subscription.trial_ends_at) <= Date.parse(now()))
      ) {
        throw new HttpError(403, 'El acceso de esta empresa está suspendido o venció su prueba.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'users',
        count: users.countActiveUsers(invitation.organization_id) +
          invitations.countPending(invitation.organization_id, now()) - 1,
      })
      if (invitation.role === 'ADMIN' &&
        users.countActiveAdmins(invitation.organization_id) +
        invitations.countPendingAdmins(invitation.organization_id, now()) - 1 >= 2) {
        throw new HttpError(409, 'El límite de administradores activos ya se alcanzó.')
      }
      const consumed = invitations.accept(invitation.id, tokenHash, now())
      if (consumed.changes !== 1) throw new HttpError(400, 'La invitación ya fue utilizada o venció.')
      const id = createId()
      users.createUser({
        id,
        email: invitation.email,
        name: invitation.name,
        passwordHash,
        role: invitation.role,
        organizationId: invitation.organization_id,
        branchId: invitation.branch_id,
        mustChangePassword: 0,
        createdAt: now(),
      })
      const user = {
        id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        organization_id: invitation.organization_id,
        organization_name: invitation.organization_name,
        branch_id: invitation.branch_id,
        branch_name: invitation.branch_name,
        must_change_password: 0,
      }
      audit.record({
        actor: user,
        action: 'user.invitation_accepted',
        entityType: 'user',
        entityId: id,
      })
      return user
    })
    return createdUser
  }

  return { list, create, cancel, preview, accept }
}
