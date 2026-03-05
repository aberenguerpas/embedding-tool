import { average, buildOverlapMatrix } from './metrics'
import { rerankDocuments } from './rerankProviders'

function now() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now()
  }

  return Date.now()
}

function computeMrrAtK(rankedDocs, relevantDocIndexes, topK) {
  for (let rank = 0; rank < Math.min(topK, rankedDocs.length); rank += 1) {
    if (relevantDocIndexes.has(rankedDocs[rank].docIndex)) {
      return 1 / (rank + 1)
    }
  }

  return 0
}

function computeRecallAtK(rankedDocs, relevantDocIndexes, topK) {
  if (!relevantDocIndexes.size) {
    return 0
  }

  let hits = 0

  for (let rank = 0; rank < Math.min(topK, rankedDocs.length); rank += 1) {
    if (relevantDocIndexes.has(rankedDocs[rank].docIndex)) {
      hits += 1
    }
  }

  return hits / relevantDocIndexes.size
}

function computeNdcgAtK(rankedDocs, relevantDocIndexes, topK) {
  if (!relevantDocIndexes.size) {
    return 0
  }

  let dcg = 0

  for (let rank = 0; rank < Math.min(topK, rankedDocs.length); rank += 1) {
    if (relevantDocIndexes.has(rankedDocs[rank].docIndex)) {
      dcg += 1 / Math.log2(rank + 2)
    }
  }

  const idealHits = Math.min(topK, relevantDocIndexes.size)
  let idcg = 0

  for (let rank = 0; rank < idealHits; rank += 1) {
    idcg += 1 / Math.log2(rank + 2)
  }

  return idcg === 0 ? 0 : dcg / idcg
}

function buildWinRateMatrix(modelIds, perQueryMetricByModel) {
  return modelIds.map((leftModelId) =>
    modelIds.map((rightModelId) => {
      if (leftModelId === rightModelId) {
        return 1
      }

      let leftWins = 0
      let ties = 0
      let compared = 0

      for (const metricByModel of perQueryMetricByModel) {
        const leftValue = metricByModel[leftModelId]
        const rightValue = metricByModel[rightModelId]

        if (typeof leftValue !== 'number' || typeof rightValue !== 'number') {
          continue
        }

        compared += 1

        if (leftValue > rightValue) {
          leftWins += 1
        } else if (leftValue === rightValue) {
          ties += 1
        }
      }

      return compared === 0 ? 0 : (leftWins + ties * 0.5) / compared
    }),
  )
}

export async function compareRerankQueries({
  documents,
  queries,
  modelIds,
  topK,
  baseUrl,
  relevanceByQuery,
  candidateDocIndexesByQuery,
  onLog,
}) {
  const hasRelevanceJudgments =
    Array.isArray(relevanceByQuery) &&
    relevanceByQuery.length === queries.length &&
    relevanceByQuery.some((entry) => entry?.size > 0)

  const summaryAccumulator = {}
  const qualityAccumulator = {}
  const perQueryMetricByModel = []

  for (const modelId of modelIds) {
    summaryAccumulator[modelId] = {
      prepLatencyMs: 0,
      latencies: [],
      topScores: [],
    }

    qualityAccumulator[modelId] = {
      recall: [],
      mrr: [],
      ndcg: [],
    }
  }

  const resultsByQuery = []

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const queryText = queries[queryIndex]
    const rankingByModel = {}
    const metricByModel = {}

    for (const modelId of modelIds) {
      const hasCandidateSubset = Array.isArray(candidateDocIndexesByQuery?.[queryIndex])
      const candidateIndexes = hasCandidateSubset
        ? candidateDocIndexesByQuery[queryIndex]
        : documents.map((_, index) => index)
      const candidateDocs = candidateIndexes.map((docIndex) => documents[docIndex]).filter(Boolean)

      if (hasCandidateSubset && candidateDocs.length === 0) {
        rankingByModel[modelId] = {
          latencyMs: 0,
          averageScore: 0,
          rankedDocs: [],
        }

        if (hasRelevanceJudgments) {
          const relevantDocIndexes = relevanceByQuery[queryIndex] ?? new Set()
          const recallAtK = computeRecallAtK([], relevantDocIndexes, topK)
          const mrrAtK = computeMrrAtK([], relevantDocIndexes, topK)
          const ndcgAtK = computeNdcgAtK([], relevantDocIndexes, topK)
          rankingByModel[modelId].quality = { recallAtK, mrrAtK, ndcgAtK }
          qualityAccumulator[modelId].recall.push(recallAtK)
          qualityAccumulator[modelId].mrr.push(mrrAtK)
          qualityAccumulator[modelId].ndcg.push(ndcgAtK)
          metricByModel[modelId] = ndcgAtK
        } else {
          metricByModel[modelId] = 0
        }

        summaryAccumulator[modelId].latencies.push(0)
        continue
      }

      onLog?.({ level: 'info', message: `Reranking Q${queryIndex + 1} con ${modelId}` })
      const start = now()

      const { rankedDocs, elapsedMs } = await rerankDocuments({
        query: queryText,
        documents: candidateDocs,
        documentIndexes: candidateIndexes,
        modelId,
        baseUrl,
        topK,
      })

      const localElapsedMs = now() - start
      const latencyMs = Math.max(elapsedMs, localElapsedMs)
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

      if (hasRelevanceJudgments) {
        const relevantDocIndexes = relevanceByQuery[queryIndex] ?? new Set()
        const recallAtK = computeRecallAtK(rankedDocs, relevantDocIndexes, topK)
        const mrrAtK = computeMrrAtK(rankedDocs, relevantDocIndexes, topK)
        const ndcgAtK = computeNdcgAtK(rankedDocs, relevantDocIndexes, topK)

        rankingByModel[modelId].quality = { recallAtK, mrrAtK, ndcgAtK }
        qualityAccumulator[modelId].recall.push(recallAtK)
        qualityAccumulator[modelId].mrr.push(mrrAtK)
        qualityAccumulator[modelId].ndcg.push(ndcgAtK)
        metricByModel[modelId] = ndcgAtK
      } else {
        metricByModel[modelId] = averageScore
      }
    }

    perQueryMetricByModel.push(metricByModel)

    resultsByQuery.push({
      queryId: `query-${queryIndex + 1}`,
      queryText,
      rankingByModel,
      overlapMatrix: buildOverlapMatrix(modelIds, rankingByModel, topK),
    })
  }

  const summaryByModel = modelIds.reduce((summary, modelId) => {
    summary[modelId] = {
      prepLatencyMs: 0,
      avgLatencyMs: average(summaryAccumulator[modelId].latencies),
      avgTopScore: average(summaryAccumulator[modelId].topScores),
    }

    return summary
  }, {})

  const evaluationByModel = hasRelevanceJudgments
    ? modelIds.reduce((evaluation, modelId) => {
      evaluation[modelId] = {
        recallAtK: average(qualityAccumulator[modelId].recall),
        mrrAtK: average(qualityAccumulator[modelId].mrr),
        ndcgAtK: average(qualityAccumulator[modelId].ndcg),
      }
      return evaluation
    }, {})
    : null

  return {
    topK,
    resultsByQuery,
    summaryByModel,
    evaluationByModel,
    winRateMatrix: buildWinRateMatrix(modelIds, perQueryMetricByModel),
    winRateMetric: hasRelevanceJudgments ? 'ndcg@k' : 'avg top-k score',
  }
}
