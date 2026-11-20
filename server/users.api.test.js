import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de empresas, invitaciones y recuperación', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  async function invite({ email, name = 'Cuenta invitada', role = 'EMPLOYEE' }) {
    return api.send('/api/users/invitations', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { email, name, role },
    })
  }

  it('reserva puestos, limita administradores y permite cancelar invitaciones', async () => {
    const first = await invite({ email: 'admin-one@example.test', role: 'ADMIN' })
    const second = await invite({ email: 'admin-two@example.test', role: 'ADMIN' })
    expect(first.response.status).toBe(201)
    expect(second.response.status).toBe(201)
    expect((await invite({ email: 'admin-three@example.test', role: 'ADMIN' })).response.status)
      .toBe(409)

    const cancelled = await api.send(`/api/users/invitations/${first.payload.invitation.id}`, {
      method: 'DELETE',
      cookie: api.superAdminSession.cookie,
    })
    expect(cancelled.response.status).toBe(204)
    expect((await invite({ email: 'admin-three@example.test', role: 'ADMIN' })).response.status)
      .toBe(201)

    const users = await api.send('/api/users', { cookie: api.superAdminSession.cookie })
    expect(users.response.status).toBe(200)
    expect(users.payload.limits.planKey).toBe('empresa')
    expect(users.payload.limits.pendingInvitations).toBe(2)
    expect((await api.send('/api/users/invitations', {
      method: 'POST',
      body: { name: 'Sin autorización', email: 'no-auth@example.test', role: 'EMPLOYEE' },
    })).response.status).toBe(401)
  })

  it('acepta una sola invitación y recupera la contraseña sin revelar si existe el correo', async () => {
    const invitation = await invite({ email: 'invitee@example.test' })
    expect(invitation.response.status).toBe(201)
    const token = api.invitationToken('invitee@example.test')
    const preview = await api.send('/api/auth/invitations/preview', {
      method: 'POST',
      body: { token },
    })
    expect(preview.payload.invitation).toMatchObject({
      email: 'invitee@example.test',
      organizationName: 'Gestora',
    })

    const accepted = await api.send('/api/auth/invitations/accept', {
      method: 'POST',
      body: { token, password: 'initial-password-for-user' },
    })
    expect(accepted.response.status).toBe(201)
    expect(accepted.payload.user.mustChangePassword).toBe(false)
    expect((await invite({ email: 'invitee@example.test' })).response.status).toBe(409)
    expect((await api.send('/api/auth/invitations/accept', {
      method: 'POST',
      body: { token, password: 'another-password-value' },
    })).response.status).toBe(400)

    const session = await api.loginAndVerify('invitee@example.test', 'initial-password-for-user')
    const unknownEmail = await api.send('/api/auth/password-reset/request', {
      method: 'POST',
      body: { email: 'unknown@example.test' },
    })
    const knownEmail = await api.send('/api/auth/password-reset/request', {
      method: 'POST',
      body: { email: 'invitee@example.test' },
    })
    expect(unknownEmail.response.status).toBe(202)
    expect(knownEmail.response.status).toBe(202)
    expect(unknownEmail.payload).toEqual(knownEmail.payload)

    const resetToken = api.invitationToken('invitee@example.test')
    expect((await api.send('/api/auth/password-reset/validate', {
      method: 'POST',
      body: { token: resetToken },
    })).payload.valid).toBe(true)
    const completed = await api.send('/api/auth/password-reset/complete', {
      method: 'POST',
      body: { token: resetToken, newPassword: 'a-new-strong-password' },
    })
    expect(completed.response.status).toBe(204)
    expect((await api.send('/api/auth/me', { cookie: session.cookie })).response.status).toBe(401)
    expect((await api.send('/api/auth/password-reset/complete', {
      method: 'POST',
      body: { token: resetToken, newPassword: 'a-third-strong-password' },
    })).response.status).toBe(400)
    expect((await api.loginAndVerify('invitee@example.test', 'a-new-strong-password')).user.email)
      .toBe('invitee@example.test')
  })

  it('expone salud de SQLite, exporta sin credenciales y programa una baja reversible', async () => {
    expect((await api.send('/api/health')).payload).toEqual({ status: 'ok' })
    const subscription = await api.send('/api/organizations/subscription', {
      cookie: api.superAdminSession.cookie,
    })
    expect(subscription.payload.subscription.limits).toEqual({
      users: 25,
      branches: 5,
      products: 5000,
    })

    const exportResponse = await api.send('/api/organizations/export', {
      cookie: api.superAdminSession.cookie,
    })
    expect(exportResponse.response.status).toBe(200)
    expect(JSON.stringify(exportResponse.payload)).not.toContain('password_hash')
    expect(JSON.stringify(exportResponse.payload)).not.toContain('token_hash')
    expect((await api.send('/api/organizations/test-email', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(204)

    const closure = await api.send('/api/organizations/closure', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
    })
    expect(closure.payload.status).toBe('closing')
    expect(Date.parse(closure.payload.purgeAfter) - Date.parse(closure.payload.deletionRequestedAt))
      .toBe(30 * 24 * 60 * 60 * 1000)
    expect((await api.send('/api/data', { cookie: api.superAdminSession.cookie })).response.status)
      .toBe(403)
    expect((await api.send('/api/organizations/export', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(200)
    await api.send('/api/auth/logout', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
    })
    const reopenedSession = await api.loginAndVerify(
      'owner@example.test',
      'correct-horse-battery',
    )
    api.superAdminSession.cookie = reopenedSession.cookie
    expect((await api.send('/api/organizations/export', {
      cookie: reopenedSession.cookie,
    })).response.status).toBe(200)
    const cancelled = await api.send('/api/organizations/cancel-closure', {
      method: 'POST',
      cookie: reopenedSession.cookie,
    })
    expect(cancelled.payload.status).toBe('active')
  })

  it('purga una empresa solo después de vencer la retención y conserva integridad referencial', async () => {
    const created = await api.send('/api/organizations', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empresa a purgar',
        ownerName: 'Responsable',
        email: 'purge-owner@example.test',
      },
    })
    expect(created.response.status).toBe(201)
    const organizationId = created.payload.organization.id
    api.db.prepare(`
      UPDATE organizations SET status = 'closing', deletion_requested_at = ?
      WHERE id = ?
    `).run('2020-01-01T00:00:00.000Z', organizationId)

    const { organizationsService } = await import('./container.js')
    expect(organizationsService.purgeDueOrganizations(new Date().toISOString())).toBe(1)
    expect(api.db.prepare('SELECT id FROM organizations WHERE id = ?').get(organizationId))
      .toBeUndefined()
    expect(api.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
