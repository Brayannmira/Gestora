import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { authService, invitationsService } from '../container.js'
import {
  asyncRoute,
  clearSessionCookie,
  HttpError,
  requireAuth,
  requireText,
  serializeUser,
  setSessionCookie,
} from '../shared/http.js'

const router = express.Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})
const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', loginLimiter, asyncRoute(async (request, response) => {
  const email = requireText(request.body?.email, 'El correo', 254).toLowerCase()
  const password = requireText(request.body?.password, 'La contraseña', 256)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.')
  }
  const challenge = await authService.login({ email, password })
  response.status(202).json(challenge)
}))

router.post('/resend-otp', otpLimiter, asyncRoute(async (request, response) => {
  const challengeId = requireText(request.body?.challengeId, 'La solicitud OTP', 64)
  response.json(await authService.resendOtp(challengeId))
}))

router.post('/verify-otp', otpLimiter, (request, response, next) => {
  try {
    const challengeId = requireText(request.body?.challengeId, 'La solicitud OTP', 64)
    const code = requireText(request.body?.code, 'El código', 6)
    const result = authService.verifyOtp({ challengeId, code })
    setSessionCookie(response, result.token, result.expiresAt)
    response.json({ user: serializeUser(result.user) })
  } catch (error) {
    next(error)
  }
})

router.get('/me', requireAuth, (request, response) => {
  response.json({ user: serializeUser(request.user) })
})

router.post('/logout', requireAuth, (request, response) => {
  authService.logout(request.user.token_hash)
  clearSessionCookie(response)
  response.status(204).end()
})

router.post('/change-password', requireAuth, asyncRoute(async (request, response) => {
  const currentPassword = requireText(request.body?.currentPassword, 'La contraseña temporal', 256)
  const newPassword = requireText(request.body?.newPassword, 'La nueva contraseña', 256)
  const user = await authService.changePassword({
    user: request.user,
    currentPassword,
    newPassword,
  })
  response.json({ user: serializeUser(user) })
}))

router.post('/password-reset/request', recoveryLimiter, asyncRoute(async (request, response) => {
  const email = requireText(request.body?.email, 'El correo', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Escribe un correo electrónico válido.')
  }
  await authService.requestPasswordReset(email)
  response.status(202).json({
    message: 'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.',
  })
}))

router.post('/password-reset/validate', recoveryLimiter, (request, response) => {
  const token = request.body?.token
  const valid = typeof token === 'string' &&
    token.length > 0 &&
    token.length <= 128 &&
    authService.isPasswordResetTokenValid(token)
  response.json({ valid })
})

router.post('/password-reset/complete', recoveryLimiter, asyncRoute(async (request, response) => {
  const token = requireText(request.body?.token, 'El enlace de recuperación', 128)
  const newPassword = requireText(request.body?.newPassword, 'La nueva contraseña', 256)
  await authService.completePasswordReset({ token, newPassword })
  response.status(204).end()
}))

router.post('/invitations/preview', invitationLimiter, (request, response, next) => {
  try {
    const token = requireText(request.body?.token, 'La invitación', 128)
    response.json({ invitation: invitationsService.preview(token) })
  } catch (error) {
    next(error)
  }
})

router.post('/invitations/accept', invitationLimiter, asyncRoute(async (request, response) => {
  const token = requireText(request.body?.token, 'La invitación', 128)
  const password = requireText(request.body?.password, 'La contraseña', 256)
  const user = await invitationsService.accept({ token, password })
  response.status(201).json({ user: serializeUser(user) })
}))

export default router
