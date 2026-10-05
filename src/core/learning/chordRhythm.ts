import type { HarmonyChordId } from './harmony';
import type { Skill } from '../fsrs/types';
import type { NoteName } from '../fsrs/types';
import type { ProgressCollectionInput } from './curriculumFlow';
import type { LearningProgressRecord } from './types';

export const CHORD_RHYTHM_BPM = 60;
export const CHORD_RHYTHM_TIME_SIGNATURE = '4/4' as const;
export const CHORD_RHYTHM_SEQUENCE: readonly HarmonyChordId[] = ['C', 'G/B', 'Am', 'F'];
export const CHORD_RHYTHM_TRANSFER_TRIALS = 12;
export const CHORD_RHYTHM_RETRY_TRIALS = 8;
export const CHORD_RHYTHM_REQUIRED_ACCURACY = 0.8;
export const CHORD_RHYTHM_MAX_REMEDIATION = 3;
export const CHORD_RHYTHM_ON_TIME_WINDOW_MS = 140;
export const CHORD_RHYTHM_MISSED_AFTER_MS = 420;

export const CHORD_RHYTHM_ITEM_IDS = {
  PULSE: 'advanced-chord-rhythm:pulse',
  CHANGE: 'advanced-chord-rhythm:change-timing',
  PATTERN: 'advanced-chord-rhythm:rhythm-pattern',
  COMPLETE: 'advanced-chord-rhythm:complete',
  SESSION: 'advanced-chord-rhythm:session'
} as const;

export type ChordRhythmSkill = Extract<Skill, 'chordPulse' | 'chordChangeTiming' | 'chordRhythmPattern'>;
export type TimingBand = 'on_time' | 'early' | 'late' | 'missed';
export type RhythmAssessmentBlock = 'initial' | 'retry';
export type ChordRhythmStep =
  | 'pulseOrientation'
  | 'countingPulse'
  | 'oneChordPerBar'
  | 'changeOnBeatOne'
  | 'fullProgression'
  | 'twoStrikes'
  | 'independentPlay'
  | 'transferAssessment'
  | 'transferResult'
  | 'transferRemediation'
  | 'moduleComplete';

export interface ChordRhythmModuleState {
  step: ChordRhythmStep;
  sequenceIndex: number;
  selectedKeyIds: string[];
  assessment: RhythmAssessmentState;
  activeBeat: number;
  countInValue: number | null;
  expectedOnset: number | null;
  isRunning: boolean;
  attemptIndex: number;
  outcomes: RhythmTimingOutcome[];
  feedbackText: string;
  feedbackTone: 'good' | 'bad' | 'warn' | '';
  lastTimingBand: TimingBand | null;
  lastOutcome: RhythmTimingOutcome | null;
}

export type ChordRhythmAction =
  | { type: 'advanceStage' }
  | { type: 'selectBeat'; beat: number }
  | { type: 'startRun'; expectedOnset: number }
  | { type: 'clockBeat'; beat: number; countInValue?: number | null }
  | { type: 'selectKey'; keyId: string }
  | { type: 'clearSelection' }
  | { type: 'recordOutcome'; outcome: RhythmTimingOutcome; questionInstanceId: string }
  | { type: 'missedOnset' }
  | { type: 'finishCorrective' }
  | { type: 'startRemediation' }
  | { type: 'finishRemediationItem' }
  | { type: 'completeModule' }
  | { type: 'cancel'; reason: string };

export interface RhythmTimingOutcome {
  expectedOnset: number;
  actualOnset: number | null;
  timingDeltaMs: number | null;
  timingBand: TimingBand;
  chordCorrect: boolean;
  correct: boolean;
}

export interface RhythmAssessmentTrial {
  index: number;
  skill: ChordRhythmSkill;
  chordId: HarmonyChordId;
  beatsPerChord: 1 | 2;
  expectedBeatIndexes: readonly number[];
  coverageTag: 'pulse' | 'change' | 'pattern';
}

export interface RhythmAssessmentState {
  blockKind: RhythmAssessmentBlock;
  phase: 'active' | 'result' | 'remediation' | 'passed' | 'failed';
  trialIndex: number;
  trialsCompleted: number;
  correctFirstAttempts: number;
  failedTrialIndexes: number[];
  remediationTrialIndexes: number[];
  remediationIndex: number;
  remediationUsed: number;
  pendingCorrective: boolean;
  scoredQuestionIds: string[];
}

export function classifyRhythmTiming(
  expectedOnset: number,
  actualOnset: number | null,
  chordCorrect: boolean,
  options: { onTimeWindowMs?: number; missedAfterMs?: number } = {}
): RhythmTimingOutcome {
  const onTimeWindowMs = options.onTimeWindowMs ?? CHORD_RHYTHM_ON_TIME_WINDOW_MS;
  const missedAfterMs = options.missedAfterMs ?? CHORD_RHYTHM_MISSED_AFTER_MS;
  const delta = actualOnset === null ? null : actualOnset - expectedOnset;
  const timingBand: TimingBand = delta === null || delta > missedAfterMs
    ? 'missed'
    : delta < -onTimeWindowMs
      ? 'early'
      : delta > onTimeWindowMs
        ? 'late'
        : 'on_time';
  return {
    expectedOnset,
    actualOnset,
    timingDeltaMs: delta === null ? null : Math.round(delta),
    timingBand,
    chordCorrect,
    correct: chordCorrect && timingBand === 'on_time'
  };
}

export function createRhythmAssessment(blockKind: RhythmAssessmentBlock = 'initial'): RhythmAssessmentState {
  return {
    blockKind,
    phase: 'active',
    trialIndex: 0,
    trialsCompleted: 0,
    correctFirstAttempts: 0,
    failedTrialIndexes: [],
    remediationTrialIndexes: [],
    remediationIndex: 0,
    remediationUsed: 0,
    pendingCorrective: false,
    scoredQuestionIds: []
  };
}

export function getRhythmAssessmentLength(state: RhythmAssessmentState): number {
  return state.blockKind === 'retry' ? CHORD_RHYTHM_RETRY_TRIALS : CHORD_RHYTHM_TRANSFER_TRIALS;
}

export function getRhythmAssessmentTrial(blockKind: RhythmAssessmentBlock, index: number): RhythmAssessmentTrial {
  const length = blockKind === 'retry' ? CHORD_RHYTHM_RETRY_TRIALS : CHORD_RHYTHM_TRANSFER_TRIALS;
  const safeIndex = ((Math.floor(index) % length) + length) % length;
  const lane = blockKind === 'initial' ? Math.floor(safeIndex / 4) : safeIndex < 2 ? 0 : safeIndex < 5 ? 1 : 2;
  const coverageTag = (['pulse', 'change', 'pattern'] as const)[lane];
  const skill: ChordRhythmSkill = coverageTag === 'pulse'
    ? 'chordPulse'
    : coverageTag === 'change'
      ? 'chordChangeTiming'
      : 'chordRhythmPattern';
  const chordId = CHORD_RHYTHM_SEQUENCE[safeIndex % CHORD_RHYTHM_SEQUENCE.length];
  const beatsPerChord: 1 | 2 = coverageTag === 'pattern' ? 2 : 1;
  return {
    index: safeIndex,
    skill,
    chordId,
    beatsPerChord,
    expectedBeatIndexes: beatsPerChord === 2 ? [0, 2] : [0],
    coverageTag
  };
}

/** Records only the first graded response for a question instance. */
export function recordRhythmAssessmentFirstAttempt(
  state: RhythmAssessmentState,
  params: { questionInstanceId: string; correct: boolean }
): RhythmAssessmentState {
  if (state.phase !== 'active' || state.pendingCorrective || state.scoredQuestionIds.includes(params.questionInstanceId)) return state;
  const nextCompleted = state.trialsCompleted + 1;
  const nextCorrect = state.correctFirstAttempts + Number(params.correct);
  const nextFailed = params.correct ? state.failedTrialIndexes : [...state.failedTrialIndexes, state.trialIndex];
  const next = {
    ...state,
    trialsCompleted: nextCompleted,
    correctFirstAttempts: nextCorrect,
    failedTrialIndexes: nextFailed,
    pendingCorrective: !params.correct,
    scoredQuestionIds: [...state.scoredQuestionIds, params.questionInstanceId]
  };
  if (params.correct) return advanceRhythmAssessmentTrial(next);
  return next;
}

/** A corrective run advances the current item without adding a second score or FSRS event. */
export function finishRhythmCorrectiveRun(state: RhythmAssessmentState): RhythmAssessmentState {
  return state.pendingCorrective ? advanceRhythmAssessmentTrial({ ...state, pendingCorrective: false }) : state;
}

function advanceRhythmAssessmentTrial(state: RhythmAssessmentState): RhythmAssessmentState {
  const nextIndex = state.trialIndex + 1;
  if (nextIndex < getRhythmAssessmentLength(state)) return { ...state, trialIndex: nextIndex };
  const passed = state.correctFirstAttempts / getRhythmAssessmentLength(state) >= CHORD_RHYTHM_REQUIRED_ACCURACY;
  return { ...state, phase: passed ? 'passed' : 'result' };
}

export function startRhythmRemediation(state: RhythmAssessmentState): RhythmAssessmentState {
  if (state.phase !== 'result' || state.remediationUsed >= CHORD_RHYTHM_MAX_REMEDIATION) {
    return { ...state, phase: state.blockKind === 'retry' ? 'failed' : state.phase };
  }
  const selected = state.failedTrialIndexes.slice(0, CHORD_RHYTHM_MAX_REMEDIATION);
  if (!selected.length) return state;
  return {
    ...state,
    phase: 'remediation',
    remediationTrialIndexes: selected,
    remediationIndex: 0,
    remediationUsed: state.remediationUsed + 1,
    pendingCorrective: false
  };
}

export function finishRhythmRemediation(state: RhythmAssessmentState): RhythmAssessmentState {
  if (state.phase !== 'remediation') return state;
  const nextIndex = state.remediationIndex + 1;
  return nextIndex < state.remediationTrialIndexes.length
    ? { ...state, remediationIndex: nextIndex }
    : { ...createRhythmAssessment('retry'), remediationUsed: state.remediationUsed };
}

export function rhythmTargetChordIndex(state: RhythmAssessmentState): number {
  if (state.phase === 'remediation') return state.remediationTrialIndexes[state.remediationIndex] ?? 0;
  return state.trialIndex;
}

const TEACHING_STEPS: readonly ChordRhythmStep[] = [
  'pulseOrientation', 'countingPulse', 'oneChordPerBar', 'changeOnBeatOne',
  'fullProgression', 'twoStrikes', 'independentPlay'
];

export function createChordRhythmModuleState(progress?: ProgressCollectionInput): ChordRhythmModuleState {
  const record = normalizeRhythmProgress(progress).get(CHORD_RHYTHM_ITEM_IDS.SESSION);
  const snapshot = record?.chordRhythmSnapshot;
  const knownSteps: readonly ChordRhythmStep[] = [
    ...TEACHING_STEPS, 'transferAssessment', 'transferResult', 'transferRemediation', 'moduleComplete'
  ];
  const step = snapshot && knownSteps.includes(snapshot.stage as ChordRhythmStep)
    ? snapshot.stage as ChordRhythmStep
    : 'pulseOrientation';
  const saved = snapshot?.assessment;
  const assessment = saved
    ? { ...createRhythmAssessment(saved.blockKind), ...saved, phase: saved.phase as RhythmAssessmentState['phase'], scoredQuestionIds: [] }
    : createRhythmAssessment();
  if (normalizeRhythmProgress(progress).get(CHORD_RHYTHM_ITEM_IDS.COMPLETE)?.state === 'retention') {
    return {
      step: 'moduleComplete', sequenceIndex: 0, selectedKeyIds: [], assessment,
      activeBeat: -1, countInValue: null, expectedOnset: null, isRunning: false, attemptIndex: 0,
      outcomes: [], feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null
    };
  }
  return {
    step,
    sequenceIndex: Math.max(0, record?.chordRhythmSnapshot ? Number((record.chordRhythmSnapshot as any).sequenceIndex ?? 0) : 0),
    selectedKeyIds: [], assessment,
    activeBeat: -1, countInValue: null, expectedOnset: null, isRunning: false, attemptIndex: 0,
    outcomes: [], feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null
  };
}

export function reduceChordRhythmState(
  state: ChordRhythmModuleState,
  action: ChordRhythmAction
): ChordRhythmModuleState {
  switch (action.type) {
    case 'advanceStage': {
      const at = TEACHING_STEPS.indexOf(state.step);
      const next = TEACHING_STEPS[at + 1];
      if (state.step === 'independentPlay') return { ...state, step: 'transferAssessment', assessment: createRhythmAssessment(), sequenceIndex: 0, feedbackText: '', feedbackTone: '' };
      if (!next) return state;
      return { ...state, step: next, sequenceIndex: 0, selectedKeyIds: [], activeBeat: -1, expectedOnset: null, isRunning: false, outcomes: [], attemptIndex: 0, feedbackText: '', feedbackTone: '', lastTimingBand: null };
    }
    case 'selectBeat': return { ...state, activeBeat: action.beat };
    case 'startRun': return { ...state, isRunning: true, activeBeat: -1, countInValue: 4, expectedOnset: action.expectedOnset, attemptIndex: 0, outcomes: [], feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null };
    case 'clockBeat': return { ...state, activeBeat: action.beat, countInValue: action.countInValue ?? null };
    case 'selectKey': {
      if (state.selectedKeyIds.includes(action.keyId)) return { ...state, selectedKeyIds: state.selectedKeyIds.filter(id => id !== action.keyId) };
      if (state.selectedKeyIds.length >= 3) return state;
      return { ...state, selectedKeyIds: [...state.selectedKeyIds, action.keyId] };
    }
    case 'clearSelection': return { ...state, selectedKeyIds: [] };
    case 'recordOutcome': {
      const outcomes = [...state.outcomes, action.outcome];
      const last = action.outcome;
      const strikeCount = rhythmStrikeCount(state);
      const success = last.correct && outcomes.length >= strikeCount;
      const failed = !last.correct;
      if (state.step === 'transferAssessment') {
        if (state.assessment.pendingCorrective) {
          if (failed) return { ...state, outcomes, isRunning: false, selectedKeyIds: [], feedbackText: rhythmFeedback(last), feedbackTone: 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
          if (success) {
            const assessment = finishRhythmCorrectiveRun(state.assessment);
            return { ...state, assessment, step: assessment.phase === 'active' ? state.step : 'transferResult', outcomes: [], isRunning: false, attemptIndex: 0, selectedKeyIds: [], feedbackText: `✓ Исправлено. ${timingBandLabel(last.timingBand)}.`, feedbackTone: 'good', lastTimingBand: last.timingBand, lastOutcome: last };
          }
          return { ...state, outcomes, attemptIndex: outcomes.length, selectedKeyIds: [], expectedOnset: null, feedbackText: rhythmFeedback(last), feedbackTone: 'warn', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        if (failed) {
          const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, { questionInstanceId: action.questionInstanceId, correct: false });
          return { ...state, assessment, outcomes, isRunning: false, attemptIndex: 0, selectedKeyIds: [], feedbackText: rhythmFeedback(last), feedbackTone: 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        if (success) {
          const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, { questionInstanceId: action.questionInstanceId, correct: true });
          const complete = assessment.phase === 'passed';
          return { ...state, assessment, step: complete ? 'transferResult' : assessment.phase === 'result' ? 'transferResult' : state.step, outcomes: [], isRunning: false, selectedKeyIds: [], sequenceIndex: 0, feedbackText: `✓ Аккорд верный · ${timingBandLabel(last.timingBand)}.`, feedbackTone: 'good', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        return { ...state, outcomes, attemptIndex: outcomes.length, selectedKeyIds: [], expectedOnset: null, feedbackText: rhythmFeedback(last), feedbackTone: last.correct ? 'warn' : 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
      }
      return {
        ...state,
        outcomes: success ? [] : outcomes,
        attemptIndex: success ? 0 : outcomes.length,
        isRunning: !failed && !success,
        selectedKeyIds: [],
        expectedOnset: null,
        sequenceIndex: success && (state.step === 'fullProgression' || state.step === 'independentPlay') ? state.sequenceIndex + 1 : state.sequenceIndex,
        feedbackText: rhythmFeedback(last),
        feedbackTone: failed ? 'bad' : success ? 'good' : 'warn',
        lastTimingBand: last.timingBand,
        lastOutcome: last
      };
    }
    case 'missedOnset': {
      const outcome = classifyRhythmTiming(state.expectedOnset ?? 0, null, false);
      if (state.step === 'transferAssessment') {
        const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, {
          questionInstanceId: `missed:${state.assessment.blockKind}:${state.assessment.trialIndex}`,
          correct: false
        });
        return { ...state, assessment, isRunning: false, feedbackText: rhythmFeedback(outcome), feedbackTone: 'bad', lastTimingBand: 'missed', lastOutcome: outcome };
      }
      return { ...state, isRunning: false, feedbackText: rhythmFeedback(outcome), feedbackTone: 'bad', lastTimingBand: 'missed', lastOutcome: outcome };
    }
    case 'finishCorrective': {
      const assessment = finishRhythmCorrectiveRun(state.assessment);
      const isDone = assessment.phase === 'result' || assessment.phase === 'passed';
      return { ...state, assessment, step: isDone ? 'transferResult' : state.step, outcomes: [], attemptIndex: 0, isRunning: false, selectedKeyIds: [], feedbackText: '', feedbackTone: '', expectedOnset: null };
    }
    case 'startRemediation': {
      const assessment = startRhythmRemediation(state.assessment);
      if (assessment.phase === 'failed') return { ...state, assessment, step: 'transferResult', feedbackText: 'Проверка пока не пройдена. Повторите учебные этапы и попробуйте позже.', feedbackTone: 'warn' };
      return { ...state, step: 'transferRemediation', assessment, outcomes: [], isRunning: false, selectedKeyIds: [], feedbackText: '', feedbackTone: '' };
    }
    case 'finishRemediationItem': {
      const assessment = finishRhythmRemediation(state.assessment);
      const done = assessment.blockKind === 'retry' && assessment.phase === 'active';
      return { ...state, assessment, step: done ? 'transferAssessment' : state.step, outcomes: [], isRunning: false, selectedKeyIds: [], feedbackText: '', feedbackTone: '' };
    }
    case 'completeModule': return { ...state, step: 'moduleComplete', isRunning: false, feedbackText: 'Модуль завершён. Навыки ритма добавлены в ежедневную практику.', feedbackTone: 'good' };
    case 'cancel': return { ...state, isRunning: false, activeBeat: -1, countInValue: null, expectedOnset: null, selectedKeyIds: [], feedbackText: `Упражнение приостановлено: ${action.reason}. Ошибка не засчитана. Начните заново с отсчётом 4 · 3 · 2 · 1.`, feedbackTone: 'warn' };
  }
}

export function currentRhythmTrial(state: ChordRhythmModuleState): RhythmAssessmentTrial {
  if (state.step === 'transferRemediation') {
    return getRhythmAssessmentTrial(state.assessment.blockKind, rhythmTargetChordIndex(state.assessment));
  }
  return getRhythmAssessmentTrial(state.assessment.blockKind, state.assessment.trialIndex);
}

export function rhythmStrikeCount(state: ChordRhythmModuleState): number {
  if (state.step === 'twoStrikes') return 2;
  if (state.step === 'transferAssessment' || state.step === 'transferRemediation') return currentRhythmTrial(state).expectedBeatIndexes.length;
  return 1;
}

export function rhythmFeedback(outcome: RhythmTimingOutcome): string {
  if (outcome.timingBand === 'missed') return 'Пропущена доля. Снова приготовьте аккорд и начните с нового отсчёта.';
  const pitch = outcome.chordCorrect ? 'Аккорд верный.' : 'Аккорд неверный.';
  return `${pitch} ${timingBandLabel(outcome.timingBand)}.`;
}

export function timingBandLabel(band: TimingBand): string {
  return band === 'on_time' ? 'Точно' : band === 'early' ? 'Рано' : band === 'late' ? 'Поздно' : 'Пропущена доля';
}

export function chordRhythmCardNotes(): readonly { skill: ChordRhythmSkill; note: NoteName }[] {
  return [
    { skill: 'chordPulse', note: 'pulse' },
    { skill: 'chordChangeTiming', note: 'change-timing' },
    { skill: 'chordRhythmPattern', note: 'rhythm-pattern' }
  ];
}

export function chordRhythmCardGateSatisfied(
  skill: Skill,
  _note: NoteName,
  progress?: ProgressCollectionInput
): boolean {
  const map = normalizeRhythmProgress(progress);
  if (map.get(CHORD_RHYTHM_ITEM_IDS.COMPLETE)?.state === 'retention') return true;
  const progressId = skill === 'chordPulse'
    ? CHORD_RHYTHM_ITEM_IDS.PULSE
    : skill === 'chordChangeTiming'
      ? CHORD_RHYTHM_ITEM_IDS.CHANGE
      : skill === 'chordRhythmPattern'
        ? CHORD_RHYTHM_ITEM_IDS.PATTERN
        : null;
  return Boolean(progressId && map.get(progressId)?.state === 'retention');
}

export function getChordRhythmModuleStatus(
  progress?: ProgressCollectionInput
): 'not_started' | 'in_progress' | 'completed' {
  const map = normalizeRhythmProgress(progress);
  if (map.get(CHORD_RHYTHM_ITEM_IDS.COMPLETE)?.state === 'retention') return 'completed';
  return Object.values(CHORD_RHYTHM_ITEM_IDS)
    .filter(id => id !== CHORD_RHYTHM_ITEM_IDS.SESSION)
    .some(id => map.get(id)?.state && map.get(id)?.state !== 'unseen')
    ? 'in_progress'
    : 'not_started';
}

function normalizeRhythmProgress(input?: ProgressCollectionInput): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) return new Map(input.filter(record => record && typeof record.id === 'string').map(record => [record.id, record]));
  return new Map(Object.entries(input as Record<string, LearningProgressRecord>));
}
