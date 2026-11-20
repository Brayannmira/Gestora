import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de solicitudes e inventario', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  it('descuenta stock una sola vez y avisa al alcanzar el mínimo', async () => {
    const productResult = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Papel', stock: 5, minimumStock: 3 },
    })
    expect(productResult.response.status).toBe(201)
    const productId = productResult.payload.product.id

    const created = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Reponer papel',
        productId,
        quantity: 2,
        priority: 'normal',
      },
    })
    const requestId = created.payload.request.id
    const completed = await api.send(`/api/requests/${requestId}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(completed.response.status).toBe(200)
    expect(completed.payload.product.stock).toBe(3)
    expect(completed.payload.notice).toContain('bajo el mínimo')

    await api.send(`/api/requests/${requestId}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'pendiente' },
    })
    const completedAgain = await api.send(`/api/requests/${requestId}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(completedAgain.payload.product.stock).toBe(3)
    expect(completedAgain.payload.notice).toContain('no se volvió a descontar')
    expect(api.db.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE request_id = ?",
    ).get(requestId).count).toBe(1)
  })

  it('no completa solicitudes ni registra salidas con stock insuficiente', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Carpetas', stock: 1, minimumStock: 0 },
    })
    const created = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Solicitar carpetas',
        productId: product.payload.product.id,
        quantity: 2,
        priority: 'urgente',
      },
    })
    const failed = await api.send(`/api/requests/${created.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(failed.response.status).toBe(409)
    expect(api.db.prepare('SELECT stock FROM products WHERE id = ?')
      .get(product.payload.product.id).stock).toBe(1)
    expect(api.db.prepare(
      'SELECT status FROM requests WHERE id = ?',
    ).get(created.payload.request.id).status).toBe('pendiente')
    expect(api.db.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE request_id = ? AND type = 'salida'",
    ).get(created.payload.request.id).count).toBe(0)
  })

  it('registra entradas y ajustes con el stock resultante', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Tinta', stock: 2, minimumStock: 1 },
    })
    const productId = product.payload.product.id
    const entry = await api.send(`/api/products/${productId}/movements`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { type: 'entrada', quantity: 3, reason: 'Reposición' },
    })
    expect(entry.response.status).toBe(201)
    expect(entry.payload.product.stock).toBe(5)

    const adjustment = await api.send(`/api/products/${productId}/movements`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { type: 'ajuste', quantity: 0, reason: 'Conteo físico' },
    })
    expect(adjustment.response.status).toBe(201)
    expect(adjustment.payload.product.stock).toBe(0)
  })

  it('mantiene las reglas de movimientos y cancelaciones', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Tóner', stock: 2, minimumStock: 1 },
    })
    const productId = product.payload.product.id
    const insufficientExit = await api.send(`/api/products/${productId}/movements`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { type: 'salida', quantity: 3, reason: 'Prueba' },
    })
    expect(insufficientExit.response.status).toBe(409)

    const request = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Solicitud cancelable',
        productId,
        quantity: 1,
        priority: 'normal',
      },
    })
    const cancelled = await api.send(`/api/requests/${request.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'cancelada' },
    })
    expect(cancelled.response.status).toBe(200)
    expect(cancelled.payload.request.status).toBe('cancelada')

    const reopen = await api.send(`/api/requests/${request.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'pendiente' },
    })
    expect(reopen.response.status).toBe(409)
  })

  it('limita a los empleados a sus solicitudes y no les permite gestionar inventario', async () => {
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Etiquetas', stock: 4, minimumStock: 1 },
    })
    await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado',
        email: 'request-employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
      },
    })
    const employee = await api.loginAndVerify('request-employee@example.test', 'employee-password')
    const passwordChanged = await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        currentPassword: 'employee-password',
        newPassword: 'employee-first-password',
      },
    })
    expect(passwordChanged.response.status).toBe(200)

    const forbiddenProduct = await api.send('/api/products', {
      method: 'POST',
      cookie: employee.cookie,
      body: { name: 'No permitido', stock: 1, minimumStock: 0 },
    })
    expect(forbiddenProduct.response.status).toBe(403)
    const request = await api.send('/api/requests', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        title: 'Solicitud propia',
        productId: product.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    expect(request.response.status).toBe(201)
    const cancelled = await api.send(`/api/requests/${request.payload.request.id}`, {
      method: 'PATCH',
      cookie: employee.cookie,
      body: { status: 'cancelada' },
    })
    expect(cancelled.response.status).toBe(200)
    const data = await api.send('/api/data', { cookie: employee.cookie })
    expect(data.payload.requests.map((item) => item.id)).toEqual([request.payload.request.id])
    expect(data.payload.movements).toHaveLength(0)
  })
})
