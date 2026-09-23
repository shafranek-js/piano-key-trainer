import Dexie, { type EntityTable } from 'dexie';
import type { Card, ReviewLogEvent, UserSettings } from '../core/fsrs/types';

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

export class PianoTrainerDatabase extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  reviewLogs!: EntityTable<ReviewLogEvent, 'ts'>;
  coldTests!: EntityTable<ColdTestRecord, 'id'>;
  repertoireHistory!: EntityTable<RepertoireHistoryRecord, 'id'>;
  twoHandHistory!: EntityTable<TwoHandHistoryRecord, 'id'>;
  lessonProgress!: EntityTable<LessonProgressRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor() {
    super('PianoTrainerDB');
    this.version(1).stores({
      cards: 'id, skill, note, dueAt, memoryState',
      reviewLogs: 'ts, sessionId, cardId, kind, skill',
      coldTests: 'id, ts',
      repertoireHistory: '++id, ts, songId',
      twoHandHistory: '++id, ts, patternId',
      lessonProgress: 'id',
      settings: 'key'
    });
  }
}

export const db = new PianoTrainerDatabase();
