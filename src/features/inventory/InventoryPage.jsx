import { useEffect, useRef, useState } from 'react'

function InventoryPage({
  products,
  requests,
  movements,
  onAddProduct,
  onAddMovement,
  onDeleteProduct,
  searchQuery = '',
  isMutating = false,
}) {
  const [entered, setEntered] = useState(false)
  const [name, setName] = useState('')
  const [stock, setStock] = useState('')
  const [minimumStock, setMinimumStock] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [movementType, setMovementType] = useState('entrada')
  const [historyFilter, setHistoryFilter] = useState('todos')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [movementQuantity, setMovementQuantity] = useState('1')
  const [movementReason, setMovementReason] = useState('')
  const productFormRef = useRef(null)
  const movementFormRef = useRef(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function shakeForm(formRef) {
    const form = formRef.current
    if (!form) return
    form.classList.remove('error-shake')
    void form.offsetWidth
    form.classList.add('error-shake')
  }

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const lowStockProducts = products.filter(
    (product) => product.stock <= product.minimumStock,
  )
  const filteredProducts = products.filter((product) =>
    product.name.toLocaleLowerCase().includes(normalizedSearch) &&
    (!lowStockOnly || product.stock <= product.minimumStock),
  )

  async function handleSubmit(event) {
    event.preventDefault()

    const newProduct = {
      name: name.trim(),
      stock: Number(stock),
      minimumStock: Number(minimumStock),
    }

    const result = await onAddProduct(newProduct)
    if (!result) {
      shakeForm(productFormRef)
      return
    }
    setName('')
    setStock('')
    setMinimumStock('')
  }

  function handleDelete(id) {
    onDeleteProduct(id)
  }

  async function handleMovementSubmit(event) {
    event.preventDefault()
    if (!selectedProductId) return

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
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />

            <label htmlFor="product-stock">Stock actual</label>
            <input
              id="product-stock"
              name="stock"
              type="number"
              min="0"
              step="1"
              placeholder="Ej. 25"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              required
            />

            <label htmlFor="product-minimum">Stock mínimo</label>
            <input
              id="product-minimum"
              name="minimumStock"
              type="number"
              min="0"
              step="1"
              placeholder="Ej. 5"
              value={minimumStock}
              onChange={(event) => setMinimumStock(event.target.value)}
              required
            />

            <button className="submit-button" type="submit" disabled={isMutating}>
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
            </div>
          ) : (
            <ul className="product-list">
              {filteredProducts.map((product) => (
                <li className="product-card" key={product.id}>
                  <div className="product-card-content">
                    <h3>{product.name}</h3>
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
                    onClick={() => handleDelete(product.id)}
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
                onChange={(event) => setMovementQuantity(event.target.value)}
                required
              />

              <label htmlFor="movement-reason">Motivo</label>
              <textarea
                id="movement-reason"
                rows={3}
                maxLength={250}
                value={movementReason}
                onChange={(event) => setMovementReason(event.target.value)}
                placeholder="Ej. Reposición de compra o corrección de inventario"
                required
              />
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
