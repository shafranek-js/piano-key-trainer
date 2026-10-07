import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  applyBackupAtomically,
  isValidReviewEventId,
  resolveBackupReviewEventId,
  validateAndNormalizeBackup
} from '../../src/storage/backup';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import { PianoTrainerDatabase } from '../../src/storage/db';
import type { ReviewLogEvent } from '../../src/core/fsrs/types';

const createdDatabases: string[] = [];

function createDatabase(): PianoTrainerDatabase {
  const name = `BackupIdentity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdDatabases.push(name);
  return new PianoTrainerDatabase(name);
}

afterEach(async () => {
  for (const name of createdDatabases.splice(0)) {
    try {
      await new PianoTrainerDatabase(name).delete();
    } catch {
      /* database already closed */
    }
  }
});

function makeExportLog(
  ts: number,
  reviewEventId: string | undefined,
  overrides: Partial<ReviewLogEvent> = {}
): ReviewLogEvent {
  return {
    reviewEventId,
    responseTimingSource: 'measured',
    ts,
    sessionId: 'session-export',
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

function exportShapedBackup(logs: ReviewLogEvent[]) {
  return {
    app: 'piano-key-trainer',
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    version: '6.2.0',
    exportedAt: '2026-10-07T00:00:00.000Z',
    reviewLogs: logs
  };
}

describe('Backup review identity — validation policy', () => {
  it('preserves a valid existing reviewEventId and only backfills missing/malformed ids', () => {
    expect(isValidReviewEventId('a1b2c3-uuid-4')).toBe(true);
    expect(isValidReviewEventId('legacy-1800000000000')).toBe(true);
    expect(isValidReviewEventId('')).toBe(false);
    expect(isValidReviewEventId('   ')).toBe(false);
    expect(isValidReviewEventId('bad id with spaces')).toBe(false);
    expect(isValidReviewEventId('evil<>script')).toBe(false);
    expect(isValidReviewEventId('x'.repeat(129))).toBe(false);

    expect(resolveBackupReviewEventId('uuid-A', 1_000)).toBe('uuid-A');
    expect(resolveBackupReviewEventId(undefined, 1_000)).toBe('legacy-1000');
    expect(resolveBackupReviewEventId('bad id!', 1_000)).toBe('legacy-1000');
    expect(resolveBackupReviewEventId('x'.repeat(300), 1_000)).toBe('legacy-1000');
  });

  it('marks malformed ids with a bounded warning instead of silently dropping data', () => {
    const result = validateAndNormalizeBackup(exportShapedBackup([
      makeExportLog(1_000, 'ok-id'),
      makeExportLog(2_000, 'bad id!', { cardId: 'find:D' })
    ]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.reviewLogs.map(log => log.reviewEventId)).toEqual(['ok-id', 'legacy-2000']);
      expect(result.backup.warnings.some(warning => warning.includes('reviewEventId'))).toBe(true);
    }
  });

  it('never silently overwrites a duplicate explicit id: different content is disambiguated', () => {
    const result = validateAndNormalizeBackup(exportShapedBackup([
      makeExportLog(1_000, 'dup-id', { cardId: 'find:C' }),
      makeExportLog(1_000, 'dup-id', { cardId: 'find:D' })
    ]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.reviewLogs).toHaveLength(2);
      const ids = result.backup.reviewLogs.map(log => log.reviewEventId);
      expect(ids[0]).toBe('dup-id');
      expect(ids[1]).toBe('dup-id-dup2');
      expect(new Set(ids).size).toBe(2);
      expect(result.backup.warnings.some(warning => warning.includes('повторяющиеся'))).toBe(true);
    }
  });

  it('deduplicates exact duplicate records with a warning', () => {
    const duplicate = makeExportLog(1_000, 'same-id');
    const result = validateAndNormalizeBackup(exportShapedBackup([duplicate, { ...duplicate }]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.reviewLogs).toHaveLength(1);
      expect(result.backup.warnings.some(warning => warning.includes('дубликатов'))).toBe(true);
    }
  });
});

describe('Backup round-trip — same-millisecond events keep distinct identities', () => {
  it('export → validate → atomic import → reload keeps both events with original ids', async () => {
    const sameTimestamp = 1_800_000_000_000;
    const exported = exportShapedBackup([
      makeExportLog(sameTimestamp, 'uuid-A', { cardId: 'find:C' }),
      makeExportLog(sameTimestamp, 'uuid-B', { cardId: 'find:D' })
    ]);

    const validation = validateAndNormalizeBackup(exported);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.backup.warnings).toEqual([]);
    expect(validation.backup.reviewLogs.map(log => log.reviewEventId)).toEqual(['uuid-A', 'uuid-B']);

    const database = createDatabase();
    await database.open();
    await applyBackupAtomically(database, validation.backup, DEFAULT_SETTINGS);

    const afterImport = await database.reviewLogEvents.orderBy('ts').toArray();
    expect(afterImport).toHaveLength(2);
    expect(afterImport.map(event => event.ts)).toEqual([sameTimestamp, sameTimestamp]);
    expect(afterImport.map(event => event.reviewEventId).sort()).toEqual(['uuid-A', 'uuid-B']);
    expect(afterImport.map(event => event.cardId).sort()).toEqual(['find:C', 'find:D']);

    // Reload: identities stay stable, nothing collapses or duplicates.
    database.close();
    await database.open();
    const afterReload = await database.reviewLogEvents.orderBy('ts').toArray();
    expect(afterReload).toHaveLength(2);
    expect(afterReload.map(event => event.reviewEventId).sort()).toEqual(['uuid-A', 'uuid-B']);
  });

  it('legacy records without identity still get the deterministic fallback through the full import', async () => {
    const exported = exportShapedBackup([
      makeExportLog(1_000, undefined, { cardId: 'find:C' }),
      makeExportLog(1_000, undefined, { cardId: 'find:D' })
    ]);

    const validation = validateAndNormalizeBackup(exported);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.backup.reviewLogs.map(log => log.reviewEventId)).toEqual(['legacy-1000', 'legacy-1000-dup2']);

    const database = createDatabase();
    await database.open();
    await applyBackupAtomically(database, validation.backup, DEFAULT_SETTINGS);
    const stored = await database.reviewLogEvents.orderBy('ts').toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map(event => event.reviewEventId).sort()).toEqual(['legacy-1000', 'legacy-1000-dup2']);
  });
});
