import express from 'express'
import { dataService, migrationService } from '../container.js'
import {
  requireAuth,
  requireManager,
  requireSuperAdmin,
  serializeMovement,
  serializeProduct,
  serializeRequest,
} from '../shared/http.js'

const router = express.Router()

router.get('/data', requireAuth, (request, response) => {
  const result = dataService.getData(request.user)
  response.json({
    products: result.products.map(serializeProduct),
    requests: result.requests.map(serializeRequest),
    movements: result.movements.map(serializeMovement),
  })
})

router.get('/reports', requireAuth, requireManager, (request, response, next) => {
  try {
    const result = dataService.getReports(request.query)
    response.json({
      ...result,
      completedRequests: result.completedRequests.map((item) => ({
        id: item.id,
        title: item.title,
        productName: item.product_name,
        quantity: item.quantity,
        completedAt: item.completed_at,
        requesterName: item.requester_name,
      })),
      lowStockProducts: result.lowStockProducts.map(serializeProduct),
      movements: result.movements.map(serializeMovement),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/migrate/local', requireAuth, requireSuperAdmin, (request, response, next) => {
  try {
    const result = migrationService.importLocal({
      products: request.body?.products,
      requests: request.body?.requests,
      actorId: request.user.id,
    })
    response.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

export default router
