import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'
import { enforcePlanLimit } from '../plans.js'

export function createProductsService({
  inventory,
  organizations,
  transaction,
  audit,
  notifications,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function createProduct({ name, stock, minimumStock, barcode, branchId, actor }) {
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
      barcode: barcode || null,
    }
    const assignedBranchId = branchId || inventory.findDefaultBranchId(actor.organization_id)
    if (!assignedBranchId || !inventory.findBranch(assignedBranchId, actor.organization_id)) {
      throw new HttpError(404, 'No se encontró la sucursal de este producto.')
    }
    if (
      product.barcode &&
      inventory.barcodeExists(actor.organization_id, assignedBranchId, product.barcode)
    ) {
      throw new HttpError(409, 'Ya existe un producto con ese código en esta sucursal.')
    }
    product.branch_id = assignedBranchId
    transaction(() => {
      const subscription = organizations.getSubscription(actor.organization_id)
      if (!subscription || subscription.status === 'expired' || subscription.status === 'suspended') {
        throw new HttpError(403, 'El plan de esta empresa no permite crear productos.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'products',
        count: inventory.countProducts(actor.organization_id),
      })
      inventory.insertProduct({
        ...product,
        branchId: assignedBranchId,
        actorId: actor.id,
        organizationId: actor.organization_id,
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
          actorId: actor.id,
          organizationId: actor.organization_id,
        })
      }
      audit.record({
        actor,
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        details: { initialStock: stock, minimumStock },
      })
    })
    if (stock <= minimumStock) {
      notifications.notifyManagers({
        organizationId: actor.organization_id,
        branchId: assignedBranchId,
        type: 'low_stock',
        title: 'Producto con stock bajo',
        message: 'Un producto nuevo se registró en o bajo su stock mínimo.',
        entityType: 'product',
        entityId: product.id,
      })
    }
    return inventory.findById(product.id, actor.organization_id)
  }

  function registerMovement({ productId, type, quantity, reason, actor }) {
    const result = transaction(() => {
      const organizationId = actor.organization_id
      const product = inventory.findById(productId, organizationId)
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
        actorId: actor.id,
        organizationId,
      })
      inventory.updateStock(product.id, organizationId, newStock)
      audit.record({
        actor,
        action: 'inventory.movement_recorded',
        entityType: 'product',
        entityId: product.id,
        details: { type, quantity, previousStock: product.stock, newStock },
      })
      return {
        product: inventory.findById(product.id, organizationId),
        movement: inventory.findMovementById(movementId, organizationId),
      }
    })
    const product = result.product
    if (
      product.stock <= product.minimum_stock &&
      (result.movement.previous_stock > product.minimum_stock ||
        (product.stock === 0 && result.movement.previous_stock > 0))
    ) {
      notifications.notifyManagers({
        organizationId: actor.organization_id,
        branchId: product.branch_id,
        type: 'low_stock',
        title: 'Alerta de inventario',
        message: 'Un producto de una sucursal alcanzó su mínimo o se agotó.',
        entityType: 'product',
        entityId: product.id,
      })
    }
    return result
  }

  function deleteProduct(productId, actor) {
    return transaction(() => {
      if (
        inventory.hasRequests(productId, actor.organization_id) ||
        inventory.hasMovements(productId, actor.organization_id)
      ) {
        throw new HttpError(409, 'No se puede borrar un producto con historial.')
      }
      const result = inventory.deleteById(productId, actor.organization_id)
      if (result.changes === 0) throw new HttpError(404, 'No se encontró el producto.')
      audit.record({
        actor,
        action: 'product.deleted',
        entityType: 'product',
        entityId: productId,
      })
    })
  }

  return { createProduct, registerMovement, deleteProduct }
}
