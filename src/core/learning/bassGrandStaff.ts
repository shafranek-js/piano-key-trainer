import { DISPLAY_NAMES, BASS_STAFF_HINTS } from '../fsrs/constants';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import type {
  Card,
  NoteName,
  ReviewLogEvent,
  UserSettings
} from '../fsrs/types';
import {
  appendUniqueContext,
  createInitialLearningProgress,
  markFsrsActivated,
  markMixReady,
  recordIndependentAttempt,
  recordModelCompleted
} from './progress';
import { createTrialContext } from './trialPolicy';
import {
  HINT_LEVEL,
  type LearningProgressRecord,
  type TrialContext
} from './types';
import {
  isCoreCurriculumComplete
} from './dailyPractice';
import type { ProgressCollectionInput } from './curriculumFlow';

export type BassNote = 'F' | 'C' | 'E' | 'G' | 'D' | 'A' | 'B';

export const BASS_NOTE_ACQUISITION_ORDER: readonly BassNote[] = [
  'F',
  'C',
  'E',
  'G',
  'D',
  'A',
  'B'
] as const;

export const BASS_GRAND_ITEM_IDS = {
  ORIENTATION: 'advanced-bass:orientation',
  NOTE_F: 'advanced-bass-note:F',
  NOTE_C: 'advanced-bass-note:C',
  NOTE_E: 'advanced-bass-note:E',
  NOTE_G: 'advanced-bass-note:G',
  NOTE_D: 'advanced-bass-note:D',
  NOTE_A: 'advanced-bass-note:A',
  NOTE_B: 'advanced-bass-note:B',
  FINAL_MIX: 'advanced-bass:final-mix',
  GRAND_ORIENTATION: 'advanced-grand:orientation',
  GRAND_TRANSFER: 'advanced-grand:transfer',
  COMPLETE: 'advanced-grand:complete'
} as const;

export function getBassNoteCurriculumItemId(note: BassNote): string {
  return `advanced-bass-note:${note}`;
}

export type BassGrandStep =
  | 'bassOrientation'
  | 'f3Model'
  | 'f3Qualify'
  | 'f3LocalMix'
  | 'f3DelayedCheck'
  | 'c3Model'
  | 'c3Qualify'
  | 'c3LocalMix'
  | 'c3DelayedCheck'
  | 'e3Model'
  | 'e3Qualify'
  | 'e3LocalMix'
  | 'e3DelayedCheck'
  | 'g3Model'
  | 'g3Qualify'
  | 'g3LocalMix'
  | 'g3DelayedCheck'
  | 'd3Model'
  | 'd3Qualify'
  | 'd3LocalMix'
  | 'd3DelayedCheck'
  | 'a3Model'
  | 'a3Qualify'
  | 'a3LocalMix'
  | 'a3DelayedCheck'
  | 'b3Model'
  | 'b3Qualify'
  | 'b3LocalMix'
  | 'b3DelayedCheck'
  | 'bassFinalMix'
  | 'grandOrientation'
  | 'grandTransfer'
  | 'moduleComplete';

export const BASS_GRAND_STEPS: readonly BassGrandStep[] = [
  'bassOrientation',
  'f3Model',
  'f3Qualify',
  'f3LocalMix',
  'f3DelayedCheck',
  'c3Model',
  'c3Qualify',
  'c3LocalMix',
  'c3DelayedCheck',
  'e3Model',
  'e3Qualify',
  'e3LocalMix',
  'e3DelayedCheck',
  'g3Model',
  'g3Qualify',
  'g3LocalMix',
  'g3DelayedCheck',
  'd3Model',
  'd3Qualify',
  'd3LocalMix',
  'd3DelayedCheck',
  'a3Model',
  'a3Qualify',
  'a3LocalMix',
  'a3DelayedCheck',
  'b3Model',
  'b3Qualify',
  'b3LocalMix',
  'b3DelayedCheck',
  'bassFinalMix',
  'grandOrientation',
  'grandTransfer',
  'moduleComplete'
] as const;

export const GRAND_STAFF_TRANSFER_TRIALS = 12;
export const GRAND_STAFF_REQUIRED_ACCURACY = 0.8;

function normalizeProgressMap(
  input?: ProgressCollectionInput
): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of input) {
      if (item && item.id) map.set(item.id, item);
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [k, v] of Object.entries(input as Record<string, LearningProgressRecord>)) {
    if (v && v.id) map.set(k, v);
  }
  return map;
}

/**
 * Checks whether the advanced module "Bass Clef & Grand Staff" is available to start.
 * Available only after all 6 core phases are complete.
 */
export function isBassGrandModuleAvailable(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
}): boolean {
  return isCoreCurriculumComplete(input);
}

/**
 * Checks whether the advanced module is fully completed.
 */
export function isBassGrandModuleComplete(
  learningProgress?: ProgressCollectionInput
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const comp =
    map.get(BASS_GRAND_ITEM_IDS.COMPLETE) ||
    map.get('advanced-bass-module:complete');
  const transfer = map.get(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
  return comp?.state === 'retention' || transfer?.state === 'retention';
}

/**
 * Returns user-facing status for the advanced module:
 * - 'not_started'
 * - 'in_progress'
 * - 'completed'
 */
export function getBassGrandModuleStatus(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
}): 'not_started' | 'in_progress' | 'completed' {
  if (isBassGrandModuleComplete(input.learningProgress)) {
    return 'completed';
  }
  const map = normalizeProgressMap(input.learningProgress);
  const hasAnyProgress =
    map.has(BASS_GRAND_ITEM_IDS.ORIENTATION) ||
    BASS_NOTE_ACQUISITION_ORDER.some(n => map.has(getBassNoteCurriculumItemId(n))) ||
    map.has(BASS_GRAND_ITEM_IDS.FINAL_MIX) ||
    map.has(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION) ||
    map.has(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);

  return hasAnyProgress ? 'in_progress' : 'not_started';
}

export interface BassGrandStepDescription {
  step: BassGrandStep;
  kind: 'orientation' | 'bassNote' | 'bassFinalMix' | 'grandOrientation' | 'grandTransfer' | 'complete';
  subStage?: 'model' | 'qualify' | 'localMix' | 'delayedCheck';
  focusBassNote?: BassNote;
  targetKeyId?: string;
  clef: 'bass' | 'grand';
  title: string;
  subtitle: string;
  hintText?: string;
}

export function describeBassGrandStep(step: BassGrandStep): BassGrandStepDescription {
  if (step === 'bassOrientation') {
    return {
      step,
      kind: 'orientation',
      clef: 'bass',
      targetKeyId: 'F3',
      title: 'Басовый ключ',
      subtitle: 'Ориентир — линия F между двумя точками ключа',
      hintText: 'Правая рука часто читает верхний нотоносец в скрипичном ключе. Нижний нотоносец обычно записывают в басовом ключе (ключе F).'
    };
  }

  if (step === 'bassFinalMix') {
    return {
      step,
      kind: 'bassFinalMix',
      clef: 'bass',
      title: 'Басовый нотоносец: закрепление всех нот',
      subtitle: 'Чтение C3–B3 без подсказок',
      hintText: 'Определите ноту на басовом стане и нажмите точную клавишу в малой октаве (C3–B3).'
    };
  }

  if (step === 'grandOrientation') {
    return {
      step,
      kind: 'grandOrientation',
      clef: 'grand',
      targetKeyId: 'C4',
      title: 'Большая система (Grand Staff)',
      subtitle: 'Скрипичный и басовый станы, соединённые нотой Middle C (C4)',
      hintText: 'Теперь на экране одновременно отображаются верхний и нижний нотоносцы. Определяйте не только ступень, но и ключ.'
    };
  }

  if (step === 'grandTransfer') {
    return {
      step,
      kind: 'grandTransfer',
      clef: 'grand',
      title: 'Большая система: перенос навыка',
      subtitle: 'Быстрое переключение между скрипичным и басовым станами',
      hintText: 'Смотрите, на каком стане находится нота: на верхнем (C4–B4) или на нижнем (C3–B3).'
    };
  }

  if (step === 'moduleComplete') {
    return {
      step,
      kind: 'complete',
      clef: 'grand',
      title: 'Модуль завершён',
      subtitle: 'Басовый ключ и большая система успешно освоены',
      hintText: 'Теперь вы читаете ноты в скрипичном и басовом ключах и можете переключаться между ними в ежедневных тренировках.'
    };
  }

  // Per-note steps
  const noteMatch = /^([a-g])3(Model|Qualify|LocalMix|DelayedCheck)$/.exec(step);
  if (noteMatch) {
    const note = noteMatch[1].toUpperCase() as BassNote;
    const subStage = (noteMatch[2].charAt(0).toLowerCase() + noteMatch[2].slice(1)) as
      | 'model'
      | 'qualify'
      | 'localMix'
      | 'delayedCheck';

    const targetKeyId = `${note}3`;
    const hintText = BASS_STAFF_HINTS[note] || `Нота ${DISPLAY_NAMES[note]} в басовом ключе (${note}3).`;

    let subTitle = '';
    switch (subStage) {
      case 'model':
        subTitle = `Знакомство с нотой ${DISPLAY_NAMES[note]} (${note}3)`;
        break;
      case 'qualify':
        subTitle = `Нажмите ${DISPLAY_NAMES[note]} на клавиатуре без подсказок`;
        break;
      case 'localMix':
        subTitle = `Различение ${DISPLAY_NAMES[note]} и изученных басовых нот`;
        break;
      case 'delayedCheck':
        subTitle = `Проверка по памяти: ${DISPLAY_NAMES[note]} (${note}3)`;
        break;
    }

    return {
      step,
      kind: 'bassNote',
      subStage,
      focusBassNote: note,
      targetKeyId,
      clef: 'bass',
      title: `Басовый ключ: ${DISPLAY_NAMES[note]} (${note}3)`,
      subtitle: subTitle,
      hintText
    };
  }

  return {
    step,
    kind: 'bassNote',
    clef: 'bass',
    title: 'Басовый ключ',
    subtitle: ''
  };
}

export interface GrandStaffTransferTrial {
  keyId: string;
  clef: 'treble' | 'bass';
  note: NoteName;
  octave: number;
}

export interface BassGrandCurriculumState {
  step: BassGrandStep;
  progress: Record<string, LearningProgressRecord>;
  targetKeyId: string | null;
  targetKeyIds: string[];
  structuralGuideKeyIds: string[];
  modelLabelKeyIds: string[];
  clef: 'bass' | 'grand';
  answerPool: BassNote[];
  streak: number;
  requiredStreak: number;
  feedbackText: string | null;
  feedbackTone: 'good' | 'bad' | 'neutral' | null;
  grandTransferTrialsCompleted: number;
  grandTransferCorrectFirstAttempts: number;
  grandTransferRecentClefs: ('treble' | 'bass')[];
  awaitingCorrective: boolean;
  awaitingRemediationPress: boolean;
  isInterveningRecall: boolean;
  remediationSourceNote: BassNote | null;
  sessionId: string;
  now: number;
}

export interface BassGrandAction {
  type: 'keyPress' | 'dontKnow' | 'advanceStage' | 'completeModule';
  keyId?: string;
  note?: NoteName;
  timestamp?: number;
}

export interface BassGrandActionResult {
  state: BassGrandCurriculumState;
  outcome: 'advanced' | 'correct' | 'wrong_note' | 'wrong_octave' | 'remediation_started';
  updatedProgress: LearningProgressRecord[];
  trialContext: TrialContext;
  fsrsDelayedCheck: {
    card: Card;
    grade: 1 | 2 | 3 | 4;
    firstAttempt: boolean;
  } | null;
  mutatedCard?: Card;
  attemptResult?: SubmitQuestionAttemptResult;
}

export function determineNextBassGrandStep(
  progress: Record<string, LearningProgressRecord>
): BassGrandStep {
  if (isBassGrandModuleComplete(progress)) return 'moduleComplete';

  const grandOri = progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION];
  if (grandOri && grandOri.state === 'retention') {
    return 'grandTransfer';
  }

  const finalMix = progress[BASS_GRAND_ITEM_IDS.FINAL_MIX];
  if (finalMix && finalMix.state === 'retention') {
    return 'grandOrientation';
  }

  const ori = progress[BASS_GRAND_ITEM_IDS.ORIENTATION];
  if (!ori || ori.state !== 'retention') {
    return 'bassOrientation';
  }

  for (let i = 0; i < BASS_NOTE_ACQUISITION_ORDER.length; i++) {
    const note = BASS_NOTE_ACQUISITION_ORDER[i];
    const rec = progress[getBassNoteCurriculumItemId(note)];

    if (!rec || rec.state === 'unseen' || !rec.modelCompleted) {
      return `${note.toLowerCase()}3Model` as BassGrandStep;
    }
    if (rec.state === 'introduced' || rec.state === 'qualifying') {
      if (rec.independentUnhintedSuccesses < 1) {
        return `${note.toLowerCase()}3Qualify` as BassGrandStep;
      }
      return `${note.toLowerCase()}3LocalMix` as BassGrandStep;
    }
    if (rec.state === 'mixReady') {
      return `${note.toLowerCase()}3DelayedCheck` as BassGrandStep;
    }
    if (rec.contexts.includes('pending:delayedRetry')) {
      return `${note.toLowerCase()}3DelayedCheck` as BassGrandStep;
    }
  }

  return 'bassFinalMix';
}

function getIntroducedBassNotes(
  progress: Record<string, LearningProgressRecord>,
  upToNote?: BassNote
): BassNote[] {
  const result: BassNote[] = [];
  for (const n of BASS_NOTE_ACQUISITION_ORDER) {
    const rec = progress[getBassNoteCurriculumItemId(n)];
    if (rec && rec.state !== 'unseen') {
      result.push(n);
    }
    if (upToNote && n === upToNote) {
      if (!result.includes(n)) result.push(n);
      break;
    }
  }
  return result.length > 0 ? result : ['F'];
}

export function buildBassGrandStateForStep(
  step: BassGrandStep,
  progress: Record<string, LearningProgressRecord>,
  existingState?: Partial<BassGrandCurriculumState>,
  now = Date.now()
): BassGrandCurriculumState {
  const desc = describeBassGrandStep(step);
  const sessionId = existingState?.sessionId || `bass-session-${now}`;

  if (desc.kind === 'orientation') {
    return {
      step,
      progress,
      targetKeyId: 'F3',
      targetKeyIds: ['F3'],
      structuralGuideKeyIds: ['F3'],
      modelLabelKeyIds: ['F3'],
      clef: 'bass',
      answerPool: ['F'],
      streak: 0,
      requiredStreak: 1,
      feedbackText: 'Нажмите клавишу F в малой октаве (F3) для перехода.',
      feedbackTone: 'neutral',
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.kind === 'grandOrientation') {
    return {
      step,
      progress,
      targetKeyId: 'C4',
      targetKeyIds: ['C4'],
      structuralGuideKeyIds: ['C4'],
      modelLabelKeyIds: ['C4'],
      clef: 'grand',
      answerPool: ['C'],
      streak: 0,
      requiredStreak: 1,
      feedbackText: 'Middle C (C4) связывает скрипичный и басовый нотоносцы. Нажмите C4 для продолжения.',
      feedbackTone: 'neutral',
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.kind === 'complete') {
    return {
      step,
      progress,
      targetKeyId: null,
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      clef: 'grand',
      answerPool: [],
      streak: 0,
      requiredStreak: 0,
      feedbackText: 'Поздравляем! Модуль освоения басового ключа и большой системы завершён.',
      feedbackTone: 'good',
      grandTransferTrialsCompleted: GRAND_STAFF_TRANSFER_TRIALS,
      grandTransferCorrectFirstAttempts: existingState?.grandTransferCorrectFirstAttempts ?? GRAND_STAFF_TRANSFER_TRIALS,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.kind === 'grandTransfer') {
    const transRec = progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER];
    const persistedTrials = transRec?.guidedSuccesses ?? 0;
    const persistedCorrect = transRec?.independentUnhintedSuccesses ?? 0;
    const persistedBass = Boolean(transRec?.contexts?.includes('clef:bass'));
    const persistedTreble = Boolean(transRec?.contexts?.includes('clef:treble'));
    const isAwaitingCorrective = Boolean(
      transRec?.contexts?.includes('pending:grandCorrective') ||
      existingState?.awaitingCorrective
    );

    const trialsCompleted = existingState?.grandTransferTrialsCompleted ?? persistedTrials;
    const correctFirstAttempts = existingState?.grandTransferCorrectFirstAttempts ?? persistedCorrect;
    const recentClefs = existingState?.grandTransferRecentClefs ?? [
      ...(persistedBass ? ['bass' as const] : []),
      ...(persistedTreble ? ['treble' as const] : [])
    ];

    // Pick next grand staff trial
    const trebleCount = recentClefs.filter(c => c === 'treble').length;
    const bassCount = recentClefs.filter(c => c === 'bass').length;

    // Prefer clef with fewer trials to ensure balanced representation
    let pickClef: 'treble' | 'bass';
    if (trebleCount > bassCount + 1) {
      pickClef = 'bass';
    } else if (bassCount > trebleCount + 1) {
      pickClef = 'treble';
    } else {
      pickClef = trialsCompleted % 2 === 0 ? 'bass' : 'treble';
    }

    const naturalNotes: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const noteIdx = (trialsCompleted * 3 + 1) % naturalNotes.length;
    const note = naturalNotes[noteIdx];
    const octave = pickClef === 'bass' ? 3 : 4;
    const targetKeyId = `${note}${octave}`;

    return {
      step,
      progress,
      targetKeyId,
      targetKeyIds: isAwaitingCorrective ? [targetKeyId] : [],
      structuralGuideKeyIds: isAwaitingCorrective ? [targetKeyId] : [],
      modelLabelKeyIds: [],
      clef: 'grand',
      answerPool: BASS_NOTE_ACQUISITION_ORDER as unknown as BassNote[],
      streak: existingState?.streak ?? 0,
      requiredStreak: GRAND_STAFF_TRANSFER_TRIALS,
      feedbackText: isAwaitingCorrective
        ? `Нота: ${targetKeyId}. Нажмите подсвеченную клавишу.`
        : 'Определите ноту и ключ (скрипичный = 1-я октава, басовый = малая октава) и нажмите клавишу.',
      feedbackTone: isAwaitingCorrective ? 'bad' : null,
      grandTransferTrialsCompleted: trialsCompleted,
      grandTransferCorrectFirstAttempts: correctFirstAttempts,
      grandTransferRecentClefs: recentClefs,
      awaitingCorrective: isAwaitingCorrective,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.kind === 'bassFinalMix') {
    const naturalNotes: BassNote[] = ['F', 'C', 'E', 'G', 'D', 'A', 'B'];
    const noteIdx = ((existingState?.streak ?? 0) * 3 + 2) % naturalNotes.length;
    const note = naturalNotes[noteIdx];
    const targetKeyId = `${note}3`;

    return {
      step,
      progress,
      targetKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      clef: 'bass',
      answerPool: naturalNotes,
      streak: existingState?.streak ?? 0,
      requiredStreak: 4,
      feedbackText: 'Найдите ноту на басовом нотоносце (малая октава: C3–B3).',
      feedbackTone: null,
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  // Bass note subStage
  const note = desc.focusBassNote || 'F';
  const targetKeyId = `${note}3`;

  if (desc.subStage === 'model') {
    return {
      step,
      progress,
      targetKeyId,
      targetKeyIds: [targetKeyId],
      structuralGuideKeyIds: [targetKeyId],
      modelLabelKeyIds: [targetKeyId],
      clef: 'bass',
      answerPool: [note],
      streak: 0,
      requiredStreak: 1,
      feedbackText: desc.hintText || `Нажмите подсвеченную клавишу ${DISPLAY_NAMES[note]} (${targetKeyId}).`,
      feedbackTone: 'neutral',
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.subStage === 'qualify') {
    return {
      step,
      progress,
      targetKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      clef: 'bass',
      answerPool: [note],
      streak: 0,
      requiredStreak: 1,
      feedbackText: 'Нажмите клавишу на пианино без подсказок (малая октава: C3–B3).',
      feedbackTone: null,
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  if (desc.subStage === 'localMix') {
    const introduced = getIntroducedBassNotes(progress, note);
    const pickIdx = ((existingState?.streak ?? 0) + 1) % introduced.length;
    const mixNote = introduced[pickIdx];
    const mixKeyId = `${mixNote}3`;

    return {
      step,
      progress,
      targetKeyId: mixKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      clef: 'bass',
      answerPool: introduced,
      streak: existingState?.streak ?? 0,
      requiredStreak: 2,
      feedbackText: 'Различайте изученные ноты на басовом стане.',
      feedbackTone: null,
      grandTransferTrialsCompleted: 0,
      grandTransferCorrectFirstAttempts: 0,
      grandTransferRecentClefs: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      remediationSourceNote: null,
      sessionId,
      now
    };
  }

  // Delayed Check
  const noteRec = progress[getBassNoteCurriculumItemId(note)];
  const awaitingCorrective =
    Boolean(noteRec?.contexts?.includes('pending:corrective')) ||
    Boolean(existingState?.awaitingCorrective);
  const isIntervening =
    Boolean(!awaitingCorrective && noteRec?.contexts?.includes('pending:interveningRecall')) ||
    Boolean(!awaitingCorrective && existingState?.isInterveningRecall);

  const effectiveNote = isIntervening
    ? (note === 'F' ? 'C' : 'F')
    : note;
  const effectiveKeyId = `${effectiveNote}3`;

  return {
    step,
    progress,
    targetKeyId: effectiveKeyId,
    targetKeyIds: awaitingCorrective ? [effectiveKeyId] : [],
    structuralGuideKeyIds: awaitingCorrective ? [effectiveKeyId] : [],
    modelLabelKeyIds: awaitingCorrective ? [effectiveKeyId] : [],
    clef: 'bass',
    answerPool: [effectiveNote],
    streak: 0,
    requiredStreak: 1,
    feedbackText: isIntervening
      ? `Контрастный шаг: сначала сыграйте ${DISPLAY_NAMES[effectiveNote]} (${effectiveKeyId}), затем повторим проверку по памяти.`
      : awaitingCorrective
      ? `Запомните: ${desc.hintText} Нажмите ${effectiveKeyId}.`
      : 'Финальная проверка ступени в басовом ключе по памяти.',
    feedbackTone: awaitingCorrective ? 'bad' : null,
    grandTransferTrialsCompleted: 0,
    grandTransferCorrectFirstAttempts: 0,
    grandTransferRecentClefs: [],
    awaitingCorrective,
    awaitingRemediationPress: Boolean(existingState?.awaitingRemediationPress),
    isInterveningRecall: isIntervening,
    remediationSourceNote: existingState?.remediationSourceNote ?? null,
    sessionId,
    now
  };
}

export function createBassGrandCurriculumState(params: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
  now?: number;
}): BassGrandCurriculumState {
  const now = params.now ?? Date.now();
  const progressMap = normalizeProgressMap(params.learningProgress);
  const progress: Record<string, LearningProgressRecord> = {};
  for (const [k, v] of progressMap.entries()) {
    progress[k] = v;
  }

  const step = determineNextBassGrandStep(progress);
  return buildBassGrandStateForStep(step, progress, undefined, now);
}

export const initializeBassGrandCurriculumState = createBassGrandCurriculumState;

export function canUseDontKnowInBassGrandStep(
  state: BassGrandCurriculumState
): boolean {
  const desc = describeBassGrandStep(state.step);
  if (desc.kind === 'orientation' || desc.kind === 'grandOrientation' || desc.kind === 'complete') {
    return false;
  }
  if (desc.subStage === 'model') {
    return false;
  }
  if (state.awaitingCorrective || state.awaitingRemediationPress) {
    return false;
  }
  return true;
}

export function applyBassGrandActionWithCards(params: {
  state: BassGrandCurriculumState;
  action: BassGrandAction;
  cards: readonly Card[];
  reviewLogs?: readonly ReviewLogEvent[];
  settings?: UserSettings;
  now?: number;
}): BassGrandActionResult {
  const { state, action, cards } = params;
  const now = params.now ?? Date.now();
  const desc = describeBassGrandStep(state.step);
  const progress = { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];

  function touch(rec: LearningProgressRecord) {
    progress[rec.id] = rec;
    updatedProgress.push(rec);
  }

  // 1. Orientation advance
  if (desc.kind === 'orientation') {
    let oriRec = progress[BASS_GRAND_ITEM_IDS.ORIENTATION] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, now);
    oriRec = markFsrsActivated(oriRec, now);
    oriRec.state = 'retention';
    touch(oriRec);

    const nextStep = determineNextBassGrandStep(progress);
    const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
    return {
      state: nextState,
      outcome: 'advanced',
      updatedProgress,
      trialContext: createTrialContext({
        mode: 'model',
        sessionId: state.sessionId,
        itemId: BASS_GRAND_ITEM_IDS.ORIENTATION,
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        firstAttempt: true,
        inputMethod: 'screen'
      }),
      fsrsDelayedCheck: null
    };
  }

  // 2. Grand Staff Orientation advance
  if (desc.kind === 'grandOrientation') {
    let grandOriRec = progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, now);
    grandOriRec = markFsrsActivated(grandOriRec, now);
    grandOriRec.state = 'retention';
    touch(grandOriRec);

    const nextStep = determineNextBassGrandStep(progress);
    const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
    return {
      state: nextState,
      outcome: 'advanced',
      updatedProgress,
      trialContext: createTrialContext({
        mode: 'model',
        sessionId: state.sessionId,
        itemId: BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION,
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        firstAttempt: true,
        inputMethod: 'screen'
      }),
      fsrsDelayedCheck: null
    };
  }

  // 3. Module complete
  if (desc.kind === 'complete') {
    return {
      state,
      outcome: 'advanced',
      updatedProgress: [],
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: state.sessionId,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true,
        inputMethod: 'screen'
      }),
      fsrsDelayedCheck: null
    };
  }

  // 4. Grand Transfer Trials
  if (desc.kind === 'grandTransfer') {
    const targetKeyId = state.targetKeyId || 'F3';
    const pressedKeyId = action.keyId || (action.note ? `${action.note}3` : '');
    const isExactMatch = pressedKeyId === targetKeyId;
    const isPitchMatch = pressedKeyId.slice(0, -1) === targetKeyId.slice(0, -1);
    const isOctaveMismatch = isPitchMatch && !isExactMatch;

    const ctx = createTrialContext({
      mode: 'transfer',
      sessionId: state.sessionId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: !state.awaitingCorrective,
      inputMethod: 'screen'
    });

    if (!state.awaitingCorrective && (action.type === 'dontKnow' || !isExactMatch)) {
      // First attempt failure in Grand Transfer: persist pending:grandCorrective immediately!
      let transRec = progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now);
      transRec.contexts = appendUniqueContext(transRec.contexts, 'pending:grandCorrective');
      touch(transRec);

      return {
        state: {
          ...state,
          targetKeyIds: [targetKeyId],
          structuralGuideKeyIds: [targetKeyId],
          feedbackText: isOctaveMismatch
            ? `Верная ступень, но не та октава! Нужна ${targetKeyId}. Нажмите её.`
            : `Нота: ${targetKeyId}. Нажмите подсвеченную клавишу.`,
          feedbackTone: 'bad',
          awaitingCorrective: true
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    if (state.awaitingCorrective) {
      if (isExactMatch) {
        // Corrective press done, advance trial count but not correctFirstAttempts
        const newTrials = state.grandTransferTrialsCompleted + 1;
        const newCorrect = state.grandTransferCorrectFirstAttempts;
        const targetClef: 'treble' | 'bass' = targetKeyId.endsWith('3') ? 'bass' : 'treble';
        const recentClefs: ('treble' | 'bass')[] = [...state.grandTransferRecentClefs, targetClef];
        const hasBass = recentClefs.includes('bass') || Boolean(progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER]?.contexts?.includes('clef:bass'));
        const hasTreble = recentClefs.includes('treble') || Boolean(progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER]?.contexts?.includes('clef:treble'));
        const accuracy = newTrials > 0 ? (newCorrect / newTrials) : 0;
        const isComplete =
          newTrials >= GRAND_STAFF_TRANSFER_TRIALS &&
          accuracy >= GRAND_STAFF_REQUIRED_ACCURACY &&
          hasBass &&
          hasTreble;

        let transRec = progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now);
        transRec.guidedSuccesses = newTrials;
        transRec.independentUnhintedSuccesses = newCorrect;
        transRec.contexts = (transRec.contexts || []).filter(c => c !== 'pending:grandCorrective');
        if (targetClef === 'bass') transRec.contexts = appendUniqueContext(transRec.contexts, 'clef:bass');
        if (targetClef === 'treble') transRec.contexts = appendUniqueContext(transRec.contexts, 'clef:treble');

        if (isComplete) {
          transRec.state = 'retention';
          touch(transRec);

          let compRec = progress[BASS_GRAND_ITEM_IDS.COMPLETE] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, now);
          compRec.state = 'retention';
          touch(compRec);

          const nextStep = 'moduleComplete';
          const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
          return {
            state: nextState,
            outcome: 'advanced',
            updatedProgress,
            trialContext: ctx,
            fsrsDelayedCheck: null
          };
        }

        transRec.state = 'qualifying';
        touch(transRec);

        const nextState = buildBassGrandStateForStep('grandTransfer', progress, {
          grandTransferTrialsCompleted: newTrials,
          grandTransferCorrectFirstAttempts: newCorrect,
          grandTransferRecentClefs: recentClefs,
          sessionId: state.sessionId
        }, now);

        return {
          state: nextState,
          outcome: 'correct',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      return {
        state: {
          ...state,
          targetKeyIds: [targetKeyId],
          structuralGuideKeyIds: [targetKeyId],
          feedbackText: isOctaveMismatch
            ? `Верная ступень, но не та октава! Нужна ${targetKeyId}. Нажмите её.`
            : `Нота: ${targetKeyId}. Нажмите подсвеченную клавишу.`,
          feedbackTone: 'bad',
          awaitingCorrective: true
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // First attempt correct in Grand Transfer
    if (isExactMatch) {
      const newTrials = state.grandTransferTrialsCompleted + 1;
      const newCorrect = state.grandTransferCorrectFirstAttempts + 1;
      const targetClef: 'treble' | 'bass' = targetKeyId.endsWith('3') ? 'bass' : 'treble';
      const recentClefs: ('treble' | 'bass')[] = [...state.grandTransferRecentClefs, targetClef];
      const hasBass = recentClefs.includes('bass') || Boolean(progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER]?.contexts?.includes('clef:bass'));
      const hasTreble = recentClefs.includes('treble') || Boolean(progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER]?.contexts?.includes('clef:treble'));
      const accuracy = newTrials > 0 ? (newCorrect / newTrials) : 0;
      const isComplete =
        newTrials >= GRAND_STAFF_TRANSFER_TRIALS &&
        accuracy >= GRAND_STAFF_REQUIRED_ACCURACY &&
        hasBass &&
        hasTreble;

      let transRec = progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now);
      transRec.guidedSuccesses = newTrials;
      transRec.independentUnhintedSuccesses = newCorrect;
      transRec.contexts = (transRec.contexts || []).filter(c => c !== 'pending:grandCorrective');
      if (targetClef === 'bass') transRec.contexts = appendUniqueContext(transRec.contexts, 'clef:bass');
      if (targetClef === 'treble') transRec.contexts = appendUniqueContext(transRec.contexts, 'clef:treble');

      if (isComplete) {
        transRec.state = 'retention';
        touch(transRec);

        let compRec = progress[BASS_GRAND_ITEM_IDS.COMPLETE] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, now);
        compRec.state = 'retention';
        touch(compRec);

        const nextStep = 'moduleComplete';
        const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
        return {
          state: nextState,
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      transRec.state = 'qualifying';
      touch(transRec);

      const nextState = buildBassGrandStateForStep('grandTransfer', progress, {
        grandTransferTrialsCompleted: newTrials,
        grandTransferCorrectFirstAttempts: newCorrect,
        grandTransferRecentClefs: recentClefs,
        sessionId: state.sessionId
      }, now);

      return {
        state: nextState,
        outcome: 'correct',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    return {
      state,
      outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
      updatedProgress: [],
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // 5. Bass Final Mix
  if (desc.kind === 'bassFinalMix') {
    const targetKeyId = state.targetKeyId || 'F3';
    const pressedKeyId = action.keyId || (action.note ? `${action.note}3` : '');
    const isExactMatch = pressedKeyId === targetKeyId;
    const isPitchMatch = pressedKeyId.slice(0, -1) === targetKeyId.slice(0, -1);
    const isOctaveMismatch = isPitchMatch && !isExactMatch;

    const ctx = createTrialContext({
      mode: 'mixedRetrieval',
      sessionId: state.sessionId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    if (action.type === 'dontKnow' || !isExactMatch) {
      return {
        state: {
          ...state,
          targetKeyIds: [targetKeyId],
          feedbackText: isOctaveMismatch
            ? `Верная нота, но нужна малая октава: ${targetKeyId}.`
            : `Это нота ${targetKeyId}. Нажмите её.`,
          feedbackTone: 'bad',
          streak: 0
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const newStreak = state.streak + 1;
    if (newStreak >= state.requiredStreak) {
      let mixRec = progress[BASS_GRAND_ITEM_IDS.FINAL_MIX] || createInitialLearningProgress(BASS_GRAND_ITEM_IDS.FINAL_MIX, now);
      mixRec.state = 'retention';
      touch(mixRec);

      const nextStep = determineNextBassGrandStep(progress);
      const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
      return {
        state: nextState,
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const nextState = buildBassGrandStateForStep('bassFinalMix', progress, {
      streak: newStreak,
      sessionId: state.sessionId
    }, now);

    return {
      state: nextState,
      outcome: 'correct',
      updatedProgress: [],
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // 6. Bass note subStages (model, qualify, localMix, delayedCheck)
  const focusNote = desc.focusBassNote || 'F';
  const targetKeyId = state.targetKeyId || `${focusNote}3`;
  const itemId = getBassNoteCurriculumItemId(focusNote);
  let noteRec = progress[itemId] || createInitialLearningProgress(itemId, now);

  const pressedKeyId = action.keyId || (action.note ? `${action.note}3` : '');
  const isExactMatch = pressedKeyId === targetKeyId;
  const isPitchMatch = pressedKeyId.slice(0, -1) === targetKeyId.slice(0, -1);
  const isOctaveMismatch = isPitchMatch && !isExactMatch;

  // Substage: MODEL
  if (desc.subStage === 'model') {
    const ctx = createTrialContext({
      mode: 'model',
      sessionId: state.sessionId,
      itemId,
      hintLevel: HINT_LEVEL.MODEL_VISIBLE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    if (action.type === 'keyPress' && !isExactMatch) {
      return {
        state: {
          ...state,
          feedbackText: isOctaveMismatch
            ? `Нота верная (${DISPLAY_NAMES[focusNote]}), но нужна малая октава (${targetKeyId}).`
            : `Нажмите подсвеченную клавишу ${DISPLAY_NAMES[focusNote]} (${targetKeyId}).`,
          feedbackTone: 'bad'
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    noteRec = recordModelCompleted(noteRec, now, `model:notationBassToKey:${targetKeyId}`);
    touch(noteRec);

    const nextStep = determineNextBassGrandStep(progress);
    const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
    return {
      state: nextState,
      outcome: 'advanced',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Substage: QUALIFY
  if (desc.subStage === 'qualify') {
    const ctx = createTrialContext({
      mode: 'qualify',
      sessionId: state.sessionId,
      itemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    if (action.type === 'dontKnow' || !isExactMatch) {
      return {
        state: {
          ...state,
          targetKeyIds: [targetKeyId],
          feedbackText: isOctaveMismatch
            ? `Верная нота, но сыграна не та октава! Нужна малая октава (${targetKeyId}).`
            : `Подсказка: это нота ${DISPLAY_NAMES[focusNote]} (${targetKeyId}).`,
          feedbackTone: 'bad'
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    noteRec = recordIndependentAttempt(noteRec, {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      at: now,
      contextId: 'qualify'
    });
    touch(noteRec);

    const nextStep = determineNextBassGrandStep(progress);
    const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
    return {
      state: nextState,
      outcome: 'advanced',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Substage: LOCAL MIX
  if (desc.subStage === 'localMix') {
    const ctx = createTrialContext({
      mode: 'mixedRetrieval',
      sessionId: state.sessionId,
      itemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    if (action.type === 'dontKnow' || !isExactMatch) {
      return {
        state: {
          ...state,
          targetKeyIds: [targetKeyId],
          feedbackText: isOctaveMismatch
            ? `Верная ступень, но не та октава (${targetKeyId}).`
            : `Подсказка: это нота ${targetKeyId}.`,
          feedbackTone: 'bad',
          streak: 0
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const newStreak = state.streak + 1;
    if (newStreak >= state.requiredStreak) {
      noteRec = markMixReady(noteRec, now);
      touch(noteRec);

      const nextStep = determineNextBassGrandStep(progress);
      const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);
      return {
        state: nextState,
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const nextState = buildBassGrandStateForStep(state.step, progress, {
      streak: newStreak,
      sessionId: state.sessionId
    }, now);

    return {
      state: nextState,
      outcome: 'correct',
      updatedProgress: [],
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Substage: DELAYED CHECK
  const isIntervening = state.isInterveningRecall;
  const isAwaitingCorrective = state.awaitingCorrective;
  const cardId = `notationBassToKey:${focusNote}`;
  const existingCard = cards.find(c => c.id === cardId);

  const ctx = createTrialContext({
    mode: isIntervening ? 'mixedRetrieval' : isAwaitingCorrective ? 'corrective' : 'delayedCheck',
    sessionId: state.sessionId,
    cardId,
    itemId,
    hintLevel: isAwaitingCorrective ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
    firstAttempt: !isAwaitingCorrective && !isIntervening && !noteRec.contexts.includes('pending:delayedRetry'),
    inputMethod: 'screen'
  });

  // Awaiting corrective press
  if (isAwaitingCorrective) {
    if (isExactMatch) {
      // Corrective press done -> move to intervening recall
      noteRec.contexts = appendUniqueContext(
        noteRec.contexts.filter(c => c !== 'pending:corrective'),
        'pending:interveningRecall'
      );
      touch(noteRec);

      const nextState = buildBassGrandStateForStep(state.step, progress, {
        isInterveningRecall: true,
        awaitingCorrective: false,
        remediationSourceNote: focusNote,
        sessionId: state.sessionId
      }, now);

      return {
        state: nextState,
        outcome: 'correct',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }
    return {
      state,
      outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
      updatedProgress: [],
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Intervening recall step
  if (isIntervening) {
    if (isExactMatch) {
      // Intervening recall succeeded -> return to fresh H0 retry (keeping pending:delayedRetry)
      noteRec.contexts = noteRec.contexts.filter(
        c => c !== 'pending:interveningRecall' && c !== 'pending:corrective'
      );
      touch(noteRec);

      const nextState = buildBassGrandStateForStep(state.step, progress, {
        isInterveningRecall: false,
        awaitingCorrective: false,
        remediationSourceNote: focusNote,
        sessionId: state.sessionId
      }, now);

      return {
        state: nextState,
        outcome: 'correct',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }
    return {
      state: {
        ...state,
        targetKeyIds: [targetKeyId],
        feedbackText: `Нажмите клавишу ${targetKeyId} для завершения контрастного шага.`,
        feedbackTone: 'bad'
      },
      outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
      updatedProgress: [],
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // H0 Delayed check attempt:
  if (action.type === 'dontKnow' || !isExactMatch) {
    // Remediation protocol:
    // Mark pending:delayedRetry and pending:corrective
    const isFirstAttempt = !noteRec.contexts.includes('pending:delayedRetry');
    noteRec.contexts = appendUniqueContext(
      appendUniqueContext(noteRec.contexts, 'pending:delayedRetry'),
      'pending:corrective'
    );
    touch(noteRec);

    let fsrsDelayedCheck = null;
    let mutatedCard: Card | undefined;
    let attemptResult: SubmitQuestionAttemptResult | undefined;

    // "Don't Know" does NOT penalize FSRS. Only a wrong answer on first attempt triggers "Again" once.
    if (action.type !== 'dontKnow' && existingCard && isFirstAttempt) {
      fsrsDelayedCheck = {
        card: existingCard,
        grade: 1 as const,
        firstAttempt: true
      };

      const roundState: QuestionRoundState = {
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        isCompleted: false,
        isLocked: false
      };

      attemptResult = submitQuestionAttempt({
        state: roundState,
        card: existingCard,
        kind: 'scheduled',
        isCorrect: false,
        answer: (pressedKeyId.slice(0, -1) as NoteName) || null,
        answerKeyId: pressedKeyId,
        responseMs: null,
        reviewedAt: now,
        trialContext: ctx,
        sessionId: state.sessionId,
        settings: {
          desiredRetention: params.settings?.desiredRetention ?? 0.9,
          maxIntervalDays: params.settings?.maxIntervalDays ?? 36500,
          relearningSeconds: params.settings?.relearningSeconds ?? 600,
          useLatencyGrading: params.settings?.useLatencyGrading ?? true
        }
      });
      mutatedCard = attemptResult.cardMutated ? existingCard : undefined;
    }

    return {
      state: {
        ...state,
        targetKeyIds: [targetKeyId],
        structuralGuideKeyIds: [targetKeyId],
        modelLabelKeyIds: [targetKeyId],
        feedbackText: isOctaveMismatch
          ? `Верная нота, но сыграна не та октава (${targetKeyId}). Повторим ориентир.`
          : action.type === 'dontKnow'
          ? `Ориентир: ${desc.hintText} Нажмите ${targetKeyId}.`
          : `Ошибка. ${desc.hintText} Нажмите ${targetKeyId}.`,
        feedbackTone: 'bad',
        awaitingCorrective: true
      },
      outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck,
      mutatedCard,
      attemptResult
    };
  }

  // H0 delayedCheck SUCCESS!
  const isFirstAttempt = !noteRec.contexts.includes('pending:delayedRetry');
  noteRec.contexts = noteRec.contexts.filter(
    c =>
      c !== 'pending:delayedRetry' &&
      c !== 'pending:corrective' &&
      c !== 'pending:interveningRecall'
  );
  noteRec = markFsrsActivated(noteRec, now);
  noteRec.state = 'retention';
  touch(noteRec);

  let fsrsDelayedCheck = null;
  let mutatedCard: Card | undefined;
  let attemptResult: SubmitQuestionAttemptResult | undefined;

  if (existingCard && isFirstAttempt) {
    fsrsDelayedCheck = {
      card: existingCard,
      grade: 3 as const,
      firstAttempt: true
    };

    const roundState: QuestionRoundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };

    attemptResult = submitQuestionAttempt({
      state: roundState,
      card: existingCard,
      kind: 'scheduled',
      isCorrect: true,
      answer: focusNote,
      answerKeyId: targetKeyId,
      responseMs: null,
      reviewedAt: now,
      trialContext: ctx,
      sessionId: state.sessionId,
      settings: {
        desiredRetention: params.settings?.desiredRetention ?? 0.9,
        maxIntervalDays: params.settings?.maxIntervalDays ?? 36500,
        relearningSeconds: params.settings?.relearningSeconds ?? 600,
        useLatencyGrading: params.settings?.useLatencyGrading ?? true
      }
    });
    mutatedCard = attemptResult.cardMutated ? existingCard : undefined;
  }

  const nextStep = determineNextBassGrandStep(progress);
  const nextState = buildBassGrandStateForStep(nextStep, progress, undefined, now);

  return {
    state: nextState,
    outcome: 'advanced',
    updatedProgress,
    trialContext: ctx,
    fsrsDelayedCheck,
    mutatedCard,
    attemptResult
  };
}
