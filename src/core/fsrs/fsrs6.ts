import type { Card, Grade, MemoryState, UserSettings } from './types';
import { W, DECAY, FACTOR, DAY_MS } from './constants';
import { clamp } from './math';

export { W, DECAY, FACTOR, DAY_MS };


export interface MemorySnapshot {
  stability: number | null;
  difficulty: number | null;
  dueAt: number;
  lastReviewAt: number;
  retrievability: number | null;
}

export interface FsrsReviewResult {
  before: MemorySnapshot;
  after: MemorySnapshot;
  intervalDays: number;
  label: string;
}

export function initialStability(grade: Grade): number {
  return Math.max(W[grade - 1], 0.01);
}

export function initialDifficulty(grade: Grade): number {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

export function nextDifficulty(difficulty: number, grade: Grade): number {
  const target = initialDifficulty(4);
  const delta = -W[6] * (grade - 3);
  const damped = ((10 - difficulty) * delta) / 9;
  return clamp(W[7] * target + (1 - W[7]) * (difficulty + damped), 1, 10);
}

export function retrievability(
  card: Pick<Card, 'lastReviewAt' | 'stability'>,
  now = Date.now()
): number | null {
  if (!card || !card.lastReviewAt || !(card.stability != null && card.stability > 0)) {
    return null;
  }
  const elapsedDays = Math.max(0, now - card.lastReviewAt) / DAY_MS;
  return Math.pow(1 + (FACTOR * elapsedDays) / card.stability, -DECAY);
}

export function intervalForRetention(stability: number, retention: number): number {
  return (stability / FACTOR) * (Math.pow(retention, -1 / DECAY) - 1);
}

export function shortTermStability(stability: number, grade: Grade): number {
  let inc = Math.exp(W[17] * (grade - 3 + W[18])) * Math.pow(stability, -W[19]);
  if (grade >= 2) inc = Math.max(1, inc);
  return Math.max(0.01, stability * inc);
}

export function recallStability(
  difficulty: number,
  stability: number,
  r: number,
  grade: Grade
): number {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  return Math.max(
    0.01,
    stability *
      (1 +
        Math.exp(W[8]) *
          (11 - difficulty) *
          Math.pow(stability, -W[9]) *
          (Math.exp((1 - r) * W[10]) - 1) *
          hardPenalty *
          easyBonus)
  );
}

export function forgetStability(
  difficulty: number,
  stability: number,
  r: number
): number {
  const longTerm =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp((1 - r) * W[14]);
  const shortTermCap = stability / Math.exp(W[17] * W[18]);
  return Math.max(0.01, Math.min(longTerm, shortTermCap));
}

export function scheduleIntervalMs(
  stability: number,
  desiredRetention: number,
  maxIntervalDays: number
): { days: number; ms: number } {
  const days = clamp(
    intervalForRetention(stability, desiredRetention),
    1,
    maxIntervalDays
  );
  return { days, ms: days * DAY_MS };
}

export function snapshotMemory(card: Card, now = Date.now()): MemorySnapshot {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: card.dueAt,
    lastReviewAt: card.lastReviewAt,
    retrievability: retrievability(card, now)
  };
}

export function formatDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} ч`;
  if (days < 14) return `${Math.max(1, Math.round(days))} дн.`;
  if (days < 60) return `${Math.round(days / 7)} нед.`;
  return `${Math.round(days / 30)} мес.`;
}

export function applyFsrsReview(
  card: Card,
  grade: Grade,
  now: number,
  settings: Pick<UserSettings, 'desiredRetention' | 'maxIntervalDays' | 'relearningSeconds'>
): FsrsReviewResult {
  const before = snapshotMemory(card, now);
  const wasNew =
    card.reps === 0 ||
    card.stability == null ||
    card.stability <= 0 ||
    card.difficulty == null ||
    card.difficulty <= 0;
  const wasRelearning = card.memoryState === 'relearning';

  let s: number;
  let d: number;

  if (wasNew) {
    s = initialStability(grade);
    d = initialDifficulty(grade);
  } else {
    const currentDiff = card.difficulty ?? initialDifficulty(3);
    const currentStab = card.stability ?? initialStability(3);
    const r = before.retrievability ?? 1;

    d = nextDifficulty(currentDiff, grade);
    if (wasRelearning) {
      s = shortTermStability(currentStab, grade);
    } else if (grade === 1) {
      s = forgetStability(d, currentStab, r);
    } else {
      s = recallStability(d, currentStab, r, grade);
    }
  }

  card.stability = s;
  card.difficulty = d;
  card.reps += 1;
  card.lastReviewAt = now;
  card.lastGrade = grade;
  if (!card.firstSeenAt) card.firstSeenAt = now;

  if (grade === 1) {
    card.lapses += 1;
    card.memoryState = 'relearning';
    card.dueAt = now + settings.relearningSeconds * 1000;
    return {
      before,
      after: snapshotMemory(card, now),
      intervalDays: settings.relearningSeconds / 86400,
      label: `короткое повторение через ${settings.relearningSeconds} сек`
    };
  }

  card.memoryState = 'review';
  const interval = scheduleIntervalMs(
    s,
    settings.desiredRetention,
    settings.maxIntervalDays
  );
  card.dueAt = now + interval.ms;
  return {
    before,
    after: snapshotMemory(card, now),
    intervalDays: interval.days,
    label: `следующая проверка примерно через ${formatDays(interval.days)}`
  };
}

export function isMastered(card: Card): boolean {
  return (
    card.reps > 0 &&
    (card.stability ?? 0) >= 30 &&
    (card.stats?.recentScheduledSuccesses ?? 0) >= 3 &&
    card.lastGrade !== 1
  );
}
