export function createDataRepository(database) {
  return {
    findProducts(organizationId, branchId) {
      const branchFilter = branchId ? 'AND products.branch_id = ?' : ''
      const values = branchId ? [organizationId, branchId] : [organizationId]
      return database.prepare(`
        SELECT products.*, branches.name AS branch_name
        FROM products
        LEFT JOIN branches ON branches.id = products.branch_id
        WHERE products.organization_id = ? ${branchFilter}
        ORDER BY products.name COLLATE NOCASE
      `).all(...values)
    },

    getRequestSummary(organizationId, userId, branchId) {
      const conditions = ['organization_id = ?']
      const parameters = [organizationId]
      if (userId) {
        conditions.push('created_by = ?')
        parameters.push(userId)
      }
      if (branchId) {
        conditions.push('branch_id = ?')
        parameters.push(branchId)
      }
      return database.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE
            WHEN status NOT IN ('completada', 'cancelada') THEN 1 ELSE 0
          END), 0) AS open,
          COALESCE(SUM(CASE WHEN status = 'completada' THEN 1 ELSE 0 END), 0) AS completed,
          COALESCE(SUM(CASE
            WHEN approval_status = 'pendiente' AND status NOT IN ('completada', 'cancelada')
            THEN 1 ELSE 0
          END), 0) AS awaitingApproval,
          COALESCE(SUM(CASE
            WHEN priority = 'urgente' AND status NOT IN ('completada', 'cancelada')
            THEN 1 ELSE 0
          END), 0) AS urgent
        FROM requests
        WHERE ${conditions.join(' AND ')}
      `).get(...parameters)
    },

    findMovements(organizationId) {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name, branches.name AS branch_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        LEFT JOIN branches ON branches.id = inventory_movements.branch_id
        WHERE inventory_movements.organization_id = ?
        ORDER BY inventory_movements.created_at DESC
        LIMIT 500
      `).all(organizationId)
    },

    findCompletedRequests(organizationId, start, endExclusive) {
      return database.prepare(`
        SELECT requests.id, requests.title, requests.product_name, requests.quantity,
          requests.completed_at, requests.approval_status, branches.name AS branch_name,
          users.name AS requester_name
        FROM requests
        JOIN users ON users.id = requests.created_by
        LEFT JOIN branches ON branches.id = requests.branch_id
        WHERE requests.organization_id = ?
          AND requests.completed_at >= ? AND requests.completed_at < ?
        ORDER BY requests.completed_at DESC
      `).all(organizationId, start, endExclusive)
    },

    findMovementsBetween(organizationId, start, endExclusive) {
      return database.prepare(`
        SELECT inventory_movements.*, users.name AS actor_name, branches.name AS branch_name
        FROM inventory_movements
        JOIN users ON users.id = inventory_movements.actor_id
        LEFT JOIN branches ON branches.id = inventory_movements.branch_id
        WHERE inventory_movements.organization_id = ?
          AND inventory_movements.created_at >= ? AND inventory_movements.created_at < ?
        ORDER BY inventory_movements.created_at DESC
      `).all(organizationId, start, endExclusive)
    },

    getMovementTotals(organizationId, start, endExclusive) {
      return database.prepare(`
        SELECT type, COUNT(*) AS count, SUM(quantity) AS quantity, SUM(delta) AS delta
        FROM inventory_movements
        WHERE organization_id = ? AND created_at >= ? AND created_at < ?
        GROUP BY type
      `).all(organizationId, start, endExclusive)
    },

    findLowStockProducts(organizationId) {
      return database.prepare(`
        SELECT products.id, products.name, products.stock, products.minimum_stock,
          branches.name AS branch_name, products.barcode
        FROM products
        LEFT JOIN branches ON branches.id = products.branch_id
        WHERE products.organization_id = ? AND stock <= minimum_stock
        ORDER BY (minimum_stock - stock) DESC, products.name COLLATE NOCASE
      `).all(organizationId)
    },

    findBranches(organizationId, branchId) {
      const filter = branchId ? 'AND id = ?' : ''
      const values = branchId ? [organizationId, branchId] : [organizationId]
      return database.prepare(`
        SELECT id, name FROM branches
        WHERE organization_id = ? ${filter}
        ORDER BY name COLLATE NOCASE
      `).all(...values)
    },

    hasProductsOrRequests(organizationId) {
      return Boolean(
        database.prepare('SELECT 1 FROM products WHERE organization_id = ? LIMIT 1').get(organizationId) ||
        database.prepare('SELECT 1 FROM requests WHERE organization_id = ? LIMIT 1').get(organizationId),
      )
    },

    insertImportedProduct({
      id,
      name,
      stock,
      minimumStock,
      createdBy,
      organizationId,
      branchId,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO products
          (id, name, stock, minimum_stock, organization_id, branch_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, stock, minimumStock, organizationId, branchId, createdBy, createdAt)
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
      organizationId,
      branchId,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO requests
          (id, title, description, priority, status, product_id, product_name, quantity, stock_deducted, organization_id, branch_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        organizationId,
        branchId,
        createdBy,
        createdAt,
      )
    },
  }
}
