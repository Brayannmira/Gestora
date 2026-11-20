import { useState } from 'react'
import { getReports } from './reportsApi.js'

function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function csvCell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(report) {
  const columns = [
    'Categoría',
    'Fecha',
    'Título',
    'Producto',
    'Cantidad',
    'Tipo',
    'Stock anterior',
    'Stock nuevo',
    'Responsable',
    'Detalle',
  ]
  const rows = [
    columns,
    ...report.completedRequests.map((item) => [
      'Solicitud completada',
      item.completedAt,
      item.title,
      item.productName,
      item.quantity,
      '',
      '',
      '',
      item.requesterName,
      '',
    ]),
    ...report.movements.map((item) => [
      'Movimiento de inventario',
      item.createdAt,
      '',
      item.productName,
      item.quantity,
      item.type,
      item.previousStock,
      item.newStock,
      item.actorName,
      item.reason,
    ]),
    ...report.lowStockProducts.map((item) => [
      'Stock bajo actual',
      '',
      '',
      item.name,
      '',
      '',
      '',
      item.stock,
      '',
      `Mínimo: ${item.minimumStock}`,
    ]),
  ]
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `gestora-reporte-${report.from}-${report.to}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ReportsPage() {
  const today = toDateInputValue(new Date())
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 29)
  const [from, setFrom] = useState(toDateInputValue(monthAgo))
  const [to, setTo] = useState(today)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadReport(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      setReport(await getReports(params))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  const totalsByType = Object.fromEntries(
    (report?.movementTotals ?? []).map((total) => [total.type, total]),
  )

  return (
    <section className="workspace" aria-labelledby="reports-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVENTARIO Y SOLICITUDES</p>
          <h1 id="reports-title">Reportes</h1>
          <p className="page-description">Consulta las solicitudes completadas y los movimientos por periodo.</p>
        </div>
      </div>

      <section className="form-panel report-filters" aria-label="Periodo del reporte">
        <form onSubmit={loadReport}>
          <div className="report-date-fields">
            <div>
              <label htmlFor="report-from">Desde</label>
              <input id="report-from" onChange={(event) => setFrom(event.target.value)} required type="date" value={from} />
            </div>
            <div>
              <label htmlFor="report-to">Hasta</label>
              <input id="report-to" onChange={(event) => setTo(event.target.value)} required type="date" value={to} />
            </div>
          </div>
          <button className="submit-button" disabled={loading} type="submit">
            {loading ? 'Consultando…' : 'Generar reporte'}
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {report && (
        <div className="report-results" aria-live="polite">
          <div className="report-summary-grid">
            <article className="report-summary-card">
              <span>Solicitudes completadas</span>
              <strong>{report.completedRequests.length}</strong>
              <small>En el periodo seleccionado</small>
            </article>
            <article className="report-summary-card">
              <span>Productos en o bajo mínimo</span>
              <strong>{report.lowStockProducts.length}</strong>
              <small>Estado actual del inventario</small>
            </article>
            <article className="report-summary-card">
              <span>Movimientos registrados</span>
              <strong>{report.movements.length}</strong>
              <small>
                Entradas {totalsByType.entrada?.count ?? 0}
                {' · '}Salidas {totalsByType.salida?.count ?? 0}
                {' · '}Ajustes {totalsByType.ajuste?.count ?? 0}
              </small>
            </article>
          </div>

          <div className="report-section-heading">
            <h2>Detalle del periodo</h2>
            <button className="filter-button" onClick={() => downloadCsv(report)} type="button">
              Descargar CSV
            </button>
          </div>
          <section className="requests-panel report-table-panel" aria-labelledby="completed-title">
            <h3 id="completed-title">Solicitudes completadas</h3>
            {report.completedRequests.length === 0
              ? <p className="report-empty">No hay solicitudes completadas en este periodo.</p>
              : (
                <ul className="report-list">
                  {report.completedRequests.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.productName} · {item.quantity} unidades · {item.requesterName}</span>
                      <time dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleString()}</time>
                    </li>
                  ))}
                </ul>
              )}
          </section>
          <section className="requests-panel report-table-panel" aria-labelledby="movements-title">
            <h3 id="movements-title">Movimientos de inventario</h3>
            {report.movements.length === 0
              ? <p className="report-empty">No hay movimientos en este periodo.</p>
              : (
                <ul className="report-list">
                  {report.movements.map((item) => (
                    <li key={item.id}>
                      <strong>{item.productName} · {item.type} ({item.delta > 0 ? '+' : ''}{item.delta})</strong>
                      <span>{item.previousStock} → {item.newStock} unidades · {item.actorName} · {item.reason}</span>
                      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                    </li>
                  ))}
                </ul>
              )}
          </section>
          <section className="requests-panel report-table-panel" aria-labelledby="low-stock-title">
            <h3 id="low-stock-title">Stock bajo actual</h3>
            {report.lowStockProducts.length === 0
              ? <p className="report-empty">No hay productos en o bajo su mínimo.</p>
              : (
                <ul className="report-list">
                  {report.lowStockProducts.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      <span>{item.stock} unidades disponibles · mínimo {item.minimumStock}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
      )}
    </section>
  )
}

export default ReportsPage
