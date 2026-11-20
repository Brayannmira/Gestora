export function createAuditRepository(database) {
  return {
    insert({
      id,
      actorId,
      organizationId,
      actorName,
      action,
      entityType,
      entityId,
      details,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO audit_events
          (id, actor_id, organization_id, actor_name, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, actorId, organizationId, actorName, action, entityType, entityId, details, createdAt)
    },

    count(organizationId) {
      return database.prepare(
        'SELECT COUNT(*) AS count FROM audit_events WHERE organization_id = ?',
      ).get(organizationId).count
    },

    findPage({ organizationId, limit, offset }) {
      return database.prepare(`
        SELECT id, actor_id, actor_name, action, entity_type, entity_id, details, created_at
        FROM audit_events WHERE organization_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(organizationId, limit, offset)
    },
  }
}
