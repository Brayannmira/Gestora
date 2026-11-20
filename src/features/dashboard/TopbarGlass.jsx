import { useState } from 'react'
import {
  ClipboardList,
  LogOut,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react'

function TopbarGlass({
  user,
  onNewRequest,
  onLogout,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectSearchResult,
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  function handleSearchKeyDown(event) {
    if (event.key === 'Escape') setSearchOpen(false)

    if (event.key === 'Enter' && searchResults.length > 0) {
      event.preventDefault()
      onSelectSearchResult(searchResults[0])
      setSearchOpen(false)
    }
  }

  function handleSelectResult(result) {
    onSelectSearchResult(result)
    setSearchOpen(false)
  }

  return (
    <header className="glass-panel topbar-glass">
      <div className="topbar-welcome">
        <p className="topbar-eyebrow">GESTORA · ESPACIO DE TRABAJO</p>
        <h1>Bienvenido, {user.name}</h1>
        <span>
          Perfil: {user.role} · datos guardados en la base de datos del equipo.
        </span>
      </div>

      <div className="topbar-search-container">
        <div className="topbar-search">
          <Search aria-hidden="true" size={16} />
          <input
            aria-controls="dashboard-search-results"
            aria-expanded={searchOpen && searchQuery.trim().length > 0}
            aria-label="Buscar solicitudes o productos"
            onChange={(event) => {
              onSearchChange(event.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => {
              if (searchQuery.trim()) setSearchOpen(true)
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar solicitudes o productos"
            type="search"
            value={searchQuery}
          />
          {searchQuery && (
            <button
              aria-label="Limpiar búsqueda"
              className="clear-search"
              onClick={() => {
                onSearchChange('')
                setSearchOpen(false)
              }}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          )}
        </div>

        {searchOpen && searchQuery.trim() && (
          <div
            className="search-results"
            id="dashboard-search-results"
            role="region"
            aria-label="Resultados de búsqueda"
          >
            {searchResults.length > 0 ? (
              <ul>
                {searchResults.map((result) => {
                  const ResultIcon = result.kind === 'product' ? Package : ClipboardList

                  return (
                    <li key={`${result.kind}-${result.id}`}>
                      <button
                        className="search-result"
                        onClick={() => handleSelectResult(result)}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        <span className="search-result-icon">
                          <ResultIcon aria-hidden="true" size={15} />
                        </span>
                        <span className="search-result-copy">
                          <strong>{result.title}</strong>
                          <small>{result.subtitle}</small>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="search-empty" role="status">
                No se encontraron coincidencias.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <span className="demo-badge">SESIÓN SEGURA</span>
        <button className="btn-coral" onClick={onNewRequest} type="button">
          <Plus aria-hidden="true" size={16} />
          Nueva solicitud
        </button>
        <button
          aria-label="Cerrar sesión"
          className="topbar-logout"
          onClick={onLogout}
          title="Salir"
          type="button"
        >
          <LogOut aria-hidden="true" size={17} />
        </button>
      </div>
    </header>
  )
}

export default TopbarGlass
