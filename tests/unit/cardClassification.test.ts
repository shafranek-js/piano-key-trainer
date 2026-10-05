import { describe, expect, it } from 'vitest';
import { isInvalidFsrsDueTimestamp } from '../../src/core/fsrs/cardClassification';
import type { Card } from '../../src/core/fsrs/types';

function makeCard(dueAt: number, memoryState: Card['memoryState'] = 'review'): Card {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState,
    stability: memoryState === 'new' ? null : 1,
    difficulty: memoryState === 'new' ? null : 5,
    dueAt,
    lastReviewAt: memoryState === 'new' ? 0 : 1,
    firstSeenAt: 1,
    reps: memoryState === 'new' ? 0 : 1,
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

describe('FSRS due timestamp validation', () => {
  it.each([
    ['valid integer millisecond timestamp', 1_791_916_528_197, 'review', false],
    ['valid fractional millisecond timestamp', 1_791_916_528_197.4739, 'review', false],
    ['new card zero timestamp', 0, 'new', false],
    ['NaN', Number.NaN, 'review', true],
    ['positive infinity', Number.POSITIVE_INFINITY, 'review', true],
    ['maximum number outside Date range', Number.MAX_VALUE, 'review', true],
    ['negative timestamp', -1, 'review', true]
  ] as const)('%s', (_label, dueAt, memoryState, invalid) => {
    expect(isInvalidFsrsDueTimestamp(makeCard(dueAt, memoryState))).toBe(invalid);
  });
});
