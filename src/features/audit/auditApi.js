import { apiRequest } from '../../api.js'

export function getAuditEvents({ page = 1, pageSize = 20 } = {}) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  return apiRequest(`/audit?${query}`)
}
