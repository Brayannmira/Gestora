import { useEffect, useRef, useState } from 'react'
import { login, resendOtp, verifyOtp } from './authApi.js'
import '../../AuthPrototype.css'

const OTP_LENGTH = 6
const RESEND_DELAY = 30

function maskEmail(value) {
  const [localPart = '', domain = ''] = value.split('@')
  const visiblePart = localPart.length > 2 ? localPart.slice(0, 2) : localPart[0] ?? ''
  return `${visiblePart}${'•'.repeat(Math.max(3, localPart.length - visiblePart.length))}@${domain}`
}

function AuthPrototype({ onAuthenticated, serverError }) {
  const [step, setStep] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState(Array(OTP_LENGTH).fill(''))
  const [resendSeconds, setResendSeconds] = useState(RESEND_DELAY)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verifiedUser, setVerifiedUser] = useState(null)
  const inputRefs = useRef([])

  useEffect(() => {
    if (step !== 'otp' || resendSeconds === 0) return undefined

    const timerId = window.setTimeout(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    )
    return () => window.clearTimeout(timerId)
  }, [resendSeconds, step])

  useEffect(() => {
    if (step !== 'verified' || !verifiedUser) return undefined
    const timerId = window.setTimeout(
      () => onAuthenticated(verifiedUser),
      850,
    )
    return () => window.clearTimeout(timerId)
  }, [onAuthenticated, step, verifiedUser])

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const result = await login({ email: email.trim(), password })
      setChallengeId(result.challengeId)
      setEmail(result.email)
      setPassword('')
      setCode(Array(OTP_LENGTH).fill(''))
      setResendSeconds(result.resendIn)
      setStep('otp')
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode(nextCode) {
    if (nextCode.length !== OTP_LENGTH || isSubmitting) return
    setError('')
    setIsSubmitting(true)
    setStep('checking')
    try {
      const result = await verifyOtp({ challengeId, code: nextCode })
      setVerifiedUser(result.user)
      setStep('verified')
    } catch (verifyError) {
      setError(verifyError.message)
      setCode(Array(OTP_LENGTH).fill(''))
      setStep('otp')
      inputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  function fillCodeFrom(index, value) {
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH - index)
    if (!digits) return

    const nextCode = [...code]
    digits.split('').forEach((digit, offset) => {
      nextCode[index + offset] = digit
    })
    setCode(nextCode)

    const nextIndex = index + digits.length
    if (nextIndex < OTP_LENGTH) inputRefs.current[nextIndex]?.focus()
    if (nextCode.every(Boolean)) void verifyCode(nextCode.join(''))
  }

  function handleCodeChange(index, value) {
    if (value === '') {
      setCode((currentCode) =>
        currentCode.map((digit, digitIndex) => (digitIndex === index ? '' : digit)),
      )
      return
    }
    fillCodeFrom(index, value)
  }

  function handleCodePaste(event, index) {
    event.preventDefault()
    fillCodeFrom(index, event.clipboardData.getData('text'))
  }

  function handleCodeKeyDown(event, index) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  async function handleResend() {
    if (resendSeconds > 0 || isSubmitting) return
    setError('')
    setIsSubmitting(true)
    try {
      const result = await resendOtp({ challengeId })
      setCode(Array(OTP_LENGTH).fill(''))
      setResendSeconds(result.resendIn)
      inputRefs.current[0]?.focus()
    } catch (resendError) {
      setError(resendError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const progressStep = step === 'login' ? 'login' : step === 'otp' ? 'otp' : 'verified'

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-story">
          <a className="auth-brand" href="/" aria-label="Gestora, inicio">
            <span className="auth-brand-mark" aria-hidden="true">G</span>
            <span>gestora</span>
          </a>

          <div className="auth-story-content">
            <span className="auth-story-label">ESPACIO DE TRABAJO</span>
            <h1>Todo tu equipo, trabajando en sintonía.</h1>
            <p>
              Organiza solicitudes y lleva el control del inventario desde un
              mismo lugar.
            </p>
            <div className="auth-highlight">
              <span className="auth-highlight-icon" aria-hidden="true">✓</span>
              <span>Contraseña y código de un solo uso verificados en el servidor.</span>
            </div>
          </div>

          <ol className="auth-steps" aria-label="Pasos de acceso">
            <li className={progressStep === 'login' ? 'current' : 'complete'}>
              <span>01</span><span>Cuenta</span>
            </li>
            <li className={progressStep === 'otp' ? 'current' : step === 'login' ? '' : 'complete'}>
              <span>02</span><span>Verificación</span>
            </li>
            <li className={progressStep === 'verified' ? 'current' : ''}>
              <span>03</span><span>Acceso</span>
            </li>
          </ol>
        </aside>

        <section className="auth-card" aria-live="polite">
          <div className="prototype-notice">
            <span className="prototype-dot" aria-hidden="true" />
            AUTENTICACIÓN DE SERVIDOR
          </div>

          {(error || (serverError && step === 'login')) && (
            <p className="auth-error" role="alert">{error || serverError}</p>
          )}

          {step === 'login' && (
            <div className="auth-form-view">
              <span className="auth-kicker">QUÉ BUENO VERTE</span>
              <h2>Inicia sesión</h2>
              <p className="auth-intro">Ingresa tus credenciales de Gestora.</p>
              <form className="auth-form" onSubmit={handleLogin}>
                <label htmlFor="login-email">Correo electrónico</label>
                <input
                  autoComplete="email"
                  id="login-email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@equipo.com"
                  required
                  type="email"
                  value={email}
                />
                <label htmlFor="login-password">Contraseña</label>
                <input
                  autoComplete="current-password"
                  id="login-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <button className="auth-primary-button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? 'Validando…' : 'Continuar'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
              <p className="auth-demo-note">
                El código OTP se envía por correo cuando SMTP está configurado.
              </p>
            </div>
          )}

          {step === 'otp' && (
            <div className="auth-form-view otp-view">
              <button
                className="back-button"
                onClick={() => {
                  setStep('login')
                  setChallengeId('')
                  setCode(Array(OTP_LENGTH).fill(''))
                  setError('')
                }}
                type="button"
              >
                <span aria-hidden="true">←</span> Volver
              </button>
              <span className="auth-icon-bubble" aria-hidden="true">✳</span>
              <span className="auth-kicker">SEGUNDO PASO</span>
              <h2>Verifica tu acceso</h2>
              <p className="auth-intro">
                Ingresa el código enviado a <strong>{maskEmail(email)}</strong>.
              </p>
              <div className="otp-form">
                <label className="otp-label" htmlFor="otp-digit-0">Código de verificación</label>
                <div className="otp-inputs">
                  {code.map((digit, index) => (
                    <input
                      aria-label={`Dígito ${index + 1} de ${OTP_LENGTH}`}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      className="otp-digit"
                      id={`otp-digit-${index}`}
                      inputMode="numeric"
                      key={index}
                      maxLength={OTP_LENGTH}
                      onChange={(event) => handleCodeChange(index, event.target.value)}
                      onKeyDown={(event) => handleCodeKeyDown(event, index)}
                      onPaste={(event) => handleCodePaste(event, index)}
                      ref={(element) => { inputRefs.current[index] = element }}
                      value={digit}
                    />
                  ))}
                </div>
                <p className="otp-auto-note">La verificación comienza al completar los 6 dígitos.</p>
              </div>
              <div className="resend-row">
                {resendSeconds > 0 ? (
                  <span>Puedes reenviar en <strong>0:{String(resendSeconds).padStart(2, '0')}</strong></span>
                ) : (
                  <button className="text-button" disabled={isSubmitting} onClick={handleResend} type="button">
                    Reenviar código
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'checking' && (
            <div className="auth-transition-view checking-view">
              <span className="transition-icon checking-icon" aria-hidden="true"><span /></span>
              <span className="auth-kicker">SEGUNDO PASO</span>
              <h2>Verificando código</h2>
              <p className="auth-intro">Comprobando el código de un solo uso…</p>
              <div className="transition-progress"><span className="checking-progress" /></div>
            </div>
          )}

          {step === 'verified' && (
            <div className="auth-transition-view verified-view">
              <span className="transition-icon verified-icon" aria-hidden="true">✓</span>
              <span className="auth-kicker success-kicker">CÓDIGO CONFIRMADO</span>
              <h2>¡Todo listo!</h2>
              <p className="auth-intro">Tu sesión segura está lista.</p>
              <div className="verified-summary">
                <span className="summary-check" aria-hidden="true">✓</span>
                <span>OTP validado en el servidor</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AuthPrototype
