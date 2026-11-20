import { apiRequest } from '../../api.js'

export function getUsers() {
  return apiRequest('/users')
}

export function getBranches() {
  return apiRequest('/branches')
}

export function createUserInvitation(invitation) {
  return apiRequest('/users/invitations', { method: 'POST', body: invitation })
}

export function getInvitations() {
  return apiRequest('/users/invitations')
}

export function cancelInvitation(invitationId) {
  return apiRequest(`/users/invitations/${invitationId}`, { method: 'DELETE' })
}

export function updateUserBranch(userId, branchId) {
  return apiRequest(`/users/${userId}/branch`, {
    method: 'PATCH',
    body: { branchId },
  })
}

export function createOrganization(organization) {
  return apiRequest('/organizations', { method: 'POST', body: organization })
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

export function getOrganizationSubscription() {
  return apiRequest('/organizations/subscription')
}

export async function downloadOrganizationExport() {
  const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  const response = await fetch(`${apiOrigin}/api/organizations/export`, {
    credentials: 'include',
  })
  if (!response.ok) {
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error('No se pudo descargar la exportación.')
    }
    throw new Error(payload.error ?? 'No se pudo descargar la exportación.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'gestora-export.json'
  link.click()
  URL.revokeObjectURL(url)
}

export function requestOrganizationClosure() {
  return apiRequest('/organizations/closure', { method: 'POST' })
}

export function cancelOrganizationClosure() {
  return apiRequest('/organizations/cancel-closure', { method: 'POST' })
}

export function sendTestEmail() {
  return apiRequest('/organizations/test-email', { method: 'POST' })
}
