import { describe, expect, it } from 'vitest';
import { MidiChordTracker } from '../../src/core/input/chordInput';
import { canUseInputForSkill } from '../../src/core/input/inputPolicy';
import { submitQuestionAttempt } from '../../src/core/fsrs/reviewLog';
import { buildDiagnosticSnapshot } from '../../src/core/diagnostics/buildDiagnosticSnapshot';
import { resolveDailyPracticeNext } from '../../src/core/learning/dailyPractice';
import type { Card } from '../../src/core/fsrs/types';
import {
  HARMONY_CHORDS,
  HARMONY_ITEM_IDS,
  HARMONY_RETRY_TRIALS,
  HARMONY_TRANSFER_TRIALS,
  applyHarmonyAction,
  classifyHarmonyChord,
  createHarmonyCurriculumState,
  getCurrentHarmonyChord,
  getCurrentHarmonyProgression,
  getCurrentHarmonyQuestion,
  getHarmonyAssessmentLength,
  harmonyCardGateSatisfied,
  harmonyCardNotes,
  resolveHarmonyKeydownAction,
  resolveHarmonyReviewKeydownAnswer,
  resolveHarmonyReviewTask,
  type HarmonyAction,
  type HarmonyCurriculumState
} from '../../src/core/learning/harmony';

function act(state: HarmonyCurriculumState, action: HarmonyAction): HarmonyCurriculumState {
  return applyHarmonyAction(state, action, 1_800_000_000_000 + state.sequenceIndex + state.assessmentIndex).state;
}

function playCurrentChord(state: HarmonyCurriculumState): HarmonyCurriculumState {
  const chord = getCurrentHarmonyChord(state);
  if (!chord) throw new Error(`No current chord at ${state.step}`);
  return act(state, { type: 'submitChord', keyIds: chord.keyIds });
}

function reachTransferAssessment(): HarmonyCurriculumState {
  let state = createHarmonyCurriculumState(undefined, 1_800_000_000_000);
  state = act(state, { type: 'advanceStage' });
  while (state.step === 'functionIdentify') {
    const question = getCurrentHarmonyQuestion(state)!;
    state = act(state, { type: 'selectAnswer', answer: question.expectedAnswer });
  }
  while (state.step === 'rootProgression') state = playCurrentChord(state);
  state = act(state, { type: 'advanceStage' });
  state = act(state, { type: 'advanceStage' });
  state = act(state, { type: 'selectAnswer', answer: 'G/B' });
  while (state.step === 'nextChord') {
    const question = getCurrentHarmonyQuestion(state)!;
    state = act(state, { type: 'selectAnswer', answer: question.expectedAnswer });
  }
  while (state.step === 'guidedSequence' || state.step === 'independentSequence' || state.step === 'memorySequence') {
    state = playCurrentChord(state);
  }
  return state;
}

function answerAssessmentTrial(state: HarmonyCurriculumState, makeFirstAttemptWrong = false): HarmonyCurriculumState {
  const cursor = state.step === 'transferRemediation'
    ? state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment?.remediationIndex
    : state.assessmentIndex;
  const initialStep = state.step;
  const progression = getCurrentHarmonyProgression(state);
  if (progression) {
    while (
      state.step === initialStep &&
      (state.step === 'transferRemediation'
        ? state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment?.remediationIndex
        : state.assessmentIndex) === cursor &&
      getCurrentHarmonyProgression(state)
    ) {
      const chord = getCurrentHarmonyChord(state)!;
      if (makeFirstAttemptWrong && state.sequenceIndex === 0) {
        state = act(state, { type: 'submitChord', keyIds: ['C4', 'D4', 'F4'] });
      }
      state = act(state, { type: 'submitChord', keyIds: chord.keyIds });
    }
    return state;
  }
  const question = getCurrentHarmonyQuestion(state)!;
  if (!question) throw new Error('Expected an active semantic assessment or remediation trial');
  if (makeFirstAttemptWrong) {
    const wrong = question.choices.find(choice => choice !== question.expectedAnswer)!;
    state = act(state, { type: 'selectAnswer', answer: wrong });
  }
  return act(state, { type: 'selectAnswer', answer: question.expectedAnswer });
}

function progressionCard(): Card {
  return {
    id: 'harmonyProgressionPlay:C-G/B-Am-F',
    skill: 'harmonyProgressionPlay',
    note: 'C-G/B-Am-F',
    memoryState: 'review',
    stability: 3,
    difficulty: 5,
    dueAt: 1,
    lastReviewAt: 0,
    firstSeenAt: 0,
    reps: 2,
    lapses: 0,
    lastGrade: null,
    stats: { trials: 2, firstCorrect: 2, firstWrong: 0, hints: 0, recentScheduledSuccesses: 2, scheduledSuccesses: 2, practiceTrials: 0 }
  };
}

describe('Milestone 3J Harmony & Accompaniment', () => {
  it('teaches the bounded I–V–vi–IV sequence and advances exactly one chord per answer', () => {
    let state = createHarmonyCurriculumState();
    state = act(state, { type: 'advanceStage' });
    for (let index = 0; index < 8; index++) {
      const question = getCurrentHarmonyQuestion(state)!;
      state = act(state, { type: 'selectAnswer', answer: question.expectedAnswer });
    }
    expect(state.step).toBe('rootProgression');
    expect(getCurrentHarmonyProgression(state)).toEqual(['C', 'G', 'Am', 'F']);

    state = playCurrentChord(state);
    expect(state.sequenceIndex).toBe(1);
    expect(getCurrentHarmonyChord(state)?.id).toBe('G');
    state = playCurrentChord(state);
    expect(state.sequenceIndex).toBe(2);
    expect(getCurrentHarmonyChord(state)?.id).toBe('Am');
  });

  it('diagnoses wrong chord quality, wrong inversion, and wrong chord root', () => {
    expect(classifyHarmonyChord(['G3', 'A#3', 'D4'], 'G').outcome).toBe('wrong_quality');
    const inversion = classifyHarmonyChord(['G3', 'B3', 'D4'], 'G/B');
    expect(inversion.outcome).toBe('wrong_inversion');
    expect(inversion.feedbackText).toContain('нота B должна быть в басу');
    const wrongRoot = classifyHarmonyChord(['C4', 'E4', 'G4'], 'Am');
    expect(wrongRoot.feedbackText).toContain('нужен Am');
    expect(wrongRoot.feedbackText).toContain('сыгран C major');
    expect(classifyHarmonyChord(['C4', 'E4'], 'C').outcome).toBe('incomplete_chord');
  });

  it('resumes a persisted sequence at chord 3 of 4 with selection cleared', () => {
    let state = createHarmonyCurriculumState();
    state = act(state, { type: 'advanceStage' });
    while (state.step === 'functionIdentify') {
      const question = getCurrentHarmonyQuestion(state)!;
      state = act(state, { type: 'selectAnswer', answer: question.expectedAnswer });
    }
    state = playCurrentChord(state);
    state = playCurrentChord(state);
    state = act(state, { type: 'toggleKey', keyId: 'F3' });

    const saved = new Map(Object.values(state.progress).map(record => [record.id, record]));
    const restored = createHarmonyCurriculumState(saved);
    expect(restored.step).toBe('rootProgression');
    expect(restored.sequenceIndex).toBe(2);
    expect(getCurrentHarmonyChord(restored)?.id).toBe('Am');
    expect(restored.selectedKeyIds).toEqual([]);
  });

  it('bounds assessment at 12, remediates a failed block, starts a fresh 8-trial retry, then completes', () => {
    let state = reachTransferAssessment();
    expect(state.step).toBe('transferAssessment');
    expect(HARMONY_TRANSFER_TRIALS).toBe(12);
    for (let index = 0; index < HARMONY_TRANSFER_TRIALS; index++) {
      state = answerAssessmentTrial(state, [0, 2, 4].includes(index));
    }
    const failed = state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment!;
    expect(state.step).toBe('transferResult');
    expect(failed.trialsCompleted).toBe(12);
    expect(failed.correctFirstAttempts).toBe(9);
    expect(failed.phase).toBe('result');
    expect(getHarmonyAssessmentLength(failed)).toBe(12);

    state = act(state, { type: 'advanceStage' });
    const remedialCount = failed.remediationTrialIndexes.length;
    for (let index = 0; index < remedialCount; index++) state = answerAssessmentTrial(state);
    const retry = state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment!;
    expect(state.step).toBe('transferAssessment');
    expect(retry.blockKind).toBe('retry');
    expect(retry.trialsCompleted).toBe(0);
    expect(getHarmonyAssessmentLength(retry)).toBe(HARMONY_RETRY_TRIALS);

    for (let index = 0; index < HARMONY_RETRY_TRIALS; index++) state = answerAssessmentTrial(state);
    expect(state.step).toBe('transferResult');
    expect(state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment?.phase).toBe('passed');
    expect(state.progress[HARMONY_ITEM_IDS.TRANSFER].transferLifetimeTrials).toBe(20);
    expect(state.progress[HARMONY_ITEM_IDS.TRANSFER].transferLifetimeCorrectFirstAttempts).toBe(17);
    state = act(state, { type: 'advanceStage' });
    expect(state.step).toBe('moduleComplete');
    expect(state.progress[HARMONY_ITEM_IDS.COMPLETE].state).toBe('retention');
  });

  it('caps remediation at three trials when four or more assessment trials fail', () => {
    let state = reachTransferAssessment();
    for (let index = 0; index < HARMONY_TRANSFER_TRIALS; index++) {
      state = answerAssessmentTrial(state, [0, 1, 2, 4].includes(index));
    }

    const assessment = state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment!;
    expect(state.step).toBe('transferResult');
    expect(assessment.failedTrialIndexes).toEqual([0, 1, 2, 4]);
    expect(assessment.remediationTrialIndexes).toHaveLength(3);
    expect(assessment.remediationTrialIndexes).toEqual([0, 1, 2]);
  });

  it('keeps distinct canonical questions through corrective answers and Daily Practice mapping', () => {
    let state = reachTransferAssessment();
    const functionQuestion = getCurrentHarmonyQuestion(state)!;
    expect(functionQuestion.kind).toBe('function');
    expect(functionQuestion.prompt).toBe('G = какая функция в C major?');

    const wrongFunctionAnswer = functionQuestion.choices.find(choice => choice !== functionQuestion.expectedAnswer)!;
    state = act(state, { type: 'selectAnswer', answer: wrongFunctionAnswer });
    expect(state.awaitingCorrective).toBe(true);
    expect(getCurrentHarmonyQuestion(state)?.prompt).toBe(functionQuestion.prompt);
    expect(getCurrentHarmonyQuestion(state)?.choices).toEqual(functionQuestion.choices);
    expect(state.feedbackText).toContain('Первая попытка этой задачи засчитана как ошибка');
    state = act(state, { type: 'selectAnswer', answer: functionQuestion.expectedAnswer });

    const nextChordQuestion = getCurrentHarmonyQuestion(state)!;
    expect(nextChordQuestion.kind).toBe('nextChord');
    expect(nextChordQuestion.prompt).toBe('C → G/B → Am → ?');
    expect(nextChordQuestion.choices).toEqual(['C', 'G', 'Am', 'F']);

    const dailyNextChord = resolveHarmonyReviewTask({
      ...progressionCard(), skill: 'harmonyNextChord', note: 'I-V-vi-IV', id: 'harmonyNextChord:I-V-vi-IV'
    } as Card)!;
    expect(dailyNextChord.kind).toBe('semantic');
    expect(dailyNextChord.prompt).toBe('C → G/B → Am → ?');
    expect(dailyNextChord.choices).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('preserves failed first-attempt feedback after correcting a transfer progression', () => {
    let state = reachTransferAssessment();
    state = answerAssessmentTrial(state);
    state = answerAssessmentTrial(state);
    expect(state.assessmentIndex).toBe(2);
    state = act(state, { type: 'submitChord', keyIds: ['C4', 'D4', 'F4'] });
    state = answerAssessmentTrial(state);
    expect(state.assessmentIndex).toBe(3);
    expect(state.progress[HARMONY_ITEM_IDS.TRANSFER].transferAssessment?.correctFirstAttempts).toBe(2);
    expect(state.feedbackText).toContain('Первая попытка этой задачи засчитана как ошибка');
    expect(state.feedbackTone).toBe('warn');
  });

  it('opens the three FSRS card families only after their learning gates and resolves semantic shortcuts', () => {
    let state = reachTransferAssessment();
    const functionCard = { skill: 'harmonyFunctionIdentify', note: 'I' } as const;
    expect(harmonyCardGateSatisfied(functionCard.skill, functionCard.note, state.progress)).toBe(true);
    expect(harmonyCardGateSatisfied('harmonyNextChord', 'I-V-vi-IV', state.progress)).toBe(true);
    expect(harmonyCardGateSatisfied('harmonyProgressionPlay', 'C-G/B-Am-F', state.progress)).toBe(true);

    const semanticTask = resolveHarmonyReviewTask({ ...progressionCard(), skill: 'harmonyNextChord', note: 'I-V-vi-IV', id: 'harmonyNextChord:I-V-vi-IV' } as Card)!;
    expect(semanticTask.kind).toBe('semantic');
    expect(resolveHarmonyReviewKeydownAnswer(semanticTask, '2', 'Numpad2')).toBe(semanticTask.choices[1]);
    expect(canUseInputForSkill('harmonyNextChord', 'pcNote')).toBe(false);
    expect(canUseInputForSkill('harmonyProgressionPlay', 'pianoKey')).toBe(true);
    expect(resolveHarmonyKeydownAction(state, '2', 'Digit2')).toEqual({ type: 'selectAnswer', answer: getCurrentHarmonyQuestion(state)?.choices[1] });
  });

  it('exports learning gates, Harmony card lifecycle, and Daily Practice eligibility in diagnostics', () => {
    const state = reachTransferAssessment();
    const cards = harmonyCardNotes().map(item => ({
      ...progressionCard(),
      id: `${item.skill}:${item.note}`,
      skill: item.skill,
      note: item.note,
      memoryState: 'new' as const,
      reps: 0,
      dueAt: 0
    }));
    const snapshot = buildDiagnosticSnapshot({
      cards,
      learningProgress: Object.values(state.progress),
      reviewLogs: [],
      now: 1_800_000_000_000
    });
    const harmony = snapshot.curriculum.advancedModules.harmony;
    expect(harmony.learningGates).toEqual({
      functions: 'retention',
      nextChord: 'retention',
      progressionPlay: 'retention'
    });
    expect(harmony.harmonyCards).toHaveLength(6);
    expect(harmony.harmonyCards?.every(card => card.lifecycleClassification === 'newEligible' && card.eligibleForDailyPractice)).toBe(true);
    expect(harmony.transferPhase).toBe('active');
    expect(harmony.transferBlockKind).toBe('initial');
  });

  it('interleaves eligible scheduled Harmony reviews without repeating a card or dominating one skill', () => {
    const state = reachTransferAssessment();
    const now = 1_800_000_000_000;
    const cards = harmonyCardNotes().map(item => ({
      ...progressionCard(),
      id: `${item.skill}:${item.note}`,
      skill: item.skill,
      note: item.note,
      memoryState: 'review' as const,
      dueAt: now - 1_000,
      lastReviewAt: now - 86_400_000,
      reps: 5
    }));
    const decisions: Card[] = [];
    for (let sessionTrials = 0; sessionTrials < 12; sessionTrials++) {
      const decision = resolveDailyPracticeNext({
        cards,
        learningProgress: Object.values(state.progress),
        reviewLogs: [],
        settings: { sessionPreset: 'normal', level: 'white', mode: 'smart' },
        now,
        sessionTrials,
        recentCards: decisions.slice(-4).reverse()
      });
      expect(decision).not.toBeNull();
      decisions.push(decision!.card);
    }
    let maxSameCard = 1;
    let maxSameSkill = 1;
    let sameCard = 1;
    let sameSkill = 1;
    for (let index = 1; index < decisions.length; index++) {
      sameCard = decisions[index].id === decisions[index - 1].id ? sameCard + 1 : 1;
      sameSkill = decisions[index].skill === decisions[index - 1].skill ? sameSkill + 1 : 1;
      maxSameCard = Math.max(maxSameCard, sameCard);
      maxSameSkill = Math.max(maxSameSkill, sameSkill);
    }
    expect(maxSameCard).toBe(1);
    expect(maxSameSkill).toBeLessThanOrEqual(2);
    expect(new Set(decisions.map(card => card.skill).slice(0, 6)).size).toBeGreaterThan(1);
  });

  it('uses the same chord evaluator for screen and MIDI and locks MIDI evaluation until full release', () => {
    const target = HARMONY_CHORDS['G/B'];
    const screenOutcome = classifyHarmonyChord(['B3', 'D4', 'G4'], 'G/B');
    const midi = new MidiChordTracker();
    let midiChord: string[] | null = null;
    for (const key of target.keyIds) midi.handleNoteOn(key, keys => { midiChord = keys; });
    midi.handleNoteOn('A4', keys => { midiChord = keys; });
    expect(midiChord).toEqual(['B3', 'D4', 'G4']);
    expect(classifyHarmonyChord(midiChord!, 'G/B')).toEqual(screenOutcome);
    midi.handleNoteOff('B3');
    midi.handleNoteOff('D4');
    midi.handleNoteOff('G4');
    midi.handleNoteOff('A4');
    midiChord = null;
    for (const key of target.keyIds) midi.handleNoteOn(key, keys => { midiChord = keys; });
    expect(midiChord).not.toBeNull();
    expect(classifyHarmonyChord(midiChord!, 'G/B').outcome).toBe('correct');
  });

  it('writes one scheduled outcome and one card mutation for a completed progression review', () => {
    const card = progressionCard();
    const roundState = { firstResponseRecorded: false, attempts: 0, hintUsed: false, isCompleted: false, isLocked: false };
    const settings = { desiredRetention: 0.9, maxIntervalDays: 36500, relearningSeconds: 600, useLatencyGrading: true };
    const first = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: false,
      answer: 'incorrect progression' as Card['note'],
      answerKeyId: null,
      responseMs: 1200,
      settings,
      reviewLog: [],
      sessionId: 'm3j-review-session',
      inputMethod: 'midi'
    });
    expect(first.logEvent?.firstCorrect).toBe(false);
    expect(first.cardMutated).toBe(true);
    expect(first.logEvent?.skill).toBe('harmonyProgressionPlay');

    const second = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: true,
      answer: 'C-G/B-Am-F',
      answerKeyId: null,
      responseMs: 0,
      settings,
      reviewLog: first.logEvent ? [first.logEvent] : [],
      sessionId: 'm3j-review-session',
      inputMethod: 'screen'
    });
    expect(second.logEvent).toBeNull();
    expect(second.cardMutated).toBe(false);
    expect([first.logEvent, second.logEvent].filter(Boolean)).toHaveLength(1);
  });
});
