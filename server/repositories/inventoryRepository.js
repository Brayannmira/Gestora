import { randomUUID } from 'node:crypto'

export function createInventoryRepository(database) {
  return {
    findById(id) {
      return database.prepare('SELECT * FROM products WHERE id = ?').get(id)
    },

    insertProduct({ id, name, stock, minimumStock, actorId, createdAt }) {
      database.prepare(`
        INSERT INTO products (id, name, stock, minimum_stock, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, stock, minimumStock, actorId, createdAt)
    },

    updateStock(id, stock) {
      database.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, id)
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
    }) {
      const id = randomUUID()
      database.prepare(`
        INSERT INTO inventory_movements
          (id, product_id, product_name, type, quantity, previous_stock, new_stock, delta, reason, request_id, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        product.id,
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

    findMovementById(id) {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        WHERE inventory_movements.id = ?
      `).get(id)
    },

    hasRequests(productId) {
      return Boolean(database.prepare(
        'SELECT 1 FROM requests WHERE product_id = ? LIMIT 1',
      ).get(productId))
    },

    hasMovements(productId) {
      return Boolean(database.prepare(
        'SELECT 1 FROM inventory_movements WHERE product_id = ? LIMIT 1',
      ).get(productId))
    },

    deleteById(id) {
      return database.prepare('DELETE FROM products WHERE id = ?').run(id)
    },
  }
}
