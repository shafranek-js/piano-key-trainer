import type { Card, Grade, ReviewLogEvent, Skill } from './types';
import { quantile } from './math';
import { isMeasuredResponse, resolveResponseTimingSource } from './responseTiming';

export interface LatencyStats {
  n: number;
  p30: number | null;
  p85: number | null;
  median: number | null;
  /** Relevant records excluded because their timing was never measured. */
  excludedNotMeasured: number;
  /** Relevant records excluded because timing provenance is unknown (legacy). */
  excludedLegacyUnknown: number;
}

function isRelevantLatencyRecord(event: ReviewLogEvent, skill: Skill): boolean {
  return event.kind !== 'cold' && event.skill === skill && event.firstCorrect && !event.hintUsed;
}

/**
 * Adaptive latency statistics are built exclusively from real measured interactions.
 * Synthetic/legacy records never influence P30/P85 (see `responseTiming.ts`).
 */
export function latencyStats(
  skill: Skill,
  reviewLog: readonly ReviewLogEvent[]
): LatencyStats {
  const relevant = reviewLog.filter(event => isRelevantLatencyRecord(event, skill));
  const values = relevant
    .filter(isMeasuredResponse)
    .slice(-250)
    .map(event => event.responseMs as number);

  let excludedNotMeasured = 0;
  let excludedLegacyUnknown = 0;
  for (const event of relevant) {
    if (isMeasuredResponse(event)) continue;
    if (resolveResponseTimingSource(event) === 'legacy_unknown') excludedLegacyUnknown += 1;
    else excludedNotMeasured += 1;
  }

  return {
    n: values.length,
    p30: quantile(values, 0.30),
    p85: quantile(values, 0.85),
    median: quantile(values, 0.50),
    excludedNotMeasured,
    excludedLegacyUnknown
  };
}

export interface DetermineGradeParams {
  firstCorrect: boolean;
  hintUsed: boolean;
  /** Null when the interaction was not timed; latency grading cannot apply. */
  responseMs: number | null;
  card: Card;
  reviewLog: readonly ReviewLogEvent[];
  useLatencyGrading: boolean;
}

export function determineGrade({
  firstCorrect,
  hintUsed,
  responseMs,
  card,
  reviewLog,
  useLatencyGrading
}: DetermineGradeParams): Grade {
  if (!firstCorrect || hintUsed) return 1; // Again
  if (!useLatencyGrading) return 3; // Good
  if (typeof responseMs !== 'number' || !Number.isFinite(responseMs)) return 3; // Good

  const ls = latencyStats(card.skill, reviewLog);
  if (ls.n < 8) return 3;

  if (ls.p85 != null && responseMs > ls.p85) return 2; // Hard

  const mature =
    card.reps >= 4 &&
    (card.stability ?? 0) >= 7 &&
    (card.stats?.recentScheduledSuccesses ?? 0) >= 3;

  if (mature && ls.p30 != null && responseMs < ls.p30) return 4; // Easy

  return 3; // Good
}
