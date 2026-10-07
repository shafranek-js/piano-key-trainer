import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DB_V2_STORES, PianoTrainerDatabase } from '../../src/storage/db';
import { persistReviewEventAtomically } from '../../src/storage/reviewStore';
import { commitCardReview } from '../../src/core/fsrs/reviewPersistence';
import { backfillReviewEventId, createReviewEventId, resolveReviewEventId } from '../../src/core/fsrs/reviewEventId';
import type { Card, ReviewLogEvent } from '../../src/core/fsrs/types';

const databases: PianoTrainerDatabase[] = [];

function makeLog(ts: number, overrides: Partial<ReviewLogEvent> = {}): ReviewLogEvent {
  return {
    reviewEventId: `evt-${ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts,
    sessionId: 'session-1',
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
    ...overrides
  };
}

function makeCard(reps: number): Card {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState: 'review',
    stability: 2,
    difficulty: 5,
    dueAt: 100,
    lastReviewAt: 50,
    firstSeenAt: 10,
    reps,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: reps,
      firstCorrect: reps,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: reps,
      scheduledSuccesses: reps,
      practiceTrials: 0
    }
  };
}

function freshDatabase(): PianoTrainerDatabase {
  const database = new PianoTrainerDatabase(`ReviewIdentityTest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async database => {
    database.close();
    await Dexie.delete(database.name);
  }));
});

describe('Review event identity', () => {
  it('generates unique ids even for identical timestamp/session/card seeds', () => {
    const seed = { ts: 1_000, sessionId: 's', cardId: 'c' };
    const ids = new Set(Array.from({ length: 200 }, () => createReviewEventId(seed)));
    expect(ids.size).toBe(200);
  });

  it('backfills deterministic legacy ids and resolves missing identity', () => {
    expect(backfillReviewEventId(1234)).toBe('legacy-1234');
    expect(resolveReviewEventId({ reviewEventId: 'custom-id', ts: 1 })).toBe('custom-id');
    expect(resolveReviewEventId({ reviewEventId: undefined, ts: 1 })).toBe('legacy-1');
    expect(resolveReviewEventId({ reviewEventId: '', ts: 0 })).toBeNull();
  });

  it('persists two legitimate reviews that share one millisecond', async () => {
    const database = freshDatabase();
    await database.open();
    const first = makeLog(5_000, { reviewEventId: 'same-ms-a', cardId: 'find:C' });
    const second = makeLog(5_000, { reviewEventId: 'same-ms-b', cardId: 'find:D' });

    expect(await persistReviewEventAtomically(database, { card: makeCard(1), event: first })).toBe('persisted');
    expect(await persistReviewEventAtomically(database, { card: { ...makeCard(2), id: 'find:D' }, event: second })).toBe('persisted');

    const stored = await database.reviewLogEvents.orderBy('ts').toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map(entry => entry.reviewEventId).sort()).toEqual(['same-ms-a', 'same-ms-b']);
    expect((await database.cards.get('find:C'))?.reps).toBe(1);
    expect((await database.cards.get('find:D'))?.reps).toBe(2);
  });

  it('retrying the same event is idempotent: one card transition, one log', async () => {
    const database = freshDatabase();
    await database.open();
    const event = makeLog(6_000, { reviewEventId: 'retry-id' });

    await persistReviewEventAtomically(database, { card: makeCard(1), event });
    await persistReviewEventAtomically(database, { card: makeCard(5), event });
    await persistReviewEventAtomically(database, { card: makeCard(9), event });

    expect(await database.reviewLogEvents.count()).toBe(1);
    expect((await database.cards.get('find:C'))?.reps).toBe(1);
  });

  it('a failing transaction commits neither the card nor the log; retry then commits exactly one of each', async () => {
    const database = freshDatabase();
    await database.open();
    const event = makeLog(7_000, { reviewEventId: 'atomic-id' });
    const brokenCard = { ...makeCard(1), bad: () => undefined } as unknown as Card;

    await expect(persistReviewEventAtomically(database, { card: brokenCard, event })).rejects.toThrow();
    expect(await database.reviewLogEvents.count()).toBe(0);
    expect(await database.cards.count()).toBe(0);

    expect(await persistReviewEventAtomically(database, { card: makeCard(1), event })).toBe('persisted');
    expect(await database.reviewLogEvents.count()).toBe(1);
    expect((await database.cards.get('find:C'))?.reps).toBe(1);
  });

  it('commitCardReview dedupes by event identity and allows same-ms distinct events', async () => {
    const persisted: ReviewLogEvent[] = [];
    const persist = async ({ event }: { event: ReviewLogEvent }) => {
      persisted.push(event);
    };
    const first = makeLog(8_000, { reviewEventId: 'identity-a' });
    const second = makeLog(8_000, { reviewEventId: 'identity-b' });

    let logs = await commitCardReview({ card: makeCard(1), logEvent: first, cardMutated: true, reviewLogs: [], persist });
    logs = await commitCardReview({ card: makeCard(2), logEvent: first, cardMutated: true, reviewLogs: logs, persist });
    logs = await commitCardReview({ card: makeCard(3), logEvent: second, cardMutated: true, reviewLogs: logs, persist });

    expect(logs).toHaveLength(2);
    expect(persisted).toHaveLength(2);
    expect(persisted.map(entry => entry.reviewEventId)).toEqual(['identity-a', 'identity-b']);
  });
});

describe('Dexie v2 → v4 review log migration', () => {
  it('preserves every legacy log, its timestamp and content, and is idempotent on reload', async () => {
    const databaseName = `LegacyMigrationTest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const legacy = new Dexie(databaseName);
    legacy.version(2).stores({ ...DB_V2_STORES });
    await legacy.open();
    const originalLogs: ReviewLogEvent[] = [
      makeLog(1_000, { sessionId: 'old-a', cardId: 'find:C', responseMs: 800, reviewEventId: undefined, responseTimingSource: undefined }),
      makeLog(2_000, { sessionId: 'old-a', cardId: 'find:D', responseMs: 1200, reviewEventId: undefined, responseTimingSource: undefined }),
      makeLog(3_000, { sessionId: 'old-b', cardId: 'find:E', grade: 1, gradeName: 'Again', firstCorrect: false, responseMs: 650, reviewEventId: undefined, responseTimingSource: undefined }),
      makeLog(4_000, { sessionId: 'old-b', cardId: 'find:F', kind: 'cold', grade: null, gradeName: null, responseMs: 500, reviewEventId: undefined, responseTimingSource: undefined }),
      makeLog(5_000, { sessionId: 'old-c', cardId: 'find:G', responseMs: 900, reviewEventId: undefined, responseTimingSource: undefined })
    ];
    await legacy.table('reviewLogs').bulkAdd(originalLogs);
    legacy.close();

    const migrated = new PianoTrainerDatabase(databaseName);
    databases.push(migrated);
    await migrated.open();

    const afterFirstOpen = await migrated.reviewLogEvents.orderBy('ts').toArray();
    expect(afterFirstOpen).toHaveLength(originalLogs.length);
    expect(afterFirstOpen.map(entry => entry.reviewEventId)).toEqual(originalLogs.map(entry => backfillReviewEventId(entry.ts)));
    for (let index = 0; index < originalLogs.length; index++) {
      const original = originalLogs[index];
      const stored = afterFirstOpen[index];
      expect(stored.ts).toBe(original.ts);
      expect(stored.sessionId).toBe(original.sessionId);
      expect(stored.cardId).toBe(original.cardId);
      expect(stored.grade).toBe(original.grade);
      expect(stored.responseMs).toBe(original.responseMs);
      // Content preserved; only identity/provenance metadata is added.
      expect(stored.responseTimingSource).toBe('legacy_unknown');
    }
    expect(migrated.tables.map(table => table.name)).not.toContain('reviewLogs');

    // Reload: the upgrade must not run destructively again.
    migrated.close();
    await migrated.open();
    const afterSecondOpen = await migrated.reviewLogEvents.orderBy('ts').toArray();
    expect(afterSecondOpen).toHaveLength(originalLogs.length);
    expect(afterSecondOpen.map(entry => entry.reviewEventId)).toEqual(afterFirstOpen.map(entry => entry.reviewEventId));
  });
});
