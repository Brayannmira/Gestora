import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createTransaction } from '../database/transaction.js'
import { createInventoryRepository } from '../repositories/inventoryRepository.js'
import { createAuditRepository } from '../repositories/auditRepository.js'
import { createRequestsRepository } from '../repositories/requestsRepository.js'
import { createAuditService } from './auditService.js'
import { createProductsService } from './productsService.js'
import { createRequestsService } from './requestsService.js'

describe('servicios de solicitudes e inventario', () => {
  let database

  function createServices() {
    database = new DatabaseSync(':memory:')
    database.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE branches (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        stock INTEGER NOT NULL,
        minimum_stock INTEGER NOT NULL,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        barcode TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE requests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'aprobada',
        approved_by TEXT,
        approved_at TEXT,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        stock_deducted INTEGER NOT NULL DEFAULT 0,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE inventory_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        request_id TEXT,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO users (id, name) VALUES ('admin-1', 'Administradora');
      INSERT INTO branches (id, organization_id, name, created_at)
      VALUES ('branch-1', 'org-1', 'Principal', '2026-01-01');
    `)

    const inventory = createInventoryRepository(database)
    const requests = createRequestsRepository(database)
    const audit = createAuditService({
      repository: createAuditRepository(database),
      createId: (() => {
        let id = 0
        return () => `audit-${++id}`
      })(),
    })
    const transaction = createTransaction(database)
    const notifications = {
      notifyManagers: vi.fn(),
      notifyUser: vi.fn(),
    }
    const organizations = {
      getSubscription: () => ({ plan_key: 'empresa', status: 'active' }),
    }
    return {
      inventory,
      requests,
      notifications,
      productsService: createProductsService({
        inventory,
        organizations,
        transaction,
        audit,
        notifications,
      }),
      requestsService: createRequestsService({
        inventory,
        requests,
        transaction,
        audit,
        notifications,
      }),
    }
  }

  afterEach(() => {
    database?.close()
    database = undefined
  })

  it('exige aprobación antes de descontar stock y no repite el movimiento', () => {
    const { inventory, productsService, requestsService, notifications } = createServices()
    const product = productsService.createProduct({
      name: 'Papel',
      stock: 5,
      minimumStock: 3,
      actor: { id: 'admin-1', name: 'Administradora', organization_id: 'org-1' },
    })
    const request = requestsService.createRequest({
      title: 'Reponer papel',
      description: '',
      productId: product.id,
      quantity: 2,
      priority: 'normal',
      actor: { id: 'employee-1', name: 'Empleado', organization_id: 'org-1' },
    })

    expect(() => requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      status: 'completada',
    })).toThrow(expect.objectContaining({ status: 409 }))
    const approved = requestsService.updateApproval({
      requestId: request.id,
      actor: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      approvalStatus: 'aprobada',
    })
    expect(approved.approval_status).toBe('aprobada')

    const completed = requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      status: 'completada',
    })
    expect(completed.product.stock).toBe(3)
    expect(completed.notice).toContain('en o bajo el mínimo')

    expect(() => requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      status: 'pendiente',
    })).toThrow(expect.objectContaining({ status: 409 }))
    const completedAgain = requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      status: 'completada',
    })

    expect(completedAgain.product.stock).toBe(3)
    expect(completedAgain.notice).toContain('no se volvió a descontar')
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE type = 'salida'",
    ).get().count).toBe(1)
    expect(inventory.findById(product.id, 'org-1').stock).toBe(3)
    expect(notifications.notifyUser).toHaveBeenCalledOnce()
    expect(notifications.notifyManagers).toHaveBeenCalled()
  })

  it('no descuenta si el stock es insuficiente aun con aprobación', () => {
    const { productsService, requestsService } = createServices()
    const product = productsService.createProduct({
      name: 'Carpetas',
      stock: 1,
      minimumStock: 0,
      actor: { id: 'admin-1', name: 'Administradora', organization_id: 'org-1' },
    })
    const request = requestsService.createRequest({
      title: 'Solicitar carpetas',
      description: '',
      productId: product.id,
      quantity: 2,
      priority: 'urgente',
      actor: { id: 'employee-1', name: 'Empleado', organization_id: 'org-1' },
    })

    requestsService.updateApproval({
      requestId: request.id,
      actor: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      approvalStatus: 'aprobada',
    })
    expect(() => requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      status: 'completada',
    })).toThrow(expect.objectContaining({ status: 409 }))
    expect(requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', name: 'Administradora', role: 'ADMIN', organization_id: 'org-1' },
      priority: 'importante',
    }).updated.status).toBe('pendiente')
    expect(database.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(1)
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE type = 'salida'",
    ).get().count).toBe(0)
  })

  it('impide movimientos de inventario que dejen stock negativo', () => {
    const { productsService } = createServices()
    const product = productsService.createProduct({
      name: 'Tóner',
      stock: 2,
      minimumStock: 1,
      actor: { id: 'admin-1', name: 'Administradora', organization_id: 'org-1' },
    })

    expect(() => productsService.registerMovement({
      productId: product.id,
      type: 'salida',
      quantity: 3,
      reason: 'Prueba',
      actor: { id: 'admin-1', name: 'Administradora', organization_id: 'org-1' },
    })).toThrow(expect.objectContaining({ status: 409 }))
    expect(database.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(2)
  })
})
