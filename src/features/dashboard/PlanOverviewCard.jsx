import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from 'lucide-react'

const resourceLabels = {
  users: 'Usuarios',
  branches: 'Sucursales',
  products: 'Productos',
}

function getTrialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - Date.now()) / (24 * 60 * 60 * 1000)))
}

function PlanOverviewCard({ subscription, status, error, onRetry, onViewPlan }) {
  if (status === 'loading' || (!subscription && status !== 'error')) {
    return (
      <section className="plan-overview-card glass-panel" aria-live="polite" role="status">
        <span className="plan-overview-icon"><Clock3 aria-hidden="true" size={18} /></span>
        <p>Consultando el plan de tu empresa…</p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="plan-overview-card plan-overview-card-warning glass-panel" role="alert">
        <span className="plan-overview-icon"><AlertTriangle aria-hidden="true" size={18} /></span>
        <div className="plan-overview-copy">
          <h3>No se pudo consultar el plan</h3>
          <p>{error}</p>
        </div>
        <button className="plan-overview-button" onClick={onRetry} type="button">
          <RefreshCw aria-hidden="true" size={15} />
          Reintentar
        </button>
      </section>
    )
  }

  if (!subscription) return null

  const { organization, subscription: plan } = subscription
  const trialDaysRemaining = plan.status === 'trial'
    ? getTrialDaysRemaining(plan.trialEndsAt)
    : null
  const isClosing = organization.status === 'closing'
  const isTrial = plan.status === 'trial'
  const needsAttention = isClosing || ['expired', 'suspended'].includes(plan.status) ||
    (isTrial && trialDaysRemaining <= 7)
  const usage = plan.usage
  const userCount = usage.users + usage.pendingInvitations

  const message = isClosing
    ? 'La empresa está en periodo de baja. Puedes exportar los datos o cancelar la baja desde Usuarios.'
    : plan.status === 'expired'
      ? 'La prueba terminó. El acceso a las operaciones está pausado; solicita la activación manual del plan Empresa.'
      : plan.status === 'suspended'
        ? 'El acceso a las operaciones está suspendido. Contacta al administrador de Gestora para revisar el plan.'
        : isTrial
          ? trialDaysRemaining === 0
            ? 'La prueba terminó. Solicita la activación manual del plan Empresa.'
            : `Tu prueba termina en ${trialDaysRemaining} ${trialDaysRemaining === 1 ? 'día' : 'días'}. La activación de Empresa se gestiona manualmente.`
          : 'Tu plan está activo. Consulta el uso actual de la empresa.'

  return (
    <section
      className={`plan-overview-card glass-panel${needsAttention ? ' plan-overview-card-warning' : ''}`}
      aria-labelledby="plan-overview-title"
    >
      <span className="plan-overview-icon">
        {needsAttention
          ? <AlertTriangle aria-hidden="true" size={18} />
          : <CheckCircle2 aria-hidden="true" size={18} />}
      </span>
      <div className="plan-overview-copy">
        <div className="plan-overview-heading">
          <h3 id="plan-overview-title">Plan {plan.planName}</h3>
          <span className="plan-overview-status">{isClosing ? 'Baja programada' : plan.status}</span>
        </div>
        <p>{message}</p>
        <div className="plan-usage-grid" aria-label="Uso del plan">
          {[
            { key: 'users', value: userCount, limit: plan.limits.users },
            { key: 'branches', value: usage.branches, limit: plan.limits.branches },
            { key: 'products', value: usage.products, limit: plan.limits.products },
          ].map(({ key, value, limit }) => (
            <div className="plan-usage-item" key={key}>
              <div className="plan-usage-label">
                <span>{resourceLabels[key]}</span>
                <strong>{value}/{limit}</strong>
              </div>
              <div
                className="plan-usage-track"
                role="progressbar"
                aria-label={`${resourceLabels[key]} utilizados`}
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-valuenow={Math.min(value, limit)}
              >
                <span style={{ width: `${Math.min(100, (value / limit) * 100)}%` }} />
              </div>
              {key === 'users' && usage.pendingInvitations > 0 && (
                <small>{usage.pendingInvitations} puesto(s) reservado(s) por invitaciones</small>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="plan-overview-button" onClick={onViewPlan} type="button">
        {isTrial || plan.status === 'expired' || plan.status === 'suspended'
          ? 'Ver opciones'
          : 'Administrar plan'}
        <ArrowRight aria-hidden="true" size={15} />
      </button>
    </section>
  )
}

export default PlanOverviewCard
