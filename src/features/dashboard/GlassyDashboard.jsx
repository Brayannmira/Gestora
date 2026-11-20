import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
} from 'lucide-react'
import { getDashboardRole, KPI_BY_ROLE } from './dashboardConfig.js'
import SidebarGlass from './SidebarGlass.jsx'
import StatCardGlass from './StatCardGlass.jsx'
import TopbarGlass from './TopbarGlass.jsx'
import '../../styles/glassTheme.css'

function GlassyDashboard({
  user,
  requests,
  products,
  activeTab,
  onTabChange,
  onLogout,
  onNewRequest,
  searchQuery = '',
  onSearchChange,
  onSelectSearchResult,
  notice,
  onDismissNotice,
  dataStatus,
  dataError,
  hasLoadedData,
  onRetryData,
  legacyImport,
  onImportLegacy,
  onDiscardLegacy,
  children,
}) {
  const prefersReducedMotion = useReducedMotion()
  const dashboardRole = getDashboardRole(user.roleKey)
  const openRequests = requests.filter(
    (request) => request.status !== 'completada' && request.status !== 'cancelada',
  ).length
  const completedRequests = requests.filter(
    (request) => request.status === 'completada',
  ).length
  const requestProgress = requests.length === 0
    ? 0
    : Math.round((completedRequests / requests.length) * 100)
  const urgentRequests = requests.filter(
    (request) =>
      request.priority === 'urgente' &&
      request.status !== 'completada' &&
      request.status !== 'cancelada',
  ).length
  const lowStockProducts = products.filter(
    (product) => product.stock <= product.minimumStock,
  ).length

  const statsByKey = {
    totalRequests: {
      title: 'Solicitudes totales',
      value: requests.length,
      detail: 'En la base de datos',
      icon: ClipboardList,
    },
    openRequests: {
      title: 'Solicitudes activas',
      value: openRequests,
      detail: 'Pendientes o en proceso',
      icon: ClipboardCheck,
    },
    urgentRequests: {
      title: 'Solicitudes urgentes',
      value: urgentRequests,
      detail: 'Aún no completadas',
      icon: AlertTriangle,
    },
    productCount: {
      title: 'Productos registrados',
      value: products.length,
      detail: 'En el inventario',
      icon: PackageCheck,
    },
    lowStockCount: {
      title: 'Stock en o bajo mínimo',
      value: lowStockProducts,
      detail: 'Revisar niveles de existencias',
      icon: AlertTriangle,
    },
  }
  const stats = KPI_BY_ROLE[dashboardRole].map((key) => statsByKey[key])

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const searchResults = normalizedSearch
    ? [
      ...requests
        .filter((request) =>
          `${request.title} ${request.description}`
            .toLocaleLowerCase()
            .includes(normalizedSearch),
        )
        .map((request) => ({
          id: request.id,
          kind: 'request',
          title: request.title,
          subtitle: `Solicitud · ${request.status.replace('-', ' ')}`,
          page: 'solicitudes',
        })),
      ...(dashboardRole === 'EMPLOYEE'
        ? []
        : products
          .filter((product) =>
            product.name.toLocaleLowerCase().includes(normalizedSearch),
          )
          .map((product) => ({
            id: product.id,
            kind: 'product',
            title: product.name,
            subtitle: `Inventario · stock ${product.stock}`,
            page: 'inventario',
          }))),
    ].slice(0, 8)
    : []

  const pageContent = activeTab === 'overview'
    ? (
      <section className="overview-screen" aria-labelledby="overview-title">
        <div className="overview-heading">
          <div>
            <p className="overview-eyebrow">RESUMEN DE OPERACIONES</p>
            <h2 id="overview-title">Tu espacio, de un vistazo</h2>
            <p>Indicadores calculados con las solicitudes y productos actuales.</p>
          </div>
          <span className="overview-date">Base de datos SQLite</span>
        </div>

        <div className="bento-grid">
          {stats.map((stat, index) => (
            <StatCardGlass key={stat.title} {...stat} index={index} />
          ))}
        </div>

        <div className="overview-note glass-panel">
          <span className="overview-note-icon" aria-hidden="true">i</span>
          <p>
            Solicitudes, productos y movimientos se guardan en SQLite. Las
            contraseñas se almacenan con hash y la sesión usa una cookie HttpOnly.
          </p>
        </div>
      </section>
    )
    : activeTab === 'auditoria'
      ? (
        <section className="audit-placeholder glass-panel" aria-labelledby="audit-title">
          <span className="audit-icon" aria-hidden="true">
            <AlertTriangle size={22} />
          </span>
          <p className="overview-eyebrow">SOLO SUPERADMINISTRADOR</p>
          <h2 id="audit-title">Auditoría OTP/Token</h2>
          <p>
            Las sesiones se validan en el servidor y los códigos OTP expiran. El
            historial de intentos de autenticación todavía no forma parte de esta fase.
          </p>
          <span className="audit-status">Entrega OTP por correo: configurar SMTP</span>
        </section>
      )
      : children

  return (
    <div className="dashboard-shell">
      <SidebarGlass
        activeTab={activeTab}
        completedRequests={completedRequests}
        onTabChange={onTabChange}
        openRequests={openRequests}
        requestProgress={requestProgress}
        totalRequests={requests.length}
        user={user}
      />

      <main className="dashboard-main">
        <TopbarGlass
          onLogout={onLogout}
          onNewRequest={onNewRequest}
          onSearchChange={onSearchChange}
          onSelectSearchResult={onSelectSearchResult}
          searchQuery={searchQuery}
          searchResults={searchResults}
          user={user}
        />
        <div className="dashboard-content">
          {legacyImport && (
            <div className="app-notice warning" role="status">
              <span>
                {legacyImport.error ??
                  'Se encontró una copia local anterior. Importarla solo está permitido si la base de datos está vacía.'}
              </span>
              {legacyImport.data && (
                <button type="button" onClick={onImportLegacy}>
                  Importar copia local
                </button>
              )}
              <button type="button" onClick={onDiscardLegacy}>
                Descartar copia
              </button>
            </div>
          )}
          {notice && (
            <div className={`app-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
              <span>{notice.message}</span>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={onDismissNotice}
              >
                Cerrar
              </button>
            </div>
          )}
          {!hasLoadedData && dataStatus === 'loading' && (
            <div className="data-state" role="status" aria-live="polite">
              Cargando solicitudes e inventario…
            </div>
          )}
          {!hasLoadedData && dataStatus === 'error' && (
            <div className="data-state error" role="alert">
              <p>No se pudieron cargar las solicitudes y el inventario: {dataError}</p>
              <button className="show-all-button" type="button" onClick={onRetryData}>
                Reintentar
              </button>
            </div>
          )}
          {hasLoadedData && dataStatus === 'refreshing' && (
            <div className="data-state" role="status" aria-live="polite">
              Actualizando datos…
            </div>
          )}
          {hasLoadedData && dataStatus === 'error' && (
            <div className="data-state error" role="alert">
              <p>No se pudieron actualizar los datos: {dataError}</p>
              <button className="show-all-button" type="button" onClick={onRetryData}>
                Reintentar
              </button>
            </div>
          )}
          {(hasLoadedData || dataStatus === 'ready') && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="dashboard-page"
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                key={activeTab}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              >
                {pageContent}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  )
}

export default GlassyDashboard
