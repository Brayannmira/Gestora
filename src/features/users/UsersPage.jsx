import { useEffect, useState } from 'react'
import {
  createUser,
  getUsers,
  resetUserPassword,
  updateUserStatus,
} from './usersApi.js'

function UsersPage() {
  const [users, setUsers] = useState([])
  const [limits, setLimits] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [resetPasswords, setResetPasswords] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadUsers() {
    const data = await getUsers()
    setUsers(data.users)
    setLimits(data.limits)
  }

  useEffect(() => {
    let active = true
    getUsers()
      .then((data) => {
        if (!active) return
        setUsers(data.users)
        setLimits(data.limits)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    return () => { active = false }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    try {
      await createUser({ name, email, password, role })
      setName('')
      setEmail('')
      setPassword('')
      await loadUsers()
      setSuccess('Cuenta creada. Comunica la contraseña inicial por un canal seguro; se exigirá cambiarla al iniciar sesión.')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function handleToggle(user) {
    const nextActive = !user.isActive
    const message = nextActive
      ? `¿Reactivar la cuenta de ${user.name}?`
      : `¿Desactivar la cuenta de ${user.name}? Se cerrarán sus sesiones activas.`
    if (!window.confirm(message)) return
    setError('')
    setSuccess('')
    try {
      await updateUserStatus(user.id, nextActive)
      await loadUsers()
      setSuccess(nextActive ? 'Cuenta reactivada.' : 'Cuenta desactivada y sesiones revocadas.')
    } catch (toggleError) {
      setError(toggleError.message)
    }
  }

  async function handleResetPassword(event, user) {
    event.preventDefault()
    const temporaryPassword = resetPasswords[user.id] ?? ''
    setError('')
    setSuccess('')
    try {
      await resetUserPassword(user.id, temporaryPassword)
      setResetPasswords((current) => ({ ...current, [user.id]: '' }))
      await loadUsers()
      setSuccess(`Contraseña restablecida para ${user.name}. Debe cambiarla después de verificar su OTP.`)
    } catch (resetError) {
      setError(resetError.message)
    }
  }

  return (
    <section className="workspace" aria-labelledby="users-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1 id="users-title">Usuarios</h1>
          <p className="page-description">
            Administra cuentas; los límites de roles se validan también en el servidor.
          </p>
        </div>
        {limits && (
          <div className="request-count" aria-live="polite">
            Administradores {limits.admins}/{limits.maxAdmins}
          </div>
        )}
      </div>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="user-form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="user-form-title">Nueva cuenta</h2>
              <p>La cuenta deberá cambiar su contraseña inicial tras verificar el OTP.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="user-name">Nombre</label>
            <input id="user-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            <label htmlFor="user-email">Correo electrónico</label>
            <input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
            <label htmlFor="user-password">Contraseña inicial</label>
            <input id="user-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
            <label htmlFor="user-role">Rol</label>
            <select id="user-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="EMPLOYEE">Empleado</option>
              <option value="ADMIN">Administrador</option>
            </select>
            <button className="submit-button" type="submit">Crear cuenta</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
        </section>

        <section className="requests-panel" aria-labelledby="users-list-title">
          <div className="list-heading">
            <div>
              <h2 id="users-list-title">Cuentas</h2>
              <p>Desactivar revoca sesiones. El superadministrador único no se puede desactivar.</p>
            </div>
          </div>
          <ul className="product-list">
            {users.map((user) => (
              <li className={`product-card user-account-card${user.isActive ? '' : ' inactive'}`} key={user.id}>
                <div className="product-card-content">
                  <h3>{user.name}</h3>
                  <div className="product-stock-details">
                    <span>{user.email}</span>
                    <span>{user.role}</span>
                    <span>{user.isActive ? 'Activa' : 'Inactiva'}</span>
                  </div>
                </div>
                {user.role !== 'Superadministrador' && (
                  <div className="user-account-actions">
                    <button className="filter-button" onClick={() => handleToggle(user)} type="button">
                      {user.isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                    </button>
                    {user.isActive && (
                      <form onSubmit={(event) => handleResetPassword(event, user)}>
                        <label htmlFor={`temporary-password-${user.id}`}>Nueva contraseña temporal</label>
                        <input
                          autoComplete="new-password"
                          id={`temporary-password-${user.id}`}
                          minLength={12}
                          onChange={(event) => setResetPasswords((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))}
                          required
                          type="password"
                          value={resetPasswords[user.id] ?? ''}
                        />
                        <button className="filter-button" type="submit">Restablecer contraseña</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  )
}

export default UsersPage
