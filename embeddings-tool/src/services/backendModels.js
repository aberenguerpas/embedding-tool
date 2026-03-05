const DEFAULT_API_BASE_URL = import.meta.env.VITE_EMBEDDINGS_API_BASE_URL ?? 'http://localhost:8000'
const DEFAULT_TIMEOUT_MS = 120000

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '')
}

function buildUrl(baseUrl, path) {
  return `${stripTrailingSlash(baseUrl)}${path}`
}

function formatNetworkError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    return `${fallbackMessage} (timeout)`
  }

  if (error instanceof TypeError) {
    return `${fallbackMessage} (network unreachable)`
  }

  return fallbackMessage
}

async function fetchWithTimeout(resource, options, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readResponsePayload(response) {
  const rawText = await response.text()

  if (!rawText) {
    return null
  }

  try {
    return JSON.parse(rawText)
  } catch {
    return { raw: rawText }
  }
}

export async function downloadModels({ baseUrl = DEFAULT_API_BASE_URL, modelIds, forceReload = false }) {
  let response
  let payload

  try {
    response = await fetchWithTimeout(
      buildUrl(baseUrl, '/models/download'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_ids: modelIds,
          force_reload: forceReload,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    )

    payload = await readResponsePayload(response)
  } catch (error) {
    throw new Error(formatNetworkError(error, 'Model download request failed'))
  }

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.error ?? payload?.raw ?? 'Unknown backend error'
    throw new Error(`Model download error (${response.status}): ${detail}`)
  }

  return payload
}

export async function checkBackendHealth({ baseUrl = DEFAULT_API_BASE_URL }) {
  let response
  let payload

  try {
    response = await fetchWithTimeout(
      buildUrl(baseUrl, '/health'),
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      10000,
    )

    payload = await readResponsePayload(response)
  } catch (error) {
    throw new Error(formatNetworkError(error, 'Backend health check failed'))
  }

  if (!response.ok) {
    throw new Error(`Backend health check failed (${response.status})`)
  }

  return payload?.status === 'ok'
}
