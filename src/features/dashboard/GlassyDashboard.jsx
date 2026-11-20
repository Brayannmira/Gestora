import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Suspense } from 'react'
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
  PackageSearch,
} from 'lucide-react'
import { getDashboardRole, KPI_BY_ROLE } from './dashboardConfig.js'
import SidebarGlass from './SidebarGlass.jsx'
import StatCardGlass from './StatCardGlass.jsx'
import TopbarGlass from './TopbarGlass.jsx'
import PlanOverviewCard from './PlanOverviewCard.jsx'
import {
  INVENTORY_FILTERS_KEY,
  readSessionPreference,
  REQUEST_FILTERS_KEY,
  writeSessionPreference,
} from '../../sessionPreferences.js'
import '../../styles/glassTheme.css'

function GlassyDashboard({
  user,
  requestSummary = { total: 0, open: 0, completed: 0, urgent: 0, awaitingApproval: 0 },
  requestSearchResults = [],
  requestSearchStatus = 'idle',
  requestSearchError = '',
  products,
  activeTab,
  onTabChange,
  onTabIntent,
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
  subscription,
  subscriptionStatus,
  subscriptionError,
  onRetrySubscription,
  onViewPlan,
  legacyImport,
  onImportLegacy,
  onDiscardLegacy,
  children,
}) {
  const prefersReducedMotion = useReducedMotion()
  const dashboardRole = getDashboardRole(user.roleKey)
  const totalRequests = requestSummary.total
  const openRequests = requestSummary.open
  const awaitingApproval = requestSummary.awaitingApproval ?? 0
  const completedRequests = requestSummary.completed
  const urgentRequests = requestSummary.urgent
  const requestProgress = totalRequests === 0
    ? 0
    : Math.round((completedRequests / totalRequests) * 100)
  const lowStockProducts = products.filter(
    (product) => product.stock <= product.minimumStock,
  ).length

  const statsByKey = {
    totalRequests: {
      title: 'Solicitudes totales',
      value: totalRequests,
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
  const showPlanOverview = dashboardRole === 'SUPER_ADMIN'

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const searchResults = normalizedSearch
    ? [
      ...requestSearchResults,
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
            <p>
              {hasLoadedData
                ? 'Indicadores calculados con las solicitudes y productos actuales.'
                : 'Consulta el estado y los límites de tu empresa.'}
            </p>
          </div>
          <span className="overview-date">Base de datos SQLite</span>
        </div>

        {showPlanOverview && (
          <PlanOverviewCard
            error={subscriptionError}
            onRetry={onRetrySubscription}
            onViewPlan={onViewPlan}
            status={subscriptionStatus}
            subscription={subscription}
          />
        )}

        {hasLoadedData && (
          <>
            <div className="bento-grid">
              {stats.map((stat, index) => (
                <StatCardGlass key={stat.title} {...stat} index={index} />
              ))}
            </div>
            {(awaitingApproval > 0 || (dashboardRole !== 'EMPLOYEE' && lowStockProducts > 0)) && (
              <nav className="overview-quick-actions" aria-label="Accesos rápidos">
                {awaitingApproval > 0 && (
                  <button
                    className="overview-quick-action"
                    type="button"
                    onClick={() => {
                      writeSessionPreference(REQUEST_FILTERS_KEY, {
                        ...readSessionPreference(REQUEST_FILTERS_KEY, {}),
                        statusFilter: 'todas',
                        approvalFilter: 'pendiente',
                        priorityFilter: 'todas',
                        quickFilter: null,
                        listSearch: '',
                        dateFrom: '',
                        dateTo: '',
                        page: 1,
                      })
                      onSearchChange('')
                      onTabChange('solicitudes')
                    }}
                  >
                    <ClipboardCheck aria-hidden="true" size={17} />
                    <span>Ver solicitudes pendientes de aprobación</span>
                    <strong>{awaitingApproval}</strong>
                  </button>
                )}
                {dashboardRole !== 'EMPLOYEE' && lowStockProducts > 0 && (
                  <button
                    className="overview-quick-action"
                    type="button"
                    onClick={() => {
                      writeSessionPreference(INVENTORY_FILTERS_KEY, {
                        ...readSessionPreference(INVENTORY_FILTERS_KEY, {}),
                        lowStockOnly: true,
                        barcodeSearch: '',
                      })
                      onSearchChange('')
                      onTabChange('inventario')
                    }}
                  >
                    <PackageSearch aria-hidden="true" size={17} />
                    <span>Revisar productos con stock bajo</span>
                    <strong>{lowStockProducts}</strong>
                  </button>
                )}
              </nav>
            )}
            <div className="overview-note glass-panel">
              <span className="overview-note-icon" aria-hidden="true">i</span>
              <p>
                Solicitudes, productos y movimientos se guardan en SQLite. Las
                contraseñas se almacenan con hash y la sesión usa una cookie HttpOnly.
              </p>
            </div>
          </>
        )}
      </section>
    )
    : children

  return (
    <div className="dashboard-shell">
      <SidebarGlass
        activeTab={activeTab}
        completedRequests={completedRequests}
        onTabChange={onTabChange}
        onTabIntent={onTabIntent}
        openRequests={openRequests}
        requestProgress={requestProgress}
        totalRequests={totalRequests}
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
          searchStatus={requestSearchStatus}
          searchError={requestSearchError}
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
          {(hasLoadedData || dataStatus === 'ready' ||
            (dashboardRole === 'SUPER_ADMIN' && subscription)) && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="dashboard-page"
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                key={activeTab}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              >
                <Suspense fallback={<div className="data-state" role="status">Cargando sección…</div>}>
                  {pageContent}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  )
}

export default GlassyDashboard
