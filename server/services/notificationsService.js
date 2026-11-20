import { randomUUID } from 'node:crypto'

export function createNotificationsService({
  repository,
  sendEmail,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}) {
  function dispatchEmail(notification, recipients) {
    Promise.allSettled(
      recipients.map((recipient) =>
        sendEmail(recipient.email, notification.title, notification.message),
      ),
    ).then((results) => {
      const failures = results.filter((result) => result.status === 'rejected').length
      if (failures > 0) {
        process.stderr.write(
          `[Gestora] No se pudieron enviar ${failures} correos de notificación.\n`,
        )
      }
    })
  }

  function notifyRecipients({
    recipients,
    organizationId,
    branchId = null,
    type,
    title,
    message,
    entityType = null,
    entityId = null,
  }) {
    const notification = {
      type,
      title,
      message,
      entityType,
      entityId,
      createdAt: now(),
    }
    for (const recipient of recipients) {
      repository.create({
        id: createId(),
        recipientId: recipient.id,
        organizationId,
        branchId,
        ...notification,
      })
    }
    if (recipients.length > 0) dispatchEmail(notification, recipients)
  }

  function notifyManagers(event) {
    notifyRecipients({
      ...event,
      recipients: repository.findManagers(event.organizationId),
    })
  }

  function notifyUser(event) {
    const recipient = repository.findRecipient(event.recipientId, event.organizationId)
    if (!recipient) return
    notifyRecipients({ ...event, recipients: [recipient] })
  }

  function list(user) {
    return repository.listForUser(user.id, user.organization_id)
  }

  function markRead(id, user) {
    return repository.markRead(id, user.id, user.organization_id, now()).changes > 0
  }

  function markAllRead(user) {
    return repository.markAllRead(user.id, user.organization_id, now()).changes
  }

  return { list, markRead, markAllRead, notifyManagers, notifyUser }
}
