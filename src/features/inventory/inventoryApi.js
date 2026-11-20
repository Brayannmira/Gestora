import { apiRequest } from '../../api.js'

export function createProduct(product) {
  return apiRequest('/products', { method: 'POST', body: product })
}

export function deleteProduct(productId) {
  return apiRequest(`/products/${productId}`, { method: 'DELETE' })
}

export function createMovement(productId, movement) {
  return apiRequest(`/products/${productId}/movements`, {
    method: 'POST',
    body: movement,
  })
}
