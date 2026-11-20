export function validateRuntimeConfig(environment = process.env) {
  const runtime = environment.NODE_ENV
  if (!['development', 'production'].includes(runtime)) {
    throw new Error('Define NODE_ENV como development o production antes de iniciar la API.')
  }

  const port = Number(environment.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto válido.')
  }

  if (runtime !== 'production') {
    return { host: environment.HOST?.trim() || '127.0.0.1', port }
  }

  const sessionSecret = environment.SESSION_SECRET ?? ''
  if (
    sessionSecret.trim().length < 32 ||
    sessionSecret.startsWith('replace-this-with-')
  ) {
    throw new Error('SESSION_SECRET debe ser privado, aleatorio y tener al menos 32 caracteres.')
  }

  const origin = environment.APP_ORIGIN ?? ''
  let parsedOrigin
  try {
    parsedOrigin = new URL(origin)
  } catch {
    throw new Error('APP_ORIGIN debe ser el origen HTTPS exacto de la interfaz.')
  }
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin) {
    throw new Error('APP_ORIGIN debe ser un origen HTTPS exacto, sin ruta ni barra final.')
  }

  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    if (!environment[key]?.trim()) {
      throw new Error(`Configura ${key} en el almacén de secretos del servidor.`)
    }
  }

  const smtpPort = Number(environment.SMTP_PORT ?? 587)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('SMTP_PORT debe ser un puerto válido.')
  }
  if (!['true', 'false'].includes(environment.SMTP_SECURE ?? 'false')) {
    throw new Error('SMTP_SECURE debe ser true o false.')
  }
  if (smtpPort === 465 && environment.SMTP_SECURE !== 'true') {
    throw new Error('SMTP_SECURE debe ser true cuando SMTP_PORT es 465.')
  }

  return { host: environment.HOST?.trim() || '127.0.0.1', port }
}
