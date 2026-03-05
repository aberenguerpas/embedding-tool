export function average(values) {
  if (!values.length) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

export function overlapAtK(rankedDocsA, rankedDocsB, topK) {
  const leftIds = rankedDocsA.slice(0, topK).map((doc) => doc.docIndex)
  const rightIds = new Set(rankedDocsB.slice(0, topK).map((doc) => doc.docIndex))

  let overlapCount = 0

  for (const docIndex of leftIds) {
    if (rightIds.has(docIndex)) {
      overlapCount += 1
    }
  }

  return overlapCount / topK
}

export function buildOverlapMatrix(modelIds, rankingByModel, topK) {
  return modelIds.map((leftModelId) =>
    modelIds.map((rightModelId) => {
      if (leftModelId === rightModelId) {
        return 1
      }

      const leftRanking = rankingByModel[leftModelId]?.rankedDocs ?? []
      const rightRanking = rankingByModel[rightModelId]?.rankedDocs ?? []

      if (!leftRanking.length || !rightRanking.length || topK === 0) {
        return 0
      }

      return overlapAtK(leftRanking, rightRanking, topK)
    }),
  )
}
