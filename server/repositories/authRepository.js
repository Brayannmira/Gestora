export function createAuthRepository(database) {
  return {
    findActiveSession(tokenHash, now) {
      return database.prepare(`
        SELECT users.id, users.email, users.name, users.role, users.must_change_password,
          users.organization_id, organizations.name AS organization_name,
          organizations.status AS organization_status,
          organizations.deletion_requested_at,
          organization_subscriptions.plan_key,
          organization_subscriptions.status AS subscription_status,
          organization_subscriptions.trial_ends_at,
          users.branch_id, branches.name AS branch_name, sessions.token_hash
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        JOIN organizations ON organizations.id = users.organization_id
        LEFT JOIN organization_subscriptions
          ON organization_subscriptions.organization_id = organizations.id
        LEFT JOIN branches ON branches.id = users.branch_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.is_active = 1
      `).get(tokenHash, now)
    },

    findActiveUserByEmail(email) {
      return database.prepare(`
        SELECT users.*, organizations.name AS organization_name,
          organizations.status AS organization_status,
          organizations.deletion_requested_at,
          organization_subscriptions.plan_key,
          organization_subscriptions.status AS subscription_status,
          organization_subscriptions.trial_ends_at,
          branches.name AS branch_name
        FROM users
        JOIN organizations ON organizations.id = users.organization_id
        LEFT JOIN organization_subscriptions
          ON organization_subscriptions.organization_id = organizations.id
        LEFT JOIN branches ON branches.id = users.branch_id
        WHERE users.email = ? AND users.is_active = 1
      `).get(email)
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
        SELECT users.id, users.email, users.name, users.role,
          users.organization_id, organizations.name AS organization_name,
          organizations.status AS organization_status,
          organizations.deletion_requested_at,
          organization_subscriptions.plan_key,
          organization_subscriptions.status AS subscription_status,
          organization_subscriptions.trial_ends_at,
          users.branch_id, branches.name AS branch_name, users.must_change_password
        FROM users
        JOIN organizations ON organizations.id = users.organization_id
        LEFT JOIN organization_subscriptions
          ON organization_subscriptions.organization_id = organizations.id
        LEFT JOIN branches ON branches.id = users.branch_id
        WHERE users.id = ? AND users.is_active = 1
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

    createPasswordResetToken({ id, userId, tokenHash, expiresAt, createdAt }) {
      database.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, tokenHash, expiresAt, createdAt)
    },

    deletePasswordResetTokensByUser(userId) {
      database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId)
    },

    findPasswordResetToken(tokenHash) {
      return database.prepare(`
        SELECT password_reset_tokens.id, password_reset_tokens.user_id,
          password_reset_tokens.expires_at, users.email, users.name, users.role,
          users.organization_id, users.is_active, organizations.name AS organization_name,
          organizations.status AS organization_status, users.branch_id,
          branches.name AS branch_name
        FROM password_reset_tokens
        JOIN users ON users.id = password_reset_tokens.user_id
        JOIN organizations ON organizations.id = users.organization_id
        LEFT JOIN branches ON branches.id = users.branch_id
        WHERE password_reset_tokens.token_hash = ?
      `).get(tokenHash)
    },

    consumePasswordResetToken(id, tokenHash, now) {
      return database.prepare(`
        DELETE FROM password_reset_tokens
        WHERE id = ? AND token_hash = ? AND expires_at > ?
      `).run(id, tokenHash, now)
    },

    updatePasswordFromReset(userId, passwordHash) {
      return database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 0
        WHERE id = ? AND is_active = 1
      `).run(passwordHash, userId)
    },

    deleteSession(tokenHash) {
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    },
  }
}
