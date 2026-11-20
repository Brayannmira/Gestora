import { NAV_BY_ROLE, getDashboardRole } from './dashboardConfig.js'

function SidebarGlass({
  user,
  activeTab,
  onTabChange,
  openRequests,
  completedRequests,
  totalRequests,
  requestProgress,
}) {
  const menuItems = NAV_BY_ROLE[getDashboardRole(user.roleKey)]

  return (
    <aside className="glass-panel sidebar-glass">
      <div>
        <a className="dashboard-brand" href="/" aria-label="Gestora, inicio">
          <span className="dashboard-brand-mark" aria-hidden="true">G</span>
          <span>gestora</span>
        </a>

        <p className="sidebar-caption">ESPACIO DE TRABAJO</p>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {menuItems.map((item) => {
            const Icon = item.icon
            const badge = item.badgeKey === 'openRequests' ? openRequests : 0

            return (
              <button
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`sidebar-link${activeTab === item.id ? ' active' : ''}`}
                key={item.id}
                onClick={() => onTabChange(item.id)}
                type="button"
              >
                <span className="sidebar-link-label">
                  <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                  {item.label}
                </span>
                {badge > 0 && <span className="badge-coral">{badge}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-progress">
          <div className="sidebar-progress-heading">
            <span>Progreso de solicitudes</span>
            <strong>{requestProgress}%</strong>
          </div>
          <div
            aria-label="Progreso de solicitudes completadas"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={requestProgress}
            className="sidebar-progress-track"
            role="progressbar"
          >
            <span style={{ width: `${requestProgress}%` }} />
          </div>
          <span className="sidebar-progress-caption">
            {totalRequests === 0
              ? 'Sin solicitudes registradas'
              : `${completedRequests} de ${totalRequests} completadas`}
          </span>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="profile-avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="profile-copy">
          <span className="profile-name">{user.name}</span>
          <span className="profile-role">{user.role}</span>
        </div>
      </div>
    </aside>
  )
}

export default SidebarGlass
