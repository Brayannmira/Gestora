import express from 'express'
import { auditService } from '../container.js'
import { HttpError, requireAuth, requireManager } from '../shared/http.js'

const router = express.Router()

function parsePageValue(value, label, fallback, maximum) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${label} debe ser un entero positivo.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new HttpError(400, `${label} no puede ser mayor que ${maximum}.`)
  }
  return parsed
}

router.get('/', requireAuth, requireManager, (request, response, next) => {
  try {
    const result = auditService.list({
      organizationId: request.user.organization_id,
      page: parsePageValue(request.query.page, 'La página', 1, Number.MAX_SAFE_INTEGER),
      pageSize: parsePageValue(request.query.pageSize, 'El tamaño de página', 20, 50),
    })
    response.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
