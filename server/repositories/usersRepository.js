export function createUsersRepository(database) {
  return {
    listUsers() {
      return database.prepare(`
        SELECT id, email, name, role, is_active, must_change_password, created_at
        FROM users ORDER BY created_at DESC
      `).all()
    },

    getLimits() {
      return {
        admins: database.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1",
        ).get().count,
        superAdmins: database.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'SUPER_ADMIN'",
        ).get().count,
      }
    },

    countActiveAdmins() {
      return database.prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1",
      ).get().count
    },

    createUser({ id, email, name, passwordHash, role, createdAt }) {
      database.prepare(`
        INSERT INTO users (id, email, name, password_hash, role, must_change_password, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(id, email, name, passwordHash, role, createdAt)
    },

    findAccount(id) {
      return database.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(id)
    },

    updateActive(id, isActive) {
      database.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    },

    setTemporaryPassword(id, passwordHash) {
      database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 1
        WHERE id = ? AND is_active = 1
      `).run(passwordHash, id)
    },

    revokeSessions(id) {
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    },

    revokeOtpChallenges(id) {
      database.prepare('DELETE FROM otp_challenges WHERE user_id = ?').run(id)
    },
  }
}
