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
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
      <span class="twohand-chip" id="twoHandProgressChip">{progressText}</span>
      <span class="twohand-chip" style="background:rgba(192,132,252,0.18); border-color:rgba(192,132,252,0.4); color:#e9d5ff; font-weight:600;">
        🟣 Левая: басовый ключ
      </span>
      <span class="twohand-chip" style="background:rgba(56,189,248,0.18); border-color:rgba(56,189,248,0.4); color:#bae6fd; font-weight:600;">
        🔵 Правая: скрипичный ключ
      </span>
    </div>
    <h3 id="twoHandBannerTitle">{title}</h3>
    <p id="twoHandBannerSub">{subtitle}</p>
  </div>
  <div class="twohand-banner-actions">
    <button type="button" class="btn" onclick={() => onRestart?.()}>Сначала</button>
    <button type="button" class="btn" onclick={() => onExit?.()}>К упражнениям</button>
  </div>
</section>
