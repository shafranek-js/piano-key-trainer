<script lang="ts">
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    getSongMeasureCount,
    type SongDef
  } from '../../core/repertoire/repertoireData';
  import { parseMusicXmlToSongDef } from '../../core/repertoire/musicXmlGenerator';
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    settings = {} as UserSettings,
    onSettingsChange,
    onStartSong
  } = $props();

  let selectedCategory = $state<'all' | 'classical' | 'melody' | 'study' | 'warmup'>('all');
  let repertoireVersion = $state(0);
  let importStatusText = $state('');
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const allSongs = $derived.by(() => {
    void repertoireVersion;
    return [...REPERTOIRE];
  });

  const filteredRepertoire = $derived(
    selectedCategory === 'all'
      ? allSongs
      : allSongs.filter(s => (s.category || 'classical') === selectedCategory)
  );

  const categoryCounts = $derived({
    all: allSongs.length,
    classical: allSongs.filter(s => (s.category || 'classical') === 'classical').length,
    melody: allSongs.filter(s => s.category === 'melody').length,
    study: allSongs.filter(s => s.category === 'study').length,
    warmup: allSongs.filter(s => s.category === 'warmup').length
  });

  async function handleImportMusicXml(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const xmlText = await file.text();
      const importedSong = parseMusicXmlToSongDef(xmlText, file.name);
      REPERTOIRE.unshift(importedSong);
      repertoireVersion++;
      selectedCategory = 'all';
      importStatusText = `✓ Импортировано: «${importedSong.title}» (${importedSong.notes.length} нот)`;
    } catch (err) {
      console.error('MusicXML import error:', err);
      importStatusText = 'Ошибка чтения файла MusicXML';
    } finally {
      input.value = '';
    }
  }
</script>

<div class="page-heading">
  <div>
    <h2>Мелодии и Шедевры</h2>
    <p>Партитуры гравируются движком <strong>OpenSheetMusicDisplay (OSMD)</strong>. Поддерживается зацикливание тактов (Measure Looping), автопроигрывание (Демо) и импорт собственных <code>.musicxml</code> файлов.</p>
  </div>
</div>

<div class="repertoire-intro">
  <section class="card">
    <h2>Музыкальная выразительность и Отработка <span class="pill">OSMD · v6.3</span></h2>
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
            Ноты (OSMD)
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
    <h2>Библиотека MelodicaTrainer & Импорт MusicXML</h2>
    <div class="help">
      Коллекция пополнена лучшими произведениями из <strong>MuseTrainer</strong>, <strong>PDMX (CC0)</strong> и <strong>OpenScore Lieder</strong>: <em>Gymnopédie No. 1</em> (Сати), <em>Canon in D</em> (Пахельбель), <em>Лебединое озеро</em> (Чайковский), <em>Утро</em> (Григ), <em>Весна</em> (Вивальди), <em>Largo</em> (Дворжак), <em>Коробейники</em>, <em>Щедрик</em>, <em>Greensleeves</em>, <em>Sakura</em> и <em>The Entertainer</em>.<br><br>
      Вы также можете загрузить любой собственный файл <code>.musicxml</code> или <code>.xml</code>:
    </div>
    <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <input
        bind:this={fileInputEl}
        type="file"
        accept=".musicxml,.xml"
        style="display:none;"
        onchange={handleImportMusicXml}
      />
      <button
        type="button"
        class="btn primary"
        style="font-size:13px; padding:7px 14px;"
        onclick={() => fileInputEl?.click()}
      >
        📂 Загрузить MusicXML (.musicxml / .xml)
      </button>
      {#if importStatusText}
        <span style="font-size:12px; color:#6ee7a5; font-weight:600;">{importStatusText}</span>
      {/if}
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
    class="btn {selectedCategory === 'melody' ? 'primary' : ''}"
    style="font-size:13px; padding:6px 14px;"
    onclick={() => { selectedCategory = 'melody'; }}
  >
    Мелодии и Фолк ({categoryCounts.melody})
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
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button
          type="button"
          class="btn primary"
          style="flex:1;"
          onclick={() => onStartSong?.(song.id)}
        >
          Играть
        </button>
        <button
          type="button"
          class="btn"
          style="flex:1; border-color:rgba(56,189,248,0.4); color:#38bdf8; font-weight:600;"
          onclick={() => onStartSong?.(song.id, { autoDemo: true })}
          title="Послушать автопроигрывание мелодии с подсветкой нот на стане и клавиатуре"
        >
          ▶ Демо
        </button>
      </div>
    </article>
  {/each}
</div>
