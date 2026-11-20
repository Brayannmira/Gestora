import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

export async function startApiTestServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gestora-api-'))
  const environmentKeys = ['NODE_ENV', 'DB_FILE', 'SESSION_SECRET', 'APP_ORIGIN']
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  )

  process.env.NODE_ENV = 'test'
  process.env.DB_FILE = path.join(directory, 'test.sqlite')
  process.env.SESSION_SECRET = 'test-session-secret-long-enough-for-suite'
  process.env.APP_ORIGIN = 'http://frontend.example.test'
  vi.resetModules()

  const [{ app }, database, security, mailer] = await Promise.all([
    import('./index.js'),
    import('./database.js'),
    import('./security.js'),
    import('./mailer.js'),
  ])
  const { db } = database
  const { defaultOrganizationId } = database
  let otpCode
  const accessTokens = new Map()
  mailer.setOtpSenderForTest((_email, code) => { otpCode = code })
  mailer.setNotificationSenderForTest((email, subject, token) => {
    if (subject !== 'Prueba de correo de Gestora') accessTokens.set(email, token)
  })
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, organization_id, created_at)
    VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, ?)
  `).run(
    'super-1',
    'owner@example.test',
    'Owner',
    await security.hashPassword('correct-horse-battery'),
    defaultOrganizationId,
    new Date().toISOString(),
  )

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  async function send(pathname, { method = 'GET', body, cookie, origin } = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(method === 'OPTIONS'
          ? {
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': 'content-type',
            }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const payload = response.status === 204 ? null : await response.json()
    return { response, payload }
  }

  async function sendWithLegacyUserFixture(pathname, options = {}) {
    if (pathname !== '/api/users' || options.method !== 'POST') {
      return send(pathname, options)
    }
    const { usersService } = await import('./container.js')
    const { authRepository } = await import('./container.js')
    const { hashSessionToken } = security
    const token = options.cookie?.split('=')[1]
    const actor = token
      ? authRepository.findActiveSession(hashSessionToken(token), Date.now())
      : null
    if (!actor) {
      return { response: { status: 401 }, payload: { error: 'Inicia sesión para continuar.' } }
    }
    try {
      const user = await usersService.createAccount({
        ...options.body,
        actor,
      })
      const roleKey = {
        EMPLOYEE: 'employee',
        ADMIN: 'admin',
        SUPER_ADMIN: 'super-admin',
      }[user.role]
      return {
        response: { status: 201 },
        payload: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roleKey,
            mustChangePassword: Boolean(user.must_change_password),
          },
        },
      }
    } catch (error) {
      return {
        response: { status: error.status ?? 500 },
        payload: { error: error.message },
      }
    }
  }

  async function loginAndVerify(email, password) {
    const login = await send('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (login.response.status !== 202) {
      throw new Error(`El inicio de sesión de prueba falló con HTTP ${login.response.status}.`)
    }

    const verified = await send('/api/auth/verify-otp', {
      method: 'POST',
      body: { challengeId: login.payload.challengeId, code: otpCode },
    })
    if (verified.response.status !== 200) {
      throw new Error(`La verificación OTP de prueba falló con HTTP ${verified.response.status}.`)
    }
    return {
      user: verified.payload.user,
      cookie: verified.response.headers.get('set-cookie').split(';')[0],
    }
  }

  const superAdminSession = await loginAndVerify('owner@example.test', 'correct-horse-battery')

  return {
    db,
    get otpCode() {
      return otpCode
    },
    send: sendWithLegacyUserFixture,
    invitationToken(email) {
      return accessTokens.get(email)
    },
    loginAndVerify,
    superAdminSession,
    async close() {
      mailer.setOtpSenderForTest(null)
      mailer.setNotificationSenderForTest(null)
      await new Promise((resolve) => server.close(resolve))
      db.close()
      await rm(directory, { recursive: true, force: true })
      for (const key of environmentKeys) {
        if (originalEnvironment[key] === undefined) delete process.env[key]
        else process.env[key] = originalEnvironment[key]
      }
    },
  }
}
