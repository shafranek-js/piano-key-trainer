export type Skill = 
  | 'find' 
  | 'identify' 
  | 'patternIdentify' 
  | 'notationToKey' 
  | 'soundToKey';

export type NoteName = 
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' 
  | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type NaturalNoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type MemoryState = 'new' | 'learning' | 'review' | 'relearning';

export type Grade = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

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
  id: string; // `${skill}:${note}`
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
  | 'lesson';

export interface ReviewLogEvent {
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
  responseMs: number;
  elapsedDays: number | null;
  retrievabilityBefore: number | null;
  stabilityBefore: number | null;
  stabilityAfter: number | null;
  difficultyBefore: number | null;
  difficultyAfter: number | null;
  scheduledDays: number | null;
  earlyPractice?: boolean;
  correctedAt?: number;
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
  repertoireDynamicsTarget: 'off' | 'p' | 'mf' | 'f';
  repertoireArticulationTarget: 'off' | 'legato' | 'detached';
  twoHandTempoMode: 'wait' | 'slow';
  autoAdvanceDelaySeconds: number;
  level?: 'white' | 'all';
  mode?: string;
  notationClef?: 'treble' | 'bass' | 'grand';
}
