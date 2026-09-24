<script lang="ts">
  let {
    title = 'Две руки',
    progressText = 'Wait · 1/5',
    subtitle = 'Координация рук.',
    onRestart,
    onExit
  } = $props();
</script>

<section class="twohand-banner active" id="twoHandBanner">
  <div class="song-banner-identity">
    <h3 id="twoHandBannerTitle" title={subtitle}>{title}</h3>
    <div class="song-banner-badges">
      <span class="twohand-chip" id="twoHandProgressChip">{progressText}</span>
      <span class="twohand-chip" style="background:rgba(192,132,252,0.18); border-color:rgba(192,132,252,0.4); color:#e9d5ff; font-weight:600;">
        🟣 ЛР: бас
      </span>
      <span class="twohand-chip" style="background:rgba(56,189,248,0.18); border-color:rgba(56,189,248,0.4); color:#bae6fd; font-weight:600;">
        🔵 ПР: скрип.
      </span>
    </div>
    {#if subtitle}
      <span class="song-banner-sep" aria-hidden="true">·</span>
      <p id="twoHandBannerSub" title={subtitle}>{subtitle}</p>
    {/if}
  </div>
  <div class="twohand-banner-actions">
    <button type="button" class="btn btn-compact" onclick={() => onRestart?.()}>↺ Сначала</button>
    <button type="button" class="btn btn-compact" onclick={() => onExit?.()}>← К упражнениям</button>
  </div>
</section>

