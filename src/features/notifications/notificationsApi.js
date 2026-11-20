import { apiRequest } from '../../api.js'

export function getNotifications() {
  return apiRequest('/notifications')
}

export function markNotificationRead(notificationId) {
  return apiRequest(`/notifications/${notificationId}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return apiRequest('/notifications/read-all', { method: 'PATCH' })
}
