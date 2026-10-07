import { db } from './db';
import type { ColdTestRecord, RepertoireHistoryRecord, TwoHandHistoryRecord } from './db';
import { normalizeBackupCard, normalizeBackupReviewLog } from './backup';
import { migrateLegacyReviewLog } from './reviewMigrations';
import type { Card, ReviewLogEvent } from '../core/fsrs/types';
import { DEFAULT_SETTINGS } from '../core/fsrs/constants';

const STORAGE_KEY_V3 = 'piano-key-trainer-fsrs-v3';
const LOG_KEY_V3 = 'piano-key-trainer-fsrs-v3-review-log';
const COLD_LOG_KEY = 'piano-key-trainer-fsrs-v3-cold-tests';
const MIGRATION_FLAG_KEY = 'piano-trainer-dexie-migrated';

export interface LegacyMigrationPayload {
  settings: Record<string, unknown> | null;
  cards: Card[];
  logs: ReviewLogEvent[];
  coldTests: Record<string, unknown>[];
  repertoireHistory: Record<string, unknown>[];
  twoHandHistory: Record<string, unknown>[];
}

/**
 * Pure transform of the legacy localStorage snapshot. Invalid sections are skipped, never
 * partially imported; the caller performs a single atomic write of the returned payload.
 */
export function parseLegacyState(v3State: unknown): LegacyMigrationPayload | null {
  if (!v3State || typeof v3State !== 'object') return null;
  const state = v3State as Record<string, unknown>;

  const settings =
    state.settings && typeof state.settings === 'object'
      ? (state.settings as Record<string, unknown>)
      : null;

  let cards: Card[] = [];
  if (state.cards && typeof state.cards === 'object') {
    cards = Object.values(state.cards)
      .map(card => normalizeBackupCard(card))
      .filter((card): card is Card => card !== null);
  }

  let logs: ReviewLogEvent[] = [];
  const rawLogs = state.reviewLogs;
  if (Array.isArray(rawLogs)) {
    logs = rawLogs
      .map(log => normalizeBackupReviewLog(log))
      .filter((log): log is ReviewLogEvent => log !== null)
      .map(migrateLegacyReviewLog);
  }

  const asArray = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? (value.filter(v => v && typeof v === 'object') as Record<string, unknown>[]) : [];

  return {
    settings,
    cards,
    logs,
    coldTests: asArray(state.coldTests),
    repertoireHistory: asArray(state.repertoireHistory),
    twoHandHistory: asArray(state.twoHandHistory)
  };
}

export async function checkAndMigrateLocalStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const storage = window.localStorage;

  // Check if already migrated
  if (storage.getItem(MIGRATION_FLAG_KEY) === '1') {
    return false;
  }

  const rawState = storage.getItem(STORAGE_KEY_V3);
  if (!rawState) {
    storage.setItem(MIGRATION_FLAG_KEY, '1');
    return false;
  }

  let parsedState: unknown;
  try {
    parsedState = JSON.parse(rawState);
  } catch (error) {
    // Corrupt payload: nothing is imported and the flag stays unset, so a fixed
    // payload can still migrate later. No partial write can have happened.
    console.warn('Failed to parse legacy local state', error);
    return false;
  }

  const rawLogs = storage.getItem(LOG_KEY_V3);
  const combinedLogs: unknown[] = (() => {
    const embedded =
      parsedState && typeof parsedState === 'object' && Array.isArray((parsedState as { reviewLogs?: unknown }).reviewLogs)
        ? ((parsedState as { reviewLogs: unknown[] }).reviewLogs)
        : [];
    let sidecar: unknown[] = [];
    if (rawLogs) {
      try {
        const parsedLogs = JSON.parse(rawLogs);
        if (Array.isArray(parsedLogs)) sidecar = parsedLogs;
      } catch (error) {
        console.warn('Failed to parse legacy review logs', error);
      }
    }
    return [...embedded, ...sidecar];
  })();
  const stateWithLogs = parsedState && typeof parsedState === 'object'
    ? { ...(parsedState as object), reviewLogs: combinedLogs }
    : parsedState;
  const payload = parseLegacyState(stateWithLogs);
  if (!payload) return false;

  const rawCold = storage.getItem(COLD_LOG_KEY);
  if (rawCold && payload.coldTests.length === 0) {
    try {
      const parsedCold = JSON.parse(rawCold);
      if (Array.isArray(parsedCold)) payload.coldTests = parsedCold;
    } catch (error) {
      console.warn('Failed to parse legacy cold tests', error);
    }
  }

  try {
    // Transform completed above; all IndexedDB writes happen in ONE transaction so a
    // failure leaves the previous profile untouched and the flag unset (safe retry).
    await db.transaction(
      'rw',
      [db.settings, db.cards, db.reviewLogEvents, db.coldTests, db.repertoireHistory, db.twoHandHistory],
      async () => {
        if (payload.settings) {
          const existingSettings = await db.settings.get('userSettings');
          if (!existingSettings?.value) {
            await db.settings.put({ key: 'userSettings', value: { ...DEFAULT_SETTINGS, ...payload.settings } });
          }
        }

        if (payload.cards.length) {
          const existingIds = new Set((await db.cards.toArray()).map(card => card.id));
          const newCards = payload.cards.filter(card => !existingIds.has(card.id));
          if (newCards.length) await db.cards.bulkPut(newCards);
        }

        if (payload.logs.length) {
          const existingIds = new Set(
            (await db.reviewLogEvents.toArray()).map(event => event.reviewEventId)
          );
          const newLogs = payload.logs.filter(
            (event): event is ReviewLogEvent & { reviewEventId: string } =>
              typeof event.reviewEventId === 'string' && !existingIds.has(event.reviewEventId)
          );
          if (newLogs.length) await db.reviewLogEvents.bulkPut(newLogs as Array<ReviewLogEvent & { reviewEventId: string }>);
        }

        if (payload.coldTests.length) await db.coldTests.bulkPut(payload.coldTests as unknown as ColdTestRecord[]);
        if (payload.repertoireHistory.length) await db.repertoireHistory.bulkPut(payload.repertoireHistory as unknown as RepertoireHistoryRecord[]);
        if (payload.twoHandHistory.length) await db.twoHandHistory.bulkPut(payload.twoHandHistory as unknown as TwoHandHistoryRecord[]);
      }
    );

    // Verify the committed payload before declaring success.
    if (payload.logs.length) {
      const stored = await db.reviewLogEvents.bulkGet(payload.logs.map(event => event.reviewEventId as string));
      if (stored.some(entry => entry == null)) {
        console.warn('Legacy migration verification failed: some review logs are missing.');
        return false;
      }
    }

    storage.setItem(MIGRATION_FLAG_KEY, '1');
    console.info('Successfully migrated local data from localStorage to IndexedDB (Dexie).');
    return true;
  } catch (err) {
    console.error('Migration error from localStorage', err);
    return false;
  }
}
