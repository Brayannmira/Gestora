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

  it('pagina y filtra solicitudes en el servidor y valida los parámetros', async () => {
    expect((await api.send('/api/requests')).response.status).toBe(401)
    const product = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Archivadores', stock: 30, minimumStock: 2 },
    })
    for (let index = 0; index < 21; index += 1) {
      const created = await api.send('/api/requests', {
        method: 'POST',
        cookie: api.superAdminSession.cookie,
        body: {
          title: index === 0 ? 'Solicitud urgente única' : `Solicitud paginada ${index}`,
          productId: product.payload.product.id,
          quantity: 1,
          priority: index === 0 ? 'urgente' : 'normal',
        },
      })
      expect(created.response.status).toBe(201)
    }

    const firstPage = await api.send('/api/requests?page=1&pageSize=20', {
      cookie: api.superAdminSession.cookie,
    })
    expect(firstPage.response.status).toBe(200)
    expect(firstPage.payload.requests).toHaveLength(20)
    expect(firstPage.payload.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    })
    const workspaceData = await api.send('/api/data', {
      cookie: api.superAdminSession.cookie,
    })
    expect(workspaceData.payload.requestSummary.total).toBe(21)
    expect(workspaceData.payload.requestSummary.awaitingApproval).toBe(21)
    expect(workspaceData.payload.requests).toBeUndefined()

    const secondPage = await api.send('/api/requests?page=2&pageSize=20', {
      cookie: api.superAdminSession.cookie,
    })
    expect(secondPage.payload.requests).toHaveLength(1)

    const urgent = await api.send('/api/requests?priority=urgente&search=única', {
      cookie: api.superAdminSession.cookie,
    })
    expect(urgent.payload.requests.map((item) => item.title)).toEqual(['Solicitud urgente única'])
    expect(urgent.payload.filterCounts.urgent).toBe(1)

    const today = new Date().toISOString().slice(0, 10)
    const startOfToday = new Date(`${today}T00:00:00.000Z`)
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000)
    const todayRequests = await api.send(
      `/api/requests?dateFrom=${startOfToday.toISOString()}&dateTo=${startOfTomorrow.toISOString()}`,
      {
      cookie: api.superAdminSession.cookie,
      },
    )
    expect(todayRequests.response.status).toBe(200)
    expect(todayRequests.payload.pagination.total).toBe(21)
    expect((await api.send('/api/requests?dateFrom=invalid', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send(
      `/api/requests?dateFrom=${startOfTomorrow.toISOString()}&dateTo=${startOfToday.toISOString()}`,
      {
      cookie: api.superAdminSession.cookie,
      },
    )).response.status).toBe(400)

    expect((await api.send('/api/requests?page=0', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send('/api/requests?pageSize=51', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send('/api/requests?status=desconocido', {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
    expect((await api.send(`/api/requests?search=${'x'.repeat(101)}`, {
      cookie: api.superAdminSession.cookie,
    })).response.status).toBe(400)
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
    const approval = await api.send(`/api/requests/${requestId}/approval`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { approvalStatus: 'aprobada' },
    })
    expect(approval.response.status).toBe(200)
    expect(approval.payload.request.approvalStatus).toBe('aprobada')
    const completed = await api.send(`/api/requests/${requestId}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(completed.response.status).toBe(200)
    expect(completed.payload.product.stock).toBe(3)
    expect(completed.payload.notice).toContain('bajo el mínimo')
    const inventoryNotifications = await api.send('/api/notifications', {
      cookie: api.superAdminSession.cookie,
    })
    expect(inventoryNotifications.payload.notifications.some(
      (notification) =>
        notification.type === 'low_stock' &&
        notification.entityId === productId,
    )).toBe(true)

    const reopen = await api.send(`/api/requests/${requestId}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'pendiente' },
    })
    expect(reopen.response.status).toBe(409)
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
    expect(api.db.prepare(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE type = 'low_stock' AND entity_id = ?
    `).get(productId).count).toBe(1)
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
    const approval = await api.send(`/api/requests/${created.payload.request.id}/approval`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { approvalStatus: 'aprobada' },
    })
    expect(approval.response.status).toBe(200)
    const insufficient = await api.send(`/api/requests/${created.payload.request.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { status: 'completada' },
    })
    expect(insufficient.response.status).toBe(409)
    expect(api.db.prepare('SELECT stock FROM products WHERE id = ?')
      .get(product.payload.product.id).stock).toBe(1)
    expect(api.db.prepare(
      'SELECT status FROM requests WHERE id = ?',
    ).get(created.payload.request.id).status).toBe('pendiente')
    expect(api.db.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE request_id = ? AND type = 'salida'",
    ).get(created.payload.request.id).count).toBe(0)
    expect(api.db.prepare(
      'SELECT action FROM audit_events WHERE entity_id = ?',
    ).all(created.payload.request.id).map((event) => event.action)).toEqual([
      'request.created',
      'request.approved',
    ])
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
    expect(data.payload.requestSummary.total).toBe(1)
    expect(data.payload.requests).toBeUndefined()
    const requestPage = await api.send('/api/requests', { cookie: employee.cookie })
    expect(requestPage.payload.requests.map((item) => item.id)).toEqual([request.payload.request.id])
    expect(data.payload.movements).toHaveLength(0)
  })

  it('limita inventario por sucursal, valida códigos y notifica la aprobación', async () => {
    const branchResult = await api.send('/api/branches', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Sucursal Norte' },
    })
    expect(branchResult.response.status).toBe(201)
    const branches = await api.send('/api/branches', {
      cookie: api.superAdminSession.cookie,
    })
    const principal = branches.payload.branches.find((branch) => branch.name === 'Principal')
    const north = branchResult.payload.branch
    const northProduct = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Guantes de bodega',
        stock: 7,
        minimumStock: 2,
        branchId: north.id,
        barcode: 'GESTORA-QR-42',
      },
    })
    expect(northProduct.response.status).toBe(201)
    expect(northProduct.payload.product.branchId).toBe(north.id)
    expect(northProduct.payload.product.barcode).toBe('GESTORA-QR-42')

    const duplicateBarcode = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Duplicado',
        stock: 1,
        minimumStock: 0,
        branchId: north.id,
        barcode: 'GESTORA-QR-42',
      },
    })
    expect(duplicateBarcode.response.status).toBe(409)
    const sameCodeOtherBranch = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Guantes en Principal',
        stock: 3,
        minimumStock: 1,
        branchId: principal.id,
        barcode: 'GESTORA-QR-42',
      },
    })
    expect(sameCodeOtherBranch.response.status).toBe(201)

    const employeeCreated = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado del norte',
        email: 'branch-employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
        branchId: principal.id,
      },
    })
    expect(employeeCreated.response.status).toBe(201)
    const employee = await api.loginAndVerify(
      'branch-employee@example.test',
      'employee-password',
    )
    await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        currentPassword: 'employee-password',
        newPassword: 'employee-first-password',
      },
    })

    const hiddenProductRequest = await api.send('/api/requests', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        title: 'Solicitud fuera de sucursal',
        productId: northProduct.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    expect(hiddenProductRequest.response.status).toBe(404)
    const initialData = await api.send('/api/data', { cookie: employee.cookie })
    expect(initialData.payload.products.map((product) => product.branchId))
      .not.toContain(north.id)

    const assignment = await api.send(`/api/users/${employeeCreated.payload.user.id}/branch`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { branchId: north.id },
    })
    expect(assignment.response.status).toBe(200)
    const branchData = await api.send('/api/data', { cookie: employee.cookie })
    expect(branchData.payload.products.map((product) => product.id))
      .toEqual([northProduct.payload.product.id])

    const request = await api.send('/api/requests', {
      method: 'POST',
      cookie: employee.cookie,
      body: {
        title: 'Solicitar guantes',
        productId: northProduct.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    expect(request.response.status).toBe(201)
    const managerNotifications = await api.send('/api/notifications', {
      cookie: api.superAdminSession.cookie,
    })
    expect(managerNotifications.payload.notifications.some(
      (notification) => notification.entityId === request.payload.request.id,
    )).toBe(true)

    const approved = await api.send(`/api/requests/${request.payload.request.id}/approval`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { approvalStatus: 'aprobada' },
    })
    expect(approved.response.status).toBe(200)
    const employeeNotifications = await api.send('/api/notifications', {
      cookie: employee.cookie,
    })
    const approvalNotice = employeeNotifications.payload.notifications.find(
      (notification) => notification.entityId === request.payload.request.id,
    )
    expect(approvalNotice.title).toBe('Solicitud aprobada')
  })

  it('mantiene aislados los datos, el historial y los usuarios entre empresas', async () => {
    const sourceProduct = await api.send('/api/products', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Producto de Gestora', stock: 8, minimumStock: 1 },
    })
    const sourceRequest = await api.send('/api/requests', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        title: 'Solicitud de Gestora',
        productId: sourceProduct.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    const sourceEmployee = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado de Gestora',
        email: 'tenant-source-employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
      },
    })
    expect(sourceEmployee.response.status).toBe(201)

    const createdOrganization = await api.send('/api/organizations', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empresa Independiente',
        ownerName: 'Responsable',
        email: 'tenant-owner@example.test',
      },
    })
    expect(createdOrganization.response.status).toBe(201)
    expect(createdOrganization.payload.organization.name).toBe('Empresa Independiente')
    expect(createdOrganization.payload.organization.planKey).toBe('prueba')
    const ownerInvitationToken = api.invitationToken('tenant-owner@example.test')
    const ownerInvitation = await api.send('/api/auth/invitations/accept', {
      method: 'POST',
      body: { token: ownerInvitationToken, password: 'tenant-initial-password' },
    })
    expect(ownerInvitation.response.status).toBe(201)
    expect(ownerInvitation.payload.user.organizationId)
      .toBe(createdOrganization.payload.organization.id)

    const tenantOwner = await api.loginAndVerify('tenant-owner@example.test', 'tenant-initial-password')
    expect((await api.send('/api/data', { cookie: tenantOwner.cookie })).response.status)
      .toBe(200)

    for (let index = 1; index <= 3; index += 1) {
      const tenantAdmin = await api.send('/api/users', {
        method: 'POST',
        cookie: tenantOwner.cookie,
        body: {
          name: `Admin de empresa ${index}`,
          email: `tenant-admin${index}@example.test`,
          password: 'tenant-admin-password',
          role: 'ADMIN',
        },
      })
      expect(tenantAdmin.response.status).toBe(index <= 2 ? 201 : 409)
    }
    for (let index = 1; index <= 2; index += 1) {
      const sourceAdmin = await api.send('/api/users', {
        method: 'POST',
        cookie: api.superAdminSession.cookie,
        body: {
          name: `Admin de Gestora ${index}`,
          email: `source-admin${index}@example.test`,
          password: 'source-admin-password',
          role: 'ADMIN',
        },
      })
      expect(sourceAdmin.response.status).toBe(201)
    }

    const tenantProduct = await api.send('/api/products', {
      method: 'POST',
      cookie: tenantOwner.cookie,
      body: { name: 'Producto privado', stock: 4, minimumStock: 4 },
    })
    expect(tenantProduct.response.status).toBe(201)
    const tenantRequest = await api.send('/api/requests', {
      method: 'POST',
      cookie: tenantOwner.cookie,
      body: {
        title: 'Solicitud privada',
        productId: tenantProduct.payload.product.id,
        quantity: 1,
        priority: 'normal',
      },
    })
    expect(tenantRequest.response.status).toBe(201)
    const tenantData = await api.send('/api/data', { cookie: tenantOwner.cookie })
    expect(tenantData.payload.products.map((item) => item.name)).toEqual(['Producto privado'])
    expect(tenantData.payload.movements.map((item) => item.productName))
      .toEqual(['Producto privado'])

    const tenantRequests = await api.send('/api/requests', { cookie: tenantOwner.cookie })
    expect(tenantRequests.payload.requests.map((item) => item.title))
      .toEqual(['Solicitud privada'])
    const tenantUsers = await api.send('/api/users', { cookie: tenantOwner.cookie })
    expect(tenantUsers.payload.users.map((user) => user.email).sort())
      .toEqual([
        'tenant-admin1@example.test',
        'tenant-admin2@example.test',
        'tenant-owner@example.test',
      ])
    const tenantAudit = await api.send('/api/audit', { cookie: tenantOwner.cookie })
    expect(tenantAudit.payload.events.every((event) => (
      event.entityId !== sourceProduct.payload.product.id &&
      event.entityId !== sourceRequest.payload.request.id
    ))).toBe(true)
    const tenantReports = await api.send('/api/reports', { cookie: tenantOwner.cookie })
    expect(tenantReports.payload.lowStockProducts.map((item) => item.name))
      .toEqual(['Producto privado'])

    const crossTenantMovement = await api.send(
      `/api/products/${sourceProduct.payload.product.id}/movements`,
      {
        method: 'POST',
        cookie: tenantOwner.cookie,
        body: { type: 'entrada', quantity: 1, reason: 'Prueba de aislamiento' },
      },
    )
    expect(crossTenantMovement.response.status).toBe(404)
    const crossTenantRequestUpdate = await api.send(
      `/api/requests/${sourceRequest.payload.request.id}`,
      { method: 'PATCH', cookie: tenantOwner.cookie, body: { status: 'cancelada' } },
    )
    expect(crossTenantRequestUpdate.response.status).toBe(404)
    const crossTenantUserUpdate = await api.send(
      `/api/users/${sourceEmployee.payload.user.id}`,
      { method: 'PATCH', cookie: tenantOwner.cookie, body: { isActive: false } },
    )
    expect(crossTenantUserUpdate.response.status).toBe(404)

    const sourceData = await api.send('/api/data', {
      cookie: api.superAdminSession.cookie,
    })
    expect(sourceData.payload.products.some((item) => item.name === 'Producto de Gestora')).toBe(true)
    expect(sourceData.payload.products.some((item) => item.name === 'Producto privado')).toBe(false)
  })
})
