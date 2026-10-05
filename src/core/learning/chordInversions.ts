import type {
  Card,
  Skill,
  UserSettings,
  ReviewKind,
  ReviewLogEvent,
  PitchClass
} from '../fsrs/types';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import {
  createInitialLearningProgress
} from './progress';
import {
  type LearningProgressRecord,
  type TrialInputMethod
} from './types';
import {
  keyIdFromMidi,
  midiFromKeyId,
  pitchClassFromMidi
} from '../../audio/types';
import type { ProgressCollectionInput } from './curriculumFlow';
import { isBassGrandModuleComplete } from './bassGrandStaff';
import { isIntervalModuleComplete } from './intervals';
import { isTriadModuleComplete, type TriadQuality } from './triads';
import { areChordKeyIdsEqual, sortKeyIdsByPitch } from '../input/chordInput';

function toFsrsSettings(settings?: UserSettings) {
  return {
    desiredRetention: settings?.desiredRetention ?? 0.9,
    maxIntervalDays: settings?.maxIntervalDays ?? 36500,
    relearningSeconds: settings?.relearningSeconds ?? 600,
    useLatencyGrading: settings?.useLatencyGrading ?? true
  };
}

export type TriadInversion = 'root' | 'first' | 'second';

export interface TriadVoicing {
  rootKeyId: string;
  rootPitchClass: PitchClass;
  quality: TriadQuality;
  inversion: TriadInversion;
  keyIds: [string, string, string];
  bassKeyId: string;
  bassPitchClass: PitchClass;
  rootMidi: number;
  thirdMidi: number;
  fifthMidi: number;
  bassMidi: number;
}

export interface InversionDefinition {
  id: TriadInversion;
  nameRu: string;
  shortNameRu: string;
  bassDegree: '1' | '3' | '5';
  degreeOrder: string;
  description: string;
}

export const INVERSION_DEFINITIONS: Record<TriadInversion, InversionDefinition> = {
  root: {
    id: 'root',
    nameRu: 'Основное положение',
    shortNameRu: 'Осн.',
    bassDegree: '1',
    degreeOrder: '1 – 3 – 5',
    description: 'Внизу находится основной тон (1). Аккорд строится терциями вверх.'
  },
  first: {
    id: 'first',
    nameRu: 'Первое обращение',
    shortNameRu: '1-е обр.',
    bassDegree: '3',
    degreeOrder: '3 – 5 – 1',
    description: 'Внизу находится терция (3). Основной тон перенесён на октаву вверх.'
  },
  second: {
    id: 'second',
    nameRu: 'Второе обращение',
    shortNameRu: '2-е обр.',
    bassDegree: '5',
    degreeOrder: '5 – 1 – 3',
    description: 'Внизу находится квинта (5). Основной тон и терция находятся выше.'
  }
};

export const INVERSION_ITEM_IDS = {
  ORIENTATION: 'advanced-inversion:orientation',
  BUILD_FIRST: 'advanced-inversion-build:first',
  BUILD_SECOND: 'advanced-inversion-build:second',
  CONTRAST: 'advanced-inversion:contrast',
  IDENTIFY: 'advanced-inversion-identify:inversion',
  CHORD_SYMBOLS: 'advanced-inversion:chord-symbols',
  BUILD_SLASH: 'advanced-inversion-build:slash',
  HARMONY_SEQUENCE: 'advanced-inversion:harmony-sequence',
  TRANSFER: 'advanced-inversion:transfer',
  COMPLETE: 'advanced-inversion:complete'
} as const;

export type InversionStep =
  | 'inversionOrientation'
  | 'firstInversionModel'
  | 'firstInversionGuided'
  | 'firstInversionQualify'
  | 'firstInversionLocalMix'
  | 'firstInversionDelayedCheck'
  | 'secondInversionModel'
  | 'secondInversionGuided'
  | 'secondInversionQualify'
  | 'secondInversionLocalMix'
  | 'secondInversionDelayedCheck'
  | 'inversionContrast'
  | 'inversionIdentifyModel'
  | 'inversionIdentifyQualify'
  | 'inversionIdentifyDelayedCheck'
  | 'chordSymbolOrientation'
  | 'slashChordModel'
  | 'slashChordGuided'
  | 'slashChordQualify'
  | 'slashChordDelayedCheck'
  | 'harmonySequence'
  | 'inversionTransfer'
  | 'inversionTransferResult'
  | 'inversionTransferRemediation'
  | 'moduleComplete';

export const INVERSION_TRANSFER_BLOCK_TRIALS = 16;
export const INVERSION_TRANSFER_RETRY_TRIALS = 8;
export const INVERSION_TRANSFER_REQUIRED_ACCURACY = 0.8;

function extractProgressCollection(
  input?: ProgressCollectionInput | { learningProgress?: ProgressCollectionInput }
): ProgressCollectionInput {
  if (!input) return undefined;
  if (
    typeof input === 'object' &&
    !(input instanceof Map) &&
    !Array.isArray(input) &&
    'learningProgress' in input &&
    !('id' in input && 'state' in input)
  ) {
    return (input as { learningProgress?: ProgressCollectionInput }).learningProgress;
  }
  return input as ProgressCollectionInput;
}

function normalizeProgressMap(
  input?: ProgressCollectionInput | { learningProgress?: ProgressCollectionInput }
): Map<string, LearningProgressRecord> {
  const collection = extractProgressCollection(input);
  if (!collection) return new Map();
  if (collection instanceof Map) return new Map(collection);
  if (Array.isArray(collection)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of collection) {
      if (item && item.id) map.set(item.id, item);
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [k, v] of Object.entries(collection as Record<string, LearningProgressRecord>)) {
    if (v && v.id) map.set(k, v);
  }
  return map;
}

/**
 * Builds physical key IDs and MIDI pitches for a triad voicing in root, first, or second inversion.
 * Guarantees all notes are within C2..C6 (MIDI 36..84).
 */
export function buildTriadVoicing(
  rootKeyId: string,
  quality: TriadQuality,
  inversion: TriadInversion
): TriadVoicing {
  const rootMidi = midiFromKeyId(rootKeyId) ?? 60;
  const delta3 = quality === 'major' ? 4 : 3;
  const thirdMidi = rootMidi + delta3;
  const fifthMidi = rootMidi + 7;
  const rootPitchClass = pitchClassFromMidi(rootMidi);

  let keyMidis: [number, number, number];
  let bassMidi: number;

  switch (inversion) {
    case 'root':
      keyMidis = [rootMidi, thirdMidi, fifthMidi];
      bassMidi = rootMidi;
      break;
    case 'first':
      keyMidis = [thirdMidi, fifthMidi, rootMidi + 12];
      bassMidi = thirdMidi;
      break;
    case 'second':
      keyMidis = [fifthMidi, rootMidi + 12, thirdMidi + 12];
      bassMidi = fifthMidi;
      break;
  }

  const keyIds = [
    keyIdFromMidi(keyMidis[0]),
    keyIdFromMidi(keyMidis[1]),
    keyIdFromMidi(keyMidis[2])
  ] as [string, string, string];

  return {
    rootKeyId,
    rootPitchClass: rootPitchClass as PitchClass,
    quality,
    inversion,
    keyIds,
    bassKeyId: keyIdFromMidi(bassMidi),
    bassPitchClass: pitchClassFromMidi(bassMidi) as PitchClass,
    rootMidi,
    thirdMidi,
    fifthMidi,
    bassMidi
  };
}

export interface PlayedTriadClassification {
  isValidTriad: boolean;
  root?: PitchClass;
  quality?: TriadQuality;
  inversion?: TriadInversion;
  bassPitchClass?: PitchClass;
  bassKeyId?: string;
  isClosedVoicing?: boolean;
}

const ALL_PITCH_CLASSES: readonly PitchClass[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

/**
 * Pure helper that determines whether 3 played notes form a valid major or minor triad
 * and identifies its root, quality, and inversion based on pitch classes and bass pitch.
 */
export function classifyPlayedTriad(userKeyIds: readonly string[]): PlayedTriadClassification {
  if (userKeyIds.length !== 3) {
    return { isValidTriad: false };
  }

  const sorted = sortKeyIdsByPitch(userKeyIds);
  const midis = sorted.map((k) => midiFromKeyId(k) ?? 0);
  const bassMidi = midis[0];
  const bassPitchClass = pitchClassFromMidi(bassMidi) as PitchClass;
  const pcs = new Set(midis.map((m) => pitchClassFromMidi(m) as PitchClass));

  if (pcs.size !== 3) {
    return { isValidTriad: false };
  }

  for (const root of ALL_PITCH_CLASSES) {
    const rootIndex = ALL_PITCH_CLASSES.indexOf(root);
    for (const quality of ['major', 'minor'] as const) {
      const delta3 = quality === 'major' ? 4 : 3;
      const thirdIndex = (rootIndex + delta3) % 12;
      const fifthIndex = (rootIndex + 7) % 12;

      const triadPcs = new Set([
        ALL_PITCH_CLASSES[rootIndex],
        ALL_PITCH_CLASSES[thirdIndex],
        ALL_PITCH_CLASSES[fifthIndex]
      ]);

      const match = Array.from(triadPcs).every((pc) => pcs.has(pc));
      if (match) {
        let inversion: TriadInversion = 'root';
        if (bassPitchClass === ALL_PITCH_CLASSES[rootIndex]) {
          inversion = 'root';
        } else if (bassPitchClass === ALL_PITCH_CLASSES[thirdIndex]) {
          inversion = 'first';
        } else if (bassPitchClass === ALL_PITCH_CLASSES[fifthIndex]) {
          inversion = 'second';
        }

        // Close voicing check
        const span1 = midis[1] - midis[0];
        const span2 = midis[2] - midis[0];
        let isClosedVoicing = false;
        if (inversion === 'root') {
          isClosedVoicing = span1 === delta3 && span2 === 7;
        } else if (inversion === 'first') {
          isClosedVoicing = span1 === 7 - delta3 && span2 === 12 - delta3;
        } else if (inversion === 'second') {
          isClosedVoicing = span1 === 5 && span2 === 5 + delta3;
        }

        return {
          isValidTriad: true,
          root,
          quality,
          inversion,
          bassPitchClass,
          bassKeyId: sorted[0],
          isClosedVoicing
        };
      }
    }
  }

  return { isValidTriad: false };
}

export type InversionAnswerOutcome =
  | 'correct'
  | 'wrong_inversion'
  | 'wrong_quality'
  | 'wrong_bass'
  | 'wrong_octave'
  | 'incomplete_chord'
  | 'extra_notes'
  | 'wrong_notes';

export interface InversionClassificationResult {
  outcome: InversionAnswerOutcome;
  feedbackText: string;
}

/**
 * Classifies a user's multi-key chord attempt against target inversion and voicing.
 */
export function classifyTriadInversionAnswer(
  userKeyIds: readonly string[],
  targetRootKeyId: string,
  targetQuality: TriadQuality,
  targetInversion: TriadInversion,
  expectedKeyIds?: readonly string[],
  targetSymbol?: string
): InversionClassificationResult {
  if (userKeyIds.length < 3) {
    return {
      outcome: 'incomplete_chord',
      feedbackText: `Выберите все 3 клавиши аккорда (сейчас выбрано: ${userKeyIds.length} из 3).`
    };
  }
  if (userKeyIds.length > 3) {
    return {
      outcome: 'extra_notes',
      feedbackText: `Аккорд должен состоять ровно из трёх звуков (сейчас выбрано: ${userKeyIds.length}).`
    };
  }

  const expected = expectedKeyIds
    ? [...expectedKeyIds]
    : buildTriadVoicing(targetRootKeyId, targetQuality, targetInversion).keyIds;
  const sortedUser = sortKeyIdsByPitch(userKeyIds);
  const targetRootMidi = midiFromKeyId(targetRootKeyId) ?? 60;
  const targetRootPc = pitchClassFromMidi(targetRootMidi);

  // Exact physical key match
  if (areChordKeyIdsEqual(sortedUser, expected)) {
    const label = targetSymbol || `${targetRootKeyId} ${targetQuality === 'major' ? 'мажор' : 'минор'} (${INVERSION_DEFINITIONS[targetInversion].shortNameRu})`;
    return {
      outcome: 'correct',
      feedbackText: `Верно! ${label}.`
    };
  }

  const played = classifyPlayedTriad(userKeyIds);
  if (!played.isValidTriad) {
    return {
      outcome: 'wrong_notes',
      feedbackText: `Не те клавиши. Нужен ${targetQuality === 'major' ? 'мажор' : 'минор'} (${INVERSION_DEFINITIONS[targetInversion].shortNameRu}): ${expected.join(' + ')}.`
    };
  }

  // Same root, opposite quality (e.g. C minor instead of C major)
  if (played.root === targetRootPc && played.quality !== targetQuality) {
    return {
      outcome: 'wrong_quality',
      feedbackText:
        targetQuality === 'major'
          ? `Получился ${targetRootPc} минор. Для мажора терция должна быть на полутон выше.`
          : `Получился ${targetRootPc} мажор. Для минора терция должна быть на полутон ниже.`
    };
  }

  // Same root & quality, but wrong inversion or wrong bass
  if (played.root === targetRootPc && played.quality === targetQuality) {
    if (played.inversion !== targetInversion) {
      if (targetSymbol && targetSymbol.includes('/')) {
        const slashBass = targetSymbol.split('/')[1];
        return {
          outcome: 'wrong_bass',
          feedbackText: `Аккорд ${targetRootPc} ${targetQuality === 'major' ? 'мажор' : 'минор'} правильный, но в басу должна быть ${slashBass}.`
        };
      }
      const targetThirdMidi = targetRootMidi + (targetQuality === 'major' ? 4 : 3);
      const targetFifthMidi = targetRootMidi + 7;
      const thirdPc = pitchClassFromMidi(targetThirdMidi);
      const fifthPc = pitchClassFromMidi(targetFifthMidi);

      if (played.inversion === 'root') {
        const reqNote = targetInversion === 'first' ? thirdPc : fifthPc;
        const reqDegree = targetInversion === 'first' ? 'терция' : 'квинта';
        return {
          outcome: 'wrong_inversion',
          feedbackText: `Это ${targetRootPc} ${targetQuality === 'major' ? 'мажор' : 'минор'}, но в основном положении. Для ${targetInversion === 'first' ? 'первого' : 'второго'} обращения внизу должна быть ${reqDegree} — ${reqNote}.`
        };
      }
      if (targetInversion === 'first') {
        return {
          outcome: 'wrong_inversion',
          feedbackText: `Это второе обращение (квинта в басу). Для первого обращения внизу должна быть терция — ${thirdPc}.`
        };
      }
      if (targetInversion === 'second') {
        return {
          outcome: 'wrong_inversion',
          feedbackText: `Это первое обращение (терция в басу). Для второго обращения внизу должна быть квинта — ${fifthPc}.`
        };
      }
    }

    // Same inversion, but played in wrong octave
    return {
      outcome: 'wrong_octave',
      feedbackText: `Ноты аккорда и бас верные, но расположение по октавам отличается от задания. Нужное расположение: ${expected.join(' + ')}.`
    };
  }

  return {
    outcome: 'wrong_notes',
    feedbackText: `Не те клавиши. Сыгран ${played.root} ${played.quality === 'major' ? 'мажор' : 'минор'}, а нужен ${targetRootPc} ${targetQuality === 'major' ? 'мажор' : 'минор'}: ${expected.join(' + ')}.`
  };
}

export interface ParsedChordSymbol {
  raw: string;
  root: PitchClass;
  quality: TriadQuality;
  bass?: PitchClass;
  inversion: TriadInversion;
  isSlash: boolean;
  isTriadInversion: boolean;
  isSupported: boolean;
}

/**
 * Generic lead-sheet symbol parser for major/minor triads and slash chord inversions.
 * Distinguishes triad inversions (e.g. C/E, G/B, Am/C) from unsupported non-triad bass (e.g. C/F#).
 */
export function parseChordSymbol(symbol: string): ParsedChordSymbol | null {
  const clean = symbol.trim();
  if (!clean) return null;

  const parts = clean.split('/');
  if (parts.length > 2 || (parts.length === 2 && !parts[1].trim())) return null;
  const chordPart = parts[0].trim();
  const bassPart = parts.length > 1 ? parts[1].trim() : undefined;

  // Match root and quality: C, Cm, F#, F#m, Bb, Bbm, etc.
  const chordMatch = chordPart.match(/^([A-G][#b]?)(m?)$/i);
  if (!chordMatch) return null;

  let rootRaw = chordMatch[1].toUpperCase();
  // Normalize flats to sharps
  if (rootRaw === 'BB') rootRaw = 'A#';
  else if (rootRaw === 'EB') rootRaw = 'D#';
  else if (rootRaw === 'AB') rootRaw = 'G#';
  else if (rootRaw === 'DB') rootRaw = 'C#';
  else if (rootRaw === 'GB') rootRaw = 'F#';
  const root = rootRaw as PitchClass;
  if (!ALL_PITCH_CLASSES.includes(root)) return null;

  const quality: TriadQuality = chordMatch[2].toLowerCase() === 'm' ? 'minor' : 'major';
  const rootIndex = ALL_PITCH_CLASSES.indexOf(root);
  const delta3 = quality === 'major' ? 4 : 3;
  const thirdPc = ALL_PITCH_CLASSES[(rootIndex + delta3) % 12];
  const fifthPc = ALL_PITCH_CLASSES[(rootIndex + 7) % 12];

  if (!bassPart) {
    return {
      raw: clean,
      root,
      quality,
      inversion: 'root',
      isSlash: false,
      isTriadInversion: true,
      isSupported: true
    };
  }

  let bassRaw = bassPart.toUpperCase();
  if (bassRaw === 'BB') bassRaw = 'A#';
  else if (bassRaw === 'EB') bassRaw = 'D#';
  else if (bassRaw === 'AB') bassRaw = 'G#';
  else if (bassRaw === 'DB') bassRaw = 'C#';
  else if (bassRaw === 'GB') bassRaw = 'F#';
  const bass = bassRaw as PitchClass;
  if (!ALL_PITCH_CLASSES.includes(bass)) return null;

  if (bass === root) {
    return {
      raw: clean,
      root,
      quality,
      bass,
      inversion: 'root',
      isSlash: true,
      isTriadInversion: true,
      isSupported: true
    };
  }
  if (bass === thirdPc) {
    return {
      raw: clean,
      root,
      quality,
      bass,
      inversion: 'first',
      isSlash: true,
      isTriadInversion: true,
      isSupported: true
    };
  }
  if (bass === fifthPc) {
    return {
      raw: clean,
      root,
      quality,
      bass,
      inversion: 'second',
      isSlash: true,
      isTriadInversion: true,
      isSupported: true
    };
  }

  // Bass does NOT belong to triad
  return {
    raw: clean,
    root,
    quality,
    bass,
    inversion: 'root',
    isSlash: true,
    isTriadInversion: false,
    isSupported: false
  };
}

/**
 * Formats a canonical chord symbol string (e.g. C, Cm, G/B, Am/C).
 */
export function formatChordSymbol(
  root: PitchClass,
  quality: TriadQuality,
  inversionOrBass: TriadInversion | PitchClass = 'root'
): string {
  const base = `${root}${quality === 'minor' ? 'm' : ''}`;
  if (inversionOrBass === 'root') return base;

  if (inversionOrBass === 'first' || inversionOrBass === 'second') {
    const rootIndex = ALL_PITCH_CLASSES.indexOf(root);
    const delta = inversionOrBass === 'first' ? (quality === 'major' ? 4 : 3) : 7;
    const bassPc = ALL_PITCH_CLASSES[(rootIndex + delta) % 12];
    return `${base}/${bassPc}`;
  }

  return `${base}/${inversionOrBass}`;
}

export interface InversionPracticeItem {
  skill: 'triadInversionBuild' | 'triadInversionIdentify' | 'chordSymbolRead';
  quality: TriadQuality;
  inversion: TriadInversion;
  rootKeyId: string;
  symbol: string;
  isChromaticRoot: boolean;
}

export const CANONICAL_INVERSION_PRACTICE_ITEMS: readonly InversionPracticeItem[] = [
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'first', rootKeyId: 'C4', symbol: 'C/E', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'second', rootKeyId: 'G3', symbol: 'G/D', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'first', rootKeyId: 'A3', symbol: 'Am/C', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'second', rootKeyId: 'F3', symbol: 'F/C', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'first', rootKeyId: 'G3', symbol: 'G/B', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'first', rootKeyId: 'D4', symbol: 'Dm/F', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'first', rootKeyId: 'F#3', symbol: 'F#/A#', isChromaticRoot: true },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'second', rootKeyId: 'E3', symbol: 'Em/B', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'first', rootKeyId: 'C#4', symbol: 'C#/F', isChromaticRoot: true },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'root', rootKeyId: 'C4', symbol: 'C', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'minor', inversion: 'second', rootKeyId: 'C4', symbol: 'Cm/G', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'root', rootKeyId: 'A3', symbol: 'Am', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'minor', inversion: 'first', rootKeyId: 'D#4', symbol: 'D#m/F#', isChromaticRoot: true },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'second', rootKeyId: 'A3', symbol: 'Am/E', isChromaticRoot: false }
] as const;

export function resolveInversionPracticeItem(
  skill: Skill,
  options?: {
    card?: Card;
    sessionTrials?: number;
    contextIndex?: number;
    inversion?: TriadInversion;
  }
): InversionPracticeItem {
  let pool: readonly InversionPracticeItem[] = CANONICAL_INVERSION_PRACTICE_ITEMS.filter((item) => item.skill === skill);
  if (!pool.length) pool = CANONICAL_INVERSION_PRACTICE_ITEMS;

  const cardOffset = options?.card
    ? (options.card.reps ?? 0) * 3 + (options.card.lapses ?? 0) * 5
    : 0;

  if (typeof options?.contextIndex === 'number') {
    return pool[Math.abs(options.contextIndex) % pool.length];
  }
  if (typeof options?.sessionTrials === 'number') {
    return pool[(Math.abs(options.sessionTrials) + cardOffset) % pool.length];
  }
  return pool[cardOffset % pool.length];
}

export interface DailyInversionAttemptInput {
  card: Card;
  kind: ReviewKind;
  rootKeyId: string;
  quality: TriadQuality;
  inversion: TriadInversion;
  expectedKeyIds: readonly string[];
  userKeyIds: readonly string[];
  targetSymbol?: string;
  firstResponseRecorded: boolean;
  attempts: number;
  hintUsed: boolean;
  responseMs: number;
  inputMethod?: TrialInputMethod;
  settings?: UserSettings;
  reviewLogs?: readonly ReviewLogEvent[];
  sessionId?: string | null;
}

export interface DailyInversionAttemptResult {
  isCorrect: boolean;
  classification: InversionClassificationResult;
  attemptResult: SubmitQuestionAttemptResult;
  updatedState: {
    firstResponseRecorded: boolean;
    attempts: number;
    hintUsed: boolean;
    isCompleted: boolean;
    isLocked: boolean;
  };
  feedbackText: string;
  feedbackClass: 'good' | 'bad' | 'warn';
  shouldAdvance: boolean;
}

/**
 * Pure evaluator for Daily Practice inversion and chord symbol attempts.
 * Evaluates the full multi-key chord via classifyTriadInversionAnswer,
 * guaranteeing single-note equality never produces a false positive.
 */
export function evaluateDailyInversionAttempt(
  input: DailyInversionAttemptInput
): DailyInversionAttemptResult {
  const sorted = sortKeyIdsByPitch(input.userKeyIds);
  const classification = classifyTriadInversionAnswer(
    sorted,
    input.rootKeyId,
    input.quality,
    input.inversion,
    input.expectedKeyIds,
    input.targetSymbol
  );
  const isCorrect = classification.outcome === 'correct';

  const roundState: QuestionRoundState = {
    firstResponseRecorded: input.firstResponseRecorded,
    attempts: input.attempts,
    hintUsed: input.hintUsed,
    isCompleted: false,
    isLocked: false
  };

  const attemptResult = submitQuestionAttempt({
    state: roundState,
    card: input.card,
    kind: input.kind,
    isCorrect,
    answer: input.inversion,
    answerKeyId: sorted.join('+'),
    hintUsedOnFirstAttempt: false,
    responseMs: input.responseMs,
    settings: toFsrsSettings(input.settings),
    reviewLog: input.reviewLogs,
    sessionId: input.sessionId ?? undefined,
    inputMethod: input.inputMethod
  });

  let feedbackText = classification.feedbackText;
  let feedbackClass: 'good' | 'bad' | 'warn' = 'bad';
  let shouldAdvance = false;

  if (attemptResult.isFirstAttempt) {
    if (isCorrect) {
      feedbackClass = 'good';
      feedbackText = `✓ ${classification.feedbackText} · ${(input.responseMs / 1000).toFixed(1)} с`;
      shouldAdvance = true;
    } else {
      feedbackClass = 'bad';
      if (input.kind === 'scheduled') {
        feedbackText += ' Первая попытка засчитана как ошибка.';
      }
      shouldAdvance = false;
    }
  } else {
    // Subsequent corrective attempt
    if (isCorrect) {
      feedbackClass = 'warn';
      feedbackText =
        input.kind === 'transfer'
          ? `✓ Исправлено (${roundState.attempts}-я попытка). Задание служит для переноса навыка.`
          : `✓ Исправлено (${roundState.attempts}-я попытка). Для памяти засчитана первая ошибка.`;
      shouldAdvance = true;
    } else {
      feedbackClass = 'bad';
      shouldAdvance = false;
    }
  }

  return {
    isCorrect,
    classification,
    attemptResult,
    updatedState: {
      firstResponseRecorded: roundState.firstResponseRecorded,
      attempts: roundState.attempts,
      hintUsed: roundState.hintUsed,
      isCompleted: roundState.isCompleted,
      isLocked: roundState.isLocked
    },
    feedbackText,
    feedbackClass,
    shouldAdvance
  };
}

export function isInversionModuleAvailable(
  input?: {
    learningProgress?: ProgressCollectionInput;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly any[];
  } | ProgressCollectionInput
): boolean {
  if (!input) return false;
  const progress = extractProgressCollection(input);
  return (
    isBassGrandModuleComplete(progress) &&
    isIntervalModuleComplete(progress) &&
    isTriadModuleComplete(progress)
  );
}

export function isInversionModuleComplete(
  input?: {
    learningProgress?: ProgressCollectionInput;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly any[];
  } | ProgressCollectionInput
): boolean {
  if (!input) return false;
  const map = normalizeProgressMap(input);
  const rec = map.get(INVERSION_ITEM_IDS.COMPLETE);
  return Boolean(rec && rec.state === 'retention');
}

export function getInversionModuleStatus(input?: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly any[];
} | ProgressCollectionInput): 'not_started' | 'in_progress' | 'completed' {
  if (!input) return 'not_started';
  if (isInversionModuleComplete(input)) return 'completed';

  const map = normalizeProgressMap(input);
  const hasAnyProgress =
    map.has(INVERSION_ITEM_IDS.ORIENTATION) ||
    map.has(INVERSION_ITEM_IDS.BUILD_FIRST) ||
    map.has(INVERSION_ITEM_IDS.BUILD_SECOND) ||
    map.has(INVERSION_ITEM_IDS.CONTRAST) ||
    map.has(INVERSION_ITEM_IDS.IDENTIFY) ||
    map.has(INVERSION_ITEM_IDS.CHORD_SYMBOLS) ||
    map.has(INVERSION_ITEM_IDS.BUILD_SLASH) ||
    map.has(INVERSION_ITEM_IDS.HARMONY_SEQUENCE) ||
    map.has(INVERSION_ITEM_IDS.TRANSFER);

  return hasAnyProgress ? 'in_progress' : 'not_started';
}

export interface InversionTransferTrialConfig {
  skill: 'triadInversionBuild' | 'triadInversionIdentify' | 'chordSymbolRead';
  quality: TriadQuality;
  inversion: TriadInversion;
  rootKeyId: string;
  symbol: string;
  isChromaticRoot: boolean;
  expectedKeyIds: [string, string, string];
  bassKeyId: string;
}

interface InversionTransferCycleEntry {
  skill: 'triadInversionBuild' | 'triadInversionIdentify' | 'chordSymbolRead';
  quality: TriadQuality;
  inversion: TriadInversion;
  rootKeyId: string;
  symbol: string;
  isChromaticRoot: boolean;
}

export const INVERSION_TRANSFER_CYCLE: readonly InversionTransferCycleEntry[] = [
  // First 10 deterministic trials covering all dimensions:
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'first', rootKeyId: 'C4', symbol: 'C/E', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'second', rootKeyId: 'G3', symbol: 'G/D', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'first', rootKeyId: 'A3', symbol: 'Am/C', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'minor', inversion: 'second', rootKeyId: 'C4', symbol: 'Cm/G', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'first', rootKeyId: 'D4', symbol: 'Dm/F', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'first', rootKeyId: 'G3', symbol: 'G/B', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'first', rootKeyId: 'F#3', symbol: 'F#/A#', isChromaticRoot: true },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'second', rootKeyId: 'E3', symbol: 'Em/B', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'first', rootKeyId: 'C#4', symbol: 'C#/F', isChromaticRoot: true },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'root', rootKeyId: 'C4', symbol: 'C', isChromaticRoot: false },
  // Trials 10-15:
  { skill: 'triadInversionBuild', quality: 'minor', inversion: 'first', rootKeyId: 'D#4', symbol: 'D#m/F#', isChromaticRoot: true },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'second', rootKeyId: 'A3', symbol: 'Am/E', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'second', rootKeyId: 'F3', symbol: 'F/C', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'second', rootKeyId: 'G#3', symbol: 'G#/D#', isChromaticRoot: true },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'root', rootKeyId: 'C4', symbol: 'C', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'root', rootKeyId: 'D4', symbol: 'Dm', isChromaticRoot: false }
] as const;

export const INVERSION_TRANSFER_RETRY_CYCLE: readonly InversionTransferCycleEntry[] = [
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'first', rootKeyId: 'F#3', symbol: 'F#/A#', isChromaticRoot: true },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'second', rootKeyId: 'A3', symbol: 'Am/E', isChromaticRoot: false },
  { skill: 'chordSymbolRead', quality: 'major', inversion: 'first', rootKeyId: 'G3', symbol: 'G/B', isChromaticRoot: false },
  { skill: 'triadInversionBuild', quality: 'minor', inversion: 'second', rootKeyId: 'C4', symbol: 'Cm/G', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'major', inversion: 'second', rootKeyId: 'C#4', symbol: 'C#/G#', isChromaticRoot: true },
  { skill: 'chordSymbolRead', quality: 'minor', inversion: 'first', rootKeyId: 'D#4', symbol: 'D#m/F#', isChromaticRoot: true },
  { skill: 'triadInversionBuild', quality: 'major', inversion: 'root', rootKeyId: 'C4', symbol: 'C', isChromaticRoot: false },
  { skill: 'triadInversionIdentify', quality: 'minor', inversion: 'root', rootKeyId: 'D4', symbol: 'Dm', isChromaticRoot: false }
] as const;

export function buildInversionTransferTrial(
  trialIndex: number,
  blockKind: 'initial' | 'retry' = 'initial'
): InversionTransferTrialConfig {
  const cycle = blockKind === 'retry' ? INVERSION_TRANSFER_RETRY_CYCLE : INVERSION_TRANSFER_CYCLE;
  const item = cycle[trialIndex % cycle.length];
  const voicing = buildTriadVoicing(item.rootKeyId, item.quality, item.inversion);
  return {
    skill: item.skill,
    quality: item.quality,
    inversion: item.inversion,
    rootKeyId: item.rootKeyId,
    symbol: item.symbol,
    isChromaticRoot: item.isChromaticRoot,
    expectedKeyIds: voicing.keyIds,
    bassKeyId: voicing.bassKeyId
  };
}

function getTransferTrialCoverageTags(trial: InversionTransferTrialConfig): string[] {
  return [
    `quality:${trial.quality}`,
    `inversion:${trial.inversion}`,
    `skill:${trial.skill}`,
    trial.symbol.includes('/') ? 'symbol:slash' : 'symbol:normal',
    trial.isChromaticRoot ? 'root:chromatic' : 'root:white'
  ];
}

const REQUIRED_TRANSFER_COVERAGE = [
  'quality:major', 'quality:minor', 'inversion:first', 'inversion:second',
  'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
  'symbol:normal', 'symbol:slash', 'root:chromatic'
] as const;

function transferBlockSize(blockKind: 'initial' | 'retry'): number {
  return blockKind === 'initial' ? INVERSION_TRANSFER_BLOCK_TRIALS : INVERSION_TRANSFER_RETRY_TRIALS;
}

function hasRequiredTransferCoverage(tags: readonly string[]): boolean {
  return REQUIRED_TRANSFER_COVERAGE.every((tag) => tags.includes(tag));
}

function legacyTransferAssessment(rec: LearningProgressRecord): NonNullable<LearningProgressRecord['transferAssessment']> {
  const resolvedTrials = Math.max(0, rec.transferLifetimeTrials ?? rec.guidedSuccesses ?? 0);
  const contexts = rec.contexts ?? [];
  const coverageTags = contexts.filter((tag) => REQUIRED_TRANSFER_COVERAGE.includes(tag as (typeof REQUIRED_TRANSFER_COVERAGE)[number]));
  const pendingCorrective = hasPendingTransferCorrective(rec);
  const trialsCompleted = resolvedTrials + (pendingCorrective ? 1 : 0);
  const failedTrialIndexes = pendingCorrective ? [resolvedTrials] : [];
  if (pendingCorrective) {
    for (const tag of getTransferTrialCoverageTags(buildInversionTransferTrial(resolvedTrials))) {
      if (!coverageTags.includes(tag)) coverageTags.push(tag);
    }
  }
  const isOverlongFailedBlock = trialsCompleted >= INVERSION_TRANSFER_BLOCK_TRIALS && !pendingCorrective;
  return {
    blockNumber: 1,
    blockKind: 'initial',
    phase: isOverlongFailedBlock ? 'result' : 'active',
    trialsCompleted,
    correctFirstAttempts: Math.max(0, rec.transferLifetimeCorrectFirstAttempts ?? rec.independentUnhintedSuccesses ?? 0),
    coverageTags,
    failedTrialIndexes,
    remediationTrialIndexes: [],
    remediationIndex: 0,
    pendingCorrective
  };
}

function hasPendingTransferCorrective(rec?: LearningProgressRecord): boolean {
  return Boolean(rec?.contexts?.includes('pending:inversionTransferCorrective'));
}

function getTransferAssessment(rec?: LearningProgressRecord): NonNullable<LearningProgressRecord['transferAssessment']> {
  if (rec?.transferAssessment) return rec.transferAssessment;
  return legacyTransferAssessment(rec ?? createInitialLearningProgress(INVERSION_ITEM_IDS.TRANSFER));
}

function isInversionTransferGateSatisfiedLegacy(rec?: LearningProgressRecord): boolean {
  if (!rec) return false;
  const completedTrials = rec.guidedSuccesses ?? 0;
  const correctFirstAttempts = rec.independentUnhintedSuccesses ?? 0;
  if (completedTrials < INVERSION_TRANSFER_BLOCK_TRIALS || completedTrials === 0 ||
      correctFirstAttempts / completedTrials < INVERSION_TRANSFER_REQUIRED_ACCURACY) return false;
  return hasRequiredTransferCoverage(rec.contexts ?? []);
}

export function isInversionTransferGateSatisfied(rec?: LearningProgressRecord): boolean {
  if (!rec) return false;
  if (rec.transferAssessment) {
    const assessment = rec.transferAssessment;
    return assessment.phase === 'passed' &&
      assessment.trialsCompleted === transferBlockSize(assessment.blockKind) &&
      assessment.correctFirstAttempts / Math.max(1, assessment.trialsCompleted) >= INVERSION_TRANSFER_REQUIRED_ACCURACY &&
      hasRequiredTransferCoverage(assessment.coverageTags);
  }
  return isInversionTransferGateSatisfiedLegacy(rec);
}

export interface HarmonySequenceStep {
  symbol: string;
  rootKeyId: string;
  quality: TriadQuality;
  inversion: TriadInversion;
  voicing: [string, string, string];
  bassKeyId: string;
  explanation: string;
}

export const CANONICAL_HARMONY_SEQUENCE: readonly HarmonySequenceStep[] = [
  {
    symbol: 'C',
    rootKeyId: 'C4',
    quality: 'major',
    inversion: 'root',
    voicing: ['C4', 'E4', 'G4'],
    bassKeyId: 'C4',
    explanation: 'C мажор в основном положении. Бас — нота C4.'
  },
  {
    symbol: 'G/B',
    rootKeyId: 'G3',
    quality: 'major',
    inversion: 'first',
    voicing: ['B3', 'D4', 'G4'],
    bassKeyId: 'B3',
    explanation: 'G мажор в первом обращении (G/B). Бас плавно спустился на B3.'
  },
  {
    symbol: 'Am',
    rootKeyId: 'A3',
    quality: 'minor',
    inversion: 'root',
    voicing: ['A3', 'C4', 'E4'],
    bassKeyId: 'A3',
    explanation: 'A минор (Am). Бас продолжает плавный шаг вниз на A3.'
  },
  {
    symbol: 'F',
    rootKeyId: 'F3',
    quality: 'major',
    inversion: 'root',
    voicing: ['F3', 'A3', 'C4'],
    bassKeyId: 'F3',
    explanation: 'F мажор в основном положении (F3 + A3 + C4). Завершение оборота.'
  }
] as const;

export interface InversionCurriculumState {
  step: InversionStep;
  progress: Record<string, LearningProgressRecord>;
  activeSkill: 'triadInversionBuild' | 'triadInversionIdentify' | 'chordSymbolRead' | 'none';
  quality?: TriadQuality;
  inversion?: TriadInversion;
  rootKeyId?: string;
  symbol?: string;
  targetKeyIds: readonly string[];
  expectedVoicingKeyIds: readonly string[];
  structuralGuideKeyIds: readonly string[];
  selectedKeyIds: readonly string[];
  awaitingCorrective: boolean;
  isInterveningRecall: boolean;
  feedbackText?: string;
  feedbackTone?: 'good' | 'bad' | 'warn' | 'info';
  localMixSuccessCount: number;
  localMixTarget: number;
  harmonyStepIndex: number;
  transferTrialsCompleted: number;
  transferCorrectFirstAttempts: number;
  transferBlockNumber: number;
  transferBlockKind: 'initial' | 'retry';
  transferBlockPhase: 'active' | 'result' | 'remediation' | 'passed';
  transferBlockSize: number;
  transferFailedTrialIndexes: readonly number[];
  transferRemediationTrialIndexes: readonly number[];
  transferRemediationIndex: number;
}

function withInversionSuccessFeedback(
  state: InversionCurriculumState,
  feedbackText: string
): InversionCurriculumState {
  return { ...state, feedbackText, feedbackTone: 'good' };
}

const INVERSION_CHORD_ENTRY_STEPS: readonly InversionStep[] = [
  'firstInversionGuided',
  'firstInversionQualify',
  'firstInversionLocalMix',
  'firstInversionDelayedCheck',
  'secondInversionGuided',
  'secondInversionQualify',
  'secondInversionLocalMix',
  'secondInversionDelayedCheck',
  'slashChordGuided',
  'slashChordQualify',
  'slashChordDelayedCheck',
  'harmonySequence',
  'inversionTransfer',
  'inversionTransferRemediation'
];

/** True only on stages where the learner is expected to enter a full chord. */
export function canInputInversionChord(
  state: Pick<InversionCurriculumState, 'step' | 'activeSkill'>
): boolean {
  return state.activeSkill !== 'none' &&
    state.activeSkill !== 'triadInversionIdentify' &&
    INVERSION_CHORD_ENTRY_STEPS.includes(state.step);
}

/** True only on stages where the learner is expected to answer with an inversion choice. */
export function canSelectInversionAnswer(
  state: Pick<InversionCurriculumState, 'step' | 'activeSkill'>
): boolean {
  return state.activeSkill === 'triadInversionIdentify' && (
    state.step === 'inversionIdentifyQualify' ||
    state.step === 'inversionIdentifyDelayedCheck' ||
    state.step === 'inversionTransfer' ||
    state.step === 'inversionTransferRemediation'
  );
}

export function deriveInversionStep(
  progress: Record<string, LearningProgressRecord>
): InversionStep {
  if (progress[INVERSION_ITEM_IDS.COMPLETE]?.state === 'retention') {
    return 'moduleComplete';
  }

  const orientRec = progress[INVERSION_ITEM_IDS.ORIENTATION];
  if (!orientRec || orientRec.state === 'unseen') {
    return 'inversionOrientation';
  }

  // First Inversion Build
  const firstBuildRec = progress[INVERSION_ITEM_IDS.BUILD_FIRST];
  if (!firstBuildRec || firstBuildRec.state === 'unseen') return 'firstInversionModel';
  if (firstBuildRec.state === 'introduced') return 'firstInversionGuided';
  if (firstBuildRec.state === 'guided') return 'firstInversionQualify';
  if (firstBuildRec.state === 'qualifying') return 'firstInversionLocalMix';
  if (firstBuildRec.state === 'mixReady' || firstBuildRec.contexts.includes('pending:delayedRetry')) {
    return 'firstInversionDelayedCheck';
  }

  // Second Inversion Build
  const secondBuildRec = progress[INVERSION_ITEM_IDS.BUILD_SECOND];
  if (!secondBuildRec || secondBuildRec.state === 'unseen') return 'secondInversionModel';
  if (secondBuildRec.state === 'introduced') return 'secondInversionGuided';
  if (secondBuildRec.state === 'guided') return 'secondInversionQualify';
  if (secondBuildRec.state === 'qualifying') return 'secondInversionLocalMix';
  if (secondBuildRec.state === 'mixReady' || secondBuildRec.contexts.includes('pending:delayedRetry')) {
    return 'secondInversionDelayedCheck';
  }

  // Contrast
  const contrastRec = progress[INVERSION_ITEM_IDS.CONTRAST];
  if (!contrastRec || contrastRec.state !== 'retention') return 'inversionContrast';

  // Identify
  const identifyRec = progress[INVERSION_ITEM_IDS.IDENTIFY];
  if (!identifyRec || identifyRec.state === 'unseen') return 'inversionIdentifyModel';
  if (identifyRec.state === 'guided') return 'inversionIdentifyQualify';
  if (identifyRec.state === 'qualifying' || identifyRec.state === 'mixReady' || identifyRec.contexts.includes('pending:delayedRetry')) {
    return 'inversionIdentifyDelayedCheck';
  }

  // Chord symbols orientation
  const symbolsRec = progress[INVERSION_ITEM_IDS.CHORD_SYMBOLS];
  if (!symbolsRec || symbolsRec.state !== 'retention') return 'chordSymbolOrientation';

  // Slash chord build
  const slashRec = progress[INVERSION_ITEM_IDS.BUILD_SLASH];
  if (!slashRec || slashRec.state === 'unseen') return 'slashChordModel';
  if (slashRec.state === 'introduced') return 'slashChordGuided';
  if (slashRec.state === 'guided') return 'slashChordQualify';
  if (slashRec.state === 'qualifying' || slashRec.state === 'mixReady' || slashRec.contexts.includes('pending:delayedRetry')) {
    return 'slashChordDelayedCheck';
  }

  // Harmony sequence
  const harmonyRec = progress[INVERSION_ITEM_IDS.HARMONY_SEQUENCE];
  if (!harmonyRec || harmonyRec.state !== 'retention') return 'harmonySequence';

  // Transfer gate
  const transferRec = progress[INVERSION_ITEM_IDS.TRANSFER];
  const assessment = getTransferAssessment(transferRec);
  if (assessment.phase === 'result') return 'inversionTransferResult';
  if (assessment.phase === 'remediation') return 'inversionTransferRemediation';
  if (!transferRec || transferRec.state !== 'retention' || !isInversionTransferGateSatisfied(transferRec)) return 'inversionTransfer';

  return 'moduleComplete';
}

export function buildInversionStateForStep(
  step: InversionStep,
  progress: Record<string, LearningProgressRecord>,
  _now = Date.now(),
  localMixSuccessCount = 0
): InversionCurriculumState {
  const transferRec = progress[INVERSION_ITEM_IDS.TRANSFER];
  const assessment = getTransferAssessment(transferRec);
  const transferTrialsCompleted = assessment.trialsCompleted;
  const transferCorrectFirstAttempts = assessment.correctFirstAttempts;
  const hasPendingTransferCorrective = Boolean(
    transferRec?.contexts?.includes('pending:inversionTransferCorrective')
  );

  const baseState: InversionCurriculumState = {
    step,
    progress,
    activeSkill: 'none',
    targetKeyIds: [],
    expectedVoicingKeyIds: [],
    structuralGuideKeyIds: [],
    selectedKeyIds: [],
    awaitingCorrective: false,
    isInterveningRecall: false,
    localMixSuccessCount,
    localMixTarget: 3,
    harmonyStepIndex: 0,
    transferTrialsCompleted,
    transferCorrectFirstAttempts,
    transferBlockNumber: assessment.blockNumber,
    transferBlockKind: assessment.blockKind,
    transferBlockPhase: assessment.phase,
    transferBlockSize: transferBlockSize(assessment.blockKind),
    transferFailedTrialIndexes: [...assessment.failedTrialIndexes],
    transferRemediationTrialIndexes: [...assessment.remediationTrialIndexes],
    transferRemediationIndex: assessment.remediationIndex
  };

  if (step === 'inversionOrientation') {
    const rootVoicing = buildTriadVoicing('C4', 'major', 'root');
    return {
      ...baseState,
      targetKeyIds: [...rootVoicing.keyIds],
      expectedVoicingKeyIds: [...rootVoicing.keyIds],
      structuralGuideKeyIds: ['C4']
    };
  }

  if (step === 'firstInversionModel') {
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'firstInversionGuided') {
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'firstInversionQualify') {
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds]
    };
  }

  if (step === 'firstInversionLocalMix') {
    const mixItems = [
      { root: 'G3', quality: 'major' as TriadQuality },
      { root: 'A3', quality: 'minor' as TriadQuality },
      { root: 'F#3', quality: 'major' as TriadQuality }
    ];
    const successCount = localMixSuccessCount;
    const item = mixItems[successCount % mixItems.length];
    const v = buildTriadVoicing(item.root, item.quality, 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: item.quality,
      inversion: 'first',
      rootKeyId: item.root,
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds],
      localMixSuccessCount: successCount,
      localMixTarget: 3
    };
  }

  if (step === 'firstInversionDelayedCheck') {
    const rec = progress[INVERSION_ITEM_IDS.BUILD_FIRST];
    const hasCorrective = rec?.contexts?.includes('pending:corrective');
    const hasIntervening = rec?.contexts?.includes('pending:interveningRecall');
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: hasCorrective ? [...v.keyIds] : [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: hasCorrective ? [v.bassKeyId] : [],
      awaitingCorrective: Boolean(hasCorrective),
      isInterveningRecall: Boolean(hasIntervening),
      feedbackText: hasCorrective ? `Нажмите подсвеченные клавиши 1-го обращения (${v.keyIds.join(' + ')}).` : undefined,
      feedbackTone: hasCorrective ? 'bad' : undefined
    };
  }

  if (step === 'secondInversionModel') {
    const v = buildTriadVoicing('C4', 'major', 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'second',
      rootKeyId: 'C4',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'secondInversionGuided') {
    const v = buildTriadVoicing('C4', 'major', 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'second',
      rootKeyId: 'C4',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'secondInversionQualify') {
    const v = buildTriadVoicing('C4', 'major', 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'second',
      rootKeyId: 'C4',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds]
    };
  }

  if (step === 'secondInversionLocalMix') {
    const mixItems = [
      { root: 'F3', quality: 'major' as TriadQuality },
      { root: 'D4', quality: 'minor' as TriadQuality },
      { root: 'G#3', quality: 'major' as TriadQuality }
    ];
    const successCount = localMixSuccessCount;
    const item = mixItems[successCount % mixItems.length];
    const v = buildTriadVoicing(item.root, item.quality, 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: item.quality,
      inversion: 'second',
      rootKeyId: item.root,
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds],
      localMixSuccessCount: successCount,
      localMixTarget: 3
    };
  }

  if (step === 'secondInversionDelayedCheck') {
    const rec = progress[INVERSION_ITEM_IDS.BUILD_SECOND];
    const hasCorrective = rec?.contexts?.includes('pending:corrective');
    const hasIntervening = rec?.contexts?.includes('pending:interveningRecall');
    const v = buildTriadVoicing('C4', 'major', 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: 'major',
      inversion: 'second',
      rootKeyId: 'C4',
      targetKeyIds: hasCorrective ? [...v.keyIds] : [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: hasCorrective ? [v.bassKeyId] : [],
      awaitingCorrective: Boolean(hasCorrective),
      isInterveningRecall: Boolean(hasIntervening),
      feedbackText: hasCorrective ? `Нажмите подсвеченные клавиши 2-го обращения (${v.keyIds.join(' + ')}).` : undefined,
      feedbackTone: hasCorrective ? 'bad' : undefined
    };
  }

  if (step === 'inversionContrast') {
    const v = buildTriadVoicing('C4', 'major', 'root');
    return {
      ...baseState,
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: ['C4']
    };
  }

  if (step === 'inversionIdentifyModel') {
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionIdentify',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'inversionIdentifyQualify') {
    const v = buildTriadVoicing('C4', 'major', 'first');
    return {
      ...baseState,
      activeSkill: 'triadInversionIdentify',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'inversionIdentifyDelayedCheck') {
    const rec = progress[INVERSION_ITEM_IDS.IDENTIFY];
    const hasCorrective = rec?.contexts?.includes('pending:corrective');
    const hasIntervening = rec?.contexts?.includes('pending:interveningRecall');
    const v = buildTriadVoicing('C4', 'major', 'second');
    return {
      ...baseState,
      activeSkill: 'triadInversionIdentify',
      quality: 'major',
      inversion: 'second',
      rootKeyId: 'C4',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId],
      awaitingCorrective: Boolean(hasCorrective),
      isInterveningRecall: Boolean(hasIntervening),
      feedbackText: hasCorrective ? `Это второе обращение (${v.keyIds.join(' + ')}). Нажмите кнопку «2-е обращение».` : undefined,
      feedbackTone: hasCorrective ? 'bad' : undefined
    };
  }

  if (step === 'chordSymbolOrientation') {
    return {
      ...baseState,
      targetKeyIds: ['C4', 'E4', 'G4']
    };
  }

  if (step === 'slashChordModel') {
    const v = buildTriadVoicing('G3', 'major', 'first'); // G/B
    return {
      ...baseState,
      activeSkill: 'chordSymbolRead',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'G3',
      symbol: 'G/B',
      targetKeyIds: [...v.keyIds],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'slashChordGuided') {
    const v = buildTriadVoicing('G3', 'major', 'first'); // G/B
    return {
      ...baseState,
      activeSkill: 'chordSymbolRead',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'G3',
      symbol: 'G/B',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: [v.bassKeyId]
    };
  }

  if (step === 'slashChordQualify') {
    const v = buildTriadVoicing('C4', 'major', 'first'); // C/E
    return {
      ...baseState,
      activeSkill: 'chordSymbolRead',
      quality: 'major',
      inversion: 'first',
      rootKeyId: 'C4',
      symbol: 'C/E',
      targetKeyIds: [],
      expectedVoicingKeyIds: [...v.keyIds]
    };
  }

  if (step === 'slashChordDelayedCheck') {
    const rec = progress[INVERSION_ITEM_IDS.BUILD_SLASH];
    const hasCorrective = rec?.contexts?.includes('pending:corrective');
    const hasIntervening = rec?.contexts?.includes('pending:interveningRecall');
    const v = buildTriadVoicing('A3', 'minor', 'first'); // Am/C
    return {
      ...baseState,
      activeSkill: 'chordSymbolRead',
      quality: 'minor',
      inversion: 'first',
      rootKeyId: 'A3',
      symbol: 'Am/C',
      targetKeyIds: hasCorrective ? [...v.keyIds] : [],
      expectedVoicingKeyIds: [...v.keyIds],
      structuralGuideKeyIds: hasCorrective ? [v.bassKeyId] : [],
      awaitingCorrective: Boolean(hasCorrective),
      isInterveningRecall: Boolean(hasIntervening),
      feedbackText: hasCorrective ? `Нажмите клавиши Am/C (${v.keyIds.join(' + ')}).` : undefined,
      feedbackTone: hasCorrective ? 'bad' : undefined
    };
  }

  if (step === 'harmonySequence') {
    const rec = progress[INVERSION_ITEM_IDS.HARMONY_SEQUENCE];
    const curIdx = rec?.independentUnhintedSuccesses ?? 0;
    const currentStep = CANONICAL_HARMONY_SEQUENCE[curIdx % CANONICAL_HARMONY_SEQUENCE.length];
    return {
      ...baseState,
      activeSkill: 'triadInversionBuild',
      quality: currentStep.quality,
      inversion: currentStep.inversion,
      rootKeyId: currentStep.rootKeyId,
      symbol: currentStep.symbol,
      targetKeyIds: [],
      expectedVoicingKeyIds: [...currentStep.voicing],
      harmonyStepIndex: curIdx
    };
  }

  if (step === 'inversionTransfer' || step === 'inversionTransferRemediation') {
    const isRemediation = step === 'inversionTransferRemediation';
    const trialIndex = isRemediation
      ? assessment.remediationTrialIndexes[assessment.remediationIndex] ?? 0
      : hasPendingTransferCorrective
        ? Math.max(0, assessment.trialsCompleted - 1)
        : assessment.trialsCompleted;
    const trial = buildInversionTransferTrial(trialIndex, assessment.blockKind);
    const feedback = hasPendingTransferCorrective
      ? `Нажмите подсвеченные клавиши (${trial.expectedKeyIds.join(' + ')}).`
      : undefined;

    return {
      ...baseState,
      activeSkill: trial.skill,
      quality: trial.quality,
      inversion: trial.inversion,
      rootKeyId: trial.rootKeyId,
      symbol: trial.symbol,
      targetKeyIds: hasPendingTransferCorrective || trial.skill === 'triadInversionIdentify' ? [...trial.expectedKeyIds] : [],
      expectedVoicingKeyIds: [...trial.expectedKeyIds],
      structuralGuideKeyIds: hasPendingTransferCorrective || trial.skill === 'triadInversionIdentify'
        ? [trial.bassKeyId]
        : [],
      awaitingCorrective: hasPendingTransferCorrective,
      feedbackText: feedback,
      feedbackTone: hasPendingTransferCorrective ? 'bad' : undefined,
      transferBlockPhase: assessment.phase
    };
  }

  if (step === 'inversionTransferResult') return { ...baseState, transferBlockPhase: 'result' };

  return baseState;
}

export type InversionAction =
  | { type: 'toggleKey'; keyId: string }
  | { type: 'submitChord'; keyIds?: readonly string[] }
  | { type: 'selectAnswer'; inversion: TriadInversion }
  | { type: 'dontKnow' }
  | { type: 'advanceStage' }
  | { type: 'resetModule' };

export interface ApplyInversionActionResult {
  state: InversionCurriculumState;
  updatedProgress: LearningProgressRecord[];
  mutatedCard?: Card;
  attemptResult?: SubmitQuestionAttemptResult;
  outcome?: InversionAnswerOutcome | 'advance' | 'dont_know';
}

function finishTransferBlock(
  rec: LearningProgressRecord,
  progress: Record<string, LearningProgressRecord>,
  now: number,
  outcome: InversionAnswerOutcome | 'dont_know' = 'correct'
): ApplyInversionActionResult {
  const assessment = rec.transferAssessment ?? legacyTransferAssessment(rec);
  const isPassed = assessment.trialsCompleted === transferBlockSize(assessment.blockKind) &&
    assessment.correctFirstAttempts / Math.max(1, assessment.trialsCompleted) >= INVERSION_TRANSFER_REQUIRED_ACCURACY &&
    hasRequiredTransferCoverage(assessment.coverageTags);
  const nextAssessment = { ...assessment, pendingCorrective: false, phase: isPassed ? 'passed' as const : 'result' as const };
  const nextRec: LearningProgressRecord = {
    ...rec,
    state: isPassed ? 'retention' : rec.state,
    transferAssessment: nextAssessment,
    updatedAt: now
  };
  progress[INVERSION_ITEM_IDS.TRANSFER] = nextRec;
  const updatedProgress = [nextRec];
  if (isPassed) {
    const complete = progress[INVERSION_ITEM_IDS.COMPLETE] ?? createInitialLearningProgress(INVERSION_ITEM_IDS.COMPLETE, now);
    const completedRecord = { ...complete, state: 'retention' as const, updatedAt: now };
    progress[INVERSION_ITEM_IDS.COMPLETE] = completedRecord;
    updatedProgress.push(completedRecord);
  }
  return {
    state: withInversionSuccessFeedback(
      buildInversionStateForStep(isPassed ? 'moduleComplete' : 'inversionTransferResult', progress, now),
      isPassed ? 'Верно. Условие проверки выполнено.' : 'Последний ответ исправлен. Точность считается по первым ответам.'
    ),
    updatedProgress,
    outcome
  };
}

function applyTransferResponse(
  currentState: InversionCurriculumState,
  progress: Record<string, LearningProgressRecord>,
  params: { isCorrect: boolean; outcome: InversionAnswerOutcome | 'dont_know'; feedbackText?: string },
  now: number
): ApplyInversionActionResult {
  const recId = INVERSION_ITEM_IDS.TRANSFER;
  let rec = progress[recId] || createInitialLearningProgress(recId, now);
  let assessment = rec.transferAssessment ?? legacyTransferAssessment(rec);
  const isRemediation = currentState.step === 'inversionTransferRemediation';

  if (isRemediation) {
    if (!params.isCorrect) {
      return {
        state: { ...currentState, selectedKeyIds: [], feedbackText: params.feedbackText ?? 'Попробуйте ещё раз.', feedbackTone: 'bad' },
        updatedProgress: [],
        outcome: params.outcome
      };
    }
    const nextRemediationIndex = assessment.remediationIndex + 1;
    if (nextRemediationIndex >= assessment.remediationTrialIndexes.length) {
      assessment = {
        ...assessment,
        blockNumber: assessment.blockNumber + 1,
        blockKind: 'retry',
        phase: 'active',
        trialsCompleted: 0,
        correctFirstAttempts: 0,
        coverageTags: [],
        failedTrialIndexes: [],
        remediationTrialIndexes: [],
        remediationIndex: 0,
        pendingCorrective: false
      };
      rec = {
        ...rec,
        contexts: (rec.contexts ?? []).filter((tag) => tag !== 'pending:inversionTransferCorrective'),
        transferAssessment: assessment,
        updatedAt: now
      };
      progress[recId] = rec;
      return {
        state: withInversionSuccessFeedback(
          buildInversionStateForStep('inversionTransfer', progress, now),
          'Закрепление завершено. Началась новая проверка из 8 заданий.'
        ),
        updatedProgress: [rec],
        outcome: 'correct'
      };
    }
    assessment = { ...assessment, remediationIndex: nextRemediationIndex };
    rec = { ...rec, transferAssessment: assessment, updatedAt: now };
    progress[recId] = rec;
    return {
      state: withInversionSuccessFeedback(
        buildInversionStateForStep('inversionTransferRemediation', progress, now),
        'Верно. Закрепление продолжается.'
      ),
      updatedProgress: [rec],
      outcome: 'correct'
    };
  }

  if (currentState.awaitingCorrective) {
    if (!params.isCorrect) {
      return {
        state: { ...currentState, selectedKeyIds: [], feedbackText: params.feedbackText ?? 'Повторите правильный ответ, чтобы перейти дальше.', feedbackTone: 'bad' },
        updatedProgress: [],
        outcome: params.outcome
      };
    }
    const migratedLegacyPending = !rec.transferAssessment && hasPendingTransferCorrective(rec);
    assessment = { ...assessment, pendingCorrective: false };
    rec = {
      ...rec,
      contexts: (rec.contexts ?? []).filter((tag) => tag !== 'pending:inversionTransferCorrective'),
      transferLifetimeTrials: migratedLegacyPending
        ? (rec.transferLifetimeTrials ?? rec.guidedSuccesses ?? 0) + 1
        : rec.transferLifetimeTrials,
      transferAssessment: assessment,
      updatedAt: now
    };
    progress[recId] = rec;
    if (assessment.trialsCompleted >= transferBlockSize(assessment.blockKind)) {
      return finishTransferBlock(rec, progress, now, 'correct');
    }
    return {
      state: withInversionSuccessFeedback(
        buildInversionStateForStep('inversionTransfer', progress, now),
        'Ответ исправлен. Он не меняет точность с первой попытки.'
      ),
      updatedProgress: [rec],
      outcome: 'correct'
    };
  }

  if (assessment.phase !== 'active') {
    return { state: currentState, updatedProgress: [] };
  }

  const trialIndex = assessment.trialsCompleted;
  const trial = buildInversionTransferTrial(trialIndex, assessment.blockKind);
  const coverageTags = [...assessment.coverageTags];
  const contexts = [...(rec.contexts ?? [])];
  for (const tag of getTransferTrialCoverageTags(trial)) {
    if (!coverageTags.includes(tag)) coverageTags.push(tag);
    if (!contexts.includes(tag)) contexts.push(tag);
  }
  const failedTrialIndexes = params.isCorrect
    ? [...assessment.failedTrialIndexes]
    : [...assessment.failedTrialIndexes, trialIndex];
  assessment = {
    ...assessment,
    trialsCompleted: assessment.trialsCompleted + 1,
    correctFirstAttempts: assessment.correctFirstAttempts + (params.isCorrect ? 1 : 0),
    coverageTags,
    failedTrialIndexes,
    pendingCorrective: !params.isCorrect
  };
  if (!params.isCorrect && !contexts.includes('pending:inversionTransferCorrective')) {
    contexts.push('pending:inversionTransferCorrective');
  }
  rec = {
    ...rec,
    contexts,
    transferLifetimeTrials: (rec.transferLifetimeTrials ?? rec.guidedSuccesses ?? 0) + 1,
    transferLifetimeCorrectFirstAttempts: (rec.transferLifetimeCorrectFirstAttempts ?? rec.independentUnhintedSuccesses ?? 0) + (params.isCorrect ? 1 : 0),
    transferAssessment: assessment,
    updatedAt: now
  };
  progress[recId] = rec;

  if (params.isCorrect && assessment.trialsCompleted >= transferBlockSize(assessment.blockKind)) {
    return finishTransferBlock(rec, progress, now, params.outcome);
  }
  return {
    state: withInversionSuccessFeedback(
      buildInversionStateForStep('inversionTransfer', progress, now),
      'Верно. Следующее задание проверки.'
    ),
    updatedProgress: [rec],
    outcome: params.outcome
  };
}

export function applyInversionAction(
  currentState: InversionCurriculumState,
  action: InversionAction,
  options?: {
    now?: number;
    settings?: UserSettings;
    reviewLogs?: readonly ReviewLogEvent[];
    card?: Card;
    sessionId?: string | null;
  }
): ApplyInversionActionResult {
  const now = options?.now ?? Date.now();
  const progress = { ...currentState.progress };

  if (action.type === 'toggleKey') {
    if (!canInputInversionChord(currentState)) {
      return {
        state: {
          ...currentState,
          feedbackText: 'Сейчас клавиши показаны как пример. Нажмите «Продолжить», чтобы перейти к построению.',
          feedbackTone: 'info'
        },
        updatedProgress: []
      };
    }
    const cur = currentState.selectedKeyIds;
    let next: string[];
    if (cur.includes(action.keyId)) {
      next = cur.filter((k) => k !== action.keyId);
    } else if (cur.length < 3) {
      next = [...cur, action.keyId];
    } else {
      next = [...cur];
    }
    return {
      state: {
        ...currentState,
        selectedKeyIds: next
      },
      updatedProgress: []
    };
  }

  if (action.type === 'advanceStage') {
    let recId: string | null = null;
    let nextStep: InversionStep = currentState.step;

    if (currentState.step === 'inversionOrientation') {
      recId = INVERSION_ITEM_IDS.ORIENTATION;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: 1,
        independentUnhintedSuccesses: 1,
        updatedAt: now
      };
      progress[recId] = rec;
      nextStep = 'firstInversionModel';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'firstInversionModel') {
      recId = INVERSION_ITEM_IDS.BUILD_FIRST;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'introduced', modelCompleted: true, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'firstInversionGuided';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'secondInversionModel') {
      recId = INVERSION_ITEM_IDS.BUILD_SECOND;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'introduced', modelCompleted: true, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'secondInversionGuided';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'inversionContrast') {
      recId = INVERSION_ITEM_IDS.CONTRAST;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'retention', modelCompleted: true, guidedSuccesses: 1, independentUnhintedSuccesses: 1, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'inversionIdentifyModel';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'inversionIdentifyModel') {
      recId = INVERSION_ITEM_IDS.IDENTIFY;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'guided', modelCompleted: true, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'inversionIdentifyQualify';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'chordSymbolOrientation') {
      recId = INVERSION_ITEM_IDS.CHORD_SYMBOLS;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'retention', modelCompleted: true, guidedSuccesses: 1, independentUnhintedSuccesses: 1, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'slashChordModel';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'slashChordModel') {
      recId = INVERSION_ITEM_IDS.BUILD_SLASH;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = { ...rec, state: 'introduced', modelCompleted: true, updatedAt: now };
      progress[recId] = rec;
      nextStep = 'slashChordGuided';
      return {
        state: buildInversionStateForStep(nextStep, progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    if (currentState.step === 'inversionTransferResult') {
      const recId = INVERSION_ITEM_IDS.TRANSFER;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      const assessment = rec.transferAssessment ?? legacyTransferAssessment(rec);
      const sourceCycle = assessment.blockKind === 'retry' ? INVERSION_TRANSFER_RETRY_CYCLE : INVERSION_TRANSFER_CYCLE;
      const remediationTrialIndexes = [...new Set(assessment.failedTrialIndexes)]
        .filter((index) => Number.isInteger(index) && index >= 0 && index < sourceCycle.length)
        .slice(0, 4);
      if (remediationTrialIndexes.length === 0) remediationTrialIndexes.push(0, 1, 2, 3);
      rec = {
        ...rec,
        contexts: (rec.contexts ?? []).filter((tag) => tag !== 'pending:inversionTransferCorrective'),
        transferAssessment: {
          ...assessment,
          phase: 'remediation',
          pendingCorrective: false,
          remediationTrialIndexes,
          remediationIndex: 0
        },
        updatedAt: now
      };
      progress[recId] = rec;
      return {
        state: buildInversionStateForStep('inversionTransferRemediation', progress, now),
        updatedProgress: [rec],
        outcome: 'advance'
      };
    }

    return { state: currentState, updatedProgress: [] };
  }

  // Handle chord submission for build steps, slash steps, harmony sequence, or transfer
  if (action.type === 'submitChord') {
    if (!canInputInversionChord(currentState)) {
      return {
        state: {
          ...currentState,
          feedbackText: 'Сейчас показан пример. Нажмите «Продолжить», чтобы перейти к построению аккорда.',
          feedbackTone: 'info'
        },
        updatedProgress: []
      };
    }
    const keys = action.keyIds ?? currentState.selectedKeyIds;
    if (keys.length !== 3) {
      return {
        state: {
          ...currentState,
          feedbackText: 'Нужно сыграть или выбрать полный аккорд из трёх нот. Незавершённый ввод не засчитывается.',
          feedbackTone: 'info'
        },
        updatedProgress: [],
        outcome: 'incomplete_chord'
      };
    }
    const classification = classifyTriadInversionAnswer(
      keys,
      currentState.rootKeyId ?? 'C4',
      currentState.quality ?? 'major',
      currentState.inversion ?? 'first',
      currentState.expectedVoicingKeyIds,
      currentState.symbol
    );
    const isCorrect = classification.outcome === 'correct';

    // Harmony sequence step
    if (currentState.step === 'harmonySequence') {
      const recId = INVERSION_ITEM_IDS.HARMONY_SEQUENCE;
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      if (isCorrect) {
        const nextIdx = currentState.harmonyStepIndex + 1;
        if (nextIdx >= CANONICAL_HARMONY_SEQUENCE.length) {
          rec = { ...rec, state: 'retention', modelCompleted: true, guidedSuccesses: nextIdx, independentUnhintedSuccesses: nextIdx, updatedAt: now };
          progress[recId] = rec;
          return {
            state: withInversionSuccessFeedback(
              buildInversionStateForStep('inversionTransfer', progress, now),
              'Верно. Гармоническая последовательность завершена.'
            ),
            updatedProgress: [rec],
            outcome: 'correct'
          };
        }
        rec = { ...rec, independentUnhintedSuccesses: nextIdx, updatedAt: now };
        progress[recId] = rec;
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep('harmonySequence', progress, now),
            `Верно. Следующий аккорд: ${CANONICAL_HARMONY_SEQUENCE[nextIdx].symbol}.`
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      return {
        state: {
          ...currentState,
          selectedKeyIds: [],
          feedbackText: classification.feedbackText,
          feedbackTone: 'bad'
        },
        updatedProgress: [],
        outcome: classification.outcome
      };
    }

    if (currentState.step === 'inversionTransfer' || currentState.step === 'inversionTransferRemediation') {
      return applyTransferResponse(currentState, progress, {
        isCorrect,
        outcome: classification.outcome,
        feedbackText: classification.feedbackText
      }, now);
    }

    // Curriculum stages
    let targetRecId: string = INVERSION_ITEM_IDS.BUILD_FIRST;
    if (currentState.step.startsWith('secondInversion')) targetRecId = INVERSION_ITEM_IDS.BUILD_SECOND;
    else if (currentState.step.startsWith('slashChord')) targetRecId = INVERSION_ITEM_IDS.BUILD_SLASH;

    let rec = progress[targetRecId] || createInitialLearningProgress(targetRecId, now);

    if (currentState.awaitingCorrective) {
      if (isCorrect) {
        let nextContexts = (rec.contexts ?? []).filter((c) => c !== 'pending:corrective');
        if (!nextContexts.includes('pending:interveningRecall')) {
          nextContexts.push('pending:interveningRecall');
        }
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[targetRecId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      return {
        state: {
          ...currentState,
          selectedKeyIds: [],
          feedbackText: classification.feedbackText,
          feedbackTone: 'bad'
        },
        updatedProgress: [],
        outcome: classification.outcome
      };
    }

    if (currentState.isInterveningRecall) {
      if (isCorrect) {
        let nextContexts = (rec.contexts ?? []).filter((c) => c !== 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[targetRecId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      return {
        state: {
          ...currentState,
          selectedKeyIds: [],
          feedbackText: classification.feedbackText,
          feedbackTone: 'bad'
        },
        updatedProgress: [],
        outcome: classification.outcome
      };
    }

    // Normal first attempt on curriculum step
    if (isCorrect) {
      if (currentState.step.endsWith('Guided')) {
        rec = { ...rec, state: 'guided', guidedSuccesses: (rec.guidedSuccesses ?? 0) + 1, updatedAt: now };
        progress[targetRecId] = rec;
        const nextStep = deriveInversionStep(progress);
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(nextStep, progress, now),
            'Верно. Аккорд построен правильно.'
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      if (currentState.step.endsWith('Qualify')) {
        rec = { ...rec, state: 'qualifying', independentUnhintedSuccesses: (rec.independentUnhintedSuccesses ?? 0) + 1, updatedAt: now };
        progress[targetRecId] = rec;
        const nextStep = deriveInversionStep(progress);
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(nextStep, progress, now),
            'Верно. Самостоятельное построение засчитано.'
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      if (currentState.step.endsWith('LocalMix')) {
        const nextCount = currentState.localMixSuccessCount + 1;
        if (nextCount >= 3) {
          rec = { ...rec, state: 'mixReady', independentUnhintedSuccesses: nextCount, updatedAt: now };
          progress[targetRecId] = rec;
          const nextStep = deriveInversionStep(progress);
          return {
            state: withInversionSuccessFeedback(
              buildInversionStateForStep(nextStep, progress, now),
              'Верно. Практический пример засчитан.'
            ),
            updatedProgress: [rec],
            outcome: 'correct'
          };
        }
        rec = { ...rec, independentUnhintedSuccesses: nextCount, updatedAt: now };
        progress[targetRecId] = rec;
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(currentState.step, progress, now, nextCount),
            `Верно. В этой практике ${nextCount} из 3.`
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      if (currentState.step.endsWith('DelayedCheck')) {
        let nextContexts = (rec.contexts ?? []).filter((c) => !c.startsWith('pending:'));
        rec = {
          ...rec,
          state: 'retention',
          contexts: nextContexts,
          firstFsrsEligibleAt: now,
          updatedAt: now
        };
        progress[targetRecId] = rec;
        const nextStep = deriveInversionStep(progress);
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(nextStep, progress, now),
            'Верно. Проверка по памяти пройдена.'
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
    } else {
      // Wrong attempt on curriculum step
      if (currentState.step.endsWith('DelayedCheck')) {
        let nextContexts = [...(rec.contexts ?? [])];
        ['pending:delayedRetry', 'pending:corrective'].forEach((c) => {
          if (!nextContexts.includes(c)) nextContexts.push(c);
        });
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[targetRecId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: classification.outcome
        };
      }
      return {
        state: {
          ...currentState,
          selectedKeyIds: [],
          feedbackText: classification.feedbackText,
          feedbackTone: 'bad'
        },
        updatedProgress: [],
        outcome: classification.outcome
      };
    }
  }

  // Handle identify answer button click (1: root, 2: first, 3: second)
  if (action.type === 'selectAnswer') {
    if (!canSelectInversionAnswer(currentState)) {
      return {
        state: {
          ...currentState,
          feedbackText: 'Сначала посмотрите пример и нажмите «Продолжить».',
          feedbackTone: 'info'
        },
        updatedProgress: []
      };
    }
    const isCorrect = action.inversion === currentState.inversion;

    if (currentState.step === 'inversionTransfer' || currentState.step === 'inversionTransferRemediation') {
      return applyTransferResponse(currentState, progress, {
        isCorrect,
        outcome: isCorrect ? 'correct' : 'wrong_inversion',
        feedbackText: 'Неверно. Найдите самую низкую ноту и определите обращение.'
      }, now);
    }

    const recId = INVERSION_ITEM_IDS.IDENTIFY;
    let rec = progress[recId] || createInitialLearningProgress(recId, now);

    if (currentState.awaitingCorrective) {
      if (isCorrect) {
        let nextContexts = (rec.contexts ?? []).filter((c) => c !== 'pending:corrective');
        if (!nextContexts.includes('pending:interveningRecall')) {
          nextContexts.push('pending:interveningRecall');
        }
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      return {
        state: { ...currentState, feedbackText: 'Неверно. Выберите правильное обращение.', feedbackTone: 'bad' },
        updatedProgress: [],
        outcome: 'wrong_inversion'
      };
    }

    if (currentState.isInterveningRecall) {
      if (isCorrect) {
        let nextContexts = (rec.contexts ?? []).filter((c) => c !== 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      return {
        state: { ...currentState, feedbackText: 'Неверно. Выберите правильное обращение.', feedbackTone: 'bad' },
        updatedProgress: [],
        outcome: 'wrong_inversion'
      };
    }

    if (isCorrect) {
      if (currentState.step === 'inversionIdentifyQualify') {
        rec = { ...rec, state: 'mixReady', independentUnhintedSuccesses: (rec.independentUnhintedSuccesses ?? 0) + 1, updatedAt: now };
        progress[recId] = rec;
        const nextStep = deriveInversionStep(progress);
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(nextStep, progress, now),
            'Верно. Бас соответствует нужному обращению.'
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
      if (currentState.step === 'inversionIdentifyDelayedCheck') {
        let nextContexts = (rec.contexts ?? []).filter((c) => !c.startsWith('pending:'));
        rec = { ...rec, state: 'retention', contexts: nextContexts, firstFsrsEligibleAt: now, updatedAt: now };
        progress[recId] = rec;
        const nextStep = deriveInversionStep(progress);
        return {
          state: withInversionSuccessFeedback(
            buildInversionStateForStep(nextStep, progress, now),
            'Верно. Проверка по памяти пройдена.'
          ),
          updatedProgress: [rec],
          outcome: 'correct'
        };
      }
    } else {
      if (currentState.step === 'inversionIdentifyDelayedCheck') {
        let nextContexts = [...(rec.contexts ?? [])];
        ['pending:delayedRetry', 'pending:corrective'].forEach((c) => {
          if (!nextContexts.includes(c)) nextContexts.push(c);
        });
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        return {
          state: buildInversionStateForStep(currentState.step, progress, now),
          updatedProgress: [rec],
          outcome: 'wrong_inversion'
        };
      }
      return {
        state: { ...currentState, feedbackText: 'Неверно. Посмотрите, какой звук находится в самом низу.', feedbackTone: 'bad' },
        updatedProgress: [],
        outcome: 'wrong_inversion'
      };
    }
  }

  // Handle Don't Know (0 FSRS mutations)
  if (action.type === 'dontKnow') {
    if (currentState.step === 'inversionTransfer' && !currentState.awaitingCorrective) {
      return applyTransferResponse(currentState, progress, {
        isCorrect: false,
        outcome: 'dont_know',
        feedbackText: 'Ответ отмечен как неверный с первой попытки. Посмотрите подсказку и повторите задание.'
      }, now);
    }
    let recId: string = INVERSION_ITEM_IDS.BUILD_FIRST;
    if (currentState.step.startsWith('secondInversion')) recId = INVERSION_ITEM_IDS.BUILD_SECOND;
    else if (currentState.step.startsWith('inversionIdentify')) recId = INVERSION_ITEM_IDS.IDENTIFY;
    else if (currentState.step.startsWith('slashChord')) recId = INVERSION_ITEM_IDS.BUILD_SLASH;
    else if (currentState.step === 'inversionTransfer') recId = INVERSION_ITEM_IDS.TRANSFER;

    let rec = progress[recId] || createInitialLearningProgress(recId, now);
    let nextContexts = [...(rec.contexts ?? [])];
    const flag = recId === INVERSION_ITEM_IDS.TRANSFER ? 'pending:inversionTransferCorrective' : 'pending:corrective';
    if (!nextContexts.includes(flag)) nextContexts.push(flag);
    if (recId !== INVERSION_ITEM_IDS.TRANSFER && !nextContexts.includes('pending:delayedRetry')) {
      nextContexts.push('pending:delayedRetry');
    }
    rec = { ...rec, contexts: nextContexts, updatedAt: now };
    progress[recId] = rec;

    return {
      state: buildInversionStateForStep(currentState.step, progress, now),
      updatedProgress: [rec],
      outcome: 'dont_know'
    };
  }

  if (action.type === 'resetModule') {
    const cleared: LearningProgressRecord[] = [];
    Object.values(INVERSION_ITEM_IDS).forEach((id) => {
      const rec = createInitialLearningProgress(id, now);
      progress[id] = rec;
      cleared.push(rec);
    });
    return {
      state: buildInversionStateForStep('inversionOrientation', progress, now),
      updatedProgress: cleared
    };
  }

  return { state: currentState, updatedProgress: [] };
}

export function createInversionCurriculumState(
  input?: ProgressCollectionInput | { learningProgress?: ProgressCollectionInput },
  now = Date.now()
): InversionCurriculumState {
  const map = normalizeProgressMap(input);
  const progress: Record<string, LearningProgressRecord> = {};
  const allItemIds = Object.values(INVERSION_ITEM_IDS);

  for (const id of allItemIds) {
    const existing = map.get(id);
    progress[id] = existing
      ? {
          ...existing,
          contexts: [...(existing.contexts ?? [])],
          transferAssessment: existing.transferAssessment
            ? {
                ...existing.transferAssessment,
                coverageTags: [...existing.transferAssessment.coverageTags],
                failedTrialIndexes: [...existing.transferAssessment.failedTrialIndexes],
                remediationTrialIndexes: [...existing.transferAssessment.remediationTrialIndexes]
              }
            : undefined
        }
      : createInitialLearningProgress(id, now);
  }

  const step = deriveInversionStep(progress);
  return buildInversionStateForStep(step, progress, now);
}

export function canUseDontKnowInInversionStep(state: InversionCurriculumState): boolean {
  if (state.awaitingCorrective) return false;
  if (
    state.step === 'inversionOrientation' ||
    state.step === 'inversionContrast' ||
    state.step === 'chordSymbolOrientation' ||
    state.step === 'harmonySequence' ||
    state.step === 'inversionTransferResult' ||
    state.step === 'inversionTransferRemediation' ||
    state.step === 'moduleComplete'
  ) {
    return false;
  }
  if (state.step.endsWith('Model')) return false;
  return true;
}

export function resolveInversionKeydownAction(
  state: InversionCurriculumState,
  key: string,
  code: string
):
  | { type: 'advanceStage' }
  | { type: 'selectAnswer'; inversion: TriadInversion }
  | { type: 'submitChord' }
  | { type: 'dontKnow' }
  | null {
  if (key === 'Enter') {
    if (
      state.step === 'inversionOrientation' ||
      state.step === 'inversionContrast' ||
      state.step === 'chordSymbolOrientation' ||
      state.step.endsWith('Model')
    ) {
      return { type: 'advanceStage' };
    }
    if (canInputInversionChord(state) && state.selectedKeyIds.length === 3) {
      return { type: 'submitChord' };
    }
    return null;
  }

  // Answer shortcuts 1 (Root), 2 (First), 3 (Second) for triadInversionIdentify
  if (canSelectInversionAnswer(state)) {
    if (key === '1' || code === 'Digit1' || code === 'Numpad1') {
      return { type: 'selectAnswer', inversion: 'root' };
    }
    if (key === '2' || code === 'Digit2' || code === 'Numpad2') {
      return { type: 'selectAnswer', inversion: 'first' };
    }
    if (key === '3' || code === 'Digit3' || code === 'Numpad3') {
      return { type: 'selectAnswer', inversion: 'second' };
    }
  }

  return null;
}

