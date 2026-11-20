import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'

const sessionLifetimeMs = 12 * 60 * 60 * 1000
const otpLifetimeMs = 5 * 60 * 1000
const otpResendDelayMs = 30 * 1000

export function createAuthService({
  repository,
  transaction,
  security,
  sendOtp,
  nowMs = () => Date.now(),
  now = () => new Date().toISOString(),
  createId = randomUUID,
}) {
  async function login({ email, password }) {
    const user = repository.findActiveUserByEmail(email)
    if (!(await security.verifyPassword(password, user?.password_hash))) {
      throw new HttpError(401, 'Correo o contraseña incorrectos.')
    }

    const id = createId()
    const code = security.createOtpCode()
    const currentTime = nowMs()
    transaction(() => {
      repository.deleteOtpChallengesByUser(user.id)
      repository.createOtpChallenge({
        id,
        userId: user.id,
        codeHash: security.hashOtp(id, code),
        expiresAt: currentTime + otpLifetimeMs,
        resendAfter: currentTime + otpResendDelayMs,
        createdAt: now(),
      })
    })

    try {
      await sendOtp(user.email, code)
    } catch (error) {
      repository.deleteOtpChallenge(id)
      throw new HttpError(503, error.message)
    }

    return {
      challengeId: id,
      email: user.email,
      expiresIn: otpLifetimeMs / 1000,
      resendIn: otpResendDelayMs / 1000,
    }
  }

  async function resendOtp(challengeId) {
    const challenge = repository.findOtpChallengeWithEmail(challengeId)
    const currentTime = nowMs()
    if (!challenge || challenge.expires_at <= currentTime || challenge.attempts >= 5) {
      throw new HttpError(400, 'La solicitud OTP venció. Inicia sesión nuevamente.')
    }
    if (challenge.resend_after > currentTime) {
      throw new HttpError(429, 'Espera antes de solicitar otro código.')
    }

    const code = security.createOtpCode()
    repository.updateOtpChallenge({
      id: challengeId,
      codeHash: security.hashOtp(challengeId, code),
      expiresAt: currentTime + otpLifetimeMs,
      resendAfter: currentTime + otpResendDelayMs,
    })

    try {
      await sendOtp(challenge.email, code)
    } catch (error) {
      throw new HttpError(503, error.message)
    }

    return { expiresIn: otpLifetimeMs / 1000, resendIn: otpResendDelayMs / 1000 }
  }

  function verifyOtp({ challengeId, code }) {
    const challenge = repository.findOtpChallenge(challengeId)
    const currentTime = nowMs()
    if (!challenge || challenge.expires_at <= currentTime || challenge.attempts >= 5) {
      throw new HttpError(401, 'Código inválido o vencido.')
    }
    if (
      !/^\d{6}$/.test(code) ||
      !security.safeEqual(security.hashOtp(challengeId, code), challenge.code_hash)
    ) {
      repository.incrementOtpAttempts(challengeId)
      throw new HttpError(401, 'Código inválido o vencido.')
    }

    const token = security.createSessionToken()
    const expiresAt = currentTime + sessionLifetimeMs
    const user = transaction(() => {
      const consumed = repository.consumeOtpChallenge(
        challengeId,
        security.hashOtp(challengeId, code),
        currentTime,
      )
      if (consumed.changes !== 1) throw new HttpError(401, 'Código inválido o vencido.')
      const authenticatedUser = repository.findActiveUserById(challenge.user_id)
      if (!authenticatedUser) throw new HttpError(401, 'La cuenta está inactiva.')
      repository.deleteOtpChallengesByUser(authenticatedUser.id)
      repository.deleteSessionsByUser(authenticatedUser.id)
      repository.createSession({
        tokenHash: security.hashSessionToken(token),
        userId: authenticatedUser.id,
        expiresAt,
        createdAt: now(),
      })
      return authenticatedUser
    })

    return { user, token, expiresAt }
  }

  async function changePassword({ user, currentPassword, newPassword }) {
    if (newPassword.length < 12) {
      throw new HttpError(400, 'La nueva contraseña debe tener al menos 12 caracteres.')
    }
    if (newPassword === currentPassword) {
      throw new HttpError(400, 'La nueva contraseña debe ser distinta de la temporal.')
    }
    const account = repository.findActivePasswordRecord(user.id)
    if (!account || !(await security.verifyPassword(currentPassword, account.password_hash))) {
      throw new HttpError(401, 'La contraseña temporal es incorrecta.')
    }

    const passwordHash = await security.hashPassword(newPassword)
    const result = repository.updatePasswordForTemporarySession(user.id, passwordHash)
    if (result.changes !== 1) {
      throw new HttpError(409, 'La contraseña ya fue actualizada o la cuenta no está disponible.')
    }
    return { ...user, must_change_password: 0 }
  }

  function logout(tokenHash) {
    repository.deleteSession(tokenHash)
  }

  return { login, resendOtp, verifyOtp, changePassword, logout }
}
