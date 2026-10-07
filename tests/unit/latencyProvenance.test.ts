import { describe, expect, it } from 'vitest';
import {
  determineGrade,
  latencyStats
} from '../../src/core/fsrs/latencyGrading';
import {
  isMeasuredResponse,
  latencyDiagnosticsSummary,
  resolveResponseTimingSource
} from '../../src/core/fsrs/responseTiming';
import type { Card, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';

function makeLog(overrides: Partial<ReviewLogEvent> & { ts: number }): ReviewLogEvent {
  const { ts, ...rest } = overrides;
  return {
    reviewEventId: `evt-${ts}`,
    ts,
    sessionId: 'session-test',
    cardId: 'find:C',
    note: 'C',
    skill: 'find',
    kind: 'scheduled',
    grade: 3,
    gradeName: 'Good',
    firstCorrect: true,
    answer: 'C',
    answerKeyId: 'C4',
    attempts: 1,
    hintUsed: false,
    responseMs: 500,
    responseTimingSource: 'measured',
    elapsedDays: 1,
    retrievabilityBefore: 0.9,
    stabilityBefore: 1,
    stabilityAfter: 2,
    difficultyBefore: 5,
    difficultyAfter: 5,
    scheduledDays: 2,
    gradeableByFsrs: true,
    ...rest
  };
}

function makeCard(skill: Skill = 'find'): Card {
  return {
    id: `${skill}:C`,
    skill,
    note: 'C',
    memoryState: 'review',
    stability: 10,
    difficulty: 5,
    dueAt: 0,
    lastReviewAt: 0,
    firstSeenAt: 0,
    reps: 4,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 4,
      firstCorrect: 4,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 3,
      scheduledSuccesses: 3,
      practiceTrials: 0
    }
  };
}

describe('Latency provenance — only measured samples participate', () => {
  const measuredValues = [500, 600, 700, 800, 900, 1000, 1100, 1200];
  const measured = measuredValues.map((value, index) =>
    makeLog({ ts: 1_000 + index, responseMs: value, responseTimingSource: 'measured' })
  );

  it('classifies sources and treats records without provenance as legacy_unknown', () => {
    expect(resolveResponseTimingSource({ responseTimingSource: 'measured' })).toBe('measured');
    expect(resolveResponseTimingSource({ responseTimingSource: 'not_measured' })).toBe('not_measured');
    expect(resolveResponseTimingSource({})).toBe('legacy_unknown');
    expect(isMeasuredResponse({ responseMs: 800, responseTimingSource: 'measured' })).toBe(true);
    expect(isMeasuredResponse({ responseMs: 800 })).toBe(false);
    expect(isMeasuredResponse({ responseMs: 800, responseTimingSource: 'not_measured' })).toBe(false);
    expect(isMeasuredResponse({ responseMs: null, responseTimingSource: 'measured' })).toBe(false);
    expect(isMeasuredResponse({ responseMs: Number.NaN, responseTimingSource: 'measured' })).toBe(false);
    expect(isMeasuredResponse({ responseMs: -1, responseTimingSource: 'measured' })).toBe(false);
  });

  it('computes P30/P85 exclusively from measured values', () => {
    const mixed = [
      ...measured,
      makeLog({ ts: 2_000, responseMs: 1, responseTimingSource: 'not_measured' }),
      makeLog({ ts: 2_001, responseMs: 99_999, responseTimingSource: undefined }),
      makeLog({ ts: 2_002, responseMs: 0, responseTimingSource: 'legacy_unknown' })
    ];
    const stats = latencyStats('find', mixed);
    expect(stats.n).toBe(measured.length);
    expect(stats.excludedNotMeasured).toBe(1);
    expect(stats.excludedLegacyUnknown).toBe(2);
    expect(stats.p30).toBe(latencyStats('find', measured).p30);
    expect(stats.p85).toBe(latencyStats('find', measured).p85);
  });

  it('proves 1000 synthetic 800/1200 events cannot move the quantiles of real responses', () => {
    const baseline = latencyStats('find', measured);
    const synthetic: ReviewLogEvent[] = [];
    for (let index = 0; index < 1000; index++) {
      const isNotMeasured = index % 2 === 0;
      synthetic.push(makeLog({
        ts: 10_000 + index,
        responseMs: isNotMeasured ? 800 : 1200,
        responseTimingSource: isNotMeasured ? 'not_measured' : undefined,
        gradeableByFsrs: false
      }));
    }
    const polluted = latencyStats('find', [...measured, ...synthetic]);
    expect(polluted.n).toBe(baseline.n);
    expect(polluted.p30).toBe(baseline.p30);
    expect(polluted.p85).toBe(baseline.p85);
    expect(polluted.median).toBe(baseline.median);
    expect(polluted.excludedNotMeasured).toBe(500);
    expect(polluted.excludedLegacyUnknown).toBe(500);
  });

  it('ignores not-measured events that also fail the relevance filter', () => {
    const wrong = makeLog({ ts: 3_000, firstCorrect: false, responseMs: 400, responseTimingSource: 'measured' });
    const hinted = makeLog({ ts: 3_001, hintUsed: true, responseMs: 400, responseTimingSource: 'measured' });
    const cold = makeLog({ ts: 3_002, kind: 'cold', responseMs: 400, responseTimingSource: 'measured' });
    const stats = latencyStats('find', [...measured, wrong, hinted, cold]);
    expect(stats.n).toBe(measured.length);
    expect(stats.excludedNotMeasured).toBe(0);
    expect(stats.excludedLegacyUnknown).toBe(0);
  });

  it('never applies latency grading to an untimed correct answer', () => {
    const [outcome] = explain({
      responseMs: null,
      reviewLog: measured
    });
    expect(outcome).toBe(3);
  });

  it('still applies Hard/Easy bands when enough measured samples exist', () => {
    const grades = explain({
      responseMs: 1300,
      reviewLog: measured
    });
    expect(grades[0]).toBe(2);
    const easy = explain({
      responseMs: 100,
      reviewLog: measured
    });
    expect(easy[0]).toBe(4);
  });

  it('summarizes measured/excluded counts for diagnostics', () => {
    const summary = latencyDiagnosticsSummary([
      ...measured,
      makeLog({ ts: 4_000, responseMs: 800, responseTimingSource: 'not_measured' }),
      makeLog({ ts: 4_001, responseMs: 1200, responseTimingSource: undefined })
    ]);
    expect(summary.measuredSamples).toBe(measured.length);
    expect(summary.excludedNotMeasured).toBe(1);
    expect(summary.excludedLegacyUnknown).toBe(1);
    expect(summary.p30).toBe(latencyStats('find', measured).p30);
    expect(summary.p85).toBe(latencyStats('find', measured).p85);
  });

  function explain(params: { responseMs: number | null; reviewLog: ReviewLogEvent[] }): [number] {
    return [determineGrade({
      firstCorrect: true,
      hintUsed: false,
      responseMs: params.responseMs,
      card: makeCard(),
      reviewLog: params.reviewLog,
      useLatencyGrading: true
    })];
  }
});
