import express from 'express'
import { requestsService } from '../container.js'
import {
  HttpError,
  isInteger,
  requireAuth,
  requireManager,
  requireText,
  serializeProduct,
  serializeRequest,
} from '../shared/http.js'

const router = express.Router()

router.post('/', requireAuth, (request, response, next) => {
  try {
    const title = requireText(request.body?.title, 'El título', 100)
    const description = typeof request.body?.description === 'string'
      ? request.body.description.trim().slice(0, 500)
      : ''
    const productId = requireText(request.body?.productId, 'El producto', 64)
    const { quantity, priority } = request.body ?? {}
    if (!isInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'La cantidad debe ser un entero mayor que cero.')
    }

    const created = requestsService.createRequest({
      title,
      description,
      productId,
      quantity,
      priority,
      createdBy: request.user.id,
    })
    response.status(201).json({ request: serializeRequest(created) })
  } catch (error) {
    next(error)
  }
})

router.patch('/:requestId', requireAuth, (request, response, next) => {
  try {
    const result = requestsService.updateRequest({
      requestId: request.params.requestId,
      user: request.user,
      status: request.body?.status,
      priority: request.body?.priority,
    })
    response.json({
      request: serializeRequest(result.updated),
      product: serializeProduct(result.product),
      notice: result.notice,
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/:requestId', requireAuth, requireManager, (request, response, next) => {
  try {
    requestsService.deleteRequest(request.params.requestId)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
