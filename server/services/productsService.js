import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'

export function createProductsService({
  inventory,
  transaction,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function createProduct({ name, stock, minimumStock, actorId }) {
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      !Number.isSafeInteger(minimumStock) ||
      minimumStock < 0
    ) {
      throw new HttpError(400, 'El stock y el mínimo deben ser enteros no negativos.')
    }

    const product = {
      id: createId(),
      name,
      stock,
      minimumStock,
    }
    transaction(() => {
      inventory.insertProduct({
        ...product,
        actorId,
        createdAt: now(),
      })
      if (stock > 0) {
        inventory.insertMovement({
          product,
          type: 'ajuste',
          quantity: stock,
          previousStock: 0,
          newStock: stock,
          reason: 'Stock inicial',
          actorId,
        })
      }
    })
    return inventory.findById(product.id)
  }

  function registerMovement({ productId, type, quantity, reason, actorId }) {
    return transaction(() => {
      const product = inventory.findById(productId)
      if (!product) throw new HttpError(404, 'No se encontró el producto.')
      if (!['entrada', 'salida', 'ajuste'].includes(type)) {
        throw new HttpError(400, 'Tipo de movimiento inválido.')
      }
      if (!Number.isSafeInteger(quantity) || quantity < 0 || (type !== 'ajuste' && quantity === 0)) {
        throw new HttpError(400, 'La cantidad debe ser un entero válido.')
      }

      const newStock = type === 'entrada'
        ? product.stock + quantity
        : type === 'salida'
          ? product.stock - quantity
          : quantity
      if (!Number.isSafeInteger(newStock) || newStock < 0) {
        throw new HttpError(409, 'El movimiento dejaría el stock en un valor inválido o negativo.')
      }
      if (newStock === product.stock) {
        throw new HttpError(400, 'El movimiento no cambia el stock.')
      }

      const movementId = inventory.insertMovement({
        product,
        type,
        quantity,
        previousStock: product.stock,
        newStock,
        reason,
        actorId,
      })
      inventory.updateStock(product.id, newStock)
      return {
        product: inventory.findById(product.id),
        movement: inventory.findMovementById(movementId),
      }
    })
  }

  function deleteProduct(productId) {
    if (inventory.hasRequests(productId) || inventory.hasMovements(productId)) {
      throw new HttpError(409, 'No se puede borrar un producto con historial.')
    }
    const result = inventory.deleteById(productId)
    if (result.changes === 0) throw new HttpError(404, 'No se encontró el producto.')
  }

  return { createProduct, registerMovement, deleteProduct }
}
