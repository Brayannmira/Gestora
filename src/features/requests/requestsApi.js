import { apiRequest } from '../../api.js'

export function createRequest(request) {
  return apiRequest('/requests', { method: 'POST', body: request })
}

export function updateRequest(requestId, updates) {
  return apiRequest(`/requests/${requestId}`, { method: 'PATCH', body: updates })
}

export function deleteRequest(requestId) {
  return apiRequest(`/requests/${requestId}`, { method: 'DELETE' })
}
