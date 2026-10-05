import {
  getSongMeasureCount,
  getSongVerification,
  getSongVersion,
  hasFullVersion,
  type RepertoireLengthMode,
  type RepertoireVerificationRecord,
  type RepertoireVerificationStatus,
  type SongDef
} from '../../core/repertoire/repertoireData';

export type RepertoireCategoryFilter = 'all' | 'classical' | 'melody' | 'study' | 'warmup';
export type RepertoireSortMode = 'recommended' | 'difficulty' | 'title' | 'composer';
export type RepertoireViewMode = 'grid' | 'compact';
export type RepertoireDifficultyTier = 'very-easy' | 'easy' | 'medium';

export interface RepertoireCategoryMeta {
  id: Exclude<RepertoireCategoryFilter, 'all'>;
  label: string;
  shortLabel: string;
  icon: string;
}

export interface RepertoireDifficultyInfo {
  tier: RepertoireDifficultyTier;
  label: 'Очень легко' | 'Легко' | 'Средне';
  rank: number;
  originalLevel: string;
}

export interface RepertoireProvenanceSummary {
  sourceTitle: string;
  sourceEdition?: string;
  sourceMovement?: string;
  sourcePart?: string;
  sourceMeasures?: string;
  sourceUrl?: string;
  notes?: string;
  verifiedAt?: string;
  rawSource: string;
}

export interface RepertoireCardVariantState {
  effectiveVariant: RepertoireLengthMode;
  activeSong: SongDef;
  verification: RepertoireVerificationRecord;
  verificationStatus: RepertoireVerificationStatus;
  verificationLabel: 'Проверено' | 'Адаптация';
  isVerified: boolean;
  measureCount: number;
  noteCount: number;
  timeSignature: string;
  hasFull: boolean;
  excerptMeasureCount: number;
  excerptNoteCount: number;
  fullMeasureCount: number;
  fullNoteCount: number;
  provenance: RepertoireProvenanceSummary;
}

const CATEGORY_META_MAP: Record<Exclude<RepertoireCategoryFilter, 'all'>, RepertoireCategoryMeta> = {
  classical: {
    id: 'classical',
    label: 'Классика',
    shortLabel: 'Классика',
    icon: '🏛'
  },
  melody: {
    id: 'melody',
    label: 'Мелодии и фолк',
    shortLabel: 'Мелодии и фолк',
    icon: '🎵'
  },
  study: {
    id: 'study',
    label: 'Этюды',
    shortLabel: 'Этюды',
    icon: '🎼'
  },
  warmup: {
    id: 'warmup',
    label: 'Разминка',
    shortLabel: 'Разминка',
    icon: '🎹'
  }
};

const COMPOSER_DISPLAY_BY_ID: Record<string, string> = {
  'five-note-c': 'Piano Key Trainer',
  'ode-joy': 'L. van Beethoven · Op. 125',
  'mary-lamb': 'Traditional',
  'twinkle': 'Traditional · Ah! vous dirai-je, maman',
  'bach-minuet-g': 'C. Petzold (attr. J. S. Bach) · BWV Anh. 114',
  'beethoven-fur-elise': 'L. van Beethoven · WoO 59',
  'burgmuller-arabesque': 'F. Burgmüller · Op. 100',
  'mozart-nachtmusik': 'W. A. Mozart · K. 525',
  'hanon-1': 'C. L. Hanon · Part I, No. 1',
  'czerny-599-1': 'C. Czerny · Op. 599',
  'beyer-101-8': 'F. Beyer · Op. 101',
  'satie-gymnopedie-1': 'Erik Satie · Trois Gymnopédies',
  'pachelbel-canon-d': 'Johann Pachelbel · P. 37',
  'tchaikovsky-swan-lake': 'П. И. Чайковский · Op. 20',
  'grieg-morning-mood': 'Edvard Grieg · Op. 46 No. 1',
  'vivaldi-spring': 'Antonio Vivaldi · RV 269',
  'dvorak-new-world-largo': 'Antonín Dvořák · Op. 95',
  'brahms-wiegenlied': 'Johannes Brahms · Op. 49 No. 4',
  'korobeiniki-tetris': 'Русская народная',
  'leontovych-shchedryk': 'Н. Д. Леонтович',
  'greensleeves': 'Английская баллада XVI в.',
  'bella-ciao': 'Итальянская народная',
  'sakura-traditional': 'Японская традиционная',
  'kocka-leze-dirou': 'Чешская народная',
  'joplin-entertainer': 'Scott Joplin'
};

const DIFFICULTY_BY_ID: Record<string, { tier: RepertoireDifficultyTier; rank: number }> = {
  'five-note-c': { tier: 'very-easy', rank: 1 },
  'mary-lamb': { tier: 'very-easy', rank: 2 },
  'czerny-599-1': { tier: 'very-easy', rank: 3 },
  'beyer-101-8': { tier: 'very-easy', rank: 4 },
  'twinkle': { tier: 'very-easy', rank: 5 },
  'ode-joy': { tier: 'easy', rank: 6 },
  'hanon-1': { tier: 'easy', rank: 7 },
  'kocka-leze-dirou': { tier: 'easy', rank: 8 },
  'sakura-traditional': { tier: 'easy', rank: 9 },
  'pachelbel-canon-d': { tier: 'easy', rank: 10 },
  'brahms-wiegenlied': { tier: 'easy', rank: 11 },
  'leontovych-shchedryk': { tier: 'easy', rank: 12 },
  'greensleeves': { tier: 'easy', rank: 13 },
  'bella-ciao': { tier: 'easy', rank: 14 },
  'satie-gymnopedie-1': { tier: 'medium', rank: 15 },
  'dvorak-new-world-largo': { tier: 'medium', rank: 16 },
  'tchaikovsky-swan-lake': { tier: 'medium', rank: 17 },
  'korobeiniki-tetris': { tier: 'medium', rank: 18 },
  'mozart-nachtmusik': { tier: 'medium', rank: 19 },
  'grieg-morning-mood': { tier: 'medium', rank: 20 },
  'vivaldi-spring': { tier: 'medium', rank: 21 },
  'bach-minuet-g': { tier: 'medium', rank: 22 },
  'beethoven-fur-elise': { tier: 'medium', rank: 23 },
  'burgmuller-arabesque': { tier: 'medium', rank: 24 },
  'joplin-entertainer': { tier: 'medium', rank: 25 }
};

export function getCategoryMeta(category?: SongDef['category']): RepertoireCategoryMeta {
  const normalized = category || 'classical';
  return CATEGORY_META_MAP[normalized] || CATEGORY_META_MAP.classical;
}

/**
 * Formats a concise, human-friendly composer/origin line for a repertoire card,
 * stripping noisy audit/edition/plate metadata while keeping full data intact.
 */
export function formatComposerLine(song: Pick<SongDef, 'id' | 'source'>): string {
  if (COMPOSER_DISPLAY_BY_ID[song.id]) {
    return COMPOSER_DISPLAY_BY_ID[song.id];
  }

  const raw = (song.source || '').trim();
  if (!raw || raw.toLowerCase() === 'разминка') {
    return 'Piano Key Trainer';
  }

  // Strip parenthetical edition/publisher/dataset provenance notes
  const cleaned = raw
    .replace(
      /\s*\((?:[^)]*(?:PDMX|CC0|MuseTrainer|MelodicaTrainer|Mutopia|Jurgenson|Simrock|Le Cène|Plate|Broude|IMSLP|public domain|repr\.)[^)]*)\)/gi,
      ''
    )
    .replace(/\s*·\s*public domain/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const segments = cleaned
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return 'Piano Key Trainer';
  }
  if (segments.length === 1) {
    return segments[0];
  }
  return `${segments[0]} · ${segments[1]}`;
}

/**
 * Returns the primary composer/origin name used when sorting by composer.
 */
export function getComposerSortKey(song: Pick<SongDef, 'id' | 'source'>): string {
  const line = formatComposerLine(song);
  const firstSegment = line.split('·')[0]?.trim() || line;
  return firstSegment;
}

export function getSongDifficultyInfo(song: Pick<SongDef, 'id' | 'level' | 'notes'>): RepertoireDifficultyInfo {
  const mapped = DIFFICULTY_BY_ID[song.id];
  if (mapped) {
    const label =
      mapped.tier === 'very-easy'
        ? 'Очень легко'
        : mapped.tier === 'easy'
          ? 'Легко'
          : 'Средне';
    return {
      tier: mapped.tier,
      label,
      rank: mapped.rank,
      originalLevel: song.level
    };
  }

  const lower = (song.level || '').toLowerCase();
  if (lower.includes('очень легко') || lower.includes('разминка')) {
    return {
      tier: 'very-easy',
      label: 'Очень легко',
      rank: 3,
      originalLevel: song.level
    };
  }
  if (lower.includes('легко') || (song.notes?.length ?? 0) <= 18) {
    return {
      tier: 'easy',
      label: 'Легко',
      rank: 10,
      originalLevel: song.level
    };
  }
  return {
    tier: 'medium',
    label: 'Средне',
    rank: 20,
    originalLevel: song.level
  };
}

export function formatTimeSignatureChip(song: Pick<SongDef, 'timeSignature' | 'measureBeats'>): string {
  if (song.timeSignature && song.timeSignature.length === 2) {
    return `${song.timeSignature[0]}/${song.timeSignature[1]}`;
  }
  return `${song.measureBeats || 4}/4`;
}

export function formatMeasuresChip(count: number): string {
  const n = Math.max(1, Math.round(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${n} такт`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} такта`;
  }
  return `${n} тактов`;
}

export function formatNotesChip(count: number): string {
  const n = Math.max(0, Math.round(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${n} нота`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} ноты`;
  }
  return `${n} нот`;
}

/**
 * Computes variant-specific metadata, verification status, and provenance for a song card.
 */
export function getCardVariantState(
  song: SongDef,
  selectedVariant: RepertoireLengthMode = 'excerpt'
): RepertoireCardVariantState {
  const hasFull = hasFullVersion(song);
  const effectiveVariant: RepertoireLengthMode =
    selectedVariant === 'full' && hasFull ? 'full' : 'excerpt';

  const activeSong = getSongVersion(song, effectiveVariant);
  const fullSong = getSongVersion(song, 'full');
  const verification = getSongVerification(song, effectiveVariant);
  const verificationStatus: RepertoireVerificationStatus = verification?.status || 'unverified';

  const measureCount = getSongMeasureCount(activeSong);
  const noteCount = activeSong.notes.length;
  const excerptMeasureCount = getSongMeasureCount(song);
  const excerptNoteCount = song.notes.length;
  const fullMeasureCount = getSongMeasureCount(fullSong);
  const fullNoteCount = fullSong.notes.length;

  return {
    effectiveVariant,
    activeSong,
    verification,
    verificationStatus,
    verificationLabel: verificationStatus === 'verified' ? 'Проверено' : 'Адаптация',
    isVerified: verificationStatus === 'verified',
    measureCount,
    noteCount,
    timeSignature: formatTimeSignatureChip(song),
    hasFull,
    excerptMeasureCount,
    excerptNoteCount,
    fullMeasureCount,
    fullNoteCount,
    provenance: {
      sourceTitle: verification?.sourceTitle || song.title,
      sourceEdition: verification?.sourceEdition,
      sourceMovement: verification?.sourceMovement,
      sourcePart: verification?.sourcePart,
      sourceMeasures: verification?.sourceMeasures,
      sourceUrl: verification?.sourceUrl,
      notes: verification?.notes,
      verifiedAt: verification?.verifiedAt,
      rawSource: song.source
    }
  };
}

export function computeCategoryCounts(
  songs: readonly SongDef[]
): Record<RepertoireCategoryFilter, number> {
  return {
    all: songs.length,
    classical: songs.filter((s) => (s.category || 'classical') === 'classical').length,
    melody: songs.filter((s) => s.category === 'melody').length,
    study: songs.filter((s) => s.category === 'study').length,
    warmup: songs.filter((s) => s.category === 'warmup').length
  };
}

export function matchesRepertoireSearch(song: SongDef, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const categoryMeta = getCategoryMeta(song.category);
  const difficultyInfo = getSongDifficultyInfo(song);
  const composerLine = formatComposerLine(song);

  const searchableText = [
    song.title,
    song.source,
    composerLine,
    song.category || 'classical',
    categoryMeta.label,
    categoryMeta.shortLabel,
    song.level,
    difficultyInfo.label,
    song.id
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.every((token) => searchableText.includes(token));
}

export function filterAndSortRepertoire(
  songs: readonly SongDef[],
  options: {
    category?: RepertoireCategoryFilter;
    searchQuery?: string;
    sortBy?: RepertoireSortMode;
  }
): SongDef[] {
  const category = options.category || 'all';
  const searchQuery = options.searchQuery || '';
  const sortBy = options.sortBy || 'recommended';

  const indexed = songs.map((song, originalIndex) => ({ song, originalIndex }));

  const filtered = indexed.filter(({ song }) => {
    const songCat = song.category || 'classical';
    if (category !== 'all' && songCat !== category) {
      return false;
    }
    return matchesRepertoireSearch(song, searchQuery);
  });

  if (sortBy === 'recommended') {
    return filtered.map((item) => item.song);
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'difficulty') {
      const diffA = getSongDifficultyInfo(a.song).rank;
      const diffB = getSongDifficultyInfo(b.song).rank;
      if (diffA !== diffB) return diffA - diffB;
      if (a.song.notes.length !== b.song.notes.length) {
        return a.song.notes.length - b.song.notes.length;
      }
      return a.originalIndex - b.originalIndex;
    }

    if (sortBy === 'title') {
      const cmp = a.song.title.localeCompare(b.song.title, 'ru', { sensitivity: 'base' });
      return cmp !== 0 ? cmp : a.originalIndex - b.originalIndex;
    }

    if (sortBy === 'composer') {
      const compA = getComposerSortKey(a.song);
      const compB = getComposerSortKey(b.song);
      const cmp = compA.localeCompare(compB, 'ru', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return a.song.title.localeCompare(b.song.title, 'ru', { sensitivity: 'base' });
    }

    return a.originalIndex - b.originalIndex;
  });

  return sorted.map((item) => item.song);
}
