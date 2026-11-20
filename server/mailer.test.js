import { afterEach, describe, expect, it, vi } from 'vitest'

describe('envío de códigos OTP', () => {
  const keys = ['NODE_ENV', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']
  const originalEnvironment = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )

  afterEach(() => {
    for (const key of keys) {
      if (originalEnvironment[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnvironment[key]
    }
    vi.restoreAllMocks()
    vi.resetModules()
  })

  describe('correo de notificaciones', () => {
    it('envía título y mensaje al destinatario configurado', async () => {
      vi.resetModules()
      const { sendNotification, setNotificationSenderForTest } = await import('./mailer.js')
      const sender = vi.fn()
      setNotificationSenderForTest(sender)

      await sendNotification('admin@example.test', 'Alerta de inventario', 'Hay stock bajo.')

      expect(sender).toHaveBeenCalledWith(
        'admin@example.test',
        'Alerta de inventario',
        'Hay stock bajo.',
      )
    })
  })

  it('falla sin SMTP en producción sin escribir el correo ni el OTP en stderr', async () => {
    process.env.NODE_ENV = 'production'
    for (const key of keys.slice(1)) delete process.env[key]
    vi.resetModules()
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { sendOtp } = await import('./mailer.js')

    await expect(sendOtp('private@example.test', '123456')).rejects.toThrow(/SMTP_HOST/)
    expect(stderrWrite).not.toHaveBeenCalled()
  })
})
