import { cosineSimilarity, embedTexts } from './embeddingProviders'
import { average, buildOverlapMatrix } from './metrics'

function now() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now()
  }

  return Date.now()
}

export async function compareQueries({ documents, queries, modelIds, topK, baseUrl }) {
  const perModelData = {}
  const summaryAccumulator = {}

  for (const modelId of modelIds) {
    const prepStart = now()
    const documentVectors = await embedTexts({
      texts: documents,
      modelId,
      baseUrl,
    })
    const prepLatencyMs = now() - prepStart

    const queryEmbeddingStart = now()
    const queryVectors = await embedTexts({
      texts: queries,
      modelId,
      baseUrl,
    })
    const queryEmbeddingTotalMs = now() - queryEmbeddingStart

    if (documentVectors.length !== documents.length) {
      throw new Error(
        `Model ${modelId} returned ${documentVectors.length} doc embeddings for ${documents.length} docs.`,
      )
    }

    if (queryVectors.length !== queries.length) {
      throw new Error(
        `Model ${modelId} returned ${queryVectors.length} query embeddings for ${queries.length} queries.`,
      )
    }

    perModelData[modelId] = {
      documentVectors,
      queryVectors,
      queryEmbeddingAvgMs: queryEmbeddingTotalMs / queries.length,
    }

    summaryAccumulator[modelId] = {
      prepLatencyMs,
      latencies: [],
      topScores: [],
    }
  }

  const resultsByQuery = queries.map((queryText, queryIndex) => {
    const rankingByModel = {}

    for (const modelId of modelIds) {
      const evalStart = now()
      const queryVector = perModelData[modelId].queryVectors[queryIndex]

      if (!Array.isArray(queryVector)) {
        throw new Error(`Missing query embedding for query ${queryIndex + 1} in model ${modelId}.`)
      }

      const rankedDocs = documents
        .map((document, docIndex) => {
          const documentVector = perModelData[modelId].documentVectors[docIndex]

          if (!Array.isArray(documentVector)) {
            throw new Error(`Missing document embedding for doc ${docIndex + 1} in model ${modelId}.`)
          }

          return {
            docIndex,
            document,
            score: cosineSimilarity(queryVector, documentVector),
          }
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, topK)

      const rankingLatencyMs = now() - evalStart
      const latencyMs = rankingLatencyMs + perModelData[modelId].queryEmbeddingAvgMs
      const averageScore = average(rankedDocs.map((doc) => doc.score))

      rankingByModel[modelId] = {
        latencyMs,
        averageScore,
        rankedDocs,
      }

      summaryAccumulator[modelId].latencies.push(latencyMs)
      if (rankedDocs[0]) {
        summaryAccumulator[modelId].topScores.push(rankedDocs[0].score)
      }
    }

    const overlapMatrix = buildOverlapMatrix(modelIds, rankingByModel, topK)

    return {
      queryId: `query-${queryIndex + 1}`,
      queryText,
      rankingByModel,
      overlapMatrix,
    }
  })

  const summaryByModel = modelIds.reduce((summary, modelId) => {
    const modelSummary = summaryAccumulator[modelId]

    summary[modelId] = {
      prepLatencyMs: modelSummary.prepLatencyMs,
      avgLatencyMs: average(modelSummary.latencies),
      avgTopScore: average(modelSummary.topScores),
    }

    return summary
  }, {})

  return {
    topK,
    resultsByQuery,
    summaryByModel,
  }
}
