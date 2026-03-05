<script setup>
import { computed } from 'vue'

const props = defineProps({
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
  evaluationByModel: {
    type: Object,
    default: null,
  },
})

const chartWidth = 680
const chartHeight = 340
const padding = { top: 28, right: 24, bottom: 52, left: 66 }
const tickCount = 5

const points = computed(() =>
  props.modelIds
    .filter((modelId) => props.summaryByModel[modelId])
    .map((modelId, index) => ({
      modelId,
      latency: props.summaryByModel[modelId].avgLatencyMs,
      quality:
        props.evaluationByModel?.[modelId]?.ndcgAtK ?? props.summaryByModel[modelId].avgTopScore,
      label: props.modelById[modelId]?.label ?? modelId,
      markerIndex: index,
    })),
)

const ranges = computed(() => {
  if (!points.value.length) {
    return {
      minLatency: 0,
      maxLatency: 1,
      minQuality: 0,
      maxQuality: 1,
    }
  }

  const latencies = points.value.map((point) => point.latency)
  const qualities = points.value.map((point) => point.quality)

  const minLatency = Math.min(...latencies)
  const maxLatency = Math.max(...latencies)
  const minQuality = Math.min(...qualities)
  const maxQuality = Math.max(...qualities)

  const latencySpan = maxLatency - minLatency || 1
  const qualitySpan = maxQuality - minQuality || 1

  return {
    minLatency: Math.max(0, minLatency - latencySpan * 0.08),
    maxLatency: maxLatency + latencySpan * 0.08,
    minQuality: Math.max(0, minQuality - qualitySpan * 0.12),
    maxQuality: Math.min(1, maxQuality + qualitySpan * 0.12),
  }
})

function xForLatency(value) {
  const { minLatency, maxLatency } = ranges.value
  const innerWidth = chartWidth - padding.left - padding.right
  return padding.left + ((value - minLatency) / (maxLatency - minLatency || 1)) * innerWidth
}

function yForQuality(value) {
  const { minQuality, maxQuality } = ranges.value
  const innerHeight = chartHeight - padding.top - padding.bottom
  return chartHeight - padding.bottom - ((value - minQuality) / (maxQuality - minQuality || 1)) * innerHeight
}

function valueFromTick(min, max, tickIndex) {
  return min + ((max - min) * tickIndex) / (tickCount - 1)
}

const xTicks = computed(() =>
  Array.from({ length: tickCount }, (_, tickIndex) => {
    const value = valueFromTick(ranges.value.minLatency, ranges.value.maxLatency, tickIndex)
    return {
      value,
      x: xForLatency(value),
      label: `${value.toFixed(1)} ms`,
    }
  }),
)

const yTicks = computed(() =>
  Array.from({ length: tickCount }, (_, tickIndex) => {
    const value = valueFromTick(ranges.value.minQuality, ranges.value.maxQuality, tickIndex)
    return {
      value,
      y: yForQuality(value),
      label: value.toFixed(3),
    }
  }),
)

const frontierPoints = computed(() => {
  const sorted = [...points.value].sort((left, right) => left.latency - right.latency)
  const frontier = []
  let bestQuality = -Infinity

  for (const point of sorted) {
    if (point.quality > bestQuality) {
      frontier.push(point)
      bestQuality = point.quality
    }
  }

  return frontier
})

const frontierPath = computed(() =>
  frontierPoints.value
    .map((point) => `${xForLatency(point.latency)},${yForQuality(point.quality)}`)
    .join(' '),
)

const frontierModelIds = computed(() => new Set(frontierPoints.value.map((point) => point.modelId)))

const xAxisY = computed(() => chartHeight - padding.bottom)
const yAxisX = computed(() => padding.left)
const yAxisLabelY = computed(() => (padding.top + chartHeight - padding.bottom) / 2)
</script>

<template>
  <article class="scatter-panel">
    <header>
      <h3>Calidad vs latencia</h3>
      <p>Eje X: latencia media por query. Eje Y: calidad (NDCG@k o score medio). Resaltada la frontera eficiente.</p>
    </header>

    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" role="img" aria-label="Grafica calidad vs latencia con frontera eficiente">
        <g class="grid">
          <line
            v-for="tick in xTicks"
            :key="`x-grid-${tick.value}`"
            :x1="tick.x"
            :y1="padding.top"
            :x2="tick.x"
            :y2="chartHeight - padding.bottom"
          />
          <line
            v-for="tick in yTicks"
            :key="`y-grid-${tick.value}`"
            :x1="padding.left"
            :y1="tick.y"
            :x2="chartWidth - padding.right"
            :y2="tick.y"
          />
        </g>

        <line
          :x1="padding.left"
          :y1="xAxisY"
          :x2="chartWidth - padding.right"
          :y2="xAxisY"
          class="axis"
        />
        <line
          :x1="yAxisX"
          :y1="padding.top"
          :x2="yAxisX"
          :y2="chartHeight - padding.bottom"
          class="axis"
        />

        <g class="ticks">
          <g v-for="tick in xTicks" :key="`x-tick-${tick.value}`">
            <line :x1="tick.x" :y1="xAxisY" :x2="tick.x" :y2="xAxisY + 6" class="tick-line" />
            <text :x="tick.x" :y="xAxisY + 20" text-anchor="middle" class="tick-label">{{ tick.label }}</text>
          </g>
          <g v-for="tick in yTicks" :key="`y-tick-${tick.value}`">
            <line :x1="yAxisX - 6" :y1="tick.y" :x2="yAxisX" :y2="tick.y" class="tick-line" />
            <text :x="yAxisX - 10" :y="tick.y + 4" text-anchor="end" class="tick-label">{{ tick.label }}</text>
          </g>
        </g>

        <text :x="(padding.left + chartWidth - padding.right) / 2" :y="chartHeight - 10" text-anchor="middle" class="axis-label">
          Latencia media por query (ms)
        </text>
        <text
          :x="16"
          :y="yAxisLabelY"
          text-anchor="middle"
          class="axis-label"
          :transform="`rotate(-90 16,${yAxisLabelY})`"
        >
          Calidad (NDCG@k o score medio)
        </text>

        <polyline
          v-if="frontierPoints.length > 1"
          :points="frontierPath"
          class="frontier-line"
        />

        <g v-for="point in points" :key="point.modelId" class="point-group">
          <circle
            :cx="xForLatency(point.latency)"
            :cy="yForQuality(point.quality)"
            :class="['point', { frontier: frontierModelIds.has(point.modelId) }]"
            :r="frontierModelIds.has(point.modelId) ? 6.5 : 5"
          >
            <title>{{ point.label }} | calidad: {{ point.quality.toFixed(4) }} | latencia: {{ point.latency.toFixed(2) }} ms</title>
          </circle>
          <text
            :x="xForLatency(point.latency) + 8"
            :y="yForQuality(point.quality) + (point.markerIndex % 2 === 0 ? -8 : 12)"
            class="point-label"
          >
            {{ point.label }}
          </text>
        </g>
      </svg>

      <p class="chart-legend">
        <span class="legend-dot" /> Punto azul: modelo evaluado.
        <span class="legend-frontier" /> Línea azul oscura: frontera eficiente.
      </p>
    </div>
  </article>
</template>

<style scoped>
.scatter-panel {
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-bg) 86%, white);
  overflow: hidden;
}

header {
  padding: 0.74rem;
  border-bottom: 1px solid var(--panel-border);
}

h3 {
  margin: 0;
  font-size: 0.95rem;
}

p {
  margin: 0.24rem 0 0;
  font-size: 0.77rem;
  color: var(--text-muted);
}

.chart-wrap {
  overflow-x: auto;
  padding: 0.45rem;
}

svg {
  width: 100%;
  min-width: 620px;
  height: auto;
}

.grid line {
  stroke: color-mix(in srgb, var(--panel-border) 62%, transparent);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.axis {
  stroke: color-mix(in srgb, var(--text-muted) 58%, var(--panel-border));
  stroke-width: 1.4;
}

.tick-line {
  stroke: color-mix(in srgb, var(--text-muted) 50%, var(--panel-border));
  stroke-width: 1.2;
}

.tick-label {
  font-size: 11px;
  fill: var(--text-muted);
}

.axis-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  fill: var(--text-main);
}

.frontier-line {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 80%, #0a2f73);
  stroke-width: 2;
  stroke-linejoin: round;
}

.point {
  fill: color-mix(in srgb, var(--accent) 68%, white);
  stroke: color-mix(in srgb, var(--accent) 92%, #0a2f73);
  stroke-width: 1.3;
  transition: r 0.16s ease;
}

.point.frontier {
  fill: color-mix(in srgb, var(--accent) 88%, #083b88);
}

.point-group:hover .point {
  r: 7;
}

.point-label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--text-main);
}

.chart-legend {
  margin: 0.45rem 0 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.legend-dot,
.legend-frontier {
  display: inline-block;
  flex: 0 0 auto;
}

.legend-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 72%, white);
  border: 1px solid color-mix(in srgb, var(--accent) 92%, #0a2f73);
}

.legend-frontier {
  width: 1rem;
  height: 0.14rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 80%, #0a2f73);
}
</style>
