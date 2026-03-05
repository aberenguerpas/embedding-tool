<script setup>
defineProps({
  modelIds: {
    type: Array,
    required: true,
  },
  modelById: {
    type: Object,
    required: true,
  },
  summaryByModel: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <section class="summary-grid">
    <article v-for="modelId in modelIds" :key="modelId" class="summary-card">
      <header>
        <h3>{{ modelById[modelId]?.label ?? modelId }}</h3>
        <span class="status-dot" />
      </header>
      <dl>
        <div>
          <dt>Prep docs</dt>
          <dd>{{ summaryByModel[modelId].prepLatencyMs.toFixed(2) }} ms</dd>
        </div>
        <div>
          <dt>Lat query</dt>
          <dd>{{ summaryByModel[modelId].avgLatencyMs.toFixed(2) }} ms</dd>
        </div>
        <div>
          <dt>Top1 medio</dt>
          <dd>{{ summaryByModel[modelId].avgTopScore.toFixed(4) }}</dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.summary-grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.summary-card {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  padding: 0.74rem;
  background: color-mix(in srgb, var(--panel-bg) 84%, white);
}

header {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.56rem;
}

h3 {
  margin: 0;
  font-size: 0.88rem;
}

.status-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #39c083;
  box-shadow: 0 0 0 5px color-mix(in srgb, #39c083 16%, transparent);
}

dl {
  margin: 0;
  display: grid;
  gap: 0.42rem;
}

dt,
dd {
  margin: 0;
  font-size: 0.79rem;
}

div {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
}

dt {
  color: var(--text-muted);
}

dd {
  font-variant-numeric: tabular-nums;
}
</style>
