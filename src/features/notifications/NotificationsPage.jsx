import { useEffect, useState } from 'react'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notificationsApi.js'

function NotificationsPage({ onOpenRequests }) {
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getNotifications()
      .then((result) => {
        if (active) setNotifications(result.notifications)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function markRead(notification) {
    if (notification.readAt) return
    try {
      await markNotificationRead(notification.id)
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
      ))
    } catch (markError) {
      setError(markError.message)
    }
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead()
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, readAt })))
    } catch (markError) {
      setError(markError.message)
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length

  return (
    <section className="workspace" aria-labelledby="notifications-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACTUALIZACIONES</p>
          <h1 id="notifications-title">Notificaciones</h1>
          <p className="page-description">Avisos de aprobaciones y niveles de inventario.</p>
        </div>
        {unreadCount > 0 && (
          <button className="filter-button" type="button" onClick={markAllRead}>
            Marcar todas como leídas ({unreadCount})
          </button>
        )}
      </div>
      {error && <div className="data-state error" role="alert">{error}</div>}
      {loading ? (
        <div className="data-state" role="status">Cargando notificaciones…</div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">♢</span>
          <h2>Estás al día</h2>
          <p>Los avisos nuevos aparecerán aquí.</p>
        </div>
      ) : (
        <ul className="request-list">
          {notifications.map((notification) => (
            <li
              className={`request-card notification-card${notification.readAt ? '' : ' unread'}`}
              key={notification.id}
            >
              <div className="request-card-content">
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
                <time dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString('es-ES')}
                </time>
              </div>
              <div className="request-actions">
                {!notification.readAt && (
                  <button className="filter-button" type="button" onClick={() => void markRead(notification)}>
                    Marcar leída
                  </button>
                )}
                {notification.entityType === 'request' && (
                  <button
                    className="show-all-button"
                    type="button"
                    onClick={() => {
                      onOpenRequests()
                      void markRead(notification)
                    }}
                  >
                    Ver solicitudes
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default NotificationsPage
