<script lang="ts">
  import { DYNAMIC_MODES, ARTICULATION_MODES } from '../../core/repertoire/repertoireData';

  let {
    title = 'Мелодия',
    progressText = 'Wait Mode',
    subtitle = 'Играйте правильную клавишу, чтобы продвинуться дальше.',
    dynamicsMode = 'off',
    articulationMode = 'off',
    lastExpressionText = '',
    onRestart,
    onExit
  } = $props();

  const isExpressionActive = $derived(dynamicsMode !== 'off' || articulationMode !== 'off');
</script>

<section class="song-banner active" id="songBanner">
  <div class="song-banner-main">
    <span class="song-progress-chip" id="songProgressChip">{progressText}</span>
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
  </div>

  <div class="song-banner-actions">
    <button type="button" class="btn" onclick={() => onRestart?.()}>Сначала</button>
    <button type="button" class="btn" onclick={() => onExit?.()}>К мелодиям</button>
  </div>
</section>
