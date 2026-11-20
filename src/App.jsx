import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import AuthPrototype from './features/auth/AuthPrototype.jsx'
import { getCurrentUser, logout as logoutSession } from './features/auth/authApi.js'
import ChangePasswordPage from './features/auth/ChangePasswordPage.jsx'
import GlassyDashboard from './features/dashboard/GlassyDashboard.jsx'
import InventoryPage from './features/inventory/InventoryPage.jsx'
import {
  createMovement,
  createProduct,
  deleteProduct,
} from './features/inventory/inventoryApi.js'
import {
  createRequest,
  deleteRequest,
  updateRequest,
} from './features/requests/requestsApi.js'
import RequestsPage from './features/requests/RequestsPage.jsx'
import { getWorkspaceData, importLegacyData } from './features/workspace/workspaceApi.js'
import './App.css'

const UsersPage = lazy(() => import('./features/users/UsersPage.jsx'))
const LazyReportsPage = lazy(() => import('./features/reports/ReportsPage.jsx'))

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
  const [requests, setRequests] = useState([])
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [notice, setNotice] = useState(null)
  const [legacyImport, setLegacyImport] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [isMutating, setIsMutating] = useState(false)
  const mutationPendingRef = useRef(false)
  const hasLoadedDataRef = useRef(false)

  const applyData = useCallback((data) => {
    setRequests(data.requests)
    setProducts(data.products)
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
          data.requests.length === 0
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
        data.requests.length === 0
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
      if (successMessage) {
        const message = successMessage(result)
        setNotice({
          type: refreshError
            ? 'warning'
            : typeof successType === 'function'
              ? successType(result)
              : successType,
          message: refreshError
            ? `${message} No se pudieron actualizar los datos: ${refreshError.message}`
            : message,
        })
      } else if (refreshError) {
        setNotice({
          type: 'warning',
          message: `La acción se completó, pero no se pudieron actualizar los datos: ${refreshError.message}`,
        })
      }
      return result
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
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
      hasLoadedDataRef.current = false
      setHasLoadedData(false)
      setDataStatus('loading')
      setDataError('')
      setRequests([])
      setProducts([])
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

  if (authChecking) {
    return <main className="auth-loading" role="status">Conectando con Gestora…</main>
  }

  if (!authenticatedUser) {
    return (
      <AuthPrototype
        onAuthenticated={handleAuthenticated}
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
      onDismissNotice={() => setNotice(null)}
      legacyImport={legacyImport}
      onImportLegacy={handleLegacyImport}
      onDiscardLegacy={discardLegacyData}
      notice={notice}
      dataError={dataError}
      dataStatus={dataStatus}
      hasLoadedData={hasLoadedData}
      onRetryData={retryDataLoad}
      products={products}
      requests={requests}
      searchQuery={searchQuery}
      user={authenticatedUser}
    >
      {activePage === 'solicitudes' && (
        <RequestsPage
          canManageRequests={canManageRequests}
          onCreateRequest={(request) => runMutation(
            () => createRequest(request),
            () => 'Se agregó la solicitud.',
          )}
          onDeleteRequest={(id) => runMutation(
            () => deleteRequest(id),
            () => 'Se borró la solicitud.',
          )}
          onUpdateRequest={(id, updates) => runMutation(
            () => updateRequest(id, updates),
            (result) => result.notice ?? (
              updates.status === 'cancelada'
                ? 'Solicitud cancelada. El inventario no se modificó.'
                : 'Se actualizó la solicitud.'
            ),
            (result) => updates.status === 'completada' &&
              result.product.stock <= result.product.minimumStock
              ? 'warning'
              : 'success',
          )}
          products={products}
          requests={requests}
          searchQuery={searchQuery}
          isMutating={isMutating}
        />
      )}
      {activePage === 'inventario' && authenticatedUser.roleKey !== 'employee' && (
        <InventoryPage
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
          onDeleteProduct={(id) => runMutation(
            () => deleteProduct(id),
            () => 'Se borró el producto.',
          )}
          products={products}
          requests={requests}
          searchQuery={searchQuery}
          isMutating={isMutating}
        />
      )}
      {activePage === 'usuarios' && authenticatedUser.roleKey === 'super-admin' && (
        <Suspense fallback={<div className="data-state" role="status">Cargando usuarios…</div>}>
          <UsersPage />
        </Suspense>
      )}
      {activePage === 'reportes' && authenticatedUser.roleKey !== 'employee' && (
        <Suspense fallback={<div className="data-state" role="status">Cargando reportes…</div>}>
          <LazyReportsPage />
        </Suspense>
      )}
    </GlassyDashboard>
  )
}

export default App
