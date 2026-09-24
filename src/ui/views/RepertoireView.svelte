<script lang="ts">
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    getSongMeasureCount,
    hasFullVersion,
    getSongVersion,
    type RepertoireLengthMode
  } from '../../core/repertoire/repertoireData';
  import { parseMusicXmlFileToSongDef } from '../../core/repertoire/musicXmlGenerator';
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

  const lengthMode = $derived<RepertoireLengthMode>(settings.repertoireLengthMode || 'excerpt');

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
      const importedSong = await parseMusicXmlFileToSongDef(file);
      (REPERTOIRE as any).unshift(importedSong);
      repertoireVersion++;
      selectedCategory = 'all';
      const fullCount = getSongVersion(importedSong, 'full').notes.length;
      importStatusText = `✓ Импортировано: «${importedSong.title}» (${fullCount} нот)`;
    } catch (err) {
      console.error('MusicXML import error:', err);
      importStatusText = 'Ошибка чтения файла MusicXML / MXL';
    } finally {
      input.value = '';
    }
  }
</script>

<div class="page-heading">
  <div>
    <h2>Мелодии и Шедевры</h2>
    <p>Партитуры гравируются в одну непрерывную линию движком <strong>OpenSheetMusicDisplay (OSMD)</strong> с плавным сдвигом и центрированным курсором. Доступны как короткие отрывки, так и полные версии произведений.</p>
  </div>
</div>

<div class="repertoire-intro">
  <section class="card">
    <h2>Музыкальная выразительность и Отработка <span class="pill">OSMD · v6.4</span></h2>
    <div class="help">
      <strong>Pitch</strong>, <strong>timing</strong>, <strong>динамика</strong> и <strong>артикуляция</strong> оцениваются раздельно.<br>
      🎼 <strong>Отрывок или Полная мелодия:</strong> тренируйте короткую тему (4–8 тактов) или играйте произведение целиком — нотный стан автоматически плавно прокручивается за курсором в центре.
    </div>

    <div class="rhythm-controls" style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
      <div class="rhythm-control-block">
        <small>Объём пьесы</small>
        <div class="rhythm-segment">
          <button
            type="button"
            class="rhythm-btn {lengthMode === 'excerpt' ? 'active' : ''}"
            onclick={() => onSettingsChange?.({ repertoireLengthMode: 'excerpt' })}
          >
            Отрывок (тема)
          </button>
          <button
            type="button"
            class="rhythm-btn {lengthMode === 'full' ? 'active' : ''}"
            onclick={() => onSettingsChange?.({ repertoireLengthMode: 'full' })}
          >
            Полная мелодия
          </button>
        </div>
      </div>

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
    <h2>Библиотека MelodicaTrainer & Импорт MusicXML / MXL</h2>
    <div class="help">
      Все 25 произведений включают как короткий отрывок (главную тему), так и <strong>полную версию</strong> из архивов <strong>MuseTrainer</strong>, <strong>PDMX (CC0)</strong> и <strong>OpenScore Lieder</strong>.<br><br>
      Вы также можете загрузить любой собственный файл <code>.musicxml</code>, <code>.xml</code> или сжатый архив <code>.mxl</code>:
    </div>
    <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <input
        bind:this={fileInputEl}
        type="file"
        accept=".musicxml,.xml,.mxl"
        style="display:none;"
        onchange={handleImportMusicXml}
      />
      <button
        type="button"
        class="btn primary"
        style="font-size:13px; padding:7px 14px;"
        onclick={() => fileInputEl?.click()}
      >
        📂 Загрузить партитуру (.musicxml / .xml / .mxl)
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
    {@const activeSong = getSongVersion(song, lengthMode)}
    {@const fullSong = getSongVersion(song, 'full')}
    {@const hasFull = hasFullVersion(song)}
    {@const measureCount = getSongMeasureCount(activeSong)}
    {@const fullMeasureCount = getSongMeasureCount(fullSong)}
    {@const excerptMeasureCount = getSongMeasureCount(song)}
    {@const timeSig = song.timeSignature ? `${song.timeSignature[0]}/${song.timeSignature[1]}` : `${song.measureBeats}/4`}
    <article class="repertoire-card">
      <small>{song.level} · {song.source}</small>
      <h3>{song.title}</h3>
      <p>{song.description}</p>
      <div class="repertoire-meta" style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
        <span>Размер: {timeSig} · Тактов: {measureCount} · Ноты: {activeSong.notes.length}</span>
        {#if hasFull}
          <span style="font-size:10.5px; color:#7dd3fc;">
            Отрывок: {excerptMeasureCount} т. ({song.notes.length} н.) · Полная: {fullMeasureCount} т. ({fullSong.notes.length} н.)
          </span>
        {/if}
      </div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button
          type="button"
          class="btn primary"
          style="flex:1.2;"
          onclick={() => onStartSong?.(song.id, { lengthMode })}
        >
          {lengthMode === 'full' ? 'Играть полную' : 'Играть отрывок'}
        </button>
        {#if hasFull}
          <button
            type="button"
            class="btn"
            style="flex:1; font-size:12px;"
            onclick={() => onStartSong?.(song.id, { lengthMode: lengthMode === 'full' ? 'excerpt' : 'full' })}
            title={lengthMode === 'full' ? 'Сыграть короткий отрывок (тему)' : 'Сыграть полную версию произведения'}
          >
            {lengthMode === 'full' ? `Отрывок (${song.notes.length} н.)` : `Полная (${fullSong.notes.length} н.)`}
          </button>
        {/if}
        <button
          type="button"
          class="btn"
          style="flex:0.8; border-color:rgba(56,189,248,0.4); color:#38bdf8; font-weight:600;"
          onclick={() => onStartSong?.(song.id, { autoDemo: true, lengthMode })}
          title="Послушать автопроигрывание мелодии с подсветкой нот на стане и клавиатуре"
        >
          ▶ Демо
        </button>
      </div>
    </article>
  {/each}
</div>

