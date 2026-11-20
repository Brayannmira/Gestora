import { useEffect, useState } from 'react'
import {
  cancelInvitation,
  cancelOrganizationClosure,
  createUserInvitation,
  createOrganization,
  downloadOrganizationExport,
  getBranches,
  getInvitations,
  getOrganizationSubscription,
  getUsers,
  requestOrganizationClosure,
  resetUserPassword,
  sendTestEmail,
  updateUserStatus,
  updateUserBranch,
} from './usersApi.js'
import showSweetAlert from '../../sweetAlert.js'

function UsersPage({ onSubscriptionChange }) {
  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [limits, setLimits] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [resetPasswords, setResetPasswords] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const canManageUsers = subscription?.organization.status === 'active' &&
    !['expired', 'suspended'].includes(subscription.subscription.status)

  async function loadUsers() {
    const subscriptionData = await getOrganizationSubscription()
    setSubscription(subscriptionData)
    onSubscriptionChange?.(subscriptionData)
    const [data, branchData, invitationData] = await Promise.all([
      getUsers(),
      getBranches(),
      getInvitations(),
    ])
    setUsers(data.users)
    setLimits(data.limits)
    setBranches(branchData.branches)
    setInvitations(invitationData.invitations)
    setBranchId((current) => current || branchData.branches[0]?.id || '')
  }

  useEffect(() => {
    let active = true
    getOrganizationSubscription()
      .then((subscriptionData) => {
        if (!active) return
        setSubscription(subscriptionData)
        onSubscriptionChange?.(subscriptionData)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    Promise.all([getUsers(), getBranches(), getInvitations()])
      .then(([data, branchData, invitationData]) => {
        if (!active) return
        setUsers(data.users)
        setLimits(data.limits)
        setBranches(branchData.branches)
        setInvitations(invitationData.invitations)
        setBranchId(branchData.branches[0]?.id ?? '')
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    return () => { active = false }
  }, [onSubscriptionChange])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    try {
      await createUserInvitation({ name, email, role, branchId: role === 'EMPLOYEE' ? branchId : undefined })
      setName('')
      setEmail('')
      await loadUsers()
      setSuccess('Invitación enviada. El usuario creará su contraseña desde el enlace del correo.')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function handleBranchChange(user, nextBranchId) {
    setError('')
    setSuccess('')
    try {
      await updateUserBranch(user.id, nextBranchId)
      await loadUsers()
      setSuccess(`Se actualizó la sucursal de ${user.name}.`)
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  async function handleOrganizationSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    try {
      const result = await createOrganization({
        name: organizationName,
        ownerName,
        email: ownerEmail,
      })
      setOrganizationName('')
      setOwnerName('')
      setOwnerEmail('')
      setSuccess(`Empresa creada. Se envió una invitación a ${result.invitation.email}.`)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function handleToggle(user) {
    const nextActive = !user.isActive
    const message = nextActive
      ? `¿Reactivar la cuenta de ${user.name}?`
      : `¿Desactivar la cuenta de ${user.name}? Se cerrarán sus sesiones activas.`
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: 'Confirmar acción',
      text: message,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Volver',
    })
    if (!confirmation.isConfirmed) return
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

  async function handleCancelInvitation(invitation) {
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: 'Cancelar invitación',
      text: `¿Cancelar la invitación enviada a ${invitation.email}?`,
      showCancelButton: true,
      confirmButtonText: 'Cancelar invitación',
      cancelButtonText: 'Volver',
    })
    if (!confirmation.isConfirmed) return
    try {
      await cancelInvitation(invitation.id)
      await loadUsers()
      setSuccess('Invitación cancelada.')
    } catch (cancelError) {
      setError(cancelError.message)
    }
  }

  async function handleClosure() {
    if (subscription?.organization.status === 'closing') {
      try {
        await cancelOrganizationClosure()
        await loadUsers()
        setSuccess('Se canceló la solicitud de baja.')
      } catch (closureError) {
        setError(closureError.message)
      }
      return
    }
    const confirmation = await showSweetAlert({
      icon: 'warning',
      title: 'Solicitar baja de la empresa',
      text: 'El acceso se suspenderá ahora. Podrás exportar los datos o cancelar la baja durante 30 días; después se eliminarán permanentemente.',
      showCancelButton: true,
      confirmButtonText: 'Solicitar baja',
      cancelButtonText: 'Volver',
    })
    if (!confirmation.isConfirmed) return
    try {
      const result = await requestOrganizationClosure()
      const updatedSubscription = {
        ...subscription,
        organization: {
          ...subscription.organization,
          status: 'closing',
          deletionRequestedAt: result.deletionRequestedAt,
        },
      }
      setSubscription(updatedSubscription)
      onSubscriptionChange?.(updatedSubscription)
      setSuccess(`Acceso suspendido. Los datos se eliminarán después del ${new Date(result.purgeAfter).toLocaleDateString('es-ES')}.`)
    } catch (closureError) {
      setError(closureError.message)
    }
  }

  async function handleTestEmail() {
    try {
      await sendTestEmail()
      setSuccess('Se envió el correo de prueba a tu cuenta.')
    } catch (emailError) {
      setError(emailError.message)
    }
  }

  async function handleExport() {
    try {
      await downloadOrganizationExport()
      setSuccess('Exportación descargada.')
    } catch (exportError) {
      setError(exportError.message)
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
            Invita a tu equipo y administra la seguridad, el plan y los datos de tu empresa.
          </p>
        </div>
        {limits && (
          <div className="request-count" aria-live="polite">
            Administradores {limits.admins}/{limits.maxAdmins}
          </div>
        )}
      </div>

      <div className="content-grid">
        {subscription && (
          <section className="form-panel" aria-labelledby="plan-title">
            <div className="section-heading">
              <span className="section-icon" aria-hidden="true">✓</span>
              <div>
                <h2 id="plan-title">Plan {subscription.subscription.planName}</h2>
                <p>Estado: {subscription.subscription.status}</p>
              </div>
            </div>
            <p>
              Usuarios {subscription.subscription.usage.users + subscription.subscription.usage.pendingInvitations}/
              {subscription.subscription.limits.users} · Sucursales {subscription.subscription.usage.branches}/
              {subscription.subscription.limits.branches} · Productos {subscription.subscription.usage.products}/
              {subscription.subscription.limits.products}
            </p>
            {subscription.subscription.trialEndsAt && (
              <p>Prueba hasta {new Date(subscription.subscription.trialEndsAt).toLocaleDateString('es-ES')}</p>
            )}
            {['trial', 'expired'].includes(subscription.subscription.status) && (
              <p>
                La activación del plan Empresa se gestiona manualmente; contacta al administrador de Gestora.
              </p>
            )}
            {subscription.organization.status === 'closing' && (
              <p role="alert">
                Empresa suspendida. Eliminación programada para {new Date(
                  new Date(subscription.organization.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
                ).toLocaleDateString('es-ES')}.
              </p>
            )}
            <div className="user-account-actions">
              <button className="filter-button" onClick={handleExport} type="button">Exportar datos</button>
              <button
                className="filter-button"
                disabled={!canManageUsers}
                onClick={handleTestEmail}
                type="button"
              >
                Probar correo
              </button>
              <button className="filter-button" onClick={handleClosure} type="button">
                {subscription.organization.status === 'closing' ? 'Cancelar baja' : 'Solicitar baja'}
              </button>
            </div>
          </section>
        )}
        {canManageUsers && <section className="form-panel" aria-labelledby="organization-form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="organization-form-title">Nueva empresa</h2>
              <p>Crea una organización aislada y su primer superadministrador.</p>
            </div>
          </div>
          <form onSubmit={handleOrganizationSubmit}>
            <label htmlFor="organization-name">Empresa</label>
            <input id="organization-name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required maxLength={100} />
            <label htmlFor="organization-owner-name">Nombre del superadministrador</label>
            <input id="organization-owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required maxLength={100} />
            <label htmlFor="organization-owner-email">Correo electrónico</label>
            <input id="organization-owner-email" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required maxLength={254} />
            <p>El superadministrador recibirá un enlace de invitación para crear su propia contraseña.</p>
            <button className="submit-button" type="submit">Crear empresa e invitar</button>
          </form>
        </section>}

        {canManageUsers && <section className="form-panel" aria-labelledby="user-form-title">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">+</span>
            <div>
              <h2 id="user-form-title">Nueva cuenta</h2>
              <p>El usuario recibirá un enlace para crear una contraseña propia.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="user-name">Nombre</label>
            <input id="user-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            <label htmlFor="user-email">Correo electrónico</label>
            <input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
            <label htmlFor="user-role">Rol</label>
            <select id="user-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="EMPLOYEE">Empleado</option>
              <option value="ADMIN">Administrador</option>
            </select>
            {role === 'EMPLOYEE' && (
              <>
                <label htmlFor="user-branch">Sucursal del empleado</label>
                <select
                  id="user-branch"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  required
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </>
            )}
            <button className="submit-button" type="submit">Enviar invitación</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
        </section>}

        {canManageUsers && <section className="requests-panel" aria-labelledby="invitations-title">
          <div className="list-heading">
            <div>
              <h2 id="invitations-title">Invitaciones pendientes</h2>
              <p>Los enlaces vencen en 48 horas y reservan un puesto del plan.</p>
            </div>
          </div>
          <ul className="product-list">
            {invitations.map((invitation) => (
              <li className="product-card" key={invitation.id}>
                <div className="product-card-content">
                  <h3>{invitation.name}</h3>
                  <div className="product-stock-details">
                    <span>{invitation.email}</span>
                    <span>{invitation.role}</span>
                    <span>Vence {new Date(invitation.expires_at).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
                <button className="filter-button" onClick={() => handleCancelInvitation(invitation)} type="button">
                  Cancelar invitación
                </button>
              </li>
            ))}
            {invitations.length === 0 && <li>No hay invitaciones pendientes.</li>}
          </ul>
        </section>}

        {canManageUsers && <section className="requests-panel" aria-labelledby="users-list-title">
          <div className="list-heading">
            <div>
              <h2 id="users-list-title">Cuentas</h2>
              <p>Desactivar revoca sesiones. El superadministrador de la empresa no se puede desactivar.</p>
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
                    {user.role === 'Empleado' && (
                      <label>
                        Sucursal
                        <select
                          aria-label={`Sucursal de ${user.name}`}
                          value={user.branchId ?? ''}
                          onChange={(event) => void handleBranchChange(user, event.target.value)}
                        >
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
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
        </section>}
      </div>
    </section>
  )
}

export default UsersPage
