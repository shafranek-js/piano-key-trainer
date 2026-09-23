<script lang="ts">
  import {
    TWO_HAND_PATTERNS,
    TWO_HAND_TEMPO,
    type TwoHandPatternDef
  } from '../../core/twohand/twoHandData';
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    settings = {} as UserSettings,
    onSettingsChange,
    onStartPattern
  } = $props();
</script>

<div class="page-heading">
  <div>
    <h2>Две руки</h2>
    <p>Первые упражнения на координацию: одновременные пары, удерживаемый бас и чередование рук.</p>
  </div>
</div>

<div class="twohand-intro">
  <section class="card">
    <h2>Two-hand Introduction <span class="pill">Координация</span></h2>
    <div class="help">
      <strong>Pitch</strong>, <strong>rhythm</strong> и <strong>coordination</strong> считаются отдельно. MIDI рекомендуется: только он позволяет реально измерять одновременность и удержание клавиш. Мышь остаётся доступной для изучения последовательности.
    </div>

    <div class="twohand-controls" style="margin-top: 12px; display: flex; gap: 8px;">
      {#each Object.entries(TWO_HAND_TEMPO) as [k, v]}
        <button
          type="button"
          class="btn {settings.twoHandTempoMode === k ? 'on' : ''}"
          onclick={() => onSettingsChange?.({ twoHandTempoMode: k as any })}
        >
          {v.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>Цвет рук</h2>
    <div class="help">
      <strong style="color:#c4b5fd">Левая рука — фиолетовая</strong><br>
      <strong style="color:#7dd3fc">Правая рука — голубая</strong><br><br>
      Оценка координации не влияет на FSRS.
    </div>
  </section>
</div>

<div class="twohand-grid">
  {#each TWO_HAND_PATTERNS as pattern (pattern.id)}
    <article class="twohand-card">
      <small>{pattern.level}</small>
      <h3>{pattern.title}</h3>
      <p>{pattern.description}</p>
      <button
        type="button"
        class="btn primary"
        onclick={() => onStartPattern?.(pattern.id)}
      >
        Начать
      </button>
    </article>
  {/each}
</div>
