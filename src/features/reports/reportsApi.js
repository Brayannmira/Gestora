import { apiRequest } from '../../api.js'

export function getReports(params) {
  return apiRequest(`/reports?${params}`)
}
