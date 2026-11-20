import { useState } from 'react'
import { filterRequests } from './filterRequests.js'

const priorities = [
  { value: 'urgente', label: 'Urgente' },
  { value: 'importante', label: 'Importante' },
  { value: 'normal', label: 'Normal' },
]

const statuses = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en-proceso', label: 'En proceso' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

function RequestsPage({
  products,
  requests,
  canManageRequests,
  onCreateRequest,
  onDeleteRequest,
  onUpdateRequest,
  searchQuery = '',
  isMutating = false,
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [statusFilter, setStatusFilter] = useState('todas')
  const [priorityFilter, setPriorityFilter] = useState('todas')
  const [quickFilter, setQuickFilter] = useState('todas')
  const [listSearch, setListSearch] = useState('')
  const [cancelConfirmId, setCancelConfirmId] = useState(null)
  const [completionConfirmId, setCompletionConfirmId] = useState(null)
  const [pendingRequestId, setPendingRequestId] = useState(null)
  const effectiveSearch = listSearch.trim() || searchQuery.trim()
  const normalizedSearch = effectiveSearch.toLocaleLowerCase()
  const filteredRequests = filterRequests(
    requests,
    { status: statusFilter, priority: priorityFilter, quickFilter },
    effectiveSearch,
  )
  const selectedProduct = products.find((product) => product.id === productId)

  const filters = [
    { value: 'todas', label: 'Todas', count: requests.length },
    {
      value: 'urgentes',
      label: 'Urgentes',
      count: requests.filter(
        (request) => request.priority === 'urgente' && request.status !== 'cancelada',
      ).length,
    },
    {
      value: 'en-proceso',
      label: 'En proceso',
      count: requests.filter((request) => request.status === 'en-proceso').length,
    },
  ]

  const filtersActive = statusFilter !== 'todas' || priorityFilter !== 'todas'
  const activeQuickFilter = quickFilter === null
    ? filtersActive ? null : 'todas'
    : quickFilter
  const currentFilterLabel = [
    statusFilter === 'todas'
      ? ''
      : statuses.find((option) => option.value === statusFilter)?.label,
    priorityFilter === 'todas'
      ? ''
      : priorities.find((option) => option.value === priorityFilter)?.label,
  ].filter(Boolean).join(' · ')
  const listTitle = filtersActive
    ? `Solicitudes · ${currentFilterLabel}`
    : 'Todas las solicitudes'

  async function updateRequest(request, updates) {
    setPendingRequestId(request.id)
    try {
      const result = await onUpdateRequest(request.id, updates)
      if (result) {
        setCancelConfirmId(null)
        setCompletionConfirmId(null)
      }
      return result
    } finally {
      setPendingRequestId(null)
    }
  }

  function resetFilters() {
    setStatusFilter('todas')
    setPriorityFilter('todas')
    setQuickFilter('todas')
    setListSearch('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const product = products.find((current) => current.id === productId)
    if (!product) return

    const newRequest = {
      title: title.trim(),
      description: description.trim(),
      priority,
      productId: product.id,
      quantity: Number(quantity),
    }

    const result = await onCreateRequest(newRequest)
    if (!result) return
    setTitle('')
    setDescription('')
    setPriority('normal')
    setProductId('')
    setQuantity('1')
  }

  function handleDelete(id) {
    onDeleteRequest(id)
  }

  return (
    <section className="workspace" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZACIÓN</p>
          <h1 id="page-title">Solicitudes</h1>
          <p className="page-description">
            Registra y organiza las solicitudes de tu equipo en un solo lugar.
          </p>
        </div>
        <div className="request-count" aria-live="polite">
          <span className="count-number">{requests.length}</span>
          <span>{requests.length === 1 ? 'solicitud' : 'solicitudes'}</span>
        </div>
      </div>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="form-title">Nueva solicitud</h2>
              <p>Completa los datos para agregarla a tu lista.</p>
            </div>
          </div>

          <form aria-busy={isMutating} onSubmit={handleSubmit}>
            <label htmlFor="request-title">Título</label>
            <input
              id="request-title"
              name="title"
              type="text"
              placeholder="Ej. Reponer material de oficina"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
            />

            <label htmlFor="request-description">
              Descripción <span className="optional">(opcional)</span>
            </label>
            <textarea
              id="request-description"
              name="description"
              placeholder="Agrega detalles que ayuden a entender la solicitud..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={500}
            />

            <div className="select-grid">
              <div className="field-group">
                <label htmlFor="request-product">Producto</label>
                <select
                  id="request-product"
                  name="productId"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                  disabled={products.length === 0}
                >
                  <option value="" disabled>Selecciona un producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} (stock: {product.stock})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="request-quantity">Cantidad</label>
                <input
                  id="request-quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </div>
            </div>

            {products.length === 0 ? (
              <p className="form-hint">Agrega primero un producto en Inventario.</p>
            ) : selectedProduct ? (
              <p className="form-hint">
                Disponible: {selectedProduct.stock} unidades. El stock se valida al completar.
              </p>
            ) : null}

            <div className="field-group">
              <label htmlFor="request-priority">Prioridad</label>
              <select
                id="request-priority"
                name="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {priorities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="submit-button"
              type="submit"
              disabled={products.length === 0 || isMutating}
            >
              <span aria-hidden="true">+</span>
              {isMutating ? 'Guardando…' : 'Agregar solicitud'}
            </button>
          </form>
        </section>

        <section className="requests-panel" aria-labelledby="list-title">
          <div className="list-heading">
            <div>
              <h2 id="list-title">{listTitle}</h2>
              <p>
                {filteredRequests.length}{' '}
                {filteredRequests.length === 1 ? 'resultado' : 'resultados'}
              </p>
            </div>
          </div>

          <label className="request-search-label" htmlFor="request-search">
            Buscar solicitudes
          </label>
          <input
            className="request-search"
            id="request-search"
            type="search"
            placeholder="Título, descripción o producto"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
          />

          <div className="request-filter-controls">
            <div className="filter-buttons" role="group" aria-label="Filtros rápidos">
              {filters.map((filter) => {
                const nextFilters = filter.value === 'urgentes'
                  ? { status: 'todas', priority: 'urgente' }
                  : filter.value === 'en-proceso'
                    ? { status: 'en-proceso', priority: 'todas' }
                    : { status: 'todas', priority: 'todas' }
                return (
                  <button
                    className={`filter-button${activeQuickFilter === filter.value ? ' active' : ''}`}
                    key={filter.value}
                    type="button"
                    aria-pressed={activeQuickFilter === filter.value}
                    onClick={() => {
                      setStatusFilter(nextFilters.status)
                      setPriorityFilter(nextFilters.priority)
                      setQuickFilter(filter.value)
                    }}
                  >
                    {filter.label}
                    <span>{filter.count}</span>
                  </button>
                )
              })}
            </div>
            <div className="request-filter-selects">
              <label>
                Estado
                <select
                  aria-label="Filtrar por estado"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value)
                    setQuickFilter(null)
                  }}
                >
                  <option value="todas">Todos los estados</option>
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <select
                  aria-label="Filtrar por prioridad"
                  value={priorityFilter}
                  onChange={(event) => {
                    setPriorityFilter(event.target.value)
                    setQuickFilter(null)
                  }}
                >
                  <option value="todas">Todas las prioridades</option>
                  {priorities.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {(filtersActive || listSearch) && (
                <button className="show-all-button" type="button" onClick={resetFilters}>
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            normalizedSearch ? (
              <div className="empty-state filtered-empty-state">
                <span className="empty-icon" aria-hidden="true">⌕</span>
                <h3>No hay resultados para “{effectiveSearch}”</h3>
                <p>Prueba con otro término o cambia los filtros.</p>
              </div>
            ) :             requests.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">☰</span>
                <h3>Aún no hay solicitudes</h3>
                <p>Cuando agregues una, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="empty-state filtered-empty-state">
                <span className="empty-icon" aria-hidden="true">⌕</span>
                <h3>No hay solicitudes que coincidan</h3>
                <p>Prueba con otra combinación de estado y prioridad.</p>
                <button
                  className="show-all-button"
                  type="button"
                  onClick={resetFilters}
                >
                  Limpiar filtros
                </button>
              </div>
            )
          ) : (
            <ul className="request-list">
              {filteredRequests.map((request) => (
                <li className="request-card" key={request.id}>
                  <div className="request-card-content">
                    <h3>{request.title}</h3>
                    <div className="request-tags">
                      {canManageRequests ? (
                        <>
                          <select
                            className={`tag-select priority-${request.priority}`}
                            aria-label={`Cambiar prioridad de ${request.title}`}
                            value={request.priority}
                            disabled={isMutating || pendingRequestId === request.id}
                            onChange={(event) =>
                              updateRequest(request, { priority: event.target.value })
                            }
                          >
                            {priorities.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <select
                            className={`tag-select status-${request.status}`}
                            aria-label={`Cambiar estado de ${request.title}`}
                            value={request.status}
                            disabled={
                              request.status === 'cancelada' ||
                              isMutating ||
                              pendingRequestId === request.id
                            }
                            onChange={(event) => {
                              if (event.target.value === 'completada') {
                                setCompletionConfirmId(request.id)
                                setCancelConfirmId(null)
                              } else {
                                void updateRequest(request, { status: event.target.value })
                              }
                            }}
                          >
                            {statuses
                              .filter((option) =>
                                option.value !== 'cancelada' || request.status === 'cancelada',
                              )
                              .map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                          </select>
                        </>
                      ) : (
                        <span className={`tag-select status-${request.status}`}>
                          {statuses.find((option) => option.value === request.status)?.label}
                        </span>
                      )}
                    </div>
                    <p className="request-stock">
                      Producto: <strong>{request.productName}</strong> · Cantidad:{' '}
                      <strong>{request.quantity}</strong>
                      {request.stockDeducted && ' · Stock descontado'}
                    </p>
                    {request.description && <p>{request.description}</p>}
                    {request.stockDeducted && request.status !== 'completada' && (
                      <p className="request-reopened-note" role="status">
                        Solicitud reabierta: no se devuelve ni se vuelve a descontar el stock.
                      </p>
                    )}
                    <span className="request-date">
                      Creada el {request.createdAt}
                    </span>
                  </div>
                  <div className="request-actions">
                    {request.status !== 'completada' &&
                      request.status !== 'cancelada' &&
                      !request.stockDeducted &&
                      cancelConfirmId !== request.id && (
                        <button
                          className="delete-button"
                          type="button"
                          disabled={isMutating || pendingRequestId === request.id}
                          onClick={() => setCancelConfirmId(request.id)}
                        >
                          Cancelar
                        </button>
                      )}
                    {cancelConfirmId === request.id && (
                      <div className="cancel-confirm" role="group" aria-label={`Confirmar cancelación de ${request.title}`}>
                        <span>¿Cancelar?</span>
                        <button
                          className="delete-button"
                          type="button"
                          disabled={isMutating || pendingRequestId === request.id}
                          onClick={() => void updateRequest(request, { status: 'cancelada' })}
                        >
                          {pendingRequestId === request.id ? 'Guardando…' : 'Confirmar'}
                        </button>
                        <button
                          className="show-all-button"
                          type="button"
                          disabled={pendingRequestId === request.id}
                          onClick={() => setCancelConfirmId(null)}
                        >
                          Volver
                        </button>
                      </div>
                    )}
                    {completionConfirmId === request.id && (() => {
                      const product = products.find((item) => item.id === request.productId)
                      const availableStock = product?.stock ?? 0
                      const hasEnoughStock = request.stockDeducted ||
                        (product && availableStock >= request.quantity)
                      const remainingStock = request.stockDeducted
                        ? availableStock
                        : availableStock - request.quantity
                      return (
                        <div
                          className="completion-confirm"
                          role="group"
                          aria-label={`Confirmar finalización de ${request.title}`}
                          aria-live="polite"
                        >
                          <strong>Confirmar finalización</strong>
                          {request.stockDeducted ? (
                            <p>El inventario ya se descontó anteriormente; no se descontará otra vez.</p>
                          ) : product ? (
                            hasEnoughStock ? (
                              <p>
                                Se descontarán {request.quantity} de {product.name}. Quedarán{' '}
                                {remainingStock} unidades (mínimo: {product.minimumStock}).
                              </p>
                            ) : (
                              <p className="form-error" role="alert">
                                No se puede completar: hay {availableStock} unidades y se necesitan{' '}
                                {request.quantity}. El stock no se modificará.
                              </p>
                            )
                          ) : (
                            <p role="alert">No se encontró el producto asociado. Actualiza los datos e inténtalo de nuevo.</p>
                          )}
                          <div className="completion-confirm-actions">
                            <button
                              className="submit-button"
                              type="button"
                              disabled={!hasEnoughStock || isMutating || pendingRequestId === request.id}
                              onClick={() => void updateRequest(request, { status: 'completada' })}
                            >
                              {pendingRequestId === request.id ? 'Guardando…' : 'Confirmar y completar'}
                            </button>
                            <button
                              className="show-all-button"
                              type="button"
                              disabled={pendingRequestId === request.id}
                              onClick={() => setCompletionConfirmId(null)}
                            >
                              Volver
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                    {canManageRequests &&
                      request.status !== 'completada' &&
                      request.status !== 'cancelada' &&
                      !request.stockDeducted && (
                      <button
                        className="delete-button"
                        type="button"
                        disabled={isMutating || pendingRequestId === request.id}
                        onClick={() => handleDelete(request.id)}
                        aria-label={`Borrar solicitud: ${request.title}`}
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

export default RequestsPage
