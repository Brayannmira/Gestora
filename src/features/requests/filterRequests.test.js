import { describe, expect, it } from 'vitest'
import { filterRequests } from './filterRequests.js'

describe('filtros de solicitudes', () => {
  const requests = [
    { title: 'Papel urgente', description: 'Oficina', productName: 'Resma A4', priority: 'urgente', status: 'en-proceso' },
    { title: 'Tinta', description: '', priority: 'normal', status: 'pendiente' },
    { title: 'Solicitud cancelada', description: '', priority: 'urgente', status: 'cancelada' },
  ]

  it('filtra por prioridad, estado y búsqueda sin incluir canceladas en en proceso', () => {
    expect(filterRequests(requests, 'urgentes')).toHaveLength(1)
    expect(filterRequests(requests, 'en-proceso')).toHaveLength(1)
    expect(filterRequests(requests, 'todas', 'tinta')).toHaveLength(1)
  })

  it('combina estado, prioridad y búsqueda', () => {
    expect(
      filterRequests(requests, { status: 'en-proceso', priority: 'urgente' }),
    ).toHaveLength(1)
    expect(
      filterRequests(requests, { status: 'pendiente', priority: 'urgente' }),
    ).toHaveLength(0)
    expect(
      filterRequests(requests, { status: 'todas', priority: 'urgente' }, 'oficina'),
    ).toHaveLength(1)
    expect(
      filterRequests(requests, {
        status: 'todas',
        priority: 'urgente',
        quickFilter: 'urgentes',
      }),
    ).toHaveLength(1)
    expect(
      filterRequests(requests, { status: 'todas', priority: 'todas' }, 'resma'),
    ).toHaveLength(1)
  })
})
