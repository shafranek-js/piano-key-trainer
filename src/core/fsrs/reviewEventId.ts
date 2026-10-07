import type { ReviewLogEvent } from './types';

let reviewEventSequence = 0;

export interface ReviewEventIdSeed {
  ts: number;
  sessionId: string;
  cardId: string;
}

/**
 * Creates a stable unique identity for a review event before persistence.
 * The same id is reused if persistence is retried.
 */
export function createReviewEventId(seed: ReviewEventIdSeed): string {
  reviewEventSequence += 1;
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `${seed.ts.toString(36)}-${cryptoRef.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${seed.ts.toString(36)}-${reviewEventSequence.toString(36)}-${random}`;
}

/**
 * Deterministic identity backfill for legacy rows. The legacy schema used `ts` as the
 * primary key, so `legacy-<ts>` is unique inside one migrated database.
 */
export function backfillReviewEventId(ts: number): string {
  return `legacy-${ts}`;
}

export function resolveReviewEventId(
  event: Pick<ReviewLogEvent, 'reviewEventId' | 'ts'>
): string | null {
  if (event.reviewEventId && event.reviewEventId.trim().length > 0) {
    return event.reviewEventId;
  }
  return typeof event.ts === 'number' && Number.isFinite(event.ts) && event.ts > 0
    ? backfillReviewEventId(event.ts)
    : null;
}
