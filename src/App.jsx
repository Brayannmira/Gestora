import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import AuthPrototype from './features/auth/AuthPrototype.jsx'
import { getCurrentUser, logout as logoutSession } from './features/auth/authApi.js'
import ChangePasswordPage from './features/auth/ChangePasswordPage.jsx'
import AccessLinkPage from './features/auth/AccessLinkPage.jsx'
import {
  createMovement,
  createProduct,
  deleteProduct,
  createBranch,
} from './features/inventory/inventoryApi.js'
import {
  createRequest,
  deleteRequest,
  getRequests,
  updateRequest,
  reviewRequest,
} from './features/requests/requestsApi.js'
import { getWorkspaceData, importLegacyData } from './features/workspace/workspaceApi.js'
import { getOrganizationSubscription } from './features/users/usersApi.js'
import showSweetAlert from './sweetAlert.js'
import './App.css'

function cacheImport(importer) {
  let pendingImport

  return () => {
    if (!pendingImport) {
      pendingImport = importer().catch((error) => {
        pendingImport = null
        throw error
      })
    }
    return pendingImport
  }
}

const loadDashboard = cacheImport(() => import('./features/dashboard/GlassyDashboard.jsx'))
const loadInventoryPage = cacheImport(() => import('./features/inventory/InventoryPage.jsx'))
const loadRequestsPage = cacheImport(() => import('./features/requests/RequestsPage.jsx'))
const GlassyDashboard = lazy(loadDashboard)
const InventoryPage = lazy(loadInventoryPage)
const RequestsPage = lazy(loadRequestsPage)
const UsersPage = lazy(() => import('./features/users/UsersPage.jsx'))
const AuditPage = lazy(() => import('./features/audit/AuditPage.jsx'))
const LazyReportsPage = lazy(() => import('./features/reports/ReportsPage.jsx'))
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage.jsx'))

function getLegacyLocalData() {
  try {
    const serialized = window.localStorage.getItem('gestora:data')
    if (!serialized) return null
    const parsed = JSON.parse(serialized)
    if (
      parsed?.format !== 'gestora-data' ||
      parsed?.version !== 1 ||
      !Array.isArray(parsed.products) ||
      !Array.isArray(parsed.requests)
    ) {
      return { error: 'La copia local tiene un formato que no se puede importar automáticamente.' }
    }
    if (parsed.products.length === 0 && parsed.requests.length === 0) return null
    return { data: { products: parsed.products, requests: parsed.requests } }
  } catch (error) {
    return { error: `No se pudo leer la copia local: ${error.message}` }
  }
}

function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [serverError, setServerError] = useState('')
  const [dataStatus, setDataStatus] = useState('loading')
  const [dataError, setDataError] = useState('')
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [requestSummary, setRequestSummary] = useState({
    total: 0,
    open: 0,
    completed: 0,
    urgent: 0,
    awaitingApproval: 0,
  })
  const [requestSearchState, setRequestSearchState] = useState({
    query: '',
    results: [],
    status: 'idle',
    error: '',
  })
  const [products, setProducts] = useState([])
  const [branches, setBranches] = useState([])
  const [movements, setMovements] = useState([])
  const [organizationSubscription, setOrganizationSubscription] = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState('loading')
  const [subscriptionError, setSubscriptionError] = useState('')
  const [notice, setNotice] = useState(null)
  const [legacyImport, setLegacyImport] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [isMutating, setIsMutating] = useState(false)
  const mutationPendingRef = useRef(false)
  const hasLoadedDataRef = useRef(false)

  const refreshOrganizationSubscription = useCallback(async () => {
    if (
      authenticatedUser?.roleKey !== 'super-admin' ||
      authenticatedUser.mustChangePassword
    ) {
      setOrganizationSubscription(null)
      setSubscriptionStatus('idle')
      setSubscriptionError('')
      return
    }

    setSubscriptionStatus('loading')
    setSubscriptionError('')
    try {
      const result = await getOrganizationSubscription()
      setOrganizationSubscription(result)
      setSubscriptionStatus('ready')
    } catch (error) {
      setSubscriptionStatus('error')
      setSubscriptionError(error.message)
    }
  }, [authenticatedUser])

  useEffect(() => {
    if (
      authenticatedUser?.roleKey !== 'super-admin' ||
      authenticatedUser.mustChangePassword
    ) return undefined

    let active = true
    getOrganizationSubscription()
      .then((result) => {
        if (!active) return
        setOrganizationSubscription(result)
        setSubscriptionStatus('ready')
        setSubscriptionError('')
      })
      .catch((error) => {
        if (!active) return
        setSubscriptionStatus('error')
        setSubscriptionError(error.message)
      })
    return () => { active = false }
  }, [authenticatedUser])

  const applyData = useCallback((data) => {
    setRequestSummary(data.requestSummary)
    setProducts(data.products)
    setBranches(data.branches ?? [])
    setMovements(data.movements)
  }, [])

  const refreshData = useCallback(async () => {
    setDataStatus(hasLoadedDataRef.current ? 'refreshing' : 'loading')
    setDataError('')
    try {
      const data = await getWorkspaceData()
      applyData(data)
      hasLoadedDataRef.current = true
      setHasLoadedData(true)
      setDataStatus('ready')
      return data
    } catch (error) {
      setDataStatus('error')
      setDataError(error.message)
      throw error
    }
  }, [applyData])

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const { user } = await getCurrentUser()
        if (!active) return
        setAuthenticatedUser(user)
        if (user.mustChangePassword) return
        const data = await refreshData()
        if (
          user.roleKey === 'super-admin' &&
          data.products.length === 0 &&
          data.requestSummary.total === 0
        ) {
          setLegacyImport(getLegacyLocalData())
        }
      } catch (error) {
        if (error.status !== 401 && active) {
          setServerError('No se pudo conectar con Gestora API. Inicia el servidor y vuelve a cargar la página.')
        }
      } finally {
        if (active) setAuthChecking(false)
      }
    }

    checkSession()
    return () => { active = false }
  }, [refreshData])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!authenticatedUser || authenticatedUser.mustChangePassword || !query) return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const result = await getRequests({ search: query, pageSize: 5 })
        if (active) {
          setRequestSearchState({
            query,
            results: result.requests.map((request) => ({
              id: request.id,
              kind: 'request',
              title: request.title,
              subtitle: `Solicitud · ${request.status.replace('-', ' ')}`,
              page: 'solicitudes',
            })),
            status: 'ready',
            error: '',
          })
        }
      } catch (error) {
        if (active) {
          setRequestSearchState({ query, results: [], status: 'error', error: error.message })
          if (error.status !== 401) {
            setNotice({ type: 'warning', message: `No se pudieron buscar las solicitudes: ${error.message}` })
          }
        }
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [authenticatedUser, searchQuery])

  const handleAuthenticated = useCallback(async (user) => {
    setServerError('')
    setAuthenticatedUser(user)
    setActivePage('overview')
    if (user.mustChangePassword) return
    try {
      const data = await refreshData()
      if (
        user.roleKey === 'super-admin' &&
        data.products.length === 0 &&
        data.requestSummary.total === 0
      ) {
        setLegacyImport(getLegacyLocalData())
      }
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }, [refreshData])

  async function runMutation(action, successMessage, successType = 'success') {
    if (mutationPendingRef.current) return null
    mutationPendingRef.current = true
    setIsMutating(true)
    try {
      const result = await action()
      let refreshError = null
      try {
        await refreshData()
      } catch (error) {
        refreshError = error
      }
      const message = successMessage ? successMessage(result) : null
      if (message) {
        const type = refreshError
          ? 'warning'
          : typeof successType === 'function'
            ? successType(result)
            : successType
        await showSweetAlert({
          icon: type === 'warning' ? 'warning' : 'success',
          title: type === 'warning' ? 'Atención' : 'Operación completada',
          text: refreshError
            ? `${message} No se pudieron actualizar los datos: ${refreshError.message}`
            : message,
          confirmButtonText: 'Entendido',
        })
      } else if (refreshError) {
        await showSweetAlert({
          icon: 'warning',
          title: 'Datos sin actualizar',
          text: `La acción se completó, pero no se pudieron actualizar los datos: ${refreshError.message}`,
          confirmButtonText: 'Entendido',
        })
      }
      return result
    } catch (error) {
      await showSweetAlert({
        icon: 'error',
        title: 'No se pudo completar',
        text: error.message,
        confirmButtonText: 'Entendido',
      })
      return null
    } finally {
      mutationPendingRef.current = false
      setIsMutating(false)
    }
  }

  async function retryDataLoad() {
    try {
      await refreshData()
    } catch (error) {
      setNotice({ type: 'error', message: `No se pudieron cargar los datos: ${error.message}` })
    }
  }

  async function handleLegacyImport() {
    if (!legacyImport?.data) return
    const result = await runMutation(
      () => importLegacyData(legacyImport.data),
      (migration) => `${migration.importedProducts} productos y ${migration.importedRequests} solicitudes importados. ${migration.note}`,
      'warning',
    )
    if (result) {
      setLegacyImport(null)
      try {
        window.localStorage.removeItem('gestora:data')
      } catch (error) {
        setNotice({
          type: 'warning',
          message: `Datos importados, pero no se pudo borrar la copia local: ${error.message}`,
        })
      }
    }
  }

  function discardLegacyData() {
    try {
      window.localStorage.removeItem('gestora:data')
      setLegacyImport(null)
    } catch (error) {
      setNotice({ type: 'error', message: `No se pudo borrar la copia local: ${error.message}` })
    }
  }

  async function handleLogout() {
    try {
      await logoutSession()
    } catch (error) {
      if (error.status !== 401) {
        setNotice({ type: 'error', message: error.message })
      }
    } finally {
      setAuthenticatedUser(null)
      setOrganizationSubscription(null)
      setSubscriptionStatus('idle')
      setSubscriptionError('')
      hasLoadedDataRef.current = false
      setHasLoadedData(false)
      setDataStatus('loading')
      setDataError('')
      setRequestSummary({ total: 0, open: 0, completed: 0, urgent: 0, awaitingApproval: 0 })
      setRequestSearchState({ query: '', results: [], status: 'idle', error: '' })
      setProducts([])
      setBranches([])
      setMovements([])
      setNotice(null)
      setActivePage('overview')
      setSearchQuery('')
    }
  }

  async function handlePasswordChanged(user) {
    setAuthenticatedUser(user)
    try {
      await refreshData()
      setNotice({ type: 'success', message: 'Contraseña actualizada. Ya puedes usar Gestora.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }

  function handleSelectSearchResult(result) {
    setActivePage(result.page)
  }

  function handleTabIntent(tab) {
    const pageImport = {
      inventario: loadInventoryPage,
      solicitudes: loadRequestsPage,
    }[tab]

    if (pageImport) {
      pageImport().catch((error) => {
        setNotice({
          type: 'warning',
          message: `No se pudo precargar la sección. Se intentará al abrirla: ${error.message}`,
        })
      })
    }
  }

  const prepareDashboard = useCallback(() => loadDashboard(), [])

  if (authChecking) {
    return <main className="auth-loading" role="status">Conectando con Gestora…</main>
  }

  if (window.location.pathname === '/accept-invitation') {
    return <AccessLinkPage mode="invitation" />
  }
  if (window.location.pathname === '/reset-password') {
    return <AccessLinkPage mode="recovery" />
  }

  if (!authenticatedUser) {
    return (
      <AuthPrototype
        onAuthenticated={handleAuthenticated}
        onPrepareDashboard={prepareDashboard}
        serverError={serverError}
      />
    )
  }

  if (authenticatedUser.mustChangePassword) {
    return (
      <ChangePasswordPage
        onPasswordChanged={handlePasswordChanged}
        onLogout={handleLogout}
      />
    )
  }

  const canManageRequests = authenticatedUser.roleKey !== 'employee'

  return (
    <Suspense fallback={<main className="auth-loading" role="status">Cargando tu espacio…</main>}>
      <GlassyDashboard
        activeTab={activePage}
        onLogout={handleLogout}
        onNewRequest={() => {
          setSearchQuery('')
          setActivePage('solicitudes')
        }}
        onSearchChange={setSearchQuery}
        onSelectSearchResult={handleSelectSearchResult}
        onTabChange={setActivePage}
        onTabIntent={handleTabIntent}
        onDismissNotice={() => setNotice(null)}
        legacyImport={legacyImport}
        onImportLegacy={handleLegacyImport}
        onDiscardLegacy={discardLegacyData}
        notice={notice}
        subscription={organizationSubscription}
        subscriptionStatus={subscriptionStatus}
        subscriptionError={subscriptionError}
        onRetrySubscription={refreshOrganizationSubscription}
        onViewPlan={() => setActivePage('usuarios')}
        requestSummary={requestSummary}
        requestSearchResults={
          requestSearchState.query === searchQuery.trim()
            ? requestSearchState.results
            : []
        }
        requestSearchStatus={
          searchQuery.trim()
            ? requestSearchState.query === searchQuery.trim()
              ? requestSearchState.status
              : 'loading'
            : 'idle'
        }
        requestSearchError={requestSearchState.error}
        dataError={dataError}
        dataStatus={dataStatus}
        hasLoadedData={hasLoadedData}
        onRetryData={retryDataLoad}
        products={products}
        searchQuery={searchQuery}
        user={authenticatedUser}
      >
        {activePage === 'solicitudes' && (
          <RequestsPage
            canManageRequests={canManageRequests}
            onSearchChange={setSearchQuery}
            onCreateRequest={(request) => runMutation(
              () => createRequest(request),
              () => 'Se agregó la solicitud.',
            )}
            onDeleteRequest={(id) => runMutation(
              async () => {
                await deleteRequest(id)
                return true
              },
              () => 'Se borró la solicitud.',
            )}
            onUpdateRequest={(id, updates) => runMutation(
              () => updateRequest(id, updates),
              (result) => updates.status === undefined
                ? null
                : result.notice ?? (
                  updates.status === 'cancelada'
                    ? 'Solicitud cancelada. El inventario no se modificó.'
                    : 'Se actualizó la solicitud.'
                ),
              (result) => updates.status === 'completada' &&
                result.product.stock <= result.product.minimumStock
                ? 'warning'
                : 'success',
            )}
            onReviewRequest={(id, approvalStatus) => runMutation(
              () => reviewRequest(id, approvalStatus),
              () => approvalStatus === 'aprobada'
                ? 'Solicitud aprobada. Ya puede procesarse.'
                : 'Solicitud rechazada. No se descontó inventario.',
            )}
            products={products}
            searchQuery={searchQuery}
            isMutating={isMutating}
          />
        )}
        {activePage === 'inventario' && authenticatedUser.roleKey !== 'employee' && (
          <InventoryPage
            branches={branches}
            movements={movements}
            onAddMovement={(productId, movement) => runMutation(
              () => createMovement(productId, movement),
              (result) => result.product.stock <= result.product.minimumStock
                ? `Movimiento guardado. ${result.product.name} quedó en o bajo el mínimo (${result.product.stock}/${result.product.minimumStock}).`
                : 'Movimiento de inventario guardado.',
              (result) => result.product.stock <= result.product.minimumStock
                ? 'warning'
                : 'success',
            )}
            onAddProduct={(product) => runMutation(
              () => createProduct(product),
              (result) => `Se agregó ${result.product.name} al inventario.`,
            )}
            onCreateBranch={(name) => runMutation(
              () => createBranch(name),
              (result) => `Se creó la sucursal ${result.branch.name}.`,
            )}
            onDeleteProduct={(id) => runMutation(
              () => deleteProduct(id),
              () => 'Se borró el producto.',
            )}
            products={products}
            searchQuery={searchQuery}
            isMutating={isMutating}
          />
        )}
        {activePage === 'usuarios' && authenticatedUser.roleKey === 'super-admin' && (
          <Suspense fallback={<div className="data-state" role="status">Cargando usuarios…</div>}>
            <UsersPage onSubscriptionChange={setOrganizationSubscription} />
          </Suspense>
        )}
        {activePage === 'reportes' && authenticatedUser.roleKey !== 'employee' && (
          <Suspense fallback={<div className="data-state" role="status">Cargando reportes…</div>}>
            <LazyReportsPage />
          </Suspense>
        )}
        {activePage === 'auditoria' && canManageRequests && <AuditPage />}
        {activePage === 'notificaciones' && (
          <NotificationsPage onOpenRequests={() => setActivePage('solicitudes')} />
        )}
      </GlassyDashboard>
    </Suspense>
  )
}

export default App
