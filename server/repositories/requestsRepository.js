export function createRequestsRepository(database) {
  return {
    findById(id) {
      return database.prepare('SELECT * FROM requests WHERE id = ?').get(id)
    },

    create({
      id,
      title,
      description,
      priority,
      product,
      quantity,
      createdBy,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO requests
          (id, title, description, priority, status, product_id, product_name, quantity, created_by, created_at)
        VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        description,
        priority,
        product.id,
        product.name,
        quantity,
        createdBy,
        createdAt,
      )
    },

    updateStatusAndPriority(id, status, priority) {
      database.prepare(`
        UPDATE requests SET status = COALESCE(?, status), priority = COALESCE(?, priority)
        WHERE id = ?
      `).run(status ?? null, priority ?? null, id)
    },

    markCompleted(id, completedAt, priority) {
      database.prepare(`
        UPDATE requests
        SET status = 'completada', stock_deducted = 1, completed_at = ?, priority = COALESCE(?, priority)
        WHERE id = ?
      `).run(completedAt, priority ?? null, id)
    },

    deleteActive(id) {
      return database.prepare(`
        DELETE FROM requests
        WHERE id = ? AND stock_deducted = 0 AND status NOT IN ('completada', 'cancelada')
      `).run(id)
    },
  }
}
