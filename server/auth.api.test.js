import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de autenticación', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  it('limita CORS al origen configurado', async () => {
    const preflight = await api.send('/api/auth/login', {
      method: 'OPTIONS',
      origin: 'http://frontend.example.test',
    })
    expect(preflight.response.status).toBe(204)
    expect(preflight.response.headers.get('access-control-allow-origin'))
      .toBe('http://frontend.example.test')
    expect(preflight.response.headers.get('access-control-allow-credentials')).toBe('true')

    const rejectedOrigin = await api.send('/api/auth/login', {
      method: 'OPTIONS',
      origin: 'http://untrusted.example.test',
    })
    expect(rejectedOrigin.response.status).toBe(403)
  })

  it('exige OTP para crear la sesión y rechaza códigos incorrectos', async () => {
    const login = await api.send('/api/auth/login', {
      method: 'POST',
      body: { email: 'owner@example.test', password: 'correct-horse-battery' },
    })
    expect(login.response.status).toBe(202)

    const wrongCode = await api.send('/api/auth/verify-otp', {
      method: 'POST',
      body: {
        challengeId: login.payload.challengeId,
        code: api.otpCode === '000000' ? '000001' : '000000',
      },
    })
    expect(wrongCode.response.status).toBe(401)

    const verified = await api.send('/api/auth/verify-otp', {
      method: 'POST',
      body: {
        challengeId: login.payload.challengeId,
        code: api.otpCode,
      },
    })
    expect(verified.response.status).toBe(200)
    expect(verified.response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('rechaza el acceso sin sesión', async () => {
    const result = await api.send('/api/data')
    expect(result.response.status).toBe(401)
  })
})
