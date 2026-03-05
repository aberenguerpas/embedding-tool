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

export async function downloadRerankers({ baseUrl = DEFAULT_API_BASE_URL, modelIds, forceReload = false }) {
  let response
  let payload

  try {
    response = await fetchWithTimeout(
      buildUrl(baseUrl, '/rerankers/download'),
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
    throw new Error(formatNetworkError(error, 'Reranker download request failed'), { cause: error })
  }

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.error ?? payload?.raw ?? 'Unknown backend error'
    throw new Error(`Reranker download error (${response.status}): ${detail}`)
  }

  return payload
}

export async function rerankDocuments({
  query,
  documents,
  documentIndexes,
  modelId,
  baseUrl = DEFAULT_API_BASE_URL,
  topK,
}) {
  let response
  let payload

  try {
    response = await fetchWithTimeout(
      buildUrl(baseUrl, '/rerank'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          queries: [query],
          documents,
          top_k: topK,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    )

    payload = await readResponsePayload(response)
  } catch (error) {
    throw new Error(formatNetworkError(error, 'Rerank API request failed'), { cause: error })
  }

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.error ?? payload?.raw ?? 'Unknown backend error'
    throw new Error(`Rerank API error (${response.status}): ${detail}`)
  }

  const firstResult = payload?.results?.[0]
  if (!firstResult || !Array.isArray(firstResult.ranked_docs)) {
    throw new Error('Rerank API returned an invalid response payload.')
  }

  return {
    rankedDocs: firstResult.ranked_docs.map((doc) => ({
      docIndex: Array.isArray(documentIndexes) ? (documentIndexes[doc.doc_index] ?? doc.doc_index) : doc.doc_index,
      document: doc.document,
      score: doc.score,
    })),
    elapsedMs: Number(payload?.elapsed_ms ?? 0),
  }
}
