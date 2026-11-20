import { apiRequest } from '../../api.js'

export function getWorkspaceData() {
  return apiRequest('/data')
}

export function importLegacyData(data) {
  return apiRequest('/migrate/local', { method: 'POST', body: data })
}
