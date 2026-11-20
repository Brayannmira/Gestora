export const REQUEST_FILTERS_KEY = 'gestora:request-filters'
export const INVENTORY_FILTERS_KEY = 'gestora:inventory-filters'

export function readSessionPreference(key, fallback) {
  const serialized = window.sessionStorage.getItem(key)
  if (serialized === null) return fallback

  try {
    const preference = JSON.parse(serialized)
    return preference && typeof preference === 'object' && !Array.isArray(preference)
      ? preference
      : fallback
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    window.sessionStorage.removeItem(key)
    return fallback
  }
}

export function writeSessionPreference(key, value) {
  window.sessionStorage.setItem(key, JSON.stringify(value))
}
