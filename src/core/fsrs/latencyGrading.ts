import type { Card, Grade, ReviewLogEvent, Skill } from './types';
import { quantile } from './math';

export interface LatencyStats {
  n: number;
  p30: number | null;
  p85: number | null;
  median: number | null;
}

export function latencyStats(
  skill: Skill,
  reviewLog: readonly ReviewLogEvent[]
): LatencyStats {
  const values = reviewLog
    .filter(
      x =>
        x.kind !== 'cold' &&
        x.skill === skill &&
        x.firstCorrect &&
        !x.hintUsed &&
        Number.isFinite(x.responseMs)
    )
    .slice(-250)
    .map(x => x.responseMs);

  return {
    n: values.length,
    p30: quantile(values, 0.30),
    p85: quantile(values, 0.85),
    median: quantile(values, 0.50)
  };
}

export interface DetermineGradeParams {
  firstCorrect: boolean;
  hintUsed: boolean;
  responseMs: number;
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
