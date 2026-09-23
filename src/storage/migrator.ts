import { db } from './db';
import type { Card, ReviewLogEvent, UserSettings } from '../core/fsrs/types';
import { DEFAULT_SETTINGS } from '../core/fsrs/constants';

const STORAGE_KEY_V3 = 'piano-key-trainer-fsrs-v3';
const LOG_KEY_V3 = 'piano-key-trainer-fsrs-v3-review-log';
const COLD_LOG_KEY = 'piano-key-trainer-fsrs-v3-cold-tests';
const MIGRATION_FLAG_KEY = 'piano-trainer-dexie-migrated';

export async function checkAndMigrateLocalStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  // Check if already migrated
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') {
    return false;
  }

  const rawState = localStorage.getItem(STORAGE_KEY_V3);
  if (!rawState) {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return false;
  }

  try {
    const v3State = JSON.parse(rawState);
    if (!v3State || typeof v3State !== 'object') return false;

    // 1. Migrate settings
    if (v3State.settings) {
      await db.settings.put({
        key: 'userSettings',
        value: { ...DEFAULT_SETTINGS, ...v3State.settings }
      });
    }

    // 2. Migrate cards
    if (v3State.cards && typeof v3State.cards === 'object') {
      const cardsList = Object.values(v3State.cards) as Card[];
      if (cardsList.length) {
        await db.cards.bulkPut(cardsList);
      }
    }

    // 3. Migrate review logs
    const rawLogs = localStorage.getItem(LOG_KEY_V3);
    if (rawLogs) {
      try {
        const logs = JSON.parse(rawLogs) as ReviewLogEvent[];
        if (Array.isArray(logs) && logs.length) {
          await db.reviewLogs.bulkPut(logs);
        }
      } catch (e) {
        console.warn('Failed to parse legacy review logs', e);
      }
    }

    // 4. Migrate cold test history
    const rawCold = localStorage.getItem(COLD_LOG_KEY);
    if (rawCold) {
      try {
        const coldTests = JSON.parse(rawCold);
        if (Array.isArray(coldTests) && coldTests.length) {
          await db.coldTests.bulkPut(coldTests);
        }
      } catch (e) {
        console.warn('Failed to parse legacy cold tests', e);
      }
    }

    // 5. Migrate repertoire history
    if (Array.isArray(v3State.repertoireHistory) && v3State.repertoireHistory.length) {
      await db.repertoireHistory.bulkPut(v3State.repertoireHistory);
    }

    // 6. Migrate two-hand history
    if (Array.isArray(v3State.twoHandHistory) && v3State.twoHandHistory.length) {
      await db.twoHandHistory.bulkPut(v3State.twoHandHistory);
    }

    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    console.info('Successfully migrated local data from localStorage to IndexedDB (Dexie).');
    return true;
  } catch (err) {
    console.error('Migration error from localStorage', err);
    return false;
  }
}
