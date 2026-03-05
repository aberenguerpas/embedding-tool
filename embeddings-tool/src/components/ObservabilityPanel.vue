<script setup>
defineProps({
  runtime: {
    type: Object,
    required: true,
  },
})

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0 ms'
  }

  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`
  }

  return `${ms.toFixed(1)} ms`
}
</script>

<template>
  <section class="obs-card">
    <header>
      <h3>Observabilidad tecnica</h3>
      <span :class="['run-state', runtime.isRunning ? 'running' : 'idle']">
        {{ runtime.isRunning ? `En curso: ${runtime.runningStep}` : 'Idle' }}
      </span>
    </header>

    <div class="obs-grid">
      <article>
        <h4>Ejecuciones</h4>
        <dl>
          <div><dt>Total</dt><dd>{{ runtime.totalRuns }}</dd></div>
          <div><dt>Exitosas</dt><dd>{{ runtime.successfulRuns }}</dd></div>
          <div><dt>Fallidas</dt><dd>{{ runtime.failedRuns }}</dd></div>
          <div><dt>Success rate</dt><dd>{{ runtime.successRate.toFixed(1) }}%</dd></div>
        </dl>
      </article>

      <article>
        <h4>Tiempos por paso</h4>
        <dl>
          <div><dt>Total</dt><dd>{{ formatDuration(runtime.lastRunDurationMs) }}</dd></div>
          <div><dt>Busqueda</dt><dd>{{ formatDuration(runtime.stepDurationsMs.retrieval) }}</dd></div>
          <div><dt>Umbral</dt><dd>{{ formatDuration(runtime.stepDurationsMs.threshold) }}</dd></div>
          <div><dt>Reranking</dt><dd>{{ formatDuration(runtime.stepDurationsMs.rerank) }}</dd></div>
        </dl>
      </article>

      <article>
        <h4>Eventos y errores</h4>
        <dl>
          <div><dt>Logs</dt><dd>{{ runtime.logCount }}</dd></div>
          <div><dt>Errores log</dt><dd>{{ runtime.errorLogCount }}</dd></div>
          <div><dt>Ultimo error</dt><dd>{{ runtime.lastError || 'Ninguno' }}</dd></div>
          <div><dt>Ultima ejec.</dt><dd>{{ runtime.lastRunAt || 'N/A' }}</dd></div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped>
.obs-card {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-bg) 92%, white);
  padding: 0.74rem;
  display: grid;
  gap: 0.64rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.55rem;
}

h3 {
  margin: 0;
  font-size: 0.9rem;
}

.run-state {
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
}

.run-state.running {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--panel-border));
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent-soft) 70%, white);
}

.run-state.idle {
  color: var(--text-muted);
}

.obs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.6rem;
}

article {
  border: 1px solid color-mix(in srgb, var(--panel-border) 78%, transparent);
  border-radius: 10px;
  padding: 0.5rem 0.56rem;
  background: #fff;
}

h4 {
  margin: 0 0 0.4rem;
  font-size: 0.77rem;
}

dl {
  margin: 0;
  display: grid;
  gap: 0.3rem;
}

div {
  display: flex;
  justify-content: space-between;
  gap: 0.45rem;
}

dt,
dd {
  margin: 0;
  font-size: 0.73rem;
}

dt {
  color: var(--text-muted);
}

dd {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
