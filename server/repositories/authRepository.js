export function createAuthRepository(database) {
  return {
    findActiveSession(tokenHash, now) {
      return database.prepare(`
        SELECT users.id, users.email, users.name, users.role, users.must_change_password, sessions.token_hash
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.is_active = 1
      `).get(tokenHash, now)
    },

    findActiveUserByEmail(email) {
      return database.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email)
    },

    deleteOtpChallengesByUser(userId) {
      database.prepare('DELETE FROM otp_challenges WHERE user_id = ?').run(userId)
    },

    createOtpChallenge({ id, userId, codeHash, expiresAt, resendAfter, createdAt }) {
      database.prepare(`
        INSERT INTO otp_challenges (id, user_id, code_hash, expires_at, resend_after, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, userId, codeHash, expiresAt, resendAfter, createdAt)
    },

    deleteOtpChallenge(id) {
      database.prepare('DELETE FROM otp_challenges WHERE id = ?').run(id)
    },

    findOtpChallengeWithEmail(id) {
      return database.prepare(`
        SELECT otp_challenges.*, users.email
        FROM otp_challenges
        JOIN users ON users.id = otp_challenges.user_id
        WHERE otp_challenges.id = ?
      `).get(id)
    },

    updateOtpChallenge({ id, codeHash, expiresAt, resendAfter }) {
      database.prepare(`
        UPDATE otp_challenges
        SET code_hash = ?, attempts = 0, expires_at = ?, resend_after = ?
        WHERE id = ?
      `).run(codeHash, expiresAt, resendAfter, id)
    },

    findOtpChallenge(id) {
      return database.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(id)
    },

    incrementOtpAttempts(id) {
      database.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(id)
    },

    consumeOtpChallenge(id, codeHash, now) {
      return database.prepare(`
        DELETE FROM otp_challenges
        WHERE id = ? AND code_hash = ? AND expires_at > ? AND attempts < 5
      `).run(id, codeHash, now)
    },

    findActiveUserById(id) {
      return database.prepare(`
        SELECT id, email, name, role, must_change_password
        FROM users WHERE id = ? AND is_active = 1
      `).get(id)
    },

    deleteSessionsByUser(userId) {
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    },

    createSession({ tokenHash, userId, expiresAt, createdAt }) {
      database.prepare(`
        INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(tokenHash, userId, expiresAt, createdAt)
    },

    findActivePasswordRecord(userId) {
      return database.prepare('SELECT password_hash FROM users WHERE id = ? AND is_active = 1')
        .get(userId)
    },

    updatePasswordForTemporarySession(userId, passwordHash) {
      return database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 0
        WHERE id = ? AND is_active = 1 AND must_change_password = 1
      `).run(passwordHash, userId)
    },

    deleteSession(tokenHash) {
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    },
  }
}
