import { useState } from 'react'
import { changePassword } from './authApi.js'
import '../../AuthPrototype.css'
import '../../App.css'

function ChangePasswordPage({ onPasswordChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmation) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const { user } = await changePassword({ currentPassword, newPassword })
      onPasswordChanged(user)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card password-change-card" aria-labelledby="password-change-title">
        <span className="auth-kicker">ACTUALIZACIÓN OBLIGATORIA</span>
        <h1 id="password-change-title">Cambia tu contraseña temporal</h1>
        <p>Por seguridad, define una contraseña personal antes de continuar.</p>
        <form className="password-change-form" onSubmit={handleSubmit}>
          <label htmlFor="temporary-password">Contraseña temporal</label>
          <input
            autoComplete="current-password"
            id="temporary-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            type="password"
            value={currentPassword}
          />
          <label htmlFor="new-password">Nueva contraseña</label>
          <input
            autoComplete="new-password"
            id="new-password"
            minLength={12}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <label htmlFor="confirm-password">Confirma la nueva contraseña</label>
          <input
            autoComplete="new-password"
            id="confirm-password"
            minLength={12}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />
          <p className="form-hint">Usa al menos 12 caracteres. No reutilices la contraseña temporal.</p>
          <button className="submit-button" disabled={submitting} type="submit">
            {submitting ? 'Guardando…' : 'Actualizar contraseña'}
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="password-logout-button" onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}

export default ChangePasswordPage
