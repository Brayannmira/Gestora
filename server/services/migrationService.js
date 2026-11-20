import { HttpError } from '../shared/errors.js'
import { isInteger, isUuid } from '../shared/validation.js'
import { enforcePlanLimit } from '../plans.js'

const priorities = ['urgente', 'importante', 'normal']
const statuses = ['pendiente', 'en-proceso', 'completada', 'cancelada']

export function createMigrationService({
  repository,
  inventory,
  organizations,
  transaction,
  audit,
  now = () => new Date().toISOString(),
}) {
  function importLocal({ products, requests, actor }) {
    const actorId = actor.id
    if (
      !Array.isArray(products) ||
      !Array.isArray(requests) ||
      products.length > 1000 ||
      requests.length > 5000
    ) {
      throw new HttpError(400, 'La copia local no tiene un formato válido.')
    }

    transaction(() => {
      if (repository.hasProductsOrRequests(actor.organization_id)) {
        throw new HttpError(409, 'La importación solo se permite cuando la base de datos está vacía.')
      }
      const subscription = organizations.getSubscription(actor.organization_id)
      if (!subscription || ['expired', 'suspended'].includes(subscription.status)) {
        throw new HttpError(403, 'El plan de esta empresa no permite importar productos.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'products',
        count: products.length,
      })

      const productsById = new Map()
      for (const product of products) {
        if (
          !isUuid(product.id) ||
          typeof product.name !== 'string' ||
          !product.name.trim() ||
          !isInteger(product.stock) ||
          product.stock < 0 ||
          !isInteger(product.minimumStock) ||
          product.minimumStock < 0 ||
          productsById.has(product.id)
        ) {
          throw new HttpError(400, 'La copia local contiene un producto inválido.')
        }

        const normalizedProduct = {
          id: product.id,
          name: product.name.trim().slice(0, 100),
          stock: product.stock,
          minimumStock: product.minimumStock,
          branch_id: inventory.findDefaultBranchId(actor.organization_id),
          barcode: null,
        }
        productsById.set(product.id, normalizedProduct)
        repository.insertImportedProduct({
          ...normalizedProduct,
          createdBy: actorId,
          organizationId: actor.organization_id,
          branchId: normalizedProduct.branch_id,
          createdAt: now(),
        })
        if (product.stock > 0) {
          inventory.insertMovement({
            product: normalizedProduct,
            type: 'ajuste',
            quantity: product.stock,
            previousStock: 0,
            newStock: product.stock,
            reason: 'Saldo importado del navegador; historial previo no disponible.',
            actorId,
            organizationId: actor.organization_id,
          })
        }
      }

      for (const item of requests) {
        if (
          !isUuid(item.id) ||
          typeof item.title !== 'string' ||
          !item.title.trim() ||
          !productsById.has(item.productId) ||
          !isInteger(item.quantity) ||
          item.quantity < 1 ||
          !priorities.includes(item.priority) ||
          !statuses.includes(item.status)
        ) {
          throw new HttpError(400, 'La copia local contiene una solicitud inválida o sin producto.')
        }

        const product = productsById.get(item.productId)
        const stockDeducted = Boolean(item.stockDeducted)
        repository.insertImportedRequest({
          id: item.id,
          title: item.title.trim().slice(0, 100),
          description: typeof item.description === 'string' ? item.description.slice(0, 500) : '',
          priority: item.priority,
          status: item.status === 'completada' && !stockDeducted ? 'pendiente' : item.status,
          product,
          quantity: item.quantity,
          stockDeducted,
          createdBy: actorId,
          organizationId: actor.organization_id,
          branchId: product.branch_id,
          createdAt: now(),
        })
      }
      audit.record({
        actor,
        action: 'data.legacy_imported',
        entityType: 'migration',
        details: {
          importedProducts: products.length,
          importedRequests: requests.length,
        },
      })
    })

    return {
      importedProducts: products.length,
      importedRequests: requests.length,
      note: 'El stock actual se importó como saldo inicial; los movimientos anteriores no se pueden reconstruir.',
    }
  }

  return { importLocal }
}
