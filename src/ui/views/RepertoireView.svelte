<script lang="ts">
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    type SongDef
  } from '../../core/repertoire/repertoireData';
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    settings = {} as UserSettings,
    onSettingsChange,
    onStartSong
  } = $props();
</script>

<div class="page-heading">
  <div>
    <h2>Мелодии</h2>
    <p>Играйте по названиям клавиш или непосредственно по нотному стану. Точность нот (Pitch), ритм (Timing), динамика и артикуляция оцениваются независимо.</p>
  </div>
</div>

<div class="repertoire-intro">
  <section class="card">
    <h2>Музыкальная выразительность <span class="pill">v6.1</span></h2>
    <div class="help">
      <strong>Pitch</strong>, <strong>timing</strong>, <strong>динамика</strong> и <strong>артикуляция</strong> оцениваются раздельно. Для p/mf/f используется MIDI velocity; для legato/detached — длительность удержания клавиши относительно ноты в Slow/Normal. Ни одна из этих метрик не изменяет FSRS.
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
    <h2>Ввод</h2>
    <div class="help">
      <strong>MIDI</strong> — предпочтительный вариант. Без MIDI кликайте по точной клавише экранного пианино.<br><br>
      В Tempo Mode перед стартом идёт визуальный отсчёт 4–3–2–1. Мышь продолжает проверять pitch/timing, но для динамики и артикуляции требуется MIDI-клавиатура.
    </div>
  </section>
</div>

<div class="repertoire-grid">
  {#each REPERTOIRE as song (song.id)}
    <article class="repertoire-card">
      <small>{song.level} · {song.source}</small>
      <h3>{song.title}</h3>
      <p>{song.description}</p>
      <div class="repertoire-meta">
        <span>Такты: {song.measureBeats}/4 · Фразы: {song.phraseBars}</span>
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
