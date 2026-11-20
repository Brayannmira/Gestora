export function createBranchesRepository(database) {
  return {
    findById(id, organizationId) {
      return database.prepare(`
        SELECT id, organization_id, name, created_at
        FROM branches WHERE id = ? AND organization_id = ?
      `).get(id, organizationId)
    },

    findDefaultBranchId(organizationId) {
      return database.prepare(`
        SELECT id FROM branches
        WHERE organization_id = ?
        ORDER BY created_at, id
        LIMIT 1
      `).get(organizationId)?.id
    },

    list(organizationId, branchId) {
      const filter = branchId ? 'AND id = ?' : ''
      const values = branchId ? [organizationId, branchId] : [organizationId]
      return database.prepare(`
        SELECT id, name FROM branches
        WHERE organization_id = ? ${filter}
        ORDER BY name COLLATE NOCASE
      `).all(...values)
    },

    create({ id, organizationId, name, createdAt }) {
      database.prepare(`
        INSERT INTO branches (id, organization_id, name, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, organizationId, name, createdAt)
    },

    nameExists(organizationId, name) {
      return Boolean(database.prepare(`
        SELECT 1 FROM branches
        WHERE organization_id = ? AND name = ? COLLATE NOCASE
      `).get(organizationId, name))
    },

    count(organizationId) {
      return database.prepare(
        'SELECT COUNT(*) AS count FROM branches WHERE organization_id = ?',
      ).get(organizationId).count
    },
  }
}
