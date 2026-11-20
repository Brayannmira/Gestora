export function createNotificationsRepository(database) {
  return {
    findManagers(organizationId) {
      return database.prepare(`
        SELECT id, email FROM users
        WHERE organization_id = ? AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = 1
      `).all(organizationId)
    },

    findRecipient(id, organizationId) {
      return database.prepare(`
        SELECT id, email FROM users
        WHERE id = ? AND organization_id = ? AND is_active = 1
      `).get(id, organizationId)
    },

    create({
      id,
      recipientId,
      organizationId,
      branchId,
      type,
      title,
      message,
      entityType,
      entityId,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO notifications
          (id, recipient_id, organization_id, branch_id, type, title, message, entity_type, entity_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        recipientId,
        organizationId,
        branchId,
        type,
        title,
        message,
        entityType,
        entityId,
        createdAt,
      )
    },

    listForUser(userId, organizationId) {
      return database.prepare(`
        SELECT id, type, title, message, entity_type, entity_id, read_at, created_at
        FROM notifications
        WHERE recipient_id = ? AND organization_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `).all(userId, organizationId)
    },

    markRead(id, userId, organizationId, readAt) {
      return database.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE id = ? AND recipient_id = ? AND organization_id = ? AND read_at IS NULL
      `).run(readAt, id, userId, organizationId)
    },

    markAllRead(userId, organizationId, readAt) {
      return database.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE recipient_id = ? AND organization_id = ? AND read_at IS NULL
      `).run(readAt, userId, organizationId)
    },
  }
}
