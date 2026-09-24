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
    lengthMode = 'excerpt' as 'excerpt' | 'full',
    hasFull = false,
    isDemoPlaying = false,
    onToggleDemo,
    onSetLengthMode,
    onSetLoopMeasure,
    onPrevMeasure,
    onNextMeasure,
    onRestart,
    onExit
  } = $props();

  const isExpressionActive = $derived(dynamicsMode !== 'off' || articulationMode !== 'off');
  const plainSubtitle = $derived(subtitle ? subtitle.replace(/<[^>]*>/g, '') : '');
</script>

<section class="song-banner active" id="songBanner">
  <!-- Zone 1: Piece Identity, Inline Progress & Compact Description -->
  <div class="song-banner-identity">
    <h3 id="songBannerTitle" title={plainSubtitle}>{title}</h3>

    <div class="song-banner-badges">
      <span class="song-progress-chip" id="songProgressChip">{progressText}</span>
      <span class="song-progress-chip measure-chip" title="Текущий такт из общего числа тактов">
        Такт {currentMeasure}/{totalMeasures}
      </span>

      {#if isDemoPlaying}
        <span class="song-progress-chip demo-chip">
          🔊 Демо
        </span>
      {/if}

      {#if isExpressionActive || lastExpressionText}
        <span class="expression-hud" id="expressionHud">
          {#if dynamicsMode !== 'off'}
            <span class="expression-chip active">
              Дин: {DYNAMIC_MODES[dynamicsMode as keyof typeof DYNAMIC_MODES]?.short || '—'}
            </span>
          {/if}
          {#if articulationMode !== 'off'}
            <span class="expression-chip active">
              Арт: {ARTICULATION_MODES[articulationMode as keyof typeof ARTICULATION_MODES]?.short || '—'}
            </span>
          {/if}
          {#if lastExpressionText}
            <span class="expression-chip {lastExpressionText.includes('✓') ? 'good' : 'warn'}">
              {lastExpressionText}
            </span>
          {/if}
        </span>
      {/if}
    </div>

    {#if subtitle}
      <span class="song-banner-sep" aria-hidden="true">·</span>
      <p id="songBannerSub" title={plainSubtitle}>{@html subtitle}</p>
    {/if}
  </div>

  <!-- Zone 2 & 3: Length Mode + Unified Loop Control + Transport & Navigation -->
  <div class="song-banner-controls">
    {#if hasFull}
      <div class="song-length-toggle" role="group" aria-label="Выбор объёма произведения">
        <button
          type="button"
          class="length-toggle-btn {lengthMode === 'excerpt' ? 'active' : ''}"
          onclick={() => onSetLengthMode?.('excerpt')}
          title="Играть короткий учебный отрывок (главную тему)"
        >
          Отрывок
        </button>
        <button
          type="button"
          class="length-toggle-btn {lengthMode === 'full' ? 'active' : ''}"
          onclick={() => onSetLengthMode?.('full')}
          title="Играть полное произведение целиком"
        >
          🎼 Полная
        </button>
      </div>

      <span class="song-toolbar-divider" aria-hidden="true"></span>
    {/if}

    <div class="song-loop-group" role="group" aria-label="Управление зацикливанием тактов">
      {#if loopMeasure != null}
        <button
          type="button"
          class="loop-nav-btn"
          disabled={loopMeasure <= 1}
          onclick={() => onPrevMeasure?.()}
          title="Предыдущий такт"
          aria-label="Предыдущий такт"
        >
          ◀
        </button>
      {:else}
        <button
          type="button"
          class="loop-quick-btn"
          onclick={() => onSetLoopMeasure?.(currentMeasure)}
          title="Зациклить текущий такт ({currentMeasure}) для отработки"
        >
          🔁 Такт {currentMeasure}
        </button>
      {/if}

      <select
        class="measure-dropdown {loopMeasure != null ? 'is-looping' : ''}"
        value={loopMeasure ?? ''}
        onchange={(e) => {
          const val = (e.currentTarget as HTMLSelectElement).value;
          onSetLoopMeasure?.(val === '' ? null : Number(val));
        }}
        aria-label="Режим проигрывания и выбор такта"
      >
        <option value="">Вся пьеса ({totalMeasures} т.)</option>
        {#each Array(totalMeasures) as _, idx}
          <option value={idx + 1}>
            🔁 Такт {idx + 1}{loopMeasure === idx + 1 && loopCount > 0 ? ` · #${loopCount}` : ''}
          </option>
        {/each}
      </select>

      {#if loopMeasure != null}
        <button
          type="button"
          class="loop-nav-btn"
          disabled={loopMeasure >= totalMeasures}
          onclick={() => onNextMeasure?.()}
          title="Следующий такт"
          aria-label="Следующий такт"
        >
          ▶
        </button>
        <button
          type="button"
          class="loop-clear-btn"
          onclick={() => onSetLoopMeasure?.(null)}
          title="Выключить зацикливание и играть всю пьесу"
          aria-label="Выключить зацикливание"
        >
          ✕
        </button>
      {/if}
    </div>

    <span class="song-toolbar-divider" aria-hidden="true"></span>

    <div class="song-banner-actions">
      <button
        type="button"
        class="btn btn-compact {isDemoPlaying ? 'warn' : 'primary'} demo-btn"
        onclick={() => onToggleDemo?.()}
        title={isDemoPlaying ? 'Остановить автопроигрывание' : 'Прослушать мелодию с подсветкой нот'}
      >
        {#if isDemoPlaying}
          ⏹ Стоп
        {:else}
          ▶ Послушать
        {/if}
      </button>
      <button
        type="button"
        class="btn btn-compact"
        onclick={() => onRestart?.()}
        title="Начать мелодию сначала"
      >
        ↺ Сначала
      </button>
      <button
        type="button"
        class="btn btn-compact"
        onclick={() => onExit?.()}
        title="Вернуться к списку мелодий"
      >
        ← К мелодиям
      </button>
    </div>
  </div>
</section>

