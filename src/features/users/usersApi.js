import { apiRequest } from '../../api.js'

export function getUsers() {
  return apiRequest('/users')
}

export function createUser(user) {
  return apiRequest('/users', { method: 'POST', body: user })
}

export function updateUserStatus(userId, isActive) {
  return apiRequest(`/users/${userId}`, {
    method: 'PATCH',
    body: { isActive },
  })
}

export function resetUserPassword(userId, temporaryPassword) {
  return apiRequest(`/users/${userId}/reset-password`, {
    method: 'POST',
    body: { temporaryPassword },
  })
}
