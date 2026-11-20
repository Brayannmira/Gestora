import { apiRequest } from '../../api.js'

export function getCurrentUser() {
  return apiRequest('/auth/me')
}

export function login(credentials) {
  return apiRequest('/auth/login', { method: 'POST', body: credentials })
}

export function verifyOtp(challenge) {
  return apiRequest('/auth/verify-otp', { method: 'POST', body: challenge })
}

export function resendOtp(challenge) {
  return apiRequest('/auth/resend-otp', { method: 'POST', body: challenge })
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST' })
}

export function changePassword(passwords) {
  return apiRequest('/auth/change-password', { method: 'POST', body: passwords })
}
