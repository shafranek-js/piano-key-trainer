import { describe, it, expect } from 'vitest';
import { REPERTOIRE } from '../../src/core/repertoire/repertoireData';
import {
  computeCategoryCounts,
  filterAndSortRepertoire,
  formatComposerLine,
  formatMeasuresChip,
  formatNotesChip,
  formatTimeSignatureChip,
  getCardVariantState,
  getCategoryMeta,
  getSongDifficultyInfo,
  matchesRepertoireSearch
} from '../../src/ui/repertoire/repertoireLibraryUi';

describe('UI Milestone R1 — Repertoire Library UI Helpers', () => {
  it('computes accurate category counts across all 25 repertoire pieces', () => {
    const counts = computeCategoryCounts(REPERTOIRE);
    expect(counts.all).toBe(25);
    expect(counts.classical).toBe(13);
    expect(counts.melody).toBe(5);
    expect(counts.study).toBe(5);
    expect(counts.warmup).toBe(2);
    expect(counts.classical + counts.melody + counts.study + counts.warmup).toBe(counts.all);
  });

  it('filters repertoire by category accurately', () => {
    const all = filterAndSortRepertoire(REPERTOIRE, { category: 'all' });
    expect(all).toHaveLength(25);

    const classical = filterAndSortRepertoire(REPERTOIRE, { category: 'classical' });
    expect(classical).toHaveLength(13);
    expect(classical.every((s) => (s.category || 'classical') === 'classical')).toBe(true);

    const melody = filterAndSortRepertoire(REPERTOIRE, { category: 'melody' });
    expect(melody).toHaveLength(5);
    expect(melody.every((s) => s.category === 'melody')).toBe(true);

    const study = filterAndSortRepertoire(REPERTOIRE, { category: 'study' });
    expect(study).toHaveLength(5);
    expect(study.every((s) => s.category === 'study')).toBe(true);

    const warmup = filterAndSortRepertoire(REPERTOIRE, { category: 'warmup' });
    expect(warmup).toHaveLength(2);
    expect(warmup.every((s) => s.category === 'warmup')).toBe(true);
  });

  it('performs live search across title, composer/source, and category', () => {
    // Search by title
    const mozartResults = filterAndSortRepertoire(REPERTOIRE, {
      searchQuery: 'Nachtmusik'
    });
    expect(mozartResults.map((s) => s.id)).toEqual(['mozart-nachtmusik']);

    // Search by composer (case-insensitive)
    const beethovenResults = filterAndSortRepertoire(REPERTOIRE, {
      searchQuery: 'beethoven'
    });
    expect(beethovenResults.map((s) => s.id)).toEqual(['ode-joy', 'beethoven-fur-elise']);

    // Search by Russian composer name
    const tchaikovskyResults = filterAndSortRepertoire(REPERTOIRE, {
      searchQuery: 'Чайковский'
    });
    expect(tchaikovskyResults.map((s) => s.id)).toEqual(['tchaikovsky-swan-lake']);

    // Search by category label in Russian
    const studySearch = filterAndSortRepertoire(REPERTOIRE, {
      searchQuery: 'Этюды'
    });
    expect(studySearch.length).toBeGreaterThanOrEqual(5);

    // Search with no matches returns empty list
    const emptySearch = filterAndSortRepertoire(REPERTOIRE, {
      searchQuery: 'несуществующая-симфония-xyz'
    });
    expect(emptySearch).toEqual([]);
  });

  it('sorts repertoire by recommended, difficulty, title, and composer', () => {
    // 1. Recommended preserves original REPERTOIRE order
    const recommended = filterAndSortRepertoire(REPERTOIRE, { sortBy: 'recommended' });
    expect(recommended.map((s) => s.id)).toEqual(REPERTOIRE.map((s) => s.id));

    // 2. Difficulty sorts from easiest (five-note-c) to hardest
    const byDifficulty = filterAndSortRepertoire(REPERTOIRE, { sortBy: 'difficulty' });
    expect(byDifficulty[0].id).toBe('five-note-c');
    const ranks = byDifficulty.map((s) => getSongDifficultyInfo(s).rank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }

    // 3. Title sorts alphabetically using localeCompare
    const byTitle = filterAndSortRepertoire(REPERTOIRE, { sortBy: 'title' });
    for (let i = 1; i < byTitle.length; i++) {
      expect(
        byTitle[i - 1].title.localeCompare(byTitle[i].title, 'ru', { sensitivity: 'base' })
      ).toBeLessThanOrEqual(0);
    }

    // 4. Composer sorts alphabetically by clean composer key
    const byComposer = filterAndSortRepertoire(REPERTOIRE, { sortBy: 'composer' });
    expect(byComposer).toHaveLength(25);
  });

  it('computes variant-aware verification status and metadata for excerpt vs melodyArrangement', () => {
    // Piece where excerpt = verified AND melodyArrangement = unverified (Für Elise, Morning Mood, Hanon 1)
    for (const songId of ['beethoven-fur-elise', 'grieg-morning-mood', 'hanon-1']) {
      const song = REPERTOIRE.find((s) => s.id === songId)!;
      const excerptState = getCardVariantState(song, 'excerpt');
      const fullState = getCardVariantState(song, 'full');

      expect(excerptState.effectiveVariant).toBe('excerpt');
      expect(excerptState.isVerified).toBe(true);
      expect(excerptState.verificationStatus).toBe('verified');
      expect(excerptState.verificationLabel).toBe('Проверено');

      expect(fullState.effectiveVariant).toBe('full');
      expect(fullState.isVerified).toBe(false);
      expect(fullState.verificationStatus).toBe('unverified');
      expect(fullState.verificationLabel).toBe('Адаптация');

      expect(fullState.noteCount).toBeGreaterThan(excerptState.noteCount);
      expect(fullState.measureCount).toBeGreaterThanOrEqual(excerptState.measureCount);
    }

    // Piece where both excerpt and melodyArrangement are verified (Mozart K. 525)
    const mozart = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
    const mozartExcerpt = getCardVariantState(mozart, 'excerpt');
    const mozartFull = getCardVariantState(mozart, 'full');
    expect(mozartExcerpt.isVerified).toBe(true);
    expect(mozartFull.isVerified).toBe(true);
    expect(mozartExcerpt.measureCount).toBe(4);
    expect(mozartExcerpt.noteCount).toBe(18);
    expect(mozartFull.measureCount).toBe(10);
    expect(mozartFull.noteCount).toBe(57);
    expect(mozartFull.timeSignature).toBe('4/4');
  });

  it('formats clean composer lines without plate/publisher clutter while preserving provenance', () => {
    const tchaikovsky = REPERTOIRE.find((s) => s.id === 'tchaikovsky-swan-lake')!;
    const composer = formatComposerLine(tchaikovsky);
    expect(composer).toBe('П. И. Чайковский · Op. 20');
    expect(composer).not.toContain('Jurgenson');
    expect(composer).not.toContain('Plate 4432');
    expect(composer).not.toContain('Broude');

    // Full provenance remains available in card state
    const state = getCardVariantState(tchaikovsky, 'excerpt');
    expect(state.provenance.sourceEdition).toContain('Jurgenson');
    expect(state.provenance.rawSource).toContain('Plate 4432');

    const warmup = REPERTOIRE.find((s) => s.id === 'five-note-c')!;
    expect(formatComposerLine(warmup)).toBe('Piano Key Trainer');

    const mary = REPERTOIRE.find((s) => s.id === 'mary-lamb')!;
    expect(formatComposerLine(mary)).toBe('Traditional');

    const twinkle = REPERTOIRE.find((s) => s.id === 'twinkle')!;
    expect(formatComposerLine(twinkle)).toBe('Traditional · Ah! vous dirai-je, maman');
    expect(formatComposerLine(twinkle)).not.toContain('Mozart');
  });

  it('formats Russian pluralized metadata chips properly', () => {
    expect(formatMeasuresChip(1)).toBe('1 такт');
    expect(formatMeasuresChip(4)).toBe('4 такта');
    expect(formatMeasuresChip(10)).toBe('10 тактов');
    expect(formatMeasuresChip(21)).toBe('21 такт');

    expect(formatNotesChip(1)).toBe('1 нота');
    expect(formatNotesChip(22)).toBe('22 ноты');
    expect(formatNotesChip(57)).toBe('57 нот');

    expect(formatTimeSignatureChip({ timeSignature: [3, 8], measureBeats: 1.5 })).toBe('3/8');
    expect(getCategoryMeta('classical').label).toBe('Классика');
    expect(matchesRepertoireSearch(REPERTOIRE[0], '')).toBe(true);
  });

  it('includes persistent Repertoire Library UI state fields in DEFAULT_SETTINGS', async () => {
    const { DEFAULT_SETTINGS } = await import('../../src/core/fsrs/constants');
    expect(DEFAULT_SETTINGS.repertoireViewMode).toBe('grid');
    expect(DEFAULT_SETTINGS.repertoireSortBy).toBe('recommended');
    expect(DEFAULT_SETTINGS.repertoireCategoryFilter).toBe('all');
    expect(DEFAULT_SETTINGS.repertoireAdvancedOpen).toBe(false);
    expect(DEFAULT_SETTINGS.repertoireCardVariants).toEqual({});
  });
});
