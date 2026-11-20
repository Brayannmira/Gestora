import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startApiTestServer } from './apiTestHarness.js'

describe('API de usuarios y roles', () => {
  let api

  beforeAll(async () => {
    api = await startApiTestServer()
  })

  afterAll(async () => {
    await api?.close()
  })

  it('limita administradores activos y permite crear empleados', async () => {
    const createAdmin = (email) => api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { name: 'Admin', email, password: 'long-password-1', role: 'ADMIN' },
    })
    const firstAdmin = await createAdmin('admin1@example.test')
    expect(firstAdmin.response.status).toBe(201)
    expect((await createAdmin('admin2@example.test')).response.status).toBe(201)
    expect((await createAdmin('admin3@example.test')).response.status).toBe(409)

    const deactivateAdmin = await api.send(`/api/users/${firstAdmin.payload.user.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: false },
    })
    expect(deactivateAdmin.response.status).toBe(200)
    expect((await createAdmin('admin3@example.test')).response.status).toBe(201)
    const exceedLimit = await api.send(`/api/users/${firstAdmin.payload.user.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: true },
    })
    expect(exceedLimit.response.status).toBe(409)

    const employee = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado',
        email: 'employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
      },
    })
    expect(employee.response.status).toBe(201)
    expect(employee.payload.user.mustChangePassword).toBe(true)
  })

  it('restablece contraseñas, revoca sesiones y desactiva cuentas', async () => {
    const createdEmployee = await api.send('/api/users', {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: {
        name: 'Empleado',
        email: 'reset-employee@example.test',
        password: 'employee-password',
        role: 'EMPLOYEE',
      },
    })
    expect(createdEmployee.response.status).toBe(201)
    const employeeSession = await api.loginAndVerify('reset-employee@example.test', 'employee-password')
    const firstPasswordChange = await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: employeeSession.cookie,
      body: {
        currentPassword: 'employee-password',
        newPassword: 'employee-first-password',
      },
    })
    expect(firstPasswordChange.response.status).toBe(200)

    const users = await api.send('/api/users', { cookie: api.superAdminSession.cookie })
    const employee = users.payload.users.find((user) => user.email === 'reset-employee@example.test')
    const reset = await api.send(`/api/users/${employee.id}/reset-password`, {
      method: 'POST',
      cookie: api.superAdminSession.cookie,
      body: { temporaryPassword: 'new-temporary-password' },
    })
    expect(reset.response.status).toBe(204)
    expect((await api.send('/api/data', { cookie: employeeSession.cookie })).response.status).toBe(401)

    const temporarySession = await api.loginAndVerify('reset-employee@example.test', 'new-temporary-password')
    const restricted = await api.send('/api/data', { cookie: temporarySession.cookie })
    expect(restricted.response.status).toBe(403)
    const changed = await api.send('/api/auth/change-password', {
      method: 'POST',
      cookie: temporarySession.cookie,
      body: {
        currentPassword: 'new-temporary-password',
        newPassword: 'employee-permanent-password',
      },
    })
    expect(changed.response.status).toBe(200)

    const deactivate = await api.send(`/api/users/${employee.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: false },
    })
    expect(deactivate.response.status).toBe(200)
    const inactiveLogin = await api.send('/api/auth/login', {
      method: 'POST',
      body: { email: 'reset-employee@example.test', password: 'employee-permanent-password' },
    })
    expect(inactiveLogin.response.status).toBe(401)
    const reactivate = await api.send(`/api/users/${employee.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: true },
    })
    expect(reactivate.response.status).toBe(200)
    const activeLogin = await api.send('/api/auth/login', {
      method: 'POST',
      body: { email: 'reset-employee@example.test', password: 'employee-permanent-password' },
    })
    expect(activeLogin.response.status).toBe(202)
    expect((await api.send(`/api/users/${api.superAdminSession.user.id}`, {
      method: 'PATCH',
      cookie: api.superAdminSession.cookie,
      body: { isActive: false },
    })).response.status).toBe(409)
  })
})
