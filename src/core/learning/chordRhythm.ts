import { midiFromKeyId, pitchClassFromMidi } from '../../audio/types';
import { HARMONY_CHORDS, type HarmonyChordId } from './harmony';
import type { Skill } from '../fsrs/types';
import type { NoteName } from '../fsrs/types';
import type { ProgressCollectionInput } from './curriculumFlow';
import type { ChordRhythmModuleSnapshot, LearningProgressRecord } from './types';

export const CHORD_RHYTHM_BPM = 60;
export const CHORD_RHYTHM_TIME_SIGNATURE = '4/4' as const;
export const CHORD_RHYTHM_SEQUENCE: readonly HarmonyChordId[] = ['C', 'G/B', 'Am', 'F'];
export const CHORD_RHYTHM_TRANSFER_TRIALS = 12;
export const CHORD_RHYTHM_RETRY_TRIALS = 8;
export const CHORD_RHYTHM_REQUIRED_ACCURACY = 0.8;
export const CHORD_RHYTHM_MAX_REMEDIATION = 3;
export const CHORD_RHYTHM_ON_TIME_WINDOW_MS = 140;
export const CHORD_RHYTHM_MISSED_AFTER_MS = 420;
/** Grace window after the missed threshold where a late chord is still diagnosed (never re-graded). */
export const CHORD_RHYTHM_LATE_WINDOW_MS = 900;

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
  /** True between the missed threshold and the late-diagnostic cutoff. */
  lateWindow: boolean;
  attemptIndex: number;
  outcomes: RhythmTimingOutcome[];
  lastClassification: RhythmChordClassification | null;
  feedbackText: string;
  feedbackTone: 'good' | 'bad' | 'warn' | '';
  lastTimingBand: TimingBand | null;
  lastOutcome: RhythmTimingOutcome | null;
  /** Daily-practice cards know their skill without going through an assessment trial index. */
  dailySkill?: ChordRhythmSkill;
}

export type ChordRhythmAction =
  | { type: 'advanceStage' }
  | { type: 'selectBeat'; beat: number }
  | { type: 'startRun'; expectedOnset: number }
  | { type: 'clockBeat'; beat: number; countInValue?: number | null }
  | { type: 'selectKey'; keyId: string }
  | { type: 'clearSelection' }
  | { type: 'recordOutcome'; outcome: RhythmTimingOutcome; questionInstanceId: string; classification?: RhythmChordClassification | null }
  | { type: 'missedOnset' }
  | { type: 'missedExpired' }
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

export type RhythmChordOutcome =
  | 'correct'
  | 'wrong_quality'
  | 'wrong_bass'
  | 'wrong_chord'
  | 'incomplete_chord'
  | 'extra_notes';

export interface RhythmChordInputNote {
  keyId?: string;
  midi?: number;
}

export type DetectedChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'unknown';

export interface RhythmChordClassification {
  outcome: RhythmChordOutcome;
  chordCorrect: boolean;
  playedPitchClasses: string[];
  playedBass: string | null;
  detectedQuality: DetectedChordQuality;
  detectedChordLabel: string | null;
  targetChordLabel: string;
  targetPitchClasses: string[];
  targetBassRequirement: string | null;
  rejectionReason: string | null;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const MAJOR_TRIAD = [0, 4, 7] as const;
const MINOR_TRIAD = [0, 3, 7] as const;
const DIMINISHED_TRIAD = [0, 3, 6] as const;
const AUGMENTED_TRIAD = [0, 4, 8] as const;

function pitchIndexOf(pitchClass: string): number {
  return PITCH_NAMES.indexOf(pitchClass as (typeof PITCH_NAMES)[number]);
}

function resolveNoteMidi(note: RhythmChordInputNote): number | null {
  if (typeof note.midi === 'number' && Number.isFinite(note.midi)) return Math.round(note.midi);
  if (note.keyId) return midiFromKeyId(note.keyId);
  return null;
}

function uniquePitchClasses(midiNotes: readonly number[]): string[] {
  const seen = new Set<string>();
  for (const midi of midiNotes) seen.add(pitchClassFromMidi(midi));
  return [...seen];
}

function detectTriad(pitchClasses: readonly string[]): { root: string; quality: DetectedChordQuality } | null {
  if (pitchClasses.length !== 3) return null;
  for (const root of pitchClasses) {
    const rootIndex = pitchIndexOf(root);
    if (rootIndex < 0) continue;
    const intervals = pitchClasses
      .filter(pc => pc !== root)
      .map(pc => (pitchIndexOf(pc) - rootIndex + 12) % 12)
      .sort((a, b) => a - b);
    if (intervals[0] === MAJOR_TRIAD[1] && intervals[1] === MAJOR_TRIAD[2]) return { root, quality: 'major' };
    if (intervals[0] === MINOR_TRIAD[1] && intervals[1] === MINOR_TRIAD[2]) return { root, quality: 'minor' };
    if (intervals[0] === DIMINISHED_TRIAD[1] && intervals[1] === DIMINISHED_TRIAD[2]) return { root, quality: 'diminished' };
    if (intervals[0] === AUGMENTED_TRIAD[1] && intervals[1] === AUGMENTED_TRIAD[2]) return { root, quality: 'augmented' };
  }
  return null;
}

function chordLabel(detected: { root: string; quality: DetectedChordQuality } | null, bass: string | null): string | null {
  if (!detected) return null;
  if (bass && bass !== detected.root) return `${detected.root} ${detected.quality}, бас ${bass}`;
  return `${detected.root} ${detected.quality}`;
}

/**
 * Canonical M3K rhythm contract:
 * - a plain chord symbol (`C`, `Am`, `F`) means chord identity: correct triad pitch classes in
 *   any octave and any inversion;
 * - a slash symbol (`G/B`) additionally requires the lowest sounding note to be the requested bass
 *   pitch class (octave-independent);
 * - exact octave/register is never required unless the UI explicitly shows one.
 * Screen piano and physical MIDI both go through this single evaluator.
 */
export function classifyRhythmChord(
  targetChordId: HarmonyChordId,
  notes: readonly RhythmChordInputNote[]
): RhythmChordClassification {
  const target = HARMONY_CHORDS[targetChordId];
  const targetMidi = target.keyIds
    .map(keyId => midiFromKeyId(keyId))
    .filter((midi): midi is number => midi !== null);
  const targetPitchClasses = uniquePitchClasses(targetMidi);
  const targetBass = pitchClassFromMidi(midiFromKeyId(target.bassKeyId) ?? 0);
  const targetIsSlash = target.id.includes('/');

  const resolvedMidi = notes
    .map(resolveNoteMidi)
    .filter((midi): midi is number => midi !== null)
    .sort((a, b) => a - b);
  const playedPitchClasses = uniquePitchClasses(resolvedMidi);
  const playedBass = resolvedMidi.length ? pitchClassFromMidi(resolvedMidi[0]) : null;
  const detected = detectTriad(playedPitchClasses);
  const base = {
    playedPitchClasses,
    playedBass,
    detectedQuality: detected?.quality ?? ('unknown' as DetectedChordQuality),
    detectedChordLabel: chordLabel(detected, playedBass),
    targetChordLabel: target.symbol,
    targetPitchClasses,
    targetBassRequirement: targetIsSlash ? targetBass : null
  };

  if (notes.length < 3 || resolvedMidi.length < 3 || playedPitchClasses.length < 3) {
    return { ...base, outcome: 'incomplete_chord', chordCorrect: false, rejectionReason: 'incomplete_chord' };
  }
  if (notes.length > 3 || resolvedMidi.length > 3) {
    return { ...base, outcome: 'extra_notes', chordCorrect: false, rejectionReason: 'extra_notes' };
  }

  const samePitchClasses = playedPitchClasses.length === targetPitchClasses.length &&
    playedPitchClasses.every(pc => targetPitchClasses.includes(pc));
  if (samePitchClasses) {
    if (targetIsSlash && playedBass !== targetBass) {
      return { ...base, outcome: 'wrong_bass', chordCorrect: false, rejectionReason: 'wrong_bass' };
    }
    return { ...base, outcome: 'correct', chordCorrect: true, rejectionReason: null };
  }

  const targetRoot = pitchClassFromMidi(midiFromKeyId(target.rootKeyId) ?? 0);
  if (detected && detected.root === targetRoot) {
    return { ...base, outcome: 'wrong_quality', chordCorrect: false, rejectionReason: 'wrong_quality' };
  }
  return { ...base, outcome: 'wrong_chord', chordCorrect: false, rejectionReason: 'wrong_chord' };
}

export function rhythmChordOutcomeLabel(outcome: RhythmChordOutcome): string {
  switch (outcome) {
    case 'wrong_quality': return 'не та терция';
    case 'wrong_bass': return 'неверный бас';
    case 'wrong_chord': return 'другой аккорд';
    case 'incomplete_chord': return 'меньше трёх нот';
    case 'extra_notes': return 'лишние ноты';
    default: return 'верно';
  }
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
  if (passed) return { ...state, phase: 'passed' };
  // A failed retry block is terminal: the learner explicitly chooses the next path.
  return { ...state, phase: state.blockKind === 'retry' ? 'failed' : 'result' };
}

export function canStartRhythmRemediation(state: RhythmAssessmentState): boolean {
  return state.phase === 'result' &&
    state.blockKind === 'initial' &&
    state.failedTrialIndexes.length > 0 &&
    state.remediationUsed < CHORD_RHYTHM_MAX_REMEDIATION;
}

export function startRhythmRemediation(state: RhythmAssessmentState): RhythmAssessmentState {
  if (state.phase !== 'result') return state;
  if (!canStartRhythmRemediation(state)) {
    return { ...state, phase: 'failed' };
  }
  const selected = state.failedTrialIndexes.slice(0, CHORD_RHYTHM_MAX_REMEDIATION);
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

const CHORD_RHYTHM_STEPS: readonly ChordRhythmStep[] = [
  ...TEACHING_STEPS, 'transferAssessment', 'transferResult', 'transferRemediation', 'moduleComplete'
];

const ASSESSMENT_BLOCKS: readonly RhythmAssessmentBlock[] = ['initial', 'retry'];
const ASSESSMENT_PHASES: readonly RhythmAssessmentState['phase'][] = ['active', 'result', 'remediation', 'passed', 'failed'];

function finiteCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function finiteNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    .map(item => Math.floor(item));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Validates an untrusted persisted M3K snapshot (backup import, reload, legacy rows).
 * Unknown or corrupt values fall back to safe defaults instead of crashing the stage.
 */
export function normalizeChordRhythmSnapshot(value: unknown): ChordRhythmModuleSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const stage = typeof raw.stage === 'string' && CHORD_RHYTHM_STEPS.includes(raw.stage as ChordRhythmStep)
    ? raw.stage as ChordRhythmStep
    : undefined;
  if (!stage) return undefined;
  const snapshot: ChordRhythmModuleSnapshot = {
    stage,
    sequenceIndex: finiteCount(raw.sequenceIndex, 0)
  };
  const rawAssessment = raw.assessment;
  if (rawAssessment && typeof rawAssessment === 'object') {
    const assessment = rawAssessment as Record<string, unknown>;
    snapshot.assessment = {
      blockKind: ASSESSMENT_BLOCKS.includes(assessment.blockKind as RhythmAssessmentBlock)
        ? assessment.blockKind as RhythmAssessmentBlock
        : 'initial',
      phase: ASSESSMENT_PHASES.includes(assessment.phase as RhythmAssessmentState['phase'])
        ? assessment.phase as RhythmAssessmentState['phase']
        : 'active',
      trialIndex: finiteCount(assessment.trialIndex),
      trialsCompleted: finiteCount(assessment.trialsCompleted),
      correctFirstAttempts: finiteCount(assessment.correctFirstAttempts),
      failedTrialIndexes: finiteNumberArray(assessment.failedTrialIndexes),
      remediationTrialIndexes: finiteNumberArray(assessment.remediationTrialIndexes),
      remediationIndex: finiteCount(assessment.remediationIndex),
      remediationUsed: finiteCount(assessment.remediationUsed),
      pendingCorrective: assessment.pendingCorrective === true,
      scoredQuestionIds: stringArray(assessment.scoredQuestionIds)
    };
  }
  return snapshot;
}

export function createChordRhythmModuleState(progress?: ProgressCollectionInput): ChordRhythmModuleState {
  const map = normalizeRhythmProgress(progress);
  const record = map.get(CHORD_RHYTHM_ITEM_IDS.SESSION);
  const snapshot = normalizeChordRhythmSnapshot(record?.chordRhythmSnapshot);
  const step: ChordRhythmStep = snapshot ? snapshot.stage as ChordRhythmStep : 'pulseOrientation';
  const saved = snapshot?.assessment;
  const assessment = saved
    ? { ...createRhythmAssessment(saved.blockKind), ...saved, scoredQuestionIds: [...saved.scoredQuestionIds] }
    : createRhythmAssessment();
  if (map.get(CHORD_RHYTHM_ITEM_IDS.COMPLETE)?.state === 'retention') {
    return {
      step: 'moduleComplete', sequenceIndex: 0, selectedKeyIds: [], assessment,
      activeBeat: -1, countInValue: null, expectedOnset: null, isRunning: false, lateWindow: false, attemptIndex: 0,
      outcomes: [], lastClassification: null, feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null
    };
  }
  return {
    step,
    sequenceIndex: Math.max(0, snapshot?.sequenceIndex ?? 0),
    selectedKeyIds: [], assessment,
    activeBeat: -1, countInValue: null, expectedOnset: null, isRunning: false, lateWindow: false, attemptIndex: 0,
    outcomes: [], lastClassification: null, feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null
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
      return { ...state, step: next, sequenceIndex: 0, selectedKeyIds: [], activeBeat: -1, expectedOnset: null, isRunning: false, lateWindow: false, outcomes: [], attemptIndex: 0, lastClassification: null, feedbackText: '', feedbackTone: '', lastTimingBand: null };
    }
    case 'selectBeat': return { ...state, activeBeat: action.beat };
    case 'startRun': return { ...state, isRunning: true, activeBeat: -1, countInValue: 4, expectedOnset: action.expectedOnset, lateWindow: false, attemptIndex: 0, outcomes: [], lastClassification: null, feedbackText: '', feedbackTone: '', lastTimingBand: null, lastOutcome: null };
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
      const classification = action.classification ?? null;
      // Any evaluated chord closes the late-diagnostic window.
      const base: ChordRhythmModuleState = { ...state, lateWindow: false, lastClassification: classification };
      const strikeCount = rhythmStrikeCount(base);
      const success = last.correct && outcomes.length >= strikeCount;
      const failed = !last.correct;
      if (state.step === 'transferAssessment') {
        if (state.assessment.pendingCorrective) {
          if (failed) return { ...base, outcomes, isRunning: false, selectedKeyIds: [], feedbackText: rhythmFeedback(last), feedbackTone: 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
          if (success) {
            const assessment = finishRhythmCorrectiveRun(state.assessment);
            return { ...base, assessment, step: assessment.phase === 'active' ? state.step : 'transferResult', outcomes: [], isRunning: false, attemptIndex: 0, selectedKeyIds: [], feedbackText: `✓ Исправлено. ${timingBandLabel(last.timingBand)}.`, feedbackTone: 'good', lastTimingBand: last.timingBand, lastOutcome: last };
          }
          return { ...base, outcomes, attemptIndex: outcomes.length, selectedKeyIds: [], expectedOnset: null, feedbackText: rhythmFeedback(last), feedbackTone: 'warn', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        if (failed) {
          const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, { questionInstanceId: action.questionInstanceId, correct: false });
          return { ...base, assessment, outcomes, isRunning: false, attemptIndex: 0, selectedKeyIds: [], feedbackText: rhythmFeedback(last), feedbackTone: 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        if (success) {
          const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, { questionInstanceId: action.questionInstanceId, correct: true });
          const done = assessment.phase !== 'active';
          return { ...base, assessment, step: done ? 'transferResult' : state.step, outcomes: [], isRunning: false, selectedKeyIds: [], sequenceIndex: 0, feedbackText: `✓ Аккорд верный · ${timingBandLabel(last.timingBand)}.`, feedbackTone: 'good', lastTimingBand: last.timingBand, lastOutcome: last };
        }
        return { ...base, outcomes, attemptIndex: outcomes.length, selectedKeyIds: [], expectedOnset: null, feedbackText: rhythmFeedback(last), feedbackTone: last.correct ? 'warn' : 'bad', lastTimingBand: last.timingBand, lastOutcome: last };
      }
      return {
        ...base,
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
      // Soft miss: the timing window is over, but a late chord is still diagnosed
      // (never re-graded) until the cutoff timer fires or the learner plays.
      const outcome = classifyRhythmTiming(state.expectedOnset ?? 0, null, false);
      return {
        ...state,
        lateWindow: true,
        outcomes: [...state.outcomes, outcome],
        isRunning: true,
        selectedKeyIds: [],
        feedbackText: 'Пропущена доля. Время уже не изменится, но можно сыграть аккорд для диагностики.',
        feedbackTone: 'warn',
        lastTimingBand: 'missed',
        lastOutcome: outcome
      };
    }
    case 'missedExpired': {
      const outcome = classifyRhythmTiming(state.expectedOnset ?? 0, null, false);
      if (state.step === 'transferAssessment') {
        const assessment = recordRhythmAssessmentFirstAttempt(state.assessment, {
          questionInstanceId: `missed:${state.assessment.blockKind}:${state.assessment.trialIndex}`,
          correct: false
        });
        return { ...state, assessment, lateWindow: false, isRunning: false, feedbackText: rhythmFeedback(outcome), feedbackTone: 'bad', lastTimingBand: 'missed', lastOutcome: outcome };
      }
      return { ...state, lateWindow: false, isRunning: false, feedbackText: rhythmFeedback(outcome), feedbackTone: 'bad', lastTimingBand: 'missed', lastOutcome: outcome };
    }
    case 'finishCorrective': {
      const assessment = finishRhythmCorrectiveRun(state.assessment);
      const isDone = assessment.phase !== 'active';
      return { ...state, assessment, step: isDone ? 'transferResult' : state.step, outcomes: [], attemptIndex: 0, isRunning: false, selectedKeyIds: [], feedbackText: '', feedbackTone: '', expectedOnset: null, lateWindow: false };
    }
    case 'startRemediation': {
      const assessment = startRhythmRemediation(state.assessment);
      if (assessment.phase === 'failed') return { ...state, assessment, step: 'transferResult', feedbackText: 'Проверка пока не пройдена. Повторите учебные этапы и попробуйте позже.', feedbackTone: 'warn' };
      return { ...state, step: 'transferRemediation', assessment, outcomes: [], isRunning: false, selectedKeyIds: [], lateWindow: false, feedbackText: '', feedbackTone: '' };
    }
    case 'finishRemediationItem': {
      const assessment = finishRhythmRemediation(state.assessment);
      const done = assessment.blockKind === 'retry' && assessment.phase === 'active';
      return { ...state, assessment, step: done ? 'transferAssessment' : state.step, outcomes: [], isRunning: false, selectedKeyIds: [], lateWindow: false, feedbackText: '', feedbackTone: '' };
    }
    case 'completeModule': return { ...state, step: 'moduleComplete', isRunning: false, lateWindow: false, feedbackText: 'Модуль завершён. Навыки ритма добавлены в ежедневную практику.', feedbackTone: 'good' };
    case 'cancel': return { ...state, isRunning: false, lateWindow: false, activeBeat: -1, countInValue: null, expectedOnset: null, selectedKeyIds: [], feedbackText: `Упражнение приостановлено: ${action.reason}. Ошибка не засчитана. Начните заново с отсчётом 4 · 3 · 2 · 1.`, feedbackTone: 'warn' };
  }
}

export function currentRhythmTrial(state: ChordRhythmModuleState): RhythmAssessmentTrial {
  if (state.step === 'transferRemediation') {
    return getRhythmAssessmentTrial(state.assessment.blockKind, rhythmTargetChordIndex(state.assessment));
  }
  return getRhythmAssessmentTrial(state.assessment.blockKind, state.assessment.trialIndex);
}

export function rhythmStrikeCount(state: ChordRhythmModuleState): number {
  if (state.dailySkill) return state.dailySkill === 'chordRhythmPattern' ? 2 : 1;
  if (state.step === 'twoStrikes') return 2;
  if (state.step === 'transferAssessment' || state.step === 'transferRemediation') return currentRhythmTrial(state).expectedBeatIndexes.length;
  return 1;
}

export type RhythmRunPhase = 'prepare' | 'countIn' | 'armed' | 'late' | 'evaluated' | 'retry';

/** Explicit user-facing run phase for the timing state machine. */
export function rhythmRunPhase(state: ChordRhythmModuleState): RhythmRunPhase {
  if (state.step === 'transferResult' || state.step === 'moduleComplete') return 'evaluated';
  if (state.lateWindow) return 'late';
  if (state.isRunning && state.countInValue !== null) return 'countIn';
  if (state.isRunning && state.expectedOnset !== null) return 'armed';
  if (state.assessment.pendingCorrective) return 'retry';
  return 'prepare';
}

/** The grading window is open exactly when the visible target beat is active. */
export function isRhythmTimingWindowOpen(state: ChordRhythmModuleState): boolean {
  return state.isRunning && state.countInValue === null && state.expectedOnset !== null && !state.lateWindow;
}

/** Maps the first failed assessment trial back to a targeted guided rhythm step. */
export function targetedRemediationStep(state: ChordRhythmModuleState): ChordRhythmStep {
  const failedIndex = state.assessment.failedTrialIndexes[0];
  const coverage = typeof failedIndex === 'number'
    ? getRhythmAssessmentTrial(state.assessment.blockKind, failedIndex).coverageTag
    : 'pulse';
  return coverage === 'pattern' ? 'twoStrikes' : coverage === 'change' ? 'changeOnBeatOne' : 'oneChordPerBar';
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
  const sessionSnapshot = normalizeChordRhythmSnapshot(map.get(CHORD_RHYTHM_ITEM_IDS.SESSION)?.chordRhythmSnapshot);
  if (sessionSnapshot) return 'in_progress';
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
