import type { Card, Grade, ReviewLogEvent, Skill, UserSettings } from '../fsrs/types';
import type { LearningProgressRecord } from '../learning/types';

export const DIAGNOSTICS_SCHEMA_VERSION = 2;

export interface DiagnosticMeta {
  appVersion: string;
  buildVersion: string;
  schemaVersion: number;
  diagnosticsSchemaVersion: number;
  exportedAt: string;
  browser: string;
  platform: string;
  screenSize: string;
  storageVersion: number;
}

export interface DiagnosticSummary {
  overview: string;
  coreCurriculumProgress: string;
  activePhase: string;
  dailyPracticeSummary: string;
  potentialIssues: string[];
}

export interface PhaseRequirementCheck {
  label: string;
  isMet: boolean;
  currentValue?: number | string | boolean;
  requiredValue?: number | string | boolean;
  statusText: string;
}

export interface PhaseDiagnosticDetail {
  id: string;
  title: string;
  detail: string;
  available: boolean;
  started: boolean;
  completed: boolean;
  current: boolean;
  locked: boolean;
  prerequisites: string[];
  rawCompletion: boolean;
  normalizedCompletion: boolean;
  normalizationReason?: string;
  reconciliationReason?: string;
  requirements: PhaseRequirementCheck[];
  requirementsMet: number;
  requirementsTotal: number;
}

export interface AdvancedModuleDiagnosticDetail {
  id: string;
  title: string;
  status: 'in_progress' | 'completed' | 'available' | 'locked';
  available: boolean;
  activeStep?: string;
  trialsCompleted?: number;
  trialsTotal?: number;
  accuracy?: number | null;
  transferPhase?: string | null;
  transferBlockKind?: string | null;
  learningGates?: Record<string, string>;
  harmonyCards?: {
    cardId: string;
    lifecycleClassification: FsrsCardDiagnostic['lifecycleClassification'];
    eligibleForDailyPractice: boolean;
  }[];
}

export interface CurriculumDiagnosticState {
  corePhasesCompleted: number;
  corePhasesTotal: number;
  isAllCoreDone: boolean;
  currentPhaseId: string | null;
  coreCourse: Record<string, PhaseDiagnosticDetail>;
  advancedModules: Record<string, AdvancedModuleDiagnosticDetail>;
}

export interface LearningProgressDiagnosticState {
  totalRecords: number;
  byState: Record<string, number>;
  records: Record<
    string,
    {
      state: string;
      updatedAt: number;
      updatedAtFormatted: string;
      contexts: string[];
      modelCompleted?: boolean;
      guidedSuccesses?: number;
      independentUnhintedSuccesses?: number;
    }
  >;
}

export interface FsrsCardDiagnostic {
  cardId: string;
  skillType: Skill;
  displayName: string;
  note: string;
  state: string;
  due: number;
  dueFormatted: string | null;
  lifecycleClassification: 'newInactive' | 'newEligible' | 'learning' | 'reviewFuture' | 'reviewDue' | 'reviewOverdue';
  lastReview: number | null;
  lastReviewFormatted: string | null;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
  isDue: boolean;
  isOverdue: boolean;
}

export interface FsrsDiagnosticState {
  totalCards: number;
  dueCount: number;
  overdueCount: number;
  bySkill: Record<string, number>;
  cards: FsrsCardDiagnostic[];
}

export interface PracticeSessionDiagnostic {
  sessionId: string;
  startedAt: number;
  startedAtFormatted: string;
  endedAt: number;
  endedAtFormatted: string;
  durationSeconds: number;
  taskCount: number;
  correctCount: number;
  firstAttemptAccuracy: number;
}

export interface PracticeTaskDiagnostic {
  sequenceNumber: number;
  cardId: string;
  skillType: Skill;
  taskType: string;
  root?: string;
  note?: string;
  context?: string;
  schedulerReason: string;
}

export interface DiversityMetrics {
  taskCount: number;
  uniqueSkills: number;
  uniqueTaskTypes: number;
  uniqueRoots: number;
  uniqueNotes: number;
  maxSameSkillStreak: number;
  maxSameCardStreak: number;
}

export interface DailyPracticeDiagnosticState {
  totalSessions: number;
  recentSessionsIncluded: number;
  recentSessionLimit: number;
  recentSessions: PracticeSessionDiagnostic[];
  recentTasks: PracticeTaskDiagnostic[];
  diversity: DiversityMetrics;
}

export interface ReviewEventDiagnostic {
  timestamp: number;
  dateFormatted: string;
  cardId: string;
  skillType: Skill;
  taskType: string;
  context?: string;
  answer?: string;
  correct: boolean;
  grade?: Grade | null;
  firstAttempt: boolean;
  responseTimeMs: number | null;
  sessionId: string;
  chordDetails?: {
    targetNotes?: string[];
    playedNotes?: string[];
    classification?: string;
  };
  intervalDetails?: {
    targetInterval?: string;
    root?: string;
    answer?: string;
  };
}

export interface ReviewHistoryDiagnosticState {
  recentEventsCount: number;
  recentEvents: ReviewEventDiagnostic[];
}

export interface SchedulerTraceAlternative {
  cardId: string;
  skill: string;
  reasonNotSelected: string;
}

export interface SchedulerTraceItem {
  timestamp: number;
  timeFormatted: string;
  selected: string;
  skill: Skill;
  reason: string;
  candidateCount: number;
  alternatives: SchedulerTraceAlternative[];
  activationId: string;
  decisionSequence: number;
  sessionId: string | null;
  questionInstanceId: string | null;
  nextRoundCallId: string | null;
  cardStateBefore: string | null;
  dueAtBefore: number | null;
  isDueBefore: boolean;
  eligibleCandidateCount: number;
  dueCandidateCount: number;
  recentCardIds: string[];
  previousReviewTransitionId: string | null;
}

export interface SchedulerNextRoundEvent {
  callId: string;
  timestamp: number;
  sessionId: string | null;
  activity: string;
  previousActivationId: string | null;
  previousQuestionInstanceId: string | null;
  previousCardId: string | null;
  disposition: 'requested' | 'activated' | 'suppressed_active_question' | 'deferred_review_persistence' | 'resumed_after_persistence' | 'no_scheduler_activation' | 'blocked_persistence_failure';
  activationId?: string;
}

export interface SchedulerReviewTransition {
  transitionId: string;
  timestamp: number;
  cardId: string;
  sessionId: string;
  questionInstanceId: string | null;
  activationId: string | null;
  decisionSequence: number | null;
  grade: Grade | null;
  correct: boolean;
  firstAttempt: boolean;
  oldDueAt: number;
  newDueAt: number;
  oldState: string;
  newState: string;
  cardMutated: boolean;
  persisted: boolean;
  persistenceStatus: 'pending' | 'saved' | 'failed';
}

export interface SchedulerTraceWarning {
  code: 'scheduledCardReselectedWithoutReview' | 'duplicateTaskActivation';
  timestamp: number;
  sessionId: string;
  cardId: string;
  activationIds: string[];
  questionInstanceIds: string[];
  intervalMs?: number;
  message: string;
}

export interface SchedulerTraceDiagnosticState {
  schemaVersion: 2;
  recentTraces: SchedulerTraceItem[];
  nextRoundEvents: SchedulerNextRoundEvent[];
  reviewTransitions: SchedulerReviewTransition[];
  warnings: SchedulerTraceWarning[];
}

export interface ActiveRemediationState {
  skill: string;
  originalTask?: string;
  failedAt?: number;
  currentStep?: string;
  interveningTasksDone?: number;
  retryPending?: boolean;
}

export interface RemediationDiagnosticState {
  activeStates: ActiveRemediationState[];
}

export interface StalledSkillCandidate {
  skill: string;
  attempts: number;
  accuracy: number;
  firstAttemptAccuracy: number;
  lapses: number;
  warning: string;
}

export interface LearningBottlenecksDiagnosticState {
  weakestSkills: Array<{ skill: string; attempts: number; accuracy: number }>;
  mostFailedSkills: Array<{ skill: string; failureCount: number }>;
  highestLapseCards: Array<{ cardId: string; skill: string; note: string; lapses: number }>;
  longestResponseTimeSkills: Array<{ skill: string; medianMs: number }>;
  stalledSkills: StalledSkillCandidate[];
}

export interface StorageConsistencyChecks {
  orphanCards: string[];
  missingProgressRecords: string[];
  unknownSkillIds: string[];
  duplicateCards: string[];
  invalidDueDates: string[];
  invalidReviewTimestamps: string[];
  futureTimestamps: string[];
  curriculumContradictions: string[];
}

export interface StorageConsistencyDiagnosticState {
  warnings: string[];
  checks: StorageConsistencyChecks;
}

export interface DiagnosticExport {
  diagnosticsSchemaVersion: number;
  meta: DiagnosticMeta;
  summary: DiagnosticSummary;
  curriculum: CurriculumDiagnosticState;
  learningProgress: LearningProgressDiagnosticState;
  fsrs: FsrsDiagnosticState;
  dailyPractice: DailyPracticeDiagnosticState;
  reviewHistory: ReviewHistoryDiagnosticState;
  schedulerTrace: SchedulerTraceDiagnosticState;
  remediation: RemediationDiagnosticState;
  bottlenecks: LearningBottlenecksDiagnosticState;
  storageConsistency: StorageConsistencyDiagnosticState;
  integrityChecks: DiagnosticIntegrityChecks;
}

export interface DiagnosticIntegrityChecks {
  duplicateReviewBurst: string[];
  staleSessionHandlerSuspected: string[];
  newCardMarkedOverdue: string[];
  moduleCompletionMismatch: string[];
  availabilityMismatch: string[];
  fallbackDominance: string[];
  excessiveSkillStreak: string[];
  curriculumNormalizationApplied: string[];
  schedulerReselectionWithoutReview: string[];
  duplicateTaskActivation: string[];
}

export interface BuildDiagnosticSnapshotParams {
  cards: readonly Card[];
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
    | Record<string, LearningProgressRecord>;
  reviewLogs: readonly ReviewLogEvent[];
  settings?: UserSettings;
  now?: number;
  environmentMeta?: {
    browser?: string;
    platform?: string;
    screenSize?: string;
    schemaVersion?: number;
    storageVersion?: number;
    buildVersion?: string;
  };
  schedulerTraces?: readonly SchedulerTraceItem[];
  schedulerDiagnostics?: SchedulerTraceDiagnosticState;
  activeRemediation?: readonly ActiveRemediationState[];
  advancedModulesStatus?: {
    bassGrandStatus?: 'not_started' | 'in_progress' | 'completed';
    bassGrandActiveStep?: string;
    intervalStatus?: 'not_started' | 'in_progress' | 'completed';
    intervalActiveStep?: string;
    triadStatus?: 'not_started' | 'in_progress' | 'completed';
    triadActiveStep?: string;
    inversionStatus?: 'not_started' | 'in_progress' | 'completed';
    inversionActiveStep?: string;
    harmonyStatus?: 'not_started' | 'in_progress' | 'completed';
    harmonyActiveStep?: string;
  };
  advancedModuleAvailability?: {
    bassGrandStaff?: boolean;
    intervals?: boolean;
    triads?: boolean;
    chordInversions?: boolean;
    harmony?: boolean;
  };
}
