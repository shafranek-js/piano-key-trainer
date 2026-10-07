import { describe, expect, it } from 'vitest';
import vectors from '../fixtures/fsrsCanonicalVectors.json';
import {
  DAY_MS,
  DECAY,
  FACTOR,
  W,
  STABILITY_MIN,
  applyFsrsReview,
  elapsedWholeDays,
  forgetStability,
  initialDifficulty,
  initialDifficultyRaw,
  initialStability,
  nextDifficulty,
  recallStability,
  retrievability,
  scheduleIntervalMs,
  shortTermStability
} from '../../src/core/fsrs/fsrs6';
import type { Card, Grade } from '../../src/core/fsrs/types';

const RETENTION = 0.9;
const MAX_INTERVAL = 120;
const RELEARNING_SECONDS = 45;
const BASE_MS = Date.parse('2026-01-01T00:00:00Z');

function expectClose(actual: number | null | undefined, expected: number, tolerance = 1e-9): void {
  expect(actual).not.toBeNull();
  expect(actual).not.toBeUndefined();
  const value = actual as number;
  const diff = Math.abs(value - expected);
  const scale = Math.max(1, Math.abs(expected));
  expect(diff).toBeLessThanOrEqual(tolerance * scale);
}

function createCard(): Card {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState: 'new',
    stability: null,
    difficulty: null,
    dueAt: BASE_MS,
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

const APP_STATE_BY_CANONICAL: Record<string, Card['memoryState']> = {
  review: 'review',
  relearning: 'relearning',
  // The reference has a dedicated Learning step; this app maps it to its single relearning step.
  learning: 'relearning'
};

describe('FSRS-6 canonical parity (pinned py-fsrs 6.3.2)', () => {
  it('pins the canonical reference and matching default parameters', () => {
    expect(vectors.reference.version).toBe('6.3.2');
    expect(vectors.reference.commit).toBe('9446cb06605c597a063aeee49f7d188d42e34dc2');
    expect(vectors.formulas.default_parameters).toHaveLength(21);
    for (let index = 0; index < W.length; index++) {
      expect(W[index]).toBe(vectors.formulas.default_parameters[index]);
    }
    expectClose(-DECAY, vectors.formulas.decay);
    expectClose(FACTOR, vectors.formulas.factor);
    expect(STABILITY_MIN).toBe(0.001);
  });

  it('matches initial stability and difficulty vectors', () => {
    for (const vector of vectors.formulas.initial_stability) {
      expectClose(initialStability(vector.grade as Grade), vector.expected);
    }
    for (const vector of vectors.formulas.initial_difficulty) {
      expectClose(initialDifficulty(vector.grade as Grade), vector.expected_clamped);
      expectClose(initialDifficultyRaw(vector.grade as Grade), vector.expected_raw);
    }
  });

  it('matches next difficulty including the unclamped mean-reversion target', () => {
    for (const vector of vectors.formulas.next_difficulty) {
      expectClose(nextDifficulty(vector.difficulty, vector.grade as Grade), vector.expected);
    }
    // Canonical D0(Easy) is negative; clamping it (old behaviour) would shift every update.
    expect(initialDifficultyRaw(4)).toBeLessThan(0);
    expect(initialDifficulty(4)).toBe(1);
  });

  it('matches recall, forget, short-term stability and retrievability vectors', () => {
    for (const vector of vectors.formulas.recall_stability) {
      expectClose(
        recallStability(vector.difficulty, vector.stability, vector.retrievability, vector.grade as Grade),
        vector.expected
      );
    }
    for (const vector of vectors.formulas.forget_stability) {
      expectClose(
        forgetStability(vector.difficulty, vector.stability, vector.retrievability),
        vector.expected
      );
    }
    for (const vector of vectors.formulas.short_term_stability) {
      expectClose(shortTermStability(vector.stability, vector.grade as Grade), vector.expected);
    }
    for (const vector of vectors.formulas.retrievability) {
      const card = { lastReviewAt: BASE_MS, stability: vector.stability };
      expectClose(
        retrievability(card, BASE_MS + vector.elapsedDays * DAY_MS),
        vector.expected
      );
    }
  });

  it('schedules whole-day intervals exactly like the canonical implementation', () => {
    for (const vector of vectors.formulas.next_interval) {
      const scheduled = scheduleIntervalMs(vector.stability, RETENTION, MAX_INTERVAL);
      expect(scheduled.days).toBe(vector.expected);
      expect(scheduled.ms).toBe(vector.expected * DAY_MS);
      expect(Number.isInteger(scheduled.days)).toBe(true);
    }
  });

  it('exposes whole-day elapsed semantics for the <1d / >=1d branch', () => {
    const lastReviewAt = BASE_MS - 12 * 3600 * 1000;
    expect(elapsedWholeDays(lastReviewAt, BASE_MS)).toBe(0);
    expect(elapsedWholeDays(BASE_MS - DAY_MS, BASE_MS)).toBe(1);
    expect(elapsedWholeDays(BASE_MS - 2 * DAY_MS + 1, BASE_MS)).toBe(1);
    expect(elapsedWholeDays(0, BASE_MS)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('FSRS-6 sequence parity against canonical trajectories', () => {
  const documentedDeviation = (sequenceId: string, stepIndex: number): boolean =>
    sequenceId === 'new_again_hard_good_easy' && stepIndex === 1;

  for (const sequence of vectors.sequences) {
    it(`reproduces '${sequence.id}' (S/D always; state and interval except documented deviations)`, () => {
      const card = createCard();
      sequence.steps.forEach((step, stepIndex) => {
        const now = BASE_MS + step.offsetSeconds * 1000;
        const result = applyFsrsReview(card, step.grade as Grade, now, {
          desiredRetention: RETENTION,
          maxIntervalDays: MAX_INTERVAL,
          relearningSeconds: RELEARNING_SECONDS
        });
        expect(result.intervalDays).toBeGreaterThan(0);
        expectClose(card.stability, step.stability);
        expectClose(card.difficulty, step.difficulty);

        if (documentedDeviation(sequence.id, stepIndex)) {
          // Documented app policy deviation: Hard on a 45 s step card leaves the step
          // immediately (app has a single relearning step) and schedules a whole day.
          expect(card.memoryState).toBe('review');
          expect((card.dueAt - now) / 1000).toBe(DAY_MS / 1000);
          return;
        }

        expect(card.memoryState).toBe(APP_STATE_BY_CANONICAL[step.state]);
        expectClose((card.dueAt - now) / 1000, step.dueOffsetSeconds, 1e-6);
      });
    });
  }

  it('keeps the <1 day and >=1 day branches distinct for a Review card', () => {
    const reviewCard: Card = {
      ...createCard(),
      memoryState: 'review',
      stability: 10,
      difficulty: 5,
      reps: 4,
      lastReviewAt: BASE_MS - 12 * 3600 * 1000
    };
    const sameDay = JSON.parse(JSON.stringify(reviewCard)) as Card;
    const sameDayResult = applyFsrsReview(sameDay, 3, BASE_MS, {
      desiredRetention: RETENTION,
      maxIntervalDays: MAX_INTERVAL,
      relearningSeconds: RELEARNING_SECONDS
    });
    expectClose(
      sameDayResult.after.stability,
      shortTermStability(10, 3)
    );

    const nextDay: Card = {
      ...reviewCard,
      lastReviewAt: BASE_MS - DAY_MS
    };
    const nextDayResult = applyFsrsReview(nextDay, 3, BASE_MS, {
      desiredRetention: RETENTION,
      maxIntervalDays: MAX_INTERVAL,
      relearningSeconds: RELEARNING_SECONDS
    });
    expectClose(
      nextDayResult.after.stability,
      recallStability(
        5,
        10,
        retrievability({ lastReviewAt: BASE_MS - DAY_MS, stability: 10 }, BASE_MS) as number,
        3
      )
    );
    expect(nextDayResult.after.stability).not.toBe(sameDayResult.after.stability);
  });
});
