<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: 'Modelos',
  },
  models: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: Array,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  openRequestToken: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['update:modelValue'])
const searchText = ref('')
const isOpen = ref(false)

function toggleModel(modelId) {
  const selected = new Set(props.modelValue)

  if (selected.has(modelId)) {
    selected.delete(modelId)
  } else {
    selected.add(modelId)
  }

  emit('update:modelValue', Array.from(selected))
}

function selectAllModels() {
  emit(
    'update:modelValue',
    props.models.map((model) => model.id),
  )
}

function clearSelection() {
  emit('update:modelValue', [])
}

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function getModelKind(modelId) {
  const normalized = modelId.toLowerCase()

  if (normalized.includes('multilingual') || normalized.includes('labse')) {
    return 'multilingual'
  }

  if (normalized.includes('msmarco') || normalized.includes('multi-qa')) {
    return 'retrieval'
  }

  return 'general'
}

const filteredModels = computed(() => {
  const query = searchText.value.trim().toLowerCase()

  const sorted = [...props.models].sort((left, right) => {
    const leftSelected = props.modelValue.includes(left.id)
    const rightSelected = props.modelValue.includes(right.id)

    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1
    }

    return left.label.localeCompare(right.label)
  })

  if (!query) {
    return sorted
  }

  return sorted.filter((model) => {
    const haystack = `${model.id} ${model.label} ${model.description}`.toLowerCase()
    return haystack.includes(query)
  })
})

const selectedPreview = computed(() => {
  if (props.modelValue.length === 0) {
    return 'Sin modelos seleccionados'
  }

  const labels = props.modelValue
    .map((modelId) => props.models.find((model) => model.id === modelId)?.label ?? modelId)
    .slice(0, 3)

  if (props.modelValue.length > 3) {
    return `${labels.join(', ')} +${props.modelValue.length - 3}`
  }

  return labels.join(', ')
})

watch(
  () => props.openRequestToken,
  () => {
    isOpen.value = true
  },
)
</script>

<template>
  <section :class="['panel model-panel', { compact: compact }]">
    <button class="dropdown-toggle" type="button" @click="toggleOpen">
      <div class="panel-head">
        <div>
          <h2>{{ title }}</h2>
          <p class="panel-description">{{ selectedPreview }}</p>
        </div>
        <div class="toggle-meta">
          <span class="count-pill">{{ modelValue.length }} seleccionados</span>
          <span class="caret">{{ isOpen ? '▲' : '▼' }}</span>
        </div>
      </div>
    </button>

    <div v-if="isOpen" class="dropdown-content">
      <div class="quick-actions">
        <button type="button" class="quick-button" @click="selectAllModels">Seleccionar todos</button>
        <button type="button" class="quick-button ghost" @click="clearSelection">Limpiar</button>
      </div>

      <label class="search-box">
        <span>Filtrar modelos</span>
        <input v-model="searchText" type="text" placeholder="miniLM, multilingual, msmarco..." />
      </label>

      <div class="model-grid">
        <label
          v-for="model in filteredModels"
          :key="model.id"
          :class="['model-card', { active: modelValue.includes(model.id) }]"
        >
          <input
            :checked="modelValue.includes(model.id)"
            type="checkbox"
            @change="toggleModel(model.id)"
          />
          <div class="model-content">
            <div class="model-row">
              <strong>{{ model.label }}</strong>
              <span class="kind-pill">{{ getModelKind(model.id) }}</span>
            </div>
            <p>{{ model.description }}</p>
            <small>{{ model.id }}</small>
          </div>
        </label>

        <p v-if="filteredModels.length === 0" class="empty-state">No hay modelos para ese filtro.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.model-panel {
  position: relative;
  display: grid;
  gap: 0.72rem;
}

.model-panel.compact {
  border: none;
  box-shadow: none;
  padding: 0;
  background: transparent;
}

.dropdown-toggle {
  border: 1px solid color-mix(in srgb, var(--panel-border) 82%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg) 90%, white);
  padding: 0.72rem;
  text-align: left;
}

.model-panel.compact .dropdown-toggle {
  background: color-mix(in srgb, var(--panel-bg) 88%, white);
  padding: 0.54rem 0.62rem;
}

.dropdown-content {
  position: absolute;
  top: calc(100% + 0.38rem);
  left: 0;
  right: 0;
  z-index: 30;
  display: grid;
  gap: 0.88rem;
  border: 1px solid color-mix(in srgb, var(--panel-border) 84%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg) 96%, white);
  padding: 0.72rem;
  box-shadow: 0 18px 28px -24px rgba(18, 46, 92, 0.6);
}

.toggle-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.caret {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: start;
}

h2 {
  margin: 0;
  font-size: 1.06rem;
}

.model-panel.compact h2 {
  font-size: 0.88rem;
}

.panel-description {
  margin: 0.16rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.model-panel.compact .panel-description {
  font-size: 0.75rem;
}

.count-pill {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--panel-border));
  background: color-mix(in srgb, var(--accent-soft) 65%, white);
  color: var(--text-main);
  padding: 0.22rem 0.56rem;
  font-size: 0.74rem;
  font-weight: 640;
  white-space: nowrap;
}

.model-panel.compact .count-pill {
  font-size: 0.69rem;
  padding: 0.16rem 0.42rem;
}

.quick-actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.quick-button {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--panel-border));
  border-radius: 999px;
  padding: 0.18rem 0.52rem;
  background: color-mix(in srgb, var(--accent-soft) 70%, white);
  color: var(--text-main);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 620;
  cursor: pointer;
}

.quick-button.ghost {
  border-color: var(--panel-border);
  background: color-mix(in srgb, var(--panel-bg) 86%, white);
}

.search-box {
  display: grid;
  gap: 0.34rem;
}

.search-box span {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.search-box input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  padding: 0.46rem 0.54rem;
  background: color-mix(in srgb, white 84%, transparent);
  color: var(--text-main);
  font: inherit;
}

.search-box input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 1px;
}

.model-grid {
  display: grid;
  gap: 0.64rem;
  max-height: 420px;
  overflow: auto;
  padding-right: 0.2rem;
}

.model-panel.compact .model-grid {
  max-height: 320px;
}

.model-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.66rem;
  align-items: start;
  border: 1px solid color-mix(in srgb, var(--panel-border) 76%, transparent);
  padding: 0.72rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-bg) 76%, transparent);
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;
}

.model-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--panel-border));
}

.model-card.active {
  border-color: color-mix(in srgb, var(--accent) 68%, var(--panel-border));
  box-shadow: 0 8px 18px -14px color-mix(in srgb, var(--accent) 60%, transparent);
}

.model-content {
  display: grid;
  gap: 0.24rem;
}

.model-row {
  display: flex;
  justify-content: space-between;
  gap: 0.48rem;
  align-items: center;
}

.model-content p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.34;
}

.model-content small {
  color: color-mix(in srgb, var(--text-muted) 88%, black 3%);
  font-size: 0.73rem;
}

.kind-pill {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 80%, transparent);
  background: color-mix(in srgb, var(--panel-bg) 90%, white);
  padding: 0.14rem 0.46rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  white-space: nowrap;
}

.empty-state {
  margin: 0;
  border: 1px dashed color-mix(in srgb, var(--panel-border) 75%, transparent);
  border-radius: 10px;
  padding: 0.65rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}
</style>
