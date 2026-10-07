import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Dexie from 'dexie';
import { createServer as createViteServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(projectDir, 'acceptance', 'fsrs-persistence-integrity', 'evidence.json');

const legacyLog = ts => ({
  ts,
  sessionId: `legacy-session-${ts}`,
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
});

const server = await createViteServer({
  configFile: false,
  root: projectDir,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true }
});

try {
  const dbModule = await server.ssrLoadModule('/src/storage/db.ts');
  const reviewMigrations = await server.ssrLoadModule('/src/storage/reviewMigrations.ts');
  const responseTiming = await server.ssrLoadModule('/src/core/fsrs/responseTiming.ts');
  const latency = await server.ssrLoadModule('/src/core/fsrs/latencyGrading.ts');
  const fsrs = await server.ssrLoadModule('/src/core/fsrs/fsrs6.ts');
  const backup = await server.ssrLoadModule('/src/storage/backup.ts');
  const constants = await server.ssrLoadModule('/src/core/fsrs/constants.ts');

  // --- Legacy DB migration evidence -------------------------------------------------
  const legacyName = `EvidenceLegacy-${Date.now()}`;
  const logs = Array.from({ length: 7 }, (_, index) => legacyLog(10_000 + index * 1_000));
  const legacyDb = new Dexie(legacyName);
  legacyDb.version(2).stores({ ...dbModule.DB_V2_STORES });
  await legacyDb.open();
  await legacyDb.table('reviewLogs').bulkAdd(logs);
  const beforeCount = await legacyDb.table('reviewLogs').count();
  legacyDb.close();

  const migrated = new dbModule.PianoTrainerDatabase(legacyName);
  await migrated.open();
  const afterRows = await migrated.reviewLogEvents.orderBy('ts').toArray();
  const migration = {
    legacyCount: beforeCount,
    migratedCount: afterRows.length,
    timestampsPreserved: afterRows.every((row, index) => row.ts === logs[index].ts),
    contentPreserved: afterRows.every((row, index) =>
      row.sessionId === logs[index].sessionId &&
      row.cardId === logs[index].cardId &&
      row.grade === logs[index].grade &&
      row.responseMs === logs[index].responseMs
    ),
    backfilledIds: afterRows.map(row => row.reviewEventId),
    legacyTableRetired: !migrated.tables.some(table => table.name === 'reviewLogs')
  };
  migrated.close();
  await Dexie.delete(legacyName);

  // --- Backup round-trip proof: same-ms events keep distinct identities --------------
  const sameTimestamp = 1_800_000_000_000;
  const backupLog = (reviewEventId, cardId) => ({
    reviewEventId,
    responseTimingSource: 'measured',
    ts: sameTimestamp,
    sessionId: 'evidence-backup',
    cardId,
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
    gradeableByFsrs: true
  });
  const exportedBackup = {
    app: 'piano-key-trainer',
    backupSchemaVersion: backup.BACKUP_SCHEMA_VERSION,
    version: '6.2.0',
    exportedAt: '2026-10-07T00:00:00.000Z',
    reviewLogs: [
      backupLog('evidence-uuid-A', 'find:C'),
      backupLog('evidence-uuid-B', 'find:D')
    ]
  };
  const backupValidation = backup.validateAndNormalizeBackup(exportedBackup);
  if (!backupValidation.ok) {
    throw new Error(`Backup validation for evidence failed: ${backupValidation.error}`);
  }
  const backupName = `EvidenceBackup-${Date.now()}`;
  const backupDatabase = new dbModule.PianoTrainerDatabase(backupName);
  await backupDatabase.open();
  await backup.applyBackupAtomically(backupDatabase, backupValidation.backup, constants.DEFAULT_SETTINGS);
  const backupRows = await backupDatabase.reviewLogEvents.orderBy('ts').toArray();
  backupDatabase.close();
  await Dexie.delete(backupName);
  const backupRoundTripSameMs = {
    before: exportedBackup.reviewLogs.length,
    after: backupRows.length,
    beforeTimestamp: sameTimestamp,
    afterTimestamps: backupRows.map(row => row.ts),
    beforeReviewEventIds: exportedBackup.reviewLogs.map(row => row.reviewEventId),
    afterReviewEventIds: backupRows.map(row => row.reviewEventId).sort(),
    identitiesPreserved:
      backupRows.length === 2 &&
      new Set(backupRows.map(row => row.reviewEventId)).size === 2 &&
      backupRows.every(row => row.ts === sameTimestamp),
    warnings: backupValidation.backup.warnings
  };

  // --- Latency exclusion proof ------------------------------------------------------
  const measured = [500, 600, 700, 800, 900, 1000, 1100, 1200].map((responseMs, index) => ({
    reviewEventId: `measured-${index}`,
    ts: 1_000 + index,
    sessionId: 'evidence',
    cardId: 'find:C',
    note: 'C',
    skill: 'find',
    kind: 'scheduled',
    grade: 3,
    firstCorrect: true,
    hintUsed: false,
    responseMs,
    responseTimingSource: 'measured'
  }));
  const synthetic = Array.from({ length: 1000 }, (_, index) => ({
    reviewEventId: `synthetic-${index}`,
    ts: 100_000 + index,
    sessionId: 'evidence',
    cardId: 'find:C',
    note: 'C',
    skill: 'find',
    kind: 'scheduled',
    grade: 3,
    firstCorrect: true,
    hintUsed: false,
    responseMs: index % 2 === 0 ? 800 : 1200,
    responseTimingSource: index % 2 === 0 ? 'not_measured' : undefined
  }));
  const baseline = latency.latencyStats('find', measured);
  const polluted = latency.latencyStats('find', [...measured, ...synthetic]);
  const latencyExclusion = {
    measuredSamples: baseline.n,
    baseline: { p30: baseline.p30, p85: baseline.p85, median: baseline.median },
    after1000Synthetic: {
      measuredSamples: polluted.n,
      p30: polluted.p30,
      p85: polluted.p85,
      median: polluted.median,
      excludedNotMeasured: polluted.excludedNotMeasured,
      excludedLegacyUnknown: polluted.excludedLegacyUnknown
    },
    quantilesUnchanged:
      baseline.p30 === polluted.p30 && baseline.p85 === polluted.p85 && baseline.median === polluted.median,
    untimedCorrectAnswerGrade: latency.determineGrade({
      firstCorrect: true,
      hintUsed: false,
      responseMs: null,
      card: {
        id: 'find:C', skill: 'find', note: 'C', memoryState: 'review', stability: 10, difficulty: 5,
        dueAt: 0, lastReviewAt: 0, firstSeenAt: 0, reps: 4, lapses: 0, lastGrade: 3,
        stats: { trials: 4, firstCorrect: 4, firstWrong: 0, hints: 0, recentScheduledSuccesses: 3, scheduledSuccesses: 3, practiceTrials: 0 }
      },
      reviewLog: [...measured, ...synthetic],
      useLatencyGrading: true
    }),
    legacySourceResolved: responseTiming.resolveResponseTimingSource({ responseMs: 800 })
  };

  // --- FSRS parity matrix summary ---------------------------------------------------
  const vectors = JSON.parse(await readFile(path.join(projectDir, 'tests', 'fixtures', 'fsrsCanonicalVectors.json'), 'utf8'));
  let maxDeviation = 0;
  for (const vector of vectors.formulas.initial_stability) {
    maxDeviation = Math.max(maxDeviation, Math.abs(fsrs.initialStability(vector.grade) - vector.expected));
  }
  for (const vector of vectors.formulas.initial_difficulty) {
    maxDeviation = Math.max(maxDeviation, Math.abs(fsrs.initialDifficulty(vector.grade) - vector.expected_clamped));
  }
  for (const vector of vectors.formulas.next_difficulty) {
    maxDeviation = Math.max(maxDeviation, Math.abs(fsrs.nextDifficulty(vector.difficulty, vector.grade) - vector.expected));
  }
  for (const vector of vectors.formulas.recall_stability) {
    maxDeviation = Math.max(maxDeviation, Math.abs(
      fsrs.recallStability(vector.difficulty, vector.stability, vector.retrievability, vector.grade) - vector.expected
    ));
  }
  for (const vector of vectors.formulas.forget_stability) {
    maxDeviation = Math.max(maxDeviation, Math.abs(
      fsrs.forgetStability(vector.difficulty, vector.stability, vector.retrievability) - vector.expected
    ));
  }
  for (const vector of vectors.formulas.short_term_stability) {
    maxDeviation = Math.max(maxDeviation, Math.abs(fsrs.shortTermStability(vector.stability, vector.grade) - vector.expected));
  }
  for (const vector of vectors.formulas.next_interval) {
    maxDeviation = Math.max(maxDeviation, Math.abs(fsrs.scheduleIntervalMs(vector.stability, 0.9, 120).days - vector.expected));
  }
  const fsrsParity = {
    reference: vectors.reference,
    formulaVectorCount: Object.values(vectors.formulas)
      .filter(value => Array.isArray(value))
      .reduce((total, list) => total + list.length, 0),
    sequenceCount: vectors.sequences.length,
    sequenceStepCount: vectors.sequences.reduce((total, sequence) => total + sequence.steps.length, 0),
    maxObservedDeviation: maxDeviation
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    migration,
    backupRoundTripSameMs,
    latencyExclusion,
    fsrsParity
  }, null, 2) + '\n');
  console.info(`Wrote ${outputPath}`);
} finally {
  await server.close();
}
