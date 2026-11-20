import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createTransaction } from '../database/transaction.js'
import { createInventoryRepository } from '../repositories/inventoryRepository.js'
import { createRequestsRepository } from '../repositories/requestsRepository.js'
import { createProductsService } from './productsService.js'
import { createRequestsService } from './requestsService.js'

describe('servicios de solicitudes e inventario', () => {
  let database

  function createServices() {
    database = new DatabaseSync(':memory:')
    database.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        stock INTEGER NOT NULL,
        minimum_stock INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE requests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        stock_deducted INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE inventory_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
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
      INSERT INTO users (id, name) VALUES ('admin-1', 'Administradora');
    `)

    const inventory = createInventoryRepository(database)
    const requests = createRequestsRepository(database)
    const transaction = createTransaction(database)
    return {
      inventory,
      requests,
      productsService: createProductsService({ inventory, transaction }),
      requestsService: createRequestsService({ inventory, requests, transaction }),
    }
  }

  afterEach(() => {
    database?.close()
    database = undefined
  })

  it('descuenta stock al completar y no repite el movimiento al reabrir', () => {
    const { inventory, productsService, requestsService } = createServices()
    const product = productsService.createProduct({
      name: 'Papel',
      stock: 5,
      minimumStock: 3,
      actorId: 'admin-1',
    })
    const request = requestsService.createRequest({
      title: 'Reponer papel',
      description: '',
      productId: product.id,
      quantity: 2,
      priority: 'normal',
      createdBy: 'employee-1',
    })

    const completed = requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', role: 'ADMIN' },
      status: 'completada',
    })
    expect(completed.product.stock).toBe(3)
    expect(completed.notice).toContain('en o bajo el mínimo')

    requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', role: 'ADMIN' },
      status: 'pendiente',
    })
    const completedAgain = requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', role: 'ADMIN' },
      status: 'completada',
    })

    expect(completedAgain.product.stock).toBe(3)
    expect(completedAgain.notice).toContain('no se volvió a descontar')
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE type = 'salida'",
    ).get().count).toBe(1)
    expect(inventory.findById(product.id).stock).toBe(3)
  })

  it('revierte la finalización si el stock es insuficiente', () => {
    const { productsService, requestsService } = createServices()
    const product = productsService.createProduct({
      name: 'Carpetas',
      stock: 1,
      minimumStock: 0,
      actorId: 'admin-1',
    })
    const request = requestsService.createRequest({
      title: 'Solicitar carpetas',
      description: '',
      productId: product.id,
      quantity: 2,
      priority: 'urgente',
      createdBy: 'employee-1',
    })

    expect(() => requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', role: 'ADMIN' },
      status: 'completada',
    })).toThrow(expect.objectContaining({ status: 409 }))
    expect(requestsService.updateRequest({
      requestId: request.id,
      user: { id: 'admin-1', role: 'ADMIN' },
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
      actorId: 'admin-1',
    })

    expect(() => productsService.registerMovement({
      productId: product.id,
      type: 'salida',
      quantity: 3,
      reason: 'Prueba',
      actorId: 'admin-1',
    })).toThrow(expect.objectContaining({ status: 409 }))
    expect(database.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(2)
  })
})
