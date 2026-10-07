import type {
  Card,
  Skill,
  TriadQualityId,
  UserSettings,
  ReviewKind,
  ReviewLogEvent
} from '../fsrs/types';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import {
  appendUniqueContext,
  createInitialLearningProgress,
  markFsrsActivated,
  recordModelCompleted
} from './progress';
import { createTrialContext } from './trialPolicy';
import {
  HINT_LEVEL,
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
import { areChordKeyIdsEqual, sortKeyIdsByPitch } from '../input/chordInput';

function toFsrsSettings(settings?: UserSettings) {
  return {
    desiredRetention: settings?.desiredRetention ?? 0.9,
    maxIntervalDays: settings?.maxIntervalDays ?? 36500,
    relearningSeconds: settings?.relearningSeconds ?? 600,
    useLatencyGrading: settings?.useLatencyGrading ?? true
  };
}

export type TriadQuality = TriadQualityId;

export interface TriadDefinition {
  id: TriadQuality;
  nameRu: string;
  code: string;
  rootToThird: number; // 4 for major, 3 for minor
  rootToFifth: number; // 7 for both
  description: string;
}

export const TRIAD_DEFINITIONS: Record<TriadQuality, TriadDefinition> = {
  major: {
    id: 'major',
    nameRu: 'Мажорное трезвучие',
    code: 'Major',
    rootToThird: 4,
    rootToFifth: 7,
    description: 'Основной тон + большая терция (4 полутона) + чистая квинта (7 полутонов).'
  },
  minor: {
    id: 'minor',
    nameRu: 'Минорное трезвучие',
    code: 'Minor',
    rootToThird: 3,
    rootToFifth: 7,
    description: 'Основной тон + малая терция (3 полутона) + чистая квинта (7 полутонов).'
  }
};

export const TRIAD_ITEM_IDS = {
  ORIENTATION: 'advanced-triad:orientation',
  BUILD_MAJOR: 'advanced-triad-build:major',
  BUILD_MINOR: 'advanced-triad-build:minor',
  CONTRAST: 'advanced-triad:contrast-major-minor',
  IDENTIFY_MAJOR: 'advanced-triad-identify:major',
  IDENTIFY_MINOR: 'advanced-triad-identify:minor',
  TRANSFER: 'advanced-triad:transfer',
  COMPLETE: 'advanced-triad:complete'
} as const;

export type TriadStep =
  | 'triadOrientation'
  | 'majorBuildModel'
  | 'majorBuildGuided'
  | 'majorBuildQualify'
  | 'majorBuildLocalMix'
  | 'majorBuildDelayedCheck'
  | 'minorBuildModel'
  | 'minorBuildGuided'
  | 'minorBuildQualify'
  | 'minorBuildLocalMix'
  | 'minorBuildDelayedCheck'
  | 'contrastMajorMinor'
  | 'majorIdentifyModel'
  | 'majorIdentifyQualify'
  | 'majorIdentifyDelayedCheck'
  | 'minorIdentifyModel'
  | 'minorIdentifyQualify'
  | 'minorIdentifyDelayedCheck'
  | 'triadTransfer'
  | 'moduleComplete';

export const TRIAD_STEPS: readonly TriadStep[] = [
  'triadOrientation',
  'majorBuildModel',
  'majorBuildGuided',
  'majorBuildQualify',
  'majorBuildLocalMix',
  'majorBuildDelayedCheck',
  'minorBuildModel',
  'minorBuildGuided',
  'minorBuildQualify',
  'minorBuildLocalMix',
  'minorBuildDelayedCheck',
  'contrastMajorMinor',
  'majorIdentifyModel',
  'majorIdentifyQualify',
  'majorIdentifyDelayedCheck',
  'minorIdentifyModel',
  'minorIdentifyQualify',
  'minorIdentifyDelayedCheck',
  'triadTransfer',
  'moduleComplete'
] as const;

export const TRIAD_TRANSFER_MIN_TRIALS = 12;
export const TRIAD_TRANSFER_REQUIRED_ACCURACY = 0.8;

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

export function getTriadDefinition(quality: TriadQuality): TriadDefinition {
  return TRIAD_DEFINITIONS[quality];
}

/**
 * Returns available roots for triads where root, third, and fifth stay within C2–C6 (MIDI 36..84).
 * Preferred roots are in C3–B4 (MIDI 48..71).
 */
export function getValidTriadRoots(quality: TriadQuality = 'major', includeChromatic = true): string[] {
  const def = TRIAD_DEFINITIONS[quality] || TRIAD_DEFINITIONS.major;
  const roots: string[] = [];

  for (let midi = 48; midi <= 71; midi++) {
    const fifthMidi = midi + def.rootToFifth;
    const thirdMidi = midi + def.rootToThird;
    if (fifthMidi <= 84 && thirdMidi <= 84) {
      const note = pitchClassFromMidi(midi);
      if (includeChromatic || !note.includes('#')) {
        roots.push(keyIdFromMidi(midi));
      }
    }
  }
  return roots.length > 0 ? roots : ['C4'];
}

/**
 * Canonical rotating list of roots for triads in Daily Practice.
 * Balances natural and chromatic roots across C3–B4, ensuring all chord tones
 * stay comfortably within the 4-octave trainer keyboard (C2–C6).
 */
export const CANONICAL_TRIAD_PRACTICE_ROOTS: readonly string[] = [
  'C4',
  'G3',
  'F#3',
  'F4',
  'D4',
  'C#4',
  'A3',
  'E4',
  'D#4',
  'B3',
  'A#3',
  'C3',
  'G#3',
  'F#4'
] as const;

/**
 * Deterministically resolves a root key ID for Daily Practice / scheduled review.
 * Avoids uncontrolled Math.random() in core logic, cycling deterministically through
 * context index, session trials count, or card review history.
 */
export function resolveTriadPracticeRootKeyId(
  _quality: TriadQuality = 'major',
  options?: {
    rootKeyId?: string;
    contextIndex?: number;
    sessionTrials?: number;
    card?: Card;
    random?: () => number;
    includeChromatic?: boolean;
    pool?: readonly string[];
  }
): string {
  if (options?.rootKeyId) return options.rootKeyId;
  const pool = options?.pool ?? CANONICAL_TRIAD_PRACTICE_ROOTS;
  if (!pool.length) return 'C4';

  if (typeof options?.contextIndex === 'number') {
    return pool[Math.abs(options.contextIndex) % pool.length];
  }
  const cardOffset = options?.card
    ? (options.card.reps ?? 0) * 3 + (options.card.lapses ?? 0) * 5
    : 0;

  if (typeof options?.sessionTrials === 'number') {
    return pool[(Math.abs(options.sessionTrials) + cardOffset) % pool.length];
  }
  if (cardOffset > 0) {
    return pool[cardOffset % pool.length];
  }
  if (options?.random) {
    return pool[Math.floor(options.random() * pool.length)];
  }
  return pool[0];
}

/**
 * Computes exact physical key IDs and MIDI pitches for a root-position triad.
 */
export function resolveTriadPitches(
  rootKeyId: string,
  quality: TriadQuality
): {
  rootKeyId: string;
  thirdKeyId: string;
  fifthKeyId: string;
  triadKeyIds: [string, string, string];
  rootMidi: number;
  thirdMidi: number;
  fifthMidi: number;
  quality: TriadQuality;
} {
  const def = TRIAD_DEFINITIONS[quality] || TRIAD_DEFINITIONS.major;
  const rootMidi = midiFromKeyId(rootKeyId) ?? 60;
  const thirdMidi = rootMidi + def.rootToThird;
  const fifthMidi = rootMidi + def.rootToFifth;
  const thirdKeyId = keyIdFromMidi(thirdMidi);
  const fifthKeyId = keyIdFromMidi(fifthMidi);

  return {
    rootKeyId,
    thirdKeyId,
    fifthKeyId,
    triadKeyIds: [rootKeyId, thirdKeyId, fifthKeyId],
    rootMidi,
    thirdMidi,
    fifthMidi,
    quality
  };
}

export type TriadAnswerOutcome =
  | 'correct'
  | 'wrong_voicing'
  | 'wrong_quality'
  | 'wrong_octave'
  | 'wrong_notes';

/**
 * Classifies a user's multi-key chord answer against the target triad.
 */
export function classifyTriadAnswer(
  arg1: readonly string[] | string,
  arg2: string | readonly string[],
  arg3: TriadQuality | readonly string[]
): {
  outcome: TriadAnswerOutcome;
  feedbackText: string;
} {
  let userKeyIds: readonly string[];
  let targetRootKeyId: string;
  let targetQuality: TriadQuality;

  if (Array.isArray(arg1)) {
    userKeyIds = arg1;
    targetRootKeyId = arg2 as string;
    targetQuality = arg3 as TriadQuality;
  } else {
    targetRootKeyId = arg1 as string;
    targetQuality = arg2 as TriadQuality;
    userKeyIds = arg3 as readonly string[];
  }

  const expected = resolveTriadPitches(targetRootKeyId, targetQuality);
  const sortedUser = sortKeyIdsByPitch(userKeyIds);

  if (areChordKeyIdsEqual(sortedUser, expected.triadKeyIds)) {
    return {
      outcome: 'correct',
      feedbackText: `Верно! ${expected.rootKeyId} ${targetQuality === 'major' ? 'мажор' : 'минор'}.`
    };
  }

  // Check pitch classes
  const expectedPcs = new Set([
    pitchClassFromMidi(expected.rootMidi),
    pitchClassFromMidi(expected.thirdMidi),
    pitchClassFromMidi(expected.fifthMidi)
  ]);

  const userMidis = sortedUser.map((k) => midiFromKeyId(k) ?? 0);
  const userPcs = new Set(userMidis.map((m) => pitchClassFromMidi(m)));

  const setsEqual =
    expectedPcs.size === userPcs.size &&
    Array.from(expectedPcs).every((pc) => userPcs.has(pc));

  // 1. Same chord, but inversion (e.g. E4 G4 C5)
  if (setsEqual) {
    const bottomPc = pitchClassFromMidi(userMidis[0]);
    const rootPc = pitchClassFromMidi(expected.rootMidi);
    if (bottomPc !== rootPc) {
      return {
        outcome: 'wrong_voicing',
        feedbackText:
          'Все три звука правильные, но основной тон сейчас не внизу. Это обращение аккорда. Сыграйте трезвучие в основном положении: снизу должен быть основной тон.'
      };
    }
    if (sortedUser[0] !== expected.rootKeyId) {
      return {
        outcome: 'wrong_octave',
        feedbackText:
          `Тот же аккорд, но сыгран не в той октаве. Постройте аккорд от указанной клавиши ${targetRootKeyId}.`
      };
    }
  }

  // 2. Same root, opposite quality (e.g. built minor for major target)
  const oppQuality: TriadQuality = targetQuality === 'major' ? 'minor' : 'major';
  const oppExpected = resolveTriadPitches(targetRootKeyId, oppQuality);
  if (areChordKeyIdsEqual(sortedUser, oppExpected.triadKeyIds)) {
    return {
      outcome: 'wrong_quality',
      feedbackText:
        targetQuality === 'major'
          ? `Получился ${targetRootKeyId} минор. Для мажора терция должна быть на полутон выше.`
          : `Получился ${targetRootKeyId} мажор. Для минора терция должна быть на полутон ниже.`
    };
  }

  // 3. Same quality and structure, but wrong octave
  const userRootPc = pitchClassFromMidi(userMidis[0]);
  const targetRootPc = pitchClassFromMidi(expected.rootMidi);
  if (userRootPc === targetRootPc && sortedUser.length === 3) {
    const uSpan3 = userMidis[1] - userMidis[0];
    const uSpan5 = userMidis[2] - userMidis[0];
    const def = TRIAD_DEFINITIONS[targetQuality];
    if (uSpan3 === def.rootToThird && uSpan5 === def.rootToFifth) {
      return {
        outcome: 'wrong_octave',
        feedbackText:
          `Тот же аккорд, но сыгран не в той октаве. Постройте аккорд от указанной клавиши ${targetRootKeyId}.`
      };
    }
  }

  return {
    outcome: 'wrong_notes',
    feedbackText: `Не те клавиши. Нужен ${targetQuality === 'major' ? 'мажор' : 'минор'} от ${targetRootKeyId}: ${expected.triadKeyIds.join(' + ')}.`
  };
}

export interface DailyChordAttemptInput {
  card: Card;
  kind: ReviewKind;
  rootKeyId: string;
  quality: TriadQuality;
  userKeyIds: readonly string[];
  firstResponseRecorded: boolean;
  attempts: number;
  hintUsed: boolean;
  responseMs: number;
  inputMethod?: TrialInputMethod;
  settings?: UserSettings;
  reviewLogs?: readonly ReviewLogEvent[];
  sessionId?: string | null;
}

export interface DailyChordAttemptResult {
  isCorrect: boolean;
  classification: {
    outcome: TriadAnswerOutcome;
    feedbackText: string;
  };
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
 * Pure evaluator for Daily Practice chord submissions (triadBuild).
 * Evaluates the multi-key chord via classifyTriadAnswer, ensuring isCorrect
 * directly controls FSRS grading without losing chord-specific diagnostic feedback.
 */
export function evaluateDailyChordAttempt(
  input: DailyChordAttemptInput
): DailyChordAttemptResult {
  const sorted = sortKeyIdsByPitch(input.userKeyIds);
  const classification = classifyTriadAnswer(input.rootKeyId, input.quality, sorted);
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
    answer: input.quality,
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
          ? `✓ Исправлено (${roundState.attempts}-я попытка). Это задание служит для переноса навыка и не меняет расписание повторений.`
          : input.kind === 'practice' || input.kind === 'confusion'
            ? `✓ Исправлено (${roundState.attempts}-я попытка)! ${input.kind === 'confusion' ? 'Контрастная' : 'Свободная'} тренировка.`
            : `✓ Исправлено (${roundState.attempts}-я попытка). Для памяти засчитана первая ошибка; карточка вернётся для повторения.`;
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

export function isTriadModuleAvailable(
  input?: {
    learningProgress?: ProgressCollectionInput;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly any[];
  } | ProgressCollectionInput
): boolean {
  if (!input) return false;
  const progress = extractProgressCollection(input);
  return isBassGrandModuleComplete(progress) && isIntervalModuleComplete(progress);
}

export function isTriadModuleComplete(
  input?: {
    learningProgress?: ProgressCollectionInput;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly any[];
  } | ProgressCollectionInput
): boolean {
  if (!input) return false;
  const map = normalizeProgressMap(input);
  const rec = map.get(TRIAD_ITEM_IDS.COMPLETE);
  return Boolean(rec && rec.state === 'retention');
}

export function getTriadModuleStatus(input?: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly any[];
} | ProgressCollectionInput): 'not_started' | 'in_progress' | 'completed' {
  if (!input) return 'not_started';

  if (isTriadModuleComplete(input)) {
    return 'completed';
  }
  const map = normalizeProgressMap(input);
  const hasAnyProgress =
    map.has(TRIAD_ITEM_IDS.ORIENTATION) ||
    map.has(TRIAD_ITEM_IDS.BUILD_MAJOR) ||
    map.has(TRIAD_ITEM_IDS.BUILD_MINOR) ||
    map.has(TRIAD_ITEM_IDS.CONTRAST) ||
    map.has(TRIAD_ITEM_IDS.IDENTIFY_MAJOR) ||
    map.has(TRIAD_ITEM_IDS.IDENTIFY_MINOR) ||
    map.has(TRIAD_ITEM_IDS.TRANSFER);
  return hasAnyProgress ? 'in_progress' : 'not_started';
}

export function getTriadBuildItemId(quality: TriadQuality): string {
  return quality === 'major' ? TRIAD_ITEM_IDS.BUILD_MAJOR : TRIAD_ITEM_IDS.BUILD_MINOR;
}

export function getTriadIdentifyItemId(quality: TriadQuality): string {
  return quality === 'major' ? TRIAD_ITEM_IDS.IDENTIFY_MAJOR : TRIAD_ITEM_IDS.IDENTIFY_MINOR;
}

export interface TriadTrialConfig {
  skill: 'triadBuild' | 'triadIdentify';
  quality: TriadQuality;
  rootKeyId: string;
  thirdKeyId: string;
  fifthKeyId: string;
  triadKeyIds: [string, string, string];
  isChromaticRoot: boolean;
}

export const TRIAD_TRANSFER_CYCLE: readonly {
  skill: 'triadBuild' | 'triadIdentify';
  quality: TriadQuality;
  rootKeyId: string;
  isChromaticRoot: boolean;
}[] = [
  // First 8 deterministic trials covering all 8 combinations (2 skills × 2 qualities × 2 root types):
  { skill: 'triadBuild', quality: 'major', rootKeyId: 'C4', isChromaticRoot: false },
  { skill: 'triadIdentify', quality: 'major', rootKeyId: 'D4', isChromaticRoot: false },
  { skill: 'triadBuild', quality: 'minor', rootKeyId: 'A3', isChromaticRoot: false },
  { skill: 'triadIdentify', quality: 'minor', rootKeyId: 'E4', isChromaticRoot: false },
  { skill: 'triadBuild', quality: 'major', rootKeyId: 'F#3', isChromaticRoot: true },
  { skill: 'triadIdentify', quality: 'major', rootKeyId: 'C#4', isChromaticRoot: true },
  { skill: 'triadBuild', quality: 'minor', rootKeyId: 'D#4', isChromaticRoot: true },
  { skill: 'triadIdentify', quality: 'minor', rootKeyId: 'G#3', isChromaticRoot: true },
  // Trials 8–11:
  { skill: 'triadBuild', quality: 'major', rootKeyId: 'G3', isChromaticRoot: false },
  { skill: 'triadIdentify', quality: 'minor', rootKeyId: 'B3', isChromaticRoot: false },
  { skill: 'triadBuild', quality: 'minor', rootKeyId: 'A#3', isChromaticRoot: true },
  { skill: 'triadIdentify', quality: 'major', rootKeyId: 'F4', isChromaticRoot: false }
] as const;

export function buildTriadTransferTrial(trialIndex: number): TriadTrialConfig {
  const item = TRIAD_TRANSFER_CYCLE[trialIndex % TRIAD_TRANSFER_CYCLE.length];
  const { thirdKeyId, fifthKeyId, triadKeyIds } = resolveTriadPitches(item.rootKeyId, item.quality);
  return {
    skill: item.skill,
    quality: item.quality,
    rootKeyId: item.rootKeyId,
    thirdKeyId,
    fifthKeyId,
    triadKeyIds,
    isChromaticRoot: item.isChromaticRoot
  };
}

export function isTriadTransferGateSatisfied(rec?: LearningProgressRecord): boolean {
  if (!rec) return false;
  const completedTrials = rec.guidedSuccesses ?? 0;
  const correctFirstAttempts = rec.independentUnhintedSuccesses ?? 0;
  if (completedTrials < TRIAD_TRANSFER_MIN_TRIALS) return false;
  if (completedTrials === 0 || correctFirstAttempts / completedTrials < TRIAD_TRANSFER_REQUIRED_ACCURACY) return false;

  const contexts = rec.contexts ?? [];
  const hasMajor = contexts.includes('quality:major');
  const hasMinor = contexts.includes('quality:minor');
  const hasBuild = contexts.includes('skill:triadBuild');
  const hasIdentify = contexts.includes('skill:triadIdentify');
  const hasChromatic = contexts.includes('root:chromatic');
  const hasWhite = contexts.includes('root:white');

  return hasMajor && hasMinor && hasBuild && hasIdentify && hasChromatic && hasWhite;
}

export interface TriadStepDescription {
  step: TriadStep;
  kind: 'orientation' | 'build' | 'contrast' | 'identify' | 'transfer' | 'complete';
  subStage?: 'model' | 'guided' | 'qualify' | 'localMix' | 'delayedCheck';
  quality?: TriadQuality;
  activeSkill: 'triadBuild' | 'triadIdentify' | 'none';
  rootKeyId?: string;
  thirdKeyId?: string;
  fifthKeyId?: string;
  triadKeyIds?: readonly string[];
  title: string;
  subtitle: string;
  hintText?: string;
}

export function describeTriadStep(
  step: TriadStep,
  state?: TriadCurriculumState
): TriadStepDescription {
  if (step === 'triadOrientation') {
    return {
      step,
      kind: 'orientation',
      activeSkill: 'none',
      rootKeyId: 'C4',
      thirdKeyId: 'E4',
      fifthKeyId: 'G4',
      triadKeyIds: ['C4', 'E4', 'G4'],
      title: 'Что такое трезвучие?',
      subtitle: 'Аккорд из трёх звуков: 1 — основной тон, 3 — терция, 5 — квинта',
      hintText:
        'Трезвучие — это фундамент гармонии. В основном положении звуки строятся через клавишу: основной тон (root) + терция (third) + квинта (fifth).'
    };
  }

  if (step === 'contrastMajorMinor') {
    return {
      step,
      kind: 'contrast',
      activeSkill: 'none',
      rootKeyId: 'C4',
      thirdKeyId: 'E4',
      fifthKeyId: 'G4',
      triadKeyIds: ['C4', 'D#4', 'E4', 'G4'],
      title: 'Мажор против минора: разница в один полутон',
      subtitle: 'C major (C–E–G) против C minor (C–Eb–G)',
      hintText:
        'Квинта не изменилась. Терция опустилась на один полутон: E4 (мажор, светло) → Eb4/D#4 (минор, задумчиво).'
    };
  }

  if (step === 'triadTransfer') {
    return {
      step,
      kind: 'transfer',
      activeSkill: state?.activeSkill ?? 'triadBuild',
      quality: state?.quality,
      rootKeyId: state?.rootKeyId,
      thirdKeyId: state?.thirdKeyId,
      fifthKeyId: state?.fifthKeyId,
      triadKeyIds: state?.targetTriadKeyIds,
      title: 'Трезвучия: перенос навыка',
      subtitle: 'Смешанное построение и распознавание на белых и чёрных клавишах',
      hintText:
        'Определяйте качество аккорда по терции (4 полутона — мажор, 3 полутона — минор). Квинта всегда 7 полутонов.'
    };
  }

  if (step === 'moduleComplete') {
    return {
      step,
      kind: 'complete',
      activeSkill: 'none',
      title: 'Мажорные и минорные трезвучия освоены',
      subtitle: 'Вы научились строить и различать базовые аккорды',
      hintText:
        'Вы знаете главное: качество аккорда определяется терцией. Следующий шаг — обращения и последовательности аккордов.'
    };
  }

  // Build steps
  if (step.includes('Build')) {
    const quality: TriadQuality = step.startsWith('major') ? 'major' : 'minor';
    const def = TRIAD_DEFINITIONS[quality];
    let subStage: 'model' | 'guided' | 'qualify' | 'localMix' | 'delayedCheck' = 'model';
    if (step.endsWith('Model')) subStage = 'model';
    else if (step.endsWith('Guided')) subStage = 'guided';
    else if (step.endsWith('Qualify')) subStage = 'qualify';
    else if (step.endsWith('LocalMix')) subStage = 'localMix';
    else if (step.endsWith('DelayedCheck')) subStage = 'delayedCheck';

    return {
      step,
      kind: 'build',
      subStage,
      quality,
      activeSkill: 'triadBuild',
      rootKeyId: state?.rootKeyId ?? 'C4',
      thirdKeyId: state?.thirdKeyId,
      fifthKeyId: state?.fifthKeyId,
      triadKeyIds: state?.targetTriadKeyIds,
      title: `${def.nameRu} от ${state?.rootKeyId ?? 'C4'}`,
      subtitle:
        subStage === 'model'
          ? `Модель и форма аккорда: ${quality === 'major' ? 'M3 (4)' : 'm3 (3)'} + P5 (7)`
          : subStage === 'guided'
          ? `Построение с подсказкой структуры`
          : subStage === 'qualify'
          ? `Построение самостоятельно`
          : subStage === 'localMix'
          ? `Закрепление на разных клавишах`
          : `Проверка по памяти`,
      hintText: def.description
    };
  }

  // Identify steps
  const quality: TriadQuality = step.startsWith('major') ? 'major' : 'minor';
  const def = TRIAD_DEFINITIONS[quality];
  let subStage: 'model' | 'qualify' | 'delayedCheck' = 'model';
  if (step.endsWith('Model')) subStage = 'model';
  else if (step.endsWith('Qualify')) subStage = 'qualify';
  else if (step.endsWith('DelayedCheck')) subStage = 'delayedCheck';

  return {
    step,
    kind: 'identify',
    subStage,
    quality,
    activeSkill: 'triadIdentify',
    rootKeyId: state?.rootKeyId ?? 'C4',
    thirdKeyId: state?.thirdKeyId,
    fifthKeyId: state?.fifthKeyId,
    triadKeyIds: state?.targetTriadKeyIds,
    title: `Распознавание: ${def.nameRu}`,
    subtitle:
      subStage === 'model'
        ? `Форма трёх клавиш на клавиатуре`
        : subStage === 'qualify'
        ? `Определение без подсказок`
        : `Проверка по памяти`,
    hintText: def.description
  };
}

export interface TriadCurriculumState {
  step: TriadStep;
  progress: Record<string, LearningProgressRecord>;
  activeSkill: 'triadBuild' | 'triadIdentify' | 'none';
  quality?: TriadQuality;
  rootKeyId?: string;
  thirdKeyId?: string;
  fifthKeyId?: string;
  targetKeyId?: string;
  targetKeyIds: readonly string[];
  targetTriadKeyIds: readonly string[];
  structuralGuideKeyIds: readonly string[];
  modelLabelKeyIds: readonly string[];
  selectedKeyIds: readonly string[];
  awaitingCorrective: boolean;
  isInterveningRecall: boolean;
  feedbackText?: string;
  feedbackTone?: 'good' | 'bad' | 'warn' | 'info';
  localMixSuccessCount: number;
  localMixTarget: number;
  transferTrialsCompleted: number;
  transferCorrectFirstAttempts: number;
  transferQualitiesSeen: TriadQuality[];
  transferSkillsSeen: Skill[];
  transferChromaticSeen: number;
  transferWhiteSeen: number;
}

export type TriadAction =
  | { type: 'toggleKey'; keyId: string }
  | { type: 'submitChord'; keyIds?: readonly string[] }
  | { type: 'selectAnswer'; quality: TriadQuality }
  | { type: 'dontKnow' }
  | { type: 'advanceStage' }
  | { type: 'resetModule' };

export interface ApplyTriadActionResult {
  state: TriadCurriculumState;
  updatedProgress: LearningProgressRecord[];
  mutatedCard?: Card;
  attemptResult?: SubmitQuestionAttemptResult;
  outcome?: TriadAnswerOutcome | 'advance' | 'dont_know';
}

export function deriveTriadStep(
  progress: Record<string, LearningProgressRecord>
): TriadStep {
  if (progress[TRIAD_ITEM_IDS.COMPLETE]?.state === 'retention') {
    return 'moduleComplete';
  }

  const orientRec = progress[TRIAD_ITEM_IDS.ORIENTATION];
  if (!orientRec || orientRec.state === 'unseen') {
    return 'triadOrientation';
  }

  // Build steps: Major then Minor
  const buildSpecs: { id: TriadQuality; prefix: string; recId: string }[] = [
    { id: 'major', prefix: 'majorBuild', recId: TRIAD_ITEM_IDS.BUILD_MAJOR },
    { id: 'minor', prefix: 'minorBuild', recId: TRIAD_ITEM_IDS.BUILD_MINOR }
  ];

  for (const spec of buildSpecs) {
    const rec = progress[spec.recId];
    if (!rec || rec.state === 'unseen') {
      return `${spec.prefix}Model` as TriadStep;
    }
    if (rec.state === 'introduced') {
      return `${spec.prefix}Guided` as TriadStep;
    }
    if (rec.state === 'guided') {
      return `${spec.prefix}Qualify` as TriadStep;
    }
    if (rec.state === 'qualifying') {
      return `${spec.prefix}LocalMix` as TriadStep;
    }
    if (rec.state === 'mixReady' || rec.contexts.includes('pending:delayedRetry')) {
      return `${spec.prefix}DelayedCheck` as TriadStep;
    }
  }

  // Contrast step
  const contrastRec = progress[TRIAD_ITEM_IDS.CONTRAST];
  if (!contrastRec || contrastRec.state !== 'retention') {
    return 'contrastMajorMinor';
  }

  // Identify steps: Major then Minor
  const identifySpecs: { id: TriadQuality; prefix: string; recId: string }[] = [
    { id: 'major', prefix: 'majorIdentify', recId: TRIAD_ITEM_IDS.IDENTIFY_MAJOR },
    { id: 'minor', prefix: 'minorIdentify', recId: TRIAD_ITEM_IDS.IDENTIFY_MINOR }
  ];

  for (const spec of identifySpecs) {
    const rec = progress[spec.recId];
    if (!rec || rec.state === 'unseen') {
      return `${spec.prefix}Model` as TriadStep;
    }
    if (rec.state === 'guided') {
      return `${spec.prefix}Qualify` as TriadStep;
    }
    if (rec.state === 'qualifying' || rec.state === 'mixReady' || rec.contexts.includes('pending:delayedRetry')) {
      return `${spec.prefix}DelayedCheck` as TriadStep;
    }
  }

  // Transfer step
  const transferRec = progress[TRIAD_ITEM_IDS.TRANSFER];
  if (!transferRec || transferRec.state !== 'retention' || !isTriadTransferGateSatisfied(transferRec)) {
    return 'triadTransfer';
  }

  return 'moduleComplete';
}

export function buildTriadStateForStep(
  step: TriadStep,
  progress: Record<string, LearningProgressRecord>,
  _now = Date.now(),
  prevTrialIndex = 0
): TriadCurriculumState {
  const transferRec = progress[TRIAD_ITEM_IDS.TRANSFER];
  const transferTrialsCompleted = transferRec?.guidedSuccesses ?? 0;
  const transferCorrectFirstAttempts = transferRec?.independentUnhintedSuccesses ?? 0;
  const hasPendingTransferCorrective = Boolean(
    transferRec?.contexts?.includes('pending:triadTransferCorrective')
  );

  const baseState: TriadCurriculumState = {
    step,
    progress,
    activeSkill: 'none',
    targetKeyIds: [],
    targetTriadKeyIds: [],
    structuralGuideKeyIds: [],
    modelLabelKeyIds: [],
    selectedKeyIds: [],
    awaitingCorrective: false,
    isInterveningRecall: false,
    localMixSuccessCount: 0,
    localMixTarget: 3,
    transferTrialsCompleted,
    transferCorrectFirstAttempts,
    transferQualitiesSeen: [],
    transferSkillsSeen: [],
    transferChromaticSeen: 0,
    transferWhiteSeen: 0
  };

  if (step === 'triadOrientation') {
    return {
      ...baseState,
      rootKeyId: 'C4',
      thirdKeyId: 'E4',
      fifthKeyId: 'G4',
      structuralGuideKeyIds: ['C4'],
      targetKeyIds: ['C4', 'E4', 'G4'],
      targetTriadKeyIds: ['C4', 'E4', 'G4'],
      feedbackText: 'Трезвучие: аккорд из 3 звуков через клавишу. C4 (основной) + E4 (терция) + G4 (квинта).'
    };
  }

  if (step === 'contrastMajorMinor') {
    return {
      ...baseState,
      rootKeyId: 'C4',
      thirdKeyId: 'E4',
      fifthKeyId: 'G4',
      structuralGuideKeyIds: ['C4'],
      targetKeyIds: ['C4', 'D#4', 'E4', 'G4'],
      targetTriadKeyIds: ['C4', 'D#4', 'E4', 'G4'],
      feedbackText: 'Сравните: C major (C–E–G) и C minor (C–Eb–G). Меняется только терция на 1 полутон.'
    };
  }

  if (step === 'triadTransfer') {
    const trialIndex = prevTrialIndex > 0 ? prevTrialIndex : transferTrialsCompleted;
    const trial = buildTriadTransferTrial(trialIndex);

    // Extract seen contexts
    const ctxs = transferRec?.contexts ?? [];
    const qualitiesSeen: TriadQuality[] = [];
    if (ctxs.includes('quality:major')) qualitiesSeen.push('major');
    if (ctxs.includes('quality:minor')) qualitiesSeen.push('minor');
    const skillsSeen: Skill[] = [];
    if (ctxs.includes('skill:triadBuild')) skillsSeen.push('triadBuild');
    if (ctxs.includes('skill:triadIdentify')) skillsSeen.push('triadIdentify');
    const chromaticCount = ctxs.includes('root:chromatic') ? 1 : 0;
    const whiteCount = ctxs.includes('root:white') ? 1 : 0;

    let feedbackText = '';
    let feedbackTone: 'info' | 'bad' | undefined = undefined;

    if (hasPendingTransferCorrective) {
      feedbackTone = 'bad';
      if (trial.skill === 'triadBuild') {
        feedbackText = `Нажмите подсвеченные клавиши трезвучия (${trial.triadKeyIds.join(' + ')}).`;
      } else {
        feedbackText = `Правильный ответ — ${trial.quality === 'major' ? 'Мажорное' : 'Минорное'} трезвучие. Выберите правильную кнопку ниже.`;
      }
    }

    return {
      ...baseState,
      activeSkill: trial.skill,
      quality: trial.quality,
      rootKeyId: trial.rootKeyId,
      thirdKeyId: trial.thirdKeyId,
      fifthKeyId: trial.fifthKeyId,
      targetKeyIds:
        trial.skill === 'triadIdentify' || hasPendingTransferCorrective
          ? trial.triadKeyIds
          : [],
      targetTriadKeyIds: trial.triadKeyIds,
      structuralGuideKeyIds:
        trial.skill === 'triadBuild' && !hasPendingTransferCorrective
          ? [trial.rootKeyId]
          : [],
      awaitingCorrective: hasPendingTransferCorrective,
      feedbackText,
      feedbackTone,
      transferQualitiesSeen: qualitiesSeen,
      transferSkillsSeen: skillsSeen,
      transferChromaticSeen: chromaticCount,
      transferWhiteSeen: whiteCount
    };
  }

  if (step === 'moduleComplete') {
    return {
      ...baseState,
      feedbackText: 'Поздравляем! Модуль мажорных и минорных трезвучий успешно завершён.',
      feedbackTone: 'good'
    };
  }

  // Triad Build steps
  if (step.includes('Build')) {
    const quality: TriadQuality = step.startsWith('major') ? 'major' : 'minor';
    const def = TRIAD_DEFINITIONS[quality];
    const recId = getTriadBuildItemId(quality);
    const rec = progress[recId];
    const awaitingCorrective = Boolean(rec?.contexts?.includes('pending:corrective'));
    const isInterveningRecall = Boolean(!awaitingCorrective && rec?.contexts?.includes('pending:interveningRecall'));

    let rootKeyId = 'C4';
    if (step.endsWith('LocalMix')) {
      const roots = getValidTriadRoots(quality, true);
      rootKeyId = roots[(prevTrialIndex + 2) % roots.length];
    } else if (step.endsWith('DelayedCheck')) {
      const roots = getValidTriadRoots(quality, false);
      const defaultRoot = roots[(prevTrialIndex + 3) % roots.length] || 'C4';
      if (isInterveningRecall) {
        const altRoots = roots.filter((r) => r !== defaultRoot);
        rootKeyId = altRoots[0] || (defaultRoot === 'C4' ? 'G4' : 'C4');
      } else {
        rootKeyId = defaultRoot;
      }
    }

    const { thirdKeyId, fifthKeyId, triadKeyIds } = resolveTriadPitches(rootKeyId, quality);
    const isModel = step.endsWith('Model');
    const isGuided = step.endsWith('Guided');

    let feedbackText = '';
    let feedbackTone: 'good' | 'bad' | 'info' | undefined = undefined;

    if (isModel) {
      feedbackText = `${def.nameRu} от ${rootKeyId}: ${triadKeyIds.join(' + ')}. Выберите 3 клавиши или нажмите «Продолжить».`;
      feedbackTone = 'info';
    } else if (isGuided) {
      feedbackText = awaitingCorrective
        ? `Запомните: ${def.nameRu} от ${rootKeyId} — это ${triadKeyIds.join(' + ')}. Нажмите эти 3 клавиши.`
        : `Постройте ${def.nameRu} от ${rootKeyId}: терция (${def.rootToThird} полутона) + квинта (${def.rootToFifth} полутонов).`;
      feedbackTone = awaitingCorrective ? 'bad' : 'info';
    } else if (awaitingCorrective) {
      feedbackText = `Запомните: ${def.nameRu} от ${rootKeyId} — это ${triadKeyIds.join(' + ')}. Нажмите эти 3 клавиши.`;
      feedbackTone = 'bad';
    } else if (isInterveningRecall) {
      feedbackText = `Контрастный шаг: сначала постройте ${def.nameRu} от ${rootKeyId}, затем повторим проверку по памяти.`;
      feedbackTone = 'info';
    } else if (step.endsWith('Qualify')) {
      feedbackText = `Постройте ${def.nameRu} от опорной ноты ${rootKeyId} самостоятельно.`;
    } else if (step.endsWith('LocalMix')) {
      feedbackText = `Постройте ${def.nameRu} от опорной ноты ${rootKeyId}.`;
    } else {
      feedbackText = `Финальная проверка: постройте ${def.nameRu} от ноты ${rootKeyId} по памяти.`;
    }

    return {
      ...baseState,
      activeSkill: 'triadBuild',
      quality,
      rootKeyId,
      thirdKeyId,
      fifthKeyId,
      structuralGuideKeyIds: [rootKeyId],
      targetKeyIds: isModel || awaitingCorrective ? triadKeyIds : [],
      targetTriadKeyIds: triadKeyIds,
      awaitingCorrective,
      isInterveningRecall,
      feedbackText,
      feedbackTone
    };
  }

  // Triad Identify steps
  const quality: TriadQuality = step.startsWith('major') ? 'major' : 'minor';
  const def = TRIAD_DEFINITIONS[quality];
  const recId = getTriadIdentifyItemId(quality);
  const rec = progress[recId];
  const awaitingCorrective = Boolean(rec?.contexts?.includes('pending:corrective'));
  const isInterveningRecall = Boolean(!awaitingCorrective && rec?.contexts?.includes('pending:interveningRecall'));

  let rootKeyId = 'C4';
  if (step.endsWith('DelayedCheck')) {
    const roots = getValidTriadRoots(quality, false);
    const defaultRoot = roots[(prevTrialIndex + 1) % roots.length] || 'C4';
    if (isInterveningRecall) {
      const altRoots = roots.filter((r) => r !== defaultRoot);
      rootKeyId = altRoots[0] || (defaultRoot === 'C4' ? 'F4' : 'C4');
    } else {
      rootKeyId = defaultRoot;
    }
  }

  const { thirdKeyId, fifthKeyId, triadKeyIds } = resolveTriadPitches(rootKeyId, quality);
  const isModel = step.endsWith('Model');

  let feedbackText = '';
  let feedbackTone: 'good' | 'bad' | 'info' | undefined = undefined;

  if (isModel) {
    feedbackText = `Три подсвеченные клавиши (${triadKeyIds.join(' + ')}) образуют ${def.nameRu}.`;
    feedbackTone = 'info';
  } else if (awaitingCorrective) {
    feedbackText = `Это ${def.nameRu} (терция на ${def.rootToThird} полутона выше корня). Выберите правильную кнопку.`;
    feedbackTone = 'bad';
  } else if (isInterveningRecall) {
    feedbackText = `Контрастный шаг: определите аккорд, затем повторим проверку по памяти.`;
    feedbackTone = 'info';
  } else if (step.endsWith('Qualify')) {
    feedbackText = 'Определите качество трезвучия по трём клавишам.';
  } else {
    feedbackText = 'Финальная проверка: определите качество трезвучия по памяти.';
  }

  return {
    ...baseState,
    activeSkill: 'triadIdentify',
    quality,
    rootKeyId,
    thirdKeyId,
    fifthKeyId,
    structuralGuideKeyIds: [],
    targetKeyIds: triadKeyIds,
    targetTriadKeyIds: triadKeyIds,
    awaitingCorrective,
    isInterveningRecall,
    feedbackText,
    feedbackTone
  };
}

export function createInitialTriadCurriculumState(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly any[];
  now?: number;
}): TriadCurriculumState {
  const now = input.now ?? Date.now();
  const map = normalizeProgressMap(input.learningProgress);
  const progress: Record<string, LearningProgressRecord> = {};

  const allItemIds = [
    TRIAD_ITEM_IDS.ORIENTATION,
    TRIAD_ITEM_IDS.BUILD_MAJOR,
    TRIAD_ITEM_IDS.BUILD_MINOR,
    TRIAD_ITEM_IDS.CONTRAST,
    TRIAD_ITEM_IDS.IDENTIFY_MAJOR,
    TRIAD_ITEM_IDS.IDENTIFY_MINOR,
    TRIAD_ITEM_IDS.TRANSFER,
    TRIAD_ITEM_IDS.COMPLETE
  ];

  for (const id of allItemIds) {
    const existing = map.get(id);
    progress[id] = existing
      ? { ...existing, contexts: [...existing.contexts] }
      : createInitialLearningProgress(id, now);
  }

  const step = deriveTriadStep(progress);
  return buildTriadStateForStep(step, progress, now);
}

export const createTriadCurriculumState = createInitialTriadCurriculumState;

export function canUseDontKnowInTriadStep(state: TriadCurriculumState): boolean {
  if (state.awaitingCorrective) return false;
  if (
    state.step === 'triadOrientation' ||
    state.step === 'contrastMajorMinor' ||
    state.step === 'moduleComplete'
  ) {
    return false;
  }
  if (state.step.endsWith('Model')) return false;
  return true;
}

function removeContext(contexts: readonly string[], targetCtx: string): string[] {
  return contexts.filter((c) => c !== targetCtx);
}

/**
 * State reducer for the Triad Curriculum, applying canonical FSRS mutations only when eligible.
 */
export function applyTriadActionWithCards(
  params: {
    state: TriadCurriculumState;
    action: TriadAction;
    cards?: ReadonlyMap<string, Card>;
    userSettings?: UserSettings;
    now?: number;
  }
): ApplyTriadActionResult {
  const { state, action } = params;
  const now = params.now ?? Date.now();
  const progress = { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];

  // Reset Module
  if (action.type === 'resetModule') {
    const allItemIds = Object.values(TRIAD_ITEM_IDS);
    for (const id of allItemIds) {
      const rec = createInitialLearningProgress(id, now);
      progress[id] = rec;
      updatedProgress.push(rec);
    }
    const freshStep = deriveTriadStep(progress);
    const freshState = buildTriadStateForStep(freshStep, progress, now);
    return { state: freshState, updatedProgress };
  }

  // Toggle Key on screen piano
  if (action.type === 'toggleKey') {
    if (state.activeSkill !== 'triadBuild') {
      return { state, updatedProgress };
    }
    const isGuidedBuild = state.step.endsWith('Guided');
    const suppliedRoot = state.rootKeyId || 'C4';
    if (isGuidedBuild && action.keyId === suppliedRoot) {
      return { state, updatedProgress };
    }
    let selected = [...state.selectedKeyIds];
    if (selected.includes(action.keyId)) {
      selected = selected.filter((id) => id !== action.keyId);
    } else if (selected.length < (isGuidedBuild ? 2 : 3)) {
      selected.push(action.keyId);
    }
    return {
      state: {
        ...state,
        selectedKeyIds: selected
      },
      updatedProgress
    };
  }

  // Don't Know
  if (action.type === 'dontKnow') {
    if (!canUseDontKnowInTriadStep(state)) {
      return { state, updatedProgress };
    }

    // In transfer:
    if (state.step === 'triadTransfer') {
      let transRec = progress[TRIAD_ITEM_IDS.TRANSFER] || createInitialLearningProgress(TRIAD_ITEM_IDS.TRANSFER, now);
      transRec = {
        ...transRec,
        contexts: appendUniqueContext(transRec.contexts, 'pending:triadTransferCorrective')
      };
      progress[TRIAD_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      const trial = buildTriadTransferTrial(state.transferTrialsCompleted);
      const correctivePrompt =
        state.activeSkill === 'triadBuild'
          ? `Нажмите подсвеченные клавиши трезвучия (${trial.triadKeyIds.join(' + ')}).`
          : `Правильный ответ — ${trial.quality === 'major' ? 'Мажорное' : 'Минорное'} трезвучие. Выберите правильную кнопку ниже.`;

      return {
        state: {
          ...state,
          progress,
          awaitingCorrective: true,
          targetKeyIds: trial.triadKeyIds,
          targetTriadKeyIds: trial.triadKeyIds,
          structuralGuideKeyIds: [],
          selectedKeyIds: [],
          feedbackText: correctivePrompt,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: 'dont_know'
      };
    }

    // Delayed check Don't know -> 0 FSRS mutations, set pending:delayedRetry and pending:corrective
    if (state.step.endsWith('DelayedCheck')) {
      const recId =
        state.activeSkill === 'triadBuild'
          ? getTriadBuildItemId(state.quality || 'major')
          : getTriadIdentifyItemId(state.quality || 'major');

      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      let nextContexts = appendUniqueContext(rec.contexts, 'pending:delayedRetry');
      nextContexts = appendUniqueContext(nextContexts, 'pending:corrective');

      rec = {
        ...rec,
        contexts: nextContexts,
        updatedAt: now
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const { triadKeyIds } = resolveTriadPitches(state.rootKeyId || 'C4', state.quality || 'major');
      const def = TRIAD_DEFINITIONS[state.quality || 'major'];
      const feedbackText =
        state.activeSkill === 'triadBuild'
          ? `Запомните: ${def.nameRu} от ${state.rootKeyId} — это ${triadKeyIds.join(' + ')}. Нажмите эти 3 клавиши.`
          : `Это ${def.nameRu} (терция на ${def.rootToThird} полутона выше корня). Выберите правильную кнопку.`;

      return {
        state: {
          ...state,
          progress,
          awaitingCorrective: true,
          targetKeyIds: triadKeyIds,
          targetTriadKeyIds: triadKeyIds,
          structuralGuideKeyIds: [],
          selectedKeyIds: [],
          feedbackText,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: 'dont_know'
      };
    }

    if (state.activeSkill === 'triadBuild' && state.step.endsWith('Guided')) {
      const { thirdKeyId, fifthKeyId, triadKeyIds } = resolveTriadPitches(
        state.rootKeyId || 'C4',
        state.quality || 'major'
      );
      return {
        state: {
          ...state,
          awaitingCorrective: true,
          targetKeyIds: [thirdKeyId, fifthKeyId],
          targetTriadKeyIds: triadKeyIds,
          selectedKeyIds: [],
          feedbackText: `Опорная нота ${state.rootKeyId} уже дана. Нажмите две недостающие клавиши: ${thirdKeyId} и ${fifthKeyId}.`,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: 'dont_know'
      };
    }

    // For qualify / localMix Don't know:
    const normalTriadKeys = resolveTriadPitches(state.rootKeyId || 'C4', state.quality || 'major').triadKeyIds;
    return {
      state: {
        ...state,
        awaitingCorrective: true,
        targetKeyIds: normalTriadKeys,
        targetTriadKeyIds: normalTriadKeys,
        selectedKeyIds: [],
        feedbackText: `Подсказка: ${state.quality === 'major' ? 'мажорное' : 'минорное'} трезвучие — ${normalTriadKeys.join(' + ')}.`,
        feedbackTone: 'bad'
      },
      updatedProgress,
      outcome: 'dont_know'
    };
  }

  // Advance Stage
  if (action.type === 'advanceStage') {
    if (state.step === 'triadOrientation') {
      let rec = recordModelCompleted(
        progress[TRIAD_ITEM_IDS.ORIENTATION] || createInitialLearningProgress(TRIAD_ITEM_IDS.ORIENTATION, now),
        now,
        'model:triadOrientation'
      );
      rec.state = 'retention';
      progress[TRIAD_ITEM_IDS.ORIENTATION] = rec;
      updatedProgress.push(rec);
    } else if (state.step === 'contrastMajorMinor') {
      let rec = recordModelCompleted(
        progress[TRIAD_ITEM_IDS.CONTRAST] || createInitialLearningProgress(TRIAD_ITEM_IDS.CONTRAST, now),
        now,
        'model:triadContrast'
      );
      rec.state = 'retention';
      progress[TRIAD_ITEM_IDS.CONTRAST] = rec;
      updatedProgress.push(rec);
    } else if (state.step.endsWith('Model')) {
      const recId =
        state.activeSkill === 'triadBuild'
          ? getTriadBuildItemId(state.quality || 'major')
          : getTriadIdentifyItemId(state.quality || 'major');

      let rec = progress[recId];
      if (rec) {
        rec = {
          ...rec,
          state: state.activeSkill === 'triadBuild' ? 'introduced' : 'guided',
          modelCompleted: true,
          updatedAt: now
        };
        progress[recId] = rec;
        updatedProgress.push(rec);
      }
    }

    const nextStep = deriveTriadStep(progress);
    const nextState = buildTriadStateForStep(nextStep, progress, now);
    return { state: nextState, updatedProgress, outcome: 'advance' };
  }

  // Submit Chord (triadBuild)
  if (action.type === 'submitChord') {
    const rawKeys = action.keyIds && action.keyIds.length > 0 ? action.keyIds : state.selectedKeyIds;
    const isGuidedBuild = state.activeSkill === 'triadBuild' && state.step.endsWith('Guided');
    const suppliedRoot = state.rootKeyId || 'C4';
    const chordKeys = isGuidedBuild && rawKeys.length === 2 && !rawKeys.includes(suppliedRoot)
      ? [suppliedRoot, ...rawKeys]
      : rawKeys;
    if (chordKeys.length !== 3) {
      return { state, updatedProgress };
    }

    const classification = classifyTriadAnswer(
      chordKeys,
      state.rootKeyId || 'C4',
      state.quality || 'major'
    );
    const isCorrect = classification.outcome === 'correct';
    const { thirdKeyId, fifthKeyId } = resolveTriadPitches(
      state.rootKeyId || 'C4',
      state.quality || 'major'
    );

    // Transfer stage handling
    if (state.step === 'triadTransfer') {
      let transRec = progress[TRIAD_ITEM_IDS.TRANSFER] || createInitialLearningProgress(TRIAD_ITEM_IDS.TRANSFER, now);
      const hadCorrective = state.awaitingCorrective;

      if (!isCorrect) {
        transRec = {
          ...transRec,
          contexts: appendUniqueContext(transRec.contexts, 'pending:triadTransferCorrective'),
          updatedAt: now
        };
        progress[TRIAD_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        const trial = buildTriadTransferTrial(state.transferTrialsCompleted);
        return {
          state: {
            ...state,
            progress,
            awaitingCorrective: true,
            targetTriadKeyIds: trial.triadKeyIds,
            selectedKeyIds: [],
            feedbackText: `${classification.feedbackText} Нажмите подсвеченные клавиши (${trial.triadKeyIds.join(' + ')}).`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: classification.outcome
        };
      }

      // Correct in transfer:
      const nextCompleted = state.transferTrialsCompleted + 1;
      const nextFirst = hadCorrective ? state.transferCorrectFirstAttempts : state.transferCorrectFirstAttempts + 1;

      let contexts = removeContext(transRec.contexts, 'pending:triadTransferCorrective');
      contexts = appendUniqueContext(contexts, `quality:${state.quality || 'major'}`);
      contexts = appendUniqueContext(contexts, 'skill:triadBuild');
      const isChromatic = (state.rootKeyId || '').includes('#');
      contexts = appendUniqueContext(contexts, isChromatic ? 'root:chromatic' : 'root:white');

      transRec = {
        ...transRec,
        guidedSuccesses: nextCompleted,
        independentUnhintedSuccesses: nextFirst,
        contexts,
        updatedAt: now
      };

      if (isTriadTransferGateSatisfied(transRec)) {
        transRec.state = 'retention';
        let compRec = progress[TRIAD_ITEM_IDS.COMPLETE] || createInitialLearningProgress(TRIAD_ITEM_IDS.COMPLETE, now);
        compRec.state = 'retention';
        progress[TRIAD_ITEM_IDS.COMPLETE] = compRec;
        updatedProgress.push(compRec);
      }

      progress[TRIAD_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      const nextStep = deriveTriadStep(progress);
      const nextState = buildTriadStateForStep(nextStep, progress, now, nextCompleted);
      return {
        state: nextState,
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Delayed check handling
    if (state.step.endsWith('DelayedCheck')) {
      const recId = getTriadBuildItemId(state.quality || 'major');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry') && !state.awaitingCorrective;
      let mutatedCard: Card | undefined = undefined;
      let attemptResult: SubmitQuestionAttemptResult | undefined = undefined;

      // In corrective mode:
      if (state.awaitingCorrective) {
        if (!isCorrect) {
          return { state: { ...state, selectedKeyIds: [] }, updatedProgress, outcome: classification.outcome };
        }
        // Corrective press succeeded: transition to intervening recall
        let nextContexts = removeContext(rec.contexts, 'pending:corrective');
        nextContexts = appendUniqueContext(nextContexts, 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextState = buildTriadStateForStep(state.step, progress, now, 1);
        return {
          state: {
            ...nextState,
            selectedKeyIds: []
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      // In intervening recall mode:
      if (state.isInterveningRecall) {
        if (!isCorrect) {
          return { state: { ...state, selectedKeyIds: [] }, updatedProgress, outcome: classification.outcome };
        }
        // Intervening recall succeeded: move back to clean H0 delayed retry
        let nextContexts = removeContext(rec.contexts, 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextState = buildTriadStateForStep(state.step, progress, now, 2);
        return {
          state: {
            ...nextState,
            selectedKeyIds: []
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      // Fresh attempt on delayed check:
      if (!isCorrect) {
        // Wrong attempt: exactly 1 Again if first attempt, enter corrective
        if (isFirstAttempt && params.cards) {
          const cardId = `triadBuild:${state.quality || 'major'}`;
          const existingCard = params.cards.get(cardId);
          if (existingCard) {
            const roundState: QuestionRoundState = {
              firstResponseRecorded: false,
              attempts: 0,
              hintUsed: false,
              isCompleted: false,
              isLocked: false
            };
            const ctx = createTrialContext({
              mode: 'delayedCheck',
              sessionId: 'triad-curriculum',
              cardId,
              itemId: recId,
              hintLevel: HINT_LEVEL.NONE,
              firstAttempt: true,
              inputMethod: 'screen'
            });
            attemptResult = submitQuestionAttempt({
              state: roundState,
              card: existingCard,
              kind: 'scheduled',
              isCorrect: false,
              answer: state.quality || 'major',
              answerKeyId: null,
              responseMs: null,
              reviewedAt: now,
              trialContext: ctx,
              sessionId: 'triad-curriculum',
              settings: toFsrsSettings(params.userSettings)
            });
            mutatedCard = attemptResult.cardMutated ? { ...existingCard } : undefined;
          }
        }

        let nextContexts = appendUniqueContext(rec.contexts, 'pending:delayedRetry');
        nextContexts = appendUniqueContext(nextContexts, 'pending:corrective');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

    const { triadKeyIds } = resolveTriadPitches(state.rootKeyId || 'C4', state.quality || 'major');
        return {
          state: {
            ...state,
            progress,
            awaitingCorrective: true,
            targetKeyIds: triadKeyIds,
            targetTriadKeyIds: triadKeyIds,
            selectedKeyIds: [],
            feedbackText: `${classification.feedbackText} Нажмите эти 3 клавиши.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          mutatedCard,
          attemptResult,
          outcome: classification.outcome
        };
      }

      // Success on delayed check!
      if (isFirstAttempt && params.cards) {
        const cardId = `triadBuild:${state.quality || 'major'}`;
        const existingCard = params.cards.get(cardId);
        if (existingCard) {
          const roundState: QuestionRoundState = {
            firstResponseRecorded: false,
            attempts: 0,
            hintUsed: false,
            isCompleted: false,
            isLocked: false
          };
          const ctx = createTrialContext({
            mode: 'delayedCheck',
            sessionId: 'triad-curriculum',
            cardId,
            itemId: recId,
            hintLevel: HINT_LEVEL.NONE,
            firstAttempt: true,
            inputMethod: 'screen'
          });
          attemptResult = submitQuestionAttempt({
            state: roundState,
            card: existingCard,
            kind: 'scheduled',
            isCorrect: true,
            answer: state.quality || 'major',
            answerKeyId: null,
            responseMs: null,
            reviewedAt: now,
            trialContext: ctx,
            sessionId: 'triad-curriculum',
            settings: toFsrsSettings(params.userSettings)
          });
          mutatedCard = attemptResult.cardMutated ? { ...existingCard } : undefined;
        }
      }

      // Clear all pending contexts, mark retention
      let cleanContexts = removeContext(rec.contexts, 'pending:delayedRetry');
      cleanContexts = removeContext(cleanContexts, 'pending:corrective');
      cleanContexts = removeContext(cleanContexts, 'pending:interveningRecall');
      rec = {
        ...rec,
        state: 'retention',
        contexts: cleanContexts,
        updatedAt: now
      };
      rec = markFsrsActivated(rec, now);
      rec.state = 'retention';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveTriadStep(progress);
      const nextState = buildTriadStateForStep(nextStep, progress, now);
      return {
        state: { ...nextState, selectedKeyIds: [] },
        updatedProgress,
        mutatedCard,
        attemptResult,
        outcome: 'correct'
      };
    }

    // Normal progression steps (Guided, Qualify, LocalMix)
    const recId = getTriadBuildItemId(state.quality || 'major');
    let rec = progress[recId] || createInitialLearningProgress(recId, now);

    if (state.awaitingCorrective) {
      if (!isCorrect) {
        return { state: { ...state, selectedKeyIds: [] }, updatedProgress, outcome: classification.outcome };
      }
      return {
        state: {
          ...state,
          awaitingCorrective: false,
          targetKeyIds: state.step.endsWith('Model') ? state.targetTriadKeyIds : [],
          targetTriadKeyIds: state.targetTriadKeyIds,
          selectedKeyIds: [],
          feedbackText: 'Верно! Теперь продолжим.',
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (!isCorrect) {
      const { triadKeyIds } = resolveTriadPitches(state.rootKeyId || 'C4', state.quality || 'major');
      return {
        state: {
          ...state,
          awaitingCorrective: true,
          targetKeyIds: isGuidedBuild ? [thirdKeyId, fifthKeyId] : triadKeyIds,
          targetTriadKeyIds: triadKeyIds,
          selectedKeyIds: [],
          feedbackText: isGuidedBuild
            ? `${classification.feedbackText} Опорная нота ${suppliedRoot} уже дана. Сыграйте две недостающие ноты: ${thirdKeyId} и ${fifthKeyId}.`
            : `${classification.feedbackText} Нажмите эти 3 клавиши.`,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: classification.outcome
      };
    }

    // Success in Guided -> Qualify
    if (state.step.endsWith('Guided')) {
      rec = { ...rec, state: 'guided', updatedAt: now };
      progress[recId] = rec;
      updatedProgress.push(rec);
    } else if (state.step.endsWith('Qualify')) {
      // Qualify streak 2
      const streak = (rec.independentUnhintedSuccesses || 0) + 1;
      if (streak >= 2) {
        rec = { ...rec, state: 'qualifying', independentUnhintedSuccesses: streak, updatedAt: now };
      } else {
        rec = { ...rec, independentUnhintedSuccesses: streak, updatedAt: now };
      }
      progress[recId] = rec;
      updatedProgress.push(rec);
    } else if (state.step.endsWith('LocalMix')) {
      // LocalMix streak 3
      const nextSuccess = state.localMixSuccessCount + 1;
      if (nextSuccess >= state.localMixTarget) {
        rec = { ...rec, state: 'mixReady', updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);
      } else {
        const nextState = buildTriadStateForStep(state.step, progress, now, nextSuccess);
        return {
          state: {
            ...nextState,
            localMixSuccessCount: nextSuccess,
            selectedKeyIds: []
          },
          updatedProgress,
          outcome: 'correct'
        };
      }
    }

    const nextStep = deriveTriadStep(progress);
    const nextState = buildTriadStateForStep(nextStep, progress, now);
    return {
      state: {
        ...nextState,
        selectedKeyIds: [],
        ...(state.step.endsWith('Guided')
          ? {
              feedbackText: `Верно! Теперь сыграйте всё трезвучие самостоятельно: ${state.targetTriadKeyIds.join(' + ')}.`,
              feedbackTone: 'good' as const
            }
          : {})
      },
      updatedProgress,
      outcome: 'correct'
    };
  }

  // Select Answer (triadIdentify)
  if (action.type === 'selectAnswer') {
    const isCorrect = action.quality === state.quality;

    // Transfer stage
    if (state.step === 'triadTransfer') {
      let transRec = progress[TRIAD_ITEM_IDS.TRANSFER] || createInitialLearningProgress(TRIAD_ITEM_IDS.TRANSFER, now);
      const hadCorrective = state.awaitingCorrective;

      if (!isCorrect) {
        transRec = {
          ...transRec,
          contexts: appendUniqueContext(transRec.contexts, 'pending:triadTransferCorrective'),
          updatedAt: now
        };
        progress[TRIAD_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        return {
          state: {
            ...state,
            progress,
            awaitingCorrective: true,
            feedbackText: `Неверно. Это ${state.quality === 'major' ? 'Мажорное' : 'Минорное'} трезвучие. Выберите правильную кнопку.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: 'wrong_quality'
        };
      }

      // Correct in transfer:
      const nextCompleted = state.transferTrialsCompleted + 1;
      const nextFirst = hadCorrective ? state.transferCorrectFirstAttempts : state.transferCorrectFirstAttempts + 1;

      let contexts = removeContext(transRec.contexts, 'pending:triadTransferCorrective');
      contexts = appendUniqueContext(contexts, `quality:${state.quality || 'major'}`);
      contexts = appendUniqueContext(contexts, 'skill:triadIdentify');
      const isChromatic = (state.rootKeyId || '').includes('#');
      contexts = appendUniqueContext(contexts, isChromatic ? 'root:chromatic' : 'root:white');

      transRec = {
        ...transRec,
        guidedSuccesses: nextCompleted,
        independentUnhintedSuccesses: nextFirst,
        contexts,
        updatedAt: now
      };

      if (isTriadTransferGateSatisfied(transRec)) {
        transRec.state = 'retention';
        let compRec = progress[TRIAD_ITEM_IDS.COMPLETE] || createInitialLearningProgress(TRIAD_ITEM_IDS.COMPLETE, now);
        compRec.state = 'retention';
        progress[TRIAD_ITEM_IDS.COMPLETE] = compRec;
        updatedProgress.push(compRec);
      }

      progress[TRIAD_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      const nextStep = deriveTriadStep(progress);
      const nextState = buildTriadStateForStep(nextStep, progress, now, nextCompleted);
      return {
        state: nextState,
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Delayed check for Identify
    if (state.step.endsWith('DelayedCheck')) {
      const recId = getTriadIdentifyItemId(state.quality || 'major');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry') && !state.awaitingCorrective;
      let mutatedCard: Card | undefined = undefined;
      let attemptResult: SubmitQuestionAttemptResult | undefined = undefined;

      if (state.awaitingCorrective) {
        if (!isCorrect) return { state, updatedProgress, outcome: 'wrong_quality' };
        let nextContexts = removeContext(rec.contexts, 'pending:corrective');
        nextContexts = appendUniqueContext(nextContexts, 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextState = buildTriadStateForStep(state.step, progress, now, 1);
        return { state: nextState, updatedProgress, outcome: 'correct' };
      }

      if (state.isInterveningRecall) {
        if (!isCorrect) return { state, updatedProgress, outcome: 'wrong_quality' };
        let nextContexts = removeContext(rec.contexts, 'pending:interveningRecall');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextState = buildTriadStateForStep(state.step, progress, now, 2);
        return { state: nextState, updatedProgress, outcome: 'correct' };
      }

      if (!isCorrect) {
        if (isFirstAttempt && params.cards) {
          const cardId = `triadIdentify:${state.quality || 'major'}`;
          const existingCard = params.cards.get(cardId);
          if (existingCard) {
            const roundState: QuestionRoundState = {
              firstResponseRecorded: false,
              attempts: 0,
              hintUsed: false,
              isCompleted: false,
              isLocked: false
            };
            const ctx = createTrialContext({
              mode: 'delayedCheck',
              sessionId: 'triad-curriculum',
              cardId,
              itemId: recId,
              hintLevel: HINT_LEVEL.NONE,
              firstAttempt: true,
              inputMethod: 'answerButton'
            });
            attemptResult = submitQuestionAttempt({
              state: roundState,
              card: existingCard,
              kind: 'scheduled',
              isCorrect: false,
              answer: state.quality || 'major',
              answerKeyId: null,
              responseMs: null,
              reviewedAt: now,
              trialContext: ctx,
              sessionId: 'triad-curriculum',
              settings: toFsrsSettings(params.userSettings)
            });
            mutatedCard = attemptResult.cardMutated ? { ...existingCard } : undefined;
          }
        }

        let nextContexts = appendUniqueContext(rec.contexts, 'pending:delayedRetry');
        nextContexts = appendUniqueContext(nextContexts, 'pending:corrective');
        rec = { ...rec, contexts: nextContexts, updatedAt: now };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const def = TRIAD_DEFINITIONS[state.quality || 'major'];
        return {
          state: {
            ...state,
            progress,
            awaitingCorrective: true,
            feedbackText: `Неверно. Это ${def.nameRu}. Выберите правильную кнопку.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          mutatedCard,
          attemptResult,
          outcome: 'wrong_quality'
        };
      }

      // Success on DelayedCheck Identify
      if (isFirstAttempt && params.cards) {
        const cardId = `triadIdentify:${state.quality || 'major'}`;
        const existingCard = params.cards.get(cardId);
        if (existingCard) {
          const roundState: QuestionRoundState = {
            firstResponseRecorded: false,
            attempts: 0,
            hintUsed: false,
            isCompleted: false,
            isLocked: false
          };
          const ctx = createTrialContext({
            mode: 'delayedCheck',
            sessionId: 'triad-curriculum',
            cardId,
            itemId: recId,
            hintLevel: HINT_LEVEL.NONE,
            firstAttempt: true,
            inputMethod: 'answerButton'
          });
          attemptResult = submitQuestionAttempt({
            state: roundState,
            card: existingCard,
            kind: 'scheduled',
            isCorrect: true,
            answer: state.quality || 'major',
            answerKeyId: null,
            responseMs: null,
            reviewedAt: now,
            trialContext: ctx,
            sessionId: 'triad-curriculum',
            settings: toFsrsSettings(params.userSettings)
          });
          mutatedCard = attemptResult.cardMutated ? { ...existingCard } : undefined;
        }
      }

      let cleanContexts = removeContext(rec.contexts, 'pending:delayedRetry');
      cleanContexts = removeContext(cleanContexts, 'pending:corrective');
      cleanContexts = removeContext(cleanContexts, 'pending:interveningRecall');
      rec = {
        ...rec,
        state: 'retention',
        contexts: cleanContexts,
        updatedAt: now
      };
      rec = markFsrsActivated(rec, now);
      rec.state = 'retention';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveTriadStep(progress);
      const nextState = buildTriadStateForStep(nextStep, progress, now);
      return {
        state: nextState,
        updatedProgress,
        mutatedCard,
        attemptResult,
        outcome: 'correct'
      };
    }

    // Normal progression for Identify (Qualify)
    const recId = getTriadIdentifyItemId(state.quality || 'major');
    let rec = progress[recId] || createInitialLearningProgress(recId, now);

    if (state.awaitingCorrective) {
      if (!isCorrect) return { state, updatedProgress, outcome: 'wrong_quality' };
      return {
        state: {
          ...state,
          awaitingCorrective: false,
          feedbackText: 'Верно! Теперь продолжим.',
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (!isCorrect) {
      return {
        state: {
          ...state,
          awaitingCorrective: true,
          feedbackText: `Неверно. Это ${state.quality === 'major' ? 'Мажорное' : 'Минорное'} трезвучие. Выберите правильную кнопку.`,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: 'wrong_quality'
      };
    }

    // Qualify success -> mixReady
    rec = { ...rec, state: 'mixReady', updatedAt: now };
    progress[recId] = rec;
    updatedProgress.push(rec);

    const nextStep = deriveTriadStep(progress);
    const nextState = buildTriadStateForStep(nextStep, progress, now);
    return {
      state: {
        ...nextState,
        feedbackText: 'Верно! Теперь проверьте распознавание по памяти.',
        feedbackTone: 'good'
      },
      updatedProgress,
      outcome: 'correct'
    };
  }

  return { state, updatedProgress };
}

export function resolveTriadKeydownAction(
  state: TriadCurriculumState,
  key: string,
  code: string
): { type: 'advanceStage' } | { type: 'selectAnswer'; quality: TriadQuality } | { type: 'submitChord' } | { type: 'dontKnow' } | null {
  if (key === 'Enter') {
    if (
      state.step === 'triadOrientation' ||
      state.step === 'contrastMajorMinor' ||
      state.step.endsWith('Model') ||
      state.step === 'moduleComplete'
    ) {
      return { type: 'advanceStage' };
    }
    if (state.activeSkill === 'triadBuild' && state.selectedKeyIds.length === 3) {
      return { type: 'submitChord' };
    }
    return null;
  }

  // Answer shortcuts 1 (Major), 2 (Minor) for triadIdentify
  if (state.activeSkill === 'triadIdentify') {
    if (key === '1' || code === 'Digit1' || code === 'Numpad1') return { type: 'selectAnswer', quality: 'major' };
    if (key === '2' || code === 'Digit2' || code === 'Numpad2') return { type: 'selectAnswer', quality: 'minor' };
  }

  return null;
}
