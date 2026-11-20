import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'

const priorities = ['urgente', 'importante', 'normal']
const statuses = ['pendiente', 'en-proceso', 'completada', 'cancelada']

export function createRequestsService({
  requests,
  inventory,
  transaction,
  audit,
  notifications,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function listRequests({
    organizationId,
    userId,
    branchId,
    page,
    pageSize,
    status,
    approvalStatus,
    priority,
    search,
    dateFrom,
    dateTo,
  }) {
    const filters = {
      organizationId,
      userId,
      branchId,
      status,
      approvalStatus,
      priority,
      search,
      dateFrom,
      dateTo,
    }
    const total = requests.count(filters)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    return {
      requests: requests.findPage({
        ...filters,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      }),
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
      filterCounts: requests.getFilterCounts({
        organizationId,
        userId,
        branchId,
        search,
        dateFrom,
        dateTo,
      }),
    }
  }

  function createRequest({ title, description, productId, quantity, priority, actor }) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'La cantidad debe ser un entero mayor que cero.')
    }
    if (!priorities.includes(priority)) {
      throw new HttpError(400, 'Prioridad inválida.')
    }

    const product = inventory.findById(
      productId,
      actor.organization_id,
      actor.role === 'EMPLOYEE' ? actor.branch_id : undefined,
    )
    if (!product) throw new HttpError(404, 'No se encontró el producto.')

    const request = {
      id: createId(),
      title,
      description,
      priority,
      status: 'pendiente',
      approval_status: 'pendiente',
      product_id: product.id,
      product_name: product.name,
      branch_id: product.branch_id,
      branch_name: product.branch_name,
      quantity,
      stock_deducted: 0,
      created_by: actor.id,
      created_at: now(),
      completed_at: null,
    }
    transaction(() => {
      requests.create({
        ...request,
        product,
        createdBy: actor.id,
        organizationId: actor.organization_id,
        branchId: product.branch_id,
        createdAt: request.created_at,
      })
      audit.record({
        actor,
        action: 'request.created',
        entityType: 'request',
        entityId: request.id,
        details: { priority, quantity },
      })
    })
    notifications.notifyManagers({
      organizationId: actor.organization_id,
      branchId: product.branch_id,
      type: 'request_created',
      title: 'Nueva solicitud pendiente',
      message: 'Hay una solicitud pendiente de revisión en Gestora.',
      entityType: 'request',
      entityId: request.id,
    })
    return request
  }

  function updateRequest({ requestId, user, status, priority }) {
    const result = transaction(() => {
      const organizationId = user.organization_id
      const current = requests.findById(
        requestId,
        organizationId,
        user.role === 'EMPLOYEE' ? user.branch_id : undefined,
      )
      if (!current) throw new HttpError(404, 'No se encontró la solicitud.')
      const isOwner = current.created_by === user.id

      if (user.role === 'EMPLOYEE') {
        if (!isOwner || status !== 'cancelada' || priority !== undefined) {
          throw new HttpError(403, 'Solo puedes cancelar tus propias solicitudes activas.')
        }
      } else if (status !== undefined && !statuses.includes(status)) {
        throw new HttpError(400, 'Estado inválido.')
      }

      if (status === undefined && priority === undefined) {
        throw new HttpError(400, 'Indica un estado o prioridad para actualizar.')
      }
      if (current.status === 'cancelada' && status && status !== 'cancelada') {
        throw new HttpError(409, 'Una solicitud cancelada no se puede reabrir.')
      }
      if (current.status === 'completada' && status && status !== 'completada') {
        throw new HttpError(409, 'Una solicitud completada no se puede reabrir.')
      }
      if (
        ['en-proceso', 'completada'].includes(status) &&
        current.approval_status !== 'aprobada'
      ) {
        throw new HttpError(409, 'La solicitud debe ser aprobada antes de procesarla.')
      }
      if (status === 'cancelada' && (current.status === 'completada' || current.stock_deducted)) {
        throw new HttpError(409, 'Una solicitud que consumió stock no se puede cancelar. Registra un movimiento de entrada si corresponde.')
      }
      if (priority !== undefined && !priorities.includes(priority)) {
        throw new HttpError(400, 'Prioridad inválida.')
      }

      let product
      let stockBefore
      if (status === 'completada' && current.status !== 'completada' && !current.stock_deducted) {
        product = inventory.findById(current.product_id, organizationId)
        if (!product || product.stock < current.quantity) {
          throw new HttpError(409, `Stock insuficiente: se necesitan ${current.quantity} y hay ${product?.stock ?? 0}.`)
        }

        stockBefore = product.stock
        const newStock = product.stock - current.quantity
        inventory.updateStock(product.id, organizationId, newStock)
        inventory.insertMovement({
          product,
          type: 'salida',
          quantity: current.quantity,
          previousStock: product.stock,
          newStock,
          reason: `Consumo de solicitud: ${current.title}`,
          requestId: current.id,
          actorId: user.id,
          organizationId,
        })
        audit.record({
          actor: user,
          action: 'inventory.movement_recorded',
          entityType: 'product',
          entityId: product.id,
          details: {
            type: 'salida',
            quantity: current.quantity,
            previousStock: product.stock,
            newStock,
          },
        })
        requests.markCompleted(current.id, organizationId, now(), priority)
      } else {
        requests.updateStatusAndPriority(current.id, organizationId, status, priority, {
          userId: user.role === 'EMPLOYEE' ? user.id : undefined,
          branchId: user.role === 'EMPLOYEE' ? user.branch_id : undefined,
        })
      }

      const updated = requests.findById(
        current.id,
        organizationId,
        user.role === 'EMPLOYEE' ? user.branch_id : undefined,
      )
      product = inventory.findById(updated.product_id, organizationId)
      const changes = {}
      if (current.status !== updated.status) {
        changes.status = { from: current.status, to: updated.status }
      }
      if (current.priority !== updated.priority) {
        changes.priority = { from: current.priority, to: updated.priority }
      }
      if (Object.keys(changes).length > 0) {
        audit.record({
          actor: user,
          action: 'request.updated',
          entityType: 'request',
          entityId: current.id,
          details: changes,
        })
      }
      const alreadyConsumed = Boolean(current.stock_deducted)
      const notice = status === 'completada' && updated.stock_deducted
        ? alreadyConsumed
          ? 'Solicitud completada de nuevo; no se volvió a descontar stock.'
          : product.stock <= product.minimum_stock
            ? `Solicitud completada. Quedan ${product.stock} unidades de ${product.name}, en o bajo el mínimo (${product.minimum_stock}).`
            : `Solicitud completada. Stock de ${product.name}: ${product.stock}.`
        : null
      return { updated, product, alreadyConsumed, stockBefore, notice }
    })
    if (
      status === 'completada' &&
      !result.alreadyConsumed &&
      result.product.stock <= result.product.minimum_stock &&
      (
        result.stockBefore > result.product.minimum_stock ||
        (result.product.stock === 0 && result.stockBefore > 0)
      )
    ) {
      notifications.notifyManagers({
        organizationId: user.organization_id,
        branchId: result.product.branch_id,
        type: 'low_stock',
        title: 'Alerta de inventario',
        message: 'Un producto de una sucursal alcanzó su mínimo o se agotó.',
        entityType: 'product',
        entityId: result.product.id,
      })
    }
    return result
  }

  function updateApproval({ requestId, actor, approvalStatus }) {
    if (actor.role === 'EMPLOYEE') {
      throw new HttpError(403, 'Solo un administrador puede revisar solicitudes.')
    }
    if (!['aprobada', 'rechazada'].includes(approvalStatus)) {
      throw new HttpError(400, 'La decisión debe ser aprobar o rechazar.')
    }
    const updated = transaction(() => {
      const current = requests.findById(requestId, actor.organization_id)
      if (!current) throw new HttpError(404, 'No se encontró la solicitud.')
      if (current.approval_status !== 'pendiente') {
        throw new HttpError(409, 'La solicitud ya fue revisada.')
      }
      if (current.status === 'cancelada' || current.status === 'completada') {
        throw new HttpError(409, 'No se puede revisar una solicitud cancelada o completada.')
      }
      const result = requests.updateApprovalStatus(
        requestId,
        actor.organization_id,
        approvalStatus,
        actor.id,
        now(),
      )
      if (result.changes !== 1) {
        throw new HttpError(409, 'La solicitud ya fue revisada.')
      }
      audit.record({
        actor,
        action: approvalStatus === 'aprobada' ? 'request.approved' : 'request.rejected',
        entityType: 'request',
        entityId: requestId,
      })
      return requests.findById(requestId, actor.organization_id)
    })
    notifications.notifyUser({
      recipientId: updated.created_by,
      organizationId: actor.organization_id,
      branchId: updated.branch_id,
      type: `request_${approvalStatus}`,
      title: approvalStatus === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      message: approvalStatus === 'aprobada'
        ? 'Tu solicitud fue aprobada y puede continuar al procesamiento.'
        : 'Tu solicitud fue rechazada. Consulta con un administrador si necesitas más información.',
      entityType: 'request',
      entityId: updated.id,
    })
    return updated
  }

  function deleteRequest(requestId, actor) {
    return transaction(() => {
      const result = requests.deleteActive(requestId, actor.organization_id)
      if (result.changes === 0) {
        throw new HttpError(409, 'Solo se pueden borrar solicitudes activas que no hayan consumido stock.')
      }
      audit.record({
        actor,
        action: 'request.deleted',
        entityType: 'request',
        entityId: requestId,
      })
    })
  }

  return { listRequests, createRequest, updateRequest, updateApproval, deleteRequest }
}
