export function filterRequests(requests, filter, searchQuery = '') {
  const filters = typeof filter === 'string'
    ? { quickFilter: filter }
    : filter ?? {}
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()

  return requests.filter((request) => {
    const quickFilter = filters.quickFilter ?? 'todas'
    const matchesFilter =
      (quickFilter !== 'urgentes' ||
        (request.priority === 'urgente' && request.status !== 'cancelada')) &&
      (quickFilter !== 'en-proceso' || request.status === 'en-proceso') &&
      (filters.status === undefined || filters.status === 'todas' || request.status === filters.status) &&
      (filters.priority === undefined ||
        filters.priority === 'todas' ||
        request.priority === filters.priority)
    const matchesSearch =
      !normalizedSearch ||
      `${request.title} ${request.description} ${request.productName ?? ''}`
        .toLocaleLowerCase()
        .includes(normalizedSearch)

    return matchesFilter && matchesSearch
  })
}
