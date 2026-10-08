import type { NoteName } from '../fsrs/types';
import type { TwoHandModuleSnapshot } from './types';
import { HARMONY_CHORDS, type HarmonyChordId } from './harmony';

export const TWO_HAND_BPM = 60;
export const TWO_HAND_TIME_SIGNATURE = '4/4';
export const TWO_HAND_SEQUENCE: readonly HarmonyChordId[] = ['C', 'G/B', 'Am', 'F'];
/** Beginner synchronisation window between the LH bass attack and the RH chord onset. */
export const TWO_HAND_SYNC_WINDOW_MS = 200;
/** Three-finger chord assembly tolerance (max spread between RH note onsets). */
export const TWO_HAND_CHORD_ASSEMBLY_MS = 200;
export const TWO_HAND_ON_TIME_WINDOW_MS = 140;
export const TWO_HAND_ACCEPT_WINDOW_MS = 300;
export const TWO_HAND_ASSESSMENT_TRIALS = 12;
export const TWO_HAND_REQUIRED_ACCURACY = 0.8;
export const TWO_HAND_MAX_REMEDIATION = 3;

export const TWO_HAND_ITEM_IDS = {
  SESSION: 'advanced-two-hand:session',
  COMPLETE: 'advanced-two-hand:complete',
  BASS: 'advanced-two-hand:bass',
  TOGETHER: 'advanced-two-hand:together',
  ALTERNATING: 'advanced-two-hand:alternating'
} as const;

export type TwoHandSkill = 'twoHandBass' | 'twoHandTogether' | 'twoHandAlternating';
export type TwoHandPattern = 'simultaneous' | 'alternating';
export type TwoHandStage =
  | 'handOrientation'
  | 'leftHand'
  | 'rightHand'
  | 'simultaneous'
  | 'alternating'
  | 'fourBar'
  | 'independent'
  | 'transferAssessment'
  | 'transferResult'
  | 'transferRemediation'
  | 'moduleComplete';

export type TwoHandAssessmentPhase = 'active' | 'result' | 'remediation' | 'passed' | 'failed';

export interface TwoHandVoicing {
  chordId: HarmonyChordId;
  symbol: string;
  bassKeyId: string;
  triadKeyIds: readonly [string, string, string];
}

function shiftKeyIdOctave(keyId: string, delta: number): string {
  const match = keyId.match(/^([A-G]#?)(-?\d)$/);
  if (!match) return keyId;
  return `${match[1]}${Number(match[2]) + delta}`;
}

/**
 * Canonical two-hand voicing: the left hand plays the chord's canonical bass an octave
 * lower (G/B → B2), the right hand keeps the accepted Harmony triad exactly as defined.
 */
export function twoHandVoicing(chordId: HarmonyChordId): TwoHandVoicing {
  const chord = HARMONY_CHORDS[chordId];
  return {
    chordId,
    symbol: chord.symbol,
    bassKeyId: shiftKeyIdOctave(chord.bassKeyId, -1),
    triadKeyIds: chord.keyIds
  };
}

export const TWO_HAND_VOICINGS: Readonly<Record<HarmonyChordId, TwoHandVoicing>> = Object.fromEntries(
  TWO_HAND_SEQUENCE.map(chordId => [chordId, twoHandVoicing(chordId)])
) as Record<HarmonyChordId, TwoHandVoicing>;

export interface TwoHandStageProgress {
  leftIndex: number;
  rightIndex: number;
  simultaneousIndex: number;
  alternatingIndex: number;
  barsPassed: number;
  independentPassed: boolean;
}

export interface TwoHandAssessmentState {
  blockKind: 'initial' | 'retry';
  phase: TwoHandAssessmentPhase;
  trialIndex: number;
  trialsCompleted: number;
  correctFirstAttempts: number;
  failedTrialIndexes: number[];
  remediationTrialIndexes: number[];
  remediationIndex: number;
  remediationUsed: number;
  pendingCorrective: boolean;
}

export interface TwoHandModuleState {
  stage: TwoHandStage;
  chordIndex: number;
  progress: TwoHandStageProgress;
  selectedKeyIds: string[];
  awaitingCorrective: boolean;
  trialHadWrong: boolean;
  remediationCorrected: boolean;
  isRunning: boolean;
  countInValue: number | null;
  activeBeat: number;
  playCue: boolean;
  expectedOnset: number | null;
  feedbackText: string;
  feedbackTone: 'good' | 'warn' | 'bad' | '';
  assessment: TwoHandAssessmentState;
}

export type TwoHandAction =
  | { type: 'continueStage' }
  | { type: 'selectKey'; keyId: string }
  | { type: 'clearSelection' }
  | { type: 'guidedResult'; correct: boolean; octaveMismatch?: boolean }
  | { type: 'startRun' }
  | { type: 'clockBeat'; beat: number; countInValue: number | null; chordIndex?: number }
  | { type: 'cancel' }
  | { type: 'inputInterrupted' }
  | { type: 'gradeAttempt'; result: TwoHandAttemptResult }
  | { type: 'advance' }
  | { type: 'startRemediation' }
  | { type: 'retryAssessment' }
  | { type: 'completeModule' };

export interface TwoHandAssessmentSnapshot {
  blockKind: 'initial' | 'retry';
  phase: TwoHandAssessmentPhase;
  trialIndex: number;
  trialsCompleted: number;
  correctFirstAttempts: number;
  failedTrialIndexes: number[];
  remediationTrialIndexes: number[];
  remediationIndex: number;
  remediationUsed: number;
  pendingCorrective: boolean;
}

export interface TwoHandTrial {
  index: number;
  kind: TwoHandPattern;
  chordId: HarmonyChordId;
  coverageTag: 'bass' | 'chord' | 'together' | 'alternating' | 'transition';
}

const ASSESSMENT_PLAN: readonly { kind: TwoHandPattern; chordId: HarmonyChordId; coverageTag: TwoHandTrial['coverageTag'] }[] = [
  { kind: 'simultaneous', chordId: 'C', coverageTag: 'together' },
  { kind: 'alternating', chordId: 'G/B', coverageTag: 'alternating' },
  { kind: 'simultaneous', chordId: 'Am', coverageTag: 'together' },
  { kind: 'alternating', chordId: 'F', coverageTag: 'alternating' },
  { kind: 'alternating', chordId: 'C', coverageTag: 'transition' },
  { kind: 'simultaneous', chordId: 'G/B', coverageTag: 'bass' },
  { kind: 'simultaneous', chordId: 'F', coverageTag: 'chord' },
  { kind: 'alternating', chordId: 'Am', coverageTag: 'transition' },
  { kind: 'simultaneous', chordId: 'C', coverageTag: 'together' },
  { kind: 'alternating', chordId: 'F', coverageTag: 'bass' },
  { kind: 'simultaneous', chordId: 'G/B', coverageTag: 'chord' },
  { kind: 'alternating', chordId: 'Am', coverageTag: 'alternating' }
];

export function twoHandAssessmentTrial(index: number): TwoHandTrial {
  const plan = ASSESSMENT_PLAN[((index % ASSESSMENT_PLAN.length) + ASSESSMENT_PLAN.length) % ASSESSMENT_PLAN.length];
  return { index, kind: plan.kind, chordId: plan.chordId, coverageTag: plan.coverageTag };
}

function freshAssessment(blockKind: 'initial' | 'retry'): TwoHandAssessmentState {
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
    pendingCorrective: false
  };
}

export function createTwoHandModuleState(progress?: ReadonlyMap<string, { state?: string; twoHandSnapshot?: TwoHandModuleSnapshot }> | null): TwoHandModuleState {
  const base: TwoHandModuleState = {
    stage: 'handOrientation',
    chordIndex: 0,
    progress: { leftIndex: 0, rightIndex: 0, simultaneousIndex: 0, alternatingIndex: 0, barsPassed: 0, independentPassed: false },
    selectedKeyIds: [],
    awaitingCorrective: false,
    trialHadWrong: false,
    remediationCorrected: false,
    isRunning: false,
    countInValue: null,
    activeBeat: 0,
    playCue: false,
    expectedOnset: null,
    feedbackText: '',
    feedbackTone: '',
    assessment: freshAssessment('initial')
  };
  const snapshot = progress?.get(TWO_HAND_ITEM_IDS.SESSION)?.twoHandSnapshot;
  if (!snapshot) return base;
  const stage = snapshot.stage as TwoHandStage | undefined;
  if (stage === 'moduleComplete') return { ...base, stage: 'moduleComplete', assessment: { ...base.assessment, phase: 'passed', trialsCompleted: TWO_HAND_ASSESSMENT_TRIALS, correctFirstAttempts: TWO_HAND_ASSESSMENT_TRIALS } };
  const assessment: TwoHandAssessmentState = {
    ...base.assessment,
    blockKind: snapshot.assessment?.blockKind === 'retry' ? 'retry' : 'initial',
    phase: (snapshot.assessment?.phase as TwoHandAssessmentPhase) ?? 'active',
    trialIndex: Number.isInteger(snapshot.assessment?.trialIndex) ? snapshot.assessment!.trialIndex : 0,
    trialsCompleted: Number.isInteger(snapshot.assessment?.trialsCompleted) ? snapshot.assessment!.trialsCompleted : 0,
    correctFirstAttempts: Number.isInteger(snapshot.assessment?.correctFirstAttempts) ? snapshot.assessment!.correctFirstAttempts : 0,
    failedTrialIndexes: Array.isArray(snapshot.assessment?.failedTrialIndexes) ? [...snapshot.assessment!.failedTrialIndexes] : [],
    remediationTrialIndexes: Array.isArray(snapshot.assessment?.remediationTrialIndexes) ? [...snapshot.assessment!.remediationTrialIndexes] : [],
    remediationIndex: Number.isInteger(snapshot.assessment?.remediationIndex) ? snapshot.assessment!.remediationIndex : 0,
    remediationUsed: Number.isInteger(snapshot.assessment?.remediationUsed) ? snapshot.assessment!.remediationUsed : 0,
    pendingCorrective: Boolean(snapshot.assessment?.pendingCorrective)
  };
  return {
    ...base,
    stage: stage && stage !== 'transferAssessment' && stage !== 'transferRemediation' ? stage : (assessment.phase === 'remediation' ? 'transferRemediation' : assessment.phase === 'passed' || assessment.phase === 'failed' ? 'transferResult' : 'transferAssessment'),
    chordIndex: Number.isInteger(snapshot.chordIndex) ? snapshot.chordIndex : 0,
    progress: {
      leftIndex: Number.isInteger(snapshot.leftIndex) ? snapshot.leftIndex : 0,
      rightIndex: Number.isInteger(snapshot.rightIndex) ? snapshot.rightIndex : 0,
      simultaneousIndex: Number.isInteger(snapshot.simultaneousIndex) ? snapshot.simultaneousIndex : 0,
      alternatingIndex: Number.isInteger(snapshot.alternatingIndex) ? snapshot.alternatingIndex : 0,
      barsPassed: Number.isInteger(snapshot.barsPassed) ? snapshot.barsPassed : 0,
      independentPassed: Boolean(snapshot.independentPassed)
    },
    assessment,
    awaitingCorrective: Boolean(snapshot.awaitingCorrective),
    trialHadWrong: Boolean(snapshot.trialHadWrong)
  };
}

export function twoHandSnapshotFor(state: TwoHandModuleState): TwoHandModuleSnapshot {
  return {
    stage: state.stage,
    chordIndex: state.chordIndex,
    leftIndex: state.progress.leftIndex,
    rightIndex: state.progress.rightIndex,
    simultaneousIndex: state.progress.simultaneousIndex,
    alternatingIndex: state.progress.alternatingIndex,
    barsPassed: state.progress.barsPassed,
    independentPassed: state.progress.independentPassed,
    awaitingCorrective: state.awaitingCorrective,
    trialHadWrong: state.trialHadWrong,
    assessment: {
      blockKind: state.assessment.blockKind,
      phase: state.assessment.phase,
      trialIndex: state.assessment.trialIndex,
      trialsCompleted: state.assessment.trialsCompleted,
      correctFirstAttempts: state.assessment.correctFirstAttempts,
      failedTrialIndexes: [...state.assessment.failedTrialIndexes],
      remediationTrialIndexes: [...state.assessment.remediationTrialIndexes],
      remediationIndex: state.assessment.remediationIndex,
      remediationUsed: state.assessment.remediationUsed,
      pendingCorrective: state.assessment.pendingCorrective
    }
  };
}

export function normalizeTwoHandSnapshot(value: unknown): TwoHandModuleSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const stage = typeof raw.stage === 'string' ? raw.stage : 'handOrientation';
  const int = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);
  const assessmentRaw = raw.assessment && typeof raw.assessment === 'object' ? raw.assessment as Record<string, unknown> : {};
  const phases: TwoHandAssessmentPhase[] = ['active', 'result', 'remediation', 'passed', 'failed'];
  return {
    stage,
    chordIndex: int(raw.chordIndex),
    leftIndex: int(raw.leftIndex),
    rightIndex: int(raw.rightIndex),
    simultaneousIndex: int(raw.simultaneousIndex),
    alternatingIndex: int(raw.alternatingIndex),
    barsPassed: int(raw.barsPassed),
    independentPassed: Boolean(raw.independentPassed),
    awaitingCorrective: Boolean(raw.awaitingCorrective),
    trialHadWrong: Boolean(raw.trialHadWrong),
    assessment: {
      blockKind: assessmentRaw.blockKind === 'retry' ? 'retry' : 'initial',
      phase: phases.includes(assessmentRaw.phase as TwoHandAssessmentPhase) ? assessmentRaw.phase as TwoHandAssessmentPhase : 'active',
      trialIndex: int(assessmentRaw.trialIndex),
      trialsCompleted: int(assessmentRaw.trialsCompleted),
      correctFirstAttempts: int(assessmentRaw.correctFirstAttempts),
      failedTrialIndexes: Array.isArray(assessmentRaw.failedTrialIndexes) ? (assessmentRaw.failedTrialIndexes as unknown[]).filter(v => typeof v === 'number') as number[] : [],
      remediationTrialIndexes: Array.isArray(assessmentRaw.remediationTrialIndexes) ? (assessmentRaw.remediationTrialIndexes as unknown[]).filter(v => typeof v === 'number') as number[] : [],
      remediationIndex: int(assessmentRaw.remediationIndex),
      remediationUsed: int(assessmentRaw.remediationUsed),
      pendingCorrective: Boolean(assessmentRaw.pendingCorrective)
    }
  };
}

export function twoHandSkillForPattern(pattern: TwoHandPattern): TwoHandSkill {
  return pattern === 'simultaneous' ? 'twoHandTogether' : 'twoHandAlternating';
}

export function twoHandTargetChord(state: TwoHandModuleState): HarmonyChordId {
  if (state.stage === 'transferAssessment' || state.stage === 'transferResult' || state.stage === 'transferRemediation') {
    return twoHandAssessmentTrial(state.assessment.trialIndex).chordId;
  }
  if (state.stage === 'leftHand') return TWO_HAND_SEQUENCE[state.progress.leftIndex] ?? 'C';
  if (state.stage === 'rightHand') return TWO_HAND_SEQUENCE[state.progress.rightIndex] ?? 'C';
  if (state.stage === 'simultaneous') return TWO_HAND_SEQUENCE[state.progress.simultaneousIndex] ?? 'C';
  if (state.stage === 'alternating') return TWO_HAND_SEQUENCE[state.progress.alternatingIndex] ?? 'C';
  if (state.stage === 'fourBar' || state.stage === 'independent') return TWO_HAND_SEQUENCE[state.chordIndex] ?? 'C';
  return TWO_HAND_SEQUENCE[0];
}

export function twoHandPattern(state: TwoHandModuleState): TwoHandPattern {
  if (state.stage === 'simultaneous') return 'simultaneous';
  if (state.stage === 'transferAssessment' || state.stage === 'transferRemediation') return twoHandAssessmentTrial(state.assessment.trialIndex).kind;
  return 'alternating';
}

export function twoHandTargetBeats(state: TwoHandModuleState): number[] {
  if (!state.isRunning) return [];
  if (state.stage === 'simultaneous') return [0];
  if (state.stage === 'transferAssessment' || state.stage === 'transferRemediation') {
    return twoHandPattern(state) === 'simultaneous' ? [0] : [0, 2];
  }
  return [0, 2];
}

export interface TwoHandCaptureNote {
  keyId: string;
  midi: number;
  at: number;
}

export interface TwoHandAttemptInput {
  chordId: HarmonyChordId;
  pattern: TwoHandPattern;
  bass: TwoHandCaptureNote | null;
  chordNotes: readonly TwoHandCaptureNote[];
  bassTargetOnset: number | null;
  chordTargetOnset: number | null;
}

export type TwoHandOutcome =
  | 'correct'
  | 'wrong_bass'
  | 'wrong_bass_octave'
  | 'wrong_chord'
  | 'incomplete_chord'
  | 'extra_note'
  | 'missing_left'
  | 'missing_right'
  | 'both_correct_poor_sync'
  | 'timing_failed';

export interface TwoHandAttemptResult {
  outcome: TwoHandOutcome;
  correct: boolean;
  bassCorrect: boolean;
  chordCorrect: boolean;
  syncMs: number | null;
  timing: 'on_time' | 'early' | 'late' | 'too_early' | 'missed' | null;
  feedbackText: string;
}

export function twoHandTimingBand(onset: number, target: number): { band: 'on_time' | 'early' | 'late' | 'too_early' | 'missed'; accepted: boolean; deltaMs: number } {
  const deltaMs = onset - target;
  const abs = Math.abs(deltaMs);
  if (abs <= TWO_HAND_ON_TIME_WINDOW_MS) return { band: 'on_time', accepted: true, deltaMs };
  if (deltaMs < 0) {
    return abs <= TWO_HAND_ACCEPT_WINDOW_MS
      ? { band: 'early', accepted: true, deltaMs }
      : { band: 'too_early', accepted: false, deltaMs };
  }
  return abs <= TWO_HAND_ACCEPT_WINDOW_MS
    ? { band: 'late', accepted: true, deltaMs }
    : { band: 'missed', accepted: false, deltaMs };
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const a = [...actual].sort();
  const b = [...expected].sort();
  return a.every((value, index) => value === b[index]);
}

function pitchClass(keyId: string): string {
  return keyId.replace(/\d/g, '');
}

export interface TwoHandCaptureClassification {
  bass: TwoHandCaptureNote | null;
  chordNotes: TwoHandCaptureNote[];
}

/**
 * Classifies raw captured note-ons into a left-hand bass candidate and right-hand
 * chord notes without losing musically meaningful errors:
 * - the exact bass wins;
 * - a wrong octave of the bass pitch class is kept as the bass so it can be classified;
 * - any other non-triad note played near the bass target is kept as the bass candidate
 *   (so "wrong bass" is not reported as "left hand did not play");
 * - remaining non-triad notes stay in the chord list so extra notes are detectable.
 */
export function classifyTwoHandCapture(
  chordId: HarmonyChordId,
  notes: readonly TwoHandCaptureNote[],
  options: { bassTargetOnset?: number | null } = {}
): TwoHandCaptureClassification {
  const voicing = TWO_HAND_VOICINGS[chordId];
  const triadSet = new Set<string>(voicing.triadKeyIds);
  const bassPitchClass = pitchClass(voicing.bassKeyId);
  const exactBass = notes.find(note => note.keyId === voicing.bassKeyId) ?? null;
  const octaveCandidate = notes.find(note => note.keyId !== voicing.bassKeyId && !triadSet.has(note.keyId) && pitchClass(note.keyId) === bassPitchClass) ?? null;
  const otherCandidates = notes.filter(note =>
    !triadSet.has(note.keyId) &&
    note.keyId !== voicing.bassKeyId &&
    pitchClass(note.keyId) !== bassPitchClass
  );
  const target = options.bassTargetOnset ?? null;
  const nearestToTarget = [...otherCandidates].sort((left, right) => {
    if (target != null) return Math.abs(left.at - target) - Math.abs(right.at - target);
    return left.midi - right.midi;
  })[0] ?? null;
  const bass = exactBass ?? octaveCandidate ?? nearestToTarget;
  const chordNotes = notes.filter(note => triadSet.has(note.keyId));
  const extraNotes = notes.filter(note => !triadSet.has(note.keyId) && note !== bass && !(bass !== null && note.keyId === bass.keyId));
  return { bass, chordNotes: [...chordNotes, ...extraNotes] };
}

export function evaluateTwoHandAttempt(input: TwoHandAttemptInput): TwoHandAttemptResult {
  const voicing = TWO_HAND_VOICINGS[input.chordId];
  const chordKeyIds = input.chordNotes.map(note => note.keyId);

  const bassCorrect = input.bass !== null && input.bass.keyId === voicing.bassKeyId;
  const bassOctaveMismatch = input.bass !== null && !bassCorrect && pitchClass(input.bass.keyId) === pitchClass(voicing.bassKeyId);
  const chordCorrect = sameSet(chordKeyIds, voicing.triadKeyIds);
  const chordHasAllNotes = voicing.triadKeyIds.every(keyId => chordKeyIds.includes(keyId));
  const chordSubset = chordKeyIds.length < 3 && chordKeyIds.every(keyId => voicing.triadKeyIds.includes(keyId));

  let timing: TwoHandAttemptResult['timing'] = null;
  if (input.pattern === 'simultaneous') {
    timing = input.bassTargetOnset != null && input.bass
      ? twoHandTimingBand(input.bass.at, input.bassTargetOnset).band
      : null;
  } else {
    const bassTiming = input.bassTargetOnset != null && input.bass
      ? twoHandTimingBand(input.bass.at, input.bassTargetOnset)
      : null;
    const chordTiming = input.chordTargetOnset != null && input.chordNotes.length
      ? twoHandTimingBand(input.chordNotes[0].at, input.chordTargetOnset)
      : null;
    if (bassTiming && !bassTiming.accepted) timing = bassTiming.band;
    else if (chordTiming && !chordTiming.accepted) timing = chordTiming.band;
    else if (bassTiming && chordTiming) timing = bassTiming.band === 'on_time' && chordTiming.band === 'on_time' ? 'on_time' : (bassTiming.band === 'on_time' ? chordTiming.band : bassTiming.band);
    else timing = bassTiming?.band ?? chordTiming?.band ?? null;
  }

  const chordOnset = input.chordNotes.length ? Math.min(...input.chordNotes.map(note => note.at)) : null;
  const chordSpread = input.chordNotes.length > 1 ? Math.max(...input.chordNotes.map(note => note.at)) - chordOnset! : 0;
  const syncMs = input.pattern === 'simultaneous' && input.bass && chordOnset != null
    ? Math.abs(chordOnset - input.bass.at)
    : null;

  const timingAccepted = timing === null || timing === 'on_time' || timing === 'early' || timing === 'late';

  let outcome: TwoHandOutcome;
  let feedbackText: string;
  if (!input.bass) {
    outcome = 'missing_left';
    feedbackText = 'Левая рука не сыграла бас. На первую долю нажмите басовую ноту левой рукой.';
  } else if (!input.chordNotes.length) {
    outcome = 'missing_right';
    feedbackText = 'Правая рука не сыграла аккорд. Сыграйте три ноты аккорда правой рукой.';
  } else if (bassOctaveMismatch) {
    outcome = 'wrong_bass_octave';
    feedbackText = `Бас верный по ноте, но не та октава: нужна ${voicing.bassKeyId} левой рукой.`;
  } else if (!bassCorrect) {
    outcome = 'wrong_bass';
    feedbackText = `Неверный бас. Нужна ${voicing.bassKeyId} левой рукой.`;
  } else if (chordHasAllNotes && input.chordNotes.length > 3) {
    outcome = 'extra_note';
    feedbackText = 'Все нужные ноты есть, но добавлена лишняя клавиша. Сыграйте ровно три ноты аккорда.';
  } else if (!chordCorrect && chordSubset) {
    const missing = voicing.triadKeyIds.filter(keyId => !chordKeyIds.includes(keyId));
    outcome = 'incomplete_chord';
    feedbackText = `Бас верный. В правой руке не хватает ${missing.join(', ')}.`;
  } else if (!chordCorrect) {
    outcome = 'wrong_chord';
    feedbackText = `Неверный аккорд правой рукой. Нужен ${voicing.symbol}: ${voicing.triadKeyIds.join('–')}.`;
  } else if (chordSpread > TWO_HAND_CHORD_ASSEMBLY_MS) {
    outcome = 'wrong_chord';
    feedbackText = 'Ноты аккорда прозвучали не вместе. Нажмите три клавиши аккорда одновременно.';
  } else if (input.pattern === 'simultaneous' && syncMs != null && syncMs > TWO_HAND_SYNC_WINDOW_MS) {
    outcome = 'both_correct_poor_sync';
    feedbackText = 'Все ноты правильные, но правая рука вступила слишком поздно. Играйте обе руки вместе.';
  } else if (!timingAccepted) {
    outcome = 'timing_failed';
    feedbackText = timing === 'too_early'
      ? 'Слишком рано: дождитесь первой доли.'
      : 'Слишком поздно: не успели на долю.';
  } else {
    outcome = 'correct';
    feedbackText = `Верно: ${voicing.bassKeyId} левой рукой и ${voicing.symbol} правой.`;
  }

  return {
    outcome,
    correct: outcome === 'correct',
    bassCorrect,
    chordCorrect,
    syncMs,
    timing,
    feedbackText
  };
}

function recordTwoHandAttempt(state: TwoHandModuleState, result: TwoHandAttemptResult): TwoHandModuleState {
  const assessment = { ...state.assessment };
  if (assessment.phase === 'remediation') {
    return {
      ...state,
      awaitingCorrective: !result.correct,
      remediationCorrected: result.correct,
      trialHadWrong: result.correct ? state.trialHadWrong : true,
      isRunning: false,
      activeBeat: -1,
      playCue: false,
      expectedOnset: null,
      feedbackText: result.correct
        ? 'Исправлено. Продолжаем короткую коррекцию.'
        : result.feedbackText,
      feedbackTone: result.correct ? 'good' : 'bad'
    };
  }
  const firstAttemptClean = !state.trialHadWrong;
  if (result.correct) {
    if (firstAttemptClean) assessment.correctFirstAttempts += 1;
    else assessment.failedTrialIndexes.push(assessment.trialIndex);
    const passed = assessment.correctFirstAttempts / TWO_HAND_ASSESSMENT_TRIALS >= TWO_HAND_REQUIRED_ACCURACY;
    assessment.trialsCompleted += 1;
    assessment.trialIndex += 1;
    assessment.pendingCorrective = false;
    if (assessment.trialsCompleted >= TWO_HAND_ASSESSMENT_TRIALS) {
      assessment.phase = passed ? 'passed' : 'remediation';
      if (!passed) {
        if (assessment.blockKind === 'retry' && assessment.remediationUsed >= TWO_HAND_MAX_REMEDIATION) {
          assessment.phase = 'failed';
        } else {
          const failed = assessment.failedTrialIndexes.slice(-TWO_HAND_MAX_REMEDIATION);
          assessment.remediationTrialIndexes = failed.length ? failed : Array.from({ length: TWO_HAND_MAX_REMEDIATION }, (_, index) => index);
          assessment.remediationIndex = 0;
          assessment.remediationUsed += 1;
          // The first remediation item must target the actual failed trial position.
          assessment.trialIndex = assessment.remediationTrialIndexes[0] ?? 0;
        }
      }
    }
  } else {
    assessment.pendingCorrective = true;
  }
  const done = assessment.phase === 'passed' || assessment.phase === 'remediation' || assessment.phase === 'failed';
  return {
    ...state,
    assessment,
    awaitingCorrective: !result.correct,
    remediationCorrected: false,
    trialHadWrong: result.correct ? false : true,
    isRunning: false,
    activeBeat: -1,
    playCue: false,
    expectedOnset: null,
    feedbackText: result.feedbackText,
    feedbackTone: result.correct ? 'good' : 'bad',
    stage: done ? (assessment.phase === 'passed' || assessment.phase === 'failed' ? 'transferResult' : 'transferRemediation') : state.stage
  };
}

export function reduceTwoHandState(state: TwoHandModuleState, action: TwoHandAction): TwoHandModuleState {
  switch (action.type) {
    case 'continueStage':
      if (state.stage === 'handOrientation') return { ...state, stage: 'leftHand', feedbackText: '', feedbackTone: '' };
      return state;
    case 'selectKey':
      // Corrective input must stay enabled after a wrong guided attempt; only an
      // active timed run blocks selection. Progress/navigation invariants are guarded
      // by guidedResult (one index increment per accepted correction) and by the
      // awaitingCorrective checks on advance/startRun.
      if (state.isRunning) return state;
      return { ...state, selectedKeyIds: state.selectedKeyIds.includes(action.keyId)
        ? state.selectedKeyIds.filter(keyId => keyId !== action.keyId)
        : [...state.selectedKeyIds, action.keyId].slice(0, 4) };
    case 'clearSelection':
      return { ...state, selectedKeyIds: [] };
    case 'guidedResult': {
      if (action.correct) {
        const progress = { ...state.progress };
        if (state.stage === 'leftHand') {
          progress.leftIndex += 1;
          const done = progress.leftIndex >= TWO_HAND_SEQUENCE.length;
          return {
            ...state,
            progress,
            stage: done ? 'rightHand' : 'leftHand',
            awaitingCorrective: false,
            feedbackText: done ? 'Бас левой рукой готов. Переходим к аккордам правой.' : 'Верно!',
            feedbackTone: 'good'
          };
        }
        if (state.stage === 'rightHand') {
          progress.rightIndex += 1;
          const done = progress.rightIndex >= TWO_HAND_SEQUENCE.length;
          return {
            ...state,
            progress,
            stage: done ? 'simultaneous' : 'rightHand',
            awaitingCorrective: false,
            feedbackText: done ? 'Аккорды правой рукой готовы. Играем двумя руками вместе.' : 'Верно!',
            feedbackTone: 'good'
          };
        }
        return { ...state, awaitingCorrective: false, feedbackText: 'Верно!', feedbackTone: 'good' };
      }
      return {
        ...state,
        awaitingCorrective: true,
        feedbackText: action.octaveMismatch
          ? 'Нота верная, но не та октава. Проверьте регистр левой руки.'
          : 'Пока неверно. Посмотрите подсвеченные клавиши и попробуйте снова.',
        feedbackTone: 'bad'
      };
    }
    case 'startRun':
      return { ...state, isRunning: true, countInValue: 4, activeBeat: -1, playCue: false, expectedOnset: null, awaitingCorrective: false, remediationCorrected: false, selectedKeyIds: [], feedbackText: '', feedbackTone: '' };
    case 'clockBeat':
      return {
        ...state,
        countInValue: action.countInValue,
        activeBeat: action.beat,
        playCue: action.countInValue == null && action.beat === 0,
        chordIndex: action.chordIndex != null ? action.chordIndex : state.chordIndex
      };
    case 'cancel':
      return { ...state, isRunning: false, countInValue: null, activeBeat: -1, playCue: false, expectedOnset: null };
    case 'inputInterrupted':
      return {
        ...state,
        isRunning: false,
        countInValue: null,
        activeBeat: -1,
        playCue: false,
        expectedOnset: null,
        awaitingCorrective: false,
        feedbackText: 'Ввод MIDI прерван: подключите инструмент и начните отсчёт заново. Ответ не засчитан.',
        feedbackTone: 'warn'
      };
    case 'gradeAttempt': {
      if (state.stage === 'fourBar' || state.stage === 'independent') {
        if (!action.result.correct) {
          return { ...state, isRunning: false, activeBeat: -1, playCue: false, expectedOnset: null, awaitingCorrective: true, feedbackText: action.result.feedbackText, feedbackTone: 'bad' };
        }
        const progress = { ...state.progress, barsPassed: state.progress.barsPassed + 1 };
        const chordIndex = (state.chordIndex + 1) % TWO_HAND_SEQUENCE.length;
        if (progress.barsPassed >= TWO_HAND_SEQUENCE.length) {
          if (state.stage === 'independent') {
            const isFreshFirstBlock = state.assessment.phase === 'active' &&
              state.assessment.blockKind === 'initial' &&
              state.assessment.trialsCompleted === 0;
            const assessment = isFreshFirstBlock
              ? state.assessment
              : { ...freshAssessment('retry'), remediationUsed: state.assessment.remediationUsed };
            return { ...state, progress: { ...progress, independentPassed: true }, assessment, stage: 'transferAssessment', chordIndex: 0, isRunning: false, activeBeat: -1, playCue: false, expectedOnset: null, feedbackText: 'Четыре такта сыграны самостоятельно! Переходим к проверке навыка.', feedbackTone: 'good', trialHadWrong: false, awaitingCorrective: false };
          }
          return { ...state, progress: { ...progress, barsPassed: 0 }, stage: 'independent', chordIndex: 0, isRunning: false, activeBeat: -1, playCue: false, expectedOnset: null, feedbackText: 'Четыре такта двумя руками получились! Теперь играем без подсказок.', feedbackTone: 'good', awaitingCorrective: false };
        }
        return { ...state, progress, chordIndex, isRunning: false, activeBeat: -1, playCue: false, expectedOnset: null, feedbackText: `Такт ${state.chordIndex + 1} верно. Следующий: ${TWO_HAND_VOICINGS[TWO_HAND_SEQUENCE[chordIndex]].symbol}`, feedbackTone: 'good', awaitingCorrective: false };
      }
      if (state.stage === 'simultaneous' || state.stage === 'alternating') {
        if (!action.result.correct) {
          return { ...state, isRunning: false, activeBeat: -1, playCue: false, expectedOnset: null, awaitingCorrective: true, feedbackText: action.result.feedbackText, feedbackTone: 'bad' };
        }
        const progress = { ...state.progress };
        const done = state.stage === 'simultaneous'
          ? (progress.simultaneousIndex += 1) >= TWO_HAND_SEQUENCE.length
          : (progress.alternatingIndex += 1) >= TWO_HAND_SEQUENCE.length;
        return {
          ...state,
          progress,
          isRunning: false,
          expectedOnset: null,
          stage: done ? (state.stage === 'simultaneous' ? 'alternating' : 'fourBar') : state.stage,
          awaitingCorrective: false,
          feedbackText: done
            ? state.stage === 'simultaneous'
              ? 'Игра двумя руками вместе готова. Теперь бас на первую долю, аккорд на третью.'
              : 'Смена рук по долям готова. Играем четыре такта подряд.'
            : 'Верно!',
          feedbackTone: 'good'
        };
      }
      if (state.stage === 'transferAssessment' || state.stage === 'transferRemediation') {
        const next = recordTwoHandAttempt(state, action.result);
        return next;
      }
      return state;
    }
    case 'advance': {
      if (state.awaitingCorrective) return state;
      if (state.stage === 'transferRemediation' && !state.remediationCorrected) return state;
      if (state.stage === 'transferRemediation') {
        const assessment = { ...state.assessment };
        assessment.remediationIndex += 1;
        assessment.pendingCorrective = false;
        if (assessment.remediationIndex >= assessment.remediationTrialIndexes.length) {
          return { ...state, assessment: { ...assessment, phase: 'active', blockKind: 'retry', trialIndex: 0, trialsCompleted: 0, correctFirstAttempts: 0, failedTrialIndexes: [], remediationTrialIndexes: [], remediationIndex: 0 }, stage: 'transferAssessment', awaitingCorrective: false, remediationCorrected: false, trialHadWrong: false, feedbackText: 'Короткая коррекция завершена. Новая проверка: 12 заданий.', feedbackTone: '' };
        }
        assessment.trialIndex = assessment.remediationTrialIndexes[assessment.remediationIndex] ?? 0;
        return { ...state, assessment, awaitingCorrective: false, remediationCorrected: false, trialHadWrong: false, feedbackText: 'Следующее задание коррекции.', feedbackTone: '' };
      }
      if (state.stage === 'transferResult') {
        if (state.assessment.phase === 'failed' || (state.assessment.phase === 'remediation' && state.assessment.remediationUsed > TWO_HAND_MAX_REMEDIATION)) {
          return state;
        }
        return state;
      }
      return state;
    }
    case 'startRemediation':
      if (state.stage !== 'transferResult' || state.assessment.phase !== 'remediation') return state;
      return {
        ...state,
        stage: 'transferRemediation',
        assessment: { ...state.assessment, trialIndex: state.assessment.remediationTrialIndexes[0] ?? 0, remediationIndex: 0, pendingCorrective: false },
        awaitingCorrective: false,
        remediationCorrected: false,
        feedbackText: 'Разберите проблемные места и повторите.',
        feedbackTone: ''
      };
    case 'retryAssessment':
      if (state.stage !== 'transferResult') return state;
      if (state.assessment.phase === 'failed') {
        return {
          ...state,
          stage: 'simultaneous',
          progress: { ...state.progress, simultaneousIndex: 0, alternatingIndex: 0, barsPassed: 0, independentPassed: false },
          chordIndex: 0,
          isRunning: false,
          activeBeat: -1,
          playCue: false,
          countInValue: null,
          expectedOnset: null,
          awaitingCorrective: false,
          trialHadWrong: false,
          feedbackText: 'Возвращаемся к учебным шагам: повторите игру двумя руками, затем проверка начнётся заново. История проверки сохранена.',
          feedbackTone: ''
        };
      }
      if (state.assessment.phase !== 'remediation') return state;
      if (state.assessment.blockKind === 'retry' || state.assessment.remediationUsed > TWO_HAND_MAX_REMEDIATION) {
        return { ...state, assessment: { ...state.assessment, phase: 'failed' } };
      }
      return {
        ...state,
        stage: 'transferAssessment',
        assessment: { ...freshAssessment('retry'), remediationUsed: state.assessment.remediationUsed },
        isRunning: false,
        activeBeat: -1,
        playCue: false,
        countInValue: null,
        awaitingCorrective: false,
        trialHadWrong: false,
        feedbackText: 'Новая проверка: 12 заданий.',
        feedbackTone: ''
      };
    case 'completeModule':
      if (state.assessment.phase !== 'passed') return state;
      return { ...state, stage: 'moduleComplete', feedbackText: 'Модуль «Игра двумя руками» завершён.', feedbackTone: 'good' };
    default:
      return state;
  }
}

type TwoHandProgressRow = { state?: string; twoHandSnapshot?: TwoHandModuleSnapshot };

function toTwoHandProgressMap(progress?: unknown): Map<string, TwoHandProgressRow> {
  if (progress instanceof Map) {
    const out = new Map<string, TwoHandProgressRow>();
    for (const [key, value] of progress.entries()) out.set(String(key), value as TwoHandProgressRow);
    return out;
  }
  if (Array.isArray(progress)) {
    return new Map((progress as Array<{ id: string } & TwoHandProgressRow>).map(record => [record.id, record]));
  }
  if (progress && typeof progress === 'object') {
    return new Map(Object.entries(progress as Record<string, TwoHandProgressRow>));
  }
  return new Map();
}

export function getTwoHandModuleStatus(progress?: unknown): 'not_started' | 'in_progress' | 'completed' {
  const map = toTwoHandProgressMap(progress);
  if (map.get(TWO_HAND_ITEM_IDS.COMPLETE)?.state === 'retention') return 'completed';
  const session = map.get(TWO_HAND_ITEM_IDS.SESSION);
  if (session?.twoHandSnapshot) return 'in_progress';
  return 'not_started';
}

export function twoHandCardNotes(): readonly { skill: TwoHandSkill; note: NoteName }[] {
  return [
    { skill: 'twoHandBass', note: 'bass-sequence' },
    { skill: 'twoHandTogether', note: 'together-sequence' },
    { skill: 'twoHandAlternating', note: 'alternating-sequence' }
  ];
}

export function twoHandCardGateSatisfied(skill: TwoHandSkill, progress?: unknown): boolean {
  const status = getTwoHandModuleStatus(progress);
  if (status === 'completed') return true;
  const map = toTwoHandProgressMap(progress);
  const itemId = skill === 'twoHandBass' ? TWO_HAND_ITEM_IDS.BASS : skill === 'twoHandTogether' ? TWO_HAND_ITEM_IDS.TOGETHER : TWO_HAND_ITEM_IDS.ALTERNATING;
  return map.get(itemId)?.state === 'retention';
}

export function twoHandSkillInstruction(skill: TwoHandSkill): string {
  if (skill === 'twoHandBass') return 'Сыграйте басовую ноту левой рукой в указанном регистре.';
  if (skill === 'twoHandTogether') return 'На первую долю нажмите одновременно бас левой рукой и три ноты аккорда правой.';
  return 'На первую долю сыграйте бас левой рукой. На третью долю сыграйте аккорд правой рукой.';
}

export function isTwoHandSkill(skill: string): skill is TwoHandSkill {
  return skill === 'twoHandBass' || skill === 'twoHandTogether' || skill === 'twoHandAlternating';
}

