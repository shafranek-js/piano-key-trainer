import { describe, it, expect } from 'vitest';
import {
  CF_MIX_SUCCESS_TARGET,
  FIRST_RUN_CF_ITEM_IDS,
  FIRST_RUN_CF_STEPS,
  FIRST_RUN_C_LANDMARK_KEY_IDS,
  HINT_LEVEL,
  advanceFirstRunCf,
  applyFirstRunCfActionWithCards,
  buildInitialCfMixQueue,
  canUseDontKnowInFirstRunStep,
  canUseInputForFirstRunStep,
  createFirstRunCfState,
  evaluateFirstRunCfEntry,
  getFirstRunCfStepProgress,
  getFirstRunDiagramSpec,
  getFirstRunTimingPolicy,
  getUnhintedAnchorContexts,
  isConstrainedCfMixSequence,
  isFirstRunCfCompleted,
  resolveFirstRunKeydownAction,
  scheduleMissedMixNote,
  shouldEnterFirstRunCf,
  type FirstRunCfState,
  type FirstRunCfStep
} from '../../src/core/learning';
import type { Card, ReviewLogEvent } from '../../src/core/fsrs/types';
import { PianoTrainerDatabase } from '../../src/storage/db';

function makeFreshCard(
  id: string,
  skill: Card['skill'],
  note: Card['note']
): Card {
  return {
    id,
    skill,
    note,
    memoryState: 'new',
    stability: null,
    difficulty: null,
    dueAt: 0,
    lastReviewAt: 0,
    firstSeenAt: 0,
    reps: 0,
    lapses: 0,
    lastGrade: null,
    stats: {
      trials: 0,
      firstCorrect: 0,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: 0,
      practiceTrials: 0
    }
  };
}

function makeFreshCardPool(): Map<string, Card> {
  return new Map([
    ['find:C', makeFreshCard('find:C', 'find', 'C')],
    ['find:F', makeFreshCard('find:F', 'find', 'F')],
    ['identify:C', makeFreshCard('identify:C', 'identify', 'C')],
    ['identify:F', makeFreshCard('identify:F', 'identify', 'F')]
  ]);
}

const TEST_SETTINGS = {
  desiredRetention: 0.9,
  maxIntervalDays: 120,
  relearningSeconds: 45,
  useLatencyGrading: false
};

function advanceToStep(targetStep: FirstRunCfState['step']): {
  state: FirstRunCfState;
  cards: Map<string, Card>;
  logs: ReviewLogEvent[];
} {
  const cards = makeFreshCardPool();
  const logs: ReviewLogEvent[] = [];
  let state = createFirstRunCfState(undefined, 1_000);
  let now = 2_000;

  const run = (action: Parameters<typeof advanceFirstRunCf>[1]) => {
    const res = applyFirstRunCfActionWithCards({
      state,
      action: { ...action, at: now, sessionId: 'session-test' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs,
      responseMs: 650,
      reviewedAt: now
    });
    now += 1_000;
    state = res.state;
    if (res.attemptResult?.logEvent) {
      logs.push(res.attemptResult.logEvent);
    }
    return res;
  };

  if (state.step === targetStep) return { state, cards, logs };

  // 1. orientation -> cModel
  run({ type: 'continue' });
  if (state.step === targetStep) return { state, cards, logs };

  // 2. cModel -> cGuided
  run({ type: 'keyPress', note: 'C', keyId: 'C4' });
  if (state.step === targetStep) return { state, cards, logs };

  // 3. cGuided -> cQualify
  run({ type: 'keyPress', note: 'C', keyId: 'C4' });
  if (state.step === targetStep) return { state, cards, logs };

  // 4. cQualify (2 distinct regions) -> fModel
  run({ type: 'keyPress', note: 'C', keyId: 'C3' });
  run({ type: 'keyPress', note: 'C', keyId: 'C5' });
  if (state.step === targetStep) return { state, cards, logs };

  // 5. fModel -> fGuided
  run({ type: 'keyPress', note: 'F', keyId: 'F4' });
  if (state.step === targetStep) return { state, cards, logs };

  // 6. fGuided -> fQualify
  run({ type: 'keyPress', note: 'F', keyId: 'F4' });
  if (state.step === targetStep) return { state, cards, logs };

  // 7. fQualify (2 distinct regions) -> cfMix
  run({ type: 'keyPress', note: 'F', keyId: 'F3' });
  run({ type: 'keyPress', note: 'F', keyId: 'F5' });
  if (state.step === targetStep) return { state, cards, logs };

  // 8. cfMix (4 successful first-attempt trials) -> cfIdentify
  for (let i = 0; i < CF_MIX_SUCCESS_TARGET; i++) {
    const note = state.targetNote ?? 'C';
    const octave = i % 2 === 0 ? '4' : '3';
    run({ type: 'keyPress', note, keyId: `${note}${octave}` });
  }
  if (state.step === targetStep) return { state, cards, logs };

  // 9. cfIdentify (C and F) -> delayedC
  while (state.step === 'cfIdentify') {
    const note = state.targetNote ?? 'C';
    run({ type: 'semanticAnswer', note, channel: 'answerButton' });
  }
  if (state.step === targetStep) return { state, cards, logs };

  // 10. delayedC -> delayedF
  run({ type: 'keyPress', note: 'C', keyId: 'C4' });
  if (state.step === targetStep) return { state, cards, logs };

  // 11. delayedF -> complete
  run({ type: 'keyPress', note: 'F', keyId: 'F4' });
  return { state, cards, logs };
}

describe('Milestone 3B — First-Run C/F Guided Learning (Section 23)', () => {
  it('1. Brand-new user enters orientation instead of legacy Find C', () => {
    const cards = Array.from(makeFreshCardPool().values());
    const decision = evaluateFirstRunCfEntry({
      cards,
      reviewLogs: [],
      learningProgress: [],
      lessonProgress: [],
      coldTests: []
    });

    expect(decision).toEqual({
      shouldEnter: true,
      reason: 'start'
    });
    expect(
      shouldEnterFirstRunCf({
        cards,
        reviewLogs: [],
        learningProgress: []
      })
    ).toBe(true);

    const initialState = createFirstRunCfState(undefined, 1_000);
    expect(initialState.step).toBe('orientation');
    expect(initialState.trialMode).toBe('model');

    const stripInfo = getFirstRunCfStepProgress(initialState.step);
    expect(stripInfo.headerMeta).toBe('ПЕРВЫЙ ЗАПУСК');
    expect(stripInfo.headerTitle).toBe('Знакомство с клавиатурой');
    expect(stripInfo.stepLabel).toBe('Шаг 1 из 11');
  });

  it('2. Existing legacy user with reviewLogs, card reps/trials, lessons, or coldTests does NOT enter first-run automatically', () => {
    const freshCards = Array.from(makeFreshCardPool().values());

    // Has reviewLogs
    expect(
      evaluateFirstRunCfEntry({
        cards: freshCards,
        reviewLogs: [{ id: 'log-1' }],
        learningProgress: []
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_legacy'
    });

    // Has card with reps > 0
    const cardsWithReps = makeFreshCardPool();
    cardsWithReps.get('find:C')!.reps = 1;
    expect(
      evaluateFirstRunCfEntry({
        cards: Array.from(cardsWithReps.values()),
        reviewLogs: [],
        learningProgress: []
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_legacy'
    });

    // Has card with stats.trials > 0
    const cardsWithTrials = makeFreshCardPool();
    cardsWithTrials.get('find:C')!.stats.trials = 1;
    expect(
      evaluateFirstRunCfEntry({
        cards: Array.from(cardsWithTrials.values()),
        reviewLogs: [],
        learningProgress: []
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_legacy'
    });

    // Has completed lesson
    expect(
      evaluateFirstRunCfEntry({
        cards: freshCards,
        reviewLogs: [],
        learningProgress: [],
        lessonProgress: [{ completed: true }]
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_legacy'
    });

    // Has coldTests
    expect(
      evaluateFirstRunCfEntry({
        cards: freshCards,
        reviewLogs: [],
        learningProgress: [],
        coldTests: [{ id: 'cold-1' }]
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_legacy'
    });
  });

  it('3. orientation, cModel, cGuided, cQualify, fModel, fGuided, fQualify, cfMix, and cfIdentify never mutate FSRS or Card.stats', () => {
    const { state, cards, logs } = advanceToStep('delayedC');

    expect(state.step).toBe('delayedC');
    expect(logs).toHaveLength(0);

    for (const card of cards.values()) {
      expect(card.reps).toBe(0);
      expect(card.stability).toBeNull();
      expect(card.difficulty).toBeNull();
      expect(card.dueAt).toBe(0);
      expect(card.lastReviewAt).toBe(0);
      expect(card.stats.trials).toBe(0);
      expect(card.stats.firstCorrect).toBe(0);
      expect(card.stats.firstWrong).toBe(0);
    }

    // Verify visual hints per step:
    // - cGuided highlights only the 2 black keys ['C#4', 'D#4'] without white-key labels
    const cGuided = advanceToStep('cGuided').state;
    expect(cGuided.structuralGuideKeyIds).toEqual(['C#4', 'D#4']);
    expect(cGuided.modelLabelKeyIds).toEqual([]);

    // - fGuided highlights only the 3 black keys ['F#4', 'G#4', 'A#4'] without white-key labels
    const fGuided = advanceToStep('fGuided').state;
    expect(fGuided.structuralGuideKeyIds).toEqual(['F#4', 'G#4', 'A#4']);
    expect(fGuided.modelLabelKeyIds).toEqual([]);
  });

  it('4 & 5. cQualify and fQualify require >= 2 distinct contexts without hint; repeating the same context does NOT pass', () => {
    // Test cQualify
    let { state } = advanceToStep('cQualify');
    expect(state.step).toBe('cQualify');
    expect(state.hintLevel).toBe(HINT_LEVEL.NONE);
    expect(state.structuralGuideKeyIds).toEqual([]);

    // 1st unhinted context: C3 (region-C3)
    let res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C3',
      at: 5_000
    });
    state = res.state;
    expect(res.outcome).toBe('progressed');
    expect(state.step).toBe('cQualify');
    expect(
      state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
        .independentUnhintedSuccesses
    ).toBe(1);

    // Repeating C3 in the same context (region-C3) does NOT count as error and does NOT pass cQualify
    res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C3',
      at: 6_000
    });
    state = res.state;
    expect(res.outcome).toBe('duplicate_context');
    expect(state.step).toBe('cQualify');
    expect(state.feedbackText).toBe(
      'Правильно, это C. Теперь найдите ещё одну C в другой части клавиатуры.'
    );
    expect(
      state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
        .independentUnhintedSuccesses
    ).toBe(1);

    // Pressing C in a second distinct context (C5 -> region-C5) completes cQualify -> fModel
    res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C5',
      at: 7_000
    });
    state = res.state;
    expect(res.outcome).toBe('advanced');
    expect(state.step).toBe('fModel');
    expect(
      state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
        .independentUnhintedSuccesses
    ).toBe(2);

    // Now advance to fQualify and verify the exact same rule for F
    state = advanceToStep('fQualify').state;
    expect(state.step).toBe('fQualify');

    res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'F',
      keyId: 'F2',
      at: 8_000
    });
    state = res.state;
    expect(res.outcome).toBe('progressed');
    expect(state.step).toBe('fQualify');

    // Duplicate F2 in fQualify
    res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'F',
      keyId: 'F2',
      at: 9_000
    });
    state = res.state;
    expect(res.outcome).toBe('duplicate_context');
    expect(state.step).toBe('fQualify');
    expect(state.feedbackText).toBe(
      'Правильно, это F. Теперь найдите ещё одну F в другой части клавиатуры.'
    );

    // Distinct F4 completes fQualify -> cfMix
    res = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'F',
      keyId: 'F4',
      at: 10_000
    });
    state = res.state;
    expect(res.outcome).toBe('advanced');
    expect(state.step).toBe('cfMix');
  });

  it('6. cfMix constrained selector avoids CCCC/FFFF blocks and purely mechanical CFCFCF', () => {
    const initialQueue = buildInitialCfMixQueue();
    expect(initialQueue).toHaveLength(CF_MIX_SUCCESS_TARGET);
    expect(isConstrainedCfMixSequence(initialQueue)).toBe(true);

    // Rejects CCCC / FFFF and mechanical CFCF
    expect(isConstrainedCfMixSequence(['C', 'C', 'C', 'F'])).toBe(false);
    expect(isConstrainedCfMixSequence(['F', 'F', 'F', 'C'])).toBe(false);
    expect(isConstrainedCfMixSequence(['C', 'F', 'C', 'F'])).toBe(false);
    expect(isConstrainedCfMixSequence(['F', 'C', 'F', 'C'])).toBe(false);

    // Even when missed notes are re-queued, 3-in-a-row runs are prevented
    const rescheduled = scheduleMissedMixNote(['C', 'C'], 'C');
    for (let i = 2; i < rescheduled.length; i++) {
      expect(
        rescheduled[i] === rescheduled[i - 1] &&
          rescheduled[i - 1] === rescheduled[i - 2]
      ).toBe(false);
    }
  });

  it('7. Error in cfMix shows contrast explanation, requires corrective press, does not count as independent success, and re-schedules missed note after intervening item', () => {
    let { state } = advanceToStep('cfMix');
    expect(state.step).toBe('cfMix');
    expect(state.targetNote).toBe('C');

    // User presses F when prompted for C
    const wrongRes = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'F',
      keyId: 'F4',
      at: 15_000
    });
    state = wrongRes.state;

    expect(wrongRes.outcome).toBe('wrong_note');
    expect(wrongRes.trialContext?.mode).toBe('mixedRetrieval');
    expect(wrongRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(state.awaitingCorrective).toBe(true);
    expect(state.trialMode).toBe('corrective');
    expect(state.feedbackText).toBe(
      'Это F — она слева от группы из 3 чёрных. Для C ищите группу из 2.'
    );
    expect(state.structuralGuideKeyIds).toEqual(['C#4', 'D#4']);
    expect(state.mixCSuccesses).toBe(0);
    expect(
      state.progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF]
        .independentUnhintedSuccesses
    ).toBe(0);

    // Corrective press on C4
    const correctiveRes = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C4',
      at: 16_000
    });
    state = correctiveRes.state;

    expect(correctiveRes.outcome).toBe('corrective_completed');
    expect(correctiveRes.trialContext?.mode).toBe('corrective');
    expect(correctiveRes.trialContext?.firstAttempt).toBe(false);
    expect(correctiveRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(state.awaitingCorrective).toBe(false);
    // Corrective press did NOT increment independent successes
    expect(state.mixCSuccesses).toBe(0);
    expect(
      state.progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF]
        .independentUnhintedSuccesses
    ).toBe(0);

    // Next item is an intervening F, followed by the rescheduled C
    expect(state.mixQueue[0]).toBe('F');
    expect(state.mixQueue[1]).toBe('C');
  });

  it('8. cfIdentify enforces Milestone 1 input routing (answerButton + pcNote allowed, pianoKey + midi blocked) and does not activate identify FSRS cards', () => {
    expect(canUseInputForFirstRunStep('cfIdentify', 'answerButton')).toBe(true);
    expect(canUseInputForFirstRunStep('cfIdentify', 'pcNote')).toBe(true);
    expect(canUseInputForFirstRunStep('cfIdentify', 'pianoKey')).toBe(false);
    expect(canUseInputForFirstRunStep('cfIdentify', 'midi')).toBe(false);

    let { state, cards } = advanceToStep('cfIdentify');
    expect(state.step).toBe('cfIdentify');
    expect(state.targetNote).toBe('C');
    expect(state.identifyTargetKeyId).toBe('C4');

    // Piano click is ignored in cfIdentify
    const pianoAttempt = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C4',
      inputMethod: 'screen'
    });
    expect(pianoAttempt.ignoredInput).toBe(true);
    expect(pianoAttempt.outcome).toBe('ignored');
    expect(pianoAttempt.state.step).toBe('cfIdentify');

    // MIDI press is ignored in cfIdentify
    const midiAttempt = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C4',
      inputMethod: 'midi'
    });
    expect(midiAttempt.ignoredInput).toBe(true);
    expect(midiAttempt.outcome).toBe('ignored');

    // Answer button for C succeeds
    const btnAttempt = advanceFirstRunCf(state, {
      type: 'semanticAnswer',
      note: 'C',
      channel: 'answerButton',
      at: 20_000
    });
    state = btnAttempt.state;
    expect(btnAttempt.ignoredInput).toBe(false);
    expect(btnAttempt.outcome).toBe('progressed');
    expect(state.step).toBe('cfIdentify');
    expect(state.targetNote).toBe('F');

    // PC keyboard for F succeeds and advances to delayedC
    const pcAttempt = advanceFirstRunCf(state, {
      type: 'semanticAnswer',
      note: 'F',
      channel: 'pcNote',
      at: 21_000
    });
    state = pcAttempt.state;
    expect(pcAttempt.ignoredInput).toBe(false);
    expect(pcAttempt.outcome).toBe('advanced');
    expect(state.step).toBe('delayedC');

    // identify:C and identify:F FSRS cards remain untouched
    expect(cards.get('identify:C')!.reps).toBe(0);
    expect(cards.get('identify:F')!.reps).toBe(0);
  });

  it('9. delayedCheck with H1/H2/H3 (or Dont Know) does NOT mutate FSRS and requires a repeated H0 delayedCheck after an intervening step', () => {
    const { state: initialDelayedC, cards, logs } = advanceToStep('delayedC');
    let state = initialDelayedC;
    expect(state.step).toBe('delayedC');

    // Learner clicks 'Don't know' on delayedC -> switches to H2 visual cue remediation
    const dontKnowRes = applyFirstRunCfActionWithCards({
      state,
      action: { type: 'dontKnow', at: 30_000, sessionId: 'session-test' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = dontKnowRes.state;
    expect(dontKnowRes.outcome).toBe('remediation_activated');
    expect(dontKnowRes.trialContext?.mode).toBe('delayedCheck');
    expect(dontKnowRes.trialContext?.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(dontKnowRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(dontKnowRes.attemptResult).toBeNull();
    expect(state.structuralGuideKeyIds).toEqual(['C#4', 'D#4']);
    expect(cards.get('find:C')!.reps).toBe(0);

    // Learner presses C4 with H2 hint active -> no FSRS mutation, advances to delayedF as intervening step
    const hintedPressRes = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'C',
        keyId: 'C4',
        at: 31_000,
        sessionId: 'session-test'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = hintedPressRes.state;
    expect(hintedPressRes.outcome).toBe('remediation_completed');
    expect(hintedPressRes.trialContext?.mode).toBe('delayedCheck');
    expect(hintedPressRes.trialContext?.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(hintedPressRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(hintedPressRes.attemptResult).toBeNull();
    expect(cards.get('find:C')!.reps).toBe(0);
    expect(cards.get('find:C')!.stability).toBeNull();
    expect(state.step).toBe('delayedF');
    expect(state.delayedQueue).toEqual(['F', 'C']);

    // Learner passes delayedF at H0 -> mutates find:F, then returns to delayedC for unhinted H0 check!
    const passFRes = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'F',
        keyId: 'F4',
        at: 32_000,
        sessionId: 'session-test'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = passFRes.state;
    expect(cards.get('find:F')!.reps).toBe(1);
    expect(cards.get('find:C')!.reps).toBe(0);
    expect(state.step).toBe('delayedC');
    expect(state.hintLevel).toBe(HINT_LEVEL.NONE);

    // Now learner passes delayedC at H0 -> mutates find:C and completes first-run!
    const passCRes = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'C',
        keyId: 'C3',
        at: 33_000,
        sessionId: 'session-test'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = passCRes.state;
    expect(cards.get('find:C')!.reps).toBe(1);
    expect(state.step).toBe('complete');
  });

  it('10. delayedC and delayedF at H0 mutate find:C and find:F FSRS for the first time and transition anchors to retention', () => {
    const { state, cards, logs } = advanceToStep('complete');

    expect(state.step).toBe('complete');
    expect(logs).toHaveLength(2);

    const findC = cards.get('find:C')!;
    const findF = cards.get('find:F')!;

    expect(findC.reps).toBe(1);
    expect(findC.stability).toBeGreaterThan(0);
    expect(findC.difficulty).toBeGreaterThan(0);
    expect(findC.dueAt).toBeGreaterThan(0);
    expect(findC.stats.trials).toBe(1);
    expect(findC.stats.firstCorrect).toBe(1);

    expect(findF.reps).toBe(1);
    expect(findF.stability).toBeGreaterThan(0);
    expect(findF.difficulty).toBeGreaterThan(0);
    expect(findF.dueAt).toBeGreaterThan(0);
    expect(findF.stats.trials).toBe(1);
    expect(findF.stats.firstCorrect).toBe(1);

    expect(logs[0].cardId).toBe('find:C');
    expect(logs[0].trialMode).toBe('delayedCheck');
    expect(logs[0].hintLevel).toBe(HINT_LEVEL.NONE);
    expect(logs[0].gradeableByFsrs).toBe(true);

    expect(logs[1].cardId).toBe('find:F');
    expect(logs[1].trialMode).toBe('delayedCheck');
    expect(logs[1].hintLevel).toBe(HINT_LEVEL.NONE);
    expect(logs[1].gradeableByFsrs).toBe(true);

    expect(state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C].state).toBe(
      'retention'
    );
    expect(state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_F].state).toBe(
      'retention'
    );
    expect(isFirstRunCfCompleted(Object.values(state.progress))).toBe(true);
  });

  it('11. Wrong answer in delayedC/delayedF at H0 grades Again (1) once, and the corrective press does NOT trigger a second FSRS grade', () => {
    const { state: initialDelayedC, cards, logs } = advanceToStep('delayedC');
    let state = initialDelayedC;

    // Wrong answer on delayedC at H0 (user presses F4 instead of C)
    const wrongDelayed = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'F',
        keyId: 'F4',
        at: 40_000,
        sessionId: 'session-test'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = wrongDelayed.state;
    if (wrongDelayed.attemptResult?.logEvent) {
      logs.push(wrongDelayed.attemptResult.logEvent);
    }

    const findC = cards.get('find:C')!;
    expect(wrongDelayed.outcome).toBe('wrong_note');
    expect(wrongDelayed.attemptResult).not.toBeNull();
    expect(wrongDelayed.attemptResult?.logEvent?.grade).toBe(1);
    expect(wrongDelayed.attemptResult?.logEvent?.gradeName).toBe('Again');
    expect(findC.reps).toBe(1);
    expect(findC.lapses).toBe(1);
    expect(findC.stats.trials).toBe(1);
    expect(findC.stats.firstWrong).toBe(1);
    expect(state.step).toBe('delayedC');
    expect(state.awaitingCorrective).toBe(true);

    const stabilityAfterFirst = findC.stability;
    const dueAtAfterFirst = findC.dueAt;

    // Subsequent corrective press on C4 must NOT mutate FSRS or Card.stats a second time
    const correctivePress = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'C',
        keyId: 'C4',
        at: 41_000,
        sessionId: 'session-test'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    state = correctivePress.state;

    expect(correctivePress.outcome).toBe('corrective_completed');
    expect(correctivePress.trialContext?.mode).toBe('corrective');
    expect(correctivePress.trialContext?.gradeableByFsrs).toBe(false);
    expect(correctivePress.attemptResult).toBeNull();
    expect(findC.reps).toBe(1);
    expect(findC.lapses).toBe(1);
    expect(findC.stability).toBe(stabilityAfterFirst);
    expect(findC.dueAt).toBe(dueAtAfterFirst);
    expect(findC.stats.trials).toBe(1);
    expect(logs).toHaveLength(1);
    expect(state.step).toBe('delayedF');
  });

  it('12. Reload during first-run restores current step from persisted learningProgress records, and reload after completion does NOT re-enter first-run', () => {
    const testDb = new PianoTrainerDatabase('PianoTrainerFirstRunSchemaTest');
    expect(testDb.tables.some(t => t.name === 'learningProgress')).toBe(true);

    // 1) Advance to fGuided and serialize progress records (simulating db.learningProgress.toArray())
    const midFlow = advanceToStep('fGuided');
    const persistedMidRecords = JSON.parse(
      JSON.stringify(Object.values(midFlow.state.progress))
    );

    const entryDecision = evaluateFirstRunCfEntry({
      cards: Array.from(midFlow.cards.values()),
      reviewLogs: midFlow.logs,
      learningProgress: persistedMidRecords
    });
    expect(entryDecision).toEqual({
      shouldEnter: true,
      reason: 'resume'
    });

    const resumedState = createFirstRunCfState(persistedMidRecords, 50_000);
    expect(resumedState.step).toBe('fGuided');
    expect(resumedState.structuralGuideKeyIds).toEqual(['F#4', 'G#4', 'A#4']);

    // 2) Even if user reloads on delayedF (after delayedC already mutated find:C and created 1 reviewLog),
    // incomplete first-run progress still resumes on delayedF!
    const atDelayedF = advanceToStep('delayedF');
    const persistedAtDelayedF = JSON.parse(
      JSON.stringify(Object.values(atDelayedF.state.progress))
    );
    expect(
      evaluateFirstRunCfEntry({
        cards: Array.from(atDelayedF.cards.values()),
        reviewLogs: atDelayedF.logs,
        learningProgress: persistedAtDelayedF
      })
    ).toEqual({
      shouldEnter: true,
      reason: 'resume'
    });
    expect(createFirstRunCfState(persistedAtDelayedF).step).toBe('delayedF');

    // 3) Once first-run completes, reload skips first-run with 'skip_completed'
    const completedFlow = advanceToStep('complete');
    const persistedCompleted = JSON.parse(
      JSON.stringify(Object.values(completedFlow.state.progress))
    );
    expect(
      evaluateFirstRunCfEntry({
        cards: Array.from(completedFlow.cards.values()),
        reviewLogs: completedFlow.logs,
        learningProgress: persistedCompleted
      })
    ).toEqual({
      shouldEnter: false,
      reason: 'skip_completed'
    });

    // 4) After clearing DB (Reset all progress), user re-enters first-run from 'orientation'
    expect(
      evaluateFirstRunCfEntry({
        cards: Array.from(makeFreshCardPool().values()),
        reviewLogs: [],
        learningProgress: []
      })
    ).toEqual({
      shouldEnter: true,
      reason: 'start'
    });
    expect(createFirstRunCfState([]).step).toBe('orientation');
  });

  it('13. H2 Hint Integrity: cGuided, fGuided, and all H2 remediations highlight ONLY the black-key group and never highlight or label the target white key', () => {
    // H3 MODEL: target white key is highlighted and labeled
    const cModelSpec = getFirstRunDiagramSpec(advanceToStep('cModel').state);
    expect(cModelSpec.kind).toBe('landmark');
    expect(cModelSpec.blackGroupSize).toBe(2);
    expect(cModelSpec.highlightTargetWhite).toBe(true);
    expect(cModelSpec.targetWhiteLabel).toBe('C · До');

    const fModelSpec = getFirstRunDiagramSpec(advanceToStep('fModel').state);
    expect(fModelSpec.kind).toBe('landmark');
    expect(fModelSpec.blackGroupSize).toBe(3);
    expect(fModelSpec.highlightTargetWhite).toBe(true);
    expect(fModelSpec.targetWhiteLabel).toBe('F · Фа');

    // H2 GUIDED: only black-key group highlighted, target white is neutral, NO C/F label
    const cGuidedSpec = getFirstRunDiagramSpec(advanceToStep('cGuided').state);
    expect(cGuidedSpec.kind).toBe('landmark');
    expect(cGuidedSpec.blackGroupSize).toBe(2);
    expect(cGuidedSpec.highlightTargetWhite).toBe(false);
    expect(cGuidedSpec.targetWhiteLabel).toBeNull();
    expect(cGuidedSpec.caption).toBe('белая сразу слева');

    const fGuidedSpec = getFirstRunDiagramSpec(advanceToStep('fGuided').state);
    expect(fGuidedSpec.kind).toBe('landmark');
    expect(fGuidedSpec.blackGroupSize).toBe(3);
    expect(fGuidedSpec.highlightTargetWhite).toBe(false);
    expect(fGuidedSpec.targetWhiteLabel).toBeNull();
    expect(fGuidedSpec.caption).toBe('белая сразу слева');

    // H2 REMEDIATION across cQualify, fQualify, cfMix, cfIdentify, delayedC, delayedF
    const remediationSteps: FirstRunCfStep[] = [
      'cQualify',
      'fQualify',
      'cfMix',
      'cfIdentify',
      'delayedC',
      'delayedF'
    ];

    for (const step of remediationSteps) {
      const baseState = advanceToStep(step).state;
      // Before remediation (H0), no landmark diagram is shown
      expect(getFirstRunDiagramSpec(baseState).kind).toBe('none');

      // Trigger H2 remediation via Don't know
      const remediated = advanceFirstRunCf(baseState, {
        type: 'dontKnow',
        at: 60_000
      }).state;
      const remSpec = getFirstRunDiagramSpec(remediated);
      expect(remSpec.kind).toBe('landmark');
      expect(remSpec.highlightTargetWhite).toBe(false);
      expect(remSpec.targetWhiteLabel).toBeNull();
      expect(remSpec.caption).toBe('белая сразу слева');
    }
  });

  it('14. C6 landmark policy: C6 is not highlighted in cModel and does not count as a qualifying context on the 4-octave keyboard', () => {
    const cModelState = advanceToStep('cModel').state;
    expect(cModelState.modelLabelKeyIds).toEqual(['C2', 'C3', 'C4', 'C5']);
    expect(cModelState.modelLabelKeyIds).toEqual([
      ...FIRST_RUN_C_LANDMARK_KEY_IDS
    ]);
    expect(cModelState.modelLabelKeyIds).not.toContain('C6');

    // Pressing C6 in cModel does not advance cModel
    const cModelC6 = advanceFirstRunCf(cModelState, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C6',
      at: 10_000
    });
    expect(cModelC6.state.step).toBe('cModel');
    expect(cModelC6.outcome).toBe('duplicate_context');

    // Pressing C6 in cQualify does NOT count as a qualifying context
    let cQualifyState = advanceToStep('cQualify').state;
    const firstValid = advanceFirstRunCf(cQualifyState, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C3',
      at: 11_000
    });
    cQualifyState = firstValid.state;
    expect(
      getUnhintedAnchorContexts(
        cQualifyState.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
      )
    ).toEqual(['region-C3']);

    const edgeAttempt = advanceFirstRunCf(cQualifyState, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C6',
      at: 12_000
    });
    expect(edgeAttempt.outcome).toBe('duplicate_context');
    expect(edgeAttempt.state.step).toBe('cQualify');
    expect(
      edgeAttempt.state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
        .independentUnhintedSuccesses
    ).toBe(1);
    expect(
      getUnhintedAnchorContexts(
        edgeAttempt.state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
      )
    ).toEqual(['region-C3']);
  });

  it('15. cfMix resume: after first successful target = C and reload, mixCSuccesses = 1 and mixFSuccesses = 0', () => {
    let { state } = advanceToStep('cfMix');
    expect(state.step).toBe('cfMix');
    expect(state.targetNote).toBe('C');

    // First successful target = C
    const firstMix = advanceFirstRunCf(state, {
      type: 'keyPress',
      note: 'C',
      keyId: 'C4',
      at: 25_000
    });
    state = firstMix.state;
    expect(state.step).toBe('cfMix');
    expect(state.mixCSuccesses).toBe(1);
    expect(state.mixFSuccesses).toBe(0);

    // Simulate reload from persisted learningProgress records
    const persistedRecords = JSON.parse(
      JSON.stringify(Object.values(state.progress))
    );
    const resumed = createFirstRunCfState(persistedRecords, 26_000);

    expect(resumed.step).toBe('cfMix');
    expect(resumed.mixCSuccesses).toBe(1);
    expect(resumed.mixFSuccesses).toBe(0);
    expect(resumed.mixHistory).toEqual(['C']);
    expect(resumed.targetNote).toBe('F');
  });

  it('16. Guard markFsrsActivated() against missing find:C card: no FSRS and no retention transition when card is absent', () => {
    const { state, cards, logs } = advanceToStep('delayedC');
    expect(state.step).toBe('delayedC');
    expect(state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C].state).toBe(
      'mixReady'
    );

    // Remove find:C from the card pool
    cards.delete('find:C');

    const res = applyFirstRunCfActionWithCards({
      state,
      action: {
        type: 'keyPress',
        note: 'C',
        keyId: 'C4',
        at: 50_000,
        sessionId: 'session-missing-card'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });

    expect(res.attemptResult).toBeNull();
    expect(res.mutatedCard).toBeNull();
    expect(res.updatedProgress).toEqual([]);
    expect(res.state.step).toBe('delayedC');
    expect(res.state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C].state).toBe(
      'mixReady'
    );
  });

  it('17. FIND first-run steps allow screen piano & MIDI and reject PC note & answerButton', () => {
    const findSteps: FirstRunCfStep[] = [
      'cModel',
      'cGuided',
      'cQualify',
      'fModel',
      'fGuided',
      'fQualify',
      'cfMix',
      'delayedC',
      'delayedF'
    ];

    for (const step of findSteps) {
      expect(canUseInputForFirstRunStep(step, 'pianoKey')).toBe(true);
      expect(canUseInputForFirstRunStep(step, 'midi')).toBe(true);
      expect(canUseInputForFirstRunStep(step, 'pcNote')).toBe(false);
      expect(canUseInputForFirstRunStep(step, 'answerButton')).toBe(false);

      const stepState = advanceToStep(step).state;
      const target = stepState.targetNote ?? 'C';

      // PC note semantic input is ignored
      const pcAttempt = advanceFirstRunCf(stepState, {
        type: 'semanticAnswer',
        note: target,
        channel: 'pcNote'
      });
      expect(pcAttempt.ignoredInput).toBe(true);
      expect(pcAttempt.outcome).toBe('ignored');

      // Answer button semantic input is ignored
      const btnAttempt = advanceFirstRunCf(stepState, {
        type: 'semanticAnswer',
        note: target,
        channel: 'answerButton'
      });
      expect(btnAttempt.ignoredInput).toBe(true);
      expect(btnAttempt.outcome).toBe('ignored');

      // MIDI physical key input is accepted
      const midiAttempt = advanceFirstRunCf(stepState, {
        type: 'keyPress',
        note: target,
        keyId: `${target}4`,
        inputMethod: 'midi'
      });
      expect(midiAttempt.ignoredInput).toBe(false);
    }
  });

  it('18. First-run enforces no countdown policy and milestone/step-based progress', () => {
    for (const step of FIRST_RUN_CF_STEPS) {
      const policy = getFirstRunTimingPolicy(step);
      expect(policy).toEqual({
        hasSessionCountdown: false,
        hasAutoAdvanceTimer: false,
        usesLatencyGrading: false,
        progressMode: 'milestone_step'
      });

      const progressInfo = getFirstRunCfStepProgress(step);
      expect(progressInfo.headerMeta).toBe('ПЕРВЫЙ ЗАПУСК');
      expect(progressInfo.headerTitle).toBe('Знакомство с клавиатурой');
      expect(progressInfo.totalSteps).toBe(11);
      expect(progressInfo.stepNumber).toBeGreaterThanOrEqual(1);
      expect(progressInfo.stepNumber).toBeLessThanOrEqual(11);
      expect(progressInfo.progressPct).toBeGreaterThan(0);
      expect(progressInfo.progressPct).toBeLessThanOrEqual(100);
    }
  });

  it('19. Enter does not trigger hidden Dont know in MODEL/GUIDED steps, and only triggers actions where explicitly allowed', () => {
    const hiddenDontKnowSteps: FirstRunCfStep[] = [
      'orientation',
      'cModel',
      'cGuided',
      'fModel',
      'fGuided',
      'complete'
    ];

    for (const step of hiddenDontKnowSteps) {
      expect(canUseDontKnowInFirstRunStep(step)).toBe(false);
      const state = advanceToStep(step).state;
      expect(canUseDontKnowInFirstRunStep(state)).toBe(false);

      if (step === 'orientation') {
        expect(resolveFirstRunKeydownAction(state, 'Enter')).toEqual({
          type: 'continue'
        });
        expect(resolveFirstRunKeydownAction(state, ' ', 'Space')).toEqual({
          type: 'continue'
        });
      } else if (step === 'complete') {
        expect(resolveFirstRunKeydownAction(state, 'Enter')).toEqual({
          type: 'completeFirstRun'
        });
        expect(resolveFirstRunKeydownAction(state, ' ', 'Space')).toEqual({
          type: 'completeFirstRun'
        });
      } else {
        // MODEL and GUIDED steps: Enter and Space must NOT trigger Don't know or remediation
        expect(resolveFirstRunKeydownAction(state, 'Enter')).toBeNull();
        expect(resolveFirstRunKeydownAction(state, ' ', 'Space')).toBeNull();
      }

      // Direct dispatch of dontKnow in MODEL/GUIDED is also ignored by the state machine
      const directRes = advanceFirstRunCf(state, { type: 'dontKnow' });
      expect(directRes.ignoredInput).toBe(true);
      expect(directRes.outcome).toBe('ignored');
      expect(directRes.state.awaitingRemediationPress).toBe(false);
    }

    const visibleDontKnowSteps: FirstRunCfStep[] = [
      'cQualify',
      'fQualify',
      'cfMix',
      'cfIdentify',
      'delayedC',
      'delayedF'
    ];

    for (const step of visibleDontKnowSteps) {
      expect(canUseDontKnowInFirstRunStep(step)).toBe(true);
      const state = advanceToStep(step).state;
      expect(canUseDontKnowInFirstRunStep(state)).toBe(true);
      expect(resolveFirstRunKeydownAction(state, 'Enter')).toEqual({
        type: 'dontKnow'
      });

      // Once remediation is active, Don't know is hidden and Enter no longer re-triggers it
      const remediated = advanceFirstRunCf(state, { type: 'dontKnow' }).state;
      expect(canUseDontKnowInFirstRunStep(remediated)).toBe(false);
      expect(resolveFirstRunKeydownAction(remediated, 'Enter')).toBeNull();
    }
  });
});
