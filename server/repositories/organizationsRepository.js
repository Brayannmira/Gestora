export function createOrganizationsRepository(database) {
  return {
    findByName(name) {
      return database.prepare(
        'SELECT id FROM organizations WHERE name = ? COLLATE NOCASE',
      ).get(name)
    },

    create({ id, name, createdAt }) {
      database.prepare(`
        INSERT INTO organizations (id, name, created_at)
        VALUES (?, ?, ?)
      `).run(id, name, createdAt)
    },

    deleteOrganization(organizationId) {
      return database.prepare('DELETE FROM organizations WHERE id = ?').run(organizationId)
    },

    createSubscription({ organizationId, planKey, status, trialEndsAt, updatedAt }) {
      database.prepare(`
        INSERT INTO organization_subscriptions
          (organization_id, plan_key, status, trial_ends_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(organizationId, planKey, status, trialEndsAt, updatedAt)
    },

    getSubscription(organizationId) {
      return database.prepare(`
        SELECT plan_key, status, trial_ends_at, updated_at
        FROM organization_subscriptions WHERE organization_id = ?
      `).get(organizationId)
    },

    setSubscription({ organizationId, planKey, status, trialEndsAt, updatedAt }) {
      return database.prepare(`
        UPDATE organization_subscriptions
        SET plan_key = ?, status = ?, trial_ends_at = ?, updated_at = ?
        WHERE organization_id = ?
      `).run(planKey, status, trialEndsAt, updatedAt, organizationId)
    },

    getOrganization(organizationId) {
      return database.prepare(`
        SELECT id, name, status, deletion_requested_at, created_at
        FROM organizations WHERE id = ?
      `).get(organizationId)
    },

    getExportData(organizationId) {
      return {
        organization: this.getOrganization(organizationId),
        subscription: this.getSubscription(organizationId),
        branches: database.prepare(`
          SELECT id, name, created_at FROM branches
          WHERE organization_id = ? ORDER BY name
        `).all(organizationId),
        users: database.prepare(`
          SELECT id, email, name, role, is_active, branch_id, created_at
          FROM users WHERE organization_id = ? ORDER BY created_at
        `).all(organizationId),
        products: database.prepare(`
          SELECT id, name, stock, minimum_stock, branch_id, barcode, created_by, created_at
          FROM products WHERE organization_id = ? ORDER BY created_at
        `).all(organizationId),
        requests: database.prepare(`
          SELECT id, title, description, priority, status, approval_status, approved_by,
            approved_at, product_id, product_name, quantity, stock_deducted, branch_id,
            created_by, created_at, completed_at
          FROM requests WHERE organization_id = ? ORDER BY created_at
        `).all(organizationId),
        movements: database.prepare(`
          SELECT id, product_id, branch_id, product_name, type, quantity,
            previous_stock, new_stock, delta, reason, request_id, actor_id, created_at
          FROM inventory_movements WHERE organization_id = ? ORDER BY created_at
        `).all(organizationId),
        auditEvents: database.prepare(`
          SELECT actor_name, action, entity_type, entity_id, details, created_at
          FROM audit_events WHERE organization_id = ? ORDER BY created_at
        `).all(organizationId),
      }
    },

    scheduleClosure(organizationId, requestedAt) {
      return database.prepare(`
        UPDATE organizations SET status = 'closing', deletion_requested_at = ?
        WHERE id = ? AND status = 'active'
      `).run(requestedAt, organizationId)
    },

    cancelClosure(organizationId) {
      return database.prepare(`
        UPDATE organizations SET status = 'active', deletion_requested_at = NULL
        WHERE id = ? AND status = 'closing'
      `).run(organizationId)
    },

    listDueClosures(cutoff) {
      return database.prepare(`
        SELECT id FROM organizations
        WHERE status = 'closing' AND deletion_requested_at <= ?
        ORDER BY deletion_requested_at
      `).all(cutoff)
    },

    purgeOrganization(organizationId) {
      database.prepare(`
        DELETE FROM user_invitations
        WHERE organization_id = ?
          OR created_by IN (SELECT id FROM users WHERE organization_id = ?)
      `).run(organizationId, organizationId)
      database.prepare('DELETE FROM notifications WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM inventory_movements WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM requests WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM products WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM audit_events WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)').run(organizationId)
      database.prepare('DELETE FROM otp_challenges WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)').run(organizationId)
      database.prepare('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)').run(organizationId)
      database.prepare('DELETE FROM users WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM branches WHERE organization_id = ?').run(organizationId)
      database.prepare('DELETE FROM organizations WHERE id = ?').run(organizationId)
    },
  }
}
