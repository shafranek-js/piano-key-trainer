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
  <div>
    <span class="twohand-chip" id="twoHandProgressChip">{progressText}</span>
    <h3 id="twoHandBannerTitle">{title}</h3>
    <p id="twoHandBannerSub">{subtitle}</p>
  </div>
  <div class="twohand-banner-actions">
    <button type="button" class="btn" onclick={() => onRestart?.()}>Сначала</button>
    <button type="button" class="btn" onclick={() => onExit?.()}>К упражнениям</button>
  </div>
</section>
