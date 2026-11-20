import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import { HttpError } from './shared/http.js'
import authRoutes from './routes/auth.js'
import auditRoutes from './routes/audit.js'
import dataRoutes from './routes/data.js'
import productRoutes from './routes/products.js'
import requestRoutes from './routes/requests.js'
import userRoutes from './routes/users.js'
import organizationRoutes from './routes/organizations.js'
import branchRoutes from './routes/branches.js'
import notificationsRoutes from './routes/notifications.js'
import { db } from './database.js'

const app = express()
const allowedOrigins = process.env.APP_ORIGIN
  ? new Set([process.env.APP_ORIGIN])
  : process.env.NODE_ENV === 'production'
    ? new Set()
    : new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

app.disable('x-powered-by')
app.use(helmet())
app.use((request, response, next) => {
  const origin = request.get('origin')
  const isAllowedOrigin = allowedOrigins.has(origin)
  if (isAllowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Vary', 'Origin')
  }

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin) {
      return next(new HttpError(403, 'Origen de solicitud no permitido.'))
    }
    return response.status(204).end()
  }

  if (
    process.env.NODE_ENV === 'production' &&
    ['POST', 'PATCH', 'DELETE'].includes(request.method) &&
    !isAllowedOrigin
  ) {
    return next(new HttpError(403, 'Origen de solicitud no permitido.'))
  }
  return next()
})
app.use(express.json({ limit: '32kb' }))
app.use('/api', (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Pragma', 'no-cache')
  next()
})

app.get('/api/health', (request, response) => {
  try {
    db.prepare('SELECT 1').get()
    response.json({ status: 'ok' })
  } catch {
    process.stderr.write('[Health] La comprobación de base de datos falló.\n')
    response.status(503).json({ status: 'unavailable' })
  }
})
app.use('/api/auth', authRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api', dataRoutes)
app.use('/api/products', productRoutes)
app.use('/api/requests', requestRoutes)
app.use('/api/users', userRoutes)
app.use('/api/organizations', organizationRoutes)
app.use('/api/branches', branchRoutes)
app.use('/api/notifications', notificationsRoutes)

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (String(error.code).includes('CONSTRAINT_UNIQUE')) {
    const message = String(error.message).includes('organizations.name')
      ? 'Ya existe una empresa con ese nombre.'
      : String(error.message).includes('branches.organization_id')
        ? 'Ya existe una sucursal con ese nombre.'
        : String(error.message).includes('products.organization_id')
          ? 'Ya existe un producto con ese código en esta sucursal.'
          : 'Ya existe una cuenta con ese correo.'
    return response.status(409).json({ error: message })
  }
  if (String(error.message).includes('admin_limit')) {
    return response.status(409).json({ error: 'Ya existen los dos administradores activos permitidos.' })
  }
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) {
    process.stderr.write(`[API] Error interno en ${request.method} ${request.path}.\n`)
  }
  return response.status(status).json({
    error: status >= 500 ? 'Ocurrió un error interno. Inténtalo de nuevo.' : error.message,
  })
})

export { app }
