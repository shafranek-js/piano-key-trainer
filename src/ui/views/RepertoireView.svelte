<script lang="ts">
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    getSongMeasureCount,
    type SongDef
  } from '../../core/repertoire/repertoireData';
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    settings = {} as UserSettings,
    onSettingsChange,
    onStartSong
  } = $props();

  let selectedCategory = $state<'all' | 'warmup' | 'study' | 'classical'>('all');

  const filteredRepertoire = $derived(
    selectedCategory === 'all'
      ? REPERTOIRE
      : REPERTOIRE.filter(s => (s.category || 'classical') === selectedCategory)
  );

  const categoryCounts = $derived({
    all: REPERTOIRE.length,
    warmup: REPERTOIRE.filter(s => s.category === 'warmup').length,
    study: REPERTOIRE.filter(s => s.category === 'study').length,
    classical: REPERTOIRE.filter(s => (s.category || 'classical') === 'classical').length
  });
</script>

<div class="page-heading">
  <div>
    <h2>Мелодии и Шедевры</h2>
    <p>Играйте по названиям клавиш или непосредственно по нотному стану. Доступна отработка отдельных тактов по кругу (Measure Looping).</p>
  </div>
</div>

<div class="repertoire-intro">
  <section class="card">
    <h2>Музыкальная выразительность и Отработка <span class="pill">v6.2</span></h2>
    <div class="help">
      <strong>Pitch</strong>, <strong>timing</strong>, <strong>динамика</strong> и <strong>артикуляция</strong> оцениваются раздельно.<br>
      🔁 <strong>Зацикливание тактов (Measure Looping):</strong> во время игры вы можете включить повтор любого такта с помощью панели управления вверху, чтобы отточить сложный фрагмент перед исполнением всей пьесы.
    </div>

    <div class="rhythm-controls" style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
      <div class="rhythm-control-block">
        <small>Темп</small>
        <div class="rhythm-segment">
          {#each Object.entries(TEMPO_MODES) as [id, cfg]}
            <button
              type="button"
              class="rhythm-btn {settings.repertoireTempoMode === id ? 'active' : ''}"
              onclick={() => onSettingsChange?.({ repertoireTempoMode: id as any })}
            >
              {cfg.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="rhythm-control-block">
        <small>Отображение</small>
        <div class="rhythm-segment">
          <button
            type="button"
            class="rhythm-btn {settings.repertoireDisplayMode === 'keys' ? 'active' : ''}"
            onclick={() => onSettingsChange?.({ repertoireDisplayMode: 'keys' })}
          >
            Клавиши
          </button>
          <button
            type="button"
            class="rhythm-btn {settings.repertoireDisplayMode === 'staff' ? 'active' : ''}"
            onclick={() => onSettingsChange?.({ repertoireDisplayMode: 'staff' })}
          >
            Ноты
          </button>
        </div>
      </div>

      <div class="rhythm-control-block">
        <small>Динамика · MIDI</small>
        <div class="rhythm-segment">
          {#each Object.entries(DYNAMIC_MODES) as [id, cfg]}
            <button
              type="button"
              class="rhythm-btn {settings.repertoireDynamicsTarget === id ? 'active' : ''}"
              onclick={() => onSettingsChange?.({ repertoireDynamicsTarget: id as any })}
            >
              {cfg.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="rhythm-control-block">
        <small>Артикуляция · MIDI + Tempo</small>
        <div class="rhythm-segment">
          {#each Object.entries(ARTICULATION_MODES) as [id, cfg]}
            <button
              type="button"
              class="rhythm-btn {settings.repertoireArticulationTarget === id ? 'active' : ''}"
              onclick={() => onSettingsChange?.({ repertoireArticulationTarget: id as any })}
            >
              {cfg.label}
            </button>
          {/each}
        </div>
      </div>

      <button
        type="button"
        class="btn metronome-btn {settings.metronomeEnabled ? 'on' : ''}"
        onclick={() => onSettingsChange?.({ metronomeEnabled: !settings.metronomeEnabled })}
      >
        Метроном: {settings.metronomeEnabled ? 'вкл' : 'выкл'}
      </button>
    </div>
  </section>

  <section class="card">
    <h2>Ввод и Классика</h2>
    <div class="help">
      В репертуар добавлены классические шедевры: <strong>К Элизе</strong> (Бетховен), <strong>Менуэт G-dur</strong> (Бах), <strong>Арабеска</strong> (Бургмюллер), <strong>Маленькая ночная серенада</strong> (Моцарт).<br><br>
      В Tempo Mode перед стартом идёт визуальный отсчёт 4–3–2–1. Мышь проверяет pitch/timing, а для динамики и артикуляции подключите MIDI-клавиатуру.
    </div>
  </section>
</div>

<div class="repertoire-categories" style="display:flex; gap:8px; margin: 16px 0; flex-wrap:wrap;">
  <button
    type="button"
    class="btn {selectedCategory === 'all' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'all'; }}
  >
    Все произведения ({categoryCounts.all})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'classical' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'classical'; }}
  >
    Классика ({categoryCounts.classical})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'study' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'study'; }}
  >
    Этюды ({categoryCounts.study})
  </button>
  <button
    type="button"
    class="btn {selectedCategory === 'warmup' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'warmup'; }}
  >
    Разминка ({categoryCounts.warmup})
  </button>
</div>

<div class="repertoire-grid">
  {#each filteredRepertoire as song (song.id)}
    {@const measureCount = getSongMeasureCount(song)}
    {@const timeSig = song.timeSignature ? `${song.timeSignature[0]}/${song.timeSignature[1]}` : `${song.measureBeats}/4`}
    <article class="repertoire-card">
      <small>{song.level} · {song.source}</small>
      <h3>{song.title}</h3>
      <p>{song.description}</p>
      <div class="repertoire-meta">
        <span>Размер: {timeSig} · Тактов: {measureCount} · Ноты: {song.notes.length}</span>
      </div>
      <button
        type="button"
        class="btn primary"
        onclick={() => onStartSong?.(song.id)}
      >
        Играть
      </button>
    </article>
  {/each}
</div>
