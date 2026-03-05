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
  matrix: {
    type: Array,
    required: true,
  },
})
</script>

<template>
  <article class="overlap-panel">
    <header>
      <h3>Overlap@k entre modelos</h3>
      <p>1.00 indica el mismo top-k para la query activa.</p>
    </header>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Modelo</th>
            <th v-for="modelId in modelIds" :key="`head-${modelId}`">
              {{ modelById[modelId]?.label ?? modelId }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in matrix" :key="`row-${modelIds[rowIndex]}`">
            <th>{{ modelById[modelIds[rowIndex]]?.label ?? modelIds[rowIndex] }}</th>
            <td v-for="(value, columnIndex) in row" :key="`cell-${rowIndex}-${columnIndex}`">
              {{ value.toFixed(2) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>

<style scoped>
.overlap-panel {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
  background: color-mix(in srgb, var(--panel-bg) 85%, transparent);
}

header {
  padding: 0.74rem;
  border-bottom: 1px solid var(--panel-border);
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--accent-soft) 45%, white),
    color-mix(in srgb, var(--panel-bg) 80%, transparent)
  );
}

h3 {
  margin: 0;
  font-size: 0.95rem;
}

p {
  margin: 0.24rem 0 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 460px;
}

th,
td {
  border: 1px solid color-mix(in srgb, var(--panel-border) 70%, transparent);
  padding: 0.48rem;
  font-size: 0.76rem;
  text-align: center;
}

thead th,
tbody th {
  background: color-mix(in srgb, var(--accent-soft) 35%, transparent);
  font-weight: 640;
}

tbody th {
  text-align: left;
}

td {
  font-variant-numeric: tabular-nums;
}
</style>
