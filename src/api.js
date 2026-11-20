const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiOrigin}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body
      ? { body: JSON.stringify(options.body) }
      : {}),
  })

  if (response.status === 204) return null

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('El servidor devolvió una respuesta inválida.')
  }
  if (!response.ok) {
    const error = new Error(payload.error ?? 'No se pudo completar la operación.')
    error.status = response.status
    throw error
  }
  return payload
}
