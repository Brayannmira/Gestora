import { apiRequest } from '../../api.js'

function dateBoundary(date, nextDay = false) {
  const boundary = new Date(`${date}T00:00:00`)
  if (Number.isNaN(boundary.getTime())) {
    throw new Error('Selecciona una fecha válida.')
  }
  if (nextDay) boundary.setDate(boundary.getDate() + 1)
  return boundary.toISOString()
}

export function getRequests({
  page = 1,
  pageSize = 20,
  status,
  approvalStatus,
  priority,
  search,
  dateFrom,
  dateTo,
} = {}) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (status && status !== 'todas') query.set('status', status)
  if (approvalStatus && approvalStatus !== 'todas') query.set('approvalStatus', approvalStatus)
  if (priority && priority !== 'todas') query.set('priority', priority)
  if (search?.trim()) query.set('search', search.trim())
  if (dateFrom) query.set('dateFrom', dateBoundary(dateFrom))
  if (dateTo) query.set('dateTo', dateBoundary(dateTo, true))
  return apiRequest(`/requests?${query}`)
}

export function reviewRequest(requestId, approvalStatus) {
  return apiRequest(`/requests/${requestId}/approval`, {
    method: 'PATCH',
    body: { approvalStatus },
  })
}

export function createRequest(request) {
  return apiRequest('/requests', { method: 'POST', body: request })
}

export function updateRequest(requestId, updates) {
  return apiRequest(`/requests/${requestId}`, { method: 'PATCH', body: updates })
}

export function deleteRequest(requestId) {
  return apiRequest(`/requests/${requestId}`, { method: 'DELETE' })
}
