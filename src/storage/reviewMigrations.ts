import type { ReviewLogEvent } from '../core/fsrs/types';
import { backfillReviewEventId } from '../core/fsrs/reviewEventId';
import { resolveResponseTimingSource } from '../core/fsrs/responseTiming';

/**
 * Physical IndexedDB store for review events (schema v3+).
 * `reviewEventId` is the primary key; `ts` is a regular indexed chronology field.
 */
export const REVIEW_LOGS_TABLE = 'reviewLogEvents';

/**
 * Backfills identity/provenance metadata on a legacy row without touching
 * timestamps, card ids, session ids, grades or chronology.
 */
export function migrateLegacyReviewLog(row: ReviewLogEvent): ReviewLogEvent {
  return {
    ...row,
    reviewEventId: row.reviewEventId ?? backfillReviewEventId(row.ts),
    responseTimingSource: resolveResponseTimingSource(row)
  };
}
