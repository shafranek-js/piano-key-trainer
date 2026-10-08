<script lang="ts">
  let {
    metaTitle = 'Текущая сессия',
    sessionLabel = 'Обычная · 8 мин',
    sessionDetail = '0 заданий · точность —',
    progressPct = 0,
    isEnded = false,
    showEndButton = true,
    onEndSession = () => {}
  } = $props();
</script>

<section class="session-strip" aria-label="Текущая учебная сессия">
  <div class="session-meta">
    <span>{metaTitle}</span>
    <b title={sessionLabel}>{sessionLabel}</b>
    <small>{sessionDetail}</small>
  </div>
  <div class="session-progress" aria-label="Прогресс сессии">
    <i style="width: {Math.max(0, Math.min(100, progressPct))}%;"></i>
  </div>
  {#if showEndButton}
    <button 
      type="button" 
      class="btn end-session-btn" 
      disabled={isEnded} 
      onclick={() => onEndSession?.()}
    >
      {isEnded ? 'Завершена' : 'Завершить'}
    </button>
  {/if}
</section>

