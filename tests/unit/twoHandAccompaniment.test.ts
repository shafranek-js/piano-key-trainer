import { describe, expect, it } from 'vitest';
import {
  TWO_HAND_ASSESSMENT_TRIALS,
  TWO_HAND_BPM,
  TWO_HAND_ITEM_IDS,
  TWO_HAND_MAX_REMEDIATION,
  TWO_HAND_SEQUENCE,
  TWO_HAND_SYNC_WINDOW_MS,
  TWO_HAND_VOICINGS,
  createTwoHandModuleState,
  classifyTwoHandCapture,
  evaluateTwoHandAttempt,
  getTwoHandModuleStatus,
  isTwoHandSkill,
  normalizeTwoHandSnapshot,
  reduceTwoHandState,
  twoHandAssessmentTrial,
  twoHandCardGateSatisfied,
  twoHandCardNotes,
  twoHandPattern,
  twoHandSnapshotFor,
  twoHandTargetBeats,
  twoHandTargetChord,
  twoHandTimingBand,
  type TwoHandAttemptResult,
  type TwoHandModuleState
} from '../../src/core/learning/twoHand';
import { COLD_TEST_SKILLS } from '../../src/core/learning/coldTest';
import { DISPLAY_NAMES, SHORT_NAMES } from '../../src/core/fsrs/constants';
import { FSRS_SKILLS, FSRS_SKILL_SET } from '../../src/core/fsrs/skills';
import { buildLearningRoadmap } from '../../src/core/curriculum/learningRoadmap';

const SEQ = TWO_HAND_SEQUENCE;

function correctAttempt(state: TwoHandModuleState): TwoHandAttemptResult {
  const chordId = twoHandTargetChord(state);
  const pattern = twoHandPattern(state);
  const voicing = TWO_HAND_VOICINGS[chordId];
  const bassAt = 10_000;
  const chordAt = pattern === 'simultaneous' ? 10_004 : 11_200;
  return evaluateTwoHandAttempt({
    chordId,
    pattern,
    bass: { keyId: voicing.bassKeyId, midi: 40, at: bassAt },
    chordNotes: voicing.triadKeyIds.map((keyId, index) => ({ keyId, midi: 60 + index, at: chordAt + index })),
    bassTargetOnset: bassAt,
    chordTargetOnset: pattern === 'simultaneous' ? bassAt : bassAt + 1_200
  });
}

function wrongAttempt(state: TwoHandModuleState): TwoHandAttemptResult {
  const chordId = twoHandTargetChord(state);
  const pattern = twoHandPattern(state);
  const bassAt = 10_000;
  const chordAt = pattern === 'simultaneous' ? 10_004 : 11_200;
  return evaluateTwoHandAttempt({
    chordId,
    pattern,
    bass: { keyId: 'B1', midi: 35, at: bassAt },
    chordNotes: [
      { keyId: 'C5', midi: 72, at: chordAt },
      { keyId: 'D5', midi: 74, at: chordAt + 1 },
      { keyId: 'E5', midi: 76, at: chordAt + 2 }
    ],
    bassTargetOnset: bassAt,
    chordTargetOnset: pattern === 'simultaneous' ? bassAt : bassAt + 1_200
  });
}

function runTimed(state: TwoHandModuleState): TwoHandModuleState {
  let next = reduceTwoHandState(state, { type: 'startRun' });
  next = reduceTwoHandState(next, { type: 'gradeAttempt', result: correctAttempt(next) });
  return next;
}

function runStage(state: TwoHandModuleState, count: number): TwoHandModuleState {
  let next = state;
  for (let index = 0; index < count; index++) next = runTimed(next);
  return next;
}

function advanceToSimultaneous(): TwoHandModuleState {
  let next = reduceTwoHandState(createTwoHandModuleState(), { type: 'continueStage' });
  for (let index = 0; index < SEQ.length; index++) next = reduceTwoHandState(next, { type: 'guidedResult', correct: true });
  for (let index = 0; index < SEQ.length; index++) next = reduceTwoHandState(next, { type: 'guidedResult', correct: true });
  return next;
}

function advanceToRightHand(): TwoHandModuleState {
  let next = reduceTwoHandState(createTwoHandModuleState(), { type: 'continueStage' });
  for (let index = 0; index < SEQ.length; index++) next = reduceTwoHandState(next, { type: 'guidedResult', correct: true });
  return next;
}

function advanceToAssessment(): TwoHandModuleState {
  let next = advanceToSimultaneous();
  next = runStage(next, SEQ.length);
  next = runStage(next, SEQ.length);
  next = runStage(next, SEQ.length);
  next = runStage(next, SEQ.length);
  return next;
}

function failAssessmentBlock(state: TwoHandModuleState): TwoHandModuleState {
  let next = state;
  for (let index = 0; index < TWO_HAND_ASSESSMENT_TRIALS; index++) {
    next = reduceTwoHandState(next, { type: 'startRun' });
    const result = index < 3 ? wrongAttempt(next) : correctAttempt(next);
    next = reduceTwoHandState(next, { type: 'gradeAttempt', result });
    if (!result.correct) {
      next = reduceTwoHandState(next, { type: 'startRun' });
      next = reduceTwoHandState(next, { type: 'gradeAttempt', result: correctAttempt(next) });
    }
  }
  return next;
}

function completeRemediation(state: TwoHandModuleState): TwoHandModuleState {
  let next = state;
  for (let index = 0; index < next.assessment.remediationTrialIndexes.length; index++) {
    next = reduceTwoHandState(next, { type: 'startRun' });
    next = reduceTwoHandState(next, { type: 'gradeAttempt', result: correctAttempt(next) });
    next = reduceTwoHandState(next, { type: 'advance' });
  }
  return next;
}

describe('M3L two-hand accompaniment voicings', () => {
  it('uses canonical bass an octave below the Harmony chord and exact triads', () => {
    expect(TWO_HAND_BPM).toBe(60);
    expect(TWO_HAND_SYNC_WINDOW_MS).toBe(200);
    expect(TWO_HAND_VOICINGS.C).toMatchObject({ bassKeyId: 'C3', triadKeyIds: ['C4', 'E4', 'G4'] });
    expect(TWO_HAND_VOICINGS['G/B']).toMatchObject({ bassKeyId: 'B2', triadKeyIds: ['B3', 'D4', 'G4'] });
    expect(TWO_HAND_VOICINGS.Am).toMatchObject({ bassKeyId: 'A2', triadKeyIds: ['A3', 'C4', 'E4'] });
    expect(TWO_HAND_VOICINGS.F).toMatchObject({ bassKeyId: 'F2', triadKeyIds: ['F3', 'A3', 'C4'] });
  });
});

describe('M3L attempt evaluation', () => {
  it('accepts a clean simultaneous attempt with small onset difference', () => {
    const result = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: { keyId: 'C3', midi: 36, at: 1_000 },
      chordNotes: [
        { keyId: 'E4', midi: 64, at: 1_080 },
        { keyId: 'C4', midi: 60, at: 1_075 },
        { keyId: 'G4', midi: 67, at: 1_090 }
      ],
      bassTargetOnset: 1_000,
      chordTargetOnset: 1_000
    });
    expect(result.outcome).toBe('correct');
    expect(result.correct).toBe(true);
    expect(result.syncMs).toBeGreaterThan(0);
  });

  it('rejects a chord onset beyond the ±200 ms sync window', () => {
    const result = evaluateTwoHandAttempt({
      chordId: 'G/B',
      pattern: 'simultaneous',
      bass: { keyId: 'B2', midi: 35, at: 2_000 },
      chordNotes: [
        { keyId: 'B3', midi: 59, at: 2_230 },
        { keyId: 'D4', midi: 62, at: 2_232 },
        { keyId: 'G4', midi: 67, at: 2_234 }
      ],
      bassTargetOnset: 2_000,
      chordTargetOnset: 2_000
    });
    expect(result.outcome).toBe('both_correct_poor_sync');
    expect(result.correct).toBe(false);
  });

  it('detects wrong bass octave, extra notes, incomplete chords and wrong chords', () => {
    const octave = evaluateTwoHandAttempt({
      chordId: 'Am',
      pattern: 'simultaneous',
      bass: { keyId: 'A3', midi: 57, at: 500 },
      chordNotes: [
        { keyId: 'A3', midi: 57, at: 505 },
        { keyId: 'C4', midi: 60, at: 506 },
        { keyId: 'E4', midi: 64, at: 507 }
      ],
      bassTargetOnset: 500,
      chordTargetOnset: 500
    });
    expect(octave.outcome).toBe('wrong_bass_octave');

    const extra = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: { keyId: 'C3', midi: 36, at: 0 },
      chordNotes: [
        { keyId: 'C4', midi: 60, at: 0 },
        { keyId: 'E4', midi: 64, at: 0 },
        { keyId: 'G4', midi: 67, at: 0 },
        { keyId: 'C5', midi: 72, at: 0 }
      ],
      bassTargetOnset: 0,
      chordTargetOnset: 0
    });
    expect(extra.outcome).toBe('extra_note');

    const incomplete = evaluateTwoHandAttempt({
      chordId: 'F',
      pattern: 'alternating',
      bass: { keyId: 'F2', midi: 29, at: 0 },
      chordNotes: [
        { keyId: 'F3', midi: 53, at: 1_200 },
        { keyId: 'A3', midi: 57, at: 1_201 }
      ],
      bassTargetOnset: 0,
      chordTargetOnset: 1_200
    });
    expect(incomplete.outcome).toBe('incomplete_chord');

    const wrong = evaluateTwoHandAttempt({
      chordId: 'F',
      pattern: 'alternating',
      bass: { keyId: 'F2', midi: 29, at: 0 },
      chordNotes: [
        { keyId: 'E3', midi: 52, at: 1_200 },
        { keyId: 'G3', midi: 55, at: 1_201 },
        { keyId: 'B3', midi: 59, at: 1_202 }
      ],
      bassTargetOnset: 0,
      chordTargetOnset: 1_200
    });
    expect(wrong.outcome).toBe('wrong_chord');
  });

  it('reports missing hands and late timing', () => {
    const missingLeft = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: null,
      chordNotes: [{ keyId: 'C4', midi: 60, at: 0 }],
      bassTargetOnset: 0,
      chordTargetOnset: 0
    });
    expect(missingLeft.outcome).toBe('missing_left');

    const missingRight = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: { keyId: 'C3', midi: 36, at: 0 },
      chordNotes: [],
      bassTargetOnset: 0,
      chordTargetOnset: 0
    });
    expect(missingRight.outcome).toBe('missing_right');

    const late = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'alternating',
      bass: { keyId: 'C3', midi: 36, at: 2_000 + 301 },
      chordNotes: [
        { keyId: 'C4', midi: 60, at: 3_200 },
        { keyId: 'E4', midi: 64, at: 3_201 },
        { keyId: 'G4', midi: 67, at: 3_202 }
      ],
      bassTargetOnset: 2_000,
      chordTargetOnset: 3_200
    });
    expect(late.outcome).toBe('timing_failed');
  });

  it('keeps the M3K timing windows ±140 ms / ±300 ms', () => {
    expect(twoHandTimingBand(0, 0).band).toBe('on_time');
    expect(twoHandTimingBand(140, 0).band).toBe('on_time');
    expect(twoHandTimingBand(-140, 0).band).toBe('on_time');
    expect(twoHandTimingBand(200, 0).band).toBe('late');
    expect(twoHandTimingBand(-200, 0).band).toBe('early');
    expect(twoHandTimingBand(301, 0).band).toBe('missed');
    expect(twoHandTimingBand(-301, 0).band).toBe('too_early');
  });
});

describe('M3L stage machine', () => {
  it('drives the play cue and beat highlight from the shared clock', () => {
    let state = advanceToSimultaneous();
    state = reduceTwoHandState(state, { type: 'startRun' });
    expect(state.activeBeat).toBe(-1);
    expect(state.playCue).toBe(false);
    state = reduceTwoHandState(state, { type: 'clockBeat', beat: 0, countInValue: 3 });
    expect(state.activeBeat).toBe(0);
    expect(state.countInValue).toBe(3);
    expect(state.playCue).toBe(false);
    state = reduceTwoHandState(state, { type: 'clockBeat', beat: 0, countInValue: null });
    expect(state.playCue).toBe(true);
    state = reduceTwoHandState(state, { type: 'clockBeat', beat: 2, countInValue: null });
    expect(state.activeBeat).toBe(2);
    expect(state.playCue).toBe(false);
    const cancelled = reduceTwoHandState(state, { type: 'cancel' });
    expect(cancelled.activeBeat).toBe(-1);
    expect(cancelled.playCue).toBe(false);
    const interrupted = reduceTwoHandState(state, { type: 'inputInterrupted' });
    expect(interrupted.activeBeat).toBe(-1);
    expect(interrupted.playCue).toBe(false);
  });

  it('walks orientation → left hand → right hand → simultaneous', () => {
    let state = createTwoHandModuleState();
    expect(state.stage).toBe('handOrientation');
    state = reduceTwoHandState(state, { type: 'continueStage' });
    expect(state.stage).toBe('leftHand');
    state = reduceTwoHandState(state, { type: 'guidedResult', correct: false, octaveMismatch: true });
    expect(state.awaitingCorrective).toBe(true);
    expect(state.stage).toBe('leftHand');
    for (let index = 0; index < SEQ.length; index++) state = reduceTwoHandState(state, { type: 'guidedResult', correct: true });
    expect(state.stage).toBe('rightHand');
    for (let index = 0; index < SEQ.length; index++) state = reduceTwoHandState(state, { type: 'guidedResult', correct: true });
    expect(state.stage).toBe('simultaneous');
    expect(twoHandTargetBeats({ ...state, isRunning: true }).length).toBe(1);
  });

  it('progresses through alternating, four bars and independent play into assessment', () => {
    let state = advanceToSimultaneous();
    state = runStage(state, SEQ.length);
    expect(state.stage).toBe('alternating');
    expect(twoHandTargetBeats({ ...state, isRunning: true })).toEqual([0, 2]);
    state = runStage(state, SEQ.length);
    expect(state.stage).toBe('fourBar');
    state = runStage(state, SEQ.length);
    expect(state.stage).toBe('independent');
    state = runStage(state, SEQ.length);
    expect(state.stage).toBe('transferAssessment');
    expect(state.assessment.phase).toBe('active');
    expect(state.assessment.blockKind).toBe('initial');
    expect(state.assessment.trialIndex).toBe(0);
  });

  it('does not restart the assessment trial counter after a corrective pass', () => {
    let state = advanceToAssessment();
    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: wrongAttempt(state) });
    expect(state.assessment.trialIndex).toBe(0);
    expect(state.trialHadWrong).toBe(true);
    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: correctAttempt(state) });
    expect(state.assessment.trialIndex).toBe(1);
    expect(state.assessment.correctFirstAttempts).toBe(0);
    expect(state.assessment.failedTrialIndexes).toEqual([0]);
  });
});

describe('M3L assessment, remediation and fail bound', () => {
  it('covers both patterns and all four chords across 12 trials', () => {
    const trials = Array.from({ length: TWO_HAND_ASSESSMENT_TRIALS }, (_, index) => twoHandAssessmentTrial(index));
    expect(new Set(trials.map(trial => trial.kind))).toEqual(new Set(['simultaneous', 'alternating']));
    expect(new Set(trials.map(trial => trial.chordId))).toEqual(new Set(SEQ));
  });

  it('passes with at least 80% first-attempt accuracy', () => {
    let state = advanceToAssessment();
    state = runStage(state, TWO_HAND_ASSESSMENT_TRIALS);
    expect(state.assessment.phase).toBe('passed');
    expect(state.stage).toBe('transferResult');
    expect(state.assessment.correctFirstAttempts).toBe(TWO_HAND_ASSESSMENT_TRIALS);
    state = reduceTwoHandState(state, { type: 'completeModule' });
    expect(state.stage).toBe('moduleComplete');
  });

  it('starts bounded remediation when accuracy is below 80% and fails after three cycles', () => {
    let state = advanceToAssessment();
    state = failAssessmentBlock(state);
    expect(state.assessment.phase).toBe('remediation');
    expect(state.stage).toBe('transferRemediation');
    expect(state.assessment.remediationUsed).toBe(1);
    expect(state.assessment.remediationTrialIndexes.length).toBeLessThanOrEqual(TWO_HAND_MAX_REMEDIATION);

    state = completeRemediation(state);
    expect(state.stage).toBe('transferAssessment');
    expect(state.assessment.blockKind).toBe('retry');
    expect(state.assessment.trialsCompleted).toBe(0);

    state = failAssessmentBlock(state);
    expect(state.assessment.remediationUsed).toBe(2);
    state = completeRemediation(state);
    state = failAssessmentBlock(state);
    expect(state.assessment.remediationUsed).toBe(3);
    state = completeRemediation(state);
    state = failAssessmentBlock(state);
    expect(state.assessment.phase).toBe('failed');
    expect(state.stage).toBe('transferResult');
    expect(reduceTwoHandState(state, { type: 'completeModule' }).stage).toBe('transferResult');
  });
});

describe('M3L Rev1 capture classification and error integrity', () => {
  const note = (keyId: string, at: number, midi = 60) => ({ keyId, midi, at });

  it('keeps a wrong LH bass note as the bass candidate instead of reporting a missing left hand', () => {
    const classification = classifyTwoHandCapture('C', [
      note('D3', 1_000, 50),
      note('C4', 1_010, 60),
      note('E4', 1_012, 64),
      note('G4', 1_014, 67)
    ], { bassTargetOnset: 1_000 });
    expect(classification.bass?.keyId).toBe('D3');
    const result = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: classification.bass,
      chordNotes: classification.chordNotes,
      bassTargetOnset: 1_000,
      chordTargetOnset: 1_000
    });
    expect(result.outcome).toBe('wrong_bass');
    expect(result.bassCorrect).toBe(false);
  });

  it('classifies a wrong bass octave and keeps extra notes detectable', () => {
    const octave = classifyTwoHandCapture('C', [
      note('C2', 1_000, 36),
      note('C4', 1_005, 60),
      note('E4', 1_006, 64),
      note('G4', 1_007, 67)
    ], { bassTargetOnset: 1_000 });
    const octaveResult = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: octave.bass,
      chordNotes: octave.chordNotes,
      bassTargetOnset: 1_000,
      chordTargetOnset: 1_000
    });
    expect(octaveResult.outcome).toBe('wrong_bass_octave');

    const extra = classifyTwoHandCapture('C', [
      note('C3', 0, 48),
      note('C4', 4, 60),
      note('E4', 5, 64),
      note('G4', 6, 67),
      note('C5', 250, 72)
    ], { bassTargetOnset: 0 });
    expect(extra.bass?.keyId).toBe('C3');
    expect(extra.chordNotes.length).toBe(4);
    const extraResult = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: extra.bass,
      chordNotes: extra.chordNotes,
      bassTargetOnset: 0,
      chordTargetOnset: 0
    });
    expect(extraResult.outcome).toBe('extra_note');
    expect(extraResult.correct).toBe(false);
  });

  it('reports a genuinely missing left hand only when no bass candidate exists', () => {
    const classification = classifyTwoHandCapture('C', [
      note('C4', 0, 60),
      note('E4', 1, 64),
      note('G4', 2, 67)
    ], { bassTargetOnset: 0 });
    expect(classification.bass).toBeNull();
    const result = evaluateTwoHandAttempt({
      chordId: 'C',
      pattern: 'simultaneous',
      bass: classification.bass,
      chordNotes: classification.chordNotes,
      bassTargetOnset: 0,
      chordTargetOnset: 0
    });
    expect(result.outcome).toBe('missing_left');
  });
});

describe('M3L Rev1 remediation integrity and stage recovery', () => {
  it('blocks advance until the current remediation item is corrected and maps positions to failed trial indexes', () => {
    let state = advanceToAssessment();
    state = failAssessmentBlock(state);
    expect(state.stage).toBe('transferRemediation');
    expect(state.assessment.remediationTrialIndexes).toEqual([0, 1, 2]);
    expect(state.assessment.trialIndex).toBe(0);
    expect(state.remediationCorrected).toBe(false);
    const blockedUncorrected = reduceTwoHandState(state, { type: 'advance' });
    expect(blockedUncorrected).toBe(state);

    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: wrongAttempt(state) });
    expect(state.awaitingCorrective).toBe(true);
    expect(state.remediationCorrected).toBe(false);
    const blocked = reduceTwoHandState(state, { type: 'advance' });
    expect(blocked).toBe(state);
    expect(blocked.assessment.remediationIndex).toBe(0);

    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: correctAttempt(state) });
    expect(state.awaitingCorrective).toBe(false);
    expect(state.remediationCorrected).toBe(true);
    state = reduceTwoHandState(state, { type: 'advance' });
    expect(state.assessment.remediationIndex).toBe(1);
    expect(state.assessment.trialIndex).toBe(1);
    expect(state.remediationCorrected).toBe(false);

    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: correctAttempt(state) });
    state = reduceTwoHandState(state, { type: 'advance' });
    expect(state.assessment.trialIndex).toBe(2);

    state = reduceTwoHandState(state, { type: 'startRun' });
    state = reduceTwoHandState(state, { type: 'gradeAttempt', result: correctAttempt(state) });
    state = reduceTwoHandState(state, { type: 'advance' });
    expect(state.stage).toBe('transferAssessment');
    expect(state.assessment.blockKind).toBe('retry');
    expect(state.assessment.remediationUsed).toBe(1);
  });

  it('returns to learning after a terminal failure without false completion and preserves history', () => {
    let state = advanceToAssessment();
    state = failAssessmentBlock(state);
    state = completeRemediation(state);
    state = failAssessmentBlock(state);
    state = completeRemediation(state);
    state = failAssessmentBlock(state);
    state = completeRemediation(state);
    state = failAssessmentBlock(state);
    expect(state.assessment.phase).toBe('failed');
    expect(state.stage).toBe('transferResult');

    const recovered = reduceTwoHandState(state, { type: 'retryAssessment' });
    expect(recovered.stage).toBe('simultaneous');
    expect(recovered.assessment.phase).toBe('failed');
    expect(recovered.assessment.trialsCompleted).toBe(TWO_HAND_ASSESSMENT_TRIALS);
    expect(recovered.progress.simultaneousIndex).toBe(0);
    expect(recovered.progress.independentPassed).toBe(false);
    expect(reduceTwoHandState(recovered, { type: 'completeModule' }).stage).toBe('simultaneous');

    const backToIndependent = {
      ...recovered,
      stage: 'independent' as const,
      progress: { ...recovered.progress, barsPassed: TWO_HAND_SEQUENCE.length - 1 }
    };
    const enteringAssessment = reduceTwoHandState(backToIndependent, { type: 'gradeAttempt', result: correctAttempt(backToIndependent) });
    expect(enteringAssessment.stage).toBe('transferAssessment');
    expect(enteringAssessment.assessment.blockKind).toBe('retry');
    expect(enteringAssessment.assessment.trialsCompleted).toBe(0);
    expect(enteringAssessment.assessment.remediationUsed).toBe(3);
  });

  it('advances continuous bars by chord index and cancels safely on input interruption', () => {
    let state = advanceToSimultaneous();
    state = runStage(state, TWO_HAND_SEQUENCE.length);
    state = runStage(state, TWO_HAND_SEQUENCE.length);
    expect(state.stage).toBe('fourBar');
    state = reduceTwoHandState(state, { type: 'clockBeat', beat: 0, countInValue: null, chordIndex: 2 });
    expect(twoHandTargetChord(state)).toBe('Am');
    state = reduceTwoHandState(state, { type: 'startRun' });
    const interrupted = reduceTwoHandState(state, { type: 'inputInterrupted' });
    expect(interrupted.isRunning).toBe(false);
    expect(interrupted.awaitingCorrective).toBe(false);
    expect(interrupted.feedbackTone).toBe('warn');
    expect(interrupted.assessment.trialsCompleted).toBe(0);
  });

  it('plays all four bars of the phrase with one run and one chord change per bar', () => {
    let state = advanceToSimultaneous();
    state = runStage(state, TWO_HAND_SEQUENCE.length);
    state = runStage(state, TWO_HAND_SEQUENCE.length);
    expect(state.stage).toBe('fourBar');
    state = reduceTwoHandState(state, { type: 'startRun' });
    const barResults = TWO_HAND_SEQUENCE.map((chordId, barIndex) => {
      const voicing = TWO_HAND_VOICINGS[chordId];
      const onset = 10_000 + barIndex * 4_000;
      return evaluateTwoHandAttempt({
        chordId,
        pattern: 'alternating',
        bass: { keyId: voicing.bassKeyId, midi: 40, at: onset },
        chordNotes: voicing.triadKeyIds.map((keyId, index) => ({ keyId, midi: 60 + index, at: onset + 1_200 })),
        bassTargetOnset: onset,
        chordTargetOnset: onset + 1_200
      });
    });
    for (const result of barResults) {
      state = reduceTwoHandState(state, { type: 'gradeAttempt', result });
    }
    expect(state.stage).toBe('independent');
    expect(state.progress.barsPassed).toBe(0);
    expect(state.progress.independentPassed).toBe(false);
  });
});

describe('M3L P0 right-hand guided correction', () => {
  it('keeps corrective selection enabled after a wrong guided chord and advances exactly once', () => {
    let state = advanceToRightHand();
    expect(state.stage).toBe('rightHand');
    expect(state.progress.rightIndex).toBe(0);

    for (const keyId of ['F4', 'A4', 'C5']) state = reduceTwoHandState(state, { type: 'selectKey', keyId });
    expect(state.selectedKeyIds).toEqual(['F4', 'A4', 'C5']);
    state = reduceTwoHandState(state, { type: 'clearSelection' });
    state = reduceTwoHandState(state, { type: 'guidedResult', correct: false });
    expect(state.awaitingCorrective).toBe(true);
    expect(state.feedbackTone).toBe('bad');
    expect(state.progress.rightIndex).toBe(0);

    // P0: corrective input must not be rejected by awaitingCorrective.
    for (const keyId of ['C4', 'E4', 'G4']) {
      const next = reduceTwoHandState(state, { type: 'selectKey', keyId });
      expect(next.selectedKeyIds).toContain(keyId);
      state = next;
    }
    expect(state.selectedKeyIds).toEqual(['C4', 'E4', 'G4']);
    state = reduceTwoHandState(state, { type: 'clearSelection' });
    state = reduceTwoHandState(state, { type: 'guidedResult', correct: true });
    expect(state.awaitingCorrective).toBe(false);
    expect(state.feedbackTone).toBe('good');
    expect(state.feedbackText).toBe('Верно!');
    expect(state.progress.rightIndex).toBe(1);
    expect(state.selectedKeyIds).toEqual([]);
  });

  it('still blocks selection during an active timed run and keeps a fresh first attempt clean', () => {
    let state = advanceToRightHand();
    for (let index = 0; index < SEQ.length; index++) state = reduceTwoHandState(state, { type: 'guidedResult', correct: true });
    expect(state.stage).toBe('simultaneous');
    const running = reduceTwoHandState(state, { type: 'startRun' });
    const rejected = reduceTwoHandState(running, { type: 'selectKey', keyId: 'C4' });
    expect(rejected).toBe(running);
    expect(rejected.selectedKeyIds).toEqual([]);

    let fresh = advanceToRightHand();
    for (const keyId of ['C4', 'E4', 'G4']) fresh = reduceTwoHandState(fresh, { type: 'selectKey', keyId });
    fresh = reduceTwoHandState(fresh, { type: 'clearSelection' });
    fresh = reduceTwoHandState(fresh, { type: 'guidedResult', correct: true });
    expect(fresh.progress.rightIndex).toBe(1);
    expect(fresh.awaitingCorrective).toBe(false);
    expect(fresh.feedbackTone).toBe('good');
  });
});

describe('M3L persistence, gates and registration', () => {
  it('round-trips the module snapshot and derives module status', () => {
    let state = advanceToSimultaneous();
    state = runTimed(state);
    const snapshot = twoHandSnapshotFor(state);
    expect(normalizeTwoHandSnapshot(snapshot)).toEqual(snapshot);
    const restored = createTwoHandModuleState(new Map([[TWO_HAND_ITEM_IDS.SESSION, { state: 'introduced', twoHandSnapshot: snapshot }]]));
    expect(restored.stage).toBe(state.stage);
    expect(restored.progress.simultaneousIndex).toBe(state.progress.simultaneousIndex);
    expect(getTwoHandModuleStatus(new Map())).toBe('not_started');
    expect(getTwoHandModuleStatus(new Map([[TWO_HAND_ITEM_IDS.SESSION, { state: 'introduced', twoHandSnapshot: snapshot }]]))).toBe('in_progress');
    expect(getTwoHandModuleStatus(new Map([[TWO_HAND_ITEM_IDS.COMPLETE, { state: 'retention' }]]))).toBe('completed');
  });

  it('gates Daily Practice cards until the module or retention flag is complete', () => {
    const progress = new Map([[TWO_HAND_ITEM_IDS.SESSION, { state: 'introduced', twoHandSnapshot: twoHandSnapshotFor(createTwoHandModuleState()) }]]);
    for (const skill of ['twoHandBass', 'twoHandTogether', 'twoHandAlternating'] as const) {
      expect(twoHandCardGateSatisfied(skill, progress)).toBe(false);
    }
    const complete = new Map([
      [TWO_HAND_ITEM_IDS.COMPLETE, { state: 'retention' }],
      [TWO_HAND_ITEM_IDS.SESSION, { state: 'retention', twoHandSnapshot: twoHandSnapshotFor(createTwoHandModuleState()) }]
    ]);
    for (const skill of ['twoHandBass', 'twoHandTogether', 'twoHandAlternating'] as const) {
      expect(twoHandCardGateSatisfied(skill, complete)).toBe(true);
    }
  });

  it('registers the skills while keeping the Cold Test curated at 19 families', () => {
    expect(FSRS_SKILLS.length).toBe(22);
    expect(FSRS_SKILL_SET.has('twoHandBass')).toBe(true);
    expect(FSRS_SKILL_SET.has('twoHandTogether')).toBe(true);
    expect(FSRS_SKILL_SET.has('twoHandAlternating')).toBe(true);
    expect(isTwoHandSkill('twoHandBass')).toBe(true);
    expect(isTwoHandSkill('chordPulse')).toBe(false);
    expect(COLD_TEST_SKILLS.length).toBe(19);
    expect(COLD_TEST_SKILLS.some(skill => isTwoHandSkill(skill))).toBe(false);
    const cards = twoHandCardNotes();
    expect(cards.length).toBe(3);
    for (const card of cards) {
      expect(DISPLAY_NAMES[card.note]).toBeTruthy();
      expect(SHORT_NAMES[card.note]).toBeTruthy();
    }
  });

  it('adds a 12th roadmap stage gated by chord rhythm completion', () => {
    const locked = buildLearningRoadmap({ chordRhythmStatus: 'in_progress', isChordRhythmAvailable: true, twoHandStatus: 'not_started', isTwoHandAvailable: false });
    const available = buildLearningRoadmap({ chordRhythmStatus: 'completed', isChordRhythmAvailable: true, twoHandStatus: 'not_started', isTwoHandAvailable: true });
    const completed = buildLearningRoadmap({ twoHandStatus: 'completed', isTwoHandAvailable: true });
    expect(locked.length).toBe(12);
    expect(locked.find(stage => stage.id === 'two_hand')?.status).not.toBe('available');
    expect(available.find(stage => stage.id === 'two_hand')?.status).toBe('available');
    expect(completed.find(stage => stage.id === 'two_hand')?.status).toBe('completed');
  });
});
