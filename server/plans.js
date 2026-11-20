import { HttpError } from './shared/errors.js'

const trialDays = Number(process.env.TRIAL_DAYS ?? 14)
if (!Number.isSafeInteger(trialDays) || trialDays < 1 || trialDays > 365) {
  throw new Error('TRIAL_DAYS debe ser un entero entre 1 y 365.')
}

export const PLANS = Object.freeze({
  prueba: Object.freeze({
    name: 'Prueba',
    maxUsers: 5,
    maxBranches: 1,
    maxProducts: 500,
    trialDays,
  }),
  empresa: Object.freeze({
    name: 'Empresa',
    maxUsers: 25,
    maxBranches: 5,
    maxProducts: 5000,
    trialDays: null,
  }),
})

export function getPlanLimits(planKey) {
  const plan = PLANS[planKey]
  if (!plan) throw new HttpError(409, 'El plan de esta empresa no es válido.')
  return plan
}

export function enforcePlanLimit({ planKey, resource, count }) {
  const plan = getPlanLimits(planKey)
  const limits = {
    users: plan.maxUsers,
    branches: plan.maxBranches,
    products: plan.maxProducts,
  }
  const maximum = limits[resource]
  if (count >= maximum) {
    const labels = {
      users: 'usuarios activos o invitaciones pendientes',
      branches: 'sucursales',
      products: 'productos',
    }
    throw new HttpError(
      409,
      `El plan ${plan.name} permite hasta ${maximum} ${labels[resource]}. Cambia el plan para continuar.`,
    )
  }
}
