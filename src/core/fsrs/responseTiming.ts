import type { ResponseTimingSource, ReviewLogEvent } from './types';
import { quantile } from './math';

/**
 * Resolves the timing provenance of a review event.
 * Records created before the provenance field existed are `legacy_unknown`:
 * their `responseMs` (if any) must never feed adaptive latency statistics.
 */
export function resolveResponseTimingSource(
  event: Pick<ReviewLogEvent, 'responseTimingSource'>
): ResponseTimingSource {
  return event.responseTimingSource ?? 'legacy_unknown';
}

/** True only for a real, finite, non-negative measured interaction time. */
export function isMeasuredResponse(
  event: Pick<ReviewLogEvent, 'responseMs' | 'responseTimingSource'>
): boolean {
  return (
    resolveResponseTimingSource(event) === 'measured' &&
    typeof event.responseMs === 'number' &&
    Number.isFinite(event.responseMs) &&
    event.responseMs >= 0
  );
}

export interface LatencyDiagnosticsSummary {
  measuredSamples: number;
  excludedNotMeasured: number;
  excludedLegacyUnknown: number;
  p30: number | null;
  p85: number | null;
}

/**
 * Bounded latency-provenance diagnostics: measured sample count plus how many relevant
 * records were excluded and why. Only measured samples contribute to P30/P85.
 */
export function latencyDiagnosticsSummary(
  reviewLog: readonly ReviewLogEvent[]
): LatencyDiagnosticsSummary {
  const relevant = reviewLog.filter(
    event => event.kind !== 'cold' && event.firstCorrect && !event.hintUsed
  );
  const measured = relevant
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
    measuredSamples: measured.length,
    excludedNotMeasured,
    excludedLegacyUnknown,
    p30: quantile(measured, 0.3),
    p85: quantile(measured, 0.85)
  };
}
