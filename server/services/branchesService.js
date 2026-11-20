import { randomUUID } from 'node:crypto'
import { HttpError } from '../shared/errors.js'
import { enforcePlanLimit } from '../plans.js'

export function createBranchesService({
  repository,
  organizations,
  transaction,
  audit,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function list(actor) {
    return repository.list(
      actor.organization_id,
      actor.role === 'EMPLOYEE' ? actor.branch_id : undefined,
    )
  }

  function create({ name, actor }) {
    if (repository.nameExists(actor.organization_id, name)) {
      throw new HttpError(409, 'Ya existe una sucursal con ese nombre.')
    }

    const branch = {
      id: createId(),
      organizationId: actor.organization_id,
      name,
      createdAt: now(),
    }
    transaction(() => {
      const subscription = organizations.getSubscription(actor.organization_id)
      if (!subscription || subscription.status === 'expired' || subscription.status === 'suspended') {
        throw new HttpError(403, 'El plan de esta empresa no permite crear sucursales.')
      }
      enforcePlanLimit({
        planKey: subscription.plan_key,
        resource: 'branches',
        count: repository.count(actor.organization_id),
      })
      repository.create(branch)
      audit.record({
        actor,
        action: 'branch.created',
        entityType: 'branch',
        entityId: branch.id,
        details: { name },
      })
    })
    return { id: branch.id, name: branch.name }
  }

  return { list, create }
}
