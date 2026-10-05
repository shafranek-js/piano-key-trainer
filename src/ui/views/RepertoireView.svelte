<script lang="ts">
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    getSongVersion,
    type RepertoireLengthMode
  } from '../../core/repertoire/repertoireData';
  import { parseMusicXmlFileToSongDef } from '../../core/repertoire/musicXmlGenerator';
  import type { UserSettings } from '../../core/fsrs/types';
  import RepertoireToolbar from '../components/RepertoireToolbar.svelte';
  import RepertoireCard from '../components/RepertoireCard.svelte';
  import {
    computeCategoryCounts,
    filterAndSortRepertoire,
    type RepertoireCategoryFilter,
    type RepertoireSortMode,
    type RepertoireViewMode
  } from '../repertoire/repertoireLibraryUi';

  type StartSongOptions = { autoDemo?: boolean; lengthMode?: RepertoireLengthMode };

  let {
    settings = {} as UserSettings,
    onSettingsChange,
    onStartSong
  }: {
    settings?: UserSettings;
    onSettingsChange?: (patch: Partial<UserSettings>) => void;
    onStartSong?: (songId: string, options?: StartSongOptions) => void;
  } = $props();

  let searchQuery = $state('');
  let repertoireVersion = $state(0);
  let importStatusText = $state('');
  let importError = $state(false);
  let isImportOpen = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let localCategory = $state<RepertoireCategoryFilter | null>(null);
  let localSortBy = $state<RepertoireSortMode | null>(null);
  let localViewMode = $state<RepertoireViewMode | null>(null);
  let localAdvancedOpen = $state<boolean | null>(null);
  let localCardVariants = $state<Record<string, RepertoireLengthMode> | null>(null);

  const selectedCategory = $derived<RepertoireCategoryFilter>(
    settings.repertoireCategoryFilter ?? localCategory ?? 'all'
  );
  const sortBy = $derived<RepertoireSortMode>(
    settings.repertoireSortBy ?? localSortBy ?? 'recommended'
  );
  const viewMode = $derived<RepertoireViewMode>(
    settings.repertoireViewMode ?? localViewMode ?? 'grid'
  );
  const isAdvancedPracticeOpen = $derived<boolean>(
    settings.repertoireAdvancedOpen ?? localAdvancedOpen ?? false
  );
  const cardVariants = $derived<Record<string, RepertoireLengthMode>>(
    settings.repertoireCardVariants ?? localCardVariants ?? {}
  );
  const lengthMode = $derived<RepertoireLengthMode>(settings.repertoireLengthMode || 'excerpt');

  const allSongs = $derived.by(() => {
    void repertoireVersion;
    return [...REPERTOIRE];
  });

  const categoryCounts = $derived(computeCategoryCounts(allSongs));

  const displayedRepertoire = $derived(
    filterAndSortRepertoire(allSongs, {
      category: selectedCategory,
      searchQuery,
      sortBy
    })
  );

  const activeAdvancedCount = $derived(
    (settings.repertoireDynamicsTarget && settings.repertoireDynamicsTarget !== 'off' ? 1 : 0) +
      (settings.repertoireArticulationTarget && settings.repertoireArticulationTarget !== 'off' ? 1 : 0) +
      (settings.metronomeEnabled ? 1 : 0)
  );

  function setCategoryFilter(cat: RepertoireCategoryFilter) {
    localCategory = cat;
    onSettingsChange?.({ repertoireCategoryFilter: cat });
  }

  function setSortMode(nextSort: RepertoireSortMode) {
    localSortBy = nextSort;
    onSettingsChange?.({ repertoireSortBy: nextSort });
  }

  function setViewMode(nextMode: RepertoireViewMode) {
    localViewMode = nextMode;
    onSettingsChange?.({ repertoireViewMode: nextMode });
  }

  function toggleAdvancedPractice() {
    const next = !isAdvancedPracticeOpen;
    localAdvancedOpen = next;
    onSettingsChange?.({ repertoireAdvancedOpen: next });
  }

  function getEffectiveCardVariant(songId: string): RepertoireLengthMode {
    return cardVariants[songId] ?? lengthMode;
  }

  function handleCardVariantChange(songId: string, variant: RepertoireLengthMode) {
    const next = { ...cardVariants, [songId]: variant };
    localCardVariants = next;
    onSettingsChange?.({ repertoireCardVariants: next });
  }

  function handleGlobalVariantChange(variant: RepertoireLengthMode) {
    localCardVariants = {};
    onSettingsChange?.({ repertoireLengthMode: variant, repertoireCardVariants: {} });
  }

  function resetFilters() {
    searchQuery = '';
    localCategory = 'all';
    localSortBy = 'recommended';
    onSettingsChange?.({
      repertoireCategoryFilter: 'all',
      repertoireSortBy: 'recommended'
    });
  }

  async function handleImportMusicXml(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const importedSong = await parseMusicXmlFileToSongDef(file);
      (REPERTOIRE as any).unshift(importedSong);
      repertoireVersion++;
      setCategoryFilter('all');
      searchQuery = '';
      const fullCount = getSongVersion(importedSong, 'full').notes.length;
      importError = false;
      importStatusText = `✓ Импортировано: «${importedSong.title}» (${fullCount} нот)`;
    } catch (err) {
      console.error('MusicXML import error:', err);
      importError = true;
      importStatusText = 'Ошибка чтения файла MusicXML / MXL';
    } finally {
      input.value = '';
    }
  }
</script>

<div class="rep-page-shell">
  <!-- 1. Page Header + Compact Practice Panel + Import Trigger -->
  <header class="rep-header-banner">
    <div class="rep-header-top">
      <div class="rep-header-brand">
        <div class="rep-header-icon" aria-hidden="true">♫</div>
        <div class="rep-header-copy">
          <h2>Мелодии</h2>
          <p>Играйте знакомые произведения, этюды и учебные аранжировки.</p>
        </div>
      </div>

      <div class="rep-header-actions">
        <input
          bind:this={fileInputEl}
          type="file"
          accept=".musicxml,.xml,.mxl"
          style="display:none;"
          onchange={handleImportMusicXml}
        />

        <button
          type="button"
          class="rep-import-trigger {isImportOpen ? 'active' : ''}"
          data-import-trigger
          aria-expanded={isImportOpen}
          onclick={() => { isImportOpen = !isImportOpen; }}
          title="Импорт собственной партитуры MusicXML / MXL"
        >
          <span class="rep-import-book" aria-hidden="true">📖</span>
          <span class="rep-import-text">
            <strong>Импорт MusicXML</strong>
            <small>Добавьте свои произведения</small>
          </span>
          <span class="rep-import-upload" aria-hidden="true">↑</span>
        </button>
      </div>
    </div>

    {#if isImportOpen || importStatusText}
      <div class="rep-import-popover" role="region" aria-label="Импорт партитуры MusicXML / MXL">
        <div class="rep-import-popover-main">
          <div class="rep-import-popover-info">
            <strong>Импорт MusicXML / MXL</strong>
            <span>Поддерживаются файлы <code>.musicxml</code>, <code>.xml</code> и сжатые архивы <code>.mxl</code> с автоматической гравировкой в OSMD.</span>
          </div>
          <div class="rep-import-popover-btns">
            <button
              type="button"
              class="rep-play-btn rep-import-upload-btn"
              onclick={() => fileInputEl?.click()}
            >
              📂 Выбрать файл (.musicxml / .xml / .mxl)
            </button>
            {#if isImportOpen}
              <button
                type="button"
                class="rep-more-btn"
                aria-label="Скрыть панель импорта"
                onclick={() => { isImportOpen = false; }}
              >
                ✕
              </button>
            {/if}
          </div>
        </div>
        {#if importStatusText}
          <div class="rep-import-status {importError ? 'is-error' : 'is-ok'}">
            {importStatusText}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Compact Practice Settings Bar -->
    <div class="rep-practice-bar" role="region" aria-label="Параметры практики мелодий">
      <span class="rep-practice-label">Практика</span>

      <div class="rep-practice-group">
        <small>Вариант</small>
        <div class="rhythm-segment">
          <button
            type="button"
            class="rhythm-btn {lengthMode === 'excerpt' ? 'active' : ''}"
            onclick={() => handleGlobalVariantChange('excerpt')}
          >
            Отрывок
          </button>
          <button
            type="button"
            class="rhythm-btn {lengthMode === 'full' ? 'active' : ''}"
            onclick={() => handleGlobalVariantChange('full')}
          >
            Аранжировка
          </button>
        </div>
      </div>

      <div class="rep-practice-group">
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

      <div class="rep-practice-group">
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

      <button
        type="button"
        class="rep-advanced-toggle {isAdvancedPracticeOpen ? 'open' : ''} {activeAdvancedCount > 0 ? 'has-active' : ''}"
        aria-expanded={isAdvancedPracticeOpen}
        onclick={toggleAdvancedPractice}
      >
        <span>Дополнительно</span>
        {#if activeAdvancedCount > 0}
          <span class="rep-adv-count">{activeAdvancedCount}</span>
        {/if}
        <span class="rep-adv-chevron" aria-hidden="true">{isAdvancedPracticeOpen ? '▴' : '▾'}</span>
      </button>
    </div>

    {#if isAdvancedPracticeOpen}
      <div class="rep-practice-advanced" role="region" aria-label="Дополнительные настройки выразительности и метронома">
        <div class="rep-practice-group">
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

        <div class="rep-practice-group">
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

        <span class="rep-osmd-note">
          Партитуры гравируются движком OpenSheetMusicDisplay (OSMD) с плавной прокруткой за курсором. Pitch, timing, динамика и артикуляция оцениваются раздельно.
        </span>
      </div>
    {/if}
  </header>

  <!-- 2. Library Toolbar -->
  <RepertoireToolbar
    {selectedCategory}
    {categoryCounts}
    {searchQuery}
    {sortBy}
    {viewMode}
    onCategoryChange={setCategoryFilter}
    onSearchChange={(q) => { searchQuery = q; }}
    onSortChange={setSortMode}
    onViewModeChange={setViewMode}
  />

  <!-- 3. Repertoire Library Grid / Compact List -->
  {#if displayedRepertoire.length === 0}
    <div class="rep-empty-state" role="status">
      <div class="rep-empty-icon" aria-hidden="true">🎼</div>
      <h3>Ничего не найдено</h3>
      <p>Попробуйте изменить поиск или фильтр.</p>
      <button
        type="button"
        class="rep-play-btn rep-reset-btn"
        onclick={resetFilters}
      >
        Сбросить фильтры
      </button>
    </div>
  {:else}
    <div
      class="rep-library-grid {viewMode === 'compact' ? 'is-compact-list' : 'is-card-grid'}"
      data-view-mode={viewMode}
    >
      {#each displayedRepertoire as song (song.id)}
        <RepertoireCard
          {song}
          selectedVariant={getEffectiveCardVariant(song.id)}
          {viewMode}
          onSelectVariant={(variant) => handleCardVariantChange(song.id, variant)}
          onPlay={(songId, variant) => onStartSong?.(songId, { lengthMode: variant })}
          onDemo={(songId, variant) => onStartSong?.(songId, { autoDemo: true, lengthMode: variant })}
        />
      {/each}
    </div>
  {/if}
</div>
