<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ModelPicker from './components/ModelPicker.vue'
import ModelRankingTable from './components/ModelRankingTable.vue'
import ObservabilityPanel from './components/ObservabilityPanel.vue'
import QueryTabs from './components/QueryTabs.vue'
import QueryEvaluationTable from './components/QueryEvaluationTable.vue'
import SummaryBar from './components/SummaryBar.vue'
import BadgeListInput from './components/BadgeListInput.vue'
import TextListInput from './components/TextListInput.vue'
import {
  DEFAULT_DOCUMENTS_TEXT,
  DEFAULT_QUERIES_TEXT,
  MODEL_CATALOG,
  RERANKER_CATALOG,
} from './data/models'
import { checkBackendHealth, downloadModels } from './services/backendModels'
import { compareQueries } from './services/ranker'
import { compareRerankQueries } from './services/reranker'
import { downloadRerankers } from './services/rerankProviders'

const INSIGHT_TIPS = [
  'Primero recupera con embeddings y luego reranquea solo los candidatos recuperados.',
  'Usa varias queries por intencion para detectar varianza por modelo y por etapa.',
  'Si el overlap@k es alto en busqueda, reranking suele aportar mas en precision fina.',
  'Incluye relevancias para activar MRR@k y NDCG@k en ambas fases del pipeline.',
]

const STORAGE_KEYS = {
  documents: 'embeddings-tool.documents.v1',
  queries: 'embeddings-tool.queries.v1',
  relevance: 'embeddings-tool.relevance.v1',
  searchSimilarityThreshold: 'embeddings-tool.search-similarity-threshold.v1',
  rerankSimilarityThreshold: 'embeddings-tool.rerank-similarity-threshold.v1',
  similarityThreshold: 'embeddings-tool.similarity-threshold.v1',
  customModelIds: 'embeddings-tool.custom-model-ids.v1',
  selectedModelIds: 'embeddings-tool.selected-model-ids.v1',
  customRerankerIds: 'embeddings-tool.custom-reranker-ids.v1',
  selectedRerankerIds: 'embeddings-tool.selected-reranker-ids.v1',
  downloadTarget: 'embeddings-tool.download-target.v1',
}

function readLocalStorageValue(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const savedValue = window.localStorage.getItem(key)
    if (!savedValue || !savedValue.trim()) {
      return fallback
    }

    return savedValue
  } catch {
    return fallback
  }
}

function writeLocalStorageValue(key, value) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore localStorage write errors (private mode, quota, etc.).
  }
}

function readLocalStorageJsonArray(key) {
  const rawValue = readLocalStorageValue(key, '')

  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
  } catch {
    return []
  }
}

function readLocalStorageNumber(key, fallback, min, max) {
  const rawValue = readLocalStorageValue(key, '')
  const parsed = Number.parseFloat(rawValue)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(min, Math.min(max, parsed))
}

function createCustomModelEntry(modelId) {
  const label = modelId.includes('/') ? modelId.split('/').pop() : modelId

  return {
    id: modelId,
    label: label || modelId,
    description: 'Modelo anadido manualmente desde la UI.',
    promptName: null,
  }
}

function buildAvailableModels(baseCatalog, customModelIds) {
  const modelMap = new Map(baseCatalog.map((model) => [model.id, model]))

  for (const modelId of customModelIds) {
    if (!modelMap.has(modelId)) {
      modelMap.set(modelId, createCustomModelEntry(modelId))
    }
  }

  return Array.from(modelMap.values())
}

function getInitialSelectedModelIds(models, savedSelectedModelIds) {
  const availableModelIds = new Set(models.map((model) => model.id))
  const validSavedModelIds = savedSelectedModelIds.filter((modelId) => availableModelIds.has(modelId))

  if (validSavedModelIds.length > 0) {
    return validSavedModelIds
  }

  return models.slice(0, 2).map((model) => model.id)
}

const customModelIds = ref(readLocalStorageJsonArray(STORAGE_KEYS.customModelIds))
const customRerankerIds = ref(readLocalStorageJsonArray(STORAGE_KEYS.customRerankerIds))
const availableModels = ref(buildAvailableModels(MODEL_CATALOG, customModelIds.value))
const availableRerankers = ref(buildAvailableModels(RERANKER_CATALOG, customRerankerIds.value))
const selectedModelIds = ref(
  getInitialSelectedModelIds(
    availableModels.value,
    readLocalStorageJsonArray(STORAGE_KEYS.selectedModelIds),
  ),
)
const selectedRerankerIds = ref(
  getInitialSelectedModelIds(
    availableRerankers.value,
    readLocalStorageJsonArray(STORAGE_KEYS.selectedRerankerIds),
  ),
)
const documentsText = ref(readLocalStorageValue(STORAGE_KEYS.documents, DEFAULT_DOCUMENTS_TEXT))
const queriesText = ref(readLocalStorageValue(STORAGE_KEYS.queries, DEFAULT_QUERIES_TEXT))
const relevanceText = ref(readLocalStorageValue(STORAGE_KEYS.relevance, ''))
const searchSimilarityThreshold = ref(
  readLocalStorageNumber(
    STORAGE_KEYS.searchSimilarityThreshold,
    readLocalStorageNumber(STORAGE_KEYS.similarityThreshold, 0, 0, 1),
    0,
    1,
  ),
)
const rerankSimilarityThreshold = ref(
  readLocalStorageNumber(STORAGE_KEYS.rerankSimilarityThreshold, 0, 0, 1),
)
const topK = ref(10)
const apiBaseUrl = ref(import.meta.env.VITE_EMBEDDINGS_API_BASE_URL ?? '/api')
const customModelInput = ref('')
const downloadTarget = ref(readLocalStorageValue(STORAGE_KEYS.downloadTarget, 'embeddings'))
const showAdvancedControls = ref(false)
const resultSortBy = ref('score')

const retrievalOutput = ref(null)
const rerankOutput = ref(null)
const activeResultStage = ref('reranking')
const activeQueryIndex = ref(0)
const selectedComparisonRetrievalModelId = ref('')

const validationMessage = ref('')
const runtimeError = ref('')
const isRunning = ref(false)
const isDownloadingModel = ref(false)
const backendStatus = ref('unknown')
const isCheckingBackend = ref(false)
const insightTip = ref(INSIGHT_TIPS[0])
const isResultsStale = ref(false)
const debugLogs = ref([])
const pipelineStats = ref(null)
const runningStep = ref('idle')
const totalRuns = ref(0)
const successfulRuns = ref(0)
const failedRuns = ref(0)
const lastRunAt = ref('')
const lastError = ref('')
const lastRunDurationMs = ref(0)
const stepDurationsMs = ref({
  retrieval: 0,
  threshold: 0,
  rerank: 0,
})
const MAX_DEBUG_LOGS = 250

let backendCheckTimer = null

function nowMs() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now()
  }

  return Date.now()
}

function parseLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseRelevanceByQuery(text, queryCount, documentCount) {
  if (!text.trim()) {
    return null
  }

  const lines = text.split('\n')
  const relevanceByQuery = []

  for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
    const rawLine = (lines[queryIndex] ?? '').trim()

    if (!rawLine) {
      relevanceByQuery.push(new Set())
      continue
    }

    const valuePart = rawLine.includes(':') ? rawLine.split(':').slice(1).join(':') : rawLine
    const docIndexes = valuePart
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => Number.parseInt(token, 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= documentCount)
      .map((value) => value - 1)

    relevanceByQuery.push(new Set(docIndexes))
  }

  return relevanceByQuery
}

function filterCandidateDocIndexesByThreshold(retrievalResultsByQuery, retrievalModelIds, threshold) {
  const filteredIndexesByQuery = []
  let totalBefore = 0
  let totalAfter = 0

  for (const queryResult of retrievalResultsByQuery) {
    const beforeSet = new Set()
    const afterSet = new Set()

    for (const modelId of retrievalModelIds) {
      const ranking = queryResult.rankingByModel?.[modelId]?.rankedDocs ?? []

      for (const rankedDoc of ranking) {
        beforeSet.add(rankedDoc.docIndex)
        if (rankedDoc.score >= threshold) {
          afterSet.add(rankedDoc.docIndex)
        }
      }
    }

    totalBefore += beforeSet.size
    totalAfter += afterSet.size
    filteredIndexesByQuery.push(Array.from(afterSet))
  }

  return {
    filteredIndexesByQuery,
    totalBefore,
    totalAfter,
  }
}

const parsedDocuments = computed(() => parseLines(documentsText.value))
const parsedQueries = computed(() => parseLines(queriesText.value))

const documentCount = computed(() => parsedDocuments.value.length)
const queryCount = computed(() => parsedQueries.value.length)

const selectedRetrievalModelCount = computed(() => selectedModelIds.value.length)
const selectedRerankerCount = computed(() => selectedRerankerIds.value.length)

const canRun = computed(
  () =>
    selectedModelIds.value.length > 0 &&
    selectedRerankerIds.value.length > 0 &&
    documentCount.value > 0 &&
    queryCount.value > 0,
)

const hasAnyOutput = computed(() => Boolean(retrievalOutput.value || rerankOutput.value))
const retrievalComparedModelIds = computed(() =>
  retrievalOutput.value?.summaryByModel ? Object.keys(retrievalOutput.value.summaryByModel) : [],
)
const rerankComparedModelIds = computed(() =>
  rerankOutput.value?.summaryByModel ? Object.keys(rerankOutput.value.summaryByModel) : [],
)
const retrievalModelById = computed(() =>
  Object.fromEntries(availableModels.value.map((model) => [model.id, model])),
)
const rerankerModelById = computed(() =>
  Object.fromEntries(availableRerankers.value.map((model) => [model.id, model])),
)

function sortModelIds(ids, summaryByModel) {
  const sortable = [...ids]

  if (!summaryByModel) {
    return sortable
  }

  if (resultSortBy.value === 'latency') {
    return sortable.sort((left, right) => summaryByModel[left].avgLatencyMs - summaryByModel[right].avgLatencyMs)
  }

  if (resultSortBy.value === 'prep') {
    return sortable.sort((left, right) => summaryByModel[left].prepLatencyMs - summaryByModel[right].prepLatencyMs)
  }

  return sortable.sort((left, right) => summaryByModel[right].avgTopScore - summaryByModel[left].avgTopScore)
}

const orderedRetrievalModelIds = computed(() =>
  sortModelIds(retrievalComparedModelIds.value, retrievalOutput.value?.summaryByModel),
)
const orderedRerankModelIds = computed(() =>
  sortModelIds(rerankComparedModelIds.value, rerankOutput.value?.summaryByModel),
)

const activeResultOutput = computed(() =>
  activeResultStage.value === 'retrieval' ? retrievalOutput.value : rerankOutput.value,
)

const activeResultModelById = computed(() => {
  const catalog = activeResultStage.value === 'retrieval' ? availableModels.value : availableRerankers.value
  return Object.fromEntries(catalog.map((model) => [model.id, model]))
})

const comparedModelIds = computed(() => {
  if (!activeResultOutput.value?.summaryByModel) {
    return []
  }

  return Object.keys(activeResultOutput.value.summaryByModel)
})

const orderedComparedModelIds = computed(() => {
  const ids = [...comparedModelIds.value]
  const summaryByModel = activeResultOutput.value?.summaryByModel

  if (!summaryByModel) {
    return ids
  }

  if (resultSortBy.value === 'latency') {
    return ids.sort((left, right) => summaryByModel[left].avgLatencyMs - summaryByModel[right].avgLatencyMs)
  }

  if (resultSortBy.value === 'prep') {
    return ids.sort((left, right) => summaryByModel[left].prepLatencyMs - summaryByModel[right].prepLatencyMs)
  }

  return ids.sort((left, right) => summaryByModel[right].avgTopScore - summaryByModel[left].avgTopScore)
})

const activeQueryResult = computed(() => {
  if (!activeResultOutput.value?.resultsByQuery?.length) {
    return null
  }

  const boundedIndex = Math.min(activeQueryIndex.value, activeResultOutput.value.resultsByQuery.length - 1)
  return activeResultOutput.value.resultsByQuery[boundedIndex]
})

const comparisonQueryCount = computed(
  () => retrievalOutput.value?.resultsByQuery?.length ?? rerankOutput.value?.resultsByQuery?.length ?? 0,
)

const activeRetrievalQueryResult = computed(() => {
  if (!retrievalOutput.value?.resultsByQuery?.length) {
    return null
  }

  const boundedIndex = Math.min(activeQueryIndex.value, retrievalOutput.value.resultsByQuery.length - 1)
  return retrievalOutput.value.resultsByQuery[boundedIndex]
})

const activeRerankQueryResult = computed(() => {
  if (!rerankOutput.value?.resultsByQuery?.length) {
    return null
  }

  const boundedIndex = Math.min(activeQueryIndex.value, rerankOutput.value.resultsByQuery.length - 1)
  return rerankOutput.value.resultsByQuery[boundedIndex]
})

const observabilitySnapshot = computed(() => {
  const successRate = totalRuns.value > 0 ? (successfulRuns.value / totalRuns.value) * 100 : 0
  const errorLogCount = debugLogs.value.filter((entry) => entry.level === 'error').length

  return {
    isRunning: isRunning.value,
    runningStep: runningStep.value,
    totalRuns: totalRuns.value,
    successfulRuns: successfulRuns.value,
    failedRuns: failedRuns.value,
    successRate,
    lastRunAt: lastRunAt.value,
    lastError: lastError.value,
    lastRunDurationMs: lastRunDurationMs.value,
    stepDurationsMs: stepDurationsMs.value,
    logCount: debugLogs.value.length,
    errorLogCount,
  }
})

const baselineRetrievalResult = computed(() => {
  const modelId = selectedComparisonRetrievalModelId.value
  return modelId ? activeRetrievalQueryResult.value?.rankingByModel?.[modelId] ?? null : null
})

function buildRankMap(result) {
  const rankMap = new Map()
  const docsByIndex = new Map()

  if (!result?.rankedDocs) {
    return { rankMap, docsByIndex }
  }

  result.rankedDocs.forEach((doc, index) => {
    rankMap.set(doc.docIndex, index + 1)
    docsByIndex.set(doc.docIndex, doc)
  })

  return { rankMap, docsByIndex }
}

function buildRankChangeMap(retrieval, rerank) {
  if (!retrieval || !rerank) {
    return {}
  }

  const { rankMap: retrievalRanks } = buildRankMap(retrieval)
  const { rankMap: rerankRanks } = buildRankMap(rerank)

  const allDocIndexes = new Set([...retrievalRanks.keys(), ...rerankRanks.keys()])
  const changes = {}

  for (const docIndex of allDocIndexes) {
    const retrievalRank = retrievalRanks.get(docIndex) ?? null
    const rerankRank = rerankRanks.get(docIndex) ?? null

    let movement = 'same'
    let movementLabel = 'Sin cambios'

    if (retrievalRank !== null && rerankRank !== null) {
      const delta = retrievalRank - rerankRank
      if (delta > 0) {
        movement = 'up'
        movementLabel = `Sube ${delta}`
      } else if (delta < 0) {
        movement = 'down'
        movementLabel = `Baja ${Math.abs(delta)}`
      }
    } else if (retrievalRank === null && rerankRank !== null) {
      movement = 'up'
      movementLabel = 'Nuevo en reranking'
    } else if (retrievalRank !== null && rerankRank === null) {
      movement = 'down'
      movementLabel = 'Sale del top'
    }

    changes[docIndex] = {
      movement,
      label: movementLabel,
    }
  }

  return changes
}

const rerankRankChangeByModelId = computed(() => {
  if (!activeRerankQueryResult.value?.rankingByModel) {
    return {}
  }

  const baseline = baselineRetrievalResult.value
  const result = {}

  for (const modelId of orderedRerankModelIds.value) {
    result[modelId] = buildRankChangeMap(
      baseline,
      activeRerankQueryResult.value.rankingByModel[modelId],
    )
  }

  return result
})

const isAtFirstQuery = computed(() => activeQueryIndex.value <= 0)
const isAtLastQuery = computed(
  () => !comparisonQueryCount.value || activeQueryIndex.value >= comparisonQueryCount.value - 1,
)

const backendStatusLabel = computed(() => {
  if (isCheckingBackend.value) {
    return 'Comprobando backend...'
  }

  if (backendStatus.value === 'online') {
    return 'Backend conectado'
  }

  if (backendStatus.value === 'offline') {
    return 'Backend no disponible'
  }

  return 'Backend sin comprobar'
})

const retrievalStepStatus = computed(() => {
  if (runningStep.value === 'retrieval') {
    return 'running'
  }

  return retrievalOutput.value ? 'done' : 'pending'
})

const candidateStepStatus = computed(() => {
  if (runningStep.value === 'threshold') {
    return 'running'
  }

  return pipelineStats.value ? 'done' : 'pending'
})

const rerankStepStatus = computed(() => {
  if (runningStep.value === 'rerank') {
    return 'running'
  }

  return rerankOutput.value ? 'done' : 'pending'
})

function stepStatusLabel(status) {
  if (status === 'running') {
    return 'En curso'
  }

  if (status === 'done') {
    return 'Completado'
  }

  return 'Pendiente'
}

function appendDebugLog(level, message) {
  const timestamp = new Date().toLocaleTimeString()
  const nextEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level,
    message,
  }

  debugLogs.value = [...debugLogs.value, nextEntry].slice(-MAX_DEBUG_LOGS)
}

function clearDebugLogs() {
  debugLogs.value = []
}

function pickRandomInsight() {
  const randomIndex = Math.floor(Math.random() * INSIGHT_TIPS.length)
  insightTip.value = INSIGHT_TIPS[randomIndex]
}

function markResultsAsStale() {
  if (hasAnyOutput.value && !isRunning.value) {
    isResultsStale.value = true
  }
}

function goToPreviousQuery() {
  if (isAtFirstQuery.value) {
    return
  }

  activeQueryIndex.value -= 1
}

function goToNextQuery() {
  if (isAtLastQuery.value) {
    return
  }

  activeQueryIndex.value += 1
}

watch(documentsText, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.documents, value)
  markResultsAsStale()
})

watch(queriesText, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.queries, value)
  markResultsAsStale()
})

watch(relevanceText, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.relevance, value)
  markResultsAsStale()
})

watch(customModelIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.customModelIds, JSON.stringify(value))
})

watch(customRerankerIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.customRerankerIds, JSON.stringify(value))
})

watch(selectedModelIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.selectedModelIds, JSON.stringify(value))
  markResultsAsStale()
})

watch(selectedRerankerIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.selectedRerankerIds, JSON.stringify(value))
  markResultsAsStale()
})

watch(downloadTarget, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.downloadTarget, value)
})

watch(topK, () => {
  markResultsAsStale()
})

watch(searchSimilarityThreshold, (value) => {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (bounded !== value) {
    searchSimilarityThreshold.value = bounded
    return
  }
  writeLocalStorageValue(STORAGE_KEYS.searchSimilarityThreshold, String(bounded))
  writeLocalStorageValue(STORAGE_KEYS.similarityThreshold, String(bounded))
  markResultsAsStale()
})

watch(rerankSimilarityThreshold, (value) => {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (bounded !== value) {
    rerankSimilarityThreshold.value = bounded
    return
  }
  writeLocalStorageValue(STORAGE_KEYS.rerankSimilarityThreshold, String(bounded))
  markResultsAsStale()
})

watch(activeResultStage, () => {
  activeQueryIndex.value = 0
})

watch([retrievalOutput, rerankOutput], () => {
  if (activeResultStage.value === 'reranking' && !rerankOutput.value && retrievalOutput.value) {
    activeResultStage.value = 'retrieval'
  }

  if (activeResultStage.value === 'retrieval' && !retrievalOutput.value && rerankOutput.value) {
    activeResultStage.value = 'reranking'
  }

  const retrievalIds = retrievalComparedModelIds.value
  if (!retrievalIds.includes(selectedComparisonRetrievalModelId.value)) {
    selectedComparisonRetrievalModelId.value = retrievalIds[0] ?? ''
  }
})

watch(apiBaseUrl, () => {
  backendStatus.value = 'unknown'
  markResultsAsStale()

  if (backendCheckTimer) {
    clearTimeout(backendCheckTimer)
  }

  backendCheckTimer = setTimeout(() => {
    refreshBackendStatus()
  }, 500)
})

function addModelToCatalog(modelId) {
  if (downloadTarget.value === 'reranking') {
    if (!availableRerankers.value.some((model) => model.id === modelId)) {
      availableRerankers.value = [...availableRerankers.value, createCustomModelEntry(modelId)]
    }

    if (!RERANKER_CATALOG.some((model) => model.id === modelId) && !customRerankerIds.value.includes(modelId)) {
      customRerankerIds.value = [...customRerankerIds.value, modelId]
    }

    if (!selectedRerankerIds.value.includes(modelId)) {
      selectedRerankerIds.value = [...selectedRerankerIds.value, modelId]
    }

    return
  }

  if (!availableModels.value.some((model) => model.id === modelId)) {
    availableModels.value = [...availableModels.value, createCustomModelEntry(modelId)]
  }

  if (!MODEL_CATALOG.some((model) => model.id === modelId) && !customModelIds.value.includes(modelId)) {
    customModelIds.value = [...customModelIds.value, modelId]
  }

  if (!selectedModelIds.value.includes(modelId)) {
    selectedModelIds.value = [...selectedModelIds.value, modelId]
  }
}

async function refreshBackendStatus() {
  isCheckingBackend.value = true

  try {
    const isHealthy = await checkBackendHealth({
      baseUrl: apiBaseUrl.value,
    })

    backendStatus.value = isHealthy ? 'online' : 'offline'
    appendDebugLog('info', `Health check backend: ${backendStatus.value}`)
  } catch {
    backendStatus.value = 'offline'
    appendDebugLog('error', 'Health check backend fallido')
  } finally {
    isCheckingBackend.value = false
  }
}

async function downloadCustomModel() {
  const modelId = customModelInput.value.trim()

  if (!modelId) {
    validationMessage.value =
      downloadTarget.value === 'reranking'
        ? 'Escribe un model_id de reranker.'
        : 'Escribe un model_id de sentence-transformers.'
    return
  }

  validationMessage.value = ''
  runtimeError.value = ''
  isDownloadingModel.value = true

  try {
    appendDebugLog(
      'info',
      `Descargando ${downloadTarget.value === 'reranking' ? 'reranker' : 'modelo'} ${modelId}`,
    )

    if (downloadTarget.value === 'reranking') {
      await downloadRerankers({
        baseUrl: apiBaseUrl.value,
        modelIds: [modelId],
        forceReload: false,
      })
    } else {
      await downloadModels({
        baseUrl: apiBaseUrl.value,
        modelIds: [modelId],
        forceReload: false,
      })
    }

    addModelToCatalog(modelId)

    customModelInput.value = ''
    validationMessage.value = `${downloadTarget.value === 'reranking' ? 'Reranker' : 'Modelo'} descargado y anadido: ${modelId}`
    backendStatus.value = 'online'
    appendDebugLog('info', `Modelo descargado correctamente: ${modelId}`)
    pickRandomInsight()
  } catch (error) {
    runtimeError.value =
      error instanceof Error
        ? error.message
        : 'No se pudo descargar el modelo solicitado.'
    appendDebugLog('error', `Fallo al descargar modelo ${modelId}: ${runtimeError.value}`)
  } finally {
    isDownloadingModel.value = false
  }
}

function loadExampleData() {
  documentsText.value = DEFAULT_DOCUMENTS_TEXT
  queriesText.value = DEFAULT_QUERIES_TEXT
  relevanceText.value = ''
  retrievalOutput.value = null
  rerankOutput.value = null
  pipelineStats.value = null
  isResultsStale.value = false
  runtimeError.value = ''
  validationMessage.value = 'Datos de ejemplo cargados. Puedes ejecutar la evaluacion.'
}

async function runComparison() {
  if (!canRun.value) {
    validationMessage.value = 'Necesitas al menos 1 modelo de busqueda, 1 reranker, 1 query y 1 documento.'
    return
  }

  const safeTopK = Math.max(1, Math.min(topK.value, documentCount.value))
  const safeSearchSimilarityThreshold = Math.max(0, Math.min(1, searchSimilarityThreshold.value))
  const safeRerankSimilarityThreshold = Math.max(0, Math.min(1, rerankSimilarityThreshold.value))
  validationMessage.value = ''
  runtimeError.value = ''
  isRunning.value = true
  totalRuns.value += 1
  const runStartMs = nowMs()
  const measuredDurations = {
    retrieval: 0,
    threshold: 0,
    rerank: 0,
  }

  try {
    runningStep.value = 'retrieval'
    appendDebugLog(
      'info',
      `Paso 1/3: busqueda con ${selectedModelIds.value.length} modelos de embeddings.`,
    )

    const relevanceByQuery = parseRelevanceByQuery(
      relevanceText.value,
      queryCount.value,
      documentCount.value,
    )

    const retrievalStepStartMs = nowMs()
    const retrieval = await compareQueries({
      documents: parsedDocuments.value,
      queries: parsedQueries.value,
      modelIds: selectedModelIds.value,
      topK: safeTopK,
      minSimilarity: 0,
      baseUrl: apiBaseUrl.value,
      relevanceByQuery,
      onLog: ({ level, message }) => appendDebugLog(level ?? 'info', message),
    })
    measuredDurations.retrieval = nowMs() - retrievalStepStartMs
    retrievalOutput.value = retrieval

    runningStep.value = 'threshold'
    appendDebugLog(
      'info',
      `Paso 2/3: aplicando umbral de busqueda >= ${safeSearchSimilarityThreshold.toFixed(2)}.`,
    )

    const thresholdStepStartMs = nowMs()
    const thresholdFiltering = filterCandidateDocIndexesByThreshold(
      retrieval.resultsByQuery,
      selectedModelIds.value,
      safeSearchSimilarityThreshold,
    )
    const candidateDocIndexesByQuery = thresholdFiltering.filteredIndexesByQuery

    const candidateCounts = candidateDocIndexesByQuery.map((entry) => entry.length)
    pipelineStats.value = {
      searchThreshold: safeSearchSimilarityThreshold,
      rerankThreshold: safeRerankSimilarityThreshold,
      minCandidates: Math.min(...candidateCounts),
      maxCandidates: Math.max(...candidateCounts),
      avgCandidates:
        candidateCounts.reduce((accumulator, count) => accumulator + count, 0) / candidateCounts.length,
      removedByThreshold: Math.max(0, thresholdFiltering.totalBefore - thresholdFiltering.totalAfter),
      totalBeforeThreshold: thresholdFiltering.totalBefore,
    }
    measuredDurations.threshold = nowMs() - thresholdStepStartMs

    appendDebugLog(
      'info',
      `Filtro por umbral aplicado: ${pipelineStats.value.removedByThreshold} candidatos eliminados.`,
    )

    appendDebugLog(
      'info',
      `Paso 3/3: reranking con ${selectedRerankerIds.value.length} modelos sobre candidatos filtrados.`,
    )

    runningStep.value = 'rerank'
    const rerankStepStartMs = nowMs()
    const rerank = await compareRerankQueries({
      documents: parsedDocuments.value,
      queries: parsedQueries.value,
      modelIds: selectedRerankerIds.value,
      topK: safeTopK,
      baseUrl: apiBaseUrl.value,
      relevanceByQuery,
      candidateDocIndexesByQuery,
      onLog: ({ level, message }) => appendDebugLog(level ?? 'info', message),
    })
    measuredDurations.rerank = nowMs() - rerankStepStartMs

    rerankOutput.value = rerank
    activeResultStage.value = 'reranking'

    if (safeTopK !== topK.value) {
      validationMessage.value = `Top-k ajustado a ${safeTopK} porque solo hay ${documentCount.value} documentos.`
    }

    if (safeSearchSimilarityThreshold !== searchSimilarityThreshold.value) {
      validationMessage.value = `Umbral de busqueda ajustado a ${safeSearchSimilarityThreshold.toFixed(2)} por rango valido [0,1].`
    }

    if (safeRerankSimilarityThreshold !== rerankSimilarityThreshold.value) {
      validationMessage.value = `Umbral de reranking ajustado a ${safeRerankSimilarityThreshold.toFixed(2)} por rango valido [0,1].`
    }

    isResultsStale.value = false
    pickRandomInsight()
    activeQueryIndex.value = 0
    successfulRuns.value += 1
    lastError.value = ''
    lastRunAt.value = new Date().toLocaleString()
    lastRunDurationMs.value = nowMs() - runStartMs
    stepDurationsMs.value = measuredDurations
    appendDebugLog('info', 'Pipeline completo finalizado correctamente.')
  } catch (error) {
    rerankOutput.value = null
    pipelineStats.value = null
    if (retrievalOutput.value) {
      activeResultStage.value = 'retrieval'
    }
    runtimeError.value =
      error instanceof Error
        ? error.message
        : 'Error inesperado al ejecutar el pipeline busqueda + reranking.'
    failedRuns.value += 1
    lastError.value = runtimeError.value
    lastRunAt.value = new Date().toLocaleString()
    lastRunDurationMs.value = nowMs() - runStartMs
    stepDurationsMs.value = measuredDurations
    appendDebugLog('error', `Pipeline fallido: ${runtimeError.value}`)
  } finally {
    isRunning.value = false
    runningStep.value = 'idle'
  }
}

onMounted(() => {
  refreshBackendStatus()
  pickRandomInsight()
})

onBeforeUnmount(() => {
  if (backendCheckTimer) {
    clearTimeout(backendCheckTimer)
  }
})
</script>

<template>
  <main class="app-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Research UI</p>
        <h1>Embedding Lab</h1>
      </div>
      <div class="header-actions">
        <button :disabled="!canRun || isRunning" type="button" @click="runComparison">
          {{ isRunning ? 'Ejecutando pipeline...' : 'Ejecutar pipeline' }}
        </button>
        <button class="secondary-button" type="button" @click="loadExampleData">
          Cargar datos demo
        </button>
      </div>
    </header>

    <section class="status-strip" aria-label="Estado operativo">
      <span :class="['status-pill', backendStatus]">
        <span class="status-dot" />
        {{ backendStatusLabel }}
      </span>
      <span class="meta-pill">{{ selectedRetrievalModelCount }} modelos busqueda</span>
      <span class="meta-pill">{{ selectedRerankerCount }} rerankers</span>
      <span class="meta-pill">{{ queryCount }} queries</span>
      <span class="meta-pill">{{ documentCount }} documentos</span>
      <span class="meta-pill">Top-k {{ topK }}</span>
      <span class="meta-pill">Umbral busqueda >= {{ searchSimilarityThreshold.toFixed(2) }}</span>
      <span class="meta-pill">Umbral reranking >= {{ rerankSimilarityThreshold.toFixed(2) }}</span>
    </section>

    <section class="pipeline-flow" aria-label="Flujo de pipeline">
      <div class="flow-run">
        <button class="flow-play-button" :disabled="!canRun || isRunning" type="button" @click="runComparison">
          {{ isRunning ? 'Ejecutando...' : 'Play' }}
        </button>
      </div>

      <article :class="['flow-step', retrievalStepStatus]">
        <div class="flow-head">
          <p class="flow-kicker">Paso 1</p>
          <span :class="['flow-state', retrievalStepStatus]">{{ stepStatusLabel(retrievalStepStatus) }}</span>
        </div>
        <h3>Busqueda Semantica</h3>
        <p>Genera ranking inicial con modelos de embeddings.</p>
        <span class="flow-meta">{{ selectedRetrievalModelCount }} modelos</span>
        <div class="flow-picker">
          <ModelPicker
            v-model="selectedModelIds"
            title="Modelos del Paso 1"
            :models="availableModels"
            compact
          />
        </div>
      </article>

      <div class="flow-connector" aria-hidden="true">
        <span class="flow-line" />
        <span class="flow-arrow">→</span>
      </div>

      <article :class="['flow-step', candidateStepStatus]">
        <div class="flow-head">
          <p class="flow-kicker">Paso 2</p>
          <span :class="['flow-state', candidateStepStatus]">{{ stepStatusLabel(candidateStepStatus) }}</span>
        </div>
        <h3>Filtro por Umbral</h3>
        <p>Elimina resultados por debajo de la similitud minima antes del reranking.</p>
        <label class="flow-control">
          <span>Umbral busqueda (0-1)</span>
          <input v-model.number="searchSimilarityThreshold" type="number" min="0" max="1" step="0.01" />
        </label>
        <span class="flow-meta">
          {{
            pipelineStats
              ? `${pipelineStats.removedByThreshold} eliminados, ${pipelineStats.avgCandidates.toFixed(1)} candidatos promedio`
              : 'Pendiente de ejecucion'
          }}
        </span>
      </article>

      <div class="flow-connector" aria-hidden="true">
        <span class="flow-line" />
        <span class="flow-arrow">→</span>
      </div>

      <article :class="['flow-step', rerankStepStatus]">
        <div class="flow-head">
          <p class="flow-kicker">Paso 3</p>
          <span :class="['flow-state', rerankStepStatus]">{{ stepStatusLabel(rerankStepStatus) }}</span>
        </div>
        <h3>Reranking</h3>
        <p>Reordena candidatos con cross-encoders para mayor precision.</p>
        <label class="flow-control">
          <span>Umbral reranking (0-1)</span>
          <input v-model.number="rerankSimilarityThreshold" type="number" min="0" max="1" step="0.01" />
        </label>
        <span class="flow-meta">{{ selectedRerankerCount }} rerankers</span>
        <div class="flow-picker">
          <ModelPicker
            v-model="selectedRerankerIds"
            title="Modelos del Paso 2"
            :models="availableRerankers"
            compact
          />
        </div>
      </article>
    </section>

    <section class="workspace-grid">
      <section class="column data-column">
        <BadgeListInput
          v-model="queriesText"
          title="Queries"
          helper="Anade queries como badges. Enter o coma para anadir."
          placeholder="Coches en Madrid"
        />

        <BadgeListInput
          v-model="documentsText"
          title="Documentos"
          helper="Anade documentos como badges. Enter o coma para anadir."
          placeholder="Parque movil por distrito en Madrid"
        />

        <TextListInput
          v-model="relevanceText"
          title="Relevancias (opcional)"
          helper="Una linea por query. Ejemplo: Q1: 1,3"
          placeholder="Q1: 1,3&#10;Q2: 2"
          clear-label="Vaciar"
          :rows="4"
        />
      </section>

      <section class="column controls-column">
        <section class="panel controls-panel" id="setup">
          <div class="panel-title">
            <h2>Configuracion de pipeline</h2>
            <p>El flujo ejecuta siempre busqueda primero y reranking despues.</p>
          </div>

          <div class="control-grid">
            <label>
              <span>Top-k</span>
              <select v-model.number="topK">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
              </select>
            </label>

            <label>
              <span>Tipo de modelo a descargar</span>
              <select v-model="downloadTarget">
                <option value="embeddings">Embeddings</option>
                <option value="reranking">Reranking</option>
              </select>
            </label>

            <label class="full-width">
              <span>Nuevo {{ downloadTarget === 'reranking' ? 'reranker_id' : 'model_id' }}</span>
              <input
                v-model="customModelInput"
                type="text"
                :placeholder="downloadTarget === 'reranking'
                  ? 'cross-encoder/ms-marco-MiniLM-L-6-v2'
                  : 'sentence-transformers/bge-base-en-v1.5'"
              />
            </label>

            <label class="full-width">
              <span>Configuracion avanzada</span>
              <button class="ghost-toggle" type="button" @click="showAdvancedControls = !showAdvancedControls">
                {{ showAdvancedControls ? 'Ocultar' : 'Mostrar' }} parametros avanzados
              </button>
            </label>
          </div>

          <div v-if="showAdvancedControls" class="advanced-block">
            <label>
              <span>API base URL</span>
              <input v-model="apiBaseUrl" type="text" />
            </label>
          </div>

          <div class="actions-row">
            <button
              class="secondary-button"
              :disabled="isDownloadingModel"
              type="button"
              @click="downloadCustomModel"
            >
              {{
                isDownloadingModel
                  ? 'Descargando modelo...'
                  : `Descargar ${downloadTarget === 'reranking' ? 'reranker' : 'modelo'}`
              }}
            </button>
          </div>

          <p v-if="validationMessage" class="validation-message">{{ validationMessage }}</p>
          <p v-if="runtimeError" class="error-message">{{ runtimeError }}</p>

          <section class="debug-panel">
            <div class="debug-header">
              <h3>Registro frontend</h3>
              <button class="mini-button" type="button" @click="clearDebugLogs">Limpiar</button>
            </div>
            <ul class="debug-list">
              <li v-for="entry in debugLogs" :key="entry.id" :class="['debug-entry', entry.level]">
                <span class="debug-time">{{ entry.timestamp }}</span>
                <span class="debug-level">{{ entry.level }}</span>
                <span class="debug-message">{{ entry.message }}</span>
              </li>
              <li v-if="debugLogs.length === 0" class="debug-empty">
                Sin eventos aun. Ejecuta el pipeline para registrar actividad.
              </li>
            </ul>
          </section>
        </section>
      </section>
    </section>

    <section id="results" v-if="hasAnyOutput" class="results-panel">
      <header class="results-header">
        <div>
          <h2>Resultados de pipeline</h2>
          <p>
            Vista comparativa directa: busqueda semantica frente a reranking por query.
            <span v-if="isResultsStale" class="stale-pill">Hay cambios pendientes sin ejecutar</span>
          </p>
        </div>
        <label class="results-sort">
          <span>Ordenar por</span>
          <select v-model="resultSortBy">
            <option value="score">Top1 medio (desc)</option>
            <option value="latency">Latencia media (asc)</option>
            <option value="prep">Prep docs (asc)</option>
          </select>
        </label>
      </header>

      <p v-if="pipelineStats" class="candidate-meta">
        Umbral busqueda {{ pipelineStats.searchThreshold.toFixed(2) }}: {{ pipelineStats.removedByThreshold }} resultados eliminados antes del reranking. Umbral reranking {{ pipelineStats.rerankThreshold.toFixed(2) }} aplicado sobre el ranking final. Candidatos por query: min {{ pipelineStats.minCandidates }}, max {{ pipelineStats.maxCandidates }}, promedio {{ pipelineStats.avgCandidates.toFixed(2) }}.
      </p>

      <ObservabilityPanel :runtime="observabilitySnapshot" />

      <SummaryBar
        v-if="activeResultOutput"
        :model-ids="orderedComparedModelIds"
        :model-by-id="activeResultModelById"
        :summary-by-model="activeResultOutput.summaryByModel"
        :evaluation-by-model="activeResultOutput.evaluationByModel"
      />

      <section
        v-if="retrievalOutput && rerankOutput && retrievalComparedModelIds.length > 0"
        class="comparison-toolbar"
      >
        <label>
          <span>Referencia para delta en reranking</span>
          <select v-model="selectedComparisonRetrievalModelId">
            <option
              v-for="modelId in retrievalComparedModelIds"
              :key="`retrieval-compare-${modelId}`"
              :value="modelId"
            >
              {{ retrievalModelById[modelId]?.label ?? modelId }}
            </option>
          </select>
        </label>
      </section>

      <section v-if="retrievalOutput" class="query-nav">
        <div class="query-nav-left">
          <button class="secondary-button" type="button" :disabled="isAtFirstQuery" @click="goToPreviousQuery">
            Query anterior
          </button>
          <button class="secondary-button" type="button" :disabled="isAtLastQuery" @click="goToNextQuery">
            Query siguiente
          </button>
        </div>
        <label class="query-picker">
          <span>Query activa</span>
          <select v-model.number="activeQueryIndex">
            <option
              v-for="(query, index) in retrievalOutput.resultsByQuery"
              :key="`query-option-${query.queryId}`"
              :value="index"
            >
              Q{{ index + 1 }} - {{ query.queryText }}
            </option>
          </select>
        </label>
      </section>

      <QueryTabs
        v-if="retrievalOutput"
        v-model:active-index="activeQueryIndex"
        :queries="retrievalOutput.resultsByQuery"
      />

      <section v-if="activeRetrievalQueryResult || activeRerankQueryResult" class="query-evaluation-grid">
        <QueryEvaluationTable
          v-if="activeRetrievalQueryResult"
          stage-label="Busqueda"
          :model-ids="orderedRetrievalModelIds"
          :model-by-id="retrievalModelById"
          :query-result="activeRetrievalQueryResult"
          :top-k="retrievalOutput.topK"
        />
        <QueryEvaluationTable
          v-if="activeRerankQueryResult"
          stage-label="Reranking"
          :model-ids="orderedRerankModelIds"
          :model-by-id="rerankerModelById"
          :query-result="activeRerankQueryResult"
          :top-k="rerankOutput.topK"
        />
      </section>

      <section v-if="activeRetrievalQueryResult || activeRerankQueryResult" class="query-results">
        <div v-if="activeRetrievalQueryResult" class="result-stage">
          <h3>Busqueda semantica</h3>
          <div class="comparison-grid">
            <ModelRankingTable
              v-for="modelId in orderedRetrievalModelIds"
              :key="`retrieval-table-${modelId}`"
              :model-label="`Busqueda · ${retrievalModelById[modelId]?.label ?? modelId}`"
              :result="activeRetrievalQueryResult.rankingByModel[modelId]"
              :threshold="searchSimilarityThreshold"
            />
          </div>
        </div>

        <div v-if="activeRerankQueryResult" class="result-stage">
          <h3>Reranking</h3>
          <div class="comparison-grid">
            <ModelRankingTable
              v-for="modelId in orderedRerankModelIds"
              :key="`rerank-table-${modelId}`"
              :model-label="`Reranking · ${rerankerModelById[modelId]?.label ?? modelId}`"
              :result="activeRerankQueryResult.rankingByModel[modelId]"
              :rank-change-by-doc-index="rerankRankChangeByModelId[modelId]"
              :threshold="rerankSimilarityThreshold"
            />
          </div>
        </div>
      </section>
    </section>
  </main>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');

:root {
  --bg-page: #eff3f8;
  --bg-shell: #f8fbff;
  --panel-bg: #ffffff;
  --panel-border: #d3dbe8;
  --text-main: #17212f;
  --text-muted: #59697f;
  --accent: #0f5fd7;
  --accent-soft: #dbe8ff;
  --accent-strong: #0d4cad;
  --success: #15875b;
  --danger: #bf3a3a;
}

* {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  color: var(--text-main);
  background:
    radial-gradient(circle at 8% -10%, #dbe8ff 0%, transparent 35%),
    radial-gradient(circle at 90% -15%, #dceff0 0%, transparent 32%),
    linear-gradient(180deg, #eef3f8 0%, #e8eef6 100%);
}

.app-shell {
  width: min(1320px, 96vw);
  margin: 1.2rem auto 2.2rem;
  display: grid;
  gap: 1rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  border-radius: 16px;
  border: 1px solid var(--panel-border);
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--accent-soft) 34%, white), var(--bg-shell));
  box-shadow: 0 16px 34px -26px rgba(12, 49, 110, 0.5);
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-strong);
}

h1 {
  margin: 0.24rem 0 0;
  font-size: clamp(1.5rem, 3vw, 2.15rem);
  line-height: 1.1;
}

.subtitle {
  margin: 0.4rem 0 0;
  color: var(--text-muted);
  max-width: 75ch;
}

.header-actions {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pipeline-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.55rem;
  align-items: center;
}

.flow-run {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.flow-play-button {
  min-width: 110px;
}

.flow-step {
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg) 95%, white);
  padding: 0.72rem 0.76rem;
  min-height: 180px;
  display: grid;
  align-content: start;
  gap: 0.26rem;
  box-shadow: 0 10px 20px -22px rgba(18, 52, 102, 0.55);
}

.flow-step.pending {
  border-style: dashed;
}

.flow-step.running {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--panel-border));
  background: color-mix(in srgb, var(--accent-soft) 40%, white);
}

.flow-step.done {
  border-color: color-mix(in srgb, var(--success) 42%, var(--panel-border));
  background: color-mix(in srgb, var(--success) 12%, white);
}

.flow-kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
}

.flow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.flow-state {
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--panel-bg) 84%, white);
}

.flow-state.pending {
  border-style: dashed;
}

.flow-state.running {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--panel-border));
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent-soft) 70%, white);
}

.flow-state.done {
  border-color: color-mix(in srgb, var(--success) 44%, var(--panel-border));
  color: #156a49;
  background: color-mix(in srgb, var(--success) 14%, white);
}

.flow-step h3 {
  margin: 0;
  font-size: 0.95rem;
}

.flow-step p {
  margin: 0;
  font-size: 0.77rem;
  color: var(--text-muted);
}

.flow-meta {
  margin-top: 0.2rem;
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--panel-border) 78%, transparent);
  border-radius: 999px;
  padding: 0.14rem 0.46rem;
  font-size: 0.72rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--panel-bg) 88%, white);
}

.flow-picker {
  margin-top: 0.44rem;
  padding-top: 0.44rem;
  border-top: 1px solid color-mix(in srgb, var(--panel-border) 74%, transparent);
}

.flow-control {
  margin-top: 0.32rem;
  display: grid;
  gap: 0.28rem;
}

.flow-control span {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 600;
}

.flow-picker .model-panel {
  gap: 0.55rem;
}

.flow-connector {
  width: 34px;
  display: grid;
  gap: 0.2rem;
  justify-items: center;
  align-items: center;
}

.flow-line {
  width: 24px;
  height: 1px;
  background: color-mix(in srgb, var(--text-muted) 42%, var(--panel-border));
}

.flow-arrow {
  font-size: 0.95rem;
  color: color-mix(in srgb, var(--text-muted) 70%, var(--accent));
}

.status-pill,
.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-bg) 92%, white);
  padding: 0.28rem 0.62rem;
  font-size: 0.78rem;
  color: var(--text-main);
}

.status-pill.online {
  border-color: color-mix(in srgb, var(--success) 30%, var(--panel-border));
}

.status-pill.offline {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--panel-border));
}

.status-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #8592a1;
}

.status-pill.online .status-dot {
  background: var(--success);
}

.status-pill.offline .status-dot {
  background: var(--danger);
}

.workspace-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(300px, 1.02fr) minmax(360px, 1.25fr);
}

.column {
  display: grid;
  gap: 0.9rem;
  align-content: start;
}

.panel {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-bg) 94%, white);
  padding: 0.9rem;
  box-shadow: 0 12px 24px -24px rgba(22, 50, 94, 0.45);
}

.panel-title h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-title p {
  margin: 0.26rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.control-grid {
  margin-top: 0.74rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.62rem;
}

.full-width {
  grid-column: 1 / -1;
}

label {
  display: grid;
  gap: 0.3rem;
}

label span {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 600;
}

select,
input,
textarea,
button {
  font: inherit;
}

select,
input,
textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  background: #ffffff;
  padding: 0.54rem 0.58rem;
  color: var(--text-main);
}

select:focus,
input:focus,
textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  outline-offset: 1px;
}

button {
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--panel-border));
  border-radius: 10px;
  background: linear-gradient(140deg, var(--accent), var(--accent-strong));
  color: #ffffff;
  padding: 0.52rem 0.76rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    opacity 0.14s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 16px -10px rgba(10, 60, 135, 0.55);
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.secondary-button {
  background: #ffffff;
  color: var(--accent-strong);
}

.ghost-toggle {
  background: #f7faff;
  color: var(--text-main);
  border-style: dashed;
}

.actions-row {
  margin-top: 0.74rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.advanced-block {
  margin-top: 0.68rem;
  border: 1px dashed color-mix(in srgb, var(--panel-border) 90%, transparent);
  border-radius: 12px;
  padding: 0.64rem;
  background: color-mix(in srgb, var(--accent-soft) 20%, white);
}

.validation-message,
.error-message {
  margin: 0.7rem 0 0;
  border-radius: 10px;
  padding: 0.52rem 0.62rem;
  font-size: 0.8rem;
}

.validation-message {
  border: 1px solid color-mix(in srgb, var(--success) 35%, var(--panel-border));
  background: color-mix(in srgb, var(--success) 11%, white);
  color: #14583f;
}

.error-message {
  border: 1px solid color-mix(in srgb, var(--danger) 38%, var(--panel-border));
  background: color-mix(in srgb, var(--danger) 10%, white);
  color: #7d2525;
}

.debug-panel {
  margin-top: 0.8rem;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: #fbfdff;
  overflow: hidden;
}

.debug-header {
  padding: 0.58rem 0.64rem;
  border-bottom: 1px solid var(--panel-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.debug-header h3 {
  margin: 0;
  font-size: 0.82rem;
}

.mini-button {
  padding: 0.3rem 0.52rem;
  border-radius: 999px;
  font-size: 0.72rem;
}

.debug-list {
  list-style: none;
  margin: 0;
  padding: 0.42rem;
  display: grid;
  gap: 0.36rem;
  max-height: 200px;
  overflow: auto;
}

.debug-entry {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 0.38rem;
  font-size: 0.74rem;
  border: 1px solid color-mix(in srgb, var(--panel-border) 70%, transparent);
  border-radius: 8px;
  padding: 0.32rem 0.44rem;
  background: #ffffff;
}

.debug-time,
.debug-level {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  color: var(--text-muted);
}

.debug-entry.error {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--panel-border));
  background: color-mix(in srgb, var(--danger) 6%, white);
}

.debug-empty {
  font-size: 0.76rem;
  color: var(--text-muted);
  padding: 0.38rem;
}

.results-panel {
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-bg) 95%, white);
  padding: 0.95rem;
  display: grid;
  gap: 0.9rem;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
}

.results-header h2 {
  margin: 0;
  font-size: 1.08rem;
}

.results-header p {
  margin: 0.32rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.stage-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stage-tab {
  background: #ffffff;
  color: var(--accent-strong);
}

.stage-tab.active {
  background: linear-gradient(140deg, var(--accent), var(--accent-strong));
  color: #ffffff;
}

.candidate-meta {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.stale-pill {
  display: inline-flex;
  margin-left: 0.44rem;
  border: 1px solid color-mix(in srgb, #cf8a1a 44%, var(--panel-border));
  background: color-mix(in srgb, #ffefcf 85%, white);
  border-radius: 999px;
  padding: 0.14rem 0.42rem;
  color: #7b571e;
  font-size: 0.74rem;
}

.results-sort {
  min-width: 220px;
}

.comparison-toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 440px);
  gap: 0.7rem;
}

.query-nav {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.query-nav-left {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.query-picker {
  min-width: min(100%, 420px);
}

.query-results {
  display: grid;
  gap: 0.85rem;
}

.query-evaluation-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.result-stage {
  display: grid;
  gap: 0.55rem;
}

.result-stage h3 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-muted);
}

.comparison-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
}

@media (max-width: 1080px) {
  .pipeline-flow {
    grid-template-columns: 1fr;
  }

  .flow-connector {
    width: 100%;
    justify-items: start;
    padding-left: 0.4rem;
  }

  .flow-line {
    width: 1px;
    height: 16px;
  }

  .flow-arrow {
    transform: rotate(90deg);
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .comparison-toolbar,
  .comparison-grid {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 760px) {
  .app-shell {
    width: min(1320px, 97vw);
    margin-top: 0.8rem;
  }

  .page-header,
  .results-header {
    flex-direction: column;
    align-items: start;
  }

  .results-sort,
  .query-picker {
    min-width: 100%;
  }

  .control-grid {
    grid-template-columns: 1fr;
  }
}
</style>
