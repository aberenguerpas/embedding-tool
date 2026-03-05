<script setup>
defineProps({
  queries: {
    type: Array,
    required: true,
  },
  activeIndex: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['update:activeIndex'])
</script>

<template>
  <nav class="query-tabs" aria-label="Queries">
    <button
      v-for="(query, index) in queries"
      :key="query.queryId"
      :class="['query-tab', { active: index === activeIndex }]"
      type="button"
      @click="emit('update:activeIndex', index)"
    >
      <div class="query-head">
        <span>Q{{ index + 1 }}</span>
        <small>{{ query.rankingByModel ? Object.keys(query.rankingByModel).length : 0 }} modelos</small>
      </div>
      <p>{{ query.queryText }}</p>
    </button>
  </nav>
</template>

<style scoped>
.query-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.6rem;
}

.query-tab {
  display: grid;
  gap: 0.34rem;
  text-align: left;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  padding: 0.74rem;
  background: color-mix(in srgb, var(--panel-bg) 82%, transparent);
  color: var(--text-main);
  cursor: pointer;
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;
}

.query-tab:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--panel-border));
}

.query-head {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: center;
}

.query-head span {
  font-weight: 700;
  font-size: 0.9rem;
}

.query-head small {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.query-tab p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.query-tab.active {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--panel-border));
  background: color-mix(in srgb, var(--accent-soft) 68%, white);
  box-shadow: 0 10px 22px -16px color-mix(in srgb, var(--accent) 70%, transparent);
}

.query-tab.active p,
.query-tab.active .query-head small {
  color: color-mix(in srgb, var(--text-main) 82%, var(--text-muted));
}
</style>
