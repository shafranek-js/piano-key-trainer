import type { HintLevel, TrialMode } from '../learning/types';

export type Skill = 
  | 'find' 
  | 'identify' 
  | 'patternIdentify' 
  | 'notationToKey' 
  | 'soundToKey'
  | 'notationBassToKey'
  | 'intervalBuild'
  | 'intervalIdentify'
  | 'triadBuild'
  | 'triadIdentify'
  | 'triadInversionBuild'
  | 'triadInversionIdentify'
  | 'chordSymbolRead'
  | 'harmonyFunctionIdentify'
  | 'harmonyNextChord'
  | 'harmonyProgressionPlay'
  | 'chordPulse'
  | 'chordChangeTiming'
  | 'chordRhythmPattern';

export type PracticeActivity =
  | 'standard'
  | 'lesson'
  | 'repertoire'
  | 'twohand'
  | 'earIntervals'
  | 'earTriads'
  | 'earEcho';

export type PitchClass = 
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' 
  | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type IntervalNoteName = 'P8' | 'P5' | 'M3' | 'm3';

export type TriadQualityId = 'major' | 'minor';

export type InversionItemId = 'root' | 'first' | 'second' | 'slash';

export type HarmonyFunctionId = 'I' | 'V' | 'vi' | 'IV';
export type HarmonyNextChordItemId = 'I-V-vi-IV';
export type HarmonyProgressionItemId = 'C-G/B-Am-F';
export type ChordRhythmItemId = 'pulse' | 'change-timing' | 'rhythm-pattern';

export type NoteName =
  | PitchClass
  | IntervalNoteName
  | TriadQualityId
  | InversionItemId
  | HarmonyFunctionId
  | HarmonyNextChordItemId
  | HarmonyProgressionItemId
  | ChordRhythmItemId;

export type NaturalNoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type MemoryState = 'new' | 'learning' | 'review' | 'relearning';

export type Grade = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

/**
 * Provenance of `ReviewLogEvent.responseMs`:
 * - `measured` — a real user interaction was timed in this app instance;
 * - `not_measured` — a module/synthetic transition where no response time exists (responseMs = null);
 * - `legacy_unknown` — historical record without provenance (pre-migration logs / legacy imports).
 * Only `measured` samples may participate in adaptive latency statistics.
 */
export type ResponseTimingSource = 'measured' | 'not_measured' | 'legacy_unknown';

export interface CardStats {
  trials: number;
  firstCorrect: number;
  firstWrong: number;
  hints: number;
  recentScheduledSuccesses: number;
  scheduledSuccesses: number;
  practiceTrials: number;
}

export interface Card {
  id: string; // `${skill}:${note}` or `${skill}:${intervalId}`
  skill: Skill;
  note: NoteName;
  memoryState: MemoryState;
  stability: number | null;
  difficulty: number | null;
  dueAt: number;
  lastReviewAt: number;
  firstSeenAt: number;
  reps: number;
  lapses: number;
  lastGrade: Grade | null;
  migratedFromV2?: boolean;
  legacyStats?: {
    correct: number;
    wrong: number;
    stage: number;
  };
  stats: CardStats;
}

export type ReviewKind = 
  | 'scheduled' 
  | 'new' 
  | 'practice' 
  | 'confusion' 
  | 'cold' 
  | 'lesson'
  | 'transfer';

export interface ReviewLogEvent {
  /**
   * Stable unique event identity (primary key since DB schema v3).
   * Assigned before persistence and reused across persistence retries.
   * Legacy rows are backfilled by the schema migration (`legacy-<ts>`).
   */
  reviewEventId?: string;
  ts: number;
  sessionId: string;
  cardId: string;
  note: NoteName;
  skill: Skill;
  kind: ReviewKind;
  grade: Grade | null;
  gradeName: string | null;
  firstCorrect: boolean;
  answer: string | null;
  answerKeyId: string | null;
  attempts: number;
  completionAttempts?: number;
  hintUsed: boolean;
  /** Null when no interaction time was measured. Never a synthetic placeholder. */
  responseMs: number | null;
  /** Provenance of `responseMs`; absent only on legacy records (read as `legacy_unknown`). */
  responseTimingSource?: ResponseTimingSource;
  elapsedDays: number | null;
  retrievabilityBefore: number | null;
  stabilityBefore: number | null;
  stabilityAfter: number | null;
  difficultyBefore: number | null;
  difficultyAfter: number | null;
  scheduledDays: number | null;
  earlyPractice?: boolean;
  correctedAt?: number;
  trialMode?: TrialMode;
  hintLevel?: HintLevel;
  contextId?: string;
  schedulerReason?: string;
  gradeableByFsrs?: boolean;
}

export interface UserSettings {
  desiredRetention: number;
  maxIntervalDays: number;
  relearningSeconds: number;
  newPitchClassesPerSession: number;
  useLatencyGrading: boolean;
  latencyPolicyVersion: number;
  sessionPreset: 'quick' | 'normal' | 'due' | 'cold';
  midiFirstView: boolean;
  repertoireTempoMode: 'wait' | 'slow' | 'normal';
  metronomeEnabled: boolean;
  repertoireDisplayMode: 'keys' | 'staff';
  repertoireLengthMode?: 'excerpt' | 'full';
  repertoireViewMode?: 'grid' | 'compact';
  repertoireSortBy?: 'recommended' | 'difficulty' | 'title' | 'composer';
  repertoireCategoryFilter?: 'all' | 'classical' | 'melody' | 'study' | 'warmup';
  repertoireAdvancedOpen?: boolean;
  repertoireCardVariants?: Record<string, 'excerpt' | 'full'>;
  repertoireDynamicsTarget: 'off' | 'p' | 'mf' | 'f';
  repertoireArticulationTarget: 'off' | 'legato' | 'detached';
  twoHandTempoMode: 'wait' | 'slow';
  autoAdvanceDelaySeconds: number;
  level?: 'white' | 'all';
  mode?: string;
  notationClef?: 'treble' | 'bass' | 'grand';
}

