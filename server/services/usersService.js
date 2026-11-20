import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'

export function createUsersService({
  repository,
  transaction,
  hashPassword,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function listAccounts() {
    const limits = repository.getLimits()
    return {
      users: repository.listUsers(),
      limits: {
        ...limits,
        maxAdmins: 2,
        maxSuperAdmins: 1,
      },
    }
  }

  async function createAccount({ email, name, password, role }) {
    if (!['EMPLOYEE', 'ADMIN'].includes(role)) {
      throw new HttpError(400, 'Desde el panel solo se pueden crear empleados o administradores.')
    }
    const id = createId()
    const passwordHash = await hashPassword(password)
    transaction(() => {
      if (role === 'ADMIN' && repository.countActiveAdmins() >= 2) {
        throw new HttpError(409, 'Ya existen los dos administradores permitidos.')
      }
      repository.createUser({
        id,
        email,
        name,
        passwordHash,
        role,
        createdAt: now(),
      })
    })
    return { id, email, name, role, must_change_password: 1 }
  }

  function setAccountActive({ targetId, actorId, isActive }) {
    if (targetId === actorId) {
      throw new HttpError(409, 'No puedes desactivar tu propia cuenta.')
    }

    return transaction(() => {
      const target = repository.findAccount(targetId)
      if (!target) throw new HttpError(404, 'No se encontró la cuenta.')
      if (target.role === 'SUPER_ADMIN') {
        throw new HttpError(409, 'La cuenta de superadministrador no se puede desactivar.')
      }
      repository.updateActive(target.id, isActive)
      if (!isActive) {
        repository.revokeSessions(target.id)
        repository.revokeOtpChallenges(target.id)
      }
      return { isActive }
    })
  }

  async function resetPassword({ targetId, actorId, temporaryPassword }) {
    if (targetId === actorId) {
      throw new HttpError(409, 'Usa el cambio de contraseña de tu propia cuenta.')
    }
    const target = repository.findAccount(targetId)
    if (!target) throw new HttpError(404, 'No se encontró la cuenta.')
    if (target.role === 'SUPER_ADMIN' || !target.is_active) {
      throw new HttpError(409, 'Solo puedes restablecer la contraseña de una cuenta activa de empleado o administrador.')
    }

    const passwordHash = await hashPassword(temporaryPassword)
    transaction(() => {
      repository.setTemporaryPassword(target.id, passwordHash)
      repository.revokeSessions(target.id)
      repository.revokeOtpChallenges(target.id)
    })
  }

  return { listAccounts, createAccount, setAccountActive, resetPassword }
}
