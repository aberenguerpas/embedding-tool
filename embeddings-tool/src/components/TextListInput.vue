<script setup>
import { computed } from 'vue'

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
  rows: {
    type: Number,
    default: 8,
  },
  clearLabel: {
    type: String,
    default: 'Limpiar',
  },
})

const emit = defineEmits(['update:modelValue'])

const lineCount = computed(() =>
  props.modelValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length,
)

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

function clearInput() {
  emit('update:modelValue', '')
}
</script>

<template>
  <section class="panel list-panel">
    <div class="panel-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="helper">{{ helper }}</p>
      </div>
      <div class="meta-actions">
        <span class="line-pill">{{ lineCount }} lineas</span>
        <button type="button" class="ghost-button" @click="clearInput">{{ clearLabel }}</button>
      </div>
    </div>

    <textarea
      :rows="rows"
      :placeholder="placeholder"
      :value="modelValue"
      spellcheck="false"
      @input="onInput"
    />
  </section>
</template>

<style scoped>
.list-panel {
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

.line-pill {
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

.ghost-button:hover {
  color: var(--text-main);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--panel-border));
}

textarea {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, white 70%, transparent);
  padding: 0.75rem;
  color: var(--text-main);
  font: inherit;
  line-height: 1.43;
  resize: vertical;
}

textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 1px;
}

@media (max-width: 600px) {
  .panel-header {
    flex-direction: column;
  }
}
</style>
