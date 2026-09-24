<script lang="ts">
  import { DYNAMIC_MODES, ARTICULATION_MODES } from '../../core/repertoire/repertoireData';

  let {
    title = 'Мелодия',
    progressText = 'Wait Mode',
    subtitle = 'Играйте правильную клавишу, чтобы продвинуться дальше.',
    dynamicsMode = 'off',
    articulationMode = 'off',
    lastExpressionText = '',
    totalMeasures = 1,
    currentMeasure = 1,
    loopMeasure = null as number | null,
    loopCount = 0,
    isDemoPlaying = false,
    onToggleDemo,
    onSetLoopMeasure,
    onPrevMeasure,
    onNextMeasure,
    onRestart,
    onExit
  } = $props();

  const isExpressionActive = $derived(dynamicsMode !== 'off' || articulationMode !== 'off');
</script>

<section class="song-banner active" id="songBanner">
  <div class="song-banner-main">
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
      <span class="song-progress-chip" id="songProgressChip">{progressText}</span>
      <span class="song-progress-chip" style="background:rgba(59,130,246,0.18); border-color:rgba(59,130,246,0.4); color:#93c5fd;">
        Такт {currentMeasure} / {totalMeasures}
      </span>
      {#if loopMeasure != null}
        <span class="song-progress-chip" style="background:rgba(245,158,11,0.2); border-color:rgba(245,158,11,0.5); color:#fde68a; font-weight:600;">
          🔁 Зациклен такт {loopMeasure} · #{loopCount}
        </span>
      {/if}
      {#if isDemoPlaying}
        <span class="song-progress-chip" style="background:rgba(56,189,248,0.22); border-color:rgba(56,189,248,0.55); color:#7dd3fc; font-weight:700;">
          🔊 Демо-проигрывание
        </span>
      {/if}
    </div>

    <h3 id="songBannerTitle">{title}</h3>
    <p id="songBannerSub">{@html subtitle}</p>

    {#if isExpressionActive || lastExpressionText}
      <div class="expression-hud" id="expressionHud" style="margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        {#if dynamicsMode !== 'off'}
          <span class="expression-chip active">
            Динамика: {DYNAMIC_MODES[dynamicsMode as keyof typeof DYNAMIC_MODES]?.short || '—'}
          </span>
        {/if}
        {#if articulationMode !== 'off'}
          <span class="expression-chip active">
            Артикуляция: {ARTICULATION_MODES[articulationMode as keyof typeof ARTICULATION_MODES]?.short || '—'}
          </span>
        {/if}
        {#if lastExpressionText}
          <span class="expression-chip {lastExpressionText.includes('✓') ? 'good' : 'warn'}">
            {lastExpressionText}
          </span>
        {/if}
      </div>
    {/if}

    <div class="song-loop-bar" style="margin-top:8px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
      <span style="font-size:11px; color:#94a3b8; font-weight:500;">Режим:</span>
      <button
        type="button"
        class="btn btn-sm {loopMeasure == null ? 'primary' : ''}"
        style="padding:2px 8px; font-size:11px; height:24px; min-height:24px;"
        onclick={() => onSetLoopMeasure?.(null)}
      >
        Вся пьеса
      </button>

      <div style="display:inline-flex; align-items:center; gap:3px;">
        {#if loopMeasure != null}
          <button
            type="button"
            class="btn btn-sm"
            style="padding:2px 6px; font-size:11px; height:24px; min-height:24px;"
            disabled={loopMeasure <= 1}
            onclick={() => onPrevMeasure?.()}
            title="Предыдущий такт"
          >
            ◀
          </button>
        {/if}

        <select
          class="measure-dropdown"
          value={loopMeasure ?? ''}
          onchange={(e) => {
            const val = (e.currentTarget as HTMLSelectElement).value;
            onSetLoopMeasure?.(val === '' ? null : Number(val));
          }}
          aria-label="Выбрать такт для зацикливания"
          style="padding:2px 6px; border-radius:6px; background:#0f172a; color:#f8fafc; border:1px solid #334155; font-size:11px; height:24px;"
        >
          <option value="">Вся мелодия</option>
          {#each Array(totalMeasures) as _, idx}
            <option value={idx + 1}>Зациклить такт {idx + 1}</option>
          {/each}
        </select>

        {#if loopMeasure != null}
          <button
            type="button"
            class="btn btn-sm"
            style="padding:2px 6px; font-size:11px; height:24px; min-height:24px;"
            disabled={loopMeasure >= totalMeasures}
            onclick={() => onNextMeasure?.()}
            title="Следующий такт"
          >
            ▶
          </button>
        {/if}
      </div>

      {#if loopMeasure == null}
        <button
          type="button"
          class="btn btn-sm"
          style="padding:2px 8px; font-size:11px; height:24px; min-height:24px; color:#fbbf24; border-color:rgba(245,158,11,0.4);"
          onclick={() => onSetLoopMeasure?.(currentMeasure)}
          title="Зациклить текущий такт для отработки"
        >
          🔁 Зациклить такт {currentMeasure}
        </button>
      {/if}
    </div>
  </div>

  <div class="song-banner-actions">
    <button
      type="button"
      class="btn {isDemoPlaying ? 'warn' : 'primary'}"
      style="font-weight:600; {isDemoPlaying ? 'border-color:#f59e0b; color:#fde68a;' : 'border-color:rgba(56,189,248,0.4); color:#38bdf8;'}"
      onclick={() => onToggleDemo?.()}
      title={isDemoPlaying ? 'Остановить автопроигрывание' : 'Включить автопроигрывание мелодии с подсветкой нот'}
    >
      {#if isDemoPlaying}
        ⏹ Стоп демо
      {:else}
        ▶ Послушать
      {/if}
    </button>
    <button type="button" class="btn" onclick={() => onRestart?.()}>Сначала</button>
    <button type="button" class="btn" onclick={() => onExit?.()}>К мелодиям</button>
  </div>
</section>
