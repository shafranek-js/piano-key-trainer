import { describe, expect, it } from 'vitest';
import {
  CHORD_RHYTHM_ITEM_IDS,
  CHORD_RHYTHM_MAX_REMEDIATION,
  CHORD_RHYTHM_RETRY_TRIALS,
  CHORD_RHYTHM_TRANSFER_TRIALS,
  canStartRhythmRemediation,
  chordRhythmCardGateSatisfied,
  classifyRhythmTiming,
  createChordRhythmModuleState,
  createRhythmAssessment,
  finishRhythmCorrectiveRun,
  getChordRhythmModuleStatus,
  getRhythmAssessmentLength,
  getRhythmAssessmentTrial,
  normalizeChordRhythmSnapshot,
  recordRhythmAssessmentFirstAttempt,
  reduceChordRhythmState,
  rhythmStrikeCount,
  startRhythmRemediation,
  targetedRemediationStep,
  type ChordRhythmModuleState,
  type RhythmAssessmentState
} from '../../src/core/learning/chordRhythm';
import {
  createInitialLearningProgress,
  appendUniqueContext
} from '../../src/core/learning/progress';
import { createTrialContext } from '../../src/core/learning/trialPolicy';
import { submitQuestionAttempt, type QuestionRoundState } from '../../src/core/fsrs/reviewLog';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import type { Card } from '../../src/core/fsrs/types';
import type { LearningProgressRecord } from '../../src/core/learning/types';

const CORRECT = classifyRhythmTiming(1000, 1000, true);
const WRONG_CHORD = classifyRhythmTiming(1000, 1000, false);

function runAssessment(
  state: RhythmAssessmentState,
  correctCount: number,
  total: number
): RhythmAssessmentState {
  let next = state;
  for (let i = 0; i < total; i += 1) {
    next = recordRhythmAssessmentFirstAttempt(next, {
      questionInstanceId: `q-${next.trialIndex}-${i % 2}`,
      correct: i < correctCount
    });
    // A failed record keeps pendingCorrective; complete the corrective to advance.
    if (next.pendingCorrective) {
      next = finishRhythmCorrectiveRun(next);
    }
  }
  return next;
}

function sessionRecord(snapshot: LearningProgressRecord['chordRhythmSnapshot']): LearningProgressRecord {
  return {
    ...createInitialLearningProgress(CHORD_RHYTHM_ITEM_IDS.SESSION, 1000),
    modelCompleted: true,
    chordRhythmSnapshot: snapshot
  };
}

describe('M3K Chord Rhythm — assessment model', () => {
  it('uses 12 initial trials and 8 retry trials', () => {
    expect(getRhythmAssessmentLength(createRhythmAssessment('initial'))).toBe(CHORD_RHYTHM_TRANSFER_TRIALS);
    expect(getRhythmAssessmentLength(createRhythmAssessment('retry'))).toBe(CHORD_RHYTHM_RETRY_TRIALS);
    expect(CHORD_RHYTHM_TRANSFER_TRIALS).toBe(12);
    expect(CHORD_RHYTHM_RETRY_TRIALS).toBe(8);
  });

  it('passes at >= 80% first-attempt accuracy and fails below it', () => {
    const pass = runAssessment(createRhythmAssessment('initial'), 10, 12);
    expect(pass.phase).toBe('passed');
    expect(pass.trialsCompleted).toBe(12);
    expect(pass.correctFirstAttempts).toBe(10);

    const fail = runAssessment(createRhythmAssessment('initial'), 9, 12);
    expect(fail.phase).toBe('result');
    expect(fail.failedTrialIndexes).toHaveLength(3);
  });

  it('caps focused remediation at three tasks and starts a fresh retry block', () => {
    const fail = runAssessment(createRhythmAssessment('initial'), 0, 12);
    expect(fail.failedTrialIndexes).toHaveLength(12);
    expect(canStartRhythmRemediation(fail)).toBe(true);

    const remediation = startRhythmRemediation(fail);
    expect(remediation.phase).toBe('remediation');
    expect(remediation.remediationTrialIndexes).toHaveLength(CHORD_RHYTHM_MAX_REMEDIATION);
    expect(remediation.remediationUsed).toBe(1);
  });

  it('makes a failed retry terminal (no infinite assessment loop)', () => {
    const failedInitial = runAssessment(createRhythmAssessment('initial'), 0, 12);
    const retry = createRhythmAssessment('retry');
    const failedRetry = runAssessment(retry, 0, 8);
    expect(failedRetry.phase).toBe('failed');
    expect(canStartRhythmRemediation(failedRetry)).toBe(false);
    // Calling remediation on a failed retry must not restart anything.
    expect(startRhythmRemediation(failedRetry).phase).toBe('failed');
    expect(failedInitial.phase).toBe('result');
  });

  it('records each question instance at most once and corrective runs never re-score', () => {
    let state = createRhythmAssessment('initial');
    state = recordRhythmAssessmentFirstAttempt(state, { questionInstanceId: 'q-0', correct: false });
    expect(state.trialsCompleted).toBe(1);
    expect(state.correctFirstAttempts).toBe(0);
    expect(state.pendingCorrective).toBe(true);
    expect(state.scoredQuestionIds).toEqual(['q-0']);

    const duplicate = recordRhythmAssessmentFirstAttempt(state, { questionInstanceId: 'q-0', correct: true });
    expect(duplicate).toBe(state);

    const corrected = finishRhythmCorrectiveRun(state);
    expect(corrected.pendingCorrective).toBe(false);
    expect(corrected.trialsCompleted).toBe(1);
    expect(corrected.correctFirstAttempts).toBe(0);
    expect(corrected.trialIndex).toBe(1);

    const repeatedCorrective = finishRhythmCorrectiveRun(corrected);
    expect(repeatedCorrective).toBe(corrected);
  });

  it('maps failed trials back to a targeted guided step', () => {
    const state: ChordRhythmModuleState = {
      ...createChordRhythmModuleState(),
      step: 'transferResult',
      assessment: {
        ...createRhythmAssessment('initial'),
        phase: 'failed',
        failedTrialIndexes: [8]
      }
    };
    expect(getRhythmAssessmentTrial('initial', 8).coverageTag).toBe('pattern');
    expect(targetedRemediationStep(state)).toBe('twoStrikes');
    expect(targetedRemediationStep({ ...state, assessment: { ...state.assessment, failedTrialIndexes: [4] } })).toBe('changeOnBeatOne');
    expect(targetedRemediationStep({ ...state, assessment: { ...state.assessment, failedTrialIndexes: [0] } })).toBe('oneChordPerBar');
  });

  it('derives the required strike count from the daily skill', () => {
    const base = createChordRhythmModuleState();
    expect(rhythmStrikeCount({ ...base, step: 'twoStrikes' })).toBe(2);
    expect(rhythmStrikeCount({ ...base, step: 'transferAssessment', dailySkill: 'chordRhythmPattern' })).toBe(2);
    expect(rhythmStrikeCount({ ...base, step: 'transferAssessment', dailySkill: 'chordPulse' })).toBe(1);
  });

  it('runs the assessment through the module reducer and completes the module', () => {
    let state: ChordRhythmModuleState = { ...createChordRhythmModuleState(), step: 'independentPlay' };
    state = reduceChordRhythmState(state, { type: 'advanceStage' });
    expect(state.step).toBe('transferAssessment');

    let guard = 0;
    while (state.step === 'transferAssessment' && guard < 60) {
      const questionInstanceId = `q-${state.assessment.trialIndex}`;
      state = reduceChordRhythmState(state, { type: 'recordOutcome', outcome: CORRECT, questionInstanceId });
      guard += 1;
    }
    expect(state.step).toBe('transferResult');
    expect(state.assessment.phase).toBe('passed');

    state = reduceChordRhythmState(state, { type: 'completeModule' });
    expect(state.step).toBe('moduleComplete');
  });

  it('keeps corrective runs from completing a question on the first repeat strike', () => {
    let state: ChordRhythmModuleState = { ...createChordRhythmModuleState(), step: 'transferAssessment' };
    state = reduceChordRhythmState(state, { type: 'recordOutcome', outcome: WRONG_CHORD, questionInstanceId: 'q-0' });
    expect(state.assessment.pendingCorrective).toBe(true);
    expect(state.assessment.trialsCompleted).toBe(1);

    // First corrective strike on a two-strike trial must not finish the corrective run.
    const patternState: ChordRhythmModuleState = {
      ...state,
      outcomes: [],
      assessment: {
        ...createRhythmAssessment('initial'),
        pendingCorrective: true,
        trialIndex: 8,
        trialsCompleted: 1
      }
    };
    let corrective = reduceChordRhythmState(patternState, { type: 'recordOutcome', outcome: CORRECT, questionInstanceId: 'q-8' });
    expect(corrective.assessment.pendingCorrective).toBe(true);
    corrective = reduceChordRhythmState(corrective, { type: 'recordOutcome', outcome: CORRECT, questionInstanceId: 'q-8' });
    expect(corrective.assessment.pendingCorrective).toBe(false);
    expect(corrective.assessment.trialsCompleted).toBe(1);
  });
});

describe('M3K Chord Rhythm — persistence and status', () => {
  it('one-grade invariant: a graded failure plus reloaded corrective retry never produces a second FSRS event', () => {
    const card: Card = {
      id: 'find:C', skill: 'find', note: 'C', memoryState: 'new', stability: null, difficulty: null,
      dueAt: 0, lastReviewAt: 0, firstSeenAt: 0, reps: 0, lapses: 0, lastGrade: null,
      stats: { trials: 0, firstCorrect: 0, firstWrong: 0, hints: 0, recentScheduledSuccesses: 0, scheduledSuccesses: 0, practiceTrials: 0 }
    };
    const settings = DEFAULT_SETTINGS;
    const firstContext = createTrialContext({
      mode: 'delayedCheck', sessionId: 's1', cardId: 'find:C', hintLevel: 0, firstAttempt: true, inputMethod: 'screen'
    });
    const firstRound: QuestionRoundState = { firstResponseRecorded: false, attempts: 0, hintUsed: false, isCompleted: false, isLocked: false };
    const first = submitQuestionAttempt({
      state: firstRound, card, kind: 'new', isCorrect: false, answer: 'D', answerKeyId: null,
      responseMs: 400, settings, reviewLog: [], sessionId: 's1', reviewedAt: 1_000, trialContext: firstContext
    });
    expect(first.logEvent?.gradeableByFsrs).toBe(true);
    expect(first.logEvent?.grade).toBe(1);
    expect(first.cardMutated).toBe(true);

    // Reload: the corrective retry carries firstAttempt=false and must not grade again.
    const retryContext = createTrialContext({
      mode: 'delayedCheck', sessionId: 's1', cardId: 'find:C', hintLevel: 0, firstAttempt: false, inputMethod: 'screen'
    });
    const retryRound: QuestionRoundState = { firstResponseRecorded: false, attempts: 0, hintUsed: false, isCompleted: false, isLocked: false };
    const retry = submitQuestionAttempt({
      state: retryRound, card, kind: 'new', isCorrect: true, answer: 'C', answerKeyId: 'C4',
      responseMs: 500, settings, reviewLog: [first.logEvent!], sessionId: 's1', reviewedAt: 2_000, trialContext: retryContext
    });
    expect(retry.logEvent).toBeNull();
    expect(retry.cardMutated).toBe(false);
    expect(retry.grade).toBeNull();
    expect(retry.fsrsEligibility.reason).toBe('ineligible_non_first_attempt');
  });

  it('round-trips pending corrective and scored question state through a snapshot', () => {
    const assessment: RhythmAssessmentState = {
      ...createRhythmAssessment('initial'),
      pendingCorrective: true,
      trialsCompleted: 2,
      correctFirstAttempts: 1,
      failedTrialIndexes: [1],
      scoredQuestionIds: ['q-0', 'q-1']
    };
    const raw = {
      stage: 'transferAssessment',
      sequenceIndex: 0,
      assessment: {
        ...assessment,
        failedTrialIndexes: [...assessment.failedTrialIndexes],
        remediationTrialIndexes: [...assessment.remediationTrialIndexes],
        scoredQuestionIds: [...assessment.scoredQuestionIds]
      }
    };

    const restored = createChordRhythmModuleState([sessionRecord(raw as LearningProgressRecord['chordRhythmSnapshot'])]);
    expect(restored.step).toBe('transferAssessment');
    expect(restored.assessment.pendingCorrective).toBe(true);
    expect(restored.assessment.scoredQuestionIds).toEqual(['q-0', 'q-1']);
    expect(restored.assessment.trialsCompleted).toBe(2);

    // A duplicated scored id cannot be scored again after reload.
    const duplicate = recordRhythmAssessmentFirstAttempt(restored.assessment, { questionInstanceId: 'q-0', correct: true });
    expect(duplicate).toBe(restored.assessment);
    expect(duplicate.trialsCompleted).toBe(2);
    expect(duplicate.correctFirstAttempts).toBe(1);
  });

  it('validates corrupt snapshots with safe fallbacks instead of crashing', () => {
    expect(normalizeChordRhythmSnapshot(null)).toBeUndefined();
    expect(normalizeChordRhythmSnapshot({ stage: 'bogus-step' })).toBeUndefined();
    const normalized = normalizeChordRhythmSnapshot({
      stage: 'transferAssessment',
      sequenceIndex: Number.NaN,
      assessment: {
        blockKind: 'nonsense',
        phase: 'nonsense',
        trialIndex: -3,
        trialsCompleted: 'x',
        correctFirstAttempts: Infinity,
        failedTrialIndexes: [1, 'a', -2, 3.7],
        remediationTrialIndexes: null,
        remediationIndex: 1.9,
        remediationUsed: -1,
        pendingCorrective: 'yes',
        scoredQuestionIds: ['q-0', 42]
      }
    });
    expect(normalized).toEqual({
      stage: 'transferAssessment',
      sequenceIndex: 0,
      assessment: {
        blockKind: 'initial',
        phase: 'active',
        trialIndex: 0,
        trialsCompleted: 0,
        correctFirstAttempts: 0,
        failedTrialIndexes: [1, 3],
        remediationTrialIndexes: [],
        remediationIndex: 1,
        remediationUsed: 0,
        pendingCorrective: false,
        scoredQuestionIds: ['q-0']
      }
    });
  });

  it('reports module status from session snapshots and completion', () => {
    const empty = new Map<string, LearningProgressRecord>();
    expect(getChordRhythmModuleStatus(empty)).toBe('not_started');

    const inProgress = new Map<string, LearningProgressRecord>([
      [CHORD_RHYTHM_ITEM_IDS.SESSION, sessionRecord({ stage: 'changeOnBeatOne' })]
    ]);
    expect(getChordRhythmModuleStatus(inProgress)).toBe('in_progress');

    const complete = new Map<string, LearningProgressRecord>([
      [CHORD_RHYTHM_ITEM_IDS.SESSION, sessionRecord({ stage: 'moduleComplete' })],
      [
        CHORD_RHYTHM_ITEM_IDS.COMPLETE,
        markRetention(createInitialLearningProgress(CHORD_RHYTHM_ITEM_IDS.COMPLETE, 1000))
      ]
    ]);
    expect(getChordRhythmModuleStatus(complete)).toBe('completed');
    expect(createChordRhythmModuleState(complete).step).toBe('moduleComplete');
  });

  it('gates FSRS cards on per-skill retention', () => {
    const empty = new Map<string, LearningProgressRecord>();
    expect(chordRhythmCardGateSatisfied('chordPulse', 'pulse', empty)).toBe(false);

    const pulse = new Map<string, LearningProgressRecord>([
      [
        CHORD_RHYTHM_ITEM_IDS.PULSE,
        markRetention(createInitialLearningProgress(CHORD_RHYTHM_ITEM_IDS.PULSE, 1000))
      ]
    ]);
    expect(chordRhythmCardGateSatisfied('chordPulse', 'pulse', pulse)).toBe(true);
    expect(chordRhythmCardGateSatisfied('chordChangeTiming', 'change-timing', pulse)).toBe(false);
  });
});

function markRetention(record: LearningProgressRecord): LearningProgressRecord {
  return {
    ...record,
    state: 'retention',
    modelCompleted: true,
    contexts: appendUniqueContext(record.contexts, 'test:retention')
  };
}
