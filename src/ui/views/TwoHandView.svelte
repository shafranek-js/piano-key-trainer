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

  let selectedCategory = $state<'all' | 'pairs' | 'motion' | 'harmony' | 'alternate'>('all');

  const filteredPatterns = $derived(
    selectedCategory === 'all'
      ? TWO_HAND_PATTERNS
      : TWO_HAND_PATTERNS.filter(p => (p.category || 'pairs') === selectedCategory)
  );

  const categoryCounts = $derived({
    all: TWO_HAND_PATTERNS.length,
    pairs: TWO_HAND_PATTERNS.filter(p => (p.category || 'pairs') === 'pairs').length,
    motion: TWO_HAND_PATTERNS.filter(p => p.category === 'motion').length,
    harmony: TWO_HAND_PATTERNS.filter(p => p.category === 'harmony').length,
    alternate: TWO_HAND_PATTERNS.filter(p => p.category === 'alternate').length
  });
</script>

<div class="page-heading">
  <div>
    <h2>Две руки и Координация</h2>
    <p>Упражнения на совместную игру обеими руками: синхронные пары, противодвижение, гармоническая опора и диалог рук на двойном стане.</p>
  </div>
</div>

<div class="twohand-intro">
  <section class="card">
    <h2>Координация и Двойной стан <span class="pill">Grand Staff</span></h2>
    <div class="help">
      Ноты обеих рук визуализируются на <strong>Двойном стане (Grand Staff)</strong>: левая рука читается в басовом ключе (фиолетовая), правая — в скрипичном (голубая).<br><br>
      <strong>Pitch</strong>, <strong>rhythm</strong> и <strong>coordination</strong> измеряются независимо. Для оценки синхронности нажатия (разброс до 180 мс) используйте MIDI-клавиатуру.
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
    <h2>Цветовые ориентиры</h2>
    <div class="help">
      <strong style="color:#c084fc">🟣 Левая рука — Басовый ключ (C3–C4)</strong><br>
      <strong style="color:#38bdf8">🔵 Правая рука — Скрипичный ключ (C4–C5)</strong><br><br>
      Отработка координации готовит к чтению двухстрочных партитур и не изменяет интервалы FSRS.
    </div>
  </section>
</div>

<div class="twohand-categories" style="display:flex; gap:8px; margin: 16px 0; flex-wrap:wrap;">
  <button
    type="button"
    class="btn {selectedCategory === 'all' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'all'; }}
  >
    Все ({categoryCounts.all})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'motion' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'motion'; }}
  >
    Движение ({categoryCounts.motion})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'pairs' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'pairs'; }}
  >
    Синхронные пары ({categoryCounts.pairs})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'harmony' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'harmony'; }}
  >
    Гармония и Бас ({categoryCounts.harmony})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'alternate' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'alternate'; }}
  >
    Чередование ({categoryCounts.alternate})
  </button>
</div>

<div class="twohand-grid">
  {#each filteredPatterns as pattern (pattern.id)}
    <article class="twohand-card">
      <small>{pattern.level} · {pattern.mode === 'pair' ? 'Синхронно' : pattern.mode === 'anchor' ? 'Опора' : 'Чередование'}</small>
      <h3>{pattern.title}</h3>
      <p>{pattern.description}</p>
      <div style="font-size:12px; color:#94a3b8; margin: 6px 0 10px;">
        Шагов: {pattern.steps.length}
      </div>
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
