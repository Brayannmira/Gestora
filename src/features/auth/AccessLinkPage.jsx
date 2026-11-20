import { useEffect, useState } from 'react'
import {
  acceptInvitation,
  completePasswordReset,
  previewInvitation,
  validatePasswordReset,
} from './authApi.js'
import '../../AuthPrototype.css'

function AccessLinkPage({ mode }) {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [details, setDetails] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    let active = true
    const validate = mode === 'invitation'
      ? previewInvitation(token).then((result) => result.invitation)
      : validatePasswordReset(token).then((result) => result.valid ? {} : null)
    validate.then((result) => {
      if (!active) return
      if (!result) {
        setStatus('invalid')
        return
      }
      setDetails(result)
      setStatus('ready')
    }).catch((validationError) => {
      if (!active) return
      setError(validationError.message)
      setStatus('error')
    })
    return () => { active = false }
  }, [mode, token])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.')
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    try {
      if (mode === 'invitation') {
        await acceptInvitation({ token, password })
      } else {
        await completePasswordReset({ token, newPassword: password })
      }
      setStatus('complete')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const isInvitation = mode === 'invitation'
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-story">
          <a className="auth-brand" href="/" aria-label="Gestora, inicio">
            <span className="auth-brand-mark" aria-hidden="true">G</span>
            <span>gestora</span>
          </a>
          <div className="auth-story-content">
            <span className="auth-story-label">ACCESO SEGURO</span>
            <h1>{isInvitation ? 'Tu equipo, en un mismo lugar.' : 'Recupera el acceso a tu cuenta.'}</h1>
            <p>Usa una contraseña única de al menos 12 caracteres.</p>
          </div>
        </aside>
        <section className="auth-card" aria-live="polite">
          <div className="prototype-notice">
            <span className="prototype-dot" aria-hidden="true" />
            {isInvitation ? 'INVITACIÓN A GESTORA' : 'RECUPERACIÓN DE CUENTA'}
          </div>
          {status === 'loading' && <p role="status">Comprobando el enlace…</p>}
          {status === 'invalid' && (
            <div className="auth-form-view">
              <h2>Enlace inválido o vencido</h2>
              <p className="auth-intro">Solicita una nueva invitación o inicia otra recuperación de contraseña.</p>
              <a className="auth-primary-button" href="/">Volver al inicio</a>
            </div>
          )}
          {status === 'error' && <p className="auth-error" role="alert">{error}</p>}
          {status === 'ready' && (
            <div className="auth-form-view">
              <span className="auth-kicker">{isInvitation ? 'BIENVENIDO' : 'UN SOLO USO'}</span>
              <h2>{isInvitation ? 'Completa tu cuenta' : 'Crea una contraseña nueva'}</h2>
              {isInvitation && details && (
                <p className="auth-intro">
                  {details.name} · {details.email}<br />
                  {details.organizationName}
                </p>
              )}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <form className="auth-form" onSubmit={handleSubmit}>
                <label htmlFor="access-password">Nueva contraseña</label>
                <input
                  autoComplete="new-password"
                  id="access-password"
                  minLength={12}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <label htmlFor="access-password-confirm">Confirmar contraseña</label>
                <input
                  autoComplete="new-password"
                  id="access-password-confirm"
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  type="password"
                  value={confirmation}
                />
                <button className="auth-primary-button" type="submit">
                  {isInvitation ? 'Crear cuenta' : 'Restablecer contraseña'}
                </button>
              </form>
            </div>
          )}
          {status === 'complete' && (
            <div className="auth-form-view">
              <span className="auth-kicker success-kicker">OPERACIÓN COMPLETADA</span>
              <h2>{isInvitation ? 'Cuenta creada' : 'Contraseña actualizada'}</h2>
              <p className="auth-intro">
                {isInvitation
                  ? 'Ya puedes iniciar sesión con tu correo y contraseña.'
                  : 'Inicia sesión con tu nueva contraseña.'}
              </p>
              <a className="auth-primary-button" href="/">Ir a iniciar sesión</a>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AccessLinkPage
