import express from 'express'
import { notificationsService } from '../container.js'
import { HttpError, requireAuth } from '../shared/http.js'

const router = express.Router()

router.get('/', requireAuth, (request, response) => {
  const notifications = notificationsService.list(request.user).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    readAt: notification.read_at,
    createdAt: notification.created_at,
  }))
  response.json({ notifications })
})

router.patch('/read-all', requireAuth, (request, response) => {
  response.json({ updated: notificationsService.markAllRead(request.user) })
})

router.patch('/:notificationId/read', requireAuth, (request, response, next) => {
  try {
    if (!notificationsService.markRead(request.params.notificationId, request.user)) {
      throw new HttpError(404, 'No se encontró una notificación pendiente.')
    }
    response.json({ read: true })
  } catch (error) {
    next(error)
  }
})

export default router
