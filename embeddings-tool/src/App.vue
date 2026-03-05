<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ModelPicker from './components/ModelPicker.vue'
import ModelRankingTable from './components/ModelRankingTable.vue'
import OverlapMatrix from './components/OverlapMatrix.vue'
import QueryTabs from './components/QueryTabs.vue'
import SummaryBar from './components/SummaryBar.vue'
import TextListInput from './components/TextListInput.vue'
import { DEFAULT_DOCUMENTS_TEXT, DEFAULT_QUERIES_TEXT, MODEL_CATALOG } from './data/models'
import { checkBackendHealth, downloadModels } from './services/backendModels'
import { compareQueries } from './services/ranker'

const MONKEY_TIPS = [
  '🐒 Empieza comparando un modelo multilingue vs uno retrieval para ver diferencias reales.',
  '🌴 Si una query es corta, prueba un modelo MSMARCO: suele rankear mejor top-k.',
  '🍌 Usa 3-5 queries parecidas para medir estabilidad, no solo una query aislada.',
  '🧠 Si los top resultados son muy parecidos entre modelos, aumenta dificultad de queries.',
]

const STORAGE_KEYS = {
  documents: 'embeddings-tool.documents.v1',
  queries: 'embeddings-tool.queries.v1',
  customModelIds: 'embeddings-tool.custom-model-ids.v1',
  selectedModelIds: 'embeddings-tool.selected-model-ids.v1',
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

function createCustomModelEntry(modelId) {
  const label = modelId.includes('/') ? modelId.split('/').pop() : modelId

  return {
    id: modelId,
    label: label || modelId,
    description: 'Modelo anadido manualmente desde la UI.',
    promptName: null,
  }
}

function buildAvailableModels(customModelIds) {
  const modelMap = new Map(MODEL_CATALOG.map((model) => [model.id, model]))

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
const availableModels = ref(buildAvailableModels(customModelIds.value))
const selectedModelIds = ref(
  getInitialSelectedModelIds(
    availableModels.value,
    readLocalStorageJsonArray(STORAGE_KEYS.selectedModelIds),
  ),
)
const documentsText = ref(readLocalStorageValue(STORAGE_KEYS.documents, DEFAULT_DOCUMENTS_TEXT))
const queriesText = ref(readLocalStorageValue(STORAGE_KEYS.queries, DEFAULT_QUERIES_TEXT))
const topK = ref(3)
const apiBaseUrl = ref(import.meta.env.VITE_EMBEDDINGS_API_BASE_URL ?? 'http://localhost:8000')
const customModelInput = ref('')

const compareOutput = ref(null)
const activeQueryIndex = ref(0)
const validationMessage = ref('')
const runtimeError = ref('')
const isRunning = ref(false)
const isDownloadingModel = ref(false)
const backendStatus = ref('unknown')
const isCheckingBackend = ref(false)
const monkeyTip = ref(MONKEY_TIPS[0])

let backendCheckTimer = null

const modelById = computed(() =>
  Object.fromEntries(availableModels.value.map((model) => [model.id, model])),
)

function parseLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const parsedDocuments = computed(() => parseLines(documentsText.value))
const parsedQueries = computed(() => parseLines(queriesText.value))

const documentCount = computed(() => parsedDocuments.value.length)
const queryCount = computed(() => parsedQueries.value.length)
const selectedModelCount = computed(() => selectedModelIds.value.length)

const canRun = computed(
  () => selectedModelIds.value.length > 0 && documentCount.value > 0 && queryCount.value > 0,
)

const activeQueryResult = computed(() => {
  if (!compareOutput.value?.resultsByQuery?.length) {
    return null
  }

  const boundedIndex = Math.min(activeQueryIndex.value, compareOutput.value.resultsByQuery.length - 1)
  return compareOutput.value.resultsByQuery[boundedIndex]
})

function pickRandomMonkeyTip() {
  const randomIndex = Math.floor(Math.random() * MONKEY_TIPS.length)
  monkeyTip.value = MONKEY_TIPS[randomIndex]
}

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

watch(documentsText, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.documents, value)
})

watch(queriesText, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.queries, value)
})

watch(customModelIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.customModelIds, JSON.stringify(value))
})

watch(selectedModelIds, (value) => {
  writeLocalStorageValue(STORAGE_KEYS.selectedModelIds, JSON.stringify(value))
})

watch(apiBaseUrl, () => {
  backendStatus.value = 'unknown'

  if (backendCheckTimer) {
    clearTimeout(backendCheckTimer)
  }

  backendCheckTimer = setTimeout(() => {
    refreshBackendStatus()
  }, 500)
})

function addModelToCatalog(modelId) {
  if (!availableModels.value.some((model) => model.id === modelId)) {
    availableModels.value = [...availableModels.value, createCustomModelEntry(modelId)]
  }

  if (
    !MODEL_CATALOG.some((model) => model.id === modelId) &&
    !customModelIds.value.includes(modelId)
  ) {
    customModelIds.value = [...customModelIds.value, modelId]
  }
}

async function refreshBackendStatus() {
  isCheckingBackend.value = true

  try {
    const isHealthy = await checkBackendHealth({
      baseUrl: apiBaseUrl.value,
    })

    backendStatus.value = isHealthy ? 'online' : 'offline'
  } catch {
    backendStatus.value = 'offline'
  } finally {
    isCheckingBackend.value = false
  }
}

async function downloadCustomModel() {
  const modelId = customModelInput.value.trim()

  if (!modelId) {
    validationMessage.value = 'Escribe un model_id de sentence-transformers.'
    return
  }

  validationMessage.value = ''
  runtimeError.value = ''
  isDownloadingModel.value = true

  try {
    await downloadModels({
      baseUrl: apiBaseUrl.value,
      modelIds: [modelId],
      forceReload: false,
    })

    addModelToCatalog(modelId)

    if (!selectedModelIds.value.includes(modelId)) {
      selectedModelIds.value = [...selectedModelIds.value, modelId]
    }

    customModelInput.value = ''
    validationMessage.value = `Modelo descargado y anadido: ${modelId}`
    backendStatus.value = 'online'
    pickRandomMonkeyTip()
  } catch (error) {
    runtimeError.value =
      error instanceof Error
        ? error.message
        : 'No se pudo descargar el modelo solicitado.'
  } finally {
    isDownloadingModel.value = false
  }
}

function loadExampleData() {
  documentsText.value = DEFAULT_DOCUMENTS_TEXT
  queriesText.value = DEFAULT_QUERIES_TEXT
  compareOutput.value = null
  runtimeError.value = ''
  validationMessage.value = 'Ejemplos de datasets y busquedas cargados. Listo para explorar.'
}

async function runComparison() {
  if (!canRun.value) {
    validationMessage.value = 'Necesitas al menos 1 modelo, 1 query y 1 documento.'
    return
  }

  const safeTopK = Math.max(1, Math.min(topK.value, documentCount.value))
  validationMessage.value = ''
  runtimeError.value = ''
  isRunning.value = true

  try {
    compareOutput.value = await compareQueries({
      documents: parsedDocuments.value,
      queries: parsedQueries.value,
      modelIds: selectedModelIds.value,
      topK: safeTopK,
      baseUrl: apiBaseUrl.value,
    })

    if (safeTopK !== topK.value) {
      validationMessage.value = `Top-k ajustado a ${safeTopK} porque solo hay ${documentCount.value} documentos.`
    }

    pickRandomMonkeyTip()
    activeQueryIndex.value = 0
  } catch (error) {
    compareOutput.value = null
    runtimeError.value = error instanceof Error ? error.message : 'Error inesperado al consultar embeddings.'
  } finally {
    isRunning.value = false
  }
}

onMounted(() => {
  refreshBackendStatus()
  pickRandomMonkeyTip()
})
</script>

<template>
  <main class="app-shell">
    <header class="hero">
      <div class="hero-content">
        <p class="eyebrow">Jungle Search Lab</p>
        <h1>Evalua embeddings para buscadores de datasets</h1>
        <p class="intro">
          Mide ranking entre modelos en un flujo real de discovery de datos: query de usuario,
          titulos de datasets y comparacion lado a lado.
        </p>
        <div class="hero-tags">
          <span>Monkeys Mode</span>
          <span>Palms Theme</span>
          <span>Dataset Search</span>
          <span>Banana Ranking</span>
        </div>
      </div>

      <aside class="hero-note">
        <div class="jungle-art" aria-hidden="true">
          <svg viewBox="0 0 260 170" class="jungle-svg">
            <g class="palm palm-left">
              <path d="M28 150 C35 120, 45 92, 62 64" />
              <path d="M62 64 C38 58, 26 40, 17 22" />
              <path d="M62 64 C87 53, 103 34, 112 18" />
              <path d="M62 64 C72 44, 69 26, 60 10" />
            </g>
            <g class="palm palm-right">
              <path d="M230 150 C221 118, 214 94, 198 66" />
              <path d="M198 66 C217 54, 233 36, 242 20" />
              <path d="M198 66 C174 55, 158 37, 149 21" />
              <path d="M198 66 C186 46, 188 27, 196 10" />
            </g>
            <g class="monkey">
              <circle cx="128" cy="95" r="33" />
              <circle cx="101" cy="82" r="12" />
              <circle cx="155" cy="82" r="12" />
              <circle cx="116" cy="99" r="7" class="face" />
              <circle cx="140" cy="99" r="7" class="face" />
              <path d="M112 112 C120 121, 136 121, 145 112" class="smile" />
            </g>
          </svg>
        </div>
        <p class="hero-note-text">Comparador semantico para equipos de datos curiosos.</p>
      </aside>
    </header>

    <section class="status-strip">
      <article class="status-card">
        <div class="status-head">
          <h2>Estado backend</h2>
          <span :class="['status-dot', backendStatus]" />
        </div>
        <p>{{ backendStatusLabel }}</p>
        <button class="mini-button" type="button" @click="refreshBackendStatus">
          Probar conexion
        </button>
      </article>

      <article class="status-card">
        <h2>Resumen rapido</h2>
        <p>{{ selectedModelCount }} modelos activos, {{ queryCount }} queries, {{ documentCount }} datasets</p>
      </article>

      <article class="status-card">
        <h2>Tip de uso</h2>
        <p>Empieza con "Coches en Madrid" y cambia entre modelos QA y multilingual.</p>
      </article>

      <article class="status-card monkey-card">
        <h2>Tip del mono</h2>
        <p>{{ monkeyTip }}</p>
      </article>
    </section>

    <section class="setup-layout">
      <div class="setup-col">
        <ModelPicker v-model="selectedModelIds" :models="availableModels" />

        <section class="panel controls-panel">
          <h2>Controles</h2>
          <div class="control-grid">
            <label>
              <span>Top-k</span>
              <select v-model.number="topK">
                <option :value="3">3</option>
                <option :value="5">5</option>
                <option :value="10">10</option>
              </select>
            </label>

            <label>
              <span>API base URL</span>
              <input v-model="apiBaseUrl" type="text" />
            </label>

            <label>
              <span>Escribe model_id y descargalo</span>
              <input
                v-model="customModelInput"
                type="text"
                placeholder="sentence-transformers/bge-base-en-v1.5"
              />
            </label>
          </div>

          <div class="actions-row">
            <button :disabled="!canRun || isRunning" type="button" @click="runComparison">
              {{ isRunning ? '🐒 Monos comparando...' : 'Comparar modelos' }}
            </button>
            <button
              class="secondary-button"
              :disabled="isDownloadingModel"
              type="button"
              @click="downloadCustomModel"
            >
              {{ isDownloadingModel ? '🍌 Descargando mono-modelo...' : 'Descargar modelo escrito' }}
            </button>
            <button class="tertiary-button" type="button" @click="loadExampleData">
              Cargar ejemplos jungle
            </button>
          </div>

          <p v-if="validationMessage" class="validation-message">{{ validationMessage }}</p>
          <p v-if="runtimeError" class="error-message">{{ runtimeError }}</p>
        </section>
      </div>

      <div class="setup-col data-col">
        <TextListInput
          v-model="documentsText"
          title="Documentos"
          helper="Un titulo de dataset por linea."
          placeholder="Parque movil por distrito en Madrid"
          clear-label="Vaciar datasets"
          :rows="10"
        />

        <TextListInput
          v-model="queriesText"
          title="Queries"
          helper="Una busqueda por linea."
          placeholder="Coches en Madrid"
          clear-label="Vaciar queries"
          :rows="6"
        />
      </div>
    </section>

    <section v-if="compareOutput" class="results">
      <h2>Resultados</h2>
      <p class="results-meta">
        Se estan mostrando {{ selectedModelIds.length }} modelos seleccionados en esta comparacion.
      </p>
      <SummaryBar
        :model-ids="selectedModelIds"
        :model-by-id="modelById"
        :summary-by-model="compareOutput.summaryByModel"
      />

      <QueryTabs
        v-model:active-index="activeQueryIndex"
        :queries="compareOutput.resultsByQuery"
      />

      <section v-if="activeQueryResult" class="query-results">
        <OverlapMatrix
          :model-ids="selectedModelIds"
          :model-by-id="modelById"
          :matrix="activeQueryResult.overlapMatrix"
        />

        <div class="rankings-grid">
          <ModelRankingTable
            v-for="modelId in selectedModelIds"
            :key="`ranking-${modelId}`"
            :model-label="modelById[modelId]?.label ?? modelId"
            :result="activeQueryResult.rankingByModel[modelId]"
          />
        </div>
      </section>
    </section>
  </main>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;700&display=swap');

:root {
  --bg-wash: #f6f8ee;
  --bg-sand: #f8eecf;
  --bg-leaf: #daf0c3;
  --panel-bg: #fffdf5;
  --panel-border: #bfd2ab;
  --text-main: #1f2918;
  --text-muted: #5b694e;
  --accent: #2f8c57;
  --accent-soft: #d9f0db;
  --action: #db7b30;
  --action-alt: #2d80c7;
}

* {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  font-family: 'Plus Jakarta Sans', 'Avenir Next', 'Segoe UI', sans-serif;
  color: var(--text-main);
  background:
    radial-gradient(circle at 4% 4%, color-mix(in srgb, var(--bg-leaf) 90%, white) 0%, transparent 28%),
    radial-gradient(circle at 96% 8%, color-mix(in srgb, var(--bg-sand) 95%, white) 0%, transparent 32%),
    linear-gradient(165deg, var(--bg-wash), color-mix(in srgb, var(--bg-sand) 65%, white));
  min-height: 100vh;
}

.app-shell {
  width: min(1260px, 95vw);
  margin: 1.3rem auto 2.2rem;
  display: grid;
  gap: 1rem;
}

.hero {
  display: grid;
  grid-template-columns: 1.2fr minmax(280px, 360px);
  gap: 1rem;
  padding: 1rem;
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--panel-bg) 93%, white), color-mix(in srgb, #f3ffe7 80%, white));
  box-shadow: 0 14px 32px -24px color-mix(in srgb, var(--accent) 65%, transparent);
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.71rem;
  color: #6b775e;
  font-weight: 700;
}

h1,
h2,
h3 {
  font-family: 'Baloo 2', 'Plus Jakarta Sans', sans-serif;
}

h1 {
  margin: 0.32rem 0 0;
  line-height: 1.12;
  font-size: clamp(1.52rem, 3.4vw, 2.2rem);
}

.intro {
  margin: 0.5rem 0 0;
  color: var(--text-muted);
  max-width: 66ch;
}

.hero-tags {
  margin-top: 0.68rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.hero-tags span {
  border-radius: 999px;
  padding: 0.24rem 0.56rem;
  border: 1px solid color-mix(in srgb, var(--panel-border) 75%, transparent);
  background: color-mix(in srgb, var(--panel-bg) 85%, white);
  font-size: 0.73rem;
  font-weight: 620;
}

.hero-note {
  border-radius: 16px;
  padding: 0.74rem;
  border: 1px solid var(--panel-border);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--accent-soft) 76%, white), color-mix(in srgb, var(--bg-sand) 70%, white));
  display: grid;
  gap: 0.5rem;
  align-content: center;
}

.jungle-art {
  width: 100%;
}

.jungle-svg {
  width: 100%;
  height: auto;
}

.jungle-svg .palm path {
  fill: none;
  stroke: #2f8c57;
  stroke-linecap: round;
  stroke-width: 7;
}

.jungle-svg .monkey circle {
  fill: #734e31;
}

.jungle-svg .monkey .face {
  fill: #e3b897;
}

.jungle-svg .monkey .smile {
  fill: none;
  stroke: #2d1f14;
  stroke-width: 4;
  stroke-linecap: round;
}

.palm-left {
  transform-origin: 62px 64px;
  animation: sway-left 4.6s ease-in-out infinite;
}

.palm-right {
  transform-origin: 198px 66px;
  animation: sway-right 5.2s ease-in-out infinite;
}

.monkey {
  transform-origin: 128px 95px;
  animation: monkey-bob 2.4s ease-in-out infinite;
}

.hero-note-text {
  margin: 0;
  font-size: 0.86rem;
  color: color-mix(in srgb, var(--text-main) 82%, var(--text-muted));
}

.status-strip {
  display: grid;
  gap: 0.76rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.status-card {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-bg) 90%, white);
  padding: 0.74rem;
  display: grid;
  gap: 0.4rem;
}

.monkey-card {
  background:
    radial-gradient(circle at 14% 24%, color-mix(in srgb, #ffe7a4 70%, white), transparent 38%),
    color-mix(in srgb, var(--panel-bg) 90%, white);
}

.status-head {
  display: flex;
  justify-content: space-between;
  gap: 0.52rem;
  align-items: center;
}

.status-card h2 {
  margin: 0;
  font-size: 0.96rem;
}

.status-card p {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.status-dot {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 50%;
  background: #8f9e81;
}

.status-dot.online {
  background: #30b972;
  box-shadow: 0 0 0 5px color-mix(in srgb, #30b972 16%, transparent);
}

.status-dot.offline {
  background: #ca4d3f;
  box-shadow: 0 0 0 5px color-mix(in srgb, #ca4d3f 16%, transparent);
}

.mini-button {
  width: fit-content;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  padding: 0.22rem 0.56rem;
  font: inherit;
  font-size: 0.76rem;
  background: color-mix(in srgb, var(--panel-bg) 88%, white);
  color: var(--text-main);
  cursor: pointer;
}

.setup-layout {
  display: grid;
  grid-template-columns: minmax(270px, 1fr) minmax(330px, 1.42fr);
  gap: 1rem;
}

.setup-col {
  display: grid;
  gap: 0.9rem;
}

.panel {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-bg) 88%, white);
  padding: 0.86rem;
}

.controls-panel {
  display: grid;
  gap: 0.78rem;
}

.controls-panel h2 {
  margin: 0;
  font-size: 1.08rem;
}

.control-grid {
  display: grid;
  gap: 0.72rem;
}

label {
  display: grid;
  gap: 0.36rem;
  font-size: 0.86rem;
}

label span {
  color: var(--text-muted);
}

select,
input[type='text'] {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, white 90%, transparent);
  padding: 0.45rem 0.56rem;
  color: var(--text-main);
  font: inherit;
}

select {
  width: fit-content;
  min-width: 96px;
}

.actions-row {
  display: grid;
  gap: 0.56rem;
}

button {
  border: none;
  border-radius: 11px;
  padding: 0.64rem 0.94rem;
  background: linear-gradient(140deg, var(--action), #f09a53);
  color: white;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  transition:
    filter 0.12s ease,
    transform 0.12s ease;
}

button:hover {
  filter: brightness(1.03);
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.secondary-button {
  background: linear-gradient(140deg, var(--action-alt), #4ca4ea);
}

.tertiary-button {
  background: linear-gradient(140deg, #6c7a7f, #91a0a5);
}

.validation-message {
  margin: 0;
  font-size: 0.83rem;
  color: #715326;
}

.error-message {
  margin: 0;
  font-size: 0.83rem;
  color: #ad2d2d;
}

.results {
  display: grid;
  gap: 0.86rem;
  animation: reveal 0.3s ease-out;
}

.results h2 {
  margin: 0;
  font-size: 1.2rem;
}

.results-meta {
  margin: -0.32rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.query-results {
  display: grid;
  gap: 0.86rem;
}

.rankings-grid {
  display: grid;
  gap: 0.82rem;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes sway-left {
  0%,
  100% {
    transform: rotate(-3deg);
  }

  50% {
    transform: rotate(2deg);
  }
}

@keyframes sway-right {
  0%,
  100% {
    transform: rotate(3deg);
  }

  50% {
    transform: rotate(-2deg);
  }
}

@keyframes monkey-bob {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@media (max-width: 940px) {
  .hero,
  .setup-layout {
    grid-template-columns: 1fr;
  }

  .hero-note {
    order: -1;
  }
}
</style>
