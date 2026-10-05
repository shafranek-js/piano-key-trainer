import type { Card, ReviewLogEvent } from './types';

export interface PersistReviewRecord {
  card: Card | null;
  event: ReviewLogEvent;
}

export type PersistReview = (record: PersistReviewRecord) => Promise<void>;

function hasSameReviewIdentity(left: ReviewLogEvent, right: ReviewLogEvent): boolean {
  return left.ts === right.ts &&
    left.sessionId === right.sessionId &&
    left.cardId === right.cardId;
}

/** Persists a single review and returns the corresponding in-memory log list. */
export async function commitCardReview(params: {
  card: Card | null;
  logEvent: ReviewLogEvent | null;
  cardMutated: boolean;
  reviewLogs: readonly ReviewLogEvent[];
  persist: PersistReview;
}): Promise<ReviewLogEvent[]> {
  const { card, logEvent, cardMutated, reviewLogs, persist } = params;
  if (!logEvent) return [...reviewLogs];
  if (cardMutated && !card) {
    throw new Error(`Cannot persist mutated card for review ${logEvent.ts}: card is missing.`);
  }

  const existing = reviewLogs.find(event => event.ts === logEvent.ts);
  if (existing) {
    if (hasSameReviewIdentity(existing, logEvent)) return [...reviewLogs];
    throw new Error(`Review timestamp collision at ${logEvent.ts}.`);
  }

  await persist({ card: cardMutated ? card : null, event: logEvent });
  return [...reviewLogs, logEvent];
}
