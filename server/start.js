import 'dotenv/config'
import { app } from './index.js'

if (
  process.env.NODE_ENV === 'production' &&
  (
    !process.env.APP_ORIGIN ||
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD ||
    !process.env.SMTP_FROM
  )
) {
  throw new Error('En producción debes configurar APP_ORIGIN y todas las variables SMTP.')
}

if (process.env.NODE_ENV === 'production') {
  const applicationOrigin = new URL(process.env.APP_ORIGIN)
  if (applicationOrigin.protocol !== 'https:' || applicationOrigin.origin !== process.env.APP_ORIGIN) {
    throw new Error('APP_ORIGIN debe ser un origen HTTPS exacto, sin ruta ni barra final.')
  }
  const smtpPort = Number(process.env.SMTP_PORT ?? 587)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('SMTP_PORT debe ser un puerto válido.')
  }
}

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
app.listen(port, host, () => {
  process.stderr.write(`Gestora API escuchando en ${host}:${port}\n`)
})
