function requestConditions({
  organizationId,
  userId,
  branchId,
  status,
  approvalStatus,
  priority,
  search,
  dateFrom,
  dateTo,
}) {
  const conditions = ['requests.organization_id = ?']
  const values = [organizationId]
  if (userId) {
    conditions.push('requests.created_by = ?')
    values.push(userId)
  }
  if (status) {
    conditions.push('requests.status = ?')
    values.push(status)
  }
  if (approvalStatus) {
    conditions.push('requests.approval_status = ?')
    values.push(approvalStatus)
  }
  if (branchId) {
    conditions.push('requests.branch_id = ?')
    values.push(branchId)
  }
  if (priority) {
    conditions.push('requests.priority = ?')
    values.push(priority)
  }
  if (search) {
    const escapedSearch = search.replace(/[!%_]/g, '!$&')
    const pattern = `%${escapedSearch}%`
    conditions.push("(requests.title LIKE ? ESCAPE '!' OR requests.description LIKE ? ESCAPE '!' OR requests.product_name LIKE ? ESCAPE '!')")
    values.push(pattern, pattern, pattern)
  }
  if (dateFrom) {
    conditions.push('requests.created_at >= ?')
    values.push(dateFrom)
  }
  if (dateTo) {
    conditions.push('requests.created_at < ?')
    values.push(dateTo)
  }
  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

export function createRequestsRepository(database) {
  return {
    findById(id, organizationId, branchId) {
      const branchFilter = branchId ? 'AND requests.branch_id = ?' : ''
      const values = branchId ? [id, organizationId, branchId] : [id, organizationId]
      return database.prepare(
        `SELECT requests.*, branches.name AS branch_name
        FROM requests
        LEFT JOIN branches ON branches.id = requests.branch_id
        WHERE requests.id = ? AND requests.organization_id = ? ${branchFilter}`,
      ).get(...values)
    },

    findPage({
      organizationId,
      userId,
      branchId,
      status,
      approvalStatus,
      priority,
      search,
      dateFrom,
      dateTo,
      limit,
      offset,
    }) {
      const filter = requestConditions({
        organizationId,
        userId,
        branchId,
        status,
        approvalStatus,
        priority,
        search,
        dateFrom,
        dateTo,
      })
      return database.prepare(`
        SELECT requests.*, branches.name AS branch_name
        FROM requests
        LEFT JOIN branches ON branches.id = requests.branch_id
        ${filter.sql}
        ORDER BY requests.created_at DESC, requests.id DESC
        LIMIT ? OFFSET ?
      `).all(...filter.values, limit, offset)
    },

    count(filters) {
      const filter = requestConditions(filters)
      return database.prepare(`
        SELECT COUNT(*) AS count FROM requests ${filter.sql}
      `).get(...filter.values).count
    },

    getFilterCounts(filters) {
      const filter = requestConditions(filters)
      return database.prepare(`
        SELECT
          COUNT(*) AS all_count,
          COALESCE(SUM(CASE WHEN approval_status = 'pendiente' THEN 1 ELSE 0 END), 0) AS awaiting_approval,
          COALESCE(SUM(CASE
            WHEN priority = 'urgente' AND status != 'cancelada' THEN 1 ELSE 0
          END), 0) AS urgent,
          COALESCE(SUM(CASE WHEN status = 'en-proceso' THEN 1 ELSE 0 END), 0) AS in_progress
        FROM requests
        ${filter.sql}
      `).get(...filter.values)
    },

    create({
      id,
      title,
      description,
      priority,
      product,
      quantity,
      createdBy,
      organizationId,
      branchId,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO requests
          (id, title, description, priority, status, approval_status, product_id, product_name, quantity, organization_id, branch_id, created_by, created_at)
        VALUES (?, ?, ?, ?, 'pendiente', 'pendiente', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        description,
        priority,
        product.id,
        product.name,
        quantity,
        organizationId,
        branchId,
        createdBy,
        createdAt,
      )
    },

    updateApprovalStatus(id, organizationId, approvalStatus, approverId, approvedAt) {
      return database.prepare(`
        UPDATE requests
        SET approval_status = ?, approved_by = ?, approved_at = ?
        WHERE id = ? AND organization_id = ? AND approval_status = 'pendiente'
          AND status NOT IN ('completada', 'cancelada')
      `).run(
        approvalStatus,
        approvalStatus === 'aprobada' ? approverId : null,
        approvalStatus === 'aprobada' ? approvedAt : null,
        id,
        organizationId,
      )
    },

    updateStatusAndPriority(id, organizationId, status, priority, scope = {}) {
      const ownerFilter = scope.userId ? 'AND created_by = ?' : ''
      const branchFilter = scope.branchId ? 'AND branch_id = ?' : ''
      const values = [status ?? null, priority ?? null, id, organizationId]
      if (scope.userId) values.push(scope.userId)
      if (scope.branchId) values.push(scope.branchId)
      database.prepare(`
        UPDATE requests SET status = COALESCE(?, status), priority = COALESCE(?, priority)
        WHERE id = ? AND organization_id = ? ${ownerFilter} ${branchFilter}
      `).run(...values)
    },

    markCompleted(id, organizationId, completedAt, priority) {
      database.prepare(`
        UPDATE requests
        SET status = 'completada', stock_deducted = 1, completed_at = ?, priority = COALESCE(?, priority)
        WHERE id = ? AND organization_id = ?
      `).run(completedAt, priority ?? null, id, organizationId)
    },

    deleteActive(id, organizationId) {
      return database.prepare(`
        DELETE FROM requests
        WHERE id = ? AND organization_id = ?
          AND stock_deducted = 0 AND status NOT IN ('completada', 'cancelada')
      `).run(id, organizationId)
    },
  }
}
