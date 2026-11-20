export function createDataRepository(database) {
  return {
    findProducts() {
      return database.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all()
    },

    findRequests(userId) {
      return userId
        ? database.prepare('SELECT * FROM requests WHERE created_by = ? ORDER BY created_at DESC').all(userId)
        : database.prepare('SELECT * FROM requests ORDER BY created_at DESC').all()
    },

    findMovements() {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        ORDER BY inventory_movements.created_at DESC
        LIMIT 500
      `).all()
    },

    findCompletedRequests(start, endExclusive) {
      return database.prepare(`
        SELECT requests.id, requests.title, requests.product_name, requests.quantity,
          requests.completed_at, users.name AS requester_name
        FROM requests
        JOIN users ON users.id = requests.created_by
        WHERE requests.completed_at >= ? AND requests.completed_at < ?
        ORDER BY requests.completed_at DESC
      `).all(start, endExclusive)
    },

    findMovementsBetween(start, endExclusive) {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        WHERE inventory_movements.created_at >= ? AND inventory_movements.created_at < ?
        ORDER BY inventory_movements.created_at DESC
      `).all(start, endExclusive)
    },

    getMovementTotals(start, endExclusive) {
      return database.prepare(`
        SELECT type, COUNT(*) AS count, SUM(quantity) AS quantity, SUM(delta) AS delta
        FROM inventory_movements
        WHERE created_at >= ? AND created_at < ?
        GROUP BY type
      `).all(start, endExclusive)
    },

    findLowStockProducts() {
      return database.prepare(`
        SELECT id, name, stock, minimum_stock
        FROM products
        WHERE stock <= minimum_stock
        ORDER BY (minimum_stock - stock) DESC, name COLLATE NOCASE
      `).all()
    },

    hasProductsOrRequests() {
      return Boolean(
        database.prepare('SELECT 1 FROM products LIMIT 1').get() ||
        database.prepare('SELECT 1 FROM requests LIMIT 1').get(),
      )
    },

    insertImportedProduct({ id, name, stock, minimumStock, createdBy, createdAt }) {
      database.prepare(`
        INSERT INTO products (id, name, stock, minimum_stock, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, stock, minimumStock, createdBy, createdAt)
    },

    insertImportedRequest({
      id,
      title,
      description,
      priority,
      status,
      product,
      quantity,
      stockDeducted,
      createdBy,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO requests
          (id, title, description, priority, status, product_id, product_name, quantity, stock_deducted, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        description,
        priority,
        status,
        product.id,
        product.name,
        quantity,
        stockDeducted ? 1 : 0,
        createdBy,
        createdAt,
      )
    },
  }
}
