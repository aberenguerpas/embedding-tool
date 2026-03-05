<script setup>
const props = defineProps({
  stageLabel: {
    type: String,
    required: true,
  },
  modelIds: {
    type: Array,
    required: true,
  },
  modelById: {
    type: Object,
    required: true,
  },
  queryResult: {
    type: Object,
    required: true,
  },
  topK: {
    type: Number,
    required: true,
  },
})

function qualityBucket(ndcg) {
  if (ndcg >= 0.75) {
    return 'good'
  }

  if (ndcg >= 0.45) {
    return 'warn'
  }

  return 'bad'
}

function hasRelevanceMetricsForAnyModel() {
  return props.modelIds.some((modelId) => props.queryResult?.rankingByModel?.[modelId]?.quality)
}
</script>

<template>
  <section class="eval-card">
    <header>
      <h3>{{ stageLabel }} · Evaluacion por query</h3>
      <span class="k-pill">k={{ topK }}</span>
    </header>

    <p v-if="!hasRelevanceMetricsForAnyModel()" class="empty-note">
      Anade relevancias para activar Recall@k, MRR@k y NDCG@k por query.
    </p>

    <table v-else>
      <thead>
        <tr>
          <th>Modelo</th>
          <th>Recall@k</th>
          <th>MRR@k</th>
          <th>NDCG@k</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="modelId in modelIds" :key="`${stageLabel}-${modelId}`">
          <td>{{ modelById[modelId]?.label ?? modelId }}</td>
          <td>{{ (queryResult.rankingByModel[modelId]?.quality?.recallAtK ?? 0).toFixed(4) }}</td>
          <td>{{ (queryResult.rankingByModel[modelId]?.quality?.mrrAtK ?? 0).toFixed(4) }}</td>
          <td>{{ (queryResult.rankingByModel[modelId]?.quality?.ndcgAtK ?? 0).toFixed(4) }}</td>
          <td>
            <span
              :class="[
                'quality-pill',
                qualityBucket(queryResult.rankingByModel[modelId]?.quality?.ndcgAtK ?? 0),
              ]"
            >
              {{
                qualityBucket(queryResult.rankingByModel[modelId]?.quality?.ndcgAtK ?? 0) === 'good'
                  ? 'Bueno'
                  : qualityBucket(queryResult.rankingByModel[modelId]?.quality?.ndcgAtK ?? 0) === 'warn'
                    ? 'Intermedio'
                    : 'Bajo'
              }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.eval-card {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-bg) 92%, white);
  padding: 0.74rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

h3 {
  margin: 0;
  font-size: 0.88rem;
}

.k-pill {
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.1rem 0.42rem;
}

.empty-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--panel-border) 70%, transparent);
  padding: 0.45rem 0.36rem;
  font-size: 0.76rem;
}

tbody tr:last-child td {
  border-bottom: none;
}

.quality-pill {
  display: inline-flex;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  padding: 0.08rem 0.36rem;
  font-size: 0.67rem;
  font-weight: 700;
}

.quality-pill.good {
  border-color: color-mix(in srgb, #1f9a69 48%, var(--panel-border));
  color: #0f6a48;
  background: color-mix(in srgb, #1f9a69 10%, white);
}

.quality-pill.warn {
  border-color: color-mix(in srgb, #d38a28 52%, var(--panel-border));
  color: #8b5b15;
  background: color-mix(in srgb, #d38a28 12%, white);
}

.quality-pill.bad {
  border-color: color-mix(in srgb, #cf4747 52%, var(--panel-border));
  color: #8a2d2d;
  background: color-mix(in srgb, #cf4747 10%, white);
}
</style>
