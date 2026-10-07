import type { Card, ReviewLogEvent } from '../core/fsrs/types';
import { resolveReviewEventId } from '../core/fsrs/reviewEventId';
import type { PianoTrainerDatabase } from './db';

export type AtomicReviewPersistStatus = 'persisted' | 'duplicate_rejected';

/**
 * Atomic review commit: card mutation + review event in ONE IndexedDB transaction,
 * keyed by the stable `reviewEventId`.
 *
 * - Retrying the same event is idempotent (`duplicate_rejected`, no second mutation).
 * - A failure aborts the whole transaction, so neither the card update nor the log exist.
 * - Different events sharing one millisecond persist independently.
 */
export async function persistReviewEventAtomically(
  database: PianoTrainerDatabase,
  record: { card: Card | null; event: ReviewLogEvent }
): Promise<AtomicReviewPersistStatus> {
  const eventId = resolveReviewEventId(record.event);
  if (!eventId) throw new Error('Review event has no stable identity.');
  const storedEvent: ReviewLogEvent & { reviewEventId: string } = {
    ...record.event,
    reviewEventId: eventId
  };
  let status: AtomicReviewPersistStatus = 'persisted';

  await database.transaction('rw', database.cards, database.reviewLogEvents, async () => {
    const existing = await database.reviewLogEvents.get(eventId);
    if (existing) {
      if (
        existing.ts === storedEvent.ts &&
        existing.sessionId === storedEvent.sessionId &&
        existing.cardId === storedEvent.cardId
      ) {
        status = 'duplicate_rejected';
        return;
      }
      throw new Error(`Review event identity collision at ${eventId}.`);
    }
    if (record.card) await database.cards.put(record.card);
    await database.reviewLogEvents.add(storedEvent);
  });

  return status;
}
