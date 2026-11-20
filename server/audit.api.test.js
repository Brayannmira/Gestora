import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de auditoría', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  it('registra cambios de negocio sin guardar descripciones, motivos ni contraseñas', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Producto auditado', stock: 0, minimumStock: 1 },
    })
    const productId = product.payload.product.id
    await api.send(`/api/products/${productId}/movements`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        type: 'entrada',
        quantity: 3,
        reason: 'motivo privado de auditoría',
      },
    })

    const request = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Solicitud auditada',
        description: 'descripción privada de auditoría',
        productId,
        quantity: 1,
        priority: 'normal',
      },
    })
    await api.send(`/api/requests/${request.payload.request.id}/approval`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { approvalStatus: 'aprobada' },
    })
    await api.send(`/api/requests/${request.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'en-proceso', priority: 'urgente' },
    })

    const createdUser = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Cuenta auditada',
        email: 'audit-target@example.test',
        password: 'initial-secret-password',
        role: 'EMPLOYEE',
      },
    })
    await api.send(`/api/users/${createdUser.payload.user.id}/reset-password`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { temporaryPassword: 'new-temporary-secret' },
    })
    await api.send(`/api/users/${createdUser.payload.user.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: false },
    })

    const auditPage = await api.send('/api/audit?page=1&pageSize=50', {
      cookie: api.superAdminSession.cookie,
    })
    expect(auditPage.response.status).toBe(200)
    expect(auditPage.payload.events.some((event) => event.action === 'product.created')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'inventory.movement_recorded')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'request.created')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'request.updated')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'user.created')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'user.password_reset')).toBe(true)
    expect(auditPage.payload.events.some((event) => event.action === 'user.deactivated')).toBe(true)
    expect(JSON.stringify(auditPage.payload.events)).not.toContain('descripción privada de auditoría')
    expect(JSON.stringify(auditPage.payload.events)).not.toContain('motivo privado de auditoría')
    expect(JSON.stringify(auditPage.payload.events)).not.toContain('initial-secret-password')
    expect(JSON.stringify(auditPage.payload.events)).not.toContain('new-temporary-secret')
    expect(JSON.stringify(auditPage.payload.events)).not.toContain('audit-target@example.test')

    const firstPage = await api.send('/api/audit?page=1&pageSize=1', {
      cookie: api.superAdminSession.cookie,
    })
    expect(firstPage.payload.events).toHaveLength(1)
    expect(firstPage.payload.pagination.total).toBeGreaterThan(1)
    expect(firstPage.payload.pagination.totalPages).toBeGreaterThan(1)
    expect((await api.send('/api/audit?page=0', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send('/api/audit?pageSize=51', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send('/api/audit')).response.status).toBe(401)
  })

  it('permite leer el historial a administradores pero no a empleados', async () => {
    await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Administradora auditora',
        email: 'audit-admin@example.test',
        password: 'admin-temporary-password',
        role: 'ADMIN',
      },
    })
    const admin = await api.loginAndVerify(
      'audit-admin@example.test',
      'admin-temporary-password',
    )
    await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: admin.cookie,
      body: {
        currentPassword: 'admin-temporary-password',
        newPassword: 'admin-permanent-password',
      },
    })
    expect((await api.send('/api/audit', { cookie: admin.cookie })).response.status).toBe(200)

    await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado sin auditoría',
        email: 'audit-employee@example.test',
        password: 'employee-temporary-password',
        role: 'EMPLOYEE',
      },
    })
    const employee = await api.loginAndVerify(
      'audit-employee@example.test',
      'employee-temporary-password',
    )
    await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        currentPassword: 'employee-temporary-password',
        newPassword: 'employee-permanent-password',
      },
    })
    expect((await api.send('/api/audit', { cookie: employee.cookie })).response.status).toBe(403)
  })
})
