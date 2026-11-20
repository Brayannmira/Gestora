import { useEffect, useState } from 'react'
import { getAuditEvents } from './auditApi.js'

const actionLabels = {
  'request.created': 'Creó una solicitud',
  'request.updated': 'Actualizó una solicitud',
  'request.deleted': 'Eliminó una solicitud',
  'product.created': 'Agregó un producto',
  'product.deleted': 'Eliminó un producto',
  'inventory.movement_recorded': 'Registró un movimiento de inventario',
  'user.created': 'Creó una cuenta',
  'user.activated': 'Reactivó una cuenta',
  'user.deactivated': 'Desactivó una cuenta',
  'user.password_reset': 'Restableció una contraseña',
  'data.legacy_imported': 'Importó datos anteriores',
  'organization.created': 'Creó una empresa',
}

const entityLabels = {
  request: 'Solicitud',
  product: 'Producto',
  user: 'Cuenta',
  migration: 'Importación',
  organization: 'Empresa',
}

const statusLabels = {
  pendiente: 'Pendiente',
  'en-proceso': 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const roleLabels = {
  EMPLOYEE: 'Empleado',
  ADMIN: 'Administrador',
}

function describeEvent(event) {
  const { details } = event
  if (event.action === 'request.created') {
    return `${details.quantity} unidades · prioridad ${details.priority}`
  }
  if (event.action === 'request.updated') {
    const changes = []
    if (details.status) {
      changes.push(
        `Estado: ${statusLabels[details.status.from] ?? details.status.from} → ${statusLabels[details.status.to] ?? details.status.to}`,
      )
    }
    if (details.priority) {
      changes.push(`Prioridad: ${details.priority.from} → ${details.priority.to}`)
    }
    return changes.join(' · ')
  }
  if (event.action === 'product.created') {
    return `Stock inicial: ${details.initialStock} · mínimo: ${details.minimumStock}`
  }
  if (event.action === 'inventory.movement_recorded') {
    return `${details.type}: ${details.previousStock} → ${details.newStock} unidades`
  }
  if (event.action === 'user.created') {
    return `Perfil: ${roleLabels[details.role] ?? details.role}`
  }
  if (event.action === 'user.activated' || event.action === 'user.deactivated') {
    return `Perfil: ${roleLabels[details.role] ?? details.role}`
  }
  if (event.action === 'data.legacy_imported') {
    return `${details.importedProducts} productos · ${details.importedRequests} solicitudes`
  }
  if (event.action === 'organization.created') {
    return details.name
  }
  return ''
}

function AuditPage() {
  const [page, setPage] = useState(1)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [data, setData] = useState({
    events: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  })
  const [loadResult, setLoadResult] = useState({
    queryKey: '',
    status: 'loading',
    error: '',
  })
  const queryKey = `${page}:${reloadVersion}`
  const loadState = loadResult.queryKey === queryKey ? loadResult.status : 'loading'

  useEffect(() => {
    let active = true
    const requestedQueryKey = queryKey

    async function loadPage() {
      try {
        const result = await getAuditEvents({ page, pageSize: 20 })
        if (!active) return
        setData(result)
        if (result.pagination.page !== page) setPage(result.pagination.page)
        setLoadResult({ queryKey: requestedQueryKey, status: 'ready', error: '' })
      } catch (error) {
        if (active) {
          setLoadResult({
            queryKey: requestedQueryKey,
            status: 'error',
            error: error.message,
          })
        }
      }
    }

    loadPage()
    return () => { active = false }
  }, [page, queryKey, reloadVersion])

  return (
    <section className="workspace audit-page" aria-labelledby="audit-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1 id="audit-title">Registro de auditoría</h1>
          <p className="page-description">
            Cambios importantes realizados por administradores y superadministradores.
          </p>
        </div>
        <div className="request-count" aria-live="polite">
          <span className="count-number">{data.pagination.total}</span>
          <span>{data.pagination.total === 1 ? 'evento' : 'eventos'}</span>
        </div>
      </div>

      <section className="requests-panel audit-panel" aria-label="Eventos recientes">
        {loadState === 'loading' ? (
          <div className="data-state" role="status">Cargando auditoría…</div>
        ) : loadState === 'error' ? (
          <div className="data-state error" role="alert">
            <p>No se pudo cargar la auditoría: {loadResult.error}</p>
            <button
              className="show-all-button"
              type="button"
              onClick={() => setReloadVersion((current) => current + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : data.events.length === 0 ? (
          <div className="empty-state">
            <h2>Aún no hay eventos</h2>
            <p>Los cambios importantes aparecerán aquí.</p>
          </div>
        ) : (
          <ol className="audit-event-list" aria-busy={loadState === 'loading'}>
            {data.events.map((event) => (
              <li className="audit-event" key={event.id}>
                <div className="audit-event-copy">
                  <strong>{event.actorName}</strong>
                  <span>{actionLabels[event.action] ?? 'Realizó una acción'}</span>
                  <p>{describeEvent(event)}</p>
                  <small>
                    {entityLabels[event.entityType] ?? event.entityType}
                    {event.entityId ? ` · ${event.entityId}` : ''}
                  </small>
                </div>
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString('es-ES')}
                </time>
              </li>
            ))}
          </ol>
        )}

        {loadState === 'ready' && data.pagination.total > 0 && (
          <nav className="request-pagination" aria-label="Paginación de auditoría">
            <button
              className="show-all-button"
              type="button"
              disabled={data.pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </button>
            <span>
              Página {data.pagination.page} de {data.pagination.totalPages}
            </span>
            <button
              className="show-all-button"
              type="button"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))}
            >
              Siguiente
            </button>
          </nav>
        )}
      </section>
    </section>
  )
}

export default AuditPage
