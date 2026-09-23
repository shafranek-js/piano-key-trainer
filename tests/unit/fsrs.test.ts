import { describe, it, expect } from 'vitest';
import { 
  FACTOR, 
  DECAY, 
  initialDifficulty, 
  initialStability, 
  nextDifficulty, 
  retrievability, 
  intervalForRetention, 
  forgetStability, 
  recallStability, 
  applyFsrsReview 
} from '../../src/core/fsrs/fsrs6';
import type { Card } from '../../src/core/fsrs/types';

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
    const card: Card = {
      id: 'find:C',
      skill: 'find',
      note: 'C',
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

    const now = Date.now();
    const settings = {
      desiredRetention: 0.9,
      maxIntervalDays: 120,
      relearningSeconds: 45
    };

    const res = applyFsrsReview(card, 3, now, settings);
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

    const settings = {
      desiredRetention: 0.9,
      maxIntervalDays: 120,
      relearningSeconds: 45
    };

    applyFsrsReview(card, 1, now, settings);
    expect(card.reps).toBe(6);
    expect(card.lapses).toBe(1);
    expect(card.memoryState).toBe('relearning');
    expect(card.dueAt).toBe(now + 45 * 1000);
  });
});
