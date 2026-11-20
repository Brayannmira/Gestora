import express from 'express'
import { usersService } from '../container.js'
import {
  asyncRoute,
  HttpError,
  requireAuth,
  requireSuperAdmin,
  requireText,
  serializeUser,
} from '../shared/http.js'

const router = express.Router()

router.get('/', requireAuth, requireSuperAdmin, (request, response) => {
  const result = usersService.listAccounts()
  response.json({
    users: result.users.map((user) => ({
      ...serializeUser(user),
      isActive: Boolean(user.is_active),
      createdAt: user.created_at,
    })),
    limits: result.limits,
  })
})

router.post('/', requireAuth, requireSuperAdmin, asyncRoute(async (request, response) => {
  const email = requireText(request.body?.email, 'El correo', 254).toLowerCase()
  const name = requireText(request.body?.name, 'El nombre', 100)
  const password = requireText(request.body?.password, 'La contraseña', 256)
  const role = request.body?.role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Escribe un correo electrónico válido.')
  }
  if (password.length < 12) {
    throw new HttpError(400, 'La contraseña debe tener al menos 12 caracteres.')
  }

  const user = await usersService.createAccount({ email, name, password, role })
  response.status(201).json({ user: serializeUser(user) })
}))

router.patch('/:userId', requireAuth, requireSuperAdmin, (request, response, next) => {
  try {
    const isActive = request.body?.isActive
    if (typeof isActive !== 'boolean') {
      throw new HttpError(400, 'Indica si la cuenta debe estar activa.')
    }
    const result = usersService.setAccountActive({
      targetId: request.params.userId,
      actorId: request.user.id,
      isActive,
    })
    response.json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/:userId/reset-password', requireAuth, requireSuperAdmin, asyncRoute(async (request, response) => {
  const temporaryPassword = requireText(request.body?.temporaryPassword, 'La contraseña temporal', 256)
  if (temporaryPassword.length < 12) {
    throw new HttpError(400, 'La contraseña temporal debe tener al menos 12 caracteres.')
  }
  await usersService.resetPassword({
    targetId: request.params.userId,
    actorId: request.user.id,
    temporaryPassword,
  })
  response.status(204).end()
}))

export default router
