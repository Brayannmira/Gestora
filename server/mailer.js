import nodemailer from 'nodemailer'

const smtpHost = process.env.SMTP_HOST
let testSender = null

export function setOtpSenderForTest(sender) {
  testSender = sender
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

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Tu código de acceso a Gestora',
    text: `Tu código de verificación es ${code}. Caduca en cinco minutos.`,
  })
}
