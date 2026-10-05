import { DAY_MS } from './constants';
import { applyFsrsReview, retrievability, type FsrsReviewResult } from './fsrs6';
import { determineGrade } from './latencyGrading';
import {
  createLegacyTrialContext,
  createTrialContext,
  deriveFsrsApplicationDecision,
  deriveFsrsEligibility,
  isTrialCardStatsEligible,
  normalizeTrialContext
} from '../learning/trialPolicy';
import {
  HINT_LEVEL,
  type FsrsEligibilityDecision,
  type HintLevel,
  type TrialContext,
  type TrialInputMethod
} from '../learning/types';
import type {
  Card,
  Grade,
  NoteName,
  ReviewKind,
  ReviewLogEvent,
  UserSettings
} from './types';

export type FsrsReviewSettings = Pick<
  UserSettings,
  'desiredRetention' | 'maxIntervalDays' | 'relearningSeconds' | 'useLatencyGrading'
>;

let sessionSequence = 0;

/**
 * Generates a unique, collision-resistant session identifier for each call to
 * `startLearningSession(...)`.
 *
 * Cold Test sessions use the `cold-` prefix (`cold-<startedAt>-<seq>`);
 * standard learning sessions use the `session-` prefix (`session-<startedAt>-<seq>`).
 */
export function createSessionId(
  preset: 'quick' | 'normal' | 'due' | 'cold' = 'normal',
  startedAt = Date.now()
): string {
  sessionSequence += 1;
  const prefix = preset === 'cold' ? 'cold' : 'session';
  return `${prefix}-${startedAt}-${sessionSequence}`;
}

export function isFsrsAffectingKind(kind: ReviewKind): boolean {
  return kind === 'scheduled' || kind === 'new';
}

export function isStatsAffectingKind(kind: ReviewKind): boolean {
  return (
    kind === 'new' ||
    kind === 'scheduled' ||
    kind === 'practice' ||
    kind === 'confusion'
  );
}

export function gradeToName(grade: Grade | null): string | null {
  if (grade === null) return null;
  if (grade === 1) return 'Again';
  if (grade === 2) return 'Hard';
  if (grade === 4) return 'Easy';
  return 'Good';
}

export function computeElapsedDays(
  preReviewReps: number,
  preReviewLastReviewAt: number,
  reviewedAt: number
): number {
  if (preReviewReps <= 0 || !preReviewLastReviewAt || preReviewLastReviewAt <= 0) {
    return 0;
  }
  return Math.max(0, (reviewedAt - preReviewLastReviewAt) / DAY_MS);
}

function ensureCardStats(card: Card): void {
  if (!card.stats) {
    card.stats = {
      trials: 0,
      firstCorrect: 0,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: 0,
      practiceTrials: 0
    };
  }
}

function resolveCanonicalSessionId(
  explicitSessionId: string | undefined,
  contextSessionId: string | undefined,
  kind: ReviewKind,
  reviewedAt: number
): string {
  if (explicitSessionId && explicitSessionId.trim().length > 0) {
    return explicitSessionId.trim();
  }
  if (contextSessionId && contextSessionId.trim().length > 0) {
    return contextSessionId.trim();
  }
  return createSessionId(kind === 'cold' ? 'cold' : 'normal', reviewedAt);
}

/**
 * Updates `card.stats` exactly once for the first recorded attempt of a standard
 * training question.
 *
 * Participating kinds: `'new'`, `'scheduled'`, `'practice'`, `'confusion'`.
 * Excluded kinds: `'cold'`, `'lesson'` (returns `false`, leaving `card.stats` unchanged).
 */
export function applyReviewStats(
  card: Card,
  logEvent: Pick<ReviewLogEvent, 'kind' | 'firstCorrect' | 'hintUsed' | 'grade'>
): boolean {
  if (!isStatsAffectingKind(logEvent.kind)) {
    return false;
  }

  ensureCardStats(card);
  card.stats.trials += 1;

  if (logEvent.firstCorrect === true) {
    card.stats.firstCorrect += 1;
  } else {
    card.stats.firstWrong += 1;
  }

  if (logEvent.hintUsed === true) {
    card.stats.hints += 1;
  }

  if (logEvent.kind === 'practice' || logEvent.kind === 'confusion') {
    card.stats.practiceTrials += 1;
  }

  if (logEvent.kind === 'new' || logEvent.kind === 'scheduled') {
    if (logEvent.grade !== null && logEvent.grade !== 1) {
      card.stats.scheduledSuccesses += 1;
      card.stats.recentScheduledSuccesses += 1;
    } else {
      card.stats.recentScheduledSuccesses = 0;
    }
  }

  return true;
}

export interface ApplyReviewAndBuildLogParams {
  card: Card;
  kind: ReviewKind;
  firstCorrect: boolean;
  answer: NoteName | null;
  answerKeyId?: string | null;
  hintUsed: boolean;
  responseMs: number;
  settings: FsrsReviewSettings;
  reviewLog?: readonly ReviewLogEvent[];
  sessionId?: string;
  reviewedAt?: number;
  attempts?: number;
  trialContext?: TrialContext;
  hintLevel?: HintLevel;
  inputMethod?: TrialInputMethod;
  contextId?: string;
  schedulerReason?: string;
}

export interface ApplyReviewAndBuildLogResult {
  logEvent: ReviewLogEvent;
  fsrsResult: FsrsReviewResult | null;
  grade: Grade | null;
  statsUpdated: boolean;
  cardMutated: boolean;
  trialContext: TrialContext;
  fsrsEligibility: FsrsEligibilityDecision;
}

/**
 * Synchronously evaluates both the `TrialContext` gate and the `ReviewKind` gate
 * (`deriveFsrsApplicationDecision`), applies FSRS only when BOTH allow it,
 * constructs the corresponding `ReviewLogEvent` from the pre- and post-review FSRS memory
 * snapshots, and updates `card.stats` only for eligible standard trials after grade determination.
 *
 * Non-FSRS kinds (`'practice'`, `'confusion'`, `'cold'`, `'lesson'`) and non-eligible `TrialMode`s
 * (`'model'`, `'guided'`, `'qualify'`, `'mixedRetrieval'`, `'corrective'`, `'transfer'`,
 * `'coldTest'`, `'freePractice'`, or hinted `'delayedCheck'`) never mutate FSRS scheduling
 * fields and record `scheduledDays: null`. Legacy `'practice'` / `'confusion'` (`'freePractice'`
 * first attempts) record a schedule-neutral diagnostic grade (`3` / `'Good'` or `1` / `'Again'`),
 * whereas acquisition, `'cold'`, `'lesson'`, and hinted `'delayedCheck'` trials record
 * `grade: null` and `gradeName: null`.
 *
 * For `'scheduledReview'`, requiring a hint (`hintUsed === true` or `hintLevel > H0`) is
 * FSRS-eligible and forces `grade = 1` (`Again`).
 */
export function applyReviewAndBuildLog(
  params: ApplyReviewAndBuildLogParams
): ApplyReviewAndBuildLogResult {
  const reviewedAt = params.reviewedAt ?? Date.now();
  const { card, kind, firstCorrect, answer, hintUsed, responseMs, settings } = params;
  const sessionId = resolveCanonicalSessionId(
    params.sessionId,
    params.trialContext?.sessionId,
    kind,
    reviewedAt
  );
  const attempts = params.attempts ?? 1;
  const answerKeyId = params.answerKeyId ?? null;

  const rawTrialContext =
    params.trialContext ??
    createLegacyTrialContext({
      kind,
      sessionId,
      cardId: card.id,
      itemId: card.id,
      firstAttempt: attempts === 1,
      hintLevel: params.hintLevel,
      inputMethod: params.inputMethod,
      contextId: params.contextId
    });

  const rawHasDistinctItemId =
    Boolean(rawTrialContext.itemId) &&
    rawTrialContext.itemId !== rawTrialContext.cardId;
  const canonicalItemId = rawHasDistinctItemId
    ? rawTrialContext.itemId
    : card.id;

  // Canonicalize cardId to card.id and sessionId to effective sessionId, then re-derive policy
  const normalizedContext = normalizeTrialContext({
    ...rawTrialContext,
    sessionId,
    cardId: card.id,
    itemId: canonicalItemId,
    hintLevel: params.hintLevel ?? rawTrialContext.hintLevel
  });

  const effectiveHintUsed =
    Boolean(hintUsed) || normalizedContext.hintLevel > HINT_LEVEL.NONE;

  const fsrsEligibility = deriveFsrsApplicationDecision(normalizedContext, kind);
  const canMutateFsrs = fsrsEligibility.eligible;
  const trialContext: TrialContext = {
    ...normalizedContext,
    gradeableByFsrs: canMutateFsrs
  };
  const canMutateCardStats = isTrialCardStatsEligible(trialContext, kind);

  if (kind === 'cold' || trialContext.mode === 'coldTest') {
    const retrievabilityBefore = retrievability(card, reviewedAt);
    const logEvent: ReviewLogEvent = {
      ts: reviewedAt,
      sessionId,
      cardId: card.id,
      note: card.note,
      skill: card.skill,
      kind: 'cold',
      grade: null,
      gradeName: null,
      firstCorrect,
      answer,
      answerKeyId,
      attempts,
      hintUsed: effectiveHintUsed,
      responseMs,
      elapsedDays: null,
      retrievabilityBefore,
      stabilityBefore: card.stability,
      stabilityAfter: card.stability,
      difficultyBefore: card.difficulty,
      difficultyAfter: card.difficulty,
      scheduledDays: null,
      trialMode: trialContext.mode,
      hintLevel: trialContext.hintLevel,
      contextId: trialContext.contextId,
      schedulerReason: params.schedulerReason,
      gradeableByFsrs: false
    };
    return {
      logEvent,
      fsrsResult: null,
      grade: null,
      statsUpdated: false,
      cardMutated: false,
      trialContext,
      fsrsEligibility
    };
  }

  if (canMutateFsrs) {
    const preReviewReps = card.reps;
    // If effectiveHintUsed is true (e.g. scheduledReview at H1/H2/H3 or Don't know),
    // retrieval failed -> grade MUST be 1 (Again), bypassing latency grading.
    // Otherwise determineGrade() observes pre-review card.stats (before applyReviewStats).
    const grade: Grade = effectiveHintUsed
      ? 1
      : determineGrade({
          firstCorrect,
          hintUsed: effectiveHintUsed,
          responseMs,
          card,
          reviewLog: params.reviewLog ?? [],
          useLatencyGrading: settings.useLatencyGrading
        });

    const fsrsResult = applyFsrsReview(card, grade, reviewedAt, settings);
    const elapsedDays = computeElapsedDays(
      preReviewReps,
      fsrsResult.before.lastReviewAt,
      reviewedAt
    );

    const logEvent: ReviewLogEvent = {
      ts: reviewedAt,
      sessionId,
      cardId: card.id,
      note: card.note,
      skill: card.skill,
      kind,
      grade,
      gradeName: gradeToName(grade),
      firstCorrect,
      answer,
      answerKeyId,
      attempts,
      hintUsed: effectiveHintUsed,
      responseMs,
      elapsedDays,
      retrievabilityBefore: fsrsResult.before.retrievability,
      stabilityBefore: fsrsResult.before.stability,
      stabilityAfter: fsrsResult.after.stability,
      difficultyBefore: fsrsResult.before.difficulty,
      difficultyAfter: fsrsResult.after.difficulty,
      scheduledDays: fsrsResult.intervalDays,
      trialMode: trialContext.mode,
      hintLevel: trialContext.hintLevel,
      contextId: trialContext.contextId,
      schedulerReason: params.schedulerReason,
      gradeableByFsrs: true
    };

    const statsUpdated = canMutateCardStats ? applyReviewStats(card, logEvent) : false;

    return {
      logEvent,
      fsrsResult,
      grade,
      statsUpdated,
      cardMutated: true,
      trialContext,
      fsrsEligibility
    };
  }

  // Canonical rule: a remediation retry of a delayed check is not a first attempt
  // and must not emit an additional ReviewLogEvent.
  if (
    trialContext.mode === 'delayedCheck' &&
    fsrsEligibility.reason === 'ineligible_non_first_attempt'
  ) {
    return {
      logEvent: null,
      fsrsResult: null,
      grade: null,
      statsUpdated: false,
      cardMutated: false,
      trialContext,
      fsrsEligibility
    };
  }

  // Non-FSRS activity:
  // - Legacy `freePractice` (`kind === 'practice' || kind === 'confusion'`) records a
  //   schedule-neutral diagnostic grade (3 = Good when firstCorrect && !effectiveHintUsed, else 1 = Again).
  // - All Teaching Engine acquisition / support / non-memory modes (`model`, `guided`, `qualify`,
  //   `mixedRetrieval`, hinted `delayedCheck`, `corrective`, `transfer`, `lesson`, or mismatched ReviewKind)
  //   record `grade: null` and `gradeName: null`.
  const isDiagnosticFreePractice =
    trialContext.mode === 'freePractice' &&
    (kind === 'practice' || kind === 'confusion');
  const grade: Grade | null = isDiagnosticFreePractice
    ? (!firstCorrect || effectiveHintUsed ? 1 : 3)
    : null;
  const gradeName = gradeToName(grade);
  const retrievabilityBefore = retrievability(card, reviewedAt);

  const logEvent: ReviewLogEvent = {
    ts: reviewedAt,
    sessionId,
    cardId: card.id,
    note: card.note,
    skill: card.skill,
    kind,
    grade,
    gradeName,
    firstCorrect,
    answer,
    answerKeyId,
    attempts,
    hintUsed: effectiveHintUsed,
    responseMs,
    elapsedDays: null,
    retrievabilityBefore,
    stabilityBefore: card.stability,
    stabilityAfter: card.stability,
    difficultyBefore: card.difficulty,
    difficultyAfter: card.difficulty,
    scheduledDays: null,
    trialMode: trialContext.mode,
    hintLevel: trialContext.hintLevel,
    contextId: trialContext.contextId,
    schedulerReason: params.schedulerReason,
    gradeableByFsrs: false
  };

  const statsUpdated = canMutateCardStats ? applyReviewStats(card, logEvent) : false;

  return {
    logEvent,
    fsrsResult: null,
    grade,
    statsUpdated,
    cardMutated: statsUpdated,
    trialContext,
    fsrsEligibility
  };
}

export interface QuestionRoundState {
  firstResponseRecorded: boolean;
  attempts: number;
  hintUsed: boolean;
  isCompleted: boolean;
  isLocked: boolean;
}

export interface SubmitQuestionAttemptParams {
  state: QuestionRoundState;
  card: Card;
  kind: ReviewKind;
  isCorrect: boolean;
  answer: NoteName | null;
  answerKeyId?: string | null;
  hintUsedOnFirstAttempt?: boolean;
  responseMs: number;
  settings: FsrsReviewSettings;
  reviewLog?: readonly ReviewLogEvent[];
  sessionId?: string;
  reviewedAt?: number;
  trialContext?: TrialContext;
  hintLevel?: HintLevel;
  inputMethod?: TrialInputMethod;
  contextId?: string;
  schedulerReason?: string;
}

export interface SubmitQuestionAttemptResult {
  isFirstAttempt: boolean;
  logEvent: ReviewLogEvent | null;
  fsrsResult: FsrsReviewResult | null;
  grade: Grade | null;
  statsUpdated: boolean;
  cardMutated: boolean;
  trialContext: TrialContext;
  fsrsEligibility: FsrsEligibilityDecision;
}

/**
 * Production runtime gate enforcing the pedagogical first-attempt invariant across a
 * multi-attempt question round:
 * - Only the first attempt (`!state.firstResponseRecorded`) invokes `applyReviewAndBuildLog`
 *   (updating FSRS when both `kind` and `TrialContext` allow it, and updating `card.stats`
 *   when eligible).
 * - Subsequent corrective attempts after an initial error update `state.attempts` / `state.isCompleted`
 *   with `trialContext.mode = 'corrective'` (`gradeableByFsrs = false`) without mutating FSRS,
 *   `card.stats`, or emitting a second `ReviewLogEvent`.
 */
export function submitQuestionAttempt(
  params: SubmitQuestionAttemptParams
): SubmitQuestionAttemptResult {
  const { state } = params;
  const reviewedAt = params.reviewedAt ?? Date.now();
  const sessionId = resolveCanonicalSessionId(
    params.sessionId,
    params.trialContext?.sessionId,
    params.kind,
    reviewedAt
  );

  if (!state.firstResponseRecorded) {
    state.firstResponseRecorded = true;
    state.attempts = 1;
    const hintUsedOnFirst = params.hintUsedOnFirstAttempt ?? false;
    const explicitHintLevel =
      params.hintLevel ?? params.trialContext?.hintLevel ?? HINT_LEVEL.NONE;
    const effectiveHintUsed = hintUsedOnFirst || explicitHintLevel > HINT_LEVEL.NONE;
    state.hintUsed = effectiveHintUsed;

    if (params.isCorrect || params.kind === 'cold' || hintUsedOnFirst) {
      state.isCompleted = true;
      state.isLocked = true;
    }

    const {
      logEvent,
      fsrsResult,
      grade,
      statsUpdated,
      cardMutated,
      trialContext,
      fsrsEligibility
    } = applyReviewAndBuildLog({
      card: params.card,
      kind: params.kind,
      firstCorrect: params.isCorrect,
      answer: params.answer,
      answerKeyId: params.answerKeyId ?? null,
      hintUsed: effectiveHintUsed,
      responseMs: params.responseMs,
      settings: params.settings,
      reviewLog: params.reviewLog,
      sessionId,
      reviewedAt,
      attempts: 1,
      trialContext: params.trialContext,
      hintLevel: params.hintLevel,
      inputMethod: params.inputMethod,
      contextId: params.contextId,
      schedulerReason: params.schedulerReason
    });

    return {
      isFirstAttempt: true,
      logEvent,
      fsrsResult,
      grade,
      statsUpdated,
      cardMutated,
      trialContext,
      fsrsEligibility
    };
  }

  // Subsequent corrective attempt: never mutate FSRS, card.stats, or emit a second ReviewLogEvent
  state.attempts += 1;
  if (params.isCorrect) {
    state.isCompleted = true;
    state.isLocked = true;
  } else if (state.attempts >= 3) {
    state.hintUsed = true;
  }

  const rawHasDistinctItemId =
    Boolean(params.trialContext?.itemId) &&
    params.trialContext?.itemId !== params.trialContext?.cardId;
  const canonicalItemId = rawHasDistinctItemId
    ? params.trialContext?.itemId
    : params.card.id;

  const correctiveTrialContext = createTrialContext({
    mode: 'corrective',
    sessionId,
    cardId: params.card.id,
    itemId: canonicalItemId,
    hintLevel: params.hintLevel ?? params.trialContext?.hintLevel,
    firstAttempt: false,
    inputMethod: params.inputMethod ?? params.trialContext?.inputMethod ?? 'screen',
    contextId: params.contextId ?? params.trialContext?.contextId
  });

  return {
    isFirstAttempt: false,
    logEvent: null,
    fsrsResult: null,
    grade: null,
    statsUpdated: false,
    cardMutated: false,
    trialContext: correctiveTrialContext,
    fsrsEligibility: deriveFsrsEligibility(correctiveTrialContext)
  };
}
