import express from 'express'
import { invitationsService, usersService } from '../container.js'
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
  const result = usersService.listAccounts({
    organizationId: request.user.organization_id,
  })
  response.json({
    users: result.users.map((user) => ({
      ...serializeUser(user),
      isActive: Boolean(user.is_active),
      createdAt: user.created_at,
    })),
    limits: result.limits,
  })
})

router.post('/invitations', requireAuth, requireSuperAdmin, asyncRoute(async (request, response) => {
  const email = requireText(request.body?.email, 'El correo', 254).toLowerCase()
  const name = requireText(request.body?.name, 'El nombre', 100)
  const role = request.body?.role
  const branchId = role === 'EMPLOYEE' && request.body?.branchId !== undefined
    ? requireText(request.body.branchId, 'La sucursal', 64)
    : undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Escribe un correo electrónico válido.')
  }
  const invitation = await invitationsService.create({
    email,
    name,
    role,
    branchId,
    actor: request.user,
  })
  response.status(201).json({ invitation })
}))

router.get('/invitations', requireAuth, requireSuperAdmin, (request, response) => {
  response.json({ invitations: invitationsService.list(request.user) })
})

router.delete('/invitations/:invitationId', requireAuth, requireSuperAdmin, (request, response, next) => {
  try {
    invitationsService.cancel({
      invitationId: request.params.invitationId,
      actor: request.user,
    })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.patch('/:userId/branch', requireAuth, requireSuperAdmin, (request, response, next) => {
  try {
    const branchId = requireText(request.body?.branchId, 'La sucursal', 64)
    response.json(usersService.setAccountBranch({
      targetId: request.params.userId,
      branchId,
      actor: request.user,
    }))
  } catch (error) {
    next(error)
  }
})

router.patch('/:userId', requireAuth, requireSuperAdmin, (request, response, next) => {
  try {
    const isActive = request.body?.isActive
    if (typeof isActive !== 'boolean') {
      throw new HttpError(400, 'Indica si la cuenta debe estar activa.')
    }
    const result = usersService.setAccountActive({
      targetId: request.params.userId,
      actor: request.user,
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
    actor: request.user,
    temporaryPassword,
  })
  response.status(204).end()
}))

export default router
