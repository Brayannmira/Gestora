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

const priorities = new Set(['urgente', 'importante', 'normal'])
const statuses = new Set(['pendiente', 'en-proceso', 'completada', 'cancelada'])
const approvalStatuses = new Set(['pendiente', 'aprobada', 'rechazada'])

function parsePageValue(value, label, fallback, maximum = Number.MAX_SAFE_INTEGER) {
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

function parseDateBoundary(value, label) {
  if (value === undefined) return undefined
  const parsedDate = typeof value === 'string'
    ? new Date(value)
    : null
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString() !== value
  ) {
    throw new HttpError(400, `${label} debe ser una fecha válida.`)
  }
  return value
}

router.get('/', requireAuth, (request, response, next) => {
  try {
    const page = parsePageValue(request.query.page, 'La página', 1)
    const pageSize = parsePageValue(request.query.pageSize, 'El tamaño de página', 20, 50)
    const status = request.query.status === 'todas' ? undefined : request.query.status
    const approvalStatus = request.query.approvalStatus === 'todas'
      ? undefined
      : request.query.approvalStatus
    const priority = request.query.priority === 'todas' ? undefined : request.query.priority
    const rawSearch = request.query.search === undefined ? '' : request.query.search
    const dateFrom = parseDateBoundary(request.query.dateFrom, 'La fecha inicial')
    const dateTo = parseDateBoundary(request.query.dateTo, 'La fecha final')
    if (dateFrom && dateTo && dateFrom >= dateTo) {
      throw new HttpError(400, 'La fecha inicial debe ser anterior a la fecha final.')
    }
    if (status !== undefined && !statuses.has(status)) {
      throw new HttpError(400, 'Estado de solicitud inválido.')
    }
    if (approvalStatus !== undefined && !approvalStatuses.has(approvalStatus)) {
      throw new HttpError(400, 'Estado de aprobación inválido.')
    }
    if (priority !== undefined && !priorities.has(priority)) {
      throw new HttpError(400, 'Prioridad inválida.')
    }
    if (typeof rawSearch !== 'string' || rawSearch.length > 100) {
      throw new HttpError(400, 'La búsqueda no debe exceder 100 caracteres.')
    }
    const search = rawSearch.trim()

    const result = requestsService.listRequests({
      organizationId: request.user.organization_id,
      userId: request.user.role === 'EMPLOYEE' ? request.user.id : null,
      branchId: request.user.role === 'EMPLOYEE' ? request.user.branch_id : null,
      page,
      pageSize,
      status,
      approvalStatus,
      priority,
      search,
      dateFrom,
      dateTo,
    })
    response.json({
      requests: result.requests.map(serializeRequest),
      pagination: result.pagination,
      filterCounts: {
        all: result.filterCounts.all_count,
        urgent: result.filterCounts.urgent,
        inProgress: result.filterCounts.in_progress,
        awaitingApproval: result.filterCounts.awaiting_approval,
      },
    })
  } catch (error) {
    next(error)
  }
})

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
      actor: request.user,
    })
    response.status(201).json({ request: serializeRequest(created) })
  } catch (error) {
    next(error)
  }
})

router.patch('/:requestId/approval', requireAuth, requireManager, (request, response, next) => {
  try {
    const approved = requestsService.updateApproval({
      requestId: request.params.requestId,
      actor: request.user,
      approvalStatus: request.body?.approvalStatus,
    })
    response.json({ request: serializeRequest(approved) })
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
    requestsService.deleteRequest(request.params.requestId, request.user)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
