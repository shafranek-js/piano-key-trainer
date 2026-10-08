import type {
  Card,
  CardStats,
  Grade,
  MemoryState,
  NoteName,
  ResponseTimingSource,
  ReviewKind,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../core/fsrs/types';
import type { LearningProgressRecord } from '../core/learning/types';
import { normalizeBackupLearningProgress } from '../core/learning/progress';
import { backfillReviewEventId } from '../core/fsrs/reviewEventId';
import { isFsrsSkill } from '../core/fsrs/skills';
import { BACKUP_SCHEMA_VERSION } from '../core/version';
import type { ColdTestRecord, LessonProgressRecord, PianoTrainerDatabase } from './db';

export { BACKUP_SCHEMA_VERSION };

export const BACKUP_APP_ID = 'piano-key-trainer';

const NOTE_NAMES: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'P8', 'P5', 'M3', 'm3',
  'major', 'minor',
  'root', 'first', 'second', 'slash',
  'I', 'V', 'vi', 'IV',
  'I-V-vi-IV', 'C-G/B-Am-F',
  'pulse', 'change-timing', 'rhythm-pattern'
];

const MEMORY_STATES: readonly MemoryState[] = ['new', 'learning', 'review', 'relearning'];
const REVIEW_KINDS: readonly ReviewKind[] = ['scheduled', 'new', 'practice', 'confusion', 'cold', 'lesson', 'transfer'];
const GRADES: readonly Grade[] = [1, 2, 3, 4];
const RESPONSE_TIMING_SOURCES: readonly ResponseTimingSource[] = ['measured', 'not_measured', 'legacy_unknown'];
const TRIAL_MODES: readonly NonNullable<ReviewLogEvent['trialMode']>[] = [
  'model', 'guided', 'qualify', 'mixedRetrieval', 'corrective',
  'delayedCheck', 'scheduledReview', 'transfer', 'coldTest', 'freePractice'
];

const SETTING_ENUMS: Record<string, readonly string[]> = {
  sessionPreset: ['quick', 'normal', 'due', 'cold'],
  repertoireTempoMode: ['wait', 'slow', 'normal'],
  repertoireDisplayMode: ['keys', 'staff'],
  repertoireLengthMode: ['excerpt', 'full'],
  repertoireViewMode: ['grid', 'compact'],
  repertoireSortBy: ['recommended', 'difficulty', 'title', 'composer'],
  repertoireCategoryFilter: ['all', 'classical', 'melody', 'study', 'warmup'],
  repertoireDynamicsTarget: ['off', 'p', 'mf', 'f'],
  repertoireArticulationTarget: ['off', 'legato', 'detached'],
  twoHandTempoMode: ['wait', 'slow'],
  level: ['white', 'all'],
  notationClef: ['treble', 'bass', 'grand']
};

const SETTING_BOOLEANS: readonly (keyof UserSettings)[] = [
  'useLatencyGrading',
  'midiFirstView',
  'metronomeEnabled',
  'repertoireAdvancedOpen'
];

const SETTING_NUMERIC_RANGES: Record<string, readonly [number, number]> = {
  desiredRetention: [0.5, 0.99],
  maxIntervalDays: [1, 36500],
  relearningSeconds: [5, 86400],
  newPitchClassesPerSession: [0, 12],
  latencyPolicyVersion: [0, 1000],
  autoAdvanceDelaySeconds: [0, 600]
};

export interface NormalizedBackup {
  app: string;
  appVersion: string | null;
  schemaVersion: number;
  exportedAt: string | null;
  settings: Partial<UserSettings>;
  cards: Card[];
  reviewLogs: ReviewLogEvent[];
  coldTests: ColdTestRecord[];
  lessonProgress: LessonProgressRecord[];
  learningProgress: LearningProgressRecord[];
  warnings: string[];
}

export type BackupValidationResult =
  | { ok: true; backup: NormalizedBackup }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, maxLength = 512): string | null {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function asFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonNegativeInt(value: unknown, fallback = 0): number {
  const num = asFinite(value);
  return num != null && num >= 0 ? Math.floor(num) : fallback;
}

function asNonNegativeNumberOrNull(value: unknown): number | null {
  const num = asFinite(value);
  return num != null && num >= 0 ? num : null;
}

function normalizeCardStats(raw: unknown): CardStats {
  const stats = isRecord(raw) ? raw : {};
  return {
    trials: asNonNegativeInt(stats.trials),
    firstCorrect: asNonNegativeInt(stats.firstCorrect),
    firstWrong: asNonNegativeInt(stats.firstWrong),
    hints: asNonNegativeInt(stats.hints),
    recentScheduledSuccesses: asNonNegativeInt(stats.recentScheduledSuccesses),
    scheduledSuccesses: asNonNegativeInt(stats.scheduledSuccesses),
    practiceTrials: asNonNegativeInt(stats.practiceTrials)
  };
}

/**
 * Validates and normalizes a single card from untrusted backup JSON.
 * Returns null when the card cannot be represented safely (unknown skill/note).
 */
export function normalizeBackupCard(raw: unknown): Card | null {
  if (!isRecord(raw)) return null;
  const skill = isFsrsSkill(raw.skill) ? raw.skill : null;
  const note = NOTE_NAMES.includes(raw.note as NoteName) ? raw.note as NoteName : null;
  const id = asString(raw.id, 200);
  if (!skill || !note || !id) return null;
  const stability = asNonNegativeNumberOrNull(raw.stability);
  const rawDifficulty = asFinite(raw.difficulty);
  const difficulty = rawDifficulty == null ? null : Math.min(10, Math.max(1, rawDifficulty));
  const lastGrade = GRADES.includes(raw.lastGrade as Grade) ? raw.lastGrade as Grade : null;
  return {
    id,
    skill,
    note,
    memoryState: MEMORY_STATES.includes(raw.memoryState as MemoryState)
      ? raw.memoryState as MemoryState
      : 'new',
    stability,
    difficulty,
    dueAt: asNonNegativeInt(raw.dueAt),
    lastReviewAt: asNonNegativeInt(raw.lastReviewAt),
    firstSeenAt: asNonNegativeInt(raw.firstSeenAt),
    reps: asNonNegativeInt(raw.reps),
    lapses: asNonNegativeInt(raw.lapses),
    lastGrade,
    migratedFromV2: raw.migratedFromV2 === true ? true : undefined,
    stats: normalizeCardStats(raw.stats)
  };
}

const REVIEW_EVENT_ID_MAX_LENGTH = 128;
const REVIEW_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:#-]*$/;

/**
 * Resolves the identity of an imported review log:
 * - a valid existing `reviewEventId` is preserved (so same-millisecond events keep
 *   distinct identities across export → import);
 * - missing or malformed ids fall back to the deterministic legacy identity.
 * The value is untrusted input: trimmed, length-bounded and character-validated.
 */
export function isValidReviewEventId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= REVIEW_EVENT_ID_MAX_LENGTH &&
    REVIEW_EVENT_ID_PATTERN.test(trimmed)
  );
}

export function resolveBackupReviewEventId(rawValue: unknown, ts: number): string {
  return isValidReviewEventId(rawValue) ? rawValue.trim() : backfillReviewEventId(ts);
}

/**
 * Full semantic equality of two normalized review events. Used to decide whether an
 * identity collision is a genuine duplicate record (safe to skip) or a conflict
 * (different content that must be preserved under a disambiguated id).
 */
export function areReviewLogEventsEquivalent(left: ReviewLogEvent, right: ReviewLogEvent): boolean {
  return (
    left.reviewEventId === right.reviewEventId &&
    left.ts === right.ts &&
    left.sessionId === right.sessionId &&
    left.cardId === right.cardId &&
    left.note === right.note &&
    left.skill === right.skill &&
    left.kind === right.kind &&
    left.grade === right.grade &&
    left.gradeName === right.gradeName &&
    left.firstCorrect === right.firstCorrect &&
    left.answer === right.answer &&
    left.answerKeyId === right.answerKeyId &&
    left.attempts === right.attempts &&
    left.completionAttempts === right.completionAttempts &&
    left.hintUsed === right.hintUsed &&
    left.responseMs === right.responseMs &&
    left.responseTimingSource === right.responseTimingSource &&
    left.elapsedDays === right.elapsedDays &&
    left.retrievabilityBefore === right.retrievabilityBefore &&
    left.stabilityBefore === right.stabilityBefore &&
    left.stabilityAfter === right.stabilityAfter &&
    left.difficultyBefore === right.difficultyBefore &&
    left.difficultyAfter === right.difficultyAfter &&
    left.scheduledDays === right.scheduledDays &&
    left.earlyPractice === right.earlyPractice &&
    left.correctedAt === right.correctedAt &&
    left.trialMode === right.trialMode &&
    left.hintLevel === right.hintLevel &&
    left.contextId === right.contextId &&
    left.schedulerReason === right.schedulerReason &&
    left.gradeableByFsrs === right.gradeableByFsrs
  );
}

export function normalizeBackupReviewLog(raw: unknown): ReviewLogEvent | null {
  if (!isRecord(raw)) return null;
  const ts = asFinite(raw.ts);
  const sessionId = asString(raw.sessionId, 200);
  const cardId = asString(raw.cardId, 200);
  if (ts == null || ts <= 0 || !sessionId || !cardId) return null;
  if (!isFsrsSkill(raw.skill)) return null;
  if (!NOTE_NAMES.includes(raw.note as NoteName)) return null;
  if (!REVIEW_KINDS.includes(raw.kind as ReviewKind)) return null;
  const grade = GRADES.includes(raw.grade as Grade) ? raw.grade as Grade : null;
  const finiteResponseMs = asFinite(raw.responseMs);
  const responseTimingSource: ResponseTimingSource = RESPONSE_TIMING_SOURCES.includes(
    raw.responseTimingSource as ResponseTimingSource
  )
    ? raw.responseTimingSource as ResponseTimingSource
    : 'legacy_unknown';
  return {
    reviewEventId: resolveBackupReviewEventId(raw.reviewEventId, ts),
    responseTimingSource,
    ts,
    sessionId,
    cardId,
    note: raw.note as NoteName,
    skill: raw.skill as Skill,
    kind: raw.kind as ReviewKind,
    grade,
    gradeName: asString(raw.gradeName, 40),
    firstCorrect: raw.firstCorrect === true,
    answer: asString(raw.answer, 200),
    answerKeyId: asString(raw.answerKeyId, 200),
    attempts: Math.max(1, asNonNegativeInt(raw.attempts, 1)),
    completionAttempts: raw.completionAttempts === undefined ? undefined : asNonNegativeInt(raw.completionAttempts),
    hintUsed: raw.hintUsed === true,
    responseMs: finiteResponseMs == null ? null : Math.max(0, finiteResponseMs),
    elapsedDays: asNonNegativeNumberOrNull(raw.elapsedDays),
    retrievabilityBefore: asNonNegativeNumberOrNull(raw.retrievabilityBefore),
    stabilityBefore: asNonNegativeNumberOrNull(raw.stabilityBefore),
    stabilityAfter: asNonNegativeNumberOrNull(raw.stabilityAfter),
    difficultyBefore: asNonNegativeNumberOrNull(raw.difficultyBefore),
    difficultyAfter: asNonNegativeNumberOrNull(raw.difficultyAfter),
    scheduledDays: asNonNegativeNumberOrNull(raw.scheduledDays),
    earlyPractice: raw.earlyPractice === undefined ? undefined : raw.earlyPractice === true,
    correctedAt: asNonNegativeNumberOrNull(raw.correctedAt) ?? undefined,
    trialMode: TRIAL_MODES.includes(raw.trialMode as NonNullable<ReviewLogEvent['trialMode']>)
      ? raw.trialMode as ReviewLogEvent['trialMode']
      : undefined,
    hintLevel: ([0, 1, 2, 3].includes(raw.hintLevel as number) ? raw.hintLevel : undefined) as ReviewLogEvent['hintLevel'],
    contextId: asString(raw.contextId, 200) ?? undefined,
    schedulerReason: asString(raw.schedulerReason, 120) ?? undefined,
    gradeableByFsrs: raw.gradeableByFsrs === undefined ? undefined : raw.gradeableByFsrs === true
  };
}

function normalizeColdTest(raw: unknown): ColdTestRecord | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id, 200);
  const ts = asFinite(raw.ts);
  if (!id || ts == null || ts <= 0) return null;
  const nested = (value: unknown): Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }> => {
    if (!isRecord(value)) return {};
    const out: Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!isRecord(entry)) continue;
      out[key] = {
        n: asNonNegativeInt(entry.n),
        correct: asNonNegativeInt(entry.correct),
        accuracy: asNonNegativeNumberOrNull(entry.accuracy),
        median: asNonNegativeNumberOrNull(entry.median)
      };
    }
    return out;
  };
  const confusions: Record<string, number> = {};
  if (isRecord(raw.confusions)) {
    for (const [key, value] of Object.entries(raw.confusions)) {
      if (typeof value === 'number' && Number.isFinite(value)) confusions[key] = value;
    }
  }
  return {
    id,
    ts,
    n: asNonNegativeInt(raw.n),
    correct: asNonNegativeInt(raw.correct),
    accuracy: asNonNegativeNumberOrNull(raw.accuracy),
    medianMs: asNonNegativeNumberOrNull(raw.medianMs),
    p75Ms: asNonNegativeNumberOrNull(raw.p75Ms),
    bySkill: nested(raw.bySkill),
    byNote: nested(raw.byNote),
    confusions
  };
}

function normalizeLessonProgress(raw: unknown): LessonProgressRecord | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id, 200);
  const startedAt = asFinite(raw.startedAt);
  if (!id || startedAt == null || startedAt < 0) return null;
  return {
    id,
    startedAt,
    completedAt: asFinite(raw.completedAt) ?? undefined,
    currentStep: asNonNegativeInt(raw.currentStep),
    completed: raw.completed === true
  };
}

export function normalizeBackupSettings(raw: unknown): Partial<UserSettings> {
  if (!isRecord(raw)) return {};
  const out: Partial<UserSettings> = {};
  for (const [key, range] of Object.entries(SETTING_NUMERIC_RANGES)) {
    const value = asFinite(raw[key]);
    if (value == null) continue;
    (out as Record<string, unknown>)[key] = Math.min(range[1], Math.max(range[0], value));
  }
  for (const key of SETTING_BOOLEANS) {
    if (typeof raw[key] === 'boolean') (out as Record<string, unknown>)[key] = raw[key];
  }
  for (const [key, allowed] of Object.entries(SETTING_ENUMS)) {
    const value = raw[key];
    if (typeof value === 'string' && allowed.includes(value)) (out as Record<string, unknown>)[key] = value;
  }
  if (isRecord(raw.repertoireCardVariants)) {
    const variants: Record<string, 'excerpt' | 'full'> = {};
    for (const [key, value] of Object.entries(raw.repertoireCardVariants)) {
      if (value === 'excerpt' || value === 'full') variants[key] = value;
    }
    out.repertoireCardVariants = variants;
  }
  const mode = asString(raw.mode, 64);
  if (mode) out.mode = mode;
  return out;
}

/**
 * Parses an untrusted backup file. Nothing is written to IndexedDB here:
 * callers may only persist the returned normalized backup.
 */
export function validateAndNormalizeBackup(raw: unknown): BackupValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'Неверный формат файла резервной копии.' };
  }
  const schemaVersion = raw.backupSchemaVersion;
  if (schemaVersion !== undefined) {
    if (!Number.isInteger(schemaVersion) || schemaVersion !== BACKUP_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Неподдерживаемая версия резервной копии (${String(schemaVersion)}). Обновите приложение или импортируйте совместимый файл.`
      };
    }
  }
  const app = raw.app;
  if (app !== undefined && app !== BACKUP_APP_ID) {
    return { ok: false, error: 'Файл не является резервной копией Piano Key Trainer.' };
  }

  const warnings: string[] = [];
  const cards: Card[] = [];
  let skippedCards = 0;
  if (raw.cards !== undefined) {
    if (!Array.isArray(raw.cards)) {
      return { ok: false, error: 'Повреждённый раздел карточек в резервной копии.' };
    }
    for (const item of raw.cards) {
      const card = normalizeBackupCard(item);
      if (card) cards.push(card);
      else skippedCards += 1;
    }
  }
  if (skippedCards > 0) warnings.push(`Пропущено некорректных карточек: ${skippedCards}.`);

  const reviewLogs: ReviewLogEvent[] = [];
  let skippedLogs = 0;
  let malformedIdentityCount = 0;
  if (raw.reviewLogs !== undefined) {
    if (!Array.isArray(raw.reviewLogs)) {
      return { ok: false, error: 'Повреждённый раздел истории повторений в резервной копии.' };
    }
    for (const item of raw.reviewLogs) {
      if (
        isRecord(item) &&
        item.reviewEventId !== undefined &&
        !isValidReviewEventId(item.reviewEventId)
      ) {
        malformedIdentityCount += 1;
      }
      const log = normalizeBackupReviewLog(item);
      if (log) reviewLogs.push(log);
      else skippedLogs += 1;
    }

    // Identity collisions must never silently overwrite another legitimate event:
    // - records whose complete normalized payload is equivalent are skipped with a warning;
    // - a reused identity with ANY different semantic field is deterministically
    //   disambiguated so both events survive, also with a warning.
    const uniqueLogs: ReviewLogEvent[] = [];
    const seenByIdentity = new Map<string, ReviewLogEvent>();
    let duplicateLogsSkipped = 0;
    let disambiguatedIds = 0;
    for (const log of reviewLogs) {
      const identity = log.reviewEventId as string;
      const existing = seenByIdentity.get(identity);
      if (!existing) {
        seenByIdentity.set(identity, log);
        uniqueLogs.push(log);
        continue;
      }
      const exactDuplicate = areReviewLogEventsEquivalent(existing, log);
      if (exactDuplicate) {
        duplicateLogsSkipped += 1;
        continue;
      }
      const base = identity.length > 100 ? identity.slice(0, 100) : identity;
      let suffix = 2;
      let candidate = `${base}-dup${suffix}`;
      while (seenByIdentity.has(candidate)) {
        suffix += 1;
        candidate = `${base}-dup${suffix}`;
      }
      const disambiguated: ReviewLogEvent = { ...log, reviewEventId: candidate };
      seenByIdentity.set(candidate, disambiguated);
      uniqueLogs.push(disambiguated);
      disambiguatedIds += 1;
    }
    reviewLogs.length = 0;
    reviewLogs.push(...uniqueLogs);
    reviewLogs.sort((a, b) => a.ts - b.ts);
    if (duplicateLogsSkipped > 0) {
      warnings.push(`Пропущено дубликатов записей истории: ${duplicateLogsSkipped}.`);
    }
    if (disambiguatedIds > 0) {
      warnings.push(`Обнаружены повторяющиеся reviewEventId с разным содержимым: исправлено ${disambiguatedIds}.`);
    }
  }
  if (malformedIdentityCount > 0) {
    warnings.push(`Некорректные reviewEventId заменены детерминированными: ${malformedIdentityCount}.`);
  }
  if (skippedLogs > 0) warnings.push(`Пропущено некорректных записей истории: ${skippedLogs}.`);

  const coldTests: ColdTestRecord[] = [];
  if (Array.isArray(raw.coldTests)) {
    for (const item of raw.coldTests) {
      const record = normalizeColdTest(item);
      if (record) coldTests.push(record);
    }
  }

  const lessonProgress: LessonProgressRecord[] = [];
  if (Array.isArray(raw.lessonProgress)) {
    for (const item of raw.lessonProgress) {
      const record = normalizeLessonProgress(item);
      if (record) lessonProgress.push(record);
    }
  }

  const learningProgress = normalizeBackupLearningProgress(raw) ?? [];

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      appVersion: asString(raw.version, 40),
      schemaVersion: schemaVersion === undefined ? 0 : BACKUP_SCHEMA_VERSION,
      exportedAt: asString(raw.exportedAt, 40),
      settings: normalizeBackupSettings(raw.settings),
      cards,
      reviewLogs,
      coldTests,
      lessonProgress,
      learningProgress,
      warnings
    }
  };
}

/**
 * Replaces the profile stores inside one IndexedDB transaction.
 * A failure at any step aborts the transaction, leaving the previous profile intact.
 * `mergedSettings` must already include the current settings merged with the backup.
 */
export async function applyBackupAtomically(
  database: PianoTrainerDatabase,
  backup: NormalizedBackup,
  mergedSettings: UserSettings
): Promise<void> {
  await database.transaction(
    'rw',
    [database.cards, database.reviewLogEvents, database.coldTests, database.lessonProgress, database.learningProgress, database.settings],
    async () => {
      await database.cards.clear();
      if (backup.cards.length) await database.cards.bulkPut(backup.cards);
      await database.reviewLogEvents.clear();
      if (backup.reviewLogs.length) {
        await database.reviewLogEvents.bulkPut(
          backup.reviewLogs as Array<ReviewLogEvent & { reviewEventId: string }>
        );
      }
      await database.coldTests.clear();
      if (backup.coldTests.length) await database.coldTests.bulkPut(backup.coldTests);
      await database.lessonProgress.clear();
      if (backup.lessonProgress.length) await database.lessonProgress.bulkPut(backup.lessonProgress);
      await database.learningProgress.clear();
      if (backup.learningProgress.length) await database.learningProgress.bulkPut(backup.learningProgress);
      if (Object.keys(backup.settings).length) {
        await database.settings.put({ key: 'userSettings', value: mergedSettings });
      }
    }
  );
}
