import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import type {
  Card,
  NoteName,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../fsrs/types';
import {
  appendUniqueContext,
  createInitialLearningProgress,
  markFsrsActivated,
  recordModelCompleted
} from './progress';
import { createTrialContext } from './trialPolicy';
import {
  HINT_LEVEL,
  type LearningProgressRecord
} from './types';
import {
  isCoreCurriculumComplete
} from './dailyPractice';
import {
  isBassGrandModuleComplete
} from './bassGrandStaff';
import type { ProgressCollectionInput } from './curriculumFlow';
import {
  keyIdFromMidi,
  midiFromKeyId,
  pitchClassFromMidi
} from '../../audio/types';

function toFsrsSettings(settings?: UserSettings) {
  return {
    desiredRetention: settings?.desiredRetention ?? 0.9,
    maxIntervalDays: settings?.maxIntervalDays ?? 36500,
    relearningSeconds: settings?.relearningSeconds ?? 600,
    useLatencyGrading: settings?.useLatencyGrading ?? true
  };
}

export type IntervalId = 'P8' | 'P5' | 'M3' | 'm3';

export const INTERVAL_ORDER: readonly IntervalId[] = ['P8', 'P5', 'M3', 'm3'] as const;

export interface IntervalDefinition {
  id: IntervalId;
  semitones: number;
  nameRu: string;
  shortRu: string;
  code: string;
  description: string;
}

export const INTERVAL_DEFINITIONS: Record<IntervalId, IntervalDefinition> = {
  P8: {
    id: 'P8',
    semitones: 12,
    nameRu: 'Октава',
    shortRu: 'Октава',
    code: 'P8',
    description: '12 полутонов · то же название ноты октавой выше'
  },
  P5: {
    id: 'P5',
    semitones: 7,
    nameRu: 'Чистая квинта',
    shortRu: 'Квинта',
    code: 'P5',
    description: '7 полутонов · устойчивый фундамент трезвучия'
  },
  M3: {
    id: 'M3',
    semitones: 4,
    nameRu: 'Большая терция',
    shortRu: 'Большая терция',
    code: 'M3',
    description: '4 полутона · светлое мажорное звучание'
  },
  m3: {
    id: 'm3',
    semitones: 3,
    nameRu: 'Малая терция',
    shortRu: 'Малая терция',
    code: 'm3',
    description: '3 полутона · задумчивое минорное звучание'
  }
};

export const INTERVAL_ACQUISITION_ORDER: readonly IntervalId[] = [
  'P8',
  'P5',
  'M3',
  'm3'
] as const;

export const INTERVAL_ITEM_IDS = {
  ORIENTATION: 'advanced-interval:orientation',
  BUILD_P8: 'advanced-interval-build:P8',
  BUILD_P5: 'advanced-interval-build:P5',
  BUILD_M3: 'advanced-interval-build:M3',
  BUILD_m3: 'advanced-interval-build:m3',
  CONTRAST_M3_m3: 'advanced-interval:contrast-M3-m3',
  IDENTIFY_P8: 'advanced-interval-identify:P8',
  IDENTIFY_P5: 'advanced-interval-identify:P5',
  IDENTIFY_M3: 'advanced-interval-identify:M3',
  IDENTIFY_m3: 'advanced-interval-identify:m3',
  TRANSFER: 'advanced-interval:transfer',
  COMPLETE: 'advanced-interval:complete'
} as const;

export function getIntervalBuildItemId(intervalId: IntervalId): string {
  return `advanced-interval-build:${intervalId}`;
}

export function getIntervalIdentifyItemId(intervalId: IntervalId): string {
  return `advanced-interval-identify:${intervalId}`;
}

export type IntervalStep =
  | 'intervalOrientation'
  | 'p8BuildModel'
  | 'p8BuildGuided'
  | 'p8BuildQualify'
  | 'p8BuildLocalMix'
  | 'p8BuildDelayedCheck'
  | 'p5BuildModel'
  | 'p5BuildGuided'
  | 'p5BuildQualify'
  | 'p5BuildLocalMix'
  | 'p5BuildDelayedCheck'
  | 'major3BuildModel'
  | 'major3BuildGuided'
  | 'major3BuildQualify'
  | 'major3BuildLocalMix'
  | 'major3BuildDelayedCheck'
  | 'minor3BuildModel'
  | 'minor3BuildGuided'
  | 'minor3BuildQualify'
  | 'minor3BuildLocalMix'
  | 'minor3BuildDelayedCheck'
  | 'contrastM3m3'
  | 'p8IdentifyModel'
  | 'p8IdentifyQualify'
  | 'p8IdentifyDelayedCheck'
  | 'p5IdentifyModel'
  | 'p5IdentifyQualify'
  | 'p5IdentifyDelayedCheck'
  | 'major3IdentifyModel'
  | 'major3IdentifyQualify'
  | 'major3IdentifyDelayedCheck'
  | 'minor3IdentifyModel'
  | 'minor3IdentifyQualify'
  | 'minor3IdentifyDelayedCheck'
  | 'intervalTransfer'
  | 'moduleComplete';

export const INTERVAL_STEPS: readonly IntervalStep[] = [
  'intervalOrientation',
  'p8BuildModel',
  'p8BuildGuided',
  'p8BuildQualify',
  'p8BuildLocalMix',
  'p8BuildDelayedCheck',
  'p5BuildModel',
  'p5BuildGuided',
  'p5BuildQualify',
  'p5BuildLocalMix',
  'p5BuildDelayedCheck',
  'major3BuildModel',
  'major3BuildGuided',
  'major3BuildQualify',
  'major3BuildLocalMix',
  'major3BuildDelayedCheck',
  'minor3BuildModel',
  'minor3BuildGuided',
  'minor3BuildQualify',
  'minor3BuildLocalMix',
  'minor3BuildDelayedCheck',
  'contrastM3m3',
  'p8IdentifyModel',
  'p8IdentifyQualify',
  'p8IdentifyDelayedCheck',
  'p5IdentifyModel',
  'p5IdentifyQualify',
  'p5IdentifyDelayedCheck',
  'major3IdentifyModel',
  'major3IdentifyQualify',
  'major3IdentifyDelayedCheck',
  'minor3IdentifyModel',
  'minor3IdentifyQualify',
  'minor3IdentifyDelayedCheck',
  'intervalTransfer',
  'moduleComplete'
] as const;

export const INTERVAL_TRANSFER_MIN_TRIALS = 12;
export const INTERVAL_TRANSFER_REQUIRED_ACCURACY = 0.8;

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

export function getIntervalDefinition(intervalId: IntervalId): IntervalDefinition {
  return INTERVAL_DEFINITIONS[intervalId];
}

/**
 * Returns available roots for an interval where the target remains within the piano keyboard range (C2–C6, MIDI 36..84).
 * Preferred working roots are in C3–B4 (MIDI 48..71).
 */
export function getValidRootsForInterval(intervalId: IntervalId, includeChromatic = true): string[] {
  const def = INTERVAL_DEFINITIONS[intervalId];
  if (!def) return ['C4'];
  const semitones = def.semitones;
  const roots: string[] = [];

  // Range C3 (48) to B4 (71)
  for (let midi = 48; midi <= 71; midi++) {
    const targetMidi = midi + semitones;
    if (targetMidi <= 84) {
      const note = pitchClassFromMidi(midi);
      if (includeChromatic || !note.includes('#')) {
        roots.push(keyIdFromMidi(midi));
      }
    }
  }
  return roots.length > 0 ? roots : ['C4'];
}

/**
 * Computes the target key and note for an ascending interval from a root key.
 */
export function resolveIntervalTarget(
  rootKeyId: string,
  intervalId: IntervalId
): { targetKeyId: string; targetNote: NoteName; targetMidi: number; semitones: number } {
  const def = INTERVAL_DEFINITIONS[intervalId];
  const semitones = def ? def.semitones : 0;
  const rootMidi = midiFromKeyId(rootKeyId) ?? 60;
  const targetMidi = rootMidi + semitones;
  const targetKeyId = keyIdFromMidi(targetMidi);
  const targetNote = pitchClassFromMidi(targetMidi);
  return { targetKeyId, targetNote, targetMidi, semitones };
}

/**
 * Checks whether the advanced module "Interval Foundations" is available to start.
 * Available only after both core curriculum and 3F Bass & Grand Staff are completed.
 */
export function isIntervalModuleAvailable(input?: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
} | ProgressCollectionInput): boolean {
  if (!input) return false;
  const normalized = (typeof input === 'object' && ('learningProgress' in input || 'cards' in input))
    ? input as { learningProgress?: ProgressCollectionInput; cards?: any; reviewLogs?: any }
    : { learningProgress: input as ProgressCollectionInput };
  return isCoreCurriculumComplete(normalized) && isBassGrandModuleComplete(normalized.learningProgress);
}

export function isTransferGateSatisfied(transRec?: LearningProgressRecord): boolean {
  if (!transRec) return false;
  const trialsDone = transRec.guidedSuccesses ?? 0;
  const correctFirst = transRec.independentUnhintedSuccesses ?? 0;
  const acc = trialsDone > 0 ? correctFirst / trialsDone : 0;
  if (trialsDone < INTERVAL_TRANSFER_MIN_TRIALS || acc < INTERVAL_TRANSFER_REQUIRED_ACCURACY) {
    return false;
  }
  const contexts = transRec.contexts ?? [];
  const hasAllIntervals =
    contexts.includes('interval:P8') &&
    contexts.includes('interval:P5') &&
    contexts.includes('interval:M3') &&
    contexts.includes('interval:m3');
  const hasBothSkills =
    contexts.includes('skill:intervalBuild') &&
    contexts.includes('skill:intervalIdentify');
  const hasChromatic = contexts.includes('root:chromatic');

  return hasAllIntervals && hasBothSkills && hasChromatic;
}

/**
 * Checks whether the advanced module "Interval Foundations" is fully completed.
 */
export function isIntervalModuleComplete(
  input?: ProgressCollectionInput | { learningProgress?: ProgressCollectionInput }
): boolean {
  const map = normalizeProgressMap(input);
  const comp = map.get(INTERVAL_ITEM_IDS.COMPLETE);
  const trans = map.get(INTERVAL_ITEM_IDS.TRANSFER);
  return comp?.state === 'retention' || isTransferGateSatisfied(trans);
}

/**
 * Returns user-facing status for the Interval module:
 * - 'not_started'
 * - 'in_progress'
 * - 'completed'
 */
export function getIntervalModuleStatus(input?: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
} | ProgressCollectionInput): 'not_started' | 'in_progress' | 'completed' {
  if (!input) return 'not_started';

  if (isIntervalModuleComplete(input)) {
    return 'completed';
  }
  const map = normalizeProgressMap(input);
  const hasAnyProgress =
    map.has(INTERVAL_ITEM_IDS.ORIENTATION) ||
    map.has(INTERVAL_ITEM_IDS.BUILD_P8) ||
    map.has(INTERVAL_ITEM_IDS.BUILD_P5) ||
    map.has(INTERVAL_ITEM_IDS.BUILD_M3) ||
    map.has(INTERVAL_ITEM_IDS.BUILD_m3) ||
    map.has(INTERVAL_ITEM_IDS.CONTRAST_M3_m3) ||
    map.has(INTERVAL_ITEM_IDS.IDENTIFY_P8) ||
    map.has(INTERVAL_ITEM_IDS.IDENTIFY_P5) ||
    map.has(INTERVAL_ITEM_IDS.IDENTIFY_M3) ||
    map.has(INTERVAL_ITEM_IDS.IDENTIFY_m3) ||
    map.has(INTERVAL_ITEM_IDS.TRANSFER);

  return hasAnyProgress ? 'in_progress' : 'not_started';
}

export interface IntervalStepDescription {
  step: IntervalStep;
  kind: 'orientation' | 'build' | 'contrast' | 'identify' | 'transfer' | 'complete';
  subStage?: 'model' | 'guided' | 'qualify' | 'localMix' | 'delayedCheck';
  focusInterval?: IntervalId;
  activeSkill: 'intervalBuild' | 'intervalIdentify' | 'none';
  rootKeyId?: string;
  targetKeyId?: string;
  title: string;
  subtitle: string;
  hintText?: string;
}

export function describeIntervalStep(
  step: IntervalStep,
  state?: IntervalCurriculumState
): IntervalStepDescription {
  if (step === 'intervalOrientation') {
    return {
      step,
      kind: 'orientation',
      activeSkill: 'none',
      rootKeyId: 'C4',
      targetKeyId: 'C#4',
      title: 'Что такое интервал?',
      subtitle: 'Расстояние между двумя нотами и полутоновая система',
      hintText:
        'Интервал — это расстояние между двумя нотами по высоте. Минимальный шаг между соседними клавишами на фортепиано называется полутоном. Два полутона образуют целый тон.'
    };
  }

  if (step === 'contrastM3m3') {
    return {
      step,
      kind: 'contrast',
      activeSkill: 'none',
      rootKeyId: 'C4',
      targetKeyId: 'E4',
      title: 'Большая и малая терция: контраст в один полутон',
      subtitle: 'C → E (4 полутона) против C → Eb (3 полутона)',
      hintText:
        'Разница между большой и малой терцией составляет всего одну клавишу (один полутон). Большая терция звучит светло и открыто, а малая — мягко и задумчиво.'
    };
  }

  if (step === 'intervalTransfer') {
    return {
      step,
      kind: 'transfer',
      activeSkill: state?.activeSkill ?? 'intervalBuild',
      focusInterval: state?.focusInterval,
      rootKeyId: state?.rootKeyId,
      targetKeyId: state?.targetKeyId,
      title: 'Интервалы: перенос навыка',
      subtitle: 'Смешанное построение и распознавание на белых и чёрных клавишах',
      hintText:
        'Используйте форму интервала и слуховой ориентир. Задания на построение и распознавание чередуются.'
    };
  }

  if (step === 'moduleComplete') {
    return {
      step,
      kind: 'complete',
      activeSkill: 'none',
      title: 'Интервалы освоены',
      subtitle: 'Фундамент для построения аккордов готов',
      hintText:
        'Вы научились видеть и строить октаву, чистую квинту, большую и малую терцию. Теперь аккорды будут восприниматься как понятная структура 1–3–5.'
    };
  }

  // Build steps
  if (step.includes('Build')) {
    let focusInterval: IntervalId = 'P8';
    if (step.startsWith('p8')) focusInterval = 'P8';
    else if (step.startsWith('p5')) focusInterval = 'P5';
    else if (step.startsWith('major3')) focusInterval = 'M3';
    else if (step.startsWith('minor3')) focusInterval = 'm3';

    const def = INTERVAL_DEFINITIONS[focusInterval];
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
      focusInterval,
      activeSkill: 'intervalBuild',
      rootKeyId: state?.rootKeyId ?? 'C4',
      targetKeyId: state?.targetKeyId,
      title: `${def.nameRu} (${def.code}) · ${def.semitones} полутонов`,
      subtitle:
        subStage === 'model'
          ? `Модель и форма интервала вверх от ${state?.rootKeyId ?? 'C4'}`
          : subStage === 'guided'
          ? `Построение с подсказкой от ${state?.rootKeyId ?? 'C4'}`
          : subStage === 'qualify'
          ? `Построение самостоятельно от ${state?.rootKeyId ?? 'C4'}`
          : subStage === 'localMix'
          ? `Закрепление на разных клавишах`
          : `Проверка по памяти`,
      hintText: def.description
    };
  }

  // Identify steps
  let focusInterval: IntervalId = 'P8';
  if (step.startsWith('p8')) focusInterval = 'P8';
  else if (step.startsWith('p5')) focusInterval = 'P5';
  else if (step.startsWith('major3')) focusInterval = 'M3';
  else if (step.startsWith('minor3')) focusInterval = 'm3';

  const def = INTERVAL_DEFINITIONS[focusInterval];
  let subStage: 'model' | 'qualify' | 'localMix' | 'delayedCheck' = 'model';
  if (step.endsWith('Model')) subStage = 'model';
  else if (step.endsWith('Qualify')) subStage = 'qualify';
  else if (step.endsWith('DelayedCheck')) subStage = 'delayedCheck';

  return {
    step,
    kind: 'identify',
    subStage,
    focusInterval,
    activeSkill: 'intervalIdentify',
    rootKeyId: state?.rootKeyId ?? 'C4',
    targetKeyId: state?.targetKeyId,
    title: `Распознавание: ${def.nameRu}`,
    subtitle:
      subStage === 'model'
        ? `Модель интервала (${def.semitones} полутонов)`
        : subStage === 'qualify'
        ? `Определение без подсказок`
        : `Проверка по памяти`,
    hintText: def.description
  };
}

export interface IntervalCurriculumState {
  step: IntervalStep;
  progress: Record<string, LearningProgressRecord>;
  activeSkill: 'intervalBuild' | 'intervalIdentify' | 'none';
  focusInterval?: IntervalId;
  rootKeyId?: string;
  targetKeyId?: string;
  targetKeyIds: readonly string[];
  structuralGuideKeyIds: readonly string[];
  modelLabelKeyIds: readonly string[];
  awaitingCorrective: boolean;
  isInterveningRecall: boolean;
  feedbackText?: string;
  feedbackTone?: 'good' | 'bad' | 'warn' | 'info';
  localMixSuccessCount: number;
  localMixTarget: number;
  transferTrialsCompleted: number;
  transferCorrectFirstAttempts: number;
  transferIntervalsSeen: IntervalId[];
  transferSkillsSeen: Skill[];
  transferChromaticSeen: number;
  contrastStepIndex?: number;
}

export type IntervalAction =
  | { type: 'keyPress'; keyId: string; note: string }
  | { type: 'selectAnswer'; intervalId: IntervalId }
  | { type: 'dontKnow' }
  | { type: 'advanceStage' }
  | { type: 'resetModule' };

export interface ApplyIntervalActionResult {
  state: IntervalCurriculumState;
  updatedProgress: LearningProgressRecord[];
  mutatedCard?: Card;
  attemptResult?: SubmitQuestionAttemptResult;
  outcome?: 'correct' | 'wrong_note' | 'wrong_octave' | 'wrong_interval' | 'advance' | 'dont_know';
}

/**
 * Creates initial or hydrated interval curriculum state from persisted progress.
 */
export function createIntervalCurriculumState(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
  now?: number;
}): IntervalCurriculumState {
  const now = input.now ?? Date.now();
  const map = normalizeProgressMap(input.learningProgress);
  const progress: Record<string, LearningProgressRecord> = {};

  const allItemIds = [
    INTERVAL_ITEM_IDS.ORIENTATION,
    INTERVAL_ITEM_IDS.BUILD_P8,
    INTERVAL_ITEM_IDS.BUILD_P5,
    INTERVAL_ITEM_IDS.BUILD_M3,
    INTERVAL_ITEM_IDS.BUILD_m3,
    INTERVAL_ITEM_IDS.CONTRAST_M3_m3,
    INTERVAL_ITEM_IDS.IDENTIFY_P8,
    INTERVAL_ITEM_IDS.IDENTIFY_P5,
    INTERVAL_ITEM_IDS.IDENTIFY_M3,
    INTERVAL_ITEM_IDS.IDENTIFY_m3,
    INTERVAL_ITEM_IDS.TRANSFER,
    INTERVAL_ITEM_IDS.COMPLETE
  ];

  for (const id of allItemIds) {
    const existing = map.get(id);
    progress[id] = existing
      ? { ...existing, contexts: [...existing.contexts] }
      : createInitialLearningProgress(id, now);
  }

  // Derive initial step
  const step = deriveIntervalStep(progress);
  return buildIntervalStateForStep(step, progress, now);
}

/**
 * Derives current step from progress records.
 */
export function deriveIntervalStep(
  progress: Record<string, LearningProgressRecord>
): IntervalStep {
  if (progress[INTERVAL_ITEM_IDS.COMPLETE]?.state === 'retention') {
    return 'moduleComplete';
  }

  const orientRec = progress[INTERVAL_ITEM_IDS.ORIENTATION];
  if (!orientRec || orientRec.state === 'unseen') {
    return 'intervalOrientation';
  }

  // Build steps
  const buildSpecs: { id: IntervalId; prefix: string; recId: string }[] = [
    { id: 'P8', prefix: 'p8Build', recId: INTERVAL_ITEM_IDS.BUILD_P8 },
    { id: 'P5', prefix: 'p5Build', recId: INTERVAL_ITEM_IDS.BUILD_P5 },
    { id: 'M3', prefix: 'major3Build', recId: INTERVAL_ITEM_IDS.BUILD_M3 },
    { id: 'm3', prefix: 'minor3Build', recId: INTERVAL_ITEM_IDS.BUILD_m3 }
  ];

  for (const spec of buildSpecs) {
    const rec = progress[spec.recId];
    if (!rec || rec.state === 'unseen') {
      return `${spec.prefix}Model` as IntervalStep;
    }
    if (rec.state === 'introduced') {
      return `${spec.prefix}Guided` as IntervalStep;
    }
    if (rec.state === 'guided') {
      return `${spec.prefix}Qualify` as IntervalStep;
    }
    if (rec.state === 'qualifying') {
      return `${spec.prefix}LocalMix` as IntervalStep;
    }
    if (rec.state === 'mixReady' || rec.contexts.includes('pending:delayedRetry')) {
      return `${spec.prefix}DelayedCheck` as IntervalStep;
    }
  }

  // Contrast step
  const contrastRec = progress[INTERVAL_ITEM_IDS.CONTRAST_M3_m3];
  if (!contrastRec || contrastRec.state !== 'retention') {
    return 'contrastM3m3';
  }

  // Identify steps
  const identifySpecs: { id: IntervalId; prefix: string; recId: string }[] = [
    { id: 'P8', prefix: 'p8Identify', recId: INTERVAL_ITEM_IDS.IDENTIFY_P8 },
    { id: 'P5', prefix: 'p5Identify', recId: INTERVAL_ITEM_IDS.IDENTIFY_P5 },
    { id: 'M3', prefix: 'major3Identify', recId: INTERVAL_ITEM_IDS.IDENTIFY_M3 },
    { id: 'm3', prefix: 'minor3Identify', recId: INTERVAL_ITEM_IDS.IDENTIFY_m3 }
  ];

  for (const spec of identifySpecs) {
    const rec = progress[spec.recId];
    if (!rec || rec.state === 'unseen') {
      return `${spec.prefix}Model` as IntervalStep;
    }
    if (rec.state === 'guided') {
      return `${spec.prefix}Qualify` as IntervalStep;
    }
    if (rec.state === 'qualifying' || rec.state === 'mixReady' || rec.contexts.includes('pending:delayedRetry')) {
      return `${spec.prefix}DelayedCheck` as IntervalStep;
    }
  }

  // Transfer step
  const transferRec = progress[INTERVAL_ITEM_IDS.TRANSFER];
  if (!transferRec || transferRec.state !== 'retention' || !isTransferGateSatisfied(transferRec)) {
    return 'intervalTransfer';
  }

  return 'moduleComplete';
}

export interface IntervalTrialConfig {
  skill: 'intervalBuild' | 'intervalIdentify';
  intervalId: IntervalId;
  rootKeyId: string;
  targetKeyId: string;
  isChromaticRoot: boolean;
}

export const TRANSFER_CYCLE: readonly {
  skill: 'intervalBuild' | 'intervalIdentify';
  intervalId: IntervalId;
  rootKeyId: string;
  isChromaticRoot: boolean;
}[] = [
  { skill: 'intervalBuild', intervalId: 'P8', rootKeyId: 'C4', isChromaticRoot: false },
  { skill: 'intervalIdentify', intervalId: 'P8', rootKeyId: 'D4', isChromaticRoot: false },
  { skill: 'intervalBuild', intervalId: 'P5', rootKeyId: 'F#3', isChromaticRoot: true },
  { skill: 'intervalIdentify', intervalId: 'P5', rootKeyId: 'G3', isChromaticRoot: false },
  { skill: 'intervalBuild', intervalId: 'M3', rootKeyId: 'C4', isChromaticRoot: false },
  { skill: 'intervalIdentify', intervalId: 'M3', rootKeyId: 'C#4', isChromaticRoot: true },
  { skill: 'intervalBuild', intervalId: 'm3', rootKeyId: 'A3', isChromaticRoot: false },
  { skill: 'intervalIdentify', intervalId: 'm3', rootKeyId: 'D#4', isChromaticRoot: true },
  // Trials 8-11:
  { skill: 'intervalBuild', intervalId: 'P8', rootKeyId: 'F3', isChromaticRoot: false },
  { skill: 'intervalIdentify', intervalId: 'P5', rootKeyId: 'A#3', isChromaticRoot: true },
  { skill: 'intervalBuild', intervalId: 'M3', rootKeyId: 'F4', isChromaticRoot: false },
  { skill: 'intervalIdentify', intervalId: 'm3', rootKeyId: 'E4', isChromaticRoot: false }
] as const;

export function buildIntervalTransferTrial(trialIndex: number): IntervalTrialConfig {
  const item = TRANSFER_CYCLE[trialIndex % TRANSFER_CYCLE.length];
  const { targetKeyId } = resolveIntervalTarget(item.rootKeyId, item.intervalId);
  return {
    skill: item.skill,
    intervalId: item.intervalId,
    rootKeyId: item.rootKeyId,
    targetKeyId,
    isChromaticRoot: item.isChromaticRoot
  };
}

/**
 * Builds the visual and active target configuration for an interval step.
 */
export function buildIntervalStateForStep(
  step: IntervalStep,
  progress: Record<string, LearningProgressRecord>,
  _now = Date.now(),
  prevTrialIndex = 0
): IntervalCurriculumState {
  const transferRec = progress[INTERVAL_ITEM_IDS.TRANSFER];
  const transferTrialsCompleted = transferRec?.guidedSuccesses ?? 0;
  const transferCorrectFirstAttempts = transferRec?.independentUnhintedSuccesses ?? 0;
  const hasPendingTransferCorrective = Boolean(
    transferRec?.contexts?.includes('pending:intervalTransferCorrective')
  );

  const baseState: IntervalCurriculumState = {
    step,
    progress,
    activeSkill: 'none',
    targetKeyIds: [],
    structuralGuideKeyIds: [],
    modelLabelKeyIds: [],
    awaitingCorrective: false,
    isInterveningRecall: false,
    localMixSuccessCount: 0,
    localMixTarget: 3,
    transferTrialsCompleted,
    transferCorrectFirstAttempts,
    transferIntervalsSeen: [],
    transferSkillsSeen: [],
    transferChromaticSeen: 0
  };

  if (step === 'intervalOrientation') {
    return {
      ...baseState,
      rootKeyId: 'C4',
      targetKeyId: 'C#4',
      structuralGuideKeyIds: ['C4'],
      targetKeyIds: ['C#4'],
      feedbackText: 'Полутон: минимальный шаг между клавишами (C4 → C#4). Тон = 2 полутона (C4 → D4).'
    };
  }

  if (step === 'contrastM3m3') {
    return {
      ...baseState,
      rootKeyId: 'C4',
      targetKeyId: 'E4',
      structuralGuideKeyIds: ['C4'],
      targetKeyIds: ['D#4', 'E4'],
      feedbackText: 'Большая терция: C4 → E4 (4 полутона). Малая терция: C4 → Eb4 (3 полутона).'
    };
  }

  if (step === 'intervalTransfer') {
    const trialIndex = prevTrialIndex > 0 ? prevTrialIndex : transferTrialsCompleted;
    const trial = buildIntervalTransferTrial(trialIndex);
    const awaitingCorrective = hasPendingTransferCorrective;
    const contexts = transferRec?.contexts ?? [];
    const transferIntervalsSeen = (['P8', 'P5', 'M3', 'm3'] as const).filter(id => contexts.includes(`interval:${id}`));
    const transferSkillsSeen = (['intervalBuild', 'intervalIdentify'] as const).filter(s => contexts.includes(`skill:${s}`));
    const transferChromaticSeen = contexts.includes('root:chromatic') ? 1 : 0;

    const correctivePrompt = trial.skill === 'intervalBuild'
      ? `Запоминаем: это ${INTERVAL_DEFINITIONS[trial.intervalId].nameRu} (${trial.rootKeyId} → ${trial.targetKeyId}). Нажмите подсвеченную клавишу ${trial.targetKeyId}.`
      : `Запоминаем: это ${INTERVAL_DEFINITIONS[trial.intervalId].nameRu} (${INTERVAL_DEFINITIONS[trial.intervalId].semitones} полутонов). Выберите правильный интервал на кнопках ниже.`;

    return {
      ...baseState,
      activeSkill: trial.skill,
      focusInterval: trial.intervalId,
      rootKeyId: trial.rootKeyId,
      targetKeyId: trial.targetKeyId,
      structuralGuideKeyIds: [trial.rootKeyId],
      targetKeyIds:
        trial.skill === 'intervalIdentify' || awaitingCorrective
          ? [trial.rootKeyId, trial.targetKeyId]
          : [],
      awaitingCorrective,
      transferIntervalsSeen,
      transferSkillsSeen,
      transferChromaticSeen,
      feedbackText: awaitingCorrective
        ? correctivePrompt
        : trial.skill === 'intervalBuild'
        ? `Постройте интервал ${INTERVAL_DEFINITIONS[trial.intervalId].nameRu} вверх от ${trial.rootKeyId}.`
        : `Какой интервал между двумя подсвеченными клавишами?`,
      feedbackTone: awaitingCorrective ? 'bad' : 'info'
    };
  }

  if (step === 'moduleComplete') {
    return {
      ...baseState,
      feedbackText: 'Модуль «Интервалы» успешно завершён!',
      feedbackTone: 'good'
    };
  }

  // Interval Build steps
  if (step.includes('Build')) {
    let intervalId: IntervalId = 'P8';
    if (step.startsWith('p8')) intervalId = 'P8';
    else if (step.startsWith('p5')) intervalId = 'P5';
    else if (step.startsWith('major3')) intervalId = 'M3';
    else if (step.startsWith('minor3')) intervalId = 'm3';

    const def = INTERVAL_DEFINITIONS[intervalId];
    const recId = getIntervalBuildItemId(intervalId);
    const rec = progress[recId];
    const awaitingCorrective = Boolean(rec?.contexts?.includes('pending:corrective'));
    const isInterveningRecall = Boolean(!awaitingCorrective && rec?.contexts?.includes('pending:interveningRecall'));

    // Select root
    let rootKeyId = 'C4';
    if (intervalId === 'm3') rootKeyId = 'A3'; // A3 -> C4 is canonical white-key minor 3rd

    if (step.endsWith('LocalMix')) {
      const roots = getValidRootsForInterval(intervalId, true);
      rootKeyId = roots[(prevTrialIndex + 2) % roots.length];
    } else if (step.endsWith('DelayedCheck')) {
      const roots = getValidRootsForInterval(intervalId, false);
      const defaultRoot = roots[(prevTrialIndex + 3) % roots.length] || 'C4';
      if (isInterveningRecall) {
        const altRoots = roots.filter(r => r !== defaultRoot);
        rootKeyId = altRoots[0] || (defaultRoot === 'C4' ? 'F4' : 'C4');
      } else {
        rootKeyId = defaultRoot;
      }
    }

    const { targetKeyId } = resolveIntervalTarget(rootKeyId, intervalId);
    const isModel = step.endsWith('Model');
    const isGuided = step.endsWith('Guided');

    let feedbackText = '';
    let feedbackTone: 'good' | 'bad' | 'info' | undefined = undefined;

    if (isModel) {
      feedbackText = `${def.nameRu}: ${def.semitones} полутонов. Сыграйте клавишу ${targetKeyId} или нажмите «Продолжить».`;
      feedbackTone = 'info';
    } else if (isGuided) {
      feedbackText = awaitingCorrective
        ? `Запомните: ${def.nameRu} от ${rootKeyId} — это ${targetKeyId}. Нажмите ${targetKeyId}.`
        : `Постройте интервал: ${def.nameRu} (отсчитайте ${def.semitones} полутонов вверх от ${rootKeyId}).`;
      feedbackTone = awaitingCorrective ? 'bad' : 'info';
    } else if (awaitingCorrective) {
      feedbackText = `Запомните: ${def.nameRu} от ${rootKeyId} — это ${targetKeyId}. Нажмите ${targetKeyId}.`;
      feedbackTone = 'bad';
    } else if (isInterveningRecall) {
      feedbackText = `Контрастный шаг: сначала постройте ${def.nameRu} от ${rootKeyId}, затем повторим проверку по памяти.`;
      feedbackTone = 'info';
    } else if (step.endsWith('Qualify')) {
      feedbackText = `Постройте интервал ${def.nameRu} вверх от опорной ноты ${rootKeyId} самостоятельно.`;
    } else if (step.endsWith('LocalMix')) {
      feedbackText = `Постройте ${def.nameRu} вверх от опорной ноты ${rootKeyId}.`;
    } else {
      feedbackText = `Финальная проверка: постройте ${def.nameRu} вверх от ноты ${rootKeyId} по памяти.`;
    }

    return {
      ...baseState,
      activeSkill: 'intervalBuild',
      focusInterval: intervalId,
      rootKeyId,
      targetKeyId,
      structuralGuideKeyIds: [rootKeyId],
      targetKeyIds: isModel || awaitingCorrective ? [targetKeyId] : [],
      awaitingCorrective,
      isInterveningRecall,
      feedbackText,
      feedbackTone
    };
  }

  // Interval Identify steps
  let intervalId: IntervalId = 'P8';
  if (step.startsWith('p8')) intervalId = 'P8';
  else if (step.startsWith('p5')) intervalId = 'P5';
  else if (step.startsWith('major3')) intervalId = 'M3';
  else if (step.startsWith('minor3')) intervalId = 'm3';

  const def = INTERVAL_DEFINITIONS[intervalId];
  const recId = getIntervalIdentifyItemId(intervalId);
  const rec = progress[recId];
  const awaitingCorrective = Boolean(rec?.contexts?.includes('pending:corrective'));
  const isInterveningRecall = Boolean(!awaitingCorrective && rec?.contexts?.includes('pending:interveningRecall'));

  let rootKeyId = 'C4';
  if (intervalId === 'm3') rootKeyId = 'A3';
  if (step.endsWith('Qualify')) rootKeyId = 'D4';
  if (step.endsWith('DelayedCheck')) {
    rootKeyId = isInterveningRecall ? 'D4' : 'F4';
  }

  const { targetKeyId } = resolveIntervalTarget(rootKeyId, intervalId);
  const isModel = step.endsWith('Model');

  let feedbackText = '';
  let feedbackTone: 'good' | 'bad' | 'info' | undefined = undefined;

  if (isModel) {
    feedbackText = `${def.nameRu}: расстояние между ${rootKeyId} и ${targetKeyId} составляет ${def.semitones} полутонов.`;
    feedbackTone = 'info';
  } else if (awaitingCorrective) {
    feedbackText = `Запоминаем: это ${def.nameRu} (${def.semitones} полутонов). Выберите ${def.nameRu} на кнопках ниже.`;
    feedbackTone = 'bad';
  } else if (isInterveningRecall) {
    feedbackText = `Контрастный шаг: определите интервал между новыми клавишами, затем вернёмся к проверке.`;
    feedbackTone = 'info';
  } else if (step.endsWith('Qualify')) {
    feedbackText = `Определите интервал между двумя подсвеченными клавишами.`;
  } else {
    feedbackText = `Финальная проверка: определите интервал между двумя подсвеченными клавишами.`;
  }

  return {
    ...baseState,
    activeSkill: 'intervalIdentify',
    focusInterval: intervalId,
    rootKeyId,
    targetKeyId,
    structuralGuideKeyIds: [rootKeyId],
    targetKeyIds: [rootKeyId, targetKeyId], // Both keys highlighted for identify
    awaitingCorrective,
    isInterveningRecall,
    feedbackText,
    feedbackTone
  };
}

export function canUseDontKnowInIntervalStep(state: IntervalCurriculumState): boolean {
  if (state.awaitingCorrective) return false;
  if (state.step === 'intervalOrientation' || state.step === 'contrastM3m3' || state.step === 'moduleComplete') {
    return false;
  }
  if (state.step.endsWith('Model')) return false;
  return true;
}

/**
 * Evaluates an action within the interval curriculum state machine and applies FSRS updates if eligible.
 */
export function applyIntervalActionWithCards(
  paramsOrState: {
    state: IntervalCurriculumState;
    action: IntervalAction;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly ReviewLogEvent[];
    settings?: UserSettings;
    now?: number;
  } | IntervalCurriculumState,
  actionArg?: IntervalAction,
  optionsArg?: {
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    progress?: Record<string, LearningProgressRecord>;
    reviewLogs?: readonly ReviewLogEvent[];
    settings?: UserSettings;
    now?: number;
  }
): ApplyIntervalActionResult {
  const isObjectCall = 'state' in (paramsOrState as any) && 'action' in (paramsOrState as any);
  const state: IntervalCurriculumState = isObjectCall
    ? (paramsOrState as any).state
    : (paramsOrState as IntervalCurriculumState);
  const action: IntervalAction = isObjectCall
    ? (paramsOrState as any).action
    : actionArg!;
  const options = isObjectCall ? (paramsOrState as any) : (optionsArg ?? {});
  const now = options.now ?? Date.now();
  const userSettings = options.settings;
  const progress = options.progress ?? { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];
  let mutatedCard: Card | undefined;
  let attemptResult: SubmitQuestionAttemptResult | undefined;

  const cardsMap = new Map<string, Card>();
  if (options.cards) {
    if (options.cards instanceof Map) {
      for (const [k, v] of options.cards) cardsMap.set(k, v);
    } else if (Array.isArray(options.cards)) {
      for (const c of options.cards) cardsMap.set(c.id, c);
    }
  }

  // 1. Advance stage (for orientation, models, contrast, completion)
  if (action.type === 'advanceStage') {
    if (state.step === 'intervalOrientation') {
      const rec = recordModelCompleted(
        progress[INTERVAL_ITEM_IDS.ORIENTATION] || createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION, now),
        now,
        'model:intervalOrientation'
      );
      rec.state = 'retention';
      progress[INTERVAL_ITEM_IDS.ORIENTATION] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: buildIntervalStateForStep(nextStep, progress, now),
        updatedProgress,
        outcome: 'advance'
      };
    }

    if (state.step === 'contrastM3m3') {
      const rec = recordModelCompleted(
        progress[INTERVAL_ITEM_IDS.CONTRAST_M3_m3] || createInitialLearningProgress(INTERVAL_ITEM_IDS.CONTRAST_M3_m3, now),
        now,
        'model:contrastM3m3'
      );
      rec.state = 'retention';
      progress[INTERVAL_ITEM_IDS.CONTRAST_M3_m3] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: buildIntervalStateForStep(nextStep, progress, now),
        updatedProgress,
        outcome: 'advance'
      };
    }

    if (state.step.endsWith('Model')) {
      const focusInterval = state.focusInterval ?? 'P8';
      const isBuild = state.step.includes('Build');
      const recId = isBuild
        ? getIntervalBuildItemId(focusInterval)
        : getIntervalIdentifyItemId(focusInterval);

      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = recordModelCompleted(rec, now, `model:${recId}`);
      rec.state = isBuild ? 'introduced' : 'guided';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: buildIntervalStateForStep(nextStep, progress, now),
        updatedProgress,
        outcome: 'advance'
      };
    }

    return { state, updatedProgress, outcome: 'advance' };
  }

  // 2. Don't Know handling
  if (action.type === 'dontKnow') {
    if (!canUseDontKnowInIntervalStep(state)) {
      return { state, updatedProgress };
    }

    // In transfer:
    if (state.step === 'intervalTransfer') {
      let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
      transRec = {
        ...transRec,
        contexts: appendUniqueContext(transRec.contexts, 'pending:intervalTransferCorrective')
      };
      progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      const def = INTERVAL_DEFINITIONS[state.focusInterval || 'P8'];
      const correctivePrompt = state.activeSkill === 'intervalBuild'
        ? `Ничего страшного! Запоминаем: это ${def.nameRu} (${state.rootKeyId} → ${state.targetKeyId}). Сыграйте точную клавишу ${state.targetKeyId} для продолжения.`
        : `Ничего страшного! Запоминаем: это ${def.nameRu} (${def.semitones} полутонов). Выберите правильный интервал на кнопках ниже.`;

      const nextState: IntervalCurriculumState = {
        ...state,
        awaitingCorrective: true,
        targetKeyIds: state.activeSkill === 'intervalBuild' ? [state.targetKeyId || 'C5'] : [state.rootKeyId || 'C4', state.targetKeyId || 'C5'],
        feedbackText: correctivePrompt,
        feedbackTone: 'bad'
      };
      return { state: nextState, updatedProgress, outcome: 'dont_know' };
    }

    // In DelayedCheck: Don't Know MUST NOT trigger FSRS penalty!
    if (state.step.endsWith('DelayedCheck')) {
      const focusInterval = state.focusInterval || 'P8';
      const isBuild = state.activeSkill === 'intervalBuild';
      const recId = isBuild
        ? getIntervalBuildItemId(focusInterval)
        : getIntervalIdentifyItemId(focusInterval);

      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        contexts: appendUniqueContext(appendUniqueContext(rec.contexts, 'pending:delayedRetry'), 'pending:corrective')
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const def = INTERVAL_DEFINITIONS[focusInterval];
      const feedbackText = isBuild
        ? `Ничего страшного. Запоминаем: ${def.nameRu} от ${state.rootKeyId} — это ${state.targetKeyId} (${def.semitones} полутонов). Нажмите ${state.targetKeyId}.`
        : `Ничего страшного. Запоминаем: это ${def.nameRu} (${def.semitones} полутонов). Выберите ${def.nameRu} на кнопках ниже.`;

      const nextState: IntervalCurriculumState = {
        ...state,
        awaitingCorrective: true,
        targetKeyIds: isBuild ? [state.targetKeyId || 'C5'] : [state.rootKeyId || 'C4', state.targetKeyId || 'C5'],
        feedbackText,
        feedbackTone: 'bad'
      };
      return { state: nextState, updatedProgress, outcome: 'dont_know' };
    }

    // In Guided / Qualify / LocalMix:
    const isBuild = state.activeSkill === 'intervalBuild';
    const nextState: IntervalCurriculumState = {
      ...state,
      awaitingCorrective: true,
      targetKeyIds: [state.targetKeyId || 'C5'],
      feedbackText: isBuild
        ? `Опорная подсказка: правильный ответ — ${state.targetKeyId}. Нажмите эту клавишу.`
        : `Опорная подсказка: правильный ответ — ${state.focusInterval ? INTERVAL_DEFINITIONS[state.focusInterval].nameRu : ''}.`,
      feedbackTone: 'bad'
    };
    return { state: nextState, updatedProgress, outcome: 'dont_know' };
  }

  // 3. Interval Build: KeyPress
  if (action.type === 'keyPress') {
    if (state.activeSkill !== 'intervalBuild' && state.step !== 'intervalOrientation') {
      return { state, updatedProgress };
    }

    if (state.step === 'intervalOrientation') {
      if (action.keyId === 'C#4' || action.keyId === 'C4' || action.keyId === 'D4') {
        return {
          state: {
            ...state,
            feedbackText: 'Отлично! Шаг на соседнюю клавишу — полутон (C#4), через одну — целый тон (D4).',
            feedbackTone: 'good'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }
      return { state, updatedProgress, outcome: 'wrong_note' };
    }

    const expectedKeyId = state.targetKeyId;
    const { targetNote } = resolveIntervalTarget(state.rootKeyId || 'C4', state.focusInterval || 'P8');
    const isCorrectKey = action.keyId === expectedKeyId;
    const isCorrectPitchClass = action.note === targetNote;
    const isOctaveMismatch = !isCorrectKey && isCorrectPitchClass;
    const isBuildRootPress = state.activeSkill === 'intervalBuild' && action.keyId === state.rootKeyId;
    const rootAnchorFeedback = `${state.rootKeyId} — это уже опорная нота. Нужно найти вторую ноту интервала выше неё.`;
    const def = INTERVAL_DEFINITIONS[state.focusInterval || 'P8'];

    // Substage A: Awaiting corrective resolution
    if (state.awaitingCorrective) {
      if (!isCorrectKey) {
        return {
          state: {
            ...state,
            feedbackText: isBuildRootPress
              ? rootAnchorFeedback
              : isOctaveMismatch
              ? `Нота верна (${action.note}), но октава не та! Нужна клавиша ${expectedKeyId}.`
              : `Нажмите подсвеченную клавишу ${expectedKeyId} для завершения исправления.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
        };
      }

      // Corrective attempt successful!
      if (state.step === 'intervalTransfer') {
        let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
        const newTrials = (transRec.guidedSuccesses ?? 0) + 1;
        const newCorrect = transRec.independentUnhintedSuccesses ?? 0;
        let contexts = transRec.contexts.filter((c: string) => c !== 'pending:intervalTransferCorrective');
        contexts = appendUniqueContext(contexts, `interval:${state.focusInterval}`);
        contexts = appendUniqueContext(contexts, `skill:intervalBuild`);
        const trial = buildIntervalTransferTrial(state.transferTrialsCompleted);
        if (trial.isChromaticRoot) contexts = appendUniqueContext(contexts, 'root:chromatic');

        transRec = {
          ...transRec,
          guidedSuccesses: newTrials,
          independentUnhintedSuccesses: newCorrect,
          contexts
        };
        progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        if (isTransferGateSatisfied(transRec)) {
          let compRec = progress[INTERVAL_ITEM_IDS.COMPLETE] || createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
          compRec.state = 'retention';
          progress[INTERVAL_ITEM_IDS.COMPLETE] = compRec;
          updatedProgress.push(compRec);
          return {
            state: buildIntervalStateForStep('moduleComplete', progress, now),
            updatedProgress,
            outcome: 'correct'
          };
        }

        const nextTrialState = buildIntervalStateForStep('intervalTransfer', progress, now, newTrials);
        return {
          state: {
            ...nextTrialState,
            feedbackText: `Правильно (${expectedKeyId}). Продолжаем тренировку!`,
            feedbackTone: 'good'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      if (state.step.endsWith('DelayedCheck')) {
        const focusInterval = state.focusInterval || 'P8';
        const recId = getIntervalBuildItemId(focusInterval);
        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        // Corrective press in delayedCheck leads to intervening recall
        rec = {
          ...rec,
          contexts: appendUniqueContext(
            rec.contexts.filter((c: string) => c !== 'pending:corrective'),
            'pending:interveningRecall'
          )
        };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextStep = deriveIntervalStep(progress);
        return {
          state: {
            ...buildIntervalStateForStep(nextStep, progress, now),
            feedbackText: `Ориентир закреплён. Теперь контрастный шаг перед повторной проверкой.`,
            feedbackTone: 'info'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      if (state.step.endsWith('Guided')) {
        const focusInterval = state.focusInterval || 'P8';
        const recId = getIntervalBuildItemId(focusInterval);
        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        rec.state = 'guided';
        rec.guidedSuccesses = 1;
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextStep = deriveIntervalStep(progress);
        return {
          state: {
            ...buildIntervalStateForStep(nextStep, progress, now),
            feedbackText: `Верно! Теперь постройте ${def.nameRu} самостоятельно.`,
            feedbackTone: 'good'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      // Qualify / LocalMix corrective cleared
      const focusInterval = state.focusInterval || 'P8';
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        contexts: rec.contexts.filter((c: string) => c !== 'pending:delayedRetry' && c !== 'pending:corrective')
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Правильно! Запомнили клавишу ${expectedKeyId}. Попробуйте ещё раз.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Substage B: Intervening recall step (in DelayedCheck)
    if (state.isInterveningRecall && state.step.endsWith('DelayedCheck')) {
      if (!isCorrectKey) {
        return {
          state: {
            ...state,
            feedbackText: isBuildRootPress
              ? rootAnchorFeedback
              : isOctaveMismatch
              ? `Верная нота, но не та октава (${expectedKeyId}). Нужна клавиша ${expectedKeyId}.`
              : `Нажмите клавишу ${expectedKeyId} для завершения контрастного шага.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
        };
      }

      // Intervening recall succeeded: remove interveningRecall and corrective; keep pending:delayedRetry!
      const focusInterval = state.focusInterval || 'P8';
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        contexts: rec.contexts.filter(
          (c: string) => c !== 'pending:interveningRecall' && c !== 'pending:corrective'
        )
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextState = buildIntervalStateForStep(state.step, progress, now);
      return {
        state: {
          ...nextState,
          feedbackText: `Отлично! Контрастный шаг выполнен. Теперь повторим финальную проверку по памяти.`,
          feedbackTone: 'info'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Substage C: Normal attempt (first or retry)
    if (!isCorrectKey) {
      if (state.step === 'intervalTransfer') {
        let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
        transRec = {
          ...transRec,
          contexts: appendUniqueContext(transRec.contexts, 'pending:intervalTransferCorrective')
        };
        progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        return {
          state: {
            ...state,
            awaitingCorrective: true,
            targetKeyIds: [expectedKeyId || 'C5'],
            feedbackText: isBuildRootPress
              ? rootAnchorFeedback
              : isOctaveMismatch
              ? `Верная ступень, но не та октава! Нужна ${expectedKeyId}. Нажмите её.`
              : `Ошибка. ${def.nameRu} от ${state.rootKeyId} — это ${expectedKeyId}. Нажмите подсвеченную клавишу ${expectedKeyId}.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
        };
      }

      if (state.step.endsWith('DelayedCheck')) {
        const focusInterval = state.focusInterval || 'P8';
        const cardId = `intervalBuild:${focusInterval}`;
        const recId = getIntervalBuildItemId(focusInterval);

        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry');
        rec = {
          ...rec,
          contexts: appendUniqueContext(
            appendUniqueContext(rec.contexts, 'pending:delayedRetry'),
            'pending:corrective'
          )
        };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const card = cardsMap.get(cardId);
        if (card && isFirstAttempt) {
          const roundState: QuestionRoundState = {
            firstResponseRecorded: false,
            attempts: 0,
            hintUsed: false,
            isCompleted: false,
            isLocked: false
          };
          const ctx = createTrialContext({
            mode: 'delayedCheck',
            sessionId: 'interval-curriculum',
            cardId,
            itemId: recId,
            hintLevel: HINT_LEVEL.NONE,
            firstAttempt: true,
            inputMethod: 'screen'
          });
          attemptResult = submitQuestionAttempt({
            state: roundState,
            card,
            kind: 'scheduled',
            isCorrect: false,
            answer: (action.note as NoteName) ?? null,
            answerKeyId: action.keyId,
            responseMs: 1200,
            reviewedAt: now,
            trialContext: ctx,
            sessionId: 'interval-curriculum',
            settings: toFsrsSettings(userSettings)
          });
          mutatedCard = attemptResult.cardMutated ? { ...card } : undefined;
        }

        return {
          state: {
            ...state,
            awaitingCorrective: true,
            targetKeyIds: [expectedKeyId || 'C5'],
            feedbackText: isBuildRootPress
              ? rootAnchorFeedback
              : isOctaveMismatch
              ? `Нота верная (${action.note}), но октава не та! Нужна ${expectedKeyId}. Повторим ориентир.`
              : `Неверная клавиша. ${def.nameRu} от ${state.rootKeyId} — это ${expectedKeyId} (${def.semitones} полутонов). Нажмите её.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          mutatedCard,
          attemptResult,
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
        };
      }

      if (state.step.endsWith('Guided')) {
        return {
          state: {
            ...state,
            awaitingCorrective: true,
            targetKeyIds: [expectedKeyId || 'C5'],
            feedbackText: isBuildRootPress
              ? rootAnchorFeedback
              : isOctaveMismatch
              ? `Нота верная (${action.note}), но октава не та! Нужна ${expectedKeyId}.`
              : `Подсказка: отсчитайте ${def.semitones} полутонов от ${state.rootKeyId}. Нужна клавиша ${expectedKeyId}.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
        };
      }

      // Qualify / Mix error
      return {
        state: {
          ...state,
          awaitingCorrective: true,
          targetKeyIds: [expectedKeyId || 'C5'],
          feedbackText: isBuildRootPress
            ? rootAnchorFeedback
            : isOctaveMismatch
            ? `Верная нота (${action.note}), но октава не та. Нужна клавиша ${expectedKeyId}.`
            : `Неверно. Правильная клавиша — ${expectedKeyId}. Сыграйте её.`,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note'
      };
    }

    // First attempt correct!
    const focusInterval = state.focusInterval || 'P8';

    if (state.step.endsWith('Model')) {
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = recordModelCompleted(rec, now, `model:${recId}`);
      rec.state = 'introduced';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Отлично! Вы сыграли ${def.nameRu} (${expectedKeyId}). Теперь постройте интервал с подсказкой.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('Guided')) {
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec.state = 'guided';
      rec.guidedSuccesses = 1;
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Верно! Теперь постройте ${def.nameRu} самостоятельно без подсказок.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('Qualify')) {
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec.state = 'qualifying';
      rec.independentUnhintedSuccesses = 1;
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Верно! Теперь закрепим ${def.nameRu} на разных клавишах.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('LocalMix')) {
      const successCount = state.localMixSuccessCount + 1;
      if (successCount >= state.localMixTarget) {
        const recId = getIntervalBuildItemId(focusInterval);
        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        rec.state = 'mixReady';
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextStep = deriveIntervalStep(progress);
        return {
          state: {
            ...buildIntervalStateForStep(nextStep, progress, now),
            feedbackText: `Превосходно! Все практические примеры выполнены. Финальная проверка по памяти.`,
            feedbackTone: 'good'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      // Next local mix trial
      const nextMixState = buildIntervalStateForStep(state.step, progress, now, successCount);
      return {
        state: {
          ...nextMixState,
          localMixSuccessCount: successCount,
          feedbackText: `Верно! (${successCount}/${state.localMixTarget}). Ещё пример.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('DelayedCheck')) {
      const cardId = `intervalBuild:${focusInterval}`;
      const recId = getIntervalBuildItemId(focusInterval);
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry');

      rec = {
        ...rec,
        contexts: rec.contexts.filter(
          (c: string) => c !== 'pending:delayedRetry' && c !== 'pending:corrective' && c !== 'pending:interveningRecall'
        )
      };
      rec = markFsrsActivated(rec, now);
      rec.state = 'retention';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const card = cardsMap.get(cardId);
      if (card && isFirstAttempt) {
        const roundState: QuestionRoundState = {
          firstResponseRecorded: false,
          attempts: 0,
          hintUsed: false,
          isCompleted: false,
          isLocked: false
        };
        const ctx = createTrialContext({
          mode: 'delayedCheck',
          sessionId: 'interval-curriculum',
          cardId,
          itemId: recId,
          hintLevel: HINT_LEVEL.NONE,
          firstAttempt: true,
          inputMethod: 'screen'
        });
        attemptResult = submitQuestionAttempt({
          state: roundState,
          card,
          kind: 'scheduled',
          isCorrect: true,
          answer: (action.note as NoteName) ?? null,
          answerKeyId: action.keyId,
          responseMs: 1200,
          reviewedAt: now,
          trialContext: ctx,
          sessionId: 'interval-curriculum',
          settings: toFsrsSettings(userSettings)
        });
        mutatedCard = attemptResult.cardMutated ? { ...card } : undefined;
      }

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Великолепно! ${def.nameRu} закреплена и добавлена в расписание повторений!`,
          feedbackTone: 'good'
        },
        updatedProgress,
        mutatedCard,
        attemptResult,
        outcome: 'correct'
      };
    }

    if (state.step === 'intervalTransfer') {
      let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
      const newTrials = (transRec.guidedSuccesses ?? 0) + 1;
      const newCorrect = (transRec.independentUnhintedSuccesses ?? 0) + 1;
      let contexts = transRec.contexts ?? [];
      contexts = appendUniqueContext(contexts, `interval:${state.focusInterval}`);
      contexts = appendUniqueContext(contexts, `skill:intervalBuild`);
      const trial = buildIntervalTransferTrial(state.transferTrialsCompleted);
      if (trial.isChromaticRoot) contexts = appendUniqueContext(contexts, 'root:chromatic');

      transRec = {
        ...transRec,
        guidedSuccesses: newTrials,
        independentUnhintedSuccesses: newCorrect,
        contexts
      };
      progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      if (isTransferGateSatisfied(transRec)) {
        let compRec = progress[INTERVAL_ITEM_IDS.COMPLETE] || createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
        compRec.state = 'retention';
        progress[INTERVAL_ITEM_IDS.COMPLETE] = compRec;
        updatedProgress.push(compRec);
        return {
          state: buildIntervalStateForStep('moduleComplete', progress, now),
          updatedProgress,
          outcome: 'correct'
        };
      }

      const nextTrialState = buildIntervalStateForStep('intervalTransfer', progress, now, newTrials);
      return {
        state: {
          ...nextTrialState,
          feedbackText: `Верно! (${newTrials}/${INTERVAL_TRANSFER_MIN_TRIALS}).`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }
  }

  // 4. Interval Identify: SelectAnswer
  if (action.type === 'selectAnswer') {
    if (state.activeSkill !== 'intervalIdentify') {
      return { state, updatedProgress };
    }

    const expectedInterval = state.focusInterval;
    const isCorrect = action.intervalId === expectedInterval;
    const def = INTERVAL_DEFINITIONS[expectedInterval || 'P8'];

    // Substage A: Corrective
    if (state.awaitingCorrective) {
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: `Неверно. Правильный ответ — ${def.nameRu}. Выберите правильный вариант на кнопках.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: 'wrong_interval'
        };
      }

      // Corrective cleared
      if (state.step === 'intervalTransfer') {
        let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
        const newTrials = (transRec.guidedSuccesses ?? 0) + 1;
        const newCorrect = transRec.independentUnhintedSuccesses ?? 0;
        let contexts = transRec.contexts.filter((c: string) => c !== 'pending:intervalTransferCorrective');
        contexts = appendUniqueContext(contexts, `interval:${state.focusInterval}`);
        contexts = appendUniqueContext(contexts, `skill:intervalIdentify`);
        const trial = buildIntervalTransferTrial(state.transferTrialsCompleted);
        if (trial.isChromaticRoot) contexts = appendUniqueContext(contexts, 'root:chromatic');

        transRec = {
          ...transRec,
          guidedSuccesses: newTrials,
          independentUnhintedSuccesses: newCorrect,
          contexts
        };
        progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        if (isTransferGateSatisfied(transRec)) {
          let compRec = progress[INTERVAL_ITEM_IDS.COMPLETE] || createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
          compRec.state = 'retention';
          progress[INTERVAL_ITEM_IDS.COMPLETE] = compRec;
          updatedProgress.push(compRec);
          return {
            state: buildIntervalStateForStep('moduleComplete', progress, now),
            updatedProgress,
            outcome: 'correct'
          };
        }

        const nextTrialState = buildIntervalStateForStep('intervalTransfer', progress, now, newTrials);
        return {
          state: {
            ...nextTrialState,
            feedbackText: `Верно (${def.nameRu}). Продолжаем!`,
            feedbackTone: 'good'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      if (state.step.endsWith('DelayedCheck')) {
        const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        // Corrective press in delayedCheck leads to intervening recall
        rec = {
          ...rec,
          contexts: appendUniqueContext(
            rec.contexts.filter((c: string) => c !== 'pending:corrective'),
            'pending:interveningRecall'
          )
        };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const nextStep = deriveIntervalStep(progress);
        return {
          state: {
            ...buildIntervalStateForStep(nextStep, progress, now),
            feedbackText: `Ориентир закреплён. Теперь контрастный шаг перед повторной проверкой.`,
            feedbackTone: 'info'
          },
          updatedProgress,
          outcome: 'correct'
        };
      }

      // Qualify corrective cleared
      const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        contexts: rec.contexts.filter((c: string) => c !== 'pending:delayedRetry' && c !== 'pending:corrective')
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Правильно! Запомнили интервал ${def.nameRu}.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Substage B: Intervening recall step (in DelayedCheck)
    if (state.isInterveningRecall && state.step.endsWith('DelayedCheck')) {
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: `Неверно. Выберите ${def.nameRu} для завершения контрастного шага.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: 'wrong_interval'
        };
      }

      // Intervening recall succeeded
      const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = {
        ...rec,
        contexts: rec.contexts.filter(
          (c: string) => c !== 'pending:interveningRecall' && c !== 'pending:corrective'
        )
      };
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextState = buildIntervalStateForStep(state.step, progress, now);
      return {
        state: {
          ...nextState,
          feedbackText: `Отлично! Контрастный шаг выполнен. Теперь повторим финальную проверку по памяти.`,
          feedbackTone: 'info'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    // Substage C: Normal attempt
    if (!isCorrect) {
      if (state.step === 'intervalTransfer') {
        let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
        transRec = {
          ...transRec,
          contexts: appendUniqueContext(transRec.contexts, 'pending:intervalTransferCorrective')
        };
        progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
        updatedProgress.push(transRec);

        return {
          state: {
            ...state,
            awaitingCorrective: true,
            feedbackText: `Ошибка. Это ${def.nameRu} (${def.semitones} полутонов). Выберите правильный интервал на кнопках ниже.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          outcome: 'wrong_interval'
        };
      }

      if (state.step.endsWith('DelayedCheck')) {
        const cardId = `intervalIdentify:${expectedInterval}`;
        const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');

        let rec = progress[recId] || createInitialLearningProgress(recId, now);
        const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry');
        rec = {
          ...rec,
          contexts: appendUniqueContext(
            appendUniqueContext(rec.contexts, 'pending:delayedRetry'),
            'pending:corrective'
          )
        };
        progress[recId] = rec;
        updatedProgress.push(rec);

        const card = cardsMap.get(cardId);
        if (card && isFirstAttempt) {
          const roundState: QuestionRoundState = {
            firstResponseRecorded: false,
            attempts: 0,
            hintUsed: false,
            isCompleted: false,
            isLocked: false
          };
          const ctx = createTrialContext({
            mode: 'delayedCheck',
            sessionId: 'interval-curriculum',
            cardId,
            itemId: recId,
            hintLevel: HINT_LEVEL.NONE,
            firstAttempt: true,
            inputMethod: 'answerButton'
          });
          attemptResult = submitQuestionAttempt({
            state: roundState,
            card,
            kind: 'scheduled',
            isCorrect: false,
            answer: action.intervalId,
            answerKeyId: null,
            responseMs: 1200,
            reviewedAt: now,
            trialContext: ctx,
            sessionId: 'interval-curriculum',
            settings: toFsrsSettings(userSettings)
          });
          mutatedCard = attemptResult.cardMutated ? { ...card } : undefined;
        }

        return {
          state: {
            ...state,
            awaitingCorrective: true,
            feedbackText: `Неверно. Правильный ответ: ${def.nameRu} (${def.semitones} полутонов). Выберите ${def.nameRu} на кнопках ниже.`,
            feedbackTone: 'bad'
          },
          updatedProgress,
          mutatedCard,
          attemptResult,
          outcome: 'wrong_interval'
        };
      }

      return {
        state: {
          ...state,
          awaitingCorrective: true,
          feedbackText: `Неверно. Правильный ответ — ${def.nameRu} (${def.semitones} полутонов). Выберите ${def.nameRu}.`,
          feedbackTone: 'bad'
        },
        updatedProgress,
        outcome: 'wrong_interval'
      };
    }

    // Correct Identify attempt
    if (state.step.endsWith('Model')) {
      const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec = recordModelCompleted(rec, now, `model:${recId}`);
      rec.state = 'guided';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Отлично! Вы определили ${def.nameRu}.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('Qualify')) {
      const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      rec.state = 'qualifying';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Верно! Переходим к проверке по памяти.`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }

    if (state.step.endsWith('DelayedCheck')) {
      const cardId = `intervalIdentify:${expectedInterval}`;
      const recId = getIntervalIdentifyItemId(expectedInterval || 'P8');
      let rec = progress[recId] || createInitialLearningProgress(recId, now);
      const isFirstAttempt = !rec.contexts.includes('pending:delayedRetry');

      rec = {
        ...rec,
        contexts: rec.contexts.filter(
          (c: string) => c !== 'pending:delayedRetry' && c !== 'pending:corrective' && c !== 'pending:interveningRecall'
        )
      };
      rec = markFsrsActivated(rec, now);
      rec.state = 'retention';
      progress[recId] = rec;
      updatedProgress.push(rec);

      const card = cardsMap.get(cardId);
      if (card && isFirstAttempt) {
        const roundState: QuestionRoundState = {
          firstResponseRecorded: false,
          attempts: 0,
          hintUsed: false,
          isCompleted: false,
          isLocked: false
        };
        const ctx = createTrialContext({
          mode: 'delayedCheck',
          sessionId: 'interval-curriculum',
          cardId,
          itemId: recId,
          hintLevel: HINT_LEVEL.NONE,
          firstAttempt: true,
          inputMethod: 'answerButton'
        });
        attemptResult = submitQuestionAttempt({
          state: roundState,
          card,
          kind: 'scheduled',
          isCorrect: true,
          answer: action.intervalId,
          answerKeyId: null,
          responseMs: 1200,
          reviewedAt: now,
          trialContext: ctx,
          sessionId: 'interval-curriculum',
          settings: toFsrsSettings(userSettings)
        });
        mutatedCard = attemptResult.cardMutated ? { ...card } : undefined;
      }

      const nextStep = deriveIntervalStep(progress);
      return {
        state: {
          ...buildIntervalStateForStep(nextStep, progress, now),
          feedbackText: `Превосходно! Навык распознавания ${def.nameRu} закреплён!`,
          feedbackTone: 'good'
        },
        updatedProgress,
        mutatedCard,
        attemptResult,
        outcome: 'correct'
      };
    }

    if (state.step === 'intervalTransfer') {
      let transRec = progress[INTERVAL_ITEM_IDS.TRANSFER] || createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER, now);
      const newTrials = (transRec.guidedSuccesses ?? 0) + 1;
      const newCorrect = (transRec.independentUnhintedSuccesses ?? 0) + 1;
      let contexts = transRec.contexts ?? [];
      contexts = appendUniqueContext(contexts, `interval:${state.focusInterval}`);
      contexts = appendUniqueContext(contexts, `skill:intervalIdentify`);
      const trial = buildIntervalTransferTrial(state.transferTrialsCompleted);
      if (trial.isChromaticRoot) contexts = appendUniqueContext(contexts, 'root:chromatic');

      transRec = {
        ...transRec,
        guidedSuccesses: newTrials,
        independentUnhintedSuccesses: newCorrect,
        contexts
      };
      progress[INTERVAL_ITEM_IDS.TRANSFER] = transRec;
      updatedProgress.push(transRec);

      if (isTransferGateSatisfied(transRec)) {
        let compRec = progress[INTERVAL_ITEM_IDS.COMPLETE] || createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
        compRec.state = 'retention';
        progress[INTERVAL_ITEM_IDS.COMPLETE] = compRec;
        updatedProgress.push(compRec);
        return {
          state: buildIntervalStateForStep('moduleComplete', progress, now),
          updatedProgress,
          outcome: 'correct'
        };
      }

      const nextTrialState = buildIntervalStateForStep('intervalTransfer', progress, now, newTrials);
      return {
        state: {
          ...nextTrialState,
          feedbackText: `Верно (${def.nameRu})! (${newTrials}/${INTERVAL_TRANSFER_MIN_TRIALS}).`,
          feedbackTone: 'good'
        },
        updatedProgress,
        outcome: 'correct'
      };
    }
  }

  // 5. Reset module
  if (action.type === 'resetModule') {
    const nextState = buildIntervalStateForStep('intervalOrientation', progress, now);
    return { state: nextState, updatedProgress, outcome: 'advance' };
  }

  return { state, updatedProgress };
}

/**
 * Resolves keyboard keydown actions (Enter, digits 1-4) for the interval stage.
 */
export function resolveIntervalKeydownAction(
  state: IntervalCurriculumState,
  key: string,
  code: string
): { type: 'advanceStage' } | { type: 'selectAnswer'; intervalId: IntervalId } | { type: 'dontKnow' } | null {
  if (key === 'Enter') {
    if (
      state.step === 'intervalOrientation' ||
      state.step === 'contrastM3m3' ||
      state.step.endsWith('Model') ||
      state.step === 'moduleComplete'
    ) {
      return { type: 'advanceStage' };
    }
    return null;
  }

  // Answer shortcuts 1, 2, 3, 4 for intervalIdentify
  if (state.activeSkill === 'intervalIdentify') {
    if (key === '1' || code === 'Digit1') return { type: 'selectAnswer', intervalId: 'P8' };
    if (key === '2' || code === 'Digit2') return { type: 'selectAnswer', intervalId: 'P5' };
    if (key === '3' || code === 'Digit3') return { type: 'selectAnswer', intervalId: 'M3' };
    if (key === '4' || code === 'Digit4') return { type: 'selectAnswer', intervalId: 'm3' };
  }

  return null;
}

export {
  isIntervalModuleAvailable as isIntervalAvailable,
  isIntervalModuleComplete as isIntervalComplete,
  resolveIntervalKeydownAction as resolveIntervalKeyAction
};
