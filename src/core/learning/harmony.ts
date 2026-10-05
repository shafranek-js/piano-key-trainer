import { areChordKeyIdsEqual, sortKeyIdsByPitch, toggleKeyInChordSelection } from '../input/chordInput';
import { midiFromKeyId, pitchClassFromMidi } from '../../audio/types';
import type {
  Card,
  HarmonyFunctionId,
  NoteName,
  Skill,
} from '../fsrs/types';
import type { LearningProgressRecord, LearningTransferAssessment } from './types';
import type { ProgressCollectionInput } from './curriculumFlow';

export type HarmonyChordId = 'C' | 'G' | 'G/B' | 'Am' | 'F';
export type HarmonyStep =
  | 'orientation'
  | 'functionIdentify'
  | 'rootProgression'
  | 'smoothModel'
  | 'smoothComparison'
  | 'inversionChoice'
  | 'nextChord'
  | 'guidedSequence'
  | 'independentSequence'
  | 'memorySequence'
  | 'transferAssessment'
  | 'transferResult'
  | 'transferRemediation'
  | 'moduleComplete';

export const HARMONY_ITEM_IDS = {
  ORIENTATION: 'advanced-harmony:orientation',
  FUNCTIONS: 'advanced-harmony:functions',
  ROOT_SEQUENCE: 'advanced-harmony:root-sequence',
  SMOOTH_MODEL: 'advanced-harmony:smooth-model',
  VOICING_CHOICE: 'advanced-harmony:voicing-choice',
  NEXT_CHORD: 'advanced-harmony:next-chord',
  GUIDED_PLAY: 'advanced-harmony:guided-play',
  INDEPENDENT_PLAY: 'advanced-harmony:independent-play',
  MEMORY_PLAY: 'advanced-harmony:memory-play',
  TRANSFER: 'advanced-harmony:transfer',
  COMPLETE: 'advanced-harmony:complete',
  SESSION: 'advanced-harmony:session'
} as const;

export const HARMONY_TRANSFER_TRIALS = 12;
export const HARMONY_RETRY_TRIALS = 8;
export const HARMONY_REQUIRED_ACCURACY = 0.8;

export interface HarmonyChordDefinition {
  id: HarmonyChordId;
  symbol: string;
  functionId: HarmonyFunctionId;
  rootKeyId: string;
  quality: 'major' | 'minor';
  inversion: 'root' | 'first';
  keyIds: readonly [string, string, string];
  bassKeyId: string;
}

export const HARMONY_CHORDS: Readonly<Record<HarmonyChordId, HarmonyChordDefinition>> = {
  C: {
    id: 'C', symbol: 'C', functionId: 'I', rootKeyId: 'C4', quality: 'major', inversion: 'root',
    keyIds: ['C4', 'E4', 'G4'], bassKeyId: 'C4'
  },
  G: {
    id: 'G', symbol: 'G', functionId: 'V', rootKeyId: 'G3', quality: 'major', inversion: 'root',
    keyIds: ['G3', 'B3', 'D4'], bassKeyId: 'G3'
  },
  'G/B': {
    id: 'G/B', symbol: 'G/B', functionId: 'V', rootKeyId: 'G3', quality: 'major', inversion: 'first',
    keyIds: ['B3', 'D4', 'G4'], bassKeyId: 'B3'
  },
  Am: {
    id: 'Am', symbol: 'Am', functionId: 'vi', rootKeyId: 'A3', quality: 'minor', inversion: 'root',
    keyIds: ['A3', 'C4', 'E4'], bassKeyId: 'A3'
  },
  F: {
    id: 'F', symbol: 'F', functionId: 'IV', rootKeyId: 'F3', quality: 'major', inversion: 'root',
    keyIds: ['F3', 'A3', 'C4'], bassKeyId: 'F3'
  }
};

export const HARMONY_FUNCTION_ORDER: readonly HarmonyFunctionId[] = ['I', 'V', 'vi', 'IV'];
export const HARMONY_ROOT_SEQUENCE: readonly HarmonyChordId[] = ['C', 'G', 'Am', 'F'];
export const HARMONY_SMOOTH_SEQUENCE: readonly HarmonyChordId[] = ['C', 'G/B', 'Am', 'F'];
export const HARMONY_SEQUENCE_SYMBOL = 'C → G/B → Am → F';
export const HARMONY_FUNCTION_SEQUENCE = 'I → V → vi → IV';

export interface HarmonyQuestion {
  kind: 'function' | 'nextChord' | 'inversion';
  prompt: string;
  choices: readonly string[];
  expectedAnswer: string;
  explanation: string;
}

export type HarmonyAssessmentTrial =
  | { kind: 'function' | 'nextChord' | 'inversion'; question: HarmonyQuestion; coverageTag: string }
  | { kind: 'progression'; prompt: string; progression: readonly HarmonyChordId[]; coverageTag: string };

export interface HarmonyCurriculumState {
  step: HarmonyStep;
  progress: Record<string, LearningProgressRecord>;
  sequenceIndex: number;
  quizIndex: number;
  assessmentIndex: number;
  assessmentChordIndex: number;
  awaitingCorrective: boolean;
  trialHadWrong: boolean;
  selectedKeyIds: string[];
  feedbackText: string;
  feedbackTone: 'good' | 'bad' | 'warn' | '';
}

export type HarmonyAction =
  | { type: 'advanceStage' }
  | { type: 'selectAnswer'; answer: string }
  | { type: 'toggleKey'; keyId: string }
  | { type: 'submitChord'; keyIds?: readonly string[] }
  | { type: 'startRemediation' };

export interface HarmonyActionResult {
  state: HarmonyCurriculumState;
  updatedProgress: LearningProgressRecord[];
  outcome: 'correct' | 'wrong' | 'incomplete' | null;
  chordClassification?: HarmonyChordClassification;
}

export interface HarmonyChordClassification {
  outcome: 'correct' | 'wrong_quality' | 'wrong_inversion' | 'wrong_octave' | 'wrong_chord' | 'incomplete_chord' | 'extra_notes';
  feedbackText: string;
}

export interface HarmonyReviewTask {
  skill: Extract<Skill, 'harmonyFunctionIdentify' | 'harmonyNextChord' | 'harmonyProgressionPlay'>;
  note: NoteName;
  kind: 'semantic' | 'progression';
  prompt: string;
  choices: readonly string[];
  expectedAnswer?: string;
  progression?: readonly HarmonyChordId[];
}

const STAGE_ORDER: readonly HarmonyStep[] = [
  'orientation', 'functionIdentify', 'rootProgression', 'smoothModel', 'smoothComparison',
  'inversionChoice', 'nextChord', 'guidedSequence', 'independentSequence', 'memorySequence',
  'transferAssessment', 'transferResult', 'transferRemediation', 'moduleComplete'
];

const FUNCTION_QUESTIONS: readonly HarmonyQuestion[] = [
  { kind: 'function', prompt: 'Какой аккорд имеет функцию I (тоника) в C major?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'C', explanation: 'C — I, тоника: она задаёт тональный центр.' },
  { kind: 'function', prompt: 'G = какая функция в C major?', choices: ['I', 'V', 'vi', 'IV'], expectedAnswer: 'V', explanation: 'G — V: доминанта, пятая ступень C major.' },
  { kind: 'function', prompt: 'Какой аккорд имеет функцию vi в C major?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'Am', explanation: 'Am — vi, минорный аккорд на шестой ступени.' },
  { kind: 'function', prompt: 'F = какая функция в C major?', choices: ['I', 'V', 'vi', 'IV'], expectedAnswer: 'IV', explanation: 'F — IV, аккорд четвёртой ступени.' },
  { kind: 'function', prompt: 'Какой аккорд является V в C major?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'G', explanation: 'G — V, доминанта в C major.' },
  { kind: 'function', prompt: 'Am = какая функция в C major?', choices: ['I', 'V', 'vi', 'IV'], expectedAnswer: 'vi', explanation: 'Am — vi, минорный аккорд шестой ступени.' },
  { kind: 'function', prompt: 'Какой аккорд является IV в C major?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'F', explanation: 'F — IV, аккорд четвёртой ступени.' },
  { kind: 'function', prompt: 'C = какая функция в C major?', choices: ['I', 'V', 'vi', 'IV'], expectedAnswer: 'I', explanation: 'C — I, тоника тональности.' }
];

const NEXT_CHORD_QUESTIONS: readonly HarmonyQuestion[] = [
  { kind: 'nextChord', prompt: 'C → G/B → Am → ?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'F', explanation: 'В изученной цепочке после Am идёт F.' },
  { kind: 'nextChord', prompt: 'I → V → ? → IV', choices: ['I', 'V', 'vi', 'IV'], expectedAnswer: 'vi', explanation: 'В этой цепочке после V идёт vi.' }
];

const INITIAL_ASSESSMENT: readonly HarmonyAssessmentTrial[] = [
  { kind: 'function', question: FUNCTION_QUESTIONS[1], coverageTag: 'function:V' },
  { kind: 'nextChord', question: NEXT_CHORD_QUESTIONS[0], coverageTag: 'nextChord:F' },
  { kind: 'progression', prompt: 'Сыграйте C → G → Am → F', progression: ['C', 'G', 'Am', 'F'], coverageTag: 'play:root' },
  { kind: 'function', question: FUNCTION_QUESTIONS[2], coverageTag: 'function:vi' },
  { kind: 'inversion', question: { kind: 'inversion', prompt: 'Для плавного перехода C → G выберите изученный вариант G major.', choices: ['G', 'G/B'], expectedAnswer: 'G/B', explanation: 'G/B ставит B в бас и создаёт шаг C → B → A.' }, coverageTag: 'voicing:G/B' },
  { kind: 'progression', prompt: 'Сыграйте C → G/B → Am → F', progression: ['C', 'G/B', 'Am', 'F'], coverageTag: 'play:smooth' },
  { kind: 'function', question: FUNCTION_QUESTIONS[6], coverageTag: 'function:IV' },
  { kind: 'nextChord', question: NEXT_CHORD_QUESTIONS[1], coverageTag: 'nextChord:vi' },
  { kind: 'progression', prompt: 'Сыграйте Am → F → C → G', progression: ['Am', 'F', 'C', 'G'], coverageTag: 'play:variation' },
  { kind: 'function', question: FUNCTION_QUESTIONS[0], coverageTag: 'function:I' },
  { kind: 'nextChord', question: { kind: 'nextChord', prompt: 'F → G → C → ?', choices: ['C', 'G', 'Am', 'F'], expectedAnswer: 'C', explanation: 'В этом коротком завершении после G возвращаемся к C.' }, coverageTag: 'nextChord:cadence' },
  { kind: 'progression', prompt: 'Сыграйте F → G → C', progression: ['F', 'G', 'C'], coverageTag: 'play:short' }
];

const RETRY_ASSESSMENT: readonly HarmonyAssessmentTrial[] = [
  { kind: 'function', question: FUNCTION_QUESTIONS[4], coverageTag: 'function:V' },
  { kind: 'nextChord', question: NEXT_CHORD_QUESTIONS[1], coverageTag: 'nextChord:vi' },
  { kind: 'progression', prompt: 'Сыграйте C → G/B → Am → F', progression: ['C', 'G/B', 'Am', 'F'], coverageTag: 'play:smooth' },
  { kind: 'function', question: FUNCTION_QUESTIONS[5], coverageTag: 'function:vi' },
  { kind: 'inversion', question: { kind: 'inversion', prompt: 'Для перехода C → G выберите более плавный изученный вариант.', choices: ['G', 'G/B'], expectedAnswer: 'G/B', explanation: 'В G/B бас движется C → B, затем B → A.' }, coverageTag: 'voicing:G/B' },
  { kind: 'progression', prompt: 'Сыграйте Am → F → C → G', progression: ['Am', 'F', 'C', 'G'], coverageTag: 'play:variation' },
  { kind: 'nextChord', question: NEXT_CHORD_QUESTIONS[0], coverageTag: 'nextChord:F' },
  { kind: 'progression', prompt: 'Сыграйте F → G → C', progression: ['F', 'G', 'C'], coverageTag: 'play:short' }
];

function normalizeProgress(input?: ProgressCollectionInput): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) return new Map(input.filter((item): item is LearningProgressRecord => Boolean(item?.id)).map(item => [item.id, item]));
  return new Map(Object.entries(input as Record<string, LearningProgressRecord>).filter(([, value]) => Boolean(value?.id)));
}

function initialProgress(id: string, now: number): LearningProgressRecord {
  return {
    id, itemId: id, state: 'unseen', modelCompleted: false, guidedSuccesses: 0,
    independentUnhintedSuccesses: 0, contexts: [], currentHintLevel: 3, updatedAt: now
  };
}

function completeProgressItem(state: HarmonyCurriculumState, id: string, now: number): void {
  const record = state.progress[id] ?? initialProgress(id, now);
  state.progress[id] = {
    ...record,
    state: 'retention',
    modelCompleted: true,
    guidedSuccesses: Math.max(1, record.guidedSuccesses),
    independentUnhintedSuccesses: Math.max(1, record.independentUnhintedSuccesses),
    contexts: [...new Set([...(record.contexts ?? []), 'harmony:gate-complete'])],
    mixReadyAt: record.mixReadyAt ?? now,
    firstFsrsEligibleAt: record.firstFsrsEligibleAt ?? now,
    updatedAt: now
  };
}

function getSessionRecord(state: HarmonyCurriculumState): LearningProgressRecord {
  return state.progress[HARMONY_ITEM_IDS.SESSION];
}

function persistSnapshot(state: HarmonyCurriculumState, now: number): LearningProgressRecord {
  const record = getSessionRecord(state);
  const next: LearningProgressRecord = {
    ...record,
    state: state.step === 'orientation' ? 'unseen' : state.step === 'moduleComplete' ? 'retention' : 'introduced',
    modelCompleted: state.step !== 'orientation',
    contexts: [...(record.contexts ?? [])],
    harmonySnapshot: {
      step: state.step,
      sequenceIndex: state.sequenceIndex,
      quizIndex: state.quizIndex,
      assessmentIndex: state.assessmentIndex,
      assessmentChordIndex: state.assessmentChordIndex,
      awaitingCorrective: state.awaitingCorrective,
      trialHadWrong: state.trialHadWrong
    },
    transferAssessment: state.progress[HARMONY_ITEM_IDS.TRANSFER]?.transferAssessment,
    updatedAt: now
  };
  state.progress[HARMONY_ITEM_IDS.SESSION] = next;
  return next;
}

function resetSequence(state: HarmonyCurriculumState): void {
  state.sequenceIndex = 0;
  state.selectedKeyIds = [];
  state.awaitingCorrective = false;
  state.trialHadWrong = false;
  state.assessmentChordIndex = 0;
}

function getTransferRecord(state: HarmonyCurriculumState): LearningProgressRecord {
  return state.progress[HARMONY_ITEM_IDS.TRANSFER];
}

function getAssessment(state: HarmonyCurriculumState): LearningTransferAssessment {
  return getTransferRecord(state).transferAssessment ?? {
    blockNumber: 1,
    blockKind: 'initial',
    phase: 'active',
    trialsCompleted: 0,
    correctFirstAttempts: 0,
    coverageTags: [],
    failedTrialIndexes: [],
    remediationTrialIndexes: [],
    remediationIndex: 0
  };
}

function setAssessment(state: HarmonyCurriculumState, assessment: LearningTransferAssessment, now: number): void {
  const record = getTransferRecord(state);
  const prior = record.transferAssessment;
  state.progress[HARMONY_ITEM_IDS.TRANSFER] = {
    ...record,
    transferAssessment: assessment,
    transferLifetimeTrials: (record.transferLifetimeTrials ?? 0) + Math.max(0, assessment.trialsCompleted - (prior?.trialsCompleted ?? 0)),
    transferLifetimeCorrectFirstAttempts: (record.transferLifetimeCorrectFirstAttempts ?? 0) + Math.max(0, assessment.correctFirstAttempts - (prior?.correctFirstAttempts ?? 0)),
    updatedAt: now
  };
}

function startAssessment(state: HarmonyCurriculumState, blockKind: 'initial' | 'retry', now: number): void {
  const prior = getAssessment(state);
  const transfer = getTransferRecord(state);
  const assessment: LearningTransferAssessment = {
    blockNumber: blockKind === 'initial' ? 1 : prior.blockNumber + 1,
    blockKind,
    phase: 'active',
    trialsCompleted: 0,
    correctFirstAttempts: 0,
    coverageTags: [],
    failedTrialIndexes: [],
    remediationTrialIndexes: [],
    remediationIndex: 0
  };
  state.progress[HARMONY_ITEM_IDS.TRANSFER] = {
    ...transfer,
    state: 'qualifying',
    modelCompleted: true,
    transferAssessment: assessment,
    updatedAt: now
  };
  state.step = 'transferAssessment';
  state.assessmentIndex = 0;
  state.assessmentChordIndex = 0;
  state.awaitingCorrective = false;
  state.trialHadWrong = false;
  state.selectedKeyIds = [];
  state.feedbackText = '';
  state.feedbackTone = '';
}

export function isHarmonyModuleAvailable(input: { inversionComplete: boolean }): boolean {
  return input.inversionComplete;
}

export function isHarmonyModuleComplete(input?: ProgressCollectionInput): boolean {
  return normalizeProgress(input).get(HARMONY_ITEM_IDS.COMPLETE)?.state === 'retention';
}

export function getHarmonyModuleStatus(input?: ProgressCollectionInput): 'not_started' | 'in_progress' | 'completed' {
  const map = normalizeProgress(input);
  if (map.get(HARMONY_ITEM_IDS.COMPLETE)?.state === 'retention') return 'completed';
  const session = map.get(HARMONY_ITEM_IDS.SESSION);
  const hasProgress = Object.values(HARMONY_ITEM_IDS)
    .filter(id => id !== HARMONY_ITEM_IDS.SESSION)
    .some(id => map.get(id)?.state !== undefined && map.get(id)?.state !== 'unseen');
  return hasProgress || Boolean(session?.harmonySnapshot && session.harmonySnapshot.step !== 'orientation')
    ? 'in_progress'
    : 'not_started';
}

export function createHarmonyCurriculumState(input?: ProgressCollectionInput, now = Date.now()): HarmonyCurriculumState {
  const existing = normalizeProgress(input);
  const progress: Record<string, LearningProgressRecord> = {};
  for (const id of Object.values(HARMONY_ITEM_IDS)) {
    const record = existing.get(id) ?? initialProgress(id, now);
    progress[id] = {
      ...record,
      contexts: [...(record.contexts ?? [])],
      transferAssessment: record.transferAssessment
        ? {
            ...record.transferAssessment,
            coverageTags: [...record.transferAssessment.coverageTags],
            failedTrialIndexes: [...record.transferAssessment.failedTrialIndexes],
            remediationTrialIndexes: [...record.transferAssessment.remediationTrialIndexes]
          }
        : undefined,
      harmonySnapshot: record.harmonySnapshot ? { ...record.harmonySnapshot } : undefined
    };
  }
  const snapshot = progress[HARMONY_ITEM_IDS.SESSION].harmonySnapshot;
  let step: HarmonyStep = STAGE_ORDER.includes(snapshot?.step as HarmonyStep) ? snapshot!.step as HarmonyStep : 'orientation';
  if (progress[HARMONY_ITEM_IDS.COMPLETE].state === 'retention') step = 'moduleComplete';
  return {
    step,
    progress,
    sequenceIndex: Math.max(0, snapshot?.sequenceIndex ?? 0),
    quizIndex: Math.max(0, snapshot?.quizIndex ?? 0),
    assessmentIndex: Math.max(0, snapshot?.assessmentIndex ?? 0),
    assessmentChordIndex: Math.max(0, snapshot?.assessmentChordIndex ?? 0),
    awaitingCorrective: snapshot?.awaitingCorrective ?? false,
    trialHadWrong: snapshot?.trialHadWrong ?? false,
    selectedKeyIds: [],
    feedbackText: '',
    feedbackTone: ''
  };
}

export function getCurrentHarmonyQuestion(state: HarmonyCurriculumState): HarmonyQuestion | null {
  if (state.step === 'functionIdentify') return FUNCTION_QUESTIONS[state.quizIndex] ?? null;
  if (state.step === 'nextChord') return NEXT_CHORD_QUESTIONS[state.quizIndex] ?? null;
  if (state.step === 'inversionChoice') {
    return {
      kind: 'inversion',
      prompt: 'Сейчас звучит C major. Как удобнее перейти к G major?',
      choices: ['G', 'G/B'],
      expectedAnswer: 'G/B',
      explanation: 'G/B сохраняет аккорд G major, но ставит B в бас: C → B → A.'
    };
  }
  if (state.step === 'transferAssessment') {
    const trial = getCurrentHarmonyAssessmentTrial(state);
    return trial && trial.kind !== 'progression' ? trial.question : null;
  }
  if (state.step === 'transferRemediation') {
    const trial = getCurrentHarmonyRemediationTrial(state);
    return trial && trial.kind !== 'progression' ? trial.question : null;
  }
  return null;
}

export function getCurrentHarmonyProgression(state: HarmonyCurriculumState): readonly HarmonyChordId[] | null {
  if (state.step === 'rootProgression') return HARMONY_ROOT_SEQUENCE;
  if (state.step === 'guidedSequence' || state.step === 'independentSequence' || state.step === 'memorySequence') return HARMONY_SMOOTH_SEQUENCE;
  if (state.step === 'transferAssessment') {
    const trial = getCurrentHarmonyAssessmentTrial(state);
    return trial?.kind === 'progression' ? trial.progression : null;
  }
  if (state.step === 'transferRemediation') {
    const trial = getCurrentHarmonyRemediationTrial(state);
    return trial?.kind === 'progression' ? trial.progression : null;
  }
  return null;
}

export function getCurrentHarmonyChord(state: HarmonyCurriculumState): HarmonyChordDefinition | null {
  const progression = getCurrentHarmonyProgression(state);
  return progression?.[state.sequenceIndex] ? HARMONY_CHORDS[progression[state.sequenceIndex]] : null;
}

export function shouldShowHarmonyVoicingHint(state: HarmonyCurriculumState): boolean {
  return state.step === 'rootProgression' || state.step === 'guidedSequence';
}

export function canInputHarmonyChord(state: HarmonyCurriculumState): boolean {
  return Boolean(getCurrentHarmonyProgression(state)) && state.step !== 'transferResult' && state.step !== 'moduleComplete';
}

export function canUseDontKnowInHarmonyStep(state: HarmonyCurriculumState): boolean {
  void state;
  return false;
}

function assessmentCycle(blockKind: 'initial' | 'retry'): readonly HarmonyAssessmentTrial[] {
  return blockKind === 'retry' ? RETRY_ASSESSMENT : INITIAL_ASSESSMENT;
}

export function getCurrentHarmonyAssessmentTrial(state: HarmonyCurriculumState): HarmonyAssessmentTrial | null {
  const assessment = getAssessment(state);
  if (assessment.phase !== 'active') return null;
  return assessmentCycle(assessment.blockKind)[state.assessmentIndex] ?? null;
}

export function getCurrentHarmonyRemediationTrial(state: HarmonyCurriculumState): HarmonyAssessmentTrial | null {
  const assessment = getAssessment(state);
  const sourceIndex = assessment.remediationTrialIndexes[assessment.remediationIndex];
  if (sourceIndex === undefined) return null;
  return assessmentCycle(assessment.blockKind)[sourceIndex] ?? null;
}

function finishAssessmentTrial(state: HarmonyCurriculumState, firstCorrect: boolean, now: number): void {
  const assessment = getAssessment(state);
  if (assessment.phase !== 'active') return;
  const total = assessment.blockKind === 'retry' ? HARMONY_RETRY_TRIALS : HARMONY_TRANSFER_TRIALS;
  const trial = assessmentCycle(assessment.blockKind)[state.assessmentIndex];
  const completed = Math.min(total, assessment.trialsCompleted + 1);
  const failed = firstCorrect ? assessment.failedTrialIndexes : [...assessment.failedTrialIndexes, assessment.trialsCompleted];
  const finished = completed >= total;
  const retryAccuracy = completed ? (assessment.correctFirstAttempts + (firstCorrect ? 1 : 0)) / completed : 0;
  const passed = finished && retryAccuracy >= HARMONY_REQUIRED_ACCURACY;
  const remediationIndexes = [...new Set(failed.map(index => {
    const item = assessmentCycle(assessment.blockKind)[index];
    return item ? `${item.kind}:${index}` : String(index);
  }))].slice(0, 3).map(value => Number(value.split(':').at(-1)));
  const updated: LearningTransferAssessment = {
    ...assessment,
    phase: finished ? (passed ? 'passed' : 'result') : 'active',
    trialsCompleted: completed,
    correctFirstAttempts: assessment.correctFirstAttempts + (firstCorrect ? 1 : 0),
    coverageTags: trial ? [...new Set([...assessment.coverageTags, trial.coverageTag])] : assessment.coverageTags,
    failedTrialIndexes: failed,
    remediationTrialIndexes: finished && !passed ? remediationIndexes : assessment.remediationTrialIndexes,
    remediationIndex: 0,
    pendingCorrective: false
  };
  setAssessment(state, updated, now);
  if (passed) completeProgressItem(state, HARMONY_ITEM_IDS.TRANSFER, now);
  state.assessmentIndex = completed;
  state.assessmentChordIndex = 0;
  state.trialHadWrong = false;
  state.awaitingCorrective = false;
  state.selectedKeyIds = [];
  if (finished) {
    state.step = 'transferResult';
    state.feedbackText = passed
      ? `Проверка пройдена: ${updated.correctFirstAttempts} из ${total} с первой попытки.`
      : `Проверка завершена: ${updated.correctFirstAttempts} из ${total}. Нужно не менее ${Math.ceil(total * HARMONY_REQUIRED_ACCURACY)}.`;
    state.feedbackTone = passed ? 'good' : 'warn';
  } else {
    state.assessmentIndex = Math.min(completed, total - 1);
    state.feedbackText = firstCorrect ? 'Верно с первой попытки.' : 'Первая попытка этой задачи засчитана как ошибка. Исправьте ответ, чтобы продолжить.';
    state.feedbackTone = firstCorrect ? 'good' : 'warn';
  }
}

function getSequenceForStep(state: HarmonyCurriculumState): readonly HarmonyChordId[] {
  if (state.step === 'rootProgression') return HARMONY_ROOT_SEQUENCE;
  if (state.step === 'guidedSequence' || state.step === 'independentSequence' || state.step === 'memorySequence') return HARMONY_SMOOTH_SEQUENCE;
  if (state.step === 'transferAssessment') return getCurrentHarmonyProgression(state) ?? [];
  if (state.step === 'transferRemediation') return getCurrentHarmonyProgression(state) ?? [];
  return [];
}

function completeSequence(state: HarmonyCurriculumState, now: number): void {
  const scoredSequence = state.step === 'transferAssessment' || state.step === 'transferRemediation';
  state.sequenceIndex = 0;
  state.assessmentChordIndex = 0;
  state.selectedKeyIds = [];
  state.awaitingCorrective = false;
  if (state.step === 'rootProgression') {
    completeProgressItem(state, HARMONY_ITEM_IDS.ROOT_SEQUENCE, now);
    state.step = 'smoothModel';
  } else if (state.step === 'guidedSequence') {
    completeProgressItem(state, HARMONY_ITEM_IDS.GUIDED_PLAY, now);
    state.step = 'independentSequence';
  } else if (state.step === 'independentSequence') {
    completeProgressItem(state, HARMONY_ITEM_IDS.INDEPENDENT_PLAY, now);
    state.step = 'memorySequence';
  } else if (state.step === 'memorySequence') {
    completeProgressItem(state, HARMONY_ITEM_IDS.MEMORY_PLAY, now);
    startAssessment(state, 'initial', now);
  } else if (state.step === 'transferAssessment') {
    const trialHadWrong = state.trialHadWrong;
    finishAssessmentTrial(state, !trialHadWrong, now);
  } else if (state.step === 'transferRemediation') {
    const assessment = getAssessment(state);
    const nextIndex = assessment.remediationIndex + 1;
    const next = { ...assessment, remediationIndex: nextIndex };
    setAssessment(state, next, now);
    state.trialHadWrong = false;
    state.awaitingCorrective = false;
    if (nextIndex >= next.remediationTrialIndexes.length) startAssessment(state, 'retry', now);
  }
  if (!scoredSequence) {
    state.feedbackText = state.feedbackText || 'Последовательность сыграна.';
    state.feedbackTone = 'good';
  }
}

function currentSemanticQuestion(state: HarmonyCurriculumState): HarmonyQuestion | null {
  if (state.step === 'functionIdentify' || state.step === 'nextChord' || state.step === 'inversionChoice') return getCurrentHarmonyQuestion(state);
  if (state.step === 'transferAssessment') {
    const trial = getCurrentHarmonyAssessmentTrial(state);
    return trial && trial.kind !== 'progression' ? trial.question : null;
  }
  if (state.step === 'transferRemediation') {
    const trial = getCurrentHarmonyRemediationTrial(state);
    return trial && trial.kind !== 'progression' ? trial.question : null;
  }
  return null;
}

function advanceSemanticStage(state: HarmonyCurriculumState, firstCorrect: boolean, now: number): void {
  state.awaitingCorrective = false;
  state.selectedKeyIds = [];
  state.feedbackText = firstCorrect ? 'Верно.' : 'Ответ исправлен. В проверке учитывалась первая попытка.';
  state.feedbackTone = firstCorrect ? 'good' : 'warn';

  if (state.step === 'functionIdentify') {
    state.quizIndex++;
    if (state.quizIndex >= FUNCTION_QUESTIONS.length) {
      completeProgressItem(state, HARMONY_ITEM_IDS.FUNCTIONS, now);
      state.quizIndex = 0;
      state.step = 'rootProgression';
      resetSequence(state);
    }
    return;
  }
  if (state.step === 'inversionChoice') {
    completeProgressItem(state, HARMONY_ITEM_IDS.SMOOTH_MODEL, now);
    completeProgressItem(state, HARMONY_ITEM_IDS.VOICING_CHOICE, now);
    state.step = 'nextChord';
    state.quizIndex = 0;
    return;
  }
  if (state.step === 'nextChord') {
    state.quizIndex++;
    if (state.quizIndex >= NEXT_CHORD_QUESTIONS.length) {
      completeProgressItem(state, HARMONY_ITEM_IDS.NEXT_CHORD, now);
      state.quizIndex = 0;
      state.step = 'guidedSequence';
      resetSequence(state);
    }
    return;
  }
  if (state.step === 'transferAssessment') {
    const trialHadWrong = state.trialHadWrong || !firstCorrect;
    finishAssessmentTrial(state, !trialHadWrong, now);
    return;
  }
  if (state.step === 'transferRemediation') {
    const assessment = getAssessment(state);
    const nextIndex = assessment.remediationIndex + 1;
    setAssessment(state, { ...assessment, remediationIndex: nextIndex }, now);
    if (nextIndex >= assessment.remediationTrialIndexes.length) startAssessment(state, 'retry', now);
  }
}

export function classifyHarmonyChord(userKeyIds: readonly string[], targetChordId: HarmonyChordId): HarmonyChordClassification {
  if (userKeyIds.length < 3) return { outcome: 'incomplete_chord', feedbackText: `${userKeyIds.length} из 3 нот. Сыграйте все три ноты одновременно.` };
  if (userKeyIds.length > 3) return { outcome: 'extra_notes', feedbackText: 'Аккорд состоит ровно из трёх нот. Снимите лишнюю клавишу и повторите.' };
  const target = HARMONY_CHORDS[targetChordId];
  const sorted = sortKeyIdsByPitch(userKeyIds);
  if (areChordKeyIdsEqual(sorted, target.keyIds)) return { outcome: 'correct', feedbackText: `Верно: ${target.symbol}.` };
  const toPc = (keyId: string) => {
    const midi = midiFromKeyId(keyId);
    return midi == null ? null : pitchClassFromMidi(midi);
  };
  const userPcs = sorted.map(toPc);
  const targetPcs = target.keyIds.map(toPc) as Array<string | null>;
  const samePitchClasses = new Set(userPcs.filter((pc): pc is NoteName => pc !== null)).size === 3 &&
    userPcs.every(pc => pc !== null && targetPcs.includes(String(pc)));
  const targetRoot = toPc(target.rootKeyId);
  if (samePitchClasses && targetRoot) {
    if (userPcs[0] !== toPc(target.bassKeyId)) {
      if (target.id === 'G/B') return { outcome: 'wrong_inversion', feedbackText: 'Это правильный G major, но сейчас требуется G/B: нота B должна быть в басу.' };
      return { outcome: 'wrong_inversion', feedbackText: `Это правильный ${target.symbol}, но ноты стоят в другом обращении. Сейчас нужен бас ${target.bassKeyId}.` };
    }
    return { outcome: 'wrong_octave', feedbackText: `Нужен тот же аккорд ${target.symbol}, но в указанном регистре: ${target.keyIds.join(' · ')}.` };
  }
  const pcs = new Set(userPcs.filter((pc): pc is NoteName => pc !== null).map(String));
  const rootIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(targetRoot ?? 'C');
  const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const alternateThird = pitchNames[(rootIndex + (target.quality === 'major' ? 3 : 4)) % 12];
  const fifth = pitchNames[(rootIndex + 7) % 12];
  if (targetRoot && pcs.has(targetRoot) && pcs.has(alternateThird) && pcs.has(fifth)) {
    return { outcome: 'wrong_quality', feedbackText: `Получился ${targetRoot} ${target.quality === 'major' ? 'minor' : 'major'}. Нужен ${target.quality === 'major' ? 'мажор' : 'минор'}.` };
  }
  const playedChord = Object.values(HARMONY_CHORDS).find(candidate => {
    const candidatePcs = new Set(candidate.keyIds.map(toPc).filter((pc): pc is NoteName => pc !== null).map(String));
    return candidatePcs.size === 3 && candidatePcs.size === pcs.size && [...candidatePcs].every(pc => pcs.has(pc));
  });
  const playedLabel = playedChord
    ? `${playedChord.rootKeyId.replace(/[0-9]/g, '')} ${playedChord.quality}`
    : null;
  return {
    outcome: 'wrong_chord',
    feedbackText: `Сейчас нужен ${target.symbol}, а сыгран ${playedLabel ?? 'другой аккорд'}. Ожидаются ноты ${target.keyIds.join(' · ')}.`
  };
}

function beginModuleCompletion(state: HarmonyCurriculumState, now: number): void {
  const record = state.progress[HARMONY_ITEM_IDS.COMPLETE] ?? initialProgress(HARMONY_ITEM_IDS.COMPLETE, now);
  state.progress[HARMONY_ITEM_IDS.COMPLETE] = {
    ...record,
    state: 'retention', modelCompleted: true, guidedSuccesses: 1, independentUnhintedSuccesses: 1,
    contexts: [...new Set([...(record.contexts ?? []), 'harmony:complete'])],
    mixReadyAt: record.mixReadyAt ?? now, firstFsrsEligibleAt: record.firstFsrsEligibleAt ?? now, updatedAt: now
  };
  state.step = 'moduleComplete';
  state.feedbackText = 'Модуль завершён. Функции и последовательности аккордов теперь доступны в Daily Practice.';
  state.feedbackTone = 'good';
}

function currentBlockTotal(state: HarmonyCurriculumState): number {
  return getAssessment(state).blockKind === 'retry' ? HARMONY_RETRY_TRIALS : HARMONY_TRANSFER_TRIALS;
}

export function applyHarmonyAction(
  current: HarmonyCurriculumState,
  action: HarmonyAction,
  now = Date.now()
): HarmonyActionResult {
  const state: HarmonyCurriculumState = {
    ...current,
    progress: Object.fromEntries(Object.entries(current.progress).map(([id, record]) => [id, { ...record, contexts: [...record.contexts] }])),
    selectedKeyIds: [...current.selectedKeyIds]
  };
  let outcome: HarmonyActionResult['outcome'] = null;
  let chordClassification: HarmonyChordClassification | undefined;

  if (action.type === 'advanceStage') {
    if (state.step === 'orientation') {
      completeProgressItem(state, HARMONY_ITEM_IDS.ORIENTATION, now);
      state.step = 'functionIdentify';
      state.quizIndex = 0;
    } else if (state.step === 'smoothModel') {
      completeProgressItem(state, HARMONY_ITEM_IDS.SMOOTH_MODEL, now);
      state.step = 'smoothComparison';
    } else if (state.step === 'smoothComparison') {
      state.step = 'inversionChoice';
    } else if (state.step === 'transferResult') {
      const assessment = getAssessment(state);
      if (assessment.phase === 'passed') beginModuleCompletion(state, now);
      else {
        state.step = 'transferRemediation';
        const remedial = { ...assessment, phase: 'remediation' as const, remediationIndex: 0 };
        setAssessment(state, remedial, now);
        state.feedbackText = '';
        state.feedbackTone = '';
      }
    }
  } else if (action.type === 'startRemediation' && state.step === 'transferResult') {
    const assessment = getAssessment(state);
    if (assessment.phase !== 'passed') {
      state.step = 'transferRemediation';
      setAssessment(state, { ...assessment, phase: 'remediation', remediationIndex: 0 }, now);
    }
  } else if (action.type === 'toggleKey' && canInputHarmonyChord(state)) {
    state.selectedKeyIds = toggleKeyInChordSelection(state.selectedKeyIds, action.keyId);
    state.feedbackText = state.selectedKeyIds.length === 3 ? 'Три ноты выбраны. Нажмите «Проверить аккорд».' : `${state.selectedKeyIds.length} из 3 нот выбрано.`;
    state.feedbackTone = '';
  } else if (action.type === 'submitChord' && canInputHarmonyChord(state)) {
    const sequence = getSequenceForStep(state);
    const targetId = sequence[state.sequenceIndex];
    if (!targetId) {
      state.feedbackText = 'Последовательность уже завершена.';
      state.feedbackTone = 'warn';
    } else {
      const keyIds = action.keyIds ?? state.selectedKeyIds;
      chordClassification = classifyHarmonyChord(keyIds, targetId);
      outcome = chordClassification.outcome === 'correct' ? 'correct' : chordClassification.outcome === 'incomplete_chord' ? 'incomplete' : 'wrong';
      state.feedbackText = chordClassification.feedbackText;
      state.feedbackTone = outcome === 'correct' ? 'good' : outcome === 'incomplete' ? 'warn' : 'bad';
      if (outcome === 'wrong') {
        state.selectedKeyIds = [];
        if (state.step === 'transferAssessment' || state.step === 'transferRemediation') state.trialHadWrong = true;
      }
      if (outcome === 'correct') {
        state.selectedKeyIds = [];
        if (state.step === 'transferAssessment') state.assessmentChordIndex++;
        state.sequenceIndex++;
        const end = sequence.length;
        if (state.sequenceIndex >= end) completeSequence(state, now);
      }
    }
  } else if (action.type === 'selectAnswer') {
    const question = currentSemanticQuestion(state);
    if (question) {
      const correct = action.answer === question.expectedAnswer;
      outcome = correct ? 'correct' : 'wrong';
      if (!correct) {
        const transferCorrection = state.step === 'transferAssessment' || state.step === 'transferRemediation';
        state.feedbackText = transferCorrection
          ? `Первая попытка этой задачи засчитана как ошибка. Исправьте ответ, чтобы продолжить. ${question.explanation}`
          : `Пока нет. ${question.explanation}`;
        state.feedbackTone = transferCorrection ? 'warn' : 'bad';
        state.awaitingCorrective = true;
        if (state.step === 'transferAssessment') state.trialHadWrong = true;
      } else {
        state.feedbackText = state.awaitingCorrective
          ? `Верно. ${question.explanation} Первая попытка этой задачи засчитана как ошибка.`
          : `Верно. ${question.explanation}`;
        state.feedbackTone = state.awaitingCorrective ? 'warn' : 'good';
        advanceSemanticStage(state, !state.awaitingCorrective, now);
      }
    }
  }

  if (state.step === 'transferAssessment') {
    const total = currentBlockTotal(state);
    state.assessmentIndex = Math.max(0, Math.min(state.assessmentIndex, total - 1));
  }
  const updated = persistSnapshot(state, now);
  const changedItems = Object.values(state.progress).filter(record =>
    record.id !== HARMONY_ITEM_IDS.SESSION && record.updatedAt === now
  );
  return { state, updatedProgress: [...changedItems, updated], outcome, chordClassification };
}

export function resolveHarmonyKeydownAction(state: HarmonyCurriculumState, key: string, code: string): HarmonyAction | null {
  if (key === 'Enter') {
    if (state.step === 'orientation' || state.step === 'smoothModel' || state.step === 'smoothComparison') return { type: 'advanceStage' };
    if (canInputHarmonyChord(state) && state.selectedKeyIds.length === 3) return { type: 'submitChord' };
  }
  const question = currentSemanticQuestion(state);
  if (question) {
    const index = ['1', '2', '3', '4'].findIndex(digit => key === digit || code === `Digit${digit}` || code === `Numpad${digit}`);
    if (index >= 0 && question.choices[index]) return { type: 'selectAnswer', answer: question.choices[index] };
  }
  return null;
}

export function resolveHarmonyReviewKeydownAnswer(task: HarmonyReviewTask, key: string, code: string): string | null {
  if (task.kind !== 'semantic') return null;
  const index = ['1', '2', '3', '4'].findIndex(digit => key === digit || code === `Digit${digit}` || code === `Numpad${digit}`);
  return index >= 0 ? task.choices[index] ?? null : null;
}

export function resolveHarmonyReviewTask(card: Card, variantIndex = 0): HarmonyReviewTask | null {
  if (card.skill === 'harmonyFunctionIdentify' && HARMONY_FUNCTION_ORDER.includes(card.note as HarmonyFunctionId)) {
    const functionId = card.note as HarmonyFunctionId;
    const chord = Object.values(HARMONY_CHORDS).find(item => item.functionId === functionId && item.inversion === 'root')!;
    const askForChord = variantIndex % 2 === 0;
    return {
      skill: card.skill,
      note: card.note,
      kind: 'semantic',
      prompt: askForChord ? `Какой аккорд имеет функцию ${functionId} в C major?` : `${chord.symbol} = какая функция?`,
      choices: askForChord ? ['C', 'G', 'Am', 'F'] : ['I', 'V', 'vi', 'IV'],
      expectedAnswer: askForChord ? chord.symbol : functionId
    };
  }
  if (card.skill === 'harmonyNextChord') {
    const askRoman = variantIndex % 2 === 1;
    return {
      skill: card.skill,
      note: card.note,
      kind: 'semantic',
      prompt: askRoman ? 'I → V → ? → IV' : 'C → G/B → Am → ?',
      choices: askRoman ? ['I', 'V', 'vi', 'IV'] : ['C', 'G', 'Am', 'F'],
      expectedAnswer: askRoman ? 'vi' : 'F'
    };
  }
  if (card.skill === 'harmonyProgressionPlay') {
    return {
      skill: card.skill,
      note: card.note,
      kind: 'progression',
      prompt: 'Сыграйте все четыре аккорда по порядку. Экранная клавиатура: выберите 3 ноты и проверьте; MIDI: удерживайте 3 ноты вместе.',
      choices: [],
      progression: HARMONY_SMOOTH_SEQUENCE
    };
  }
  return null;
}

export function evaluateHarmonyProgressionChord(userKeyIds: readonly string[], chordId: HarmonyChordId): HarmonyChordClassification {
  return classifyHarmonyChord(userKeyIds, chordId);
}

export function getHarmonyAssessmentLength(assessment: LearningTransferAssessment): number {
  return assessment.blockKind === 'retry' ? HARMONY_RETRY_TRIALS : HARMONY_TRANSFER_TRIALS;
}

export function harmonyCardGateSatisfied(skill: Skill, note: NoteName, progress?: ProgressCollectionInput): boolean {
  void note;
  const map = normalizeProgress(progress);
  const completion = map.get(HARMONY_ITEM_IDS.COMPLETE)?.state === 'retention';
  if (completion) return true;
  if (skill === 'harmonyFunctionIdentify') return map.get(HARMONY_ITEM_IDS.FUNCTIONS)?.state === 'retention';
  if (skill === 'harmonyNextChord') return map.get(HARMONY_ITEM_IDS.NEXT_CHORD)?.state === 'retention';
  if (skill === 'harmonyProgressionPlay') return map.get(HARMONY_ITEM_IDS.INDEPENDENT_PLAY)?.state === 'retention';
  return false;
}

export function harmonyCardNotes(): readonly { skill: Skill; note: NoteName }[] {
  return [
    ...HARMONY_FUNCTION_ORDER.map(note => ({ skill: 'harmonyFunctionIdentify' as const, note })),
    { skill: 'harmonyNextChord', note: 'I-V-vi-IV' },
    { skill: 'harmonyProgressionPlay', note: 'C-G/B-Am-F' }
  ];
}
