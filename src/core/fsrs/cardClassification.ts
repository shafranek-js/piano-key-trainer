import type { Card } from './types';

export type FsrsLifecycleClassification =
  | 'newInactive'
  | 'newEligible'
  | 'learning'
  | 'reviewFuture'
  | 'reviewDue'
  | 'reviewOverdue';

const ONE_DAY_MS = 86_400_000;

function hasValidDateTimestamp(timestamp: number): boolean {
  return Number.isFinite(timestamp) &&
    Math.abs(timestamp) <= 8.64e15 &&
    Number.isFinite(new Date(timestamp).getTime());
}

export function isFsrsCardDue(card: Card, now: number): boolean {
  const state = card.memoryState ?? (card.reps > 0 ? 'review' : 'new');
  return state !== 'new' &&
    card.reps > 0 &&
    Number.isFinite(card.dueAt) &&
    card.dueAt > 0 &&
    card.dueAt <= now;
}

export function isFsrsCardOverdue(card: Card, now: number): boolean {
  const state = card.memoryState ?? (card.reps > 0 ? 'review' : 'new');
  return state === 'review' &&
    card.reps > 0 &&
    card.lastReviewAt > 0 &&
    Number.isFinite(card.lastReviewAt) &&
    Number.isFinite(card.dueAt) &&
    card.dueAt > 0 &&
    card.dueAt < now - ONE_DAY_MS;
}

export function isInvalidFsrsDueTimestamp(card: Card): boolean {
  const state = card.memoryState ?? (card.reps > 0 ? 'review' : 'new');
  if (!hasValidDateTimestamp(card.dueAt) || card.dueAt < 0) return true;
  return state !== 'new' && card.reps > 0 && card.lastReviewAt > 0 && card.dueAt === 0;
}

export function classifyFsrsCard(
  card: Card,
  now: number,
  eligibleForPractice: boolean
): FsrsLifecycleClassification {
  const state = card.memoryState ?? (card.reps > 0 ? 'review' : 'new');
  if (state === 'new') return eligibleForPractice ? 'newEligible' : 'newInactive';
  if (state === 'learning' || state === 'relearning') return 'learning';
  if (isFsrsCardOverdue(card, now)) return 'reviewOverdue';
  if (isFsrsCardDue(card, now)) return 'reviewDue';
  return 'reviewFuture';
}
