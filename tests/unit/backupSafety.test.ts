import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  applyBackupAtomically,
  normalizeBackupCard,
  normalizeBackupSettings,
  validateAndNormalizeBackup,
  type NormalizedBackup
} from '../../src/storage/backup';
import { normalizeBackupLearningProgress } from '../../src/core/learning/progress';
import { getPatternIdentifyPrompt } from '../../src/core/input/inputPolicy';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import { PianoTrainerDatabase } from '../../src/storage/db';
import type { Card, UserSettings } from '../../src/core/fsrs/types';

const VALID_CARD = {
  id: 'find:C',
  skill: 'find',
  note: 'C',
  memoryState: 'review',
  stability: 5.5,
  difficulty: 4.2,
  dueAt: 1_700_000_000_000,
  lastReviewAt: 1_699_000_000_000,
  firstSeenAt: 1_698_000_000_000,
  reps: 3,
  lapses: 0,
  lastGrade: 3,
  stats: {
    trials: 3,
    firstCorrect: 2,
    firstWrong: 1,
    hints: 0,
    recentScheduledSuccesses: 2,
    scheduledSuccesses: 2,
    practiceTrials: 0
  }
};

const createdDatabases: string[] = [];
function createDatabase(name: string): PianoTrainerDatabase {
  const database = new PianoTrainerDatabase(name);
  createdDatabases.push(name);
  return database;
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

describe('Backup validation — untrusted input', () => {
  it('rejects non-object, wrong app and unsupported versions before any write', () => {
    expect(validateAndNormalizeBackup(null).ok).toBe(false);
    expect(validateAndNormalizeBackup('not json at all').ok).toBe(false);
    expect(validateAndNormalizeBackup([]).ok).toBe(false);
    expect(validateAndNormalizeBackup({ app: 'other-app' }).ok).toBe(false);

    const future = validateAndNormalizeBackup({
      app: 'piano-key-trainer',
      backupSchemaVersion: BACKUP_SCHEMA_VERSION + 1,
      cards: []
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toContain('версия');
  });

  it('accepts legacy backups without a schema version and stamps them as version 0', () => {
    const result = validateAndNormalizeBackup({ cards: [VALID_CARD] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.schemaVersion).toBe(0);
      expect(result.backup.cards).toHaveLength(1);
    }
  });

  it('drops cards with hostile or unknown note values and reports warnings', () => {
    const hostile = {
      ...VALID_CARD,
      id: 'patternIdentify:<img src=x onerror=alert(1)>',
      note: '<img src=x onerror=alert(1)>'
    };
    const result = validateAndNormalizeBackup({
      app: 'piano-key-trainer',
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      cards: [VALID_CARD, hostile, { note: 'C', skill: 'find' }]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.cards).toHaveLength(1);
    expect(result.backup.cards[0].id).toBe('find:C');
    expect(result.backup.warnings.join(' ')).toContain('Пропущено');
    const serialized = JSON.stringify(result.backup);
    expect(serialized).not.toContain('onerror');
  });

  it('normalizes numeric card data deterministically', () => {
    const card = normalizeBackupCard({
      ...VALID_CARD,
      stability: Number.NaN,
      difficulty: 99,
      dueAt: -100,
      reps: 2.9,
      lapses: -1,
      lastGrade: 9,
      stats: { trials: 'many', firstCorrect: 1.8 }
    });
    expect(card).not.toBeNull();
    expect(card!.stability).toBeNull();
    expect(card!.difficulty).toBe(10);
    expect(card!.dueAt).toBe(0);
    expect(card!.reps).toBe(2);
    expect(card!.lapses).toBe(0);
    expect(card!.lastGrade).toBeNull();
    expect(card!.stats.trials).toBe(0);
    expect(card!.stats.firstCorrect).toBe(1);

    // Cards without `stats` never crash curriculum consumers.
    const withoutStats = normalizeBackupCard({ ...VALID_CARD, stats: undefined });
    expect(withoutStats?.stats).toEqual({
      trials: 0,
      firstCorrect: 0,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: 0,
      practiceTrials: 0
    });
  });

  it('sanitizes settings ranges and enum values', () => {
    const settings = normalizeBackupSettings({
      desiredRetention: 5,
      maxIntervalDays: -10,
      relearningSeconds: 'fast',
      sessionPreset: 'hacked',
      level: 'all',
      notationClef: 'grand',
      useLatencyGrading: true,
      autoAdvanceDelaySeconds: 10_000,
      mode: 'x'.repeat(500)
    });
    expect(settings.desiredRetention).toBe(0.99);
    expect(settings.maxIntervalDays).toBe(1);
    expect(settings.relearningSeconds).toBeUndefined();
    expect(settings.sessionPreset).toBeUndefined();
    expect(settings.level).toBe('all');
    expect(settings.notationClef).toBe('grand');
    expect(settings.useLatencyGrading).toBe(true);
    expect(settings.autoAdvanceDelaySeconds).toBe(600);
    expect(settings.mode).toBeUndefined();
  });

  it('keeps the patternIdentify fallback free of user-supplied markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const prompt = getPatternIdentifyPrompt(payload as never);
    expect(prompt).not.toContain(payload);
    expect(prompt).not.toContain('<img');
  });
});

describe('Backup round-trip — learning snapshots', () => {
  it('preserves Harmony and Chord Rhythm snapshots across export/import normalization', () => {
    const raw = {
      learningProgress: [
        {
          id: 'advanced-harmony:session',
          itemId: 'advanced-harmony:session',
          state: 'introduced',
          modelCompleted: true,
          guidedSuccesses: 0,
          independentUnhintedSuccesses: 0,
          contexts: ['module:active'],
          harmonySnapshot: {
            step: 'transferAssessment',
            sequenceIndex: 2,
            quizIndex: 1,
            assessmentIndex: 3,
            assessmentChordIndex: 2,
            awaitingCorrective: true,
            trialHadWrong: true
          },
          currentHintLevel: 2,
          updatedAt: 1234
        },
        {
          id: 'advanced-chord-rhythm:session',
          itemId: 'advanced-chord-rhythm:session',
          state: 'introduced',
          modelCompleted: true,
          guidedSuccesses: 0,
          independentUnhintedSuccesses: 0,
          contexts: ['m3k:started'],
          chordRhythmSnapshot: {
            stage: 'transferAssessment',
            sequenceIndex: 0,
            assessment: {
              blockKind: 'initial',
              phase: 'active',
              trialIndex: 5,
              trialsCompleted: 5,
              correctFirstAttempts: 4,
              failedTrialIndexes: [3],
              remediationTrialIndexes: [],
              remediationIndex: 0,
              remediationUsed: 0,
              pendingCorrective: true,
              scoredQuestionIds: ['q-3']
            }
          },
          currentHintLevel: 0,
          updatedAt: 5678
        }
      ]
    };

    const first = normalizeBackupLearningProgress(raw);
    const second = normalizeBackupLearningProgress(JSON.parse(JSON.stringify({ learningProgress: first })));
    expect(second).not.toBeNull();
    expect(second).toEqual(first);
    expect(first![0].harmonySnapshot?.awaitingCorrective).toBe(true);
    expect(first![0].harmonySnapshot?.step).toBe('transferAssessment');
    expect(first![1].chordRhythmSnapshot?.assessment?.pendingCorrective).toBe(true);
    expect(first![1].chordRhythmSnapshot?.assessment?.scoredQuestionIds).toEqual(['q-3']);
  });

  it('falls back safely when a snapshot is corrupt', () => {
    const result = normalizeBackupLearningProgress({
      learningProgress: [
        {
          id: 'advanced-chord-rhythm:session',
          itemId: 'advanced-chord-rhythm:session',
          contexts: [],
          chordRhythmSnapshot: { stage: 'not-a-step' },
          harmonySnapshot: 42
        }
      ]
    });
    expect(result![0].chordRhythmSnapshot).toBeUndefined();
    expect(result![0].harmonySnapshot).toBeUndefined();
  });
});

describe('Backup import — atomic transaction', () => {
  it('replaces all profile stores on success', async () => {
    const database = createDatabase('PianoTrainerBackupSuccessTest');
    const seeded: Card = {
      id: 'find:D',
      skill: 'find',
      note: 'D',
      memoryState: 'new',
      stability: null,
      difficulty: null,
      dueAt: 0,
      lastReviewAt: 0,
      firstSeenAt: 1,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      stats: {
        trials: 0,
        firstCorrect: 0,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 0,
        scheduledSuccesses: 0,
        practiceTrials: 0
      }
    };
    await database.cards.put(seeded);

    const result = validateAndNormalizeBackup({
      app: 'piano-key-trainer',
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      settings: { sessionPreset: 'quick' },
      cards: [VALID_CARD]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await applyBackupAtomically(database, result.backup, { ...DEFAULT_SETTINGS, ...result.backup.settings } as UserSettings);
    const cards = await database.cards.toArray();
    expect(cards.map(card => card.id)).toEqual(['find:C']);
    const settingsRow = await database.settings.get('userSettings');
    expect((settingsRow?.value as UserSettings | undefined)?.sessionPreset).toBe('quick');
  });

  it('keeps the previous profile intact when the import fails midway', async () => {
    const database = createDatabase('PianoTrainerBackupAtomicityTest');
    const seeded: Card = {
      id: 'find:E',
      skill: 'find',
      note: 'E',
      memoryState: 'new',
      stability: null,
      difficulty: null,
      dueAt: 0,
      lastReviewAt: 0,
      firstSeenAt: 1,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      stats: {
        trials: 0,
        firstCorrect: 0,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 0,
        scheduledSuccesses: 0,
        practiceTrials: 0
      }
    };
    await database.cards.put(seeded);

    const result = validateAndNormalizeBackup({
      app: 'piano-key-trainer',
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      cards: [VALID_CARD],
      coldTests: [{ id: 'cold-1', ts: 1, n: 20, correct: 10, accuracy: 0.5, medianMs: null, p75Ms: null, bySkill: {}, byNote: {}, confusions: {} }]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Force a failure after the cards store was already cleared inside the transaction.
    const table = database.coldTests as unknown as { bulkPut: (items: unknown) => Promise<unknown> };
    const originalBulkPut = table.bulkPut.bind(database.coldTests);
    table.bulkPut = async () => {
      throw new Error('simulated import failure');
    };
    await expect(
      applyBackupAtomically(database, result.backup as NormalizedBackup, { ...DEFAULT_SETTINGS } as UserSettings)
    ).rejects.toThrow('simulated import failure');
    table.bulkPut = originalBulkPut;

    const cards = await database.cards.toArray();
    expect(cards.map(card => card.id)).toEqual(['find:E']);
    const cold = await database.coldTests.toArray();
    expect(cold).toHaveLength(0);
  });
});
