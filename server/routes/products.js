import express from 'express'
import { productsService } from '../container.js'
import {
  requireAuth,
  requireManager,
  requireText,
  serializeMovement,
  serializeProduct,
} from '../shared/http.js'

const router = express.Router()

router.post('/', requireAuth, requireManager, (request, response, next) => {
  try {
    const name = requireText(request.body?.name, 'El nombre', 100)
    const product = productsService.createProduct({
      name,
      stock: request.body?.stock,
      minimumStock: request.body?.minimumStock,
      actorId: request.user.id,
    })
    response.status(201).json({ product: serializeProduct(product) })
  } catch (error) {
    next(error)
  }
})

router.post('/:productId/movements', requireAuth, requireManager, (request, response, next) => {
  try {
    const reason = requireText(request.body?.reason, 'El motivo', 250)
    const result = productsService.registerMovement({
      productId: request.params.productId,
      type: request.body?.type,
      quantity: request.body?.quantity,
      reason,
      actorId: request.user.id,
    })
    response.status(201).json({
      product: serializeProduct(result.product),
      movement: serializeMovement(result.movement),
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/:productId', requireAuth, requireManager, (request, response, next) => {
  try {
    productsService.deleteProduct(request.params.productId)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
