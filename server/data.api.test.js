import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de datos, migración y reportes', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  it('importa datos locales solo una vez', async () => {
    const migrated = await api.send('/api/migrate/local', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        products: [{
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Producto anterior',
          stock: 4,
          minimumStock: 1,
        }],
        requests: [{
          id: '00000000-0000-4000-8000-000000000002',
          title: 'Solicitud anterior',
          description: '',
          priority: 'normal',
          status: 'pendiente',
          productId: '00000000-0000-4000-8000-000000000001',
          quantity: 1,
          stockDeducted: false,
        }],
      },
    })
    expect(migrated.response.status).toBe(201)
    expect(migrated.payload.importedProducts).toBe(1)
    const repeated = await api.send('/api/migrate/local', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { products: [], requests: [] },
    })
    expect(repeated.response.status).toBe(409)
  })

  it('restringe reportes y rechaza periodos inválidos', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Papel', stock: 2, minimumStock: 2 },
    })
    const request = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Solicitud de papel',
        productId: product.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    const approval = await api.send(`/api/requests/${request.payload.request.id}/approval`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { approvalStatus: 'aprobada' },
    })
    expect(approval.response.status).toBe(200)
    const completed = await api.send(`/api/requests/${request.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(completed.response.status).toBe(200)

    const today = new Date().toISOString().slice(0, 10)
    const report = await api.send(`/api/reports?from=${today}&to=${today}`, {
      cookie: api.superAdminSession.cookie,
    })
    expect(report.response.status).toBe(200)
    expect(report.payload.completedRequests.some((item) => item.id === request.payload.request.id)).toBe(true)
    expect(report.payload.completedRequests.find((item) => item.id === request.payload.request.id))
      .toMatchObject({ branchName: 'Principal', approvalStatus: 'aprobada' })
    expect(report.payload.lowStockProducts.some((item) => item.id === product.payload.product.id)).toBe(true)

    const employee = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado',
        email: 'report-employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
      },
    })
    const employeeSession = await api.loginAndVerify('report-employee@example.test', 'employee-password')
    expect(employee.payload.user.roleKey).toBe('employee')
    expect((await api.send(`/api/reports?from=${today}&to=${today}`, {
      cookie: employeeSession.cookie,
    })).response.status).toBe(403)

    const invalid = await api.send('/api/reports?from=2026-02-31&to=2026-03-01', {
      cookie: api.superAdminSession.cookie,
    })
    expect(invalid.response.status).toBe(400)
  })
})
