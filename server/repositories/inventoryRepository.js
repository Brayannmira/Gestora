import { randomUUID } from 'node:crypto'

export function createInventoryRepository(database) {
  return {
    findById(id, organizationId, branchId) {
      const branchFilter = branchId ? 'AND products.branch_id = ?' : ''
      const values = branchId ? [id, organizationId, branchId] : [id, organizationId]
      return database.prepare(`
        SELECT products.*, branches.name AS branch_name
        FROM products
        LEFT JOIN branches ON branches.id = products.branch_id
        WHERE products.id = ? AND products.organization_id = ? ${branchFilter}
      `).get(...values)
    },

    findBranch(branchId, organizationId) {
      return database.prepare(
        'SELECT id FROM branches WHERE id = ? AND organization_id = ?',
      ).get(branchId, organizationId)
    },

    findDefaultBranchId(organizationId) {
      return database.prepare(`
        SELECT id FROM branches WHERE organization_id = ?
        ORDER BY created_at, id LIMIT 1
      `).get(organizationId)?.id
    },

    barcodeExists(organizationId, branchId, barcode) {
      return Boolean(database.prepare(`
        SELECT 1 FROM products
        WHERE organization_id = ? AND branch_id = ? AND barcode = ?
      `).get(organizationId, branchId, barcode))
    },

    countProducts(organizationId) {
      return database.prepare(
        'SELECT COUNT(*) AS count FROM products WHERE organization_id = ?',
      ).get(organizationId).count
    },

    insertProduct({
      id,
      name,
      stock,
      minimumStock,
      barcode,
      branchId,
      actorId,
      organizationId,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO products
          (id, name, stock, minimum_stock, organization_id, branch_id, barcode, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name,
        stock,
        minimumStock,
        organizationId,
        branchId,
        barcode,
        actorId,
        createdAt,
      )
    },

    updateStock(id, organizationId, stock) {
      database.prepare(
        'UPDATE products SET stock = ? WHERE id = ? AND organization_id = ?',
      ).run(stock, id, organizationId)
    },

    insertMovement({
      product,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      requestId = null,
      actorId,
      organizationId,
    }) {
      const id = randomUUID()
      database.prepare(`
        INSERT INTO inventory_movements
          (id, product_id, organization_id, branch_id, product_name, type, quantity, previous_stock, new_stock, delta, reason, request_id, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        product.id,
        organizationId,
        product.branch_id,
        product.name,
        type,
        quantity,
        previousStock,
        newStock,
        newStock - previousStock,
        reason,
        requestId,
        actorId,
        new Date().toISOString(),
      )
      return id
    },

    findMovementById(id, organizationId) {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name, branches.name AS branch_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        LEFT JOIN branches ON branches.id = inventory_movements.branch_id
        WHERE inventory_movements.id = ? AND inventory_movements.organization_id = ?
      `).get(id, organizationId)
    },

    hasRequests(productId, organizationId) {
      return Boolean(database.prepare(
        'SELECT 1 FROM requests WHERE product_id = ? AND organization_id = ? LIMIT 1',
      ).get(productId, organizationId))
    },

    hasMovements(productId, organizationId) {
      return Boolean(database.prepare(
        'SELECT 1 FROM inventory_movements WHERE product_id = ? AND organization_id = ? LIMIT 1',
      ).get(productId, organizationId))
    },

    deleteById(id, organizationId) {
      return database.prepare(
        'DELETE FROM products WHERE id = ? AND organization_id = ?',
      ).run(id, organizationId)
    },
  }
}
