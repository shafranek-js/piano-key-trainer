<script lang="ts">
  import type { RepertoireLengthMode, SongDef } from '../../core/repertoire/repertoireData';
  import {
    formatComposerLine,
    formatMeasuresChip,
    formatNotesChip,
    getCardVariantState,
    getCategoryMeta,
    getSongDifficultyInfo,
    type RepertoireViewMode
  } from '../repertoire/repertoireLibraryUi';

  let {
    song,
    selectedVariant = 'excerpt' as RepertoireLengthMode,
    viewMode = 'grid' as RepertoireViewMode,
    onSelectVariant,
    onPlay,
    onDemo
  }: {
    song: SongDef;
    selectedVariant: RepertoireLengthMode;
    viewMode?: RepertoireViewMode;
    onSelectVariant: (variant: RepertoireLengthMode) => void;
    onPlay: (songId: string, variant: RepertoireLengthMode) => void;
    onDemo: (songId: string, variant: RepertoireLengthMode) => void;
  } = $props();

  let showProvenance = $state(false);

  const categoryMeta = $derived(getCategoryMeta(song.category));
  const composerLine = $derived(formatComposerLine(song));
  const difficulty = $derived(getSongDifficultyInfo(song));
  const cardState = $derived(getCardVariantState(song, selectedVariant));
</script>

<article
  class="rep-lib-card category-{categoryMeta.id} {viewMode === 'compact' ? 'is-compact' : 'is-grid'} {showProvenance ? 'has-provenance-open' : ''}"
  data-song-id={song.id}
  data-category={categoryMeta.id}
  data-variant={cardState.effectiveVariant}
  data-verified={cardState.isVerified ? 'true' : 'false'}
>
  {#if viewMode === 'compact'}
    <!-- COMPACT / LIST ROW LAYOUT -->
    <div class="rep-compact-row">
      <div class="rep-compact-cat">
        <span class="rep-category-tag accent-{categoryMeta.id}">
          <span class="rep-cat-icon" aria-hidden="true">{categoryMeta.icon}</span>
          <span>{categoryMeta.shortLabel}</span>
        </span>
      </div>

      <div class="rep-card-identity">
        <h3 class="rep-card-title" title={song.title}>{song.title}</h3>
        <div class="rep-card-composer" title={song.source}>{composerLine}</div>
      </div>

      <p class="rep-card-desc" title={song.description}>{song.description}</p>

      <div class="rep-card-chips" aria-label="Параметры произведения">
        <span class="rep-meta-chip" title="Музыкальный размер">
          <span class="rep-chip-icon" aria-hidden="true">🎵</span>
          <span>{cardState.timeSignature}</span>
        </span>
        <span class="rep-meta-chip" title="Количество тактов в выбранном варианте">
          <span class="rep-chip-icon" aria-hidden="true">🎼</span>
          <span>{formatMeasuresChip(cardState.measureCount)}</span>
        </span>
        <span class="rep-meta-chip" title="Количество нот в выбранном варианте">
          <span class="rep-chip-icon" aria-hidden="true">♪</span>
          <span>{formatNotesChip(cardState.noteCount)}</span>
        </span>
      </div>

      <div class="rep-compact-badges">
        <span
          class="rep-difficulty-badge tier-{difficulty.tier}"
          title="Категория сложности: {difficulty.originalLevel}"
        >
          {difficulty.label}
        </span>

        {#if cardState.isVerified}
          <span
            class="rep-verify-badge verified"
            data-verification-status="verified"
            title="{cardState.provenance.sourceTitle}{cardState.provenance.sourceMeasures ? ` (${cardState.provenance.sourceMeasures})` : ''}"
          >
            <span class="rep-verify-check" aria-hidden="true">✓</span> Проверено
          </span>
        {:else}
          <span
            class="rep-verify-badge unverified"
            data-verification-status={cardState.verificationStatus}
            title="Учебная редакция ({cardState.provenance.sourceTitle})"
          >
            Адаптация
          </span>
        {/if}
      </div>

      <div class="rep-card-actions">
        {#if cardState.hasFull}
          <div class="rep-variant-segment" role="group" aria-label="Выбор варианта: {song.title}">
            <button
              type="button"
              class="rep-variant-btn {cardState.effectiveVariant === 'excerpt' ? 'active' : ''}"
              aria-pressed={cardState.effectiveVariant === 'excerpt'}
              data-variant-btn="excerpt"
              onclick={() => onSelectVariant('excerpt')}
              title="Короткий учебный отрывок ({formatMeasuresChip(cardState.excerptMeasureCount)}, {formatNotesChip(cardState.excerptNoteCount)})"
            >
              Отрывок
            </button>
            <button
              type="button"
              class="rep-variant-btn {cardState.effectiveVariant === 'full' ? 'active' : ''}"
              aria-pressed={cardState.effectiveVariant === 'full'}
              data-variant-btn="full"
              onclick={() => onSelectVariant('full')}
              title="Мелодическая аранжировка ({formatMeasuresChip(cardState.fullMeasureCount)}, {formatNotesChip(cardState.fullNoteCount)})"
            >
              Аранжировка
            </button>
          </div>
        {/if}

        <button
          type="button"
          class="rep-play-btn"
          onclick={() => onPlay(song.id, cardState.effectiveVariant)}
          title="Играть ({cardState.effectiveVariant === 'full' ? 'Аранжировка' : 'Отрывок'})"
        >
          <span class="rep-play-icon" aria-hidden="true">▶</span>
          <span>Играть</span>
        </button>

        <button
          type="button"
          class="rep-demo-btn"
          onclick={() => onDemo(song.id, cardState.effectiveVariant)}
          aria-label="Демо: {song.title} ({cardState.effectiveVariant === 'full' ? 'Аранжировка' : 'Отрывок'})"
          title="Прослушать демо выбранного варианта"
        >
          <span class="rep-demo-icon" aria-hidden="true">▶</span>
          <span>Демо</span>
        </button>

        <button
          type="button"
          class="rep-more-btn {showProvenance ? 'active' : ''}"
          aria-label="Источник и сведения о редакции: {song.title}"
          aria-expanded={showProvenance}
          title="Показать источник и редакцию партитуры"
          onclick={() => { showProvenance = !showProvenance; }}
        >
          ⋯
        </button>
      </div>
    </div>
  {:else}
    <!-- GRID CARD LAYOUT -->
    <div class="rep-card-top">
      <span class="rep-category-tag accent-{categoryMeta.id}">
        <span class="rep-cat-icon" aria-hidden="true">{categoryMeta.icon}</span>
        <span>{categoryMeta.shortLabel}</span>
      </span>

      <span
        class="rep-difficulty-badge tier-{difficulty.tier}"
        title="Категория сложности: {difficulty.originalLevel}"
      >
        {difficulty.label}
      </span>
    </div>

    <!-- Level A: Identity -->
    <div class="rep-card-identity">
      <h3 class="rep-card-title" title={song.title}>{song.title}</h3>
      <div class="rep-card-subrow">
        <span class="rep-card-composer" title={song.source}>{composerLine}</span>

        {#if cardState.isVerified}
          <span
            class="rep-verify-badge verified"
            data-verification-status="verified"
            title="{cardState.provenance.sourceTitle}{cardState.provenance.sourceMeasures ? ` (${cardState.provenance.sourceMeasures})` : ''}"
          >
            <span class="rep-verify-check" aria-hidden="true">✓</span> Проверено
          </span>
        {:else}
          <span
            class="rep-verify-badge unverified"
            data-verification-status={cardState.verificationStatus}
            title="Учебная редакция ({cardState.provenance.sourceTitle})"
          >
            Адаптация
          </span>
        {/if}
      </div>
    </div>

    <!-- Level B: Meaning -->
    <p class="rep-card-desc" title={song.description}>{song.description}</p>

    <!-- Level C: Metadata -->
    <div class="rep-card-chips" aria-label="Параметры произведения">
      <span class="rep-meta-chip" title="Музыкальный размер">
        <span class="rep-chip-icon" aria-hidden="true">🎵</span>
        <span>{cardState.timeSignature}</span>
      </span>
      <span class="rep-meta-chip" title="Количество тактов в выбранном варианте">
        <span class="rep-chip-icon" aria-hidden="true">🎼</span>
        <span>{formatMeasuresChip(cardState.measureCount)}</span>
      </span>
      <span class="rep-meta-chip" title="Количество нот в выбранном варианте">
        <span class="rep-chip-icon" aria-hidden="true">♪</span>
        <span>{formatNotesChip(cardState.noteCount)}</span>
      </span>
    </div>

    <!-- Level D: Actions & Variant Selector -->
    <div class="rep-card-actions">
      <button
        type="button"
        class="rep-play-btn"
        onclick={() => onPlay(song.id, cardState.effectiveVariant)}
        title="Играть ({cardState.effectiveVariant === 'full' ? 'Аранжировка' : 'Отрывок'})"
      >
        <span class="rep-play-icon" aria-hidden="true">▶</span>
        <span>Играть</span>
      </button>

      {#if cardState.hasFull}
        <div class="rep-variant-segment" role="group" aria-label="Выбор варианта: {song.title}">
          <button
            type="button"
            class="rep-variant-btn {cardState.effectiveVariant === 'excerpt' ? 'active' : ''}"
            aria-pressed={cardState.effectiveVariant === 'excerpt'}
            data-variant-btn="excerpt"
            onclick={() => onSelectVariant('excerpt')}
            title="Короткий учебный отрывок ({formatMeasuresChip(cardState.excerptMeasureCount)}, {formatNotesChip(cardState.excerptNoteCount)})"
          >
            Отрывок
          </button>
          <button
            type="button"
            class="rep-variant-btn {cardState.effectiveVariant === 'full' ? 'active' : ''}"
            aria-pressed={cardState.effectiveVariant === 'full'}
            data-variant-btn="full"
            onclick={() => onSelectVariant('full')}
            title="Мелодическая аранжировка ({formatMeasuresChip(cardState.fullMeasureCount)}, {formatNotesChip(cardState.fullNoteCount)})"
          >
            Аранжировка
          </button>
        </div>
      {/if}

      <button
        type="button"
        class="rep-demo-btn"
        onclick={() => onDemo(song.id, cardState.effectiveVariant)}
        aria-label="Демо: {song.title} ({cardState.effectiveVariant === 'full' ? 'Аранжировка' : 'Отрывок'})"
        title="Прослушать демо выбранного варианта"
      >
        <span class="rep-demo-icon" aria-hidden="true">▶</span>
        <span>Демо</span>
      </button>

      <button
        type="button"
        class="rep-more-btn {showProvenance ? 'active' : ''}"
        aria-label="Источник и сведения о редакции: {song.title}"
        aria-expanded={showProvenance}
        title="Показать источник и редакцию партитуры"
        onclick={() => { showProvenance = !showProvenance; }}
      >
        ⋯
      </button>
    </div>
  {/if}

  {#if showProvenance}
    <div class="rep-provenance-drawer" role="region" aria-label="Источник и редакция">
      <div class="rep-provenance-head">
        <strong>Источник ({cardState.effectiveVariant === 'full' ? 'Аранжировка' : 'Отрывок'})</strong>
        <button
          type="button"
          class="rep-provenance-close"
          aria-label="Закрыть сведения об источнике"
          onclick={() => { showProvenance = false; }}
        >
          ✕
        </button>
      </div>
      <div class="rep-provenance-row">
        <span class="rep-prov-label">Произведение:</span>
        <span>{cardState.provenance.sourceTitle}</span>
      </div>
      {#if cardState.provenance.sourceMeasures}
        <div class="rep-provenance-row">
          <span class="rep-prov-label">Такты:</span>
          <span>{cardState.provenance.sourceMeasures}</span>
        </div>
      {/if}
      {#if cardState.provenance.sourceEdition}
        <div class="rep-provenance-row">
          <span class="rep-prov-label">Издание:</span>
          <span>{cardState.provenance.sourceEdition}</span>
        </div>
      {/if}
      {#if cardState.provenance.sourcePart}
        <div class="rep-provenance-row">
          <span class="rep-prov-label">Партия:</span>
          <span>{cardState.provenance.sourcePart}</span>
        </div>
      {/if}
      <div class="rep-provenance-row">
        <span class="rep-prov-label">Атрибуция:</span>
        <span>{cardState.provenance.rawSource}</span>
      </div>
      {#if cardState.provenance.sourceUrl}
        <div class="rep-provenance-row">
          <a
            href={cardState.provenance.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="rep-prov-link"
          >
            Открыть эталонную партитуру ↗
          </a>
        </div>
      {/if}
    </div>
  {/if}
</article>
