import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'

const priorities = ['urgente', 'importante', 'normal']
const statuses = ['pendiente', 'en-proceso', 'completada', 'cancelada']

export function createRequestsService({
  requests,
  inventory,
  transaction,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function createRequest({ title, description, productId, quantity, priority, createdBy }) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'La cantidad debe ser un entero mayor que cero.')
    }
    if (!priorities.includes(priority)) {
      throw new HttpError(400, 'Prioridad inválida.')
    }

    const product = inventory.findById(productId)
    if (!product) throw new HttpError(404, 'No se encontró el producto.')

    const request = {
      id: createId(),
      title,
      description,
      priority,
      status: 'pendiente',
      product_id: product.id,
      product_name: product.name,
      quantity,
      stock_deducted: 0,
      created_by: createdBy,
      created_at: now(),
      completed_at: null,
    }
    requests.create({
      ...request,
      product,
      createdBy,
      createdAt: request.created_at,
    })
    return request
  }

  function updateRequest({ requestId, user, status, priority }) {
    return transaction(() => {
      const current = requests.findById(requestId)
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
      if (status === 'cancelada' && (current.status === 'completada' || current.stock_deducted)) {
        throw new HttpError(409, 'Una solicitud que consumió stock no se puede cancelar. Registra un movimiento de entrada si corresponde.')
      }
      if (priority !== undefined && !priorities.includes(priority)) {
        throw new HttpError(400, 'Prioridad inválida.')
      }

      let product
      if (status === 'completada' && current.status !== 'completada' && !current.stock_deducted) {
        product = inventory.findById(current.product_id)
        if (!product || product.stock < current.quantity) {
          throw new HttpError(409, `Stock insuficiente: se necesitan ${current.quantity} y hay ${product?.stock ?? 0}.`)
        }

        const newStock = product.stock - current.quantity
        inventory.updateStock(product.id, newStock)
        inventory.insertMovement({
          product,
          type: 'salida',
          quantity: current.quantity,
          previousStock: product.stock,
          newStock,
          reason: `Consumo de solicitud: ${current.title}`,
          requestId: current.id,
          actorId: user.id,
        })
        requests.markCompleted(current.id, now(), priority)
      } else {
        requests.updateStatusAndPriority(current.id, status, priority)
      }

      const updated = requests.findById(current.id)
      product = inventory.findById(updated.product_id)
      const alreadyConsumed = Boolean(current.stock_deducted)
      const notice = status === 'completada' && updated.stock_deducted
        ? alreadyConsumed
          ? 'Solicitud completada de nuevo; no se volvió a descontar stock.'
          : product.stock <= product.minimum_stock
            ? `Solicitud completada. Quedan ${product.stock} unidades de ${product.name}, en o bajo el mínimo (${product.minimum_stock}).`
            : `Solicitud completada. Stock de ${product.name}: ${product.stock}.`
        : null
      return { updated, product, alreadyConsumed, notice }
    })
  }

  function deleteRequest(requestId) {
    const result = requests.deleteActive(requestId)
    if (result.changes === 0) {
      throw new HttpError(409, 'Solo se pueden borrar solicitudes activas que no hayan consumido stock.')
    }
  }

  return { createRequest, updateRequest, deleteRequest }
}
