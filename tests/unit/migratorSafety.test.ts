import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/storage/db';
import { checkAndMigrateLocalStorage } from '../../src/storage/migrator';

const STORAGE_KEY_V3 = 'piano-key-trainer-fsrs-v3';
const LOG_KEY_V3 = 'piano-key-trainer-fsrs-v3-review-log';
const COLD_LOG_KEY = 'piano-key-trainer-fsrs-v3-cold-tests';
const MIGRATION_FLAG_KEY = 'piano-trainer-dexie-migrated';

const storage = new Map<string, string>();

function mockStorage(): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void } { return (globalThis as unknown as { window: { localStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void } } }).window.localStorage; }

function installLocalStorageMock(): void {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear()
    }
  };
}

function legacyLog(ts: number) {
  return {
    ts,
    sessionId: `session-${ts}`,
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
    responseMs: 800,
    scheduledDays: 2
  };
}

function legacyState(coldTests: unknown[] = []) {
  return {
    settings: { desiredRetention: 0.85 },
    cards: {
      'find:C': {
        id: 'find:C',
        skill: 'find',
        note: 'C',
        memoryState: 'review',
        stability: 2,
        difficulty: 5,
        dueAt: 100,
        lastReviewAt: 50,
        firstSeenAt: 10,
        reps: 2
      }
    },
    reviewLogs: [legacyLog(1_000), legacyLog(2_000)],
    coldTests,
    repertoireHistory: [],
    twoHandHistory: []
  };
}

async function clearStores(): Promise<void> {
  await db.transaction(
    'rw',
    [db.cards, db.reviewLogEvents, db.settings, db.coldTests, db.lessonProgress, db.learningProgress, db.repertoireHistory, db.twoHandHistory],
    async () => {
      await db.cards.clear();
      await db.reviewLogEvents.clear();
      await db.settings.clear();
      await db.coldTests.clear();
      await db.lessonProgress.clear();
      await db.learningProgress.clear();
      await db.repertoireHistory.clear();
      await db.twoHandHistory.clear();
    }
  );
}

beforeEach(async () => {
  storage.clear();
  installLocalStorageMock();
  await clearStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('legacy localStorage migrator safety', () => {
  it('imports legacy data atomically, verifies it, and marks the migration complete only afterwards', async () => {
    mockStorage().setItem(STORAGE_KEY_V3, JSON.stringify(legacyState()));
    mockStorage().setItem(LOG_KEY_V3, JSON.stringify([legacyLog(3_000)]));

    const migrated = await checkAndMigrateLocalStorage();
    expect(migrated).toBe(true);
    expect(mockStorage().getItem(MIGRATION_FLAG_KEY)).toBe('1');

    const settings = await db.settings.get('userSettings');
    expect((settings?.value as { desiredRetention: number }).desiredRetention).toBe(0.85);
    expect(await db.cards.count()).toBe(1);
    const logs = await db.reviewLogEvents.orderBy('ts').toArray();
    expect(logs.map(entry => entry.ts)).toEqual([1_000, 2_000, 3_000]);
    expect(logs.every(entry => entry.reviewEventId?.startsWith('legacy-'))).toBe(true);
    expect(logs.every(entry => entry.responseTimingSource === 'legacy_unknown')).toBe(true);
    expect(logs.map(entry => entry.responseMs)).toEqual([800, 800, 800]);

    // Second startup after success: no re-run, no duplicate import.
    const secondRun = await checkAndMigrateLocalStorage();
    expect(secondRun).toBe(false);
    expect(await db.reviewLogEvents.count()).toBe(3);
  });

  it('does not claim success for a corrupt payload and writes nothing', async () => {
    mockStorage().setItem(STORAGE_KEY_V3, '{not valid json');

    const migrated = await checkAndMigrateLocalStorage();
    expect(migrated).toBe(false);
    expect(mockStorage().getItem(MIGRATION_FLAG_KEY)).toBeNull();
    expect(await db.settings.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogEvents.count()).toBe(0);
  });

  it('a transaction failure rolls back partial writes and can be retried successfully', async () => {
    mockStorage().setItem(STORAGE_KEY_V3, JSON.stringify(legacyState()));

    const transactionSpy = vi.spyOn(db, 'transaction').mockImplementationOnce((async () => {
      throw new Error('injected transaction failure');
    }) as never);

    const failed = await checkAndMigrateLocalStorage();
    expect(failed).toBe(false);
    expect(mockStorage().getItem(MIGRATION_FLAG_KEY)).toBeNull();
    expect(await db.settings.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogEvents.count()).toBe(0);
    transactionSpy.mockRestore();

    const retried = await checkAndMigrateLocalStorage();
    expect(retried).toBe(true);
    expect(mockStorage().getItem(MIGRATION_FLAG_KEY)).toBe('1');
    expect(await db.cards.count()).toBe(1);
    expect(await db.reviewLogEvents.count()).toBe(2);
  });

  it('a mid-transaction error aborts earlier writes and never leaves a false complete flag', async () => {
    // Missing primary key makes the later coldTests write fail after settings/cards/logs
    // were already written in the same transaction.
    const brokenColdTests = [{ n: 20, ts: 500 }];
    mockStorage().setItem(STORAGE_KEY_V3, JSON.stringify(legacyState(brokenColdTests)));

    const failed = await checkAndMigrateLocalStorage();
    expect(failed).toBe(false);
    expect(mockStorage().getItem(MIGRATION_FLAG_KEY)).toBeNull();
    // Settings/cards/logs were written earlier in the transaction but must be rolled back.
    expect(await db.settings.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogEvents.count()).toBe(0);
    expect(await db.coldTests.count()).toBe(0);

    mockStorage().removeItem(COLD_LOG_KEY);
    mockStorage().setItem(STORAGE_KEY_V3, JSON.stringify(legacyState()));
    const retried = await checkAndMigrateLocalStorage();
    expect(retried).toBe(true);
    expect(await db.settings.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
    expect(await db.reviewLogEvents.count()).toBe(2);
  });
});

