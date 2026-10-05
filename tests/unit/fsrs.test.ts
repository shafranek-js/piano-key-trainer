import { describe, it, expect } from 'vitest';
import { 
  FACTOR, 
  DECAY, 
  DAY_MS,
  initialDifficulty, 
  initialStability, 
  nextDifficulty, 
  retrievability,
  intervalForRetention, 
  forgetStability, 
  recallStability, 
  applyFsrsReview 
} from '../../src/core/fsrs/fsrs6';
import {
  applyReviewAndBuildLog,
  createSessionId,
  submitQuestionAttempt,
  type QuestionRoundState
} from '../../src/core/fsrs/reviewLog';
import {
  curriculumCardReady,
  successfulScheduledSessions
} from '../../src/core/curriculum/curriculum';
import { CURRICULUM_MIN_STABILITY_DAYS } from '../../src/core/fsrs/constants';
import type { Card } from '../../src/core/fsrs/types';

function makeFreshCard(id = 'find:C', skill: Card['skill'] = 'find', note: Card['note'] = 'C'): Card {
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

describe('FSRS-6 Core Math and Invariants', () => {
  it('satisfies retention curve definition at t = S (R = 0.9)', () => {
    const S = 10;
    const elapsedDays = S;
    const r = Math.pow(1 + (FACTOR * elapsedDays) / S, -DECAY);
    expect(r).toBeCloseTo(0.9, 5);
  });

  it('calculates intervals consistent with desired retention', () => {
    const S = 10;
    const i90 = intervalForRetention(S, 0.9);
    const i95 = intervalForRetention(S, 0.95);
    const i85 = intervalForRetention(S, 0.85);

    expect(i90).toBeCloseTo(S, 5);
    expect(i95).toBeLessThan(i90); // higher retention requires shorter interval
    expect(i85).toBeGreaterThan(i90); // lower retention allows longer interval
  });

  it('maintains stability and difficulty invariants across 500 random reviews', () => {
    for (let n = 0; n < 500; n++) {
      const g = (1 + Math.floor(Math.random() * 4)) as 1 | 2 | 3 | 4;
      const d = 1 + Math.random() * 9;
      const s = 0.05 + Math.random() * 120;
      const rr = 0.5 + Math.random() * 0.5;

      const d2 = nextDifficulty(d, g);
      const s2 = g === 1 ? forgetStability(d2, s, rr) : recallStability(d2, s, rr, g);

      expect(Number.isFinite(d2)).toBe(true);
      expect(Number.isFinite(s2)).toBe(true);
      expect(d2).toBeGreaterThanOrEqual(1);
      expect(d2).toBeLessThanOrEqual(10);
      expect(s2).toBeGreaterThan(0);
    }
  });

  it('applies review correctly for new card', () => {
    const card = makeFreshCard('find:C', 'find', 'C');
    const now = Date.now();

    applyFsrsReview(card, 3, now, DEFAULT_TEST_SETTINGS);
    expect(card.reps).toBe(1);
    expect(card.lastGrade).toBe(3);
    expect(card.stability).toBe(initialStability(3));
    expect(card.difficulty).toBe(initialDifficulty(3));
    expect(card.memoryState).toBe('review');
    expect(card.dueAt).toBeGreaterThan(now);
  });

  it('handles lapse with relearning state', () => {
    const now = Date.now();
    const card: Card = {
      id: 'identify:E',
      skill: 'identify',
      note: 'E',
      memoryState: 'review',
      stability: 10,
      difficulty: 5,
      dueAt: now - 1000,
      lastReviewAt: now - 86400000 * 10,
      firstSeenAt: now - 86400000 * 30,
      reps: 5,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 5,
        firstCorrect: 5,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 3,
        scheduledSuccesses: 5,
        practiceTrials: 0
      }
    };

    applyFsrsReview(card, 1, now, DEFAULT_TEST_SETTINGS);
    expect(card.reps).toBe(6);
    expect(card.lapses).toBe(1);
    expect(card.memoryState).toBe('relearning');
    expect(card.dueAt).toBe(now + 45 * 1000);
  });
});

describe('ReviewLog Transition & Audit Correctness (Milestone 2)', () => {
  it('A. New card + Good records null pre-review state, elapsedDays = 0, and post-review FSRS values', () => {
    const card = makeFreshCard('find:C', 'find', 'C');
    const reviewedAt = 1_700_000_000_000;

    const { logEvent, fsrsResult, grade } = applyReviewAndBuildLog({
      card,
      kind: 'new',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 820,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt
    });

    expect(grade).toBe(3);
    expect(fsrsResult).not.toBeNull();
    expect(logEvent.ts).toBe(reviewedAt);
    expect(card.lastReviewAt).toBe(reviewedAt);
    expect(logEvent.ts).toBe(card.lastReviewAt);

    expect(logEvent.elapsedDays).toBe(0);
    expect(logEvent.retrievabilityBefore).toBeNull();
    expect(logEvent.stabilityBefore).toBeNull();
    expect(logEvent.difficultyBefore).toBeNull();

    expect(logEvent.stabilityAfter).toBe(card.stability);
    expect(logEvent.stabilityAfter).toBe(initialStability(3));
    expect(logEvent.difficultyAfter).toBe(card.difficulty);
    expect(logEvent.difficultyAfter).toBe(initialDifficulty(3));
    expect(logEvent.scheduledDays).toBe(fsrsResult!.intervalDays);
    expect(logEvent.scheduledDays).toBeGreaterThan(0);
  });

  it('B. Existing scheduled card + Good preserves pre-review and post-review state and computes elapsedDays accurately', () => {
    const prevReviewAt = 1_700_000_000_000;
    const elapsedDaysExpected = 4.5;
    const reviewedAt = prevReviewAt + elapsedDaysExpected * DAY_MS;
    const originalStability = 4.2;
    const originalDifficulty = 5.1;

    const card: Card = {
      ...makeFreshCard('notationToKey:G', 'notationToKey', 'G'),
      memoryState: 'review',
      stability: originalStability,
      difficulty: originalDifficulty,
      lastReviewAt: prevReviewAt,
      firstSeenAt: prevReviewAt - 10 * DAY_MS,
      dueAt: reviewedAt - 1000,
      reps: 3,
      lapses: 0,
      lastGrade: 3
    };

    const expectedRetrievabilityBefore = retrievability(
      { lastReviewAt: prevReviewAt, stability: originalStability },
      reviewedAt
    );

    const { logEvent, fsrsResult, grade } = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'G',
      answerKeyId: 'G4',
      hintUsed: false,
      responseMs: 910,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt
    });

    expect(grade).toBe(3);
    expect(logEvent.gradeName).toBe('Good');
    expect(fsrsResult).not.toBeNull();

    expect(logEvent.ts).toBe(reviewedAt);
    expect(card.lastReviewAt).toBe(reviewedAt);
    expect(logEvent.elapsedDays).toBeCloseTo(elapsedDaysExpected, 8);
    expect(logEvent.retrievabilityBefore).toBeCloseTo(expectedRetrievabilityBefore!, 8);

    expect(logEvent.stabilityBefore).toBe(originalStability);
    expect(logEvent.difficultyBefore).toBe(originalDifficulty);

    expect(logEvent.stabilityAfter).toBe(card.stability);
    expect(logEvent.stabilityAfter).toBeGreaterThan(originalStability);
    expect(logEvent.difficultyAfter).toBe(card.difficulty);
    expect(logEvent.difficultyAfter).not.toBe(originalDifficulty);

    expect(logEvent.scheduledDays).toBe(fsrsResult!.intervalDays);
  });

  it('C. Existing scheduled card + Again transitions to relearning and logs fractional scheduledDays', () => {
    const prevReviewAt = 1_700_000_000_000;
    const reviewedAt = prevReviewAt + 6 * DAY_MS;
    const originalStability = 8.4;
    const originalDifficulty = 4.8;

    const card: Card = {
      ...makeFreshCard('soundToKey:F', 'soundToKey', 'F'),
      memoryState: 'review',
      stability: originalStability,
      difficulty: originalDifficulty,
      lastReviewAt: prevReviewAt,
      firstSeenAt: prevReviewAt - 20 * DAY_MS,
      dueAt: reviewedAt - 5000,
      reps: 4,
      lapses: 0,
      lastGrade: 3
    };

    const { logEvent, fsrsResult, grade } = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: false,
      answer: 'E',
      answerKeyId: 'E4',
      hintUsed: false,
      responseMs: 1450,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt
    });

    expect(grade).toBe(1);
    expect(logEvent.grade).toBe(1);
    expect(logEvent.gradeName).toBe('Again');
    expect(card.memoryState).toBe('relearning');
    expect(card.lapses).toBe(1);

    expect(logEvent.elapsedDays).toBeCloseTo(6, 8);
    expect(logEvent.stabilityBefore).toBe(originalStability);
    expect(logEvent.difficultyBefore).toBe(originalDifficulty);
    expect(logEvent.stabilityAfter).toBe(card.stability);
    expect(logEvent.stabilityAfter).toBeLessThan(originalStability);
    expect(logEvent.difficultyAfter).toBe(card.difficulty);
    expect(logEvent.difficultyAfter).toBeGreaterThan(originalDifficulty);

    expect(logEvent.scheduledDays).toBe(DEFAULT_TEST_SETTINGS.relearningSeconds / 86400);
    expect(logEvent.scheduledDays).toBe(fsrsResult!.intervalDays);
    expect(logEvent.scheduledDays).toBeGreaterThan(0);
  });

  it("D. New card + Don't know uses the same FSRS Again transition semantics as a first-attempt failure", () => {
    const cardDontKnow = makeFreshCard('identify:D', 'identify', 'D');
    const cardWrongAttempt = makeFreshCard('identify:D', 'identify', 'D');
    const reviewedAt = 1_700_050_000_000;

    const dontKnowRes = applyReviewAndBuildLog({
      card: cardDontKnow,
      kind: 'new',
      firstCorrect: false,
      answer: null,
      answerKeyId: null,
      hintUsed: true,
      responseMs: 1200,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt
    });

    const wrongAttemptRes = applyReviewAndBuildLog({
      card: cardWrongAttempt,
      kind: 'new',
      firstCorrect: false,
      answer: 'E',
      answerKeyId: null,
      hintUsed: false,
      responseMs: 1200,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt
    });

    expect(dontKnowRes.logEvent.grade).toBe(1);
    expect(dontKnowRes.logEvent.gradeName).toBe('Again');
    expect(dontKnowRes.logEvent.elapsedDays).toBe(0);
    expect(dontKnowRes.logEvent.retrievabilityBefore).toBeNull();
    expect(dontKnowRes.logEvent.stabilityBefore).toBeNull();
    expect(dontKnowRes.logEvent.difficultyBefore).toBeNull();
    expect(dontKnowRes.logEvent.stabilityAfter).toBe(initialStability(1));
    expect(dontKnowRes.logEvent.difficultyAfter).toBe(initialDifficulty(1));
    expect(dontKnowRes.logEvent.scheduledDays).toBe(45 / 86400);

    // Identical FSRS before/after transition semantics as first-attempt Again
    expect(dontKnowRes.logEvent.stabilityBefore).toBe(wrongAttemptRes.logEvent.stabilityBefore);
    expect(dontKnowRes.logEvent.stabilityAfter).toBe(wrongAttemptRes.logEvent.stabilityAfter);
    expect(dontKnowRes.logEvent.difficultyBefore).toBe(wrongAttemptRes.logEvent.difficultyBefore);
    expect(dontKnowRes.logEvent.difficultyAfter).toBe(wrongAttemptRes.logEvent.difficultyAfter);
    expect(dontKnowRes.logEvent.scheduledDays).toBe(wrongAttemptRes.logEvent.scheduledDays);
    expect(dontKnowRes.logEvent.elapsedDays).toBe(wrongAttemptRes.logEvent.elapsedDays);
  });

  it('E. No double FSRS mutation when first attempt is wrong and second corrective attempt is correct', () => {
    const card = makeFreshCard('find:A', 'find', 'A');
    const roundState: QuestionRoundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };
    const t1 = 1_700_100_000_000;
    const t2 = t1 + 1800;

    // Attempt 1: wrong answer ('G' instead of 'A')
    const attempt1 = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'new',
      isCorrect: false,
      answer: 'G',
      answerKeyId: 'G4',
      responseMs: 950,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t1
    });

    expect(attempt1.isFirstAttempt).toBe(true);
    expect(attempt1.logEvent).not.toBeNull();
    expect(attempt1.logEvent!.grade).toBe(1);
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(1);
    expect(card.lastGrade).toBe(1);
    expect(card.memoryState).toBe('relearning');
    expect(roundState.isCompleted).toBe(false);

    const stabilityAfterFirstAttempt = card.stability;
    const difficultyAfterFirstAttempt = card.difficulty;
    const dueAtAfterFirstAttempt = card.dueAt;

    // Attempt 2: corrective answer ('A')
    const attempt2 = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'new',
      isCorrect: true,
      answer: 'A',
      answerKeyId: 'A4',
      responseMs: 600,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t2
    });

    expect(attempt2.isFirstAttempt).toBe(false);
    expect(attempt2.logEvent).toBeNull();
    expect(attempt2.fsrsResult).toBeNull();
    expect(roundState.attempts).toBe(2);
    expect(roundState.isCompleted).toBe(true);
    expect(roundState.isLocked).toBe(true);

    // Card FSRS state must not be mutated a second time
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(1);
    expect(card.lastGrade).toBe(1);
    expect(card.stability).toBe(stabilityAfterFirstAttempt);
    expect(card.difficulty).toBe(difficultyAfterFirstAttempt);
    expect(card.dueAt).toBe(dueAtAfterFirstAttempt);
    expect(card.lastReviewAt).toBe(t1);
  });

  it('Preserves non-FSRS invariant for practice, confusion, and cold kinds', () => {
    const originalLastReviewAt = 1_700_000_000_000;
    const reviewedAt = originalLastReviewAt + 2 * DAY_MS;
    const card: Card = {
      ...makeFreshCard('find:E', 'find', 'E'),
      memoryState: 'review',
      stability: 6.5,
      difficulty: 4.5,
      lastReviewAt: originalLastReviewAt,
      dueAt: originalLastReviewAt + 6.5 * DAY_MS,
      reps: 2,
      lapses: 0,
      lastGrade: 3
    };

    for (const kind of ['practice', 'confusion', 'cold'] as const) {
      const res = applyReviewAndBuildLog({
        card,
        kind,
        firstCorrect: true,
        answer: 'E',
        answerKeyId: 'E4',
        hintUsed: false,
        responseMs: 700,
        settings: DEFAULT_TEST_SETTINGS,
        reviewedAt
      });

      expect(res.fsrsResult).toBeNull();
      expect(res.logEvent.scheduledDays).toBeNull();
      expect(res.logEvent.elapsedDays).toBeNull();
      expect(res.logEvent.stabilityBefore).toBe(6.5);
      expect(res.logEvent.stabilityAfter).toBe(6.5);
      expect(res.logEvent.difficultyBefore).toBe(4.5);
      expect(res.logEvent.difficultyAfter).toBe(4.5);
      expect(card.reps).toBe(2);
      expect(card.lastReviewAt).toBe(originalLastReviewAt);
    }
  });
});

describe('Learning-State Integrity Prerequisites (Milestone 2 — Revision 1)', () => {
  it('1. Card.stats sequence: New + Good -> Scheduled + Good -> Scheduled + Again', () => {
    const card = makeFreshCard('find:C', 'find', 'C');
    const t1 = 1_700_000_000_000;
    const t2 = t1 + 3 * DAY_MS;
    const t3 = t2 + 7 * DAY_MS;

    // Review 1: new + Good
    const r1 = applyReviewAndBuildLog({
      card,
      kind: 'new',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 850,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t1,
      sessionId: 'session-1'
    });

    expect(r1.grade).toBe(3);
    expect(r1.statsUpdated).toBe(true);
    expect(r1.cardMutated).toBe(true);
    expect(card.stats).toEqual({
      trials: 1,
      firstCorrect: 1,
      firstWrong: 0,
      hints: 0,
      scheduledSuccesses: 1,
      recentScheduledSuccesses: 1,
      practiceTrials: 0
    });

    // Review 2: scheduled + Good
    const r2 = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      hintUsed: false,
      responseMs: 780,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t2,
      sessionId: 'session-2'
    });

    expect(r2.grade).toBe(3);
    expect(r2.statsUpdated).toBe(true);
    expect(r2.cardMutated).toBe(true);
    expect(card.stats).toEqual({
      trials: 2,
      firstCorrect: 2,
      firstWrong: 0,
      hints: 0,
      scheduledSuccesses: 2,
      recentScheduledSuccesses: 2,
      practiceTrials: 0
    });

    // Review 3: scheduled + Again
    const r3 = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: false,
      answer: 'D',
      answerKeyId: 'D4',
      hintUsed: false,
      responseMs: 1400,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: t3,
      sessionId: 'session-3'
    });

    expect(r3.grade).toBe(1);
    expect(r3.statsUpdated).toBe(true);
    expect(r3.cardMutated).toBe(true);
    expect(card.stats).toEqual({
      trials: 3,
      firstCorrect: 2,
      firstWrong: 1,
      hints: 0,
      scheduledSuccesses: 2,
      recentScheduledSuccesses: 0,
      practiceTrials: 0
    });
  });

  it('2. Practice + correct increments trials, firstCorrect, and practiceTrials without mutating FSRS scheduling', () => {
    const originalLastReviewAt = 1_700_000_000_000;
    const originalDueAt = originalLastReviewAt + 5 * DAY_MS;
    const card: Card = {
      ...makeFreshCard('identify:G', 'identify', 'G'),
      memoryState: 'review',
      stability: 5.5,
      difficulty: 4.9,
      lastReviewAt: originalLastReviewAt,
      dueAt: originalDueAt,
      reps: 2,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 2,
        firstCorrect: 2,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 2,
        scheduledSuccesses: 2,
        practiceTrials: 0
      }
    };

    const res = applyReviewAndBuildLog({
      card,
      kind: 'practice',
      firstCorrect: true,
      answer: 'G',
      answerKeyId: null,
      hintUsed: false,
      responseMs: 650,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: originalLastReviewAt + DAY_MS,
      sessionId: 'session-practice'
    });

    expect(res.fsrsResult).toBeNull();
    expect(res.statsUpdated).toBe(true);
    expect(res.cardMutated).toBe(true);

    expect(card.stats.trials).toBe(3);
    expect(card.stats.firstCorrect).toBe(3);
    expect(card.stats.firstWrong).toBe(0);
    expect(card.stats.practiceTrials).toBe(1);
    expect(card.stats.scheduledSuccesses).toBe(2);
    expect(card.stats.recentScheduledSuccesses).toBe(2);

    // FSRS scheduling fields remain completely untouched
    expect(card.reps).toBe(2);
    expect(card.stability).toBe(5.5);
    expect(card.difficulty).toBe(4.9);
    expect(card.lastReviewAt).toBe(originalLastReviewAt);
    expect(card.dueAt).toBe(originalDueAt);
  });

  it("3. Don't know increments trials, firstWrong, and hints, sets grade = 1 (Again), and resets recentScheduledSuccesses = 0", () => {
    const now = 1_700_000_000_000;
    const card: Card = {
      ...makeFreshCard('notationToKey:F', 'notationToKey', 'F'),
      memoryState: 'review',
      stability: 6.0,
      difficulty: 5.0,
      lastReviewAt: now - 4 * DAY_MS,
      dueAt: now - 1000,
      reps: 2,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 2,
        firstCorrect: 2,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 2,
        scheduledSuccesses: 2,
        practiceTrials: 0
      }
    };

    const res = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: false,
      answer: null,
      answerKeyId: null,
      hintUsed: true,
      responseMs: 1100,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: now,
      sessionId: 'session-dk'
    });

    expect(res.grade).toBe(1);
    expect(res.logEvent.grade).toBe(1);
    expect(res.logEvent.gradeName).toBe('Again');
    expect(res.statsUpdated).toBe(true);
    expect(res.cardMutated).toBe(true);

    expect(card.stats.trials).toBe(3);
    expect(card.stats.firstCorrect).toBe(2);
    expect(card.stats.firstWrong).toBe(1);
    expect(card.stats.hints).toBe(1);
    expect(card.stats.scheduledSuccesses).toBe(2);
    expect(card.stats.recentScheduledSuccesses).toBe(0);
  });

  it('4. Cold Test remains diagnostic only and never mutates Card.stats', () => {
    const card = makeFreshCard('soundToKey:A', 'soundToKey', 'A');
    const initialStats = { ...card.stats };

    const res = applyReviewAndBuildLog({
      card,
      kind: 'cold',
      firstCorrect: true,
      answer: 'A',
      answerKeyId: 'A4',
      hintUsed: false,
      responseMs: 700,
      settings: DEFAULT_TEST_SETTINGS,
      reviewedAt: 1_700_000_000_000,
      sessionId: createSessionId('cold', 1_700_000_000_000)
    });

    expect(res.fsrsResult).toBeNull();
    expect(res.statsUpdated).toBe(false);
    expect(res.cardMutated).toBe(false);
    expect(card.stats).toEqual(initialStats);
  });

  it('5. determineGrade() observes pre-review Card.stats before applyReviewStats mutates counters', () => {
    const now = 1_700_000_000_000;
    const card: Card = {
      ...makeFreshCard('find:D', 'find', 'D'),
      memoryState: 'review',
      stability: 3.2,
      difficulty: 5.0,
      lastReviewAt: now - 3 * DAY_MS,
      dueAt: now - 1000,
      reps: 1,
      lapses: 0,
      lastGrade: 3,
      stats: {
        trials: 1,
        firstCorrect: 1,
        firstWrong: 0,
        hints: 0,
        // Easy (grade 4) requires recentScheduledSuccesses >= 2 BEFORE this review
        recentScheduledSuccesses: 1,
        scheduledSuccesses: 1,
        practiceTrials: 0
      }
    };

    const res = applyReviewAndBuildLog({
      card,
      kind: 'scheduled',
      firstCorrect: true,
      answer: 'D',
      answerKeyId: 'D4',
      hintUsed: false,
      responseMs: 400, // Fast enough for Easy if recentScheduledSuccesses were already >= 2
      settings: {
        ...DEFAULT_TEST_SETTINGS,
        useLatencyGrading: true
      },
      reviewedAt: now,
      sessionId: 'session-latency'
    });

    // Pre-review recentScheduledSuccesses was 1, so determineGrade must return 3 (Good), not 4 (Easy)
    expect(res.grade).toBe(3);
    // Post-review stats now have recentScheduledSuccesses === 2 for the NEXT review
    expect(card.stats.recentScheduledSuccesses).toBe(2);
  });

  it('6. Curriculum readiness progression across distinct sessions vs. single session', () => {
    const t1 = 1_700_000_000_000;
    const t2 = t1 + 4 * DAY_MS;

    const sessionA = createSessionId('normal', t1);
    const sessionB = createSessionId('normal', t2);
    expect(sessionA).not.toBe(sessionB);

    const card = makeFreshCard('find:C', 'find', 'C');

    // Session A: New card + Good
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
      sessionId: sessionA
    });

    // Session B: Scheduled card + Good
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
      sessionId: sessionB
    });

    expect(card.stability).toBeGreaterThanOrEqual(CURRICULUM_MIN_STABILITY_DAYS);
    expect(card.stats.scheduledSuccesses).toBe(2);

    // Two distinct sessions (session-A and session-B) -> ready!
    const distinctSessionLogs = [r1.logEvent, r2.logEvent];
    expect(successfulScheduledSessions(card.id, distinctSessionLogs)).toBe(2);
    expect(curriculumCardReady(card, distinctSessionLogs)).toBe(true);

    // Same two events with the same sessionId -> counts as 1 session -> not ready!
    const sameSessionLogs = [
      { ...r1.logEvent, sessionId: 'session-A' },
      { ...r2.logEvent, sessionId: 'session-A' }
    ];
    expect(successfulScheduledSessions(card.id, sameSessionLogs)).toBe(1);
    expect(curriculumCardReady(card, sameSessionLogs)).toBe(false);
  });
});

