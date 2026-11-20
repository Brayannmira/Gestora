import express from 'express'
import { organizationsService } from '../container.js'
import { asyncRoute, HttpError, requireAuth, requireSuperAdmin, requireText } from '../shared/http.js'

const router = express.Router()

router.post('/', requireAuth, requireSuperAdmin, asyncRoute(async (request, response) => {
  const name = requireText(request.body?.name, 'El nombre de la empresa', 100)
  const ownerName = requireText(request.body?.ownerName, 'El nombre del superadministrador', 100)
  const email = requireText(request.body?.email, 'El correo', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Escribe un correo electrónico válido.')
  }

  const result = await organizationsService.createOrganization({
    name,
    ownerName,
    email,
    actor: request.user,
  })
  response.status(201).json(result)
}))

router.get('/subscription', requireAuth, requireSuperAdmin, (request, response) => {
  response.json(organizationsService.getCurrentSubscription(request.user))
})

router.get('/export', requireAuth, requireSuperAdmin, (request, response) => {
  const data = organizationsService.exportOrganization(request.user)
  response.setHeader('Content-Disposition', 'attachment; filename="gestora-export.json"')
  response.type('application/json').send(JSON.stringify(data, null, 2))
})

router.post('/closure', requireAuth, requireSuperAdmin, (request, response) => {
  response.json(organizationsService.requestClosure(request.user))
})

router.post('/cancel-closure', requireAuth, requireSuperAdmin, (request, response) => {
  response.json(organizationsService.cancelClosure(request.user))
})

router.post('/test-email', requireAuth, requireSuperAdmin, asyncRoute(async (request, response) => {
  await organizationsService.sendTestEmail(request.user)
  response.status(204).end()
}))

export default router
