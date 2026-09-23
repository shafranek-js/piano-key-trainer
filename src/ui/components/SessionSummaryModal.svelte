<script lang="ts">
  let {
    isOpen = false,
    leadText = 'Сессия завершена.',
    duration = '—',
    trials = 0,
    accuracy = '—',
    medianLatency = '—',
    scheduledLabel = 'Scheduled',
    scheduledValue = '0',
    newLabel = 'Новых',
    newValue = '0',
    weakSummary = 'Ошибок нет.',
    onStartSession,
    onClose
  } = $props();
</script>

{#if isOpen}
  <div class="session-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="summaryHeading">
    <section class="session-summary">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h2 id="summaryHeading">Сессия завершена</h2>
          <p class="summary-lead">{leadText}</p>
        </div>
        <button type="button" class="settings-close" aria-label="Закрыть" onclick={() => onClose?.()}>✕</button>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <small>Время</small>
          <b>{duration}</b>
        </div>
        <div class="summary-item">
          <small>Заданий</small>
          <b>{trials}</b>
        </div>
        <div class="summary-item">
          <small>1-я попытка</small>
          <b>{accuracy}</b>
        </div>
        <div class="summary-item">
          <small>Медиана</small>
          <b>{medianLatency}</b>
        </div>
        <div class="summary-item">
          <small>{scheduledLabel}</small>
          <b>{scheduledValue}</b>
        </div>
        <div class="summary-item">
          <small>{newLabel}</small>
          <b>{newValue}</b>
        </div>
      </div>

      <div class="summary-weak">
        {weakSummary}
      </div>

      <div class="summary-actions">
        <button type="button" class="btn" onclick={() => onStartSession?.('quick')}>
          Ещё 3 мин
        </button>
        <button type="button" class="btn primary" onclick={() => onStartSession?.('normal')}>
          Новая сессия · 8 мин
        </button>
        <button type="button" class="btn" onclick={() => onStartSession?.('due')}>
          Закрыть все повторы
        </button>
        <button type="button" class="btn" onclick={() => onStartSession?.('cold')}>
          Cold Test · 20
        </button>
      </div>
    </section>
  </div>
{/if}
