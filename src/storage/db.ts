import Dexie, { type EntityTable } from 'dexie';
import type { Card, ReviewLogEvent } from '../core/fsrs/types';
import type { LearningProgressRecord } from '../core/learning/types';
import { DB_SCHEMA_VERSION } from '../core/version';
import { migrateLegacyReviewLog, REVIEW_LOGS_TABLE } from './reviewMigrations';

export { DB_SCHEMA_VERSION };

export interface ColdTestRecord {
  id: string;
  ts: number;
  n: number;
  correct: number;
  accuracy: number | null;
  medianMs: number | null;
  p75Ms: number | null;
  bySkill: Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }>;
  byNote: Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }>;
  confusions: Record<string, number>;
}

export interface RepertoireHistoryRecord {
  id?: number;
  ts: number;
  songId: string;
  mistakes: number;
  timeMs: number;
  bpm: number | null;
  timingAccuracy: number | null;
  meanTimingErrorMs: number | null;
  dynamicsAccuracy: number | null;
  articulationAccuracy: number | null;
}

export interface TwoHandHistoryRecord {
  id?: number;
  ts: number;
  patternId: string;
  mistakes: number;
  timeMs: number;
  bpm: number | null;
  timingAccuracy: number | null;
  coordinationAccuracy: number | null;
}

export interface LessonProgressRecord {
  id: string; // lessonId
  startedAt: number;
  completedAt?: number;
  currentStep: number;
  completed: boolean;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const DB_V1_STORES: Readonly<Record<string, string>> = {
  cards: 'id, skill, note, dueAt, memoryState',
  reviewLogs: 'ts, sessionId, cardId, kind, skill',
  coldTests: 'id, ts',
  repertoireHistory: '++id, ts, songId',
  twoHandHistory: '++id, ts, patternId',
  lessonProgress: 'id',
  settings: 'key'
};

export const DB_V2_STORES: Readonly<Record<string, string>> = {
  ...DB_V1_STORES,
  learningProgress: 'id, itemId, state, updatedAt'
};

/** Schema v3: review events get a stable identity key; `ts` stays indexed chronology. */
export const DB_V3_STORES: Readonly<Record<string, string>> = {
  ...DB_V2_STORES,
  [REVIEW_LOGS_TABLE]: 'reviewEventId, ts, sessionId, cardId, kind, skill'
};

export class PianoTrainerDatabase extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  /**
   * Legacy table (schema v1–v2) keyed by `ts`. It is retired in schema v4;
   * all reads/writes go through `reviewLogEvents`.
   */
  reviewLogs!: EntityTable<ReviewLogEvent, 'ts'>;
  reviewLogEvents!: EntityTable<ReviewLogEvent & { reviewEventId: string }, 'reviewEventId'>;
  coldTests!: EntityTable<ColdTestRecord, 'id'>;
  repertoireHistory!: EntityTable<RepertoireHistoryRecord, 'id'>;
  twoHandHistory!: EntityTable<TwoHandHistoryRecord, 'id'>;
  lessonProgress!: EntityTable<LessonProgressRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  learningProgress!: EntityTable<LearningProgressRecord, 'id'>;

  constructor(name = 'PianoTrainerDB') {
    super(name);
    this.version(1).stores({ ...DB_V1_STORES });
    this.version(2).stores({ ...DB_V2_STORES });
    this.version(3)
      .stores({ [REVIEW_LOGS_TABLE]: DB_V3_STORES[REVIEW_LOGS_TABLE] })
      .upgrade(async tx => {
        // Copy legacy rows into the identity-keyed store; nothing is deleted here.
        const legacyRows = (await tx.table('reviewLogs').toArray()) as ReviewLogEvent[];
        if (legacyRows.length) {
          await tx.table(REVIEW_LOGS_TABLE).bulkPut(legacyRows.map(migrateLegacyReviewLog));
        }
      });
    this.version(DB_SCHEMA_VERSION).stores({ reviewLogs: null });
  }
}

export const db = new PianoTrainerDatabase();
