import { describe, expect, it } from 'vitest';
import { normalizeBackupCard, normalizeBackupSettings, normalizeBackupReviewLog } from '../../src/storage/backup';
import { ensureCardStats, EMPTY_CARD_STATS } from '../../src/core/fsrs/cardState';
import { choosePractice } from '../../src/core/scheduler/queue';
import { curriculumCardReady } from '../../src/core/curriculum/curriculum';
import { classifyFsrsCard, isFsrsCardDue, isFsrsCardOverdue } from '../../src/core/fsrs/cardClassification';
import { buildDiagnosticSnapshot } from '../../src/core/diagnostics/buildDiagnosticSnapshot';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import type { Card, ReviewLogEvent } from '../../src/core/fsrs/types';

function baseCardRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState: 'review',
    stability: 4,
    difficulty: 5,
    dueAt: 1_000,
    lastReviewAt: 500,
    firstSeenAt: 100,
    reps: 2,
    lapses: 0,
    lastGrade: 3,
    ...overrides
  };
}

function knownCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState: 'review',
    stability: 4,
    difficulty: 5,
    dueAt: 1_000,
    lastReviewAt: 500,
    firstSeenAt: 100,
    reps: 2,
    lapses: 0,
    lastGrade: 3,
    stats: { ...EMPTY_CARD_STATS, trials: 2, firstCorrect: 2, scheduledSuccesses: 2, recentScheduledSuccesses: 2 },
    ...overrides
  };
}

describe('Legacy/malformed persisted data safety', () => {
  it('normalizes a card without stats instead of crashing consumers', () => {
    const normalized = normalizeBackupCard(baseCardRaw());
    expect(normalized).not.toBeNull();
    expect(normalized?.stats).toEqual(EMPTY_CARD_STATS);

    const cardWithoutStats = knownCard();
    delete (cardWithoutStats as { stats?: unknown }).stats;
    expect(() => ensureCardStats(cardWithoutStats)).not.toThrow();
    expect(cardWithoutStats.stats).toEqual(EMPTY_CARD_STATS);
    expect(curriculumCardReady(cardWithoutStats, [])).toBe(false);
    expect(() => choosePractice([cardWithoutStats], 2_000, [])).not.toThrow();
  });

  it('repairs NaN/Infinity counters inside an existing stats object', () => {
    const card = knownCard();
    (card.stats as unknown as Record<string, unknown>).trials = Number.NaN;
    (card.stats as unknown as Record<string, unknown>).scheduledSuccesses = Number.POSITIVE_INFINITY;
    const stats = ensureCardStats(card);
    expect(stats.trials).toBe(0);
    expect(stats.scheduledSuccesses).toBe(0);
    expect(curriculumCardReady(card, [])).toBe(false);
  });

  it('treats invalid dueAt as unscheduled instead of falsely overdue', () => {
    for (const dueAt of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const normalized = normalizeBackupCard(baseCardRaw({ dueAt }));
      expect(normalized?.dueAt).toBe(0);
      const card = normalized as Card;
      expect(isFsrsCardDue(card, 10_000)).toBe(false);
      expect(isFsrsCardOverdue(card, 10_000)).toBe(false);
    }
  });

  it('filters non-finite FSRS numeric fields to safe normalized values', () => {
    const normalized = normalizeBackupCard(baseCardRaw({
      stability: Number.POSITIVE_INFINITY,
      difficulty: Number.NaN,
      reps: Number.NaN,
      lapses: Number.POSITIVE_INFINITY,
      lastReviewAt: Number.NaN
    }));
    expect(normalized).not.toBeNull();
    expect(normalized?.stability).toBeNull();
    expect(normalized?.difficulty).toBeNull();
    expect(normalized?.reps).toBe(0);
    expect(normalized?.lapses).toBe(0);
    expect(normalized?.lastReviewAt).toBe(0);
  });

  it('normalizes malformed review timing and settings values', () => {
    const log = normalizeBackupReviewLog({
      ts: 1_000,
      sessionId: 'session',
      cardId: 'find:C',
      note: 'C',
      skill: 'find',
      kind: 'scheduled',
      grade: 3,
      firstCorrect: true,
      responseMs: Number.NaN
    });
    expect(log).not.toBeNull();
    expect(log?.responseMs).toBeNull();
    expect(log?.responseTimingSource).toBe('legacy_unknown');

    const settings = normalizeBackupSettings({
      desiredRetention: 'garbage',
      maxIntervalDays: Number.NaN,
      relearningSeconds: Number.POSITIVE_INFINITY,
      autoAdvanceDelaySeconds: 1_000_000,
      useLatencyGrading: 'yes'
    });
    expect(settings.desiredRetention).toBeUndefined();
    expect(settings.maxIntervalDays).toBeUndefined();
    expect(settings.relearningSeconds).toBeUndefined();
    expect(settings.autoAdvanceDelaySeconds).toBe(600);
    expect(settings.useLatencyGrading).toBeUndefined();
  });

  it('never emits NaN/Infinity or false warnings from malformed cards in diagnostics', () => {
    const malformed: Card = knownCard({
      dueAt: Number.NaN,
      stability: Number.POSITIVE_INFINITY,
      difficulty: Number.NaN,
      reps: Number.NaN,
      lastReviewAt: Number.NaN
    });
    const malformedLog = {
      ts: 1_500,
      sessionId: 'session-x',
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
      responseMs: Number.NaN,
      elapsedDays: Number.NaN,
      retrievabilityBefore: Number.NaN,
      stabilityBefore: Number.NaN,
      stabilityAfter: Number.NaN,
      difficultyBefore: Number.NaN,
      difficultyAfter: Number.NaN,
      scheduledDays: Number.NaN
    } as unknown as ReviewLogEvent;

    const snapshot = buildDiagnosticSnapshot({
      cards: [malformed],
      reviewLogs: [malformedLog],
      settings: DEFAULT_SETTINGS,
      now: 10_000
    });
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
    expect(snapshot.storageConsistency.checks.unknownSkillIds).toEqual([]);
    const card = snapshot.fsrs.cards[0];
    expect(Number.isFinite(card.due)).toBe(true);
    expect(Number.isFinite(card.stability)).toBe(true);
    expect(Number.isFinite(card.difficulty)).toBe(true);
    expect(card.isOverdue).toBe(false);
    expect(snapshot.reviewHistory.recentEvents[0].responseTimeMs).toBeNull();
  });

  it('keeps valid historical values untouched during normalization', () => {
    const normalized = normalizeBackupCard(baseCardRaw());
    expect(normalized?.stability).toBe(4);
    expect(normalized?.difficulty).toBe(5);
    expect(normalized?.dueAt).toBe(1_000);
    expect(normalized?.lastReviewAt).toBe(500);
    expect(normalized?.reps).toBe(2);
    const classification = classifyFsrsCard(normalized as Card, 2_000, true);
    expect(['reviewDue', 'reviewOverdue']).toContain(classification);
  });
});
