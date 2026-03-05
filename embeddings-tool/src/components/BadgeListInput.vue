<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  helper: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  modelValue: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])
const draftValue = ref('')

const items = computed(() =>
  props.modelValue
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean),
)

function updateItems(nextItems) {
  emit('update:modelValue', nextItems.join('\n'))
}

function splitInput(rawValue) {
  return rawValue
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function addDraftItems() {
  const nextItems = splitInput(draftValue.value)
  if (!nextItems.length) {
    return
  }

  updateItems([...items.value, ...nextItems])
  draftValue.value = ''
}

function removeItem(indexToRemove) {
  updateItems(items.value.filter((_, index) => index !== indexToRemove))
}

function clearItems() {
  updateItems([])
}

function onDraftKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ',') {
    return
  }

  event.preventDefault()
  addDraftItems()
}
</script>

<template>
  <section class="panel badge-list-panel">
    <div class="panel-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="helper">{{ helper }}</p>
      </div>
      <div class="meta-actions">
        <span class="count-pill">{{ items.length }} items</span>
        <button type="button" class="ghost-button" @click="clearItems">Vaciar</button>
      </div>
    </div>

    <div class="input-row">
      <input
        v-model="draftValue"
        :placeholder="placeholder"
        type="text"
        @keydown="onDraftKeydown"
      />
      <button type="button" class="add-button" @click="addDraftItems">Anadir</button>
    </div>

    <div class="badge-wrap">
      <span v-for="(item, index) in items" :key="`${item}-${index}`" class="item-badge">
        <span>{{ item }}</span>
        <button type="button" aria-label="Eliminar item" @click="removeItem(index)">x</button>
      </span>
      <p v-if="items.length === 0" class="empty-state">
        Sin items. Usa Enter, coma o el boton Anadir.
      </p>
    </div>
  </section>
</template>

<style scoped>
.badge-list-panel {
  display: grid;
  gap: 0.72rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 0.7rem;
}

h2 {
  margin: 0;
  font-size: 1.05rem;
}

p {
  margin: 0.22rem 0 0;
  color: var(--text-muted);
  font-size: 0.86rem;
}

.meta-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.count-pill {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--panel-border));
  background: color-mix(in srgb, var(--accent-soft) 72%, white);
  padding: 0.17rem 0.48rem;
  font-size: 0.72rem;
  font-weight: 620;
}

.ghost-button {
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-bg) 84%, white);
  color: var(--text-muted);
  font: inherit;
  font-size: 0.77rem;
  border-radius: 999px;
  padding: 0.19rem 0.5rem;
  cursor: pointer;
}

.input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
}

input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  padding: 0.5rem 0.56rem;
  background: color-mix(in srgb, white 84%, transparent);
  color: var(--text-main);
  font: inherit;
}

input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 1px;
}

.add-button {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--panel-border));
  border-radius: 10px;
  padding: 0.5rem 0.68rem;
  background: color-mix(in srgb, var(--accent-soft) 68%, white);
  color: var(--text-main);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 620;
  cursor: pointer;
}

.badge-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.item-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--panel-border));
  background: color-mix(in srgb, var(--accent-soft) 68%, white);
  color: var(--text-main);
  padding: 0.22rem 0.5rem;
  font-size: 0.75rem;
}

.item-badge button {
  border: none;
  border-radius: 999px;
  width: 1.05rem;
  height: 1.05rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--panel-bg) 82%, white);
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.empty-state {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.76rem;
}

@media (max-width: 640px) {
  .panel-header {
    flex-direction: column;
  }

  .input-row {
    grid-template-columns: 1fr;
  }
}
</style>
