import { randomUUID } from 'node:crypto'

export function createAuditService({
  repository,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function record({ actor, action, entityType, entityId = null, details = {} }) {
    repository.insert({
      id: createId(),
      actorId: actor.id,
      organizationId: actor.organization_id,
      actorName: actor.name,
      action,
      entityType,
      entityId,
      details: JSON.stringify(details),
      createdAt: now(),
    })
  }

  function list({ organizationId, page, pageSize }) {
    const total = repository.count(organizationId)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    return {
      events: repository.findPage({
        organizationId,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      }).map((event) => ({
        id: event.id,
        actorId: event.actor_id,
        actorName: event.actor_name,
        action: event.action,
        entityType: event.entity_type,
        entityId: event.entity_id,
        details: JSON.parse(event.details),
        createdAt: event.created_at,
      })),
      pagination: { page: currentPage, pageSize, total, totalPages },
    }
  }

  return { record, list }
}
