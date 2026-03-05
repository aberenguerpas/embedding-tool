const DEFAULT_API_BASE_URL = import.meta.env.VITE_EMBEDDINGS_API_BASE_URL ?? '/api'
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

function l2Normalize(vector) {
  let magnitude = 0

  for (const component of vector) {
    magnitude += component * component
  }

  if (magnitude === 0) {
    return vector
  }

  const scale = 1 / Math.sqrt(magnitude)
  return vector.map((component) => component * scale)
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

export async function embedTexts({
  texts,
  modelId,
  baseUrl = DEFAULT_API_BASE_URL,
  normalizeEmbeddings = true,
  batchSize,
}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return []
  }

  let response
  let payload

  try {
    response = await fetchWithTimeout(
      buildUrl(baseUrl, '/embeddings'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          texts,
          normalize_embeddings: normalizeEmbeddings,
          batch_size: batchSize,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    )

    payload = await readResponsePayload(response)
  } catch (error) {
    throw new Error(formatNetworkError(error, 'Embeddings API request failed'), { cause: error })
  }

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.error ?? payload?.raw ?? 'Unknown backend error'
    throw new Error(`Embeddings API error (${response.status}): ${detail}`)
  }

  if (!Array.isArray(payload?.embeddings)) {
    throw new Error('Embeddings API returned an invalid response payload.')
  }

  if (payload.embeddings.length !== texts.length) {
    throw new Error(
      `Embeddings API returned ${payload.embeddings.length} vectors for ${texts.length} texts.`,
    )
  }

  const invalidVector = payload.embeddings.find(
    (vector) => !Array.isArray(vector) || vector.some((value) => typeof value !== 'number'),
  )

  if (invalidVector) {
    throw new Error('Embeddings API returned non-numeric embedding values.')
  }

  return payload.embeddings.map((vector) => l2Normalize(vector))
}

export function cosineSimilarity(vectorA, vectorB) {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vector dimensions must match for cosine similarity.')
  }

  let dotProduct = 0

  for (let index = 0; index < vectorA.length; index += 1) {
    dotProduct += vectorA[index] * vectorB[index]
  }

  return dotProduct
}
