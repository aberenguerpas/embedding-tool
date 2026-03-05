<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelLabel: {
    type: String,
    required: true,
  },
  result: {
    type: Object,
    required: true,
  },
})

function formatScore(score) {
  return score.toFixed(4)
}

const scoreRange = computed(() => {
  const scores = props.result.rankedDocs.map((doc) => doc.score)

  if (scores.length === 0) {
    return { min: 0, max: 0 }
  }

  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
  }
})

function toRelativePercent(score) {
  const minScore = scoreRange.value.min
  const maxScore = scoreRange.value.max
  const denominator = maxScore - minScore

  if (denominator === 0) {
    return 100
  }

  return ((score - minScore) / denominator) * 100
}
</script>

<template>
  <article class="model-result">
    <header>
      <h3>{{ modelLabel }}</h3>
      <div class="meta">
        <span>lat: {{ result.latencyMs.toFixed(2) }} ms</span>
        <span>avg top-k: {{ result.averageScore.toFixed(4) }}</span>
      </div>
    </header>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Dataset</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(doc, rank) in result.rankedDocs" :key="doc.docIndex">
          <td>
            <span :class="['rank-badge', { top: rank === 0 }]">
              {{ rank === 0 ? `🍌${rank + 1}` : rank + 1 }}
            </span>
          </td>
          <td>{{ doc.document }}</td>
          <td>
            <div class="score-cell">
              <span>{{ formatScore(doc.score) }}</span>
              <div class="score-track">
                <div class="score-fill" :style="{ width: `${toRelativePercent(doc.score)}%` }" />
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </article>
</template>

<style scoped>
.model-result {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel-bg) 88%, white);
}

header {
  display: grid;
  gap: 0.2rem;
  padding: 0.76rem 0.82rem;
  border-bottom: 1px solid var(--panel-border);
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--accent-soft) 48%, transparent),
    color-mix(in srgb, var(--panel-bg) 72%, white)
  );
}

h3 {
  margin: 0;
  font-size: 0.95rem;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  color: var(--text-muted);
  font-size: 0.76rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.56rem 0.64rem;
  border-bottom: 1px solid color-mix(in srgb, var(--panel-border) 65%, transparent);
  text-align: left;
  vertical-align: top;
  font-size: 0.8rem;
}

th {
  font-weight: 650;
  color: var(--text-muted);
}

tbody tr:last-child td {
  border-bottom: none;
}

td:first-child,
th:first-child {
  width: 2.4rem;
}

td:last-child,
th:last-child {
  width: 7rem;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 75%, transparent);
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--panel-bg) 70%, white);
}

.rank-badge.top {
  border-color: color-mix(in srgb, #ffc640 68%, #b56f00);
  color: #7a4a00;
  background: linear-gradient(135deg, #ffe8a3, #ffd067);
}

.score-cell {
  display: grid;
  gap: 0.26rem;
}

.score-cell span {
  font-variant-numeric: tabular-nums;
}

.score-track {
  width: 100%;
  height: 0.32rem;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel-border) 72%, white);
}

.score-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff9d57, #1f996b);
}
</style>
