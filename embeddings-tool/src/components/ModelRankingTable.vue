<script setup>
const props = defineProps({
  modelLabel: {
    type: String,
    required: true,
  },
  result: {
    type: Object,
    required: true,
  },
  threshold: {
    type: Number,
    default: 0,
  },
  rankChangeByDocIndex: {
    type: Object,
    default: null,
  },
})

function formatScore(score) {
  return score.toFixed(4)
}

function toUnitPercent(score) {
  const boundedScore = Math.max(0, Math.min(1, score))
  return boundedScore * 100
}

function rankChangeForDoc(docIndex) {
  return props.rankChangeByDocIndex?.[docIndex] ?? null
}

function isBelowThreshold(score) {
  return score < props.threshold
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
        <tr
          v-for="(doc, rank) in result.rankedDocs"
          :key="doc.docIndex"
          :class="{ 'below-threshold': isBelowThreshold(doc.score) }"
        >
          <td>
            <span :class="['rank-badge', { top: rank === 0 }]">
              {{ rank + 1 }}
            </span>
          </td>
          <td>
            <div class="doc-cell">
              <span class="doc-text">{{ doc.document }}</span>
              <span v-if="isBelowThreshold(doc.score)" class="filtered-pill">Filtrado por umbral</span>
              <span
                v-if="rankChangeForDoc(doc.docIndex)"
                :class="['rank-move', rankChangeForDoc(doc.docIndex).movement]"
              >
                <span v-if="rankChangeForDoc(doc.docIndex).movement === 'up'">↑</span>
                <span v-else-if="rankChangeForDoc(doc.docIndex).movement === 'down'">↓</span>
                <span v-else>→</span>
                {{ rankChangeForDoc(doc.docIndex).label }}
              </span>
            </div>
          </td>
          <td>
            <div class="score-cell">
              <span>{{ formatScore(doc.score) }}</span>
              <div class="score-track">
                <div class="score-fill" :style="{ width: `${toUnitPercent(doc.score)}%` }" />
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

.doc-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  flex-wrap: wrap;
}

.doc-text {
  overflow-wrap: anywhere;
}

.rank-move {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  padding: 0.08rem 0.34rem;
  font-size: 0.65rem;
  font-weight: 700;
}

.rank-move.up {
  border-color: color-mix(in srgb, #1f9a69 48%, var(--panel-border));
  color: #0f6a48;
  background: color-mix(in srgb, #1f9a69 12%, white);
}

.rank-move.down {
  border-color: color-mix(in srgb, #cf4747 52%, var(--panel-border));
  color: #8a2d2d;
  background: color-mix(in srgb, #cf4747 10%, white);
}

.rank-move.same {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--panel-bg) 84%, white);
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

tbody tr.below-threshold {
  opacity: 0.45;
  filter: grayscale(0.9);
}

tbody tr.below-threshold .score-fill {
  background: linear-gradient(90deg, #9aa7ba, #9aa7ba);
}

tbody tr.below-threshold .rank-badge {
  border-style: dashed;
}

.filtered-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--danger) 46%, var(--panel-border));
  border-radius: 999px;
  padding: 0.08rem 0.34rem;
  font-size: 0.64rem;
  font-weight: 700;
  color: #8a2d2d;
  background: color-mix(in srgb, var(--danger) 10%, white);
}
</style>
