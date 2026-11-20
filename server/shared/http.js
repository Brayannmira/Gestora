import { hashSessionToken } from '../security.js'
import { authRepository } from '../container.js'
import { HttpError } from './errors.js'
import { isInteger, isUuid } from './validation.js'

export { HttpError }
export { isInteger, isUuid }

export const asyncRoute = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next)
}

export const nowIso = () => new Date().toISOString()
export const isManager = (user) => user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

export function requireText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} es obligatorio y no debe exceder ${maxLength} caracteres.`)
  }
  return value.trim()
}

export function serializeUser(user) {
  const roleKey = {
    EMPLOYEE: 'employee',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super-admin',
  }[user.role]
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: {
      EMPLOYEE: 'Empleado',
      ADMIN: 'Administrador',
      SUPER_ADMIN: 'Superadministrador',
    }[user.role],
    roleKey,
    mustChangePassword: Boolean(user.must_change_password),
  }
}

export function serializeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    stock: product.stock,
    minimumStock: product.minimum_stock,
  }
}

export function serializeRequest(request) {
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    priority: request.priority,
    status: request.status,
    productId: request.product_id,
    productName: request.product_name,
    quantity: request.quantity,
    stockDeducted: Boolean(request.stock_deducted),
    createdAt: new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(request.created_at)),
    completedAt: request.completed_at,
  }
}

export function serializeMovement(movement) {
  return {
    id: movement.id,
    productId: movement.product_id,
    productName: movement.product_name,
    type: movement.type,
    quantity: movement.quantity,
    previousStock: movement.previous_stock,
    newStock: movement.new_stock,
    delta: movement.delta,
    reason: movement.reason,
    requestId: movement.request_id,
    actorName: movement.actor_name,
    createdAt: movement.created_at,
  }
}

const sessionCookie = 'gestora_session'

export function setSessionCookie(response, token, expiresAt) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Strict'
  response.setHeader(
    'Set-Cookie',
    `${sessionCookie}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
  )
}

export function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Strict'
  response.setHeader(
    'Set-Cookie',
    `${sessionCookie}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`,
  )
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie ?? ''
  const pair = cookieHeader.split('; ').find((part) => part.startsWith(`${name}=`))
  return pair?.slice(name.length + 1)
}

export function requireAuth(request, response, next) {
  const token = getCookie(request, sessionCookie)
  if (!token) return next(new HttpError(401, 'Inicia sesión para continuar.'))

  const session = authRepository.findActiveSession(hashSessionToken(token), Date.now())

  if (!session) {
    clearSessionCookie(response)
    return next(new HttpError(401, 'La sesión expiró. Inicia sesión de nuevo.'))
  }

  request.user = session
  const routePath = request.originalUrl.split('?')[0]
  const allowedDuringPasswordChange =
    (request.method === 'GET' && routePath === '/api/auth/me') ||
    (request.method === 'POST' && ['/api/auth/change-password', '/api/auth/logout'].includes(routePath))
  if (session.must_change_password && !allowedDuringPasswordChange) {
    return next(new HttpError(403, 'Debes cambiar tu contraseña temporal para continuar.'))
  }
  return next()
}

export function requireManager(request, response, next) {
  if (!isManager(request.user)) {
    return next(new HttpError(403, 'Se requiere un perfil administrador.'))
  }
  return next()
}

export function requireSuperAdmin(request, response, next) {
  if (request.user.role !== 'SUPER_ADMIN') {
    return next(new HttpError(403, 'Se requiere el perfil superadministrador.'))
  }
  return next()
}

