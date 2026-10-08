import type { Card, CardStats } from './types';

export const EMPTY_CARD_STATS: CardStats = {
  trials: 0,
  firstCorrect: 0,
  firstWrong: 0,
  hints: 0,
  recentScheduledSuccesses: 0,
  scheduledSuccesses: 0,
  practiceTrials: 0
};

/**
 * Canonical guard for `Card.stats`: ensures the object exists and every counter is a
 * finite non-negative integer. Legacy/imported cards without `stats` are normalized in
 * place instead of crashing the scheduler or curriculum evaluation.
 */
export function ensureCardStats(card: Card): CardStats {
  const raw = card.stats;
  if (!raw || typeof raw !== 'object') {
    card.stats = { ...EMPTY_CARD_STATS };
    return card.stats;
  }
  for (const key of Object.keys(EMPTY_CARD_STATS) as Array<keyof CardStats>) {
    const value = (raw as unknown as Record<string, unknown>)[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      raw[key] = 0;
    } else if (!Number.isInteger(value)) {
      raw[key] = Math.floor(value);
    }
  }
  return raw;
}
