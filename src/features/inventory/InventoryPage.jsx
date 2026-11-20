import { useEffect, useRef, useState } from 'react'
import showSweetAlert from '../../sweetAlert.js'
import {
  INVENTORY_FILTERS_KEY,
  readSessionPreference,
  writeSessionPreference,
} from '../../sessionPreferences.js'

function InventoryPage({
  products,
  requests,
  movements,
  onAddProduct,
  onAddMovement,
  onDeleteProduct,
  onCreateBranch,
  branches = [],
  searchQuery = '',
  isMutating = false,
}) {
  const [storedFilters] = useState(() => readSessionPreference(INVENTORY_FILTERS_KEY, {}))
  const [entered, setEntered] = useState(false)
  const [name, setName] = useState('')
  const [stock, setStock] = useState('')
  const [minimumStock, setMinimumStock] = useState('')
  const [barcode, setBarcode] = useState('')
  const [branchId, setBranchId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState(() =>
    typeof storedFilters.barcodeSearch === 'string' ? storedFilters.barcodeSearch : '',
  )
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [movementType, setMovementType] = useState('entrada')
  const [historyFilter, setHistoryFilter] = useState(() =>
    ['todos', 'entrada', 'salida', 'ajuste'].includes(storedFilters.historyFilter)
      ? storedFilters.historyFilter
      : 'todos',
  )
  const [lowStockOnly, setLowStockOnly] = useState(storedFilters.lowStockOnly === true)
  const [movementQuantity, setMovementQuantity] = useState('1')
  const [movementReason, setMovementReason] = useState('')
  const [productErrors, setProductErrors] = useState({})
  const [movementErrors, setMovementErrors] = useState({})
  const [branchError, setBranchError] = useState('')
  const productFormRef = useRef(null)
  const movementFormRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    writeSessionPreference(INVENTORY_FILTERS_KEY, {
      barcodeSearch,
      historyFilter,
      lowStockOnly,
    })
  }, [barcodeSearch, historyFilter, lowStockOnly])

  useEffect(() => {
    if (!scanOpen) return undefined

    let active = true
    let controls
    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!active) return
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || !active) return
          setBarcodeSearch(result.getText().trim())
          setScanError('')
          setScanOpen(false)
          controls?.stop()
        })
        if (!active) controls.stop()
      } catch (error) {
        if (active) {
          setScanError(`No se pudo iniciar la cámara: ${error.message}`)
          setScanOpen(false)
        }
      }
    }
    void startScanner()

    return () => {
      active = false
      controls?.stop()
    }
  }, [scanOpen])

  function shakeForm(formRef) {
    const form = formRef.current
    if (!form) return
    form.classList.remove('error-shake')
    void form.offsetWidth
    form.classList.add('error-shake')
  }

  const lookupSearch = barcodeSearch.trim() || searchQuery.trim()
  const normalizedSearch = lookupSearch.toLocaleLowerCase()
  const lowStockProducts = products.filter(
    (product) => product.stock <= product.minimumStock,
  )
  const filteredProducts = products.filter((product) =>
    (
      product.name.toLocaleLowerCase().includes(normalizedSearch) ||
      product.barcode?.toLocaleLowerCase().includes(normalizedSearch)
    ) &&
    (!lowStockOnly || product.stock <= product.minimumStock),
  )

  async function handleSubmit(event) {
    event.preventDefault()
    const errors = {}
    if (!name.trim()) errors.name = 'Escribe el nombre del producto.'
    if (!Number.isSafeInteger(Number(stock)) || Number(stock) < 0) {
      errors.stock = 'El stock debe ser un número entero igual o mayor que cero.'
    }
    if (!Number.isSafeInteger(Number(minimumStock)) || Number(minimumStock) < 0) {
      errors.minimumStock = 'El mínimo debe ser un número entero igual o mayor que cero.'
    }
    if (branches.length === 0) errors.branchId = 'Crea una sucursal antes de agregar productos.'
    setProductErrors(errors)
    if (Object.keys(errors).length > 0) return

    const newProduct = {
      name: name.trim(),
      stock: Number(stock),
      minimumStock: Number(minimumStock),
      barcode: barcode.trim() || null,
      branchId: branchId || branches[0]?.id,
    }

    const result = await onAddProduct(newProduct)
    if (!result) {
      shakeForm(productFormRef)
      return
    }
    setName('')
    setStock('')
    setMinimumStock('')
    setBarcode('')
  }

  async function handleCreateBranch(event) {
    event.preventDefault()
    if (!branchName.trim()) {
      setBranchError('Escribe el nombre de la sucursal.')
      return
    }
    setBranchError('')
    const result = await onCreateBranch(branchName.trim())
    if (result) setBranchName('')
  }

  async function handleDelete(product) {
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: '¿Borrar producto?',
      text: `Se borrará “${product.name}”. Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Volver',
      reverseButtons: true,
    })
    if (confirmation.isConfirmed) {
      await onDeleteProduct(product.id)
    }
  }

  async function handleMovementSubmit(event) {
    event.preventDefault()
    const errors = {}
    const minimumQuantity = movementType === 'ajuste' ? 0 : 1
    if (!selectedProductId) errors.productId = 'Selecciona un producto.'
    if (
      !Number.isSafeInteger(Number(movementQuantity)) ||
      Number(movementQuantity) < minimumQuantity
    ) {
      errors.quantity = movementType === 'ajuste'
        ? 'El stock final debe ser un entero igual o mayor que cero.'
        : 'La cantidad debe ser un entero mayor que cero.'
    }
    if (!movementReason.trim()) errors.reason = 'Escribe el motivo del movimiento.'
    setMovementErrors(errors)
    if (Object.keys(errors).length > 0) return

    const result = await onAddMovement(selectedProductId, {
      type: movementType,
      quantity: Number(movementQuantity),
      reason: movementReason.trim(),
    })
    if (!result) {
      shakeForm(movementFormRef)
      return
    }
    setMovementQuantity('1')
    setMovementReason('')
  }

  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const visibleMovements = movements.filter(
    (movement) => !selectedProductId || movement.productId === selectedProductId,
  )
  const visibleHistoryMovements = visibleMovements.filter(
    (movement) => historyFilter === 'todos' || movement.type === historyFilter,
  )

  return (
    <section
      className={`workspace inventory-step step-enter${entered ? ' step-enter-active' : ''}`}
      aria-labelledby="inventory-title"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZACIÓN</p>
          <h1 id="inventory-title">Inventario</h1>
          <p className="page-description">
            Consulta existencias y registra movimientos con motivo y responsable.
          </p>
        </div>
        <div className="request-count" aria-live="polite">
          <span className="count-number">{filteredProducts.length}</span>
          <span>
            {normalizedSearch
              ? 'resultados'
              : filteredProducts.length === 1
                ? 'producto'
                : 'productos'}
          </span>
        </div>
      </div>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="product-form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="product-form-title">Nuevo producto</h2>
              <p>Registra el producto y sus niveles de stock.</p>
            </div>
          </div>

          <form
            aria-busy={isMutating}
            ref={productFormRef}
            onAnimationEnd={(event) => event.currentTarget.classList.remove('error-shake')}
            onSubmit={handleSubmit}
          >
            <label htmlFor="product-name">Nombre del producto</label>
            <input
              id="product-name"
              name="name"
              type="text"
              placeholder="Ej. Papel tamaño carta"
              value={name}
              aria-invalid={Boolean(productErrors.name)}
              aria-describedby={productErrors.name ? 'product-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                setProductErrors((current) => ({ ...current, name: '' }))
              }}
              onInvalid={() => setProductErrors((current) => ({
                ...current,
                name: 'Escribe el nombre del producto.',
              }))}
              maxLength={100}
              required
            />
            {productErrors.name && <p className="field-error" id="product-name-error" role="alert">{productErrors.name}</p>}

            <label htmlFor="product-stock">Stock actual</label>
            <input
              id="product-stock"
              name="stock"
              type="number"
              min="0"
              step="1"
              placeholder="Ej. 25"
              value={stock}
              aria-invalid={Boolean(productErrors.stock)}
              aria-describedby={productErrors.stock ? 'product-stock-error' : undefined}
              onChange={(event) => {
                setStock(event.target.value)
                setProductErrors((current) => ({ ...current, stock: '' }))
              }}
              onInvalid={() => setProductErrors((current) => ({
                ...current,
                stock: 'El stock debe ser un número entero igual o mayor que cero.',
              }))}
              required
            />
            {productErrors.stock && <p className="field-error" id="product-stock-error" role="alert">{productErrors.stock}</p>}

            <label htmlFor="product-minimum">Stock mínimo</label>
            <input
              id="product-minimum"
              name="minimumStock"
              type="number"
              min="0"
              step="1"
              placeholder="Ej. 5"
              value={minimumStock}
              aria-invalid={Boolean(productErrors.minimumStock)}
              aria-describedby={productErrors.minimumStock ? 'product-minimum-error' : undefined}
              onChange={(event) => {
                setMinimumStock(event.target.value)
                setProductErrors((current) => ({ ...current, minimumStock: '' }))
              }}
              onInvalid={() => setProductErrors((current) => ({
                ...current,
                minimumStock: 'El mínimo debe ser un número entero igual o mayor que cero.',
              }))}
              required
            />
            {productErrors.minimumStock && <p className="field-error" id="product-minimum-error" role="alert">{productErrors.minimumStock}</p>}

            <label htmlFor="product-barcode">Código de barras o QR <span className="optional">(opcional)</span></label>
            <input
              id="product-barcode"
              maxLength={128}
              placeholder="Escribe o pega el código"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />

            <label htmlFor="product-branch">Sucursal</label>
            <select
              id="product-branch"
              value={branchId || branches[0]?.id || ''}
              aria-invalid={Boolean(productErrors.branchId)}
              aria-describedby={productErrors.branchId ? 'product-branch-error' : undefined}
              onChange={(event) => {
                setBranchId(event.target.value)
                setProductErrors((current) => ({ ...current, branchId: '' }))
              }}
              onInvalid={() => setProductErrors((current) => ({
                ...current,
                branchId: 'Selecciona una sucursal.',
              }))}
              required
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            {productErrors.branchId && <p className="field-error" id="product-branch-error" role="alert">{productErrors.branchId}</p>}
            {branches.length === 0 && (
              <p className="form-hint" role="status">
                Crea primero una sucursal en la sección “Sucursales”.
              </p>
            )}

            <button className="submit-button" type="submit" disabled={isMutating || branches.length === 0}>
              <span aria-hidden="true">+</span>
              {isMutating ? 'Guardando…' : 'Agregar producto'}
            </button>
          </form>
        </section>

        <section className="requests-panel" aria-labelledby="products-title">
          <div className="list-heading">
            <div>
              <h2 id="products-title">Productos</h2>
              <p>Existencias y nivel mínimo · el historial no se borra</p>
            </div>
            <div className="inventory-code-search">
              <label htmlFor="inventory-code-search">Buscar por nombre o código de barras / QR</label>
              <div>
                <input
                  id="inventory-code-search"
                  value={barcodeSearch}
                  onChange={(event) => setBarcodeSearch(event.target.value)}
                  placeholder="Escanea o escribe un código"
                />
                <button
                  className="show-all-button"
                  type="button"
                  onClick={() => {
                    setScanError('')
                    setScanOpen((current) => !current)
                  }}
                >
                  {scanOpen ? 'Cerrar cámara' : 'Escanear'}
                </button>
              </div>
              {scanError && <p className="form-error" role="alert">{scanError}</p>}
              {scanOpen && (
                <div className="barcode-scanner">
                  <video ref={videoRef} aria-label="Vista de la cámara para escanear" muted playsInline />
                  <p>Enfoca el código de barras o QR dentro del cuadro.</p>
                </div>
              )}
            </div>
            {barcodeSearch && (
              <button className="show-all-button" type="button" onClick={() => setBarcodeSearch('')}>
                Limpiar búsqueda de código
              </button>
            )}
          </div>
          {lowStockProducts.length > 0 && (
            <div className="inventory-low-stock-alert" role="status">
              <span>
                {lowStockProducts.length} {lowStockProducts.length === 1 ? 'producto requiere' : 'productos requieren'} atención:
                {' '}stock en o bajo el mínimo.
              </span>
              <button
                className="show-all-button"
                type="button"
                aria-pressed={lowStockOnly}
                onClick={() => setLowStockOnly((current) => !current)}
              >
                {lowStockOnly ? 'Ver todos' : 'Ver stock bajo'}
              </button>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">▤</span>
              <h3>
                {normalizedSearch
                  ? 'No se encontraron productos'
                  : lowStockOnly
                    ? 'No hay productos con stock bajo'
                    : 'Aún no hay productos'}
              </h3>
              <p>
                {normalizedSearch
                  ? 'Prueba con otro término de búsqueda.'
                  : lowStockOnly
                    ? 'Todos los productos están por encima del mínimo.'
                    : 'Agrega un producto para empezar a controlar el stock.'}
              </p>
              {(barcodeSearch || lowStockOnly) && (
                <button
                  className="show-all-button"
                  type="button"
                  onClick={() => {
                    setBarcodeSearch('')
                    setLowStockOnly(false)
                  }}
                >
                  Limpiar búsqueda y filtros
                </button>
              )}
            </div>
          ) : (
            <ul className="product-list">
              {filteredProducts.map((product) => (
                <li className="product-card" key={product.id}>
                  <div className="product-card-content">
                    <h3>{product.name}</h3>
                    <p className="form-hint">
                      {product.branchName && `Sucursal: ${product.branchName}`}
                      {product.barcode && ` · Código: ${product.barcode}`}
                    </p>
                    {product.stock <= product.minimumStock && (
                      <span className="low-stock-label" role="status">
                        En o bajo el mínimo · {product.stock} actual / {product.minimumStock} mínimo
                      </span>
                    )}
                    <div className="product-stock-details">
                      <span>
                        Stock actual <strong>{product.stock}</strong>
                      </span>
                      <span>
                        Mínimo <strong>{product.minimumStock}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="product-card-actions">
                    <button
                      className="show-all-button"
                      type="button"
                      aria-label={`Ver movimientos de ${product.name}`}
                      onClick={() => {
                        setSelectedProductId(product.id)
                        setHistoryFilter('todos')
                      }}
                    >
                      Movimientos
                    </button>
                    <button
                      className="delete-button"
                      type="button"
                      onClick={() => void handleDelete(product)}
                      aria-label={`Borrar producto: ${product.name}`}
                      disabled={
                        isMutating ||
                        requests.some((request) => request.productId === product.id) ||
                        movements.some((movement) => movement.productId === product.id)
                      }
                      title={
                        requests.some((request) => request.productId === product.id) ||
                        movements.some((movement) => movement.productId === product.id)
                          ? 'No se puede borrar: hay solicitudes o movimientos asociados'
                          : undefined
                      }
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="form-panel branch-management-panel" aria-labelledby="branch-management-title">
        <div className="section-heading">
          <span className="section-icon" aria-hidden="true">⌖</span>
          <div>
            <h2 id="branch-management-title">Sucursales</h2>
            <p>Organiza el inventario por ubicación dentro de la empresa.</p>
          </div>
        </div>
        <ul className="branch-list">
          {branches.map((branch) => <li key={branch.id}>{branch.name}</li>)}
        </ul>
        <form onSubmit={handleCreateBranch}>
          <label htmlFor="new-branch-name">Nueva sucursal</label>
          <input
            id="new-branch-name"
            maxLength={100}
            required
            value={branchName}
            aria-invalid={Boolean(branchError)}
            aria-describedby={branchError ? 'new-branch-name-error' : undefined}
            onChange={(event) => {
              setBranchName(event.target.value)
              setBranchError('')
            }}
            onInvalid={() => setBranchError('Escribe el nombre de la sucursal.')}
          />
          {branchError && <p className="field-error" id="new-branch-name-error" role="alert">{branchError}</p>}
          <button className="submit-button" type="submit" disabled={isMutating}>
            Crear sucursal
          </button>
        </form>
      </section>

      <div className="content-grid inventory-ledger-grid">
        <section className="form-panel" aria-labelledby="movement-form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">↕</span>
            <div>
              <h2 id="movement-form-title">Movimiento de stock</h2>
              <p>{selectedProduct ? `Producto: ${selectedProduct.name}` : 'Selecciona un producto desde la lista.'}</p>
            </div>
          </div>
          {selectedProduct ? (
            <form
              aria-busy={isMutating}
              ref={movementFormRef}
              onAnimationEnd={(event) => event.currentTarget.classList.remove('error-shake')}
              onSubmit={handleMovementSubmit}
            >
              <label htmlFor="movement-type">Tipo</label>
              <select
                id="movement-type"
                value={movementType}
                onChange={(event) => setMovementType(event.target.value)}
              >
                <option value="entrada">Entrada / reposición</option>
                <option value="salida">Salida manual</option>
                <option value="ajuste">Ajustar al stock final</option>
              </select>

              <label htmlFor="movement-quantity">
                {movementType === 'ajuste' ? 'Nuevo stock final' : 'Cantidad'}
              </label>
              <input
                id="movement-quantity"
                type="number"
                min={movementType === 'ajuste' ? '0' : '1'}
                step="1"
                value={movementQuantity}
                aria-invalid={Boolean(movementErrors.quantity)}
                aria-describedby={movementErrors.quantity ? 'movement-quantity-error' : undefined}
                onChange={(event) => {
                  setMovementQuantity(event.target.value)
                  setMovementErrors((current) => ({ ...current, quantity: '' }))
                }}
                onInvalid={() => setMovementErrors((current) => ({
                  ...current,
                  quantity: movementType === 'ajuste'
                    ? 'El stock final debe ser un entero igual o mayor que cero.'
                    : 'La cantidad debe ser un entero mayor que cero.',
                }))}
                required
              />
              {movementErrors.quantity && <p className="field-error" id="movement-quantity-error" role="alert">{movementErrors.quantity}</p>}

              <label htmlFor="movement-reason">Motivo</label>
              <textarea
                id="movement-reason"
                rows={3}
                maxLength={250}
                value={movementReason}
                aria-invalid={Boolean(movementErrors.reason)}
                aria-describedby={movementErrors.reason ? 'movement-reason-error' : undefined}
                onChange={(event) => {
                  setMovementReason(event.target.value)
                  setMovementErrors((current) => ({ ...current, reason: '' }))
                }}
                onInvalid={() => setMovementErrors((current) => ({
                  ...current,
                  reason: 'Escribe el motivo del movimiento.',
                }))}
                placeholder="Ej. Reposición de compra o corrección de inventario"
                required
              />
              {movementErrors.reason && <p className="field-error" id="movement-reason-error" role="alert">{movementErrors.reason}</p>}
              <button className="submit-button" type="submit" disabled={isMutating}>
                {isMutating ? 'Guardando…' : 'Guardar movimiento'}
              </button>
            </form>
          ) : (
            <p className="form-hint">Elige “Movimientos” en un producto para registrar una entrada, salida o ajuste.</p>
          )}
        </section>

        <section className="requests-panel" aria-labelledby="movement-history-title">
          <div className="list-heading">
            <div>
              <h2 id="movement-history-title">Historial de movimientos</h2>
              <p>{selectedProduct ? selectedProduct.name : 'Todos los productos'}</p>
            </div>
            <div className="movement-history-controls">
              <label>
                Tipo
                <select
                  aria-label="Filtrar historial por tipo de movimiento"
                  value={historyFilter}
                  onChange={(event) => setHistoryFilter(event.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="entrada">Entradas</option>
                  <option value="salida">Salidas</option>
                  <option value="ajuste">Ajustes</option>
                </select>
              </label>
              {selectedProduct && (
                <button
                  className="show-all-button"
                  type="button"
                  onClick={() => setSelectedProductId('')}
                >
                  Ver todos
                </button>
              )}
            </div>
          </div>
          {visibleHistoryMovements.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">↕</span>
              <h3>
                {historyFilter === 'todos'
                  ? 'Sin movimientos registrados'
                  : 'No hay movimientos de este tipo'}
              </h3>
              <p>Las entradas, salidas, ajustes y consumos aparecerán aquí.</p>
            </div>
          ) : (
            <ul className="movement-list">
              {visibleHistoryMovements.map((movement) => (
                <li className="movement-card" key={movement.id}>
                  <div>
                    <strong>{movement.productName}</strong>
                    <span className={`movement-type movement-${movement.type}`}>{movement.type}</span>
                    <p>{movement.reason}</p>
                    <small>
                      {movement.actorName} · {new Date(movement.createdAt).toLocaleString('es-ES')}
                    </small>
                  </div>
                  <div className="movement-stock">
                    <strong>
                      {movement.delta > 0 ? '+' : ''}{movement.delta}
                    </strong>
                    <span>{movement.previousStock} → {movement.newStock}</span>
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

export default InventoryPage
