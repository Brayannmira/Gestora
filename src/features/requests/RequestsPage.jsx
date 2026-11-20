import { useEffect, useState } from 'react'
import { getRequests } from './requestsApi.js'
import showSweetAlert from '../../sweetAlert.js'
import {
  readSessionPreference,
  REQUEST_FILTERS_KEY,
  writeSessionPreference,
} from '../../sessionPreferences.js'

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
  canManageRequests,
  onCreateRequest,
  onDeleteRequest,
  onUpdateRequest,
  onReviewRequest,
  onSearchChange,
  searchQuery = '',
  isMutating = false,
}) {
  const [storedFilters] = useState(() => readSessionPreference(REQUEST_FILTERS_KEY, {}))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [statusFilter, setStatusFilter] = useState(() =>
    statuses.some((status) => status.value === storedFilters.statusFilter)
      ? storedFilters.statusFilter
      : 'todas',
  )
  const [priorityFilter, setPriorityFilter] = useState(() =>
    priorities.some((option) => option.value === storedFilters.priorityFilter)
      ? storedFilters.priorityFilter
      : 'todas',
  )
  const [approvalFilter, setApprovalFilter] = useState(() =>
    ['todas', 'pendiente', 'aprobada', 'rechazada'].includes(storedFilters.approvalFilter)
      ? storedFilters.approvalFilter
      : 'todas',
  )
  const [quickFilter, setQuickFilter] = useState(() =>
    [null, 'todas', 'urgentes', 'pendientes-aprobacion', 'en-proceso'].includes(storedFilters.quickFilter)
      ? storedFilters.quickFilter
      : 'todas',
  )
  const [listSearch, setListSearch] = useState(() =>
    typeof storedFilters.listSearch === 'string' ? storedFilters.listSearch : '',
  )
  const [dateFrom, setDateFrom] = useState(() =>
    typeof storedFilters.dateFrom === 'string' ? storedFilters.dateFrom : '',
  )
  const [dateTo, setDateTo] = useState(() =>
    typeof storedFilters.dateTo === 'string' ? storedFilters.dateTo : '',
  )
  const [formErrors, setFormErrors] = useState({})
  const [pendingRequestId, setPendingRequestId] = useState(null)
  const [page, setPage] = useState(() =>
    Number.isSafeInteger(storedFilters.page) && storedFilters.page > 0
      ? storedFilters.page
      : 1,
  )
  const [reloadVersion, setReloadVersion] = useState(0)
  const [requestData, setRequestData] = useState({
    requests: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    filterCounts: { all: 0, urgent: 0, inProgress: 0, awaitingApproval: 0 },
  })
  const effectiveSearch = listSearch.trim() || searchQuery.trim()
  const normalizedSearch = effectiveSearch.toLocaleLowerCase()
  const { requests, pagination, filterCounts } = requestData
  const filteredRequests = requests
  const dateRangeError = dateFrom && dateTo && dateFrom > dateTo
    ? 'La fecha inicial no puede ser posterior a la fecha final.'
    : ''
  const selectedProduct = products.find((product) => product.id === productId)
  const requestQueryKey = JSON.stringify({
    page,
    priorityFilter,
    approvalFilter,
    reloadVersion,
    search: effectiveSearch,
    statusFilter,
    dateFrom,
    dateTo,
  })
  const [requestLoadResult, setRequestLoadResult] = useState({
    queryKey: '',
    status: 'loading',
    error: '',
  })
  const requestLoadState = requestLoadResult.queryKey === requestQueryKey
    ? requestLoadResult.status
    : 'loading'
  const requestLoadError = requestLoadResult.error

  useEffect(() => {
    writeSessionPreference(REQUEST_FILTERS_KEY, {
      statusFilter,
      priorityFilter,
      approvalFilter,
      quickFilter,
      listSearch,
      dateFrom,
      dateTo,
      page,
    })
  }, [approvalFilter, dateFrom, dateTo, listSearch, page, priorityFilter, quickFilter, statusFilter])

  useEffect(() => {
    if (dateRangeError) return undefined

    let active = true
    const queryKey = requestQueryKey
    const timer = window.setTimeout(async () => {
      try {
        const result = await getRequests({
          page,
          pageSize: 20,
          status: statusFilter,
          priority: priorityFilter,
          approvalStatus: approvalFilter,
          search: effectiveSearch,
          dateFrom,
          dateTo,
        })
        if (!active) return
        setRequestData(result)
        if (result.pagination.page !== page) setPage(result.pagination.page)
        setRequestLoadResult({ queryKey, status: 'ready', error: '' })
      } catch (error) {
        if (!active) return
        setRequestLoadResult({ queryKey, status: 'error', error: error.message })
      }
    }, effectiveSearch ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [approvalFilter, dateFrom, dateRangeError, dateTo, effectiveSearch, page, priorityFilter, reloadVersion, requestQueryKey, statusFilter])

  const filters = [
    { value: 'todas', label: 'Todas', count: filterCounts.all },
    { value: 'pendientes-aprobacion', label: 'Por aprobar', count: filterCounts.awaitingApproval },
    {
      value: 'urgentes',
      label: 'Urgentes',
      count: filterCounts.urgent,
    },
    {
      value: 'en-proceso',
      label: 'En proceso',
      count: filterCounts.inProgress,
    },
  ]

  const filtersActive = statusFilter !== 'todas' ||
    priorityFilter !== 'todas' ||
    approvalFilter !== 'todas' ||
    Boolean(dateFrom) ||
    Boolean(dateTo)
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
    approvalFilter === 'todas'
      ? ''
      : approvalFilter === 'pendiente'
        ? 'Por aprobar'
        : approvalFilter === 'aprobada'
          ? 'Aprobadas'
          : 'Rechazadas',
    dateFrom ? `Desde ${dateFrom}` : '',
    dateTo ? `Hasta ${dateTo}` : '',
  ].filter(Boolean).join(' · ')
  const listTitle = filtersActive
    ? `Solicitudes · ${currentFilterLabel}`
    : 'Todas las solicitudes'

  async function updateRequest(request, updates) {
    setPendingRequestId(request.id)
    try {
      const result = await onUpdateRequest(request.id, updates)
      if (result) setReloadVersion((current) => current + 1)
      return result
    } finally {
      setPendingRequestId(null)
    }
  }

  async function handleReviewRequest(request, approvalStatus) {
    const approved = approvalStatus === 'aprobada'
    const confirmation = await showSweetAlert({
      icon: approved ? 'question' : 'warning',
      title: approved ? '¿Aprobar solicitud?' : '¿Rechazar solicitud?',
      text: approved
        ? 'La aprobación permitirá procesarla. El inventario se descontará únicamente al completarla.'
        : 'La solicitud quedará rechazada y no se descontará inventario.',
      showCancelButton: true,
      confirmButtonText: approved ? 'Sí, aprobar' : 'Sí, rechazar',
      cancelButtonText: 'Volver',
      reverseButtons: true,
    })
    if (!confirmation.isConfirmed) return
    setPendingRequestId(request.id)
    try {
      const result = await onReviewRequest(request.id, approvalStatus)
      if (result) setReloadVersion((current) => current + 1)
    } finally {
      setPendingRequestId(null)
    }
  }

  function resetFilters() {
    setStatusFilter('todas')
    setPriorityFilter('todas')
    setApprovalFilter('todas')
    setQuickFilter('todas')
    setListSearch('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    onSearchChange('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const product = products.find((current) => current.id === productId)
    const errors = {}
    if (!title.trim()) errors.title = 'Escribe un título para la solicitud.'
    if (!product) errors.productId = 'Selecciona un producto.'
    if (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) {
      errors.quantity = 'La cantidad debe ser un número entero mayor que cero.'
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    const newRequest = {
      title: title.trim(),
      description: description.trim(),
      priority,
      productId: product.id,
      quantity: Number(quantity),
    }

    const result = await onCreateRequest(newRequest)
    if (!result) return
    setReloadVersion((current) => current + 1)
    setTitle('')
    setDescription('')
    setPriority('normal')
    setProductId('')
    setQuantity('1')
  }

  async function handleCancelRequest(request) {
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: '¿Cancelar solicitud?',
      text: `Se cancelará “${request.title}”. El inventario no se modificará.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) {
      await updateRequest(request, { status: 'cancelada' })
    }
  }

  async function handleCompleteRequest(request) {
    const product = products.find((item) => item.id === request.productId)
    if (!product) {
      await showSweetAlert({
        icon: 'error',
        title: 'No se encontró el producto',
        text: 'Actualiza los datos e inténtalo de nuevo.',
        confirmButtonText: 'Entendido',
      })
      return
    }

    const hasEnoughStock = request.stockDeducted || product.stock >= request.quantity
    if (!hasEnoughStock) {
      await showSweetAlert({
        icon: 'error',
        title: 'Stock insuficiente',
        text: `Hay ${product.stock} unidades de ${product.name} y se necesitan ${request.quantity}. No se modificará el inventario.`,
        confirmButtonText: 'Entendido',
      })
      return
    }

    const remainingStock = request.stockDeducted
      ? product.stock
      : product.stock - request.quantity
    const stockMessage = request.stockDeducted
      ? 'El inventario ya se descontó anteriormente; no se descontará otra vez.'
      : `Se descontarán ${request.quantity} unidades de ${product.name}. Quedarán ${remainingStock} (mínimo: ${product.minimumStock}).`
    const confirmation = await showSweetAlert({
      icon: 'question',
      title: '¿Completar solicitud?',
      text: stockMessage,
      showCancelButton: true,
      confirmButtonText: 'Sí, completar',
      cancelButtonText: 'Volver',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) {
      await updateRequest(request, { status: 'completada' })
    }
  }

  async function handleDelete(request) {
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: '¿Borrar solicitud?',
      text: `Se borrará “${request.title}”. Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Volver',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) {
      const result = await onDeleteRequest(request.id)
      if (result) setReloadVersion((current) => current + 1)
    }
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
          <span className="count-number">{pagination.total}</span>
          <span>{pagination.total === 1 ? 'solicitud' : 'solicitudes'}</span>
        </div>
      </div>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="form-title">Nueva solicitud</h2>
              <p>Las solicitudes requieren aprobación antes de procesarse.</p>
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
              aria-invalid={Boolean(formErrors.title)}
              aria-describedby={formErrors.title ? 'request-title-error' : undefined}
              onChange={(event) => {
                setTitle(event.target.value)
                setFormErrors((current) => ({ ...current, title: '' }))
              }}
              onInvalid={() => setFormErrors((current) => ({
                ...current,
                title: 'Escribe un título para la solicitud.',
              }))}
              maxLength={100}
              required
            />
            {formErrors.title && <p className="field-error" id="request-title-error" role="alert">{formErrors.title}</p>}

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
                  aria-invalid={Boolean(formErrors.productId)}
                  aria-describedby={formErrors.productId ? 'request-product-error' : undefined}
                  onChange={(event) => {
                    setProductId(event.target.value)
                    setFormErrors((current) => ({ ...current, productId: '' }))
                  }}
                  onInvalid={() => setFormErrors((current) => ({
                    ...current,
                    productId: 'Selecciona un producto.',
                  }))}
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
                {formErrors.productId && <p className="field-error" id="request-product-error" role="alert">{formErrors.productId}</p>}
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
                  aria-invalid={Boolean(formErrors.quantity)}
                  aria-describedby={formErrors.quantity ? 'request-quantity-error' : undefined}
                  onChange={(event) => {
                    setQuantity(event.target.value)
                    setFormErrors((current) => ({ ...current, quantity: '' }))
                  }}
                  onInvalid={() => setFormErrors((current) => ({
                    ...current,
                    quantity: 'La cantidad debe ser un número entero mayor que cero.',
                  }))}
                  required
                />
                {formErrors.quantity && <p className="field-error" id="request-quantity-error" role="alert">{formErrors.quantity}</p>}
              </div>
            </div>

            {products.length === 0 ? (
              <p className="form-hint">Agrega primero un producto en Inventario.</p>
            ) : selectedProduct ? (
              <p className="form-hint">
                Disponible: {selectedProduct.stock} unidades. El stock solo se descuenta al completar una solicitud aprobada.
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

        <section
          className="requests-panel"
          aria-busy={requestLoadState === 'loading'}
          aria-labelledby="list-title"
        >
          <div className="list-heading">
            <div>
              <h2 id="list-title">{listTitle}</h2>
              <p>
                {pagination.total}{' '}
                {pagination.total === 1 ? 'resultado' : 'resultados'}
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
            onChange={(event) => {
              setListSearch(event.target.value)
              onSearchChange('')
              setPage(1)
            }}
          />

          <div className="request-filter-controls">
            <div className="filter-buttons" role="group" aria-label="Filtros rápidos">
              {filters.map((filter) => {
                const nextFilters = filter.value === 'urgentes'
                  ? { status: 'todas', priority: 'urgente' }
                  : filter.value === 'pendientes-aprobacion'
                    ? { status: 'todas', priority: 'todas' }
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
                      setApprovalFilter(filter.value === 'pendientes-aprobacion' ? 'pendiente' : 'todas')
                      setQuickFilter(filter.value)
                      setPage(1)
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
                Aprobación
                <select
                  aria-label="Filtrar por estado de aprobación"
                  value={approvalFilter}
                  onChange={(event) => {
                    setApprovalFilter(event.target.value)
                    setQuickFilter(null)
                    setPage(1)
                  }}
                >
                  <option value="todas">Todas</option>
                  <option value="pendiente">Por aprobar</option>
                  <option value="aprobada">Aprobadas</option>
                  <option value="rechazada">Rechazadas</option>
                </select>
              </label>
              <label>
                Estado
                <select
                  aria-label="Filtrar por estado"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value)
                    setQuickFilter(null)
                    setPage(1)
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
                    setPage(1)
                  }}
                >
                  <option value="todas">Todas las prioridades</option>
                  {priorities.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <input
                  aria-label="Filtrar solicitudes desde la fecha"
                  max={dateTo || undefined}
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value)
                    setPage(1)
                  }}
                />
              </label>
              <label>
                Hasta
                <input
                  aria-describedby={dateRangeError ? 'request-date-range-error' : undefined}
                  aria-invalid={Boolean(dateRangeError)}
                  aria-label="Filtrar solicitudes hasta la fecha"
                  min={dateFrom || undefined}
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value)
                    setPage(1)
                  }}
                />
              </label>
              {(filtersActive || listSearch) && (
                <button className="show-all-button" type="button" onClick={resetFilters}>
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {dateRangeError ? (
            <p className="field-error" id="request-date-range-error" role="alert">{dateRangeError}</p>
          ) : requestLoadState === 'loading' ? (
            <div className="data-state" role="status">Cargando solicitudes…</div>
          ) : requestLoadState === 'error' ? (
            <div className="data-state error" role="alert">
              <p>No se pudieron cargar las solicitudes: {requestLoadError}</p>
              <button
                className="show-all-button"
                type="button"
                onClick={() => setReloadVersion((current) => current + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : filteredRequests.length === 0 ? (
            normalizedSearch ? (
              <div className="empty-state filtered-empty-state">
                <span className="empty-icon" aria-hidden="true">⌕</span>
                <h3>No hay resultados para “{effectiveSearch}”</h3>
                <p>Prueba con otro término o cambia los filtros.</p>
              </div>
            ) : filterCounts.all === 0 ? (
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
                              request.status === 'completada' ||
                              request.approvalStatus !== 'aprobada' ||
                              isMutating ||
                              pendingRequestId === request.id
                            }
                            onChange={(event) => {
                              if (event.target.value === 'completada') {
                                void handleCompleteRequest(request)
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
                      <span className={`approval-badge approval-${request.approvalStatus}`}>
                        {request.approvalStatus === 'pendiente'
                          ? 'Pendiente de aprobación'
                          : request.approvalStatus === 'aprobada'
                            ? 'Aprobada'
                            : 'Rechazada'}
                      </span>
                    </div>
                    <p className="request-stock">
                      Producto: <strong>{request.productName}</strong> · Cantidad:{' '}
                      <strong>{request.quantity}</strong>
                      {request.branchName && <> · Sucursal: <strong>{request.branchName}</strong></>}
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
                    {canManageRequests &&
                      request.approvalStatus === 'pendiente' &&
                      request.status !== 'cancelada' && (
                        <>
                          <button
                            className="filter-button"
                            type="button"
                            disabled={isMutating || pendingRequestId === request.id}
                            onClick={() => void handleReviewRequest(request, 'aprobada')}
                          >
                            Aprobar
                          </button>
                          <button
                            className="delete-button"
                            type="button"
                            disabled={isMutating || pendingRequestId === request.id}
                            onClick={() => void handleReviewRequest(request, 'rechazada')}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    {request.status !== 'completada' &&
                      request.status !== 'cancelada' &&
                      !request.stockDeducted && (
                        <button
                          className="delete-button"
                          type="button"
                          disabled={isMutating || pendingRequestId === request.id}
                          onClick={() => void handleCancelRequest(request)}
                        >
                          Cancelar
                        </button>
                      )}
                    {canManageRequests &&
                      request.status !== 'completada' &&
                      request.status !== 'cancelada' &&
                      !request.stockDeducted && (
                      <button
                        className="delete-button"
                        type="button"
                        disabled={isMutating || pendingRequestId === request.id}
                        onClick={() => void handleDelete(request)}
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
          {requestLoadState === 'ready' && pagination.total > 0 && (
            <nav className="request-pagination" aria-label="Paginación de solicitudes">
              <button
                className="show-all-button"
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </button>
              <span>
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                className="show-all-button"
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              >
                Siguiente
              </button>
            </nav>
          )}
        </section>
      </div>
    </section>
  )
}

export default RequestsPage
