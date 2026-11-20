export function createInvitationsRepository(database) {
  return {
    create({
      id,
      organizationId,
      branchId,
      createdBy,
      email,
      name,
      role,
      tokenHash,
      expiresAt,
      createdAt,
    }) {
      database.prepare(`
        INSERT INTO user_invitations
          (id, organization_id, branch_id, created_by, email, name, role, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        organizationId,
        branchId,
        createdBy,
        email,
        name,
        role,
        tokenHash,
        expiresAt,
        createdAt,
      )
    },

    countPending(organizationId, now) {
      return database.prepare(`
        SELECT COUNT(*) AS count FROM user_invitations
        WHERE organization_id = ? AND accepted_at IS NULL AND cancelled_at IS NULL
          AND expires_at > ?
      `).get(organizationId, now).count
    },

    countPendingAdmins(organizationId, now) {
      return database.prepare(`
        SELECT COUNT(*) AS count FROM user_invitations
        WHERE organization_id = ? AND role = 'ADMIN' AND accepted_at IS NULL
          AND cancelled_at IS NULL AND expires_at > ?
      `).get(organizationId, now).count
    },

    countPendingForOrganization(organizationId, now) {
      return this.countPending(organizationId, now)
    },

    cancelExpiredForEmail(email, cancelledAt) {
      database.prepare(`
        UPDATE user_invitations SET cancelled_at = ?
        WHERE email = ? COLLATE NOCASE AND accepted_at IS NULL AND cancelled_at IS NULL
          AND expires_at <= ?
      `).run(cancelledAt, email, cancelledAt)
    },

    pendingEmailExists(email, now) {
      return Boolean(database.prepare(`
        SELECT 1 FROM user_invitations
        WHERE email = ? COLLATE NOCASE AND accepted_at IS NULL
          AND cancelled_at IS NULL AND expires_at > ?
        LIMIT 1
      `).get(email, now))
    },

    list(organizationId, now) {
      return database.prepare(`
        SELECT invitations.id, invitations.email, invitations.name, invitations.role,
          invitations.expires_at, invitations.created_at, branches.name AS branch_name
        FROM user_invitations AS invitations
        LEFT JOIN branches ON branches.id = invitations.branch_id
        WHERE invitations.organization_id = ? AND invitations.accepted_at IS NULL
          AND invitations.cancelled_at IS NULL AND invitations.expires_at > ?
        ORDER BY invitations.created_at DESC
      `).all(organizationId, now)
    },

    findByTokenHash(tokenHash) {
      return database.prepare(`
        SELECT invitations.*, organizations.name AS organization_name,
          organizations.status AS organization_status,
          branches.name AS branch_name
        FROM user_invitations AS invitations
        JOIN organizations ON organizations.id = invitations.organization_id
        LEFT JOIN branches ON branches.id = invitations.branch_id
        WHERE invitations.token_hash = ? AND invitations.accepted_at IS NULL
          AND invitations.cancelled_at IS NULL
      `).get(tokenHash)
    },

    cancel(id, organizationId, cancelledAt) {
      return database.prepare(`
        UPDATE user_invitations SET cancelled_at = ?
        WHERE id = ? AND organization_id = ? AND accepted_at IS NULL
          AND cancelled_at IS NULL
      `).run(cancelledAt, id, organizationId)
    },

    accept(id, tokenHash, acceptedAt) {
      return database.prepare(`
        UPDATE user_invitations SET accepted_at = ?
        WHERE id = ? AND token_hash = ? AND accepted_at IS NULL AND cancelled_at IS NULL
          AND expires_at > ?
      `).run(acceptedAt, id, tokenHash, acceptedAt)
    },
  }
}
