import { describe, expect, it } from 'vitest'
import { validateRuntimeConfig } from './runtimeConfig.js'

const validProductionEnvironment = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a'.repeat(48),
  APP_ORIGIN: 'https://gestora.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'gestora@example.com',
  SMTP_PASSWORD: 'test-only-password',
  SMTP_FROM: 'Gestora <gestora@example.com>',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
}

describe('validación de configuración de producción', () => {
  it('acepta HTTPS, un secreto fuerte y SMTP completo', () => {
    expect(validateRuntimeConfig(validProductionEnvironment)).toEqual({
      host: '127.0.0.1',
      port: 3000,
    })
  })

  it.each([
    ['secret', { SESSION_SECRET: 'short' }, /SESSION_SECRET/],
    ['origin HTTP', { APP_ORIGIN: 'http://gestora.example.com' }, /HTTPS/],
    ['origin con ruta', { APP_ORIGIN: 'https://gestora.example.com/app' }, /exacto/],
    ['SMTP incompleto', { SMTP_PASSWORD: '' }, /SMTP_PASSWORD/],
    ['puerto SMTP inválido', { SMTP_PORT: '70000' }, /SMTP_PORT/],
    ['TLS faltante en puerto 465', { SMTP_PORT: '465' }, /SMTP_SECURE/],
  ])('rechaza %s', (_caseName, overrides, expectedError) => {
    expect(() => validateRuntimeConfig({
      ...validProductionEnvironment,
      ...overrides,
    })).toThrow(expectedError)
  })

  it('no inicia si NODE_ENV no se definió', () => {
    expect(() => validateRuntimeConfig({})).toThrow(/NODE_ENV/)
  })
})
