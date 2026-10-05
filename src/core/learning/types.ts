export type TrialMode =
  | 'model'
  | 'guided'
  | 'qualify'
  | 'mixedRetrieval'
  | 'corrective'
  | 'delayedCheck'
  | 'scheduledReview'
  | 'transfer'
  | 'coldTest'
  | 'freePractice';

export type HintLevel = 0 | 1 | 2 | 3;

export const HINT_LEVEL = {
  /** H0 = no hint (independent unhinted retrieval) */
  NONE: 0 as HintLevel,
  /** H1 = verbal structural cue */
  VERBAL_CUE: 1 as HintLevel,
  /** H2 = visual structural cue */
  VISUAL_CUE: 2 as HintLevel,
  /** H3 = answer / model visible */
  MODEL_VISIBLE: 3 as HintLevel
} as const;

export type TrialInputMethod =
  | 'screen'
  | 'midi'
  | 'pc'
  | 'answerButton';

export interface TrialContext {
  mode: TrialMode;
  sessionId: string;
  cardId?: string;
  itemId?: string;
  hintLevel: HintLevel;
  firstAttempt: boolean;
  inputMethod: TrialInputMethod;
  contextId?: string;
  gradeableByFsrs: boolean;
}

export type FsrsEligibilityReason =
  | 'eligible_scheduled_review'
  | 'eligible_delayed_check'
  | 'ineligible_mode'
  | 'ineligible_non_first_attempt'
  | 'ineligible_hinted'
  | 'ineligible_missing_card'
  | 'ineligible_review_kind';

export interface FsrsEligibilityDecision {
  eligible: boolean;
  reason: FsrsEligibilityReason;
}

export type AcquisitionState =
  | 'unseen'
  | 'introduced'
  | 'guided'
  | 'qualifying'
  | 'mixReady'
  | 'retention';

export interface LearningTransferAssessment {
  blockNumber: number;
  blockKind: 'initial' | 'retry';
  phase: 'active' | 'result' | 'remediation' | 'passed';
  trialsCompleted: number;
  correctFirstAttempts: number;
  coverageTags: string[];
  failedTrialIndexes: number[];
  remediationTrialIndexes: number[];
  remediationIndex: number;
  pendingCorrective?: boolean;
}

export interface ChordRhythmAssessmentSnapshot {
  blockKind: 'initial' | 'retry';
  phase: 'active' | 'result' | 'remediation' | 'passed' | 'failed';
  trialIndex: number;
  trialsCompleted: number;
  correctFirstAttempts: number;
  failedTrialIndexes: number[];
  remediationTrialIndexes: number[];
  remediationIndex: number;
  remediationUsed: number;
  pendingCorrective: boolean;
  scoredQuestionIds: string[];
}

export interface ChordRhythmBarEventSnapshot {
  barIndex: number;
  chordId: string;
  chordLabel: string;
  chordCorrect: boolean;
  timingBand: string;
  classificationOutcome: string | null;
  detectedChordLabel: string | null;
}

export interface ChordRhythmModuleSnapshot {
  stage: string;
  sequenceIndex?: number;
  /** Two-bar change exercise: 0 = first bar (current chord), 1 = change bar (next chord). */
  barIndex?: number;
  barEvents?: ChordRhythmBarEventSnapshot[];
  assessment?: ChordRhythmAssessmentSnapshot;
}

export interface LearningProgressRecord {
  id: string;
  itemId: string;
  state: AcquisitionState;
  modelCompleted: boolean;
  guidedSuccesses: number;
  independentUnhintedSuccesses: number;
  contexts: string[];
  /** Optional bounded assessment state; absent from records written by older app versions. */
  transferAssessment?: LearningTransferAssessment;
  transferLifetimeTrials?: number;
  transferLifetimeCorrectFirstAttempts?: number;
  /** Persisted in-progress position for the Harmony & Accompaniment module. */
  harmonySnapshot?: {
    step: string;
    sequenceIndex: number;
    quizIndex: number;
    assessmentIndex: number;
    assessmentChordIndex: number;
    awaitingCorrective: boolean;
    trialHadWrong: boolean;
  };
  /** Persisted teaching position for Milestone 3K; active timed runs restart with a count-in. */
  chordRhythmSnapshot?: ChordRhythmModuleSnapshot;
  currentHintLevel: HintLevel;
  introducedAt?: number;
  mixReadyAt?: number;
  firstFsrsEligibleAt?: number;
  updatedAt: number;
}

export type LearningEvent =
  | { type: 'modelCompleted'; at: number; contextId?: string }
  | {
      type: 'guidedAttempt';
      correct: boolean;
      hintLevel?: HintLevel;
      contextId?: string;
      at: number;
    }
  | {
      type: 'independentAttempt';
      correct: boolean;
      hinted: boolean;
      hintLevel?: HintLevel;
      contextId?: string;
      at: number;
    }
  | { type: 'mixReady'; at: number }
  | { type: 'fsrsActivated'; at: number };
