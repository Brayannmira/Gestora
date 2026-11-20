import { describe, expect, it } from 'vitest'
import { enforcePlanLimit, PLANS } from './plans.js'

describe('límites de planes', () => {
  it.each([
    ['prueba', 'users', 5],
    ['prueba', 'branches', 1],
    ['prueba', 'products', 500],
    ['empresa', 'users', 25],
    ['empresa', 'branches', 5],
    ['empresa', 'products', 5000],
  ])('bloquea %s al alcanzar el límite de %s', (planKey, resource, maximum) => {
    expect(PLANS[planKey]).toBeDefined()
    expect(() => enforcePlanLimit({ planKey, resource, count: maximum - 1 })).not.toThrow()
    expect(() => enforcePlanLimit({ planKey, resource, count: maximum }))
      .toThrow(expect.objectContaining({ status: 409 }))
  })
})
