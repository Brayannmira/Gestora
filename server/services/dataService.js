import { HttpError } from '../shared/errors.js'

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date
}

export function createDataService({ repository, now = () => new Date() }) {
  function getData(user) {
    return {
      products: repository.findProducts(
        user.organization_id,
        user.role === 'EMPLOYEE' ? user.branch_id : undefined,
      ),
      branches: repository.findBranches(
        user.organization_id,
        user.role === 'EMPLOYEE' ? user.branch_id : undefined,
      ),
      requestSummary: repository.getRequestSummary(
        user.organization_id,
        user.role === 'EMPLOYEE' ? user.id : null,
        user.role === 'EMPLOYEE' ? user.branch_id : undefined,
      ),
      movements: user.role === 'EMPLOYEE' ? [] : repository.findMovements(user.organization_id),
    }
  }

  function getReports({ from, to } = {}, organizationId) {
    const endDate = now()
    const startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - 29)
    const toDateString = (date) => date.toISOString().slice(0, 10)
    const fromDateString = from ?? toDateString(startDate)
    const toDateStringValue = to ?? toDateString(endDate)
    const fromDate = parseDate(fromDateString)
    const toDate = parseDate(toDateStringValue)

    if (!fromDate || !toDate || fromDate > toDate) {
      throw new HttpError(400, 'Indica un periodo válido con fecha inicial anterior a la final.')
    }
    if (toDate.getTime() - fromDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
      throw new HttpError(400, 'El periodo máximo de consulta es de 366 días.')
    }

    const start = `${fromDateString}T00:00:00.000Z`
    const endExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
    return {
      from: fromDateString,
      to: toDateStringValue,
      completedRequests: repository.findCompletedRequests(organizationId, start, endExclusive),
      lowStockProducts: repository.findLowStockProducts(organizationId),
      movements: repository.findMovementsBetween(organizationId, start, endExclusive),
      movementTotals: repository.getMovementTotals(organizationId, start, endExclusive),
    }
  }

  return { getData, getReports }
}
