import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'
import { enforcePlanLimit } from '../plans.js'

export function createUsersService({
  repository,
  organizations,
  invitations,
  transaction,
  hashPassword,
  audit,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function listAccounts({ organizationId }) {
    const limits = repository.getLimits(organizationId)
    const subscription = organizations.getSubscription(organizationId)
    return {
      users: repository.listUsers(organizationId),
      limits: {
        ...limits,
        maxAdmins: 2,
        maxSuperAdmins: 1,
        planKey: subscription.plan_key,
        planStatus: subscription.status,
        maxUsers: subscription.plan_key === 'prueba' ? 5 : 25,
        pendingInvitations: invitations.countPending(organizationId, now()),
      },
    }
  }

  async function createAccount({ email, name, password, role, branchId, actor }) {
    if (!['EMPLOYEE', 'ADMIN'].includes(role)) {
      throw new HttpError(400, 'Desde el panel solo se pueden crear empleados o administradores.')
    }
    const id = createId()
    const passwordHash = await hashPassword(password)
    const assignedBranch = role === 'EMPLOYEE'
      ? repository.findBranch(
        branchId || repository.findDefaultBranchId(actor.organization_id),
        actor.organization_id,
      )
      : null
    if (role === 'EMPLOYEE' && !assignedBranch) {
      throw new HttpError(404, 'No se encontró la sucursal del empleado.')
    }
    transaction(() => {
      const subscription = organizations.getSubscription(actor.organization_id)
      if (!subscription || subscription.status === 'expired' || subscription.status === 'suspended') {
        throw new HttpError(403, 'El plan de esta empresa no permite crear usuarios.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'users',
        count: repository.countActiveUsers(actor.organization_id) +
          invitations.countPending(actor.organization_id, now()),
      })
      if (role === 'ADMIN' && repository.countActiveAdmins(actor.organization_id) >= 2) {
        throw new HttpError(409, 'Ya existen los dos administradores permitidos.')
      }
      repository.createUser({
        id,
        email,
        name,
        passwordHash,
        role,
        organizationId: actor.organization_id,
        branchId: assignedBranch?.id ?? null,
        createdAt: now(),
      })
      audit.record({
        actor,
        action: 'user.created',
        entityType: 'user',
        entityId: id,
        details: { role, branchId: assignedBranch?.id ?? null },
      })
    })
    return {
      id,
      email,
      name,
      role,
      organization_id: actor.organization_id,
      organization_name: actor.organization_name,
      branch_id: assignedBranch?.id ?? null,
      branch_name: assignedBranch?.name ?? null,
      must_change_password: 1,
    }
  }

  function setAccountBranch({ targetId, branchId, actor }) {
    const branch = repository.findBranch(branchId, actor.organization_id)
    if (!branch) throw new HttpError(404, 'No se encontró la sucursal.')
    return transaction(() => {
      const target = repository.findAccount(targetId, actor.organization_id)
      if (!target) throw new HttpError(404, 'No se encontró la cuenta.')
      if (target.role !== 'EMPLOYEE') {
        throw new HttpError(409, 'Solo se puede asignar una sucursal a empleados.')
      }
      if (target.branch_id !== branch.id) {
        repository.updateBranch(target.id, actor.organization_id, branch.id)
        audit.record({
          actor,
          action: 'user.branch_changed',
          entityType: 'user',
          entityId: target.id,
          details: { branchId: branch.id },
        })
      }
      return { branchId: branch.id, branchName: branch.name }
    })
  }

  function setAccountActive({ targetId, actor, isActive }) {
    if (targetId === actor.id) {
      throw new HttpError(409, 'No puedes desactivar tu propia cuenta.')
    }

    return transaction(() => {
      const target = repository.findAccount(targetId, actor.organization_id)
      if (!target) throw new HttpError(404, 'No se encontró la cuenta.')
      if (target.role === 'SUPER_ADMIN') {
        throw new HttpError(409, 'La cuenta de superadministrador no se puede desactivar.')
      }
      repository.updateActive(target.id, actor.organization_id, isActive)
      if (!isActive) {
        repository.revokeSessions(target.id)
        repository.revokeOtpChallenges(target.id)
      }
      if (Boolean(target.is_active) !== isActive) {
        audit.record({
          actor,
          action: isActive ? 'user.activated' : 'user.deactivated',
          entityType: 'user',
          entityId: target.id,
          details: { role: target.role },
        })
      }
      return { isActive }
    })
  }

  async function resetPassword({ targetId, actor, temporaryPassword }) {
    if (targetId === actor.id) {
      throw new HttpError(409, 'Usa el cambio de contraseña de tu propia cuenta.')
    }
    const target = repository.findAccount(targetId, actor.organization_id)
    if (!target) throw new HttpError(404, 'No se encontró la cuenta.')
    if (target.role === 'SUPER_ADMIN' || !target.is_active) {
      throw new HttpError(409, 'Solo puedes restablecer la contraseña de una cuenta activa de empleado o administrador.')
    }

    const passwordHash = await hashPassword(temporaryPassword)
    transaction(() => {
      const current = repository.findAccount(targetId, actor.organization_id)
      if (!current) throw new HttpError(404, 'No se encontró la cuenta.')
      if (current.role === 'SUPER_ADMIN' || !current.is_active) {
        throw new HttpError(409, 'Solo puedes restablecer la contraseña de una cuenta activa de empleado o administrador.')
      }
      const update = repository.setTemporaryPassword(
        current.id,
        actor.organization_id,
        passwordHash,
      )
      if (update.changes !== 1) {
        throw new HttpError(409, 'No se pudo restablecer la contraseña de la cuenta.')
      }
      repository.revokeSessions(current.id)
      repository.revokeOtpChallenges(current.id)
      audit.record({
        actor,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: current.id,
      })
    })
  }

  return { listAccounts, createAccount, setAccountActive, setAccountBranch, resetPassword }
}
