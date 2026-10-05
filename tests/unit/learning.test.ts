import { describe, it, expect } from 'vitest';
import {
  HINT_LEVEL,
  createInitialLearningProgress,
  reduceLearningProgress,
  recordModelCompleted,
  recordGuidedAttempt,
  recordIndependentAttempt,
  markMixReady,
  markFsrsActivated,
  appendUniqueContext,
  normalizeBackupLearningProgress,
  deriveFsrsEligibility,
  isTrialFsrsEligible,
  createTrialContext,
  normalizeTrialContext,
  createLegacyTrialContext,
  legacyReviewKindToTrialMode,
  type TrialContext
} from '../../src/core/learning';
import {
  applyReviewAndBuildLog,
  submitQuestionAttempt,
  type QuestionRoundState
} from '../../src/core/fsrs/reviewLog';
import { DAY_MS } from '../../src/core/fsrs/constants';
import type { Card } from '../../src/core/fsrs/types';
import { db, DB_V1_STORES, DB_V2_STORES, PianoTrainerDatabase } from '../../src/storage/db';

function makeFreshCard(
  id = 'find:C',
  skill: Card['skill'] = 'find',
  note: Card['note'] = 'C'
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

const DEFAULT_TEST_SETTINGS = {
  desiredRetention: 0.9,
  maxIntervalDays: 120,
  relearningSeconds: 45,
  useLatencyGrading: false
};

describe('Milestone 3A — TrialPolicy & FSRS Eligibility (Section 18)', () => {
  it('A. MODEL (mode=model, H3, firstAttempt=true) is NOT FSRS-eligible', () => {
    const ctx = createTrialContext({
      mode: 'model',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.MODEL_VISIBLE,
      firstAttempt: true
    });

    expect(ctx.gradeableByFsrs).toBe(false);
    expect(isTrialFsrsEligible(ctx)).toBe(false);
    expect(deriveFsrsEligibility(ctx)).toEqual({
      eligible: false,
      reason: 'ineligible_mode'
    });

    // Even if a caller attempts to force gradeableByFsrs: true, policy overrides it
    const forged: TrialContext = { ...ctx, gradeableByFsrs: true };
    expect(isTrialFsrsEligible(forged)).toBe(false);
    expect(normalizeTrialContext(forged).gradeableByFsrs).toBe(false);
  });

  it('B. GUIDED at any hint level (H0, H1, H2, H3) is NOT FSRS-eligible', () => {
    for (const hintLevel of [
      HINT_LEVEL.NONE,
      HINT_LEVEL.VERBAL_CUE,
      HINT_LEVEL.VISUAL_CUE,
      HINT_LEVEL.MODEL_VISIBLE
    ]) {
      const ctx = createTrialContext({
        mode: 'guided',
        sessionId: 'session-1',
        cardId: 'find:C',
        hintLevel,
        firstAttempt: true
      });
      expect(ctx.gradeableByFsrs).toBe(false);
      expect(isTrialFsrsEligible(ctx)).toBe(false);
      expect(deriveFsrsEligibility(ctx).reason).toBe('ineligible_mode');
    }
  });

  it('C. QUALIFY even at H0 independent firstAttempt is NOT FSRS-eligible in 3A', () => {
    const ctx = createTrialContext({
      mode: 'qualify',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    expect(ctx.gradeableByFsrs).toBe(false);
    expect(isTrialFsrsEligible(ctx)).toBe(false);
    expect(deriveFsrsEligibility(ctx)).toEqual({
      eligible: false,
      reason: 'ineligible_mode'
    });
  });

  it('D. DELAYED_CHECK at H0 firstAttempt with card IS FSRS-eligible', () => {
    const ctx = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    expect(ctx.gradeableByFsrs).toBe(true);
    expect(isTrialFsrsEligible(ctx)).toBe(true);
    expect(deriveFsrsEligibility(ctx)).toEqual({
      eligible: true,
      reason: 'eligible_delayed_check'
    });
  });

  it('E. DELAYED_CHECK with hint (H1, H2, H3) is NOT FSRS-eligible', () => {
    for (const hintLevel of [
      HINT_LEVEL.VERBAL_CUE,
      HINT_LEVEL.VISUAL_CUE,
      HINT_LEVEL.MODEL_VISIBLE
    ]) {
      const ctx = createTrialContext({
        mode: 'delayedCheck',
        sessionId: 'session-1',
        cardId: 'find:C',
        hintLevel,
        firstAttempt: true
      });
      expect(ctx.gradeableByFsrs).toBe(false);
      expect(isTrialFsrsEligible(ctx)).toBe(false);
      expect(deriveFsrsEligibility(ctx)).toEqual({
        eligible: false,
        reason: 'ineligible_hinted'
      });
    }
  });

  it('F. DELAYED_CHECK corrective/non-first attempt or missing card is NOT FSRS-eligible', () => {
    const nonFirst = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: false
    });
    expect(nonFirst.gradeableByFsrs).toBe(false);
    expect(isTrialFsrsEligible(nonFirst)).toBe(false);
    expect(deriveFsrsEligibility(nonFirst)).toEqual({
      eligible: false,
      reason: 'ineligible_non_first_attempt'
    });

    const missingCard = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-1',
      itemId: 'keyboard-geometry:two-black',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });
    expect(missingCard.gradeableByFsrs).toBe(false);
    expect(deriveFsrsEligibility(missingCard)).toEqual({
      eligible: false,
      reason: 'ineligible_missing_card'
    });
  });

  it('G. SCHEDULED_REVIEW first attempt is FSRS-eligible (and non-first attempt is not)', () => {
    const first = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });
    expect(first.gradeableByFsrs).toBe(true);
    expect(isTrialFsrsEligible(first)).toBe(true);
    expect(deriveFsrsEligibility(first)).toEqual({
      eligible: true,
      reason: 'eligible_scheduled_review'
    });

    const second = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: false
    });
    expect(second.gradeableByFsrs).toBe(false);
    expect(deriveFsrsEligibility(second).reason).toBe('ineligible_non_first_attempt');

    // H1, H2, and H3 scheduledReview first attempts ARE FSRS-eligible (graded Again)
    for (const hintLevel of [
      HINT_LEVEL.VERBAL_CUE,
      HINT_LEVEL.VISUAL_CUE,
      HINT_LEVEL.MODEL_VISIBLE
    ]) {
      const hintedScheduled = createTrialContext({
        mode: 'scheduledReview',
        sessionId: 'session-1',
        cardId: 'find:C',
        hintLevel,
        firstAttempt: true
      });
      expect(hintedScheduled.gradeableByFsrs).toBe(true);
      expect(isTrialFsrsEligible(hintedScheduled)).toBe(true);
      expect(deriveFsrsEligibility(hintedScheduled)).toEqual({
        eligible: true,
        reason: 'eligible_scheduled_review'
      });
    }
  });

  it('H. CORRECTIVE is NOT FSRS-eligible', () => {
    const ctx = createTrialContext({
      mode: 'corrective',
      sessionId: 'session-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: false
    });
    expect(ctx.gradeableByFsrs).toBe(false);
    expect(isTrialFsrsEligible(ctx)).toBe(false);
  });

  it('I. COLD_TEST is NOT FSRS-eligible', () => {
    const ctx = createTrialContext({
      mode: 'coldTest',
      sessionId: 'cold-1',
      cardId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });
    expect(ctx.gradeableByFsrs).toBe(false);
    expect(isTrialFsrsEligible(ctx)).toBe(false);
  });

  it('J. FREE_PRACTICE, MIXED_RETRIEVAL, and TRANSFER are NOT FSRS-eligible in 3A', () => {
    for (const mode of ['freePractice', 'mixedRetrieval', 'transfer'] as const) {
      const ctx = createTrialContext({
        mode,
        sessionId: 'session-1',
        cardId: 'find:C',
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true
      });
      expect(ctx.gradeableByFsrs).toBe(false);
      expect(isTrialFsrsEligible(ctx)).toBe(false);
      expect(deriveFsrsEligibility(ctx).reason).toBe('ineligible_mode');
    }
  });
});

describe('Milestone 3A — LearningProgress Reducer & Transitions (Section 19)', () => {
  it('A. Initializes fresh item with unseen state and zeroed counters', () => {
    const p = createInitialLearningProgress('keyboard-anchor:C', 1000);
    expect(p).toEqual({
      id: 'keyboard-anchor:C',
      itemId: 'keyboard-anchor:C',
      state: 'unseen',
      modelCompleted: false,
      guidedSuccesses: 0,
      independentUnhintedSuccesses: 0,
      contexts: [],
      currentHintLevel: HINT_LEVEL.NONE,
      updatedAt: 1000
    });
  });

  it('B. Model completion transitions state to introduced and sets modelCompleted = true', () => {
    const initial = createInitialLearningProgress('keyboard-anchor:C', 1000);
    const afterModel = recordModelCompleted(initial, 2000, 'octave-C4');

    expect(afterModel.state).toBe('introduced');
    expect(afterModel.modelCompleted).toBe(true);
    expect(afterModel.introducedAt).toBe(2000);
    expect(afterModel.currentHintLevel).toBe(HINT_LEVEL.MODEL_VISIBLE);
    expect(afterModel.contexts).toEqual(['octave-C4']);
    expect(afterModel.updatedAt).toBe(2000);
  });

  it('C. Successful guided action transitions to guided and increments guidedSuccesses', () => {
    let p = createInitialLearningProgress('keyboard-anchor:F', 1000);
    p = recordModelCompleted(p, 1500);
    p = recordGuidedAttempt(p, {
      correct: true,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      contextId: 'keyboard-region-middle',
      at: 2500
    });

    expect(p.state).toBe('guided');
    expect(p.guidedSuccesses).toBe(1);
    expect(p.contexts).toEqual(['keyboard-region-middle']);

    // Failed guided action does not increment guidedSuccesses
    p = recordGuidedAttempt(p, {
      correct: false,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      contextId: 'keyboard-region-right',
      at: 3000
    });
    expect(p.guidedSuccesses).toBe(1);
    expect(p.contexts).toEqual(['keyboard-region-middle']);
  });

  it('D. Hinted independent attempt does NOT increment independentUnhintedSuccesses', () => {
    let p = createInitialLearningProgress('find:C', 1000);
    p = recordIndependentAttempt(p, {
      correct: true,
      hinted: true,
      hintLevel: HINT_LEVEL.VERBAL_CUE,
      contextId: 'octave-C4',
      at: 2000
    });

    expect(p.state).toBe('qualifying');
    expect(p.independentUnhintedSuccesses).toBe(0);
    expect(p.contexts).toEqual(['octave-C4']);
  });

  it('E. Unhinted correct independent attempt increments independentUnhintedSuccesses', () => {
    let p = createInitialLearningProgress('find:C', 1000);
    p = recordIndependentAttempt(p, {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: 'octave-C4',
      at: 2000
    });

    expect(p.state).toBe('qualifying');
    expect(p.independentUnhintedSuccesses).toBe(1);
    expect(p.currentHintLevel).toBe(HINT_LEVEL.NONE);
  });

  it('F. Context deduplication stores left, left, middle as two distinct contexts in order', () => {
    let p = createInitialLearningProgress('find:C', 1000);
    p = recordIndependentAttempt(p, {
      correct: true,
      hinted: false,
      contextId: 'left',
      at: 1100
    });
    p = recordIndependentAttempt(p, {
      correct: true,
      hinted: false,
      contextId: 'left',
      at: 1200
    });
    p = recordIndependentAttempt(p, {
      correct: true,
      hinted: false,
      contextId: 'middle',
      at: 1300
    });

    expect(p.contexts).toEqual(['left', 'middle']);
    expect(appendUniqueContext(['left', 'middle'], 'left')).toEqual(['left', 'middle']);
  });

  it('G. Incorrect independent attempt does not produce success, add context, or jump to mixReady', () => {
    let p = createInitialLearningProgress('find:F', 1000);
    p = recordIndependentAttempt(p, {
      correct: false,
      hinted: false,
      contextId: 'right',
      at: 2000
    });

    expect(p.state).toBe('qualifying');
    expect(p.independentUnhintedSuccesses).toBe(0);
    expect(p.contexts).toEqual([]);
    expect(p.mixReadyAt).toBeUndefined();
  });

  it('H. Explicit mix-ready and fsrsActivated transitions update acquisition state without touching FSRS Card', () => {
    const card = makeFreshCard('find:C', 'find', 'C');
    let p = createInitialLearningProgress(card.id, 1000);

    p = markMixReady(p, 3000);
    expect(p.state).toBe('mixReady');
    expect(p.mixReadyAt).toBe(3000);

    p = markFsrsActivated(p, 5000);
    expect(p.state).toBe('retention');
    expect(p.firstFsrsEligibleAt).toBe(5000);

    // Card memory state remains completely untouched
    expect(card.memoryState).toBe('new');
    expect(card.reps).toBe(0);
    expect(card.stability).toBeNull();
    expect(card.difficulty).toBeNull();
    expect(card.dueAt).toBe(0);

    // reduceLearningProgress is also directly callable
    const direct = reduceLearningProgress(
      createInitialLearningProgress('keyboard-geometry:two-black', 100),
      { type: 'modelCompleted', at: 200 }
    );
    expect(direct.state).toBe('introduced');
  });
});

describe('Milestone 3A — FSRS Boundary Enforcement (Section 20)', () => {
  it('1. MODEL, GUIDED, QUALIFY, and CORRECTIVE events never mutate FSRS or Card.stats even if kind is new/scheduled', () => {
    const modesAndHints = [
      { mode: 'model' as const, hintLevel: HINT_LEVEL.MODEL_VISIBLE, firstAttempt: true },
      { mode: 'guided' as const, hintLevel: HINT_LEVEL.VISUAL_CUE, firstAttempt: true },
      { mode: 'qualify' as const, hintLevel: HINT_LEVEL.NONE, firstAttempt: true },
      { mode: 'corrective' as const, hintLevel: HINT_LEVEL.NONE, firstAttempt: false }
    ];

    for (const item of modesAndHints) {
      const card = makeFreshCard('find:C', 'find', 'C');
      const initialStats = { ...card.stats };

      // Even if caller passes a forged gradeableByFsrs: true, runtime boundary blocks FSRS mutation
      const forgedContext: TrialContext = {
        mode: item.mode,
        sessionId: 'session-acq',
        cardId: card.id,
        itemId: card.id,
        hintLevel: item.hintLevel,
        firstAttempt: item.firstAttempt,
        inputMethod: 'screen',
        gradeableByFsrs: true
      };

      const res = applyReviewAndBuildLog({
        card,
        kind: 'new',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: 1_700_000_000_000,
        trialContext: forgedContext
      });

      expect(res.fsrsResult).toBeNull();
      expect(res.fsrsEligibility.eligible).toBe(false);
      expect(res.statsUpdated).toBe(false);
      expect(res.cardMutated).toBe(false);
      expect(res.logEvent.gradeableByFsrs).toBe(false);
      expect(res.logEvent.trialMode).toBe(item.mode);

      expect(card.reps).toBe(0);
      expect(card.stability).toBeNull();
      expect(card.difficulty).toBeNull();
      expect(card.dueAt).toBe(0);
      expect(card.lastReviewAt).toBe(0);
      expect(card.stats).toEqual(initialStats);
    }
  });

  it('2. Eligible DELAYED_CHECK (H0, firstAttempt) and SCHEDULED_REVIEW mutate FSRS exactly once', () => {
    const card = makeFreshCard('find:C', 'find', 'C');
    const t1 = 1_700_000_000_000;
    const t2 = t1 + 4 * DAY_MS;

    // 1) Eligible delayedCheck (H0, firstAttempt)
    const delayedCtx = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-1',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const r1 = applyReviewAndBuildLog({
      card,
      kind: 'new',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 800,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t1,
      trialContext: delayedCtx
    });

    expect(r1.fsrsEligibility).toEqual({
      eligible: true,
      reason: 'eligible_delayed_check'
    });
    expect(r1.fsrsResult).not.toBeNull();
    expect(r1.logEvent.gradeableByFsrs).toBe(true);
    expect(r1.logEvent.trialMode).toBe('delayedCheck');
    expect(card.reps).toBe(1);
    expect(card.stability).toBeGreaterThan(0);
    expect(card.difficulty).toBeGreaterThan(0);
    expect(card.dueAt).toBeGreaterThan(t1);

    // 2) Eligible scheduledReview (H0, firstAttempt)
    const scheduledCtx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-2',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const r2 = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 750,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t2,
      trialContext: scheduledCtx
    });

    expect(r2.fsrsEligibility).toEqual({
      eligible: true,
      reason: 'eligible_scheduled_review'
    });
    expect(r2.fsrsResult).not.toBeNull();
    expect(r2.logEvent.gradeableByFsrs).toBe(true);
    expect(r2.logEvent.trialMode).toBe('scheduledReview');
    expect(card.reps).toBe(2);
  });

  it('3. Hinted DELAYED_CHECK (H1/H2/H3) produces NO FSRS transition and NO Card.stats mutation', () => {
    const card = makeFreshCard('find:F', 'find', 'F');
    const initialStats = { ...card.stats };
    const hintedCtx = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-hinted',
      cardId: card.id,
      hintLevel: HINT_LEVEL.VERBAL_CUE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'new',
      firstCorrect: true,
      answer: 'F',
      answerKeyId: 'F4',
      hintUsed: false,
      responseMs: 720,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: 1_700_000_000_000,
      trialContext: hintedCtx
    });

    expect(res.fsrsResult).toBeNull();
    expect(res.fsrsEligibility).toEqual({
      eligible: false,
      reason: 'ineligible_hinted'
    });
    expect(res.statsUpdated).toBe(false);
    expect(res.cardMutated).toBe(false);
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.logEvent.hintLevel).toBe(HINT_LEVEL.VERBAL_CUE);
    expect(card.reps).toBe(0);
    expect(card.stability).toBeNull();
    expect(card.difficulty).toBeNull();
    expect(card.dueAt).toBe(0);
    expect(card.stats).toEqual(initialStats);
  });

  it('4. Cold Test (coldTest) never mutates FSRS or Card.stats', () => {
    const card = makeFreshCard('find:E', 'find', 'E');
    const initialStats = { ...card.stats };
    const coldCtx = createTrialContext({
      mode: 'coldTest',
      sessionId: 'cold-1',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'cold',
      firstCorrect: true,
      answer: 'E',
      answerKeyId: 'E4',
      hintUsed: false,
      responseMs: 650,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: 1_700_000_000_000,
      trialContext: coldCtx
    });

    expect(res.fsrsResult).toBeNull();
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.logEvent.trialMode).toBe('coldTest');
    expect(res.statsUpdated).toBe(false);
    expect(res.cardMutated).toBe(false);
    expect(card.reps).toBe(0);
    expect(card.stats).toEqual(initialStats);
  });

  it('5. First-attempt invariant holds for both scheduledReview and delayedCheck when wrong then corrected (Section 14)', () => {
    for (const kind of ['new', 'scheduled'] as const) {
      const card = makeFreshCard(`find:${kind === 'new' ? 'C' : 'F'}`, 'find', 'C');
      if (kind === 'scheduled') {
        card.memoryState = 'review';
        card.stability = 4.0;
        card.difficulty = 5.0;
        card.reps = 1;
        card.lastReviewAt = 1_700_000_000_000 - 4 * DAY_MS;
        card.dueAt = 1_700_000_000_000 - 1000;
      }

      const roundState: QuestionRoundState = {
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        isCompleted: false,
        isLocked: false
      };

      const prevReps = card.reps;
      const attempt1 = submitQuestionAttempt({
        state: roundState,
        card,
        kind,
        isCorrect: false,
        answer: 'D',
        answerKeyId: 'D4',
        responseMs: 900,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: 1_700_000_000_000,
        sessionId: 'session-1'
      });

      expect(attempt1.isFirstAttempt).toBe(true);
      expect(attempt1.grade).toBe(1);
      expect(attempt1.fsrsEligibility.eligible).toBe(true);
      expect(card.reps).toBe(prevReps + 1);
      const stabilityAfterFirst = card.stability;
      const difficultyAfterFirst = card.difficulty;
      const dueAtAfterFirst = card.dueAt;

      const attempt2 = submitQuestionAttempt({
        state: roundState,
        card,
        kind,
        isCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        responseMs: 500,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: 1_700_000_001_500,
        sessionId: 'session-1'
      });

      expect(attempt2.isFirstAttempt).toBe(false);
      expect(attempt2.logEvent).toBeNull();
      expect(attempt2.fsrsResult).toBeNull();
      expect(attempt2.trialContext.mode).toBe('corrective');
      expect(attempt2.trialContext.gradeableByFsrs).toBe(false);
      expect(attempt2.fsrsEligibility.eligible).toBe(false);
      expect(card.reps).toBe(prevReps + 1);
      expect(card.stability).toBe(stabilityAfterFirst);
      expect(card.difficulty).toBe(difficultyAfterFirst);
      expect(card.dueAt).toBe(dueAtAfterFirst);
    }
  });
});

describe('Milestone 3A — Legacy Adapter & Regression Compatibility (Section 21)', () => {
  it('maps current legacy ReviewKind values to the expected TrialContext contract', () => {
    const newCtx = createLegacyTrialContext({
      kind: 'new',
      sessionId: 'session-1',
      cardId: 'find:C'
    });
    expect(newCtx).toEqual({
      mode: 'delayedCheck',
      sessionId: 'session-1',
      cardId: 'find:C',
      itemId: 'find:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod: 'screen',
      contextId: undefined,
      gradeableByFsrs: true
    });

    const scheduledCtx = createLegacyTrialContext({
      kind: 'scheduled',
      sessionId: 'session-1',
      cardId: 'find:C'
    });
    expect(scheduledCtx.mode).toBe('scheduledReview');
    expect(scheduledCtx.gradeableByFsrs).toBe(true);

    const practiceCtx = createLegacyTrialContext({
      kind: 'practice',
      sessionId: 'session-1',
      cardId: 'find:C'
    });
    expect(practiceCtx.mode).toBe('freePractice');
    expect(practiceCtx.gradeableByFsrs).toBe(false);

    const confusionCtx = createLegacyTrialContext({
      kind: 'confusion',
      sessionId: 'session-1',
      cardId: 'find:C'
    });
    expect(confusionCtx.mode).toBe('freePractice');
    expect(confusionCtx.gradeableByFsrs).toBe(false);

    const coldCtx = createLegacyTrialContext({
      kind: 'cold',
      sessionId: 'cold-1',
      cardId: 'find:C'
    });
    expect(coldCtx.mode).toBe('coldTest');
    expect(coldCtx.gradeableByFsrs).toBe(false);

    expect(legacyReviewKindToTrialMode('new', false)).toBe('corrective');
    expect(legacyReviewKindToTrialMode('lesson', true)).toBe('guided');
  });
});

describe('Milestone 3A — Dexie v2 Schema & Backup Compatibility (Sections 22 & 23)', () => {
  it('defines Dexie v1 and v2 schemas preserving all v1 stores and adding learningProgress in v2', () => {
    expect(Object.keys(DB_V1_STORES)).toEqual([
      'cards',
      'reviewLogs',
      'coldTests',
      'repertoireHistory',
      'twoHandHistory',
      'lessonProgress',
      'settings'
    ]);
    expect(Object.keys(DB_V2_STORES)).toEqual([
      'cards',
      'reviewLogs',
      'coldTests',
      'repertoireHistory',
      'twoHandHistory',
      'lessonProgress',
      'settings',
      'learningProgress'
    ]);
    expect(DB_V2_STORES.learningProgress).toBe('id, itemId, state, updatedAt');

    const testDb = new PianoTrainerDatabase('PianoTrainerTestSchemaCheck');
    expect(testDb.verno).toBe(2);
    const tableNames = testDb.tables.map(t => t.name).sort();
    expect(tableNames).toEqual(
      [
        'cards',
        'reviewLogs',
        'coldTests',
        'repertoireHistory',
        'twoHandHistory',
        'lessonProgress',
        'settings',
        'learningProgress'
      ].sort()
    );
    expect(db.learningProgress).toBeDefined();
  });

  it('maintains backward-compatible backup import for old backups without learningProgress and normalizes new backups', () => {
    const legacyBackupWithoutLearningProgress = {
      app: 'piano-key-trainer',
      version: '6.2.0',
      cards: [],
      reviewLogs: []
    };
    expect(normalizeBackupLearningProgress(legacyBackupWithoutLearningProgress)).toBeNull();

    const modernBackupWithLearningProgress = {
      app: 'piano-key-trainer',
      version: '6.2.0',
      learningProgress: [
        {
          id: 'keyboard-anchor:C',
          itemId: 'keyboard-anchor:C',
          state: 'qualifying',
          modelCompleted: true,
          guidedSuccesses: 2,
          independentUnhintedSuccesses: 1,
          contexts: ['left', 'left', 'middle'],
          currentHintLevel: 0,
          introducedAt: 1000,
          updatedAt: 2000
        }
      ]
    };

    const normalized = normalizeBackupLearningProgress(modernBackupWithLearningProgress);
    expect(normalized).toEqual([
      {
        id: 'keyboard-anchor:C',
        itemId: 'keyboard-anchor:C',
        state: 'qualifying',
        modelCompleted: true,
        guidedSuccesses: 2,
        independentUnhintedSuccesses: 1,
        contexts: ['left', 'middle'],
        currentHintLevel: 0,
        introducedAt: 1000,
        mixReadyAt: undefined,
        firstFsrsEligibleAt: undefined,
        updatedAt: 2000
      }
    ]);
  });
});

describe('Milestone 3A — Revision 1: FSRS Boundary Hardening', () => {
  function makeReviewedCard(id = 'find:C', note: Card['note'] = 'C', now = 1_700_000_000_000): Card {
    return {
      ...makeFreshCard(id, 'find', note),
      memoryState: 'review',
      stability: 6.0,
      difficulty: 5.0,
      lastReviewAt: now - 5 * DAY_MS,
      firstSeenAt: now - 15 * DAY_MS,
      dueAt: now - 1000,
      reps: 3,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 3,
        firstCorrect: 3,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 3,
        scheduledSuccesses: 3,
        practiceTrials: 0
      }
    };
  }

  it('3.A Scheduled H0 correct -> eligible = true, normal grade logic, FSRS mutation = 1', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const ctx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-sched-h0',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 750,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: ctx
    });

    expect(res.fsrsEligibility).toEqual({
      eligible: true,
      reason: 'eligible_scheduled_review'
    });
    expect(res.grade).toBe(3); // Good
    expect(res.logEvent.grade).toBe(3);
    expect(res.logEvent.gradeName).toBe('Good');
    expect(res.logEvent.hintUsed).toBe(false);
    expect(res.logEvent.hintLevel).toBe(HINT_LEVEL.NONE);
    expect(res.fsrsResult).not.toBeNull();
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(0);
    expect(card.stats.scheduledSuccesses).toBe(4);
    expect(card.stats.recentScheduledSuccesses).toBe(4);
  });

  it('3.B Scheduled H1 (even when physical response is correct and fast with latency grading) -> eligible = true, grade = Again, FSRS mutation = 1', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const ctx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-sched-h1',
      cardId: card.id,
      hintLevel: HINT_LEVEL.VERBAL_CUE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false, // Even if caller passes hintUsed: false, hintLevel=H1 derives effectiveHintUsed=true
      responseMs: 250, // Fast enough for Easy if unhinted
      settings: {
        ...DEFAULT_TEST_SETTINGS,
        useLatencyGrading: true
      },
      reviewedAt: now,
      trialContext: ctx
    });

    expect(res.fsrsEligibility).toEqual({
      eligible: true,
      reason: 'eligible_scheduled_review'
    });
    expect(res.grade).toBe(1);
    expect(res.logEvent.grade).toBe(1);
    expect(res.logEvent.gradeName).toBe('Again');
    expect(res.logEvent.hintUsed).toBe(true);
    expect(res.logEvent.hintLevel).toBe(HINT_LEVEL.VERBAL_CUE);
    expect(res.logEvent.gradeableByFsrs).toBe(true);
    expect(res.fsrsResult).not.toBeNull();
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);
    expect(card.memoryState).toBe('relearning');
    expect(card.stats.hints).toBe(1);
    expect(card.stats.scheduledSuccesses).toBe(3); // Unchanged on Again
    expect(card.stats.recentScheduledSuccesses).toBe(0); // Reset on Again
  });

  it('3.C Scheduled H3 -> eligible = true, grade = Again, FSRS mutation = 1', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:F', 'F', now);
    const ctx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-sched-h3',
      cardId: card.id,
      hintLevel: HINT_LEVEL.MODEL_VISIBLE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'F',
      answerKeyId: 'F4',
      hintUsed: false,
      responseMs: 400,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: ctx
    });

    expect(res.fsrsEligibility).toEqual({
      eligible: true,
      reason: 'eligible_scheduled_review'
    });
    expect(res.grade).toBe(1);
    expect(res.logEvent.grade).toBe(1);
    expect(res.logEvent.gradeName).toBe('Again');
    expect(res.logEvent.hintUsed).toBe(true);
    expect(res.logEvent.hintLevel).toBe(HINT_LEVEL.MODEL_VISIBLE);
    expect(res.fsrsResult).not.toBeNull();
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);
  });

  it('3.D Delayed H1 -> eligible = false, FSRS mutation = 0, Card.stats scheduled counters unchanged', () => {
    const now = 1_700_000_000_000;
    const card = makeFreshCard('find:F', 'find', 'F');
    const initialStats = { ...card.stats };
    const ctx = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-delayed-h1',
      cardId: card.id,
      hintLevel: HINT_LEVEL.VERBAL_CUE,
      firstAttempt: true
    });

    const res = applyReviewAndBuildLog({
      card,
      kind: 'new',
      firstCorrect: true,
      answer: 'F',
      answerKeyId: 'F4',
      hintUsed: false,
      responseMs: 600,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: ctx
    });

    expect(res.fsrsEligibility).toEqual({
      eligible: false,
      reason: 'ineligible_hinted'
    });
    expect(res.grade).toBeNull();
    expect(res.logEvent.grade).toBeNull();
    expect(res.logEvent.gradeName).toBeNull();
    expect(res.logEvent.hintUsed).toBe(true);
    expect(res.logEvent.hintLevel).toBe(HINT_LEVEL.VERBAL_CUE);
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.fsrsResult).toBeNull();
    expect(res.statsUpdated).toBe(false);
    expect(res.cardMutated).toBe(false);
    expect(card.reps).toBe(0);
    expect(card.stability).toBeNull();
    expect(card.difficulty).toBeNull();
    expect(card.stats).toEqual(initialStats);
    expect(card.stats.scheduledSuccesses).toBe(0);
    expect(card.stats.recentScheduledSuccesses).toBe(0);
  });

  it('3.E Scheduled hint -> corrective correct: first event produces Again & card.reps + 1; corrective event produces no log and no second FSRS mutation', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const roundState: QuestionRoundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };

    const hintedScheduledCtx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-sched-hint-corrective',
      cardId: card.id,
      hintLevel: HINT_LEVEL.VERBAL_CUE,
      firstAttempt: true
    });

    // First event: scheduled review with H1 hint
    const first = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: false,
      answer: 'D',
      answerKeyId: 'D4',
      responseMs: 850,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: hintedScheduledCtx
    });

    expect(first.isFirstAttempt).toBe(true);
    expect(first.grade).toBe(1);
    expect(first.logEvent).not.toBeNull();
    expect(first.logEvent!.grade).toBe(1);
    expect(first.logEvent!.gradeName).toBe('Again');
    expect(first.logEvent!.hintUsed).toBe(true);
    expect(first.logEvent!.hintLevel).toBe(HINT_LEVEL.VERBAL_CUE);
    expect(first.fsrsResult).not.toBeNull();
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);

    const stabilityAfterFirst = card.stability;
    const difficultyAfterFirst = card.difficulty;
    const dueAtAfterFirst = card.dueAt;

    // Corrective event: learner now plays C4 correctly
    const second = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      responseMs: 450,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now + 1500,
      trialContext: hintedScheduledCtx
    });

    expect(second.isFirstAttempt).toBe(false);
    expect(second.logEvent).toBeNull();
    expect(second.fsrsResult).toBeNull();
    expect(second.grade).toBeNull();
    expect(second.cardMutated).toBe(false);
    expect(second.statsUpdated).toBe(false);
    expect(second.trialContext.mode).toBe('corrective');
    expect(second.trialContext.gradeableByFsrs).toBe(false);
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);
    expect(card.stability).toBe(stabilityAfterFirst);
    expect(card.difficulty).toBe(difficultyAfterFirst);
    expect(card.dueAt).toBe(dueAtAfterFirst);
  });

  it('4. Canonicalizes TrialContext.cardId to card.id so mismatched cardId cannot corrupt audit identity while preserving distinct pedagogical itemId', () => {
    const now = 1_700_000_000_000;
    const cardC = makeFreshCard('find:C', 'find', 'C');

    // Case 1: Mismatched cardId ('find:F') without distinct itemId
    const mismatchedCtx = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-card-mismatch',
      cardId: 'find:F',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const res1 = applyReviewAndBuildLog({
      card: cardC,
      kind: 'new',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 700,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: mismatchedCtx
    });

    expect(res1.logEvent.cardId).toBe('find:C');
    expect(res1.trialContext.cardId).toBe('find:C');
    expect(res1.trialContext.itemId).toBe('find:C');
    expect(cardC.reps).toBe(1);

    // Case 2: Mismatched cardId ('find:F') WITH distinct pedagogical itemId ('keyboard-anchor:C')
    const cardC2 = makeFreshCard('find:C', 'find', 'C');
    const ctxWithDistinctItem = createTrialContext({
      mode: 'delayedCheck',
      sessionId: 'session-card-mismatch-2',
      cardId: 'find:F',
      itemId: 'keyboard-anchor:C',
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const res2 = applyReviewAndBuildLog({
      card: cardC2,
      kind: 'new',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 700,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: ctxWithDistinctItem
    });

    expect(res2.logEvent.cardId).toBe('find:C');
    expect(res2.trialContext.cardId).toBe('find:C');
    expect(res2.trialContext.itemId).toBe('keyboard-anchor:C');
  });

  it('5. Canonicalizes sessionId when both params.sessionId and params.trialContext.sessionId are supplied and differ', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const roundState: QuestionRoundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };

    const ctxWithOtherSession = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-from-context',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    const first = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: false,
      answer: 'D',
      answerKeyId: 'D4',
      responseMs: 900,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      sessionId: 'session-canonical',
      trialContext: ctxWithOtherSession
    });

    expect(first.logEvent!.sessionId).toBe('session-canonical');
    expect(first.trialContext.sessionId).toBe('session-canonical');

    const second = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'scheduled',
      isCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      responseMs: 500,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now + 1000,
      sessionId: 'session-canonical',
      trialContext: ctxWithOtherSession
    });

    expect(second.trialContext.sessionId).toBe('session-canonical');
  });

  it('6. Rejects FSRS mutation with ineligible_review_kind when TrialMode is FSRS-eligible (scheduledReview) but ReviewKind is incompatible (practice)', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const initialStats = { ...card.stats };

    const scheduledCtx = createTrialContext({
      mode: 'scheduledReview',
      sessionId: 'session-mismatch',
      cardId: card.id,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true
    });

    // TrialContext alone is eligible, but ReviewKind = 'practice' is incompatible
    expect(deriveFsrsEligibility(scheduledCtx).eligible).toBe(true);

    const res = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 650,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: scheduledCtx
    });

    expect(res.fsrsResult).toBeNull();
    expect(res.cardMutated).toBe(false);
    expect(res.statsUpdated).toBe(false);
    expect(res.grade).toBeNull();
    expect(res.logEvent.grade).toBeNull();
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.trialContext.gradeableByFsrs).toBe(false);
    expect(res.fsrsEligibility).toEqual({
      eligible: false,
      reason: 'ineligible_review_kind'
    });
    expect(card.reps).toBe(3);
    expect(card.stats).toEqual(initialStats);
  });

  it('7. Verifies the complete Milestone 3A Acceptance Truth Table across all 12 rows', () => {
    const now = 1_700_000_000_000;

    // 1–4, 9–11: Non-FSRS acquisition/corrective/transfer/cold modes -> FSRS: No, Grade: none (null)
    const nonFsrsModes = [
      { mode: 'model' as const, hint: HINT_LEVEL.MODEL_VISIBLE, kind: 'lesson' as const, firstAttempt: true },
      { mode: 'guided' as const, hint: HINT_LEVEL.VISUAL_CUE, kind: 'lesson' as const, firstAttempt: true },
      { mode: 'qualify' as const, hint: HINT_LEVEL.NONE, kind: 'new' as const, firstAttempt: true },
      { mode: 'mixedRetrieval' as const, hint: HINT_LEVEL.NONE, kind: 'new' as const, firstAttempt: true },
      { mode: 'delayedCheck' as const, hint: HINT_LEVEL.VERBAL_CUE, kind: 'new' as const, firstAttempt: true },
      { mode: 'delayedCheck' as const, hint: HINT_LEVEL.VISUAL_CUE, kind: 'new' as const, firstAttempt: true },
      { mode: 'delayedCheck' as const, hint: HINT_LEVEL.MODEL_VISIBLE, kind: 'new' as const, firstAttempt: true },
      { mode: 'corrective' as const, hint: HINT_LEVEL.NONE, kind: 'scheduled' as const, firstAttempt: false },
      { mode: 'transfer' as const, hint: HINT_LEVEL.NONE, kind: 'new' as const, firstAttempt: true },
      { mode: 'coldTest' as const, hint: HINT_LEVEL.NONE, kind: 'cold' as const, firstAttempt: true }
    ];

    for (const row of nonFsrsModes) {
      const card = makeFreshCard('find:C', 'find', 'C');
      const ctx = createTrialContext({
        mode: row.mode,
        sessionId: 'session-truth-table',
        cardId: card.id,
        hintLevel: row.hint,
        firstAttempt: row.firstAttempt
      });
      const res = applyReviewAndBuildLog({
        card,
        kind: row.kind,
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: now,
        trialContext: ctx
      });

      expect(res.fsrsEligibility.eligible).toBe(false);
      expect(res.fsrsResult).toBeNull();
      expect(res.grade).toBeNull();
      expect(res.logEvent.grade).toBeNull();
      expect(res.statsUpdated).toBe(false);
      expect(card.reps).toBe(0);
    }

    // 5: delayedCheck + H0 -> FSRS: Yes, Grade: normal (Good = 3)
    {
      const card = makeFreshCard('find:C', 'find', 'C');
      const res = applyReviewAndBuildLog({
        card,
        kind: 'new',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: now,
        trialContext: createTrialContext({
          mode: 'delayedCheck',
          sessionId: 'session-truth-table',
          cardId: card.id,
          hintLevel: HINT_LEVEL.NONE,
          firstAttempt: true
        })
      });
      expect(res.fsrsEligibility.eligible).toBe(true);
      expect(res.grade).toBe(3);
      expect(card.reps).toBe(1);
    }

    // 7: scheduledReview + H0 -> FSRS: Yes, Grade: normal (Good = 3)
    {
      const card = makeReviewedCard('find:C', 'C', now);
      const res = applyReviewAndBuildLog({
        card,
        kind: 'scheduled',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: now,
        trialContext: createTrialContext({
          mode: 'scheduledReview',
          sessionId: 'session-truth-table',
          cardId: card.id,
          hintLevel: HINT_LEVEL.NONE,
          firstAttempt: true
        })
      });
      expect(res.fsrsEligibility.eligible).toBe(true);
      expect(res.grade).toBe(3);
      expect(card.reps).toBe(4);
    }

    // 8: scheduledReview + H1/H2/H3 -> FSRS: Yes, Grade: Again (1)
    for (const hintLevel of [
      HINT_LEVEL.VERBAL_CUE,
      HINT_LEVEL.VISUAL_CUE,
      HINT_LEVEL.MODEL_VISIBLE
    ]) {
      const card = makeReviewedCard('find:C', 'C', now);
      const res = applyReviewAndBuildLog({
        card,
        kind: 'scheduled',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: now,
        trialContext: createTrialContext({
          mode: 'scheduledReview',
          sessionId: 'session-truth-table',
          cardId: card.id,
          hintLevel,
          firstAttempt: true
        })
      });
      expect(res.fsrsEligibility.eligible).toBe(true);
      expect(res.grade).toBe(1);
      expect(res.logEvent.gradeName).toBe('Again');
      expect(card.reps).toBe(4);
      expect(card.lapses).toBe(1);
    }

    // 12: freePractice -> FSRS: No, diagnostic grade (Good / Again) + practice stats only
    {
      const card = makeReviewedCard('find:C', 'C', now);
      const res = applyReviewAndBuildLog({
        card,
        kind: 'practice',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt: now,
        trialContext: createTrialContext({
          mode: 'freePractice',
          sessionId: 'session-truth-table',
          cardId: card.id,
          hintLevel: HINT_LEVEL.NONE,
          firstAttempt: true
        })
      });
      expect(res.fsrsEligibility.eligible).toBe(false);
      expect(res.fsrsResult).toBeNull();
      expect(res.grade).toBe(3);
      expect(res.logEvent.grade).toBe(3);
      expect(res.logEvent.gradeName).toBe('Good');
      expect(res.statsUpdated).toBe(true);
      expect(card.reps).toBe(3); // FSRS untouched
      expect(card.stats.practiceTrials).toBe(1);
      expect(card.stats.scheduledSuccesses).toBe(3); // Scheduled stats untouched
    }
  });
});

describe('Milestone 3A — Revision 2: Legacy FreePractice Diagnostic Grade Semantics', () => {
  function makeReviewedCard(id = 'find:C', note: Card['note'] = 'C', now = 1_700_000_000_000): Card {
    return {
      ...makeFreshCard(id, 'find', note),
      memoryState: 'review',
      stability: 7.5,
      difficulty: 4.6,
      lastReviewAt: now - 3 * DAY_MS,
      firstSeenAt: now - 12 * DAY_MS,
      dueAt: now + 4.5 * DAY_MS,
      reps: 3,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 3,
        firstCorrect: 3,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 3,
        scheduledSuccesses: 3,
        practiceTrials: 0
      }
    };
  }

  it('1. Free practice correct -> grade = 3 (Good), fsrsResult = null, gradeableByFsrs = false, practiceTrials + 1, FSRS unchanged', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const originalDueAt = card.dueAt;
    const originalLastReviewAt = card.lastReviewAt;

    const res = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 680,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: 'session-fp-correct',
        cardId: card.id,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true
      })
    });

    expect(res.grade).toBe(3);
    expect(res.logEvent.grade).toBe(3);
    expect(res.logEvent.gradeName).toBe('Good');
    expect(res.fsrsResult).toBeNull();
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.trialContext.gradeableByFsrs).toBe(false);
    expect(res.fsrsEligibility.eligible).toBe(false);
    expect(res.statsUpdated).toBe(true);

    expect(card.stats.trials).toBe(4);
    expect(card.stats.firstCorrect).toBe(4);
    expect(card.stats.firstWrong).toBe(0);
    expect(card.stats.practiceTrials).toBe(1);
    expect(card.stats.scheduledSuccesses).toBe(3);
    expect(card.stats.recentScheduledSuccesses).toBe(3);

    // FSRS fields completely unchanged
    expect(card.reps).toBe(3);
    expect(card.stability).toBe(7.5);
    expect(card.difficulty).toBe(4.6);
    expect(card.dueAt).toBe(originalDueAt);
    expect(card.lastReviewAt).toBe(originalLastReviewAt);
  });

  it('2. Free practice wrong -> grade = 1 (Again), fsrsResult = null, practiceTrials + 1, FSRS unchanged', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const originalDueAt = card.dueAt;
    const originalLastReviewAt = card.lastReviewAt;

    const res = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: false,
      answer: 'D',
      answerKeyId: 'D4',
      hintUsed: false,
      responseMs: 920,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: 'session-fp-wrong',
        cardId: card.id,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true
      })
    });

    expect(res.grade).toBe(1);
    expect(res.logEvent.grade).toBe(1);
    expect(res.logEvent.gradeName).toBe('Again');
    expect(res.fsrsResult).toBeNull();
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.statsUpdated).toBe(true);

    expect(card.stats.trials).toBe(4);
    expect(card.stats.firstCorrect).toBe(3);
    expect(card.stats.firstWrong).toBe(1);
    expect(card.stats.practiceTrials).toBe(1);
    expect(card.stats.scheduledSuccesses).toBe(3);
    expect(card.stats.recentScheduledSuccesses).toBe(3);

    // FSRS fields completely unchanged
    expect(card.reps).toBe(3);
    expect(card.lapses).toBe(0);
    expect(card.stability).toBe(7.5);
    expect(card.difficulty).toBe(4.6);
    expect(card.dueAt).toBe(originalDueAt);
    expect(card.lastReviewAt).toBe(originalLastReviewAt);
  });

  it('3. Confusion correct -> same diagnostic semantics as practice (grade = 3 / Good, practiceTrials + 1, FSRS unchanged)', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:F', 'F', now);
    const originalDueAt = card.dueAt;
    const originalLastReviewAt = card.lastReviewAt;

    const res = applyReviewAndBuildLog({
      card,
      kind: 'confusion',
      firstCorrect: true,
      answer: 'F',
      answerKeyId: 'F4',
      hintUsed: false,
      responseMs: 640,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: 'session-confusion-correct',
        cardId: card.id,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true
      })
    });

    expect(res.grade).toBe(3);
    expect(res.logEvent.grade).toBe(3);
    expect(res.logEvent.gradeName).toBe('Good');
    expect(res.fsrsResult).toBeNull();
    expect(res.logEvent.gradeableByFsrs).toBe(false);
    expect(res.statsUpdated).toBe(true);
    expect(card.stats.practiceTrials).toBe(1);
    expect(card.reps).toBe(3);
    expect(card.stability).toBe(7.5);
    expect(card.difficulty).toBe(4.6);
    expect(card.dueAt).toBe(originalDueAt);
    expect(card.lastReviewAt).toBe(originalLastReviewAt);
  });

  it('4. Free practice with hint (hintUsed = true or hintLevel > H0) -> grade = 1 (Again), hints + 1, FSRS unchanged', () => {
    const now = 1_700_000_000_000;
    const card = makeReviewedCard('find:C', 'C', now);
    const originalDueAt = card.dueAt;
    const originalLastReviewAt = card.lastReviewAt;

    // Case A: hintUsed = true
    const resA = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: true,
      responseMs: 700,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: 'session-fp-hint-a',
        cardId: card.id,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true
      })
    });

    expect(resA.grade).toBe(1);
    expect(resA.logEvent.grade).toBe(1);
    expect(resA.logEvent.gradeName).toBe('Again');
    expect(resA.logEvent.hintUsed).toBe(true);
    expect(resA.fsrsResult).toBeNull();
    expect(card.stats.hints).toBe(1);
    expect(card.stats.practiceTrials).toBe(1);

    // Case B: hintLevel = H1 (with hintUsed: false passed by caller)
    const resB = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 700,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now + 1000,
      trialContext: createTrialContext({
        mode: 'freePractice',
        sessionId: 'session-fp-hint-b',
        cardId: card.id,
        hintLevel: HINT_LEVEL.VERBAL_CUE,
        firstAttempt: true
      })
    });

    expect(resB.grade).toBe(1);
    expect(resB.logEvent.grade).toBe(1);
    expect(resB.logEvent.gradeName).toBe('Again');
    expect(resB.logEvent.hintUsed).toBe(true);
    expect(resB.fsrsResult).toBeNull();
    expect(card.stats.hints).toBe(2);
    expect(card.stats.practiceTrials).toBe(2);
    expect(card.reps).toBe(3);
    expect(card.stability).toBe(7.5);
    expect(card.difficulty).toBe(4.6);
    expect(card.dueAt).toBe(originalDueAt);
    expect(card.lastReviewAt).toBe(originalLastReviewAt);
  });
});
