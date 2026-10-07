import type { Card, ReviewLogEvent } from './types';
import { resolveReviewEventId } from './reviewEventId';

export interface PersistReviewRecord {
  card: Card | null;
  event: ReviewLogEvent;
}

export type PersistReview = (record: PersistReviewRecord) => Promise<void>;

function hasSameReviewIdentity(left: ReviewLogEvent, right: ReviewLogEvent): boolean {
  const leftId = resolveReviewEventId(left);
  const rightId = resolveReviewEventId(right);
  if (leftId && rightId) return leftId === rightId;
  return left.ts === right.ts &&
    left.sessionId === right.sessionId &&
    left.cardId === right.cardId;
}

function findExistingByEventIdentity(
  reviewLogs: readonly ReviewLogEvent[],
  logEvent: ReviewLogEvent
): ReviewLogEvent | undefined {
  const eventId = resolveReviewEventId(logEvent);
  if (!eventId) {
    return reviewLogs.find(event => event.ts === logEvent.ts);
  }
  return reviewLogs.find(event => resolveReviewEventId(event) === eventId);
}

/**
 * Persists a single review and returns the corresponding in-memory log list.
 *
 * The stable `reviewEventId` is the identity: retrying the same failed commit reuses the
 * same id and is idempotent, while two legitimate events that share a millisecond timestamp
 * persist independently.
 */
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

  const existing = findExistingByEventIdentity(reviewLogs, logEvent);
  if (existing) {
    if (hasSameReviewIdentity(existing, logEvent)) return [...reviewLogs];
    throw new Error(`Review event identity collision at ${resolveReviewEventId(logEvent) ?? logEvent.ts}.`);
  }

  await persist({ card: cardMutated ? card : null, event: logEvent });
  return [...reviewLogs, logEvent];
}
