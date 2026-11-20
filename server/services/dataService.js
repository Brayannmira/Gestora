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
      products: repository.findProducts(),
      requests: repository.findRequests(user.role === 'EMPLOYEE' ? user.id : null),
      movements: user.role === 'EMPLOYEE' ? [] : repository.findMovements(),
    }
  }

  function getReports({ from, to } = {}) {
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
      completedRequests: repository.findCompletedRequests(start, endExclusive),
      lowStockProducts: repository.findLowStockProducts(),
      movements: repository.findMovementsBetween(start, endExclusive),
      movementTotals: repository.getMovementTotals(start, endExclusive),
    }
  }

  return { getData, getReports }
}
