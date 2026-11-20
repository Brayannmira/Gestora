export function createUsersRepository(database) {
  return {
    listUsers(organizationId) {
      return database.prepare(`
        SELECT users.id, users.email, users.name, users.role, users.is_active,
          users.organization_id, organizations.name AS organization_name,
          users.branch_id, branches.name AS branch_name,
          users.must_change_password, users.created_at
        FROM users
        JOIN organizations ON organizations.id = users.organization_id
        LEFT JOIN branches ON branches.id = users.branch_id
        WHERE users.organization_id = ?
        ORDER BY users.created_at DESC
      `).all(organizationId)
    },

    getLimits(organizationId) {
      return {
        admins: database.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND organization_id = ?",
        ).get(organizationId).count,
        superAdmins: database.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'SUPER_ADMIN' AND organization_id = ?",
        ).get(organizationId).count,
      }
    },

    countActiveAdmins(organizationId) {
      return database.prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND organization_id = ?",
      ).get(organizationId).count
    },

    countActiveUsers(organizationId) {
      return database.prepare(`
        SELECT COUNT(*) AS count FROM users
        WHERE organization_id = ? AND is_active = 1
      `).get(organizationId).count
    },

    emailExists(email) {
      return Boolean(database.prepare(
        'SELECT 1 FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
      ).get(email))
    },

    findBranch(branchId, organizationId) {
      return database.prepare(`
        SELECT id, name FROM branches WHERE id = ? AND organization_id = ?
      `).get(branchId, organizationId)
    },

    findDefaultBranchId(organizationId) {
      return database.prepare(`
        SELECT id FROM branches WHERE organization_id = ?
        ORDER BY created_at, id LIMIT 1
      `).get(organizationId)?.id
    },

    createUser({
      id,
      email,
      name,
      passwordHash,
      role,
      organizationId,
      branchId = null,
      mustChangePassword = 1,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO users
          (id, email, name, password_hash, role, organization_id, branch_id, must_change_password, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        email,
        name,
        passwordHash,
        role,
        organizationId,
        branchId,
        mustChangePassword,
        createdAt,
      )
    },

    findAccount(id, organizationId) {
      return database.prepare(`
        SELECT id, role, is_active, organization_id, branch_id
        FROM users WHERE id = ? AND organization_id = ?
      `).get(id, organizationId)
    },

    updateActive(id, organizationId, isActive) {
      database.prepare(
        'UPDATE users SET is_active = ? WHERE id = ? AND organization_id = ?',
      ).run(isActive ? 1 : 0, id, organizationId)
    },

    updateBranch(id, organizationId, branchId) {
      return database.prepare(`
        UPDATE users SET branch_id = ?
        WHERE id = ? AND organization_id = ? AND role = 'EMPLOYEE'
      `).run(branchId, id, organizationId)
    },

    setTemporaryPassword(id, organizationId, passwordHash) {
      return database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 1
        WHERE id = ? AND organization_id = ? AND is_active = 1
      `).run(passwordHash, id, organizationId)
    },

    revokeSessions(id) {
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    },

    revokeOtpChallenges(id) {
      database.prepare('DELETE FROM otp_challenges WHERE user_id = ?').run(id)
    },
  }
}
