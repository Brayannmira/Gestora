import nodemailer from 'nodemailer'

const smtpHost = process.env.SMTP_HOST
let testSender = null
let testNotificationSender = null

export function setOtpSenderForTest(sender) {
  testSender = sender
}

export function setNotificationSenderForTest(sender) {
  testNotificationSender = sender
}

export async function sendOtp(email, code) {
  if (testSender) return testSender(email, code)

  const smtpConfigured = smtpHost &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM
  if (!smtpConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configura SMTP_HOST, SMTP_USER, SMTP_PASSWORD y SMTP_FROM antes de enviar códigos OTP.')
    }

    process.stderr.write(`[OTP solo desarrollo] ${email}: ${code}\n`)
    return
  }

  const transporter = createTransport()

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Tu código de acceso a Gestora',
    text: `Tu código de verificación es ${code}. Caduca en cinco minutos.`,
  })
}

function createTransport() {
  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    logger: false,
    debug: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  })
}

export async function sendNotification(email, title, message) {
  if (testNotificationSender) return testNotificationSender(email, title, message)

  const smtpConfigured = smtpHost &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM
  if (!smtpConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP no está configurado para notificaciones.')
    }
    return
  }

  await createTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: title,
    text: message,
  })
}

function requireSmtp() {
  const smtpConfigured = smtpHost &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM
  if (!smtpConfigured) {
    throw new Error('Configura SMTP_HOST, SMTP_USER, SMTP_PASSWORD y SMTP_FROM antes de enviar correos.')
  }
}

function frontendOrigin() {
  return process.env.APP_ORIGIN || 'http://localhost:5173'
}

export async function sendUserInvitation(email, name, organizationName, token) {
  if (testNotificationSender) {
    return testNotificationSender(email, 'Invitación a Gestora', token)
  }
  requireSmtp()
  const invitationUrl = new URL('/accept-invitation', frontendOrigin())
  invitationUrl.searchParams.set('token', token)
  await createTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: `Invitación a Gestora · ${organizationName}`,
    text: `Hola ${name}, recibiste una invitación para unirte a ${organizationName}. Crea tu contraseña en ${invitationUrl.toString()}. El enlace vence en 48 horas.`,
  })
}

export async function sendPasswordReset(email, token) {
  if (testNotificationSender) {
    return testNotificationSender(email, 'Restablece tu contraseña de Gestora', token)
  }
  requireSmtp()
  const resetUrl = new URL('/reset-password', frontendOrigin())
  resetUrl.searchParams.set('token', token)
  await createTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Restablece tu contraseña de Gestora',
    text: `Se solicitó restablecer la contraseña de tu cuenta. Usa este enlace de un solo uso, válido por 30 minutos: ${resetUrl.toString()}`,
  })
}

export async function sendTestEmail(email) {
  if (testNotificationSender) {
    return testNotificationSender(
      email,
      'Prueba de correo de Gestora',
      'El correo de Gestora está configurado correctamente.',
    )
  }
  requireSmtp()
  await createTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Prueba de correo de Gestora',
    text: 'El correo de Gestora está configurado correctamente.',
  })
}
