import type { ReviewKind } from '../fsrs/types';
import {
  HINT_LEVEL,
  type FsrsEligibilityDecision,
  type HintLevel,
  type TrialContext,
  type TrialInputMethod,
  type TrialMode
} from './types';

export type FsrsEligibilityInput = Pick<
  TrialContext,
  'mode' | 'firstAttempt' | 'hintLevel' | 'cardId'
> & {
  kind?: ReviewKind;
};

/** Canonical marker written to `LearningProgressRecord.contexts` after a failed first attempt. */
export const DELAYED_RETRY_CONTEXT = 'pending:delayedRetry';

/** Set only when the failed first attempt actually graded FSRS (`Again`). */
export const GRADED_FAILURE_CONTEXT = 'pending:gradedFailure';

/**
 * Canonical delayed-correction rule for every acquisition module:
 * the first gradeable attempt mutates FSRS at most once; corrective/remediation
 * retries after a graded failure are never first attempts.
 */
export function hasPendingDelayedRetry(contexts: readonly string[] | undefined): boolean {
  return Boolean(contexts?.includes(DELAYED_RETRY_CONTEXT));
}

export function wasDelayedCheckGradedFailure(contexts: readonly string[] | undefined): boolean {
  return Boolean(contexts?.includes(GRADED_FAILURE_CONTEXT));
}

export function isDelayedCheckFirstAttempt(contexts: readonly string[] | undefined): boolean {
  return !wasDelayedCheckGradedFailure(contexts);
}

/**
 * Authoritative Milestone 3A policy determining whether a trial is eligible to mutate
 * FSRS scheduling state (`Card.stability`, `Card.difficulty`, `Card.reps`, `Card.dueAt`,
 * `Card.lastReviewAt`).
 *
 * Rules for Milestone 3A:
 * - `scheduledReview` -> eligible when `firstAttempt === true` and `cardId` exists.
 *   Hint level (`H0–H3`) does NOT make a scheduled review non-gradeable: requiring a hint
 *   means memory retrieval failed and produces `grade = Again` (`1`).
 * - `delayedCheck` -> eligible ONLY when `firstAttempt === true`, `hintLevel === H0` (0), and `cardId` exists.
 *   `delayedCheck` with `H1/H2/H3` is an acquisition/support event and produces NO FSRS mutation.
 * - `model`, `guided`, `qualify`, `mixedRetrieval`, `corrective`, `transfer`, `coldTest`, `freePractice`
 *   -> NEVER FSRS-gradeable in Milestone 3A.
 * - If `kind` is supplied and is not `'scheduled' | 'new'`, returns `ineligible_review_kind`.
 */
export function deriveFsrsEligibility(
  input: FsrsEligibilityInput
): FsrsEligibilityDecision {
  const { mode, firstAttempt, hintLevel, cardId, kind } = input;

  if (mode !== 'scheduledReview' && mode !== 'delayedCheck') {
    return {
      eligible: false,
      reason: 'ineligible_mode'
    };
  }

  if (!firstAttempt) {
    return {
      eligible: false,
      reason: 'ineligible_non_first_attempt'
    };
  }

  if (mode === 'delayedCheck' && hintLevel !== HINT_LEVEL.NONE) {
    return {
      eligible: false,
      reason: 'ineligible_hinted'
    };
  }

  if (!cardId || cardId.trim().length === 0) {
    return {
      eligible: false,
      reason: 'ineligible_missing_card'
    };
  }

  if (kind !== undefined && kind !== 'scheduled' && kind !== 'new') {
    return {
      eligible: false,
      reason: 'ineligible_review_kind'
    };
  }

  return {
    eligible: true,
    reason:
      mode === 'scheduledReview'
        ? 'eligible_scheduled_review'
        : 'eligible_delayed_check'
  };
}

/**
 * Evaluates the combined `TrialContext` gate AND `ReviewKind` gate to produce the
 * final FSRS application decision.
 */
export function deriveFsrsApplicationDecision(
  context: Pick<TrialContext, 'mode' | 'firstAttempt' | 'hintLevel' | 'cardId'>,
  kind: ReviewKind
): FsrsEligibilityDecision {
  return deriveFsrsEligibility({
    ...context,
    kind
  });
}

/**
 * Pure boolean helper evaluating whether a `TrialContext` (or eligibility input) is
 * eligible for FSRS grading. Always derives the result from the authoritative policy
 * rather than trusting an arbitrary caller-supplied `gradeableByFsrs` flag.
 */
export function isTrialFsrsEligible(
  context: FsrsEligibilityInput
): boolean {
  return deriveFsrsEligibility(context).eligible;
}

export interface CreateTrialContextParams {
  mode: TrialMode;
  sessionId: string;
  cardId?: string;
  itemId?: string;
  hintLevel?: HintLevel;
  firstAttempt: boolean;
  inputMethod?: TrialInputMethod;
  contextId?: string;
}

/**
 * Constructs a `TrialContext` whose `gradeableByFsrs` field is always derived from
 * `deriveFsrsEligibility(...)`.
 */
export function createTrialContext(
  params: CreateTrialContextParams
): TrialContext {
  const hintLevel = params.hintLevel ?? HINT_LEVEL.NONE;
  const inputMethod = params.inputMethod ?? 'screen';
  const itemId = params.itemId ?? params.cardId;
  const eligibility = deriveFsrsEligibility({
    mode: params.mode,
    firstAttempt: params.firstAttempt,
    hintLevel,
    cardId: params.cardId
  });

  return {
    mode: params.mode,
    sessionId: params.sessionId,
    cardId: params.cardId,
    itemId,
    hintLevel,
    firstAttempt: params.firstAttempt,
    inputMethod,
    contextId: params.contextId,
    gradeableByFsrs: eligibility.eligible
  };
}

/**
 * Re-validates an existing `TrialContext` and enforces that `gradeableByFsrs` matches
 * the derived policy decision so callers cannot bypass the FSRS boundary by passing
 * `{ gradeableByFsrs: true }` on an ineligible trial.
 */
export function normalizeTrialContext(context: TrialContext): TrialContext {
  const eligibility = deriveFsrsEligibility(context);
  if (context.gradeableByFsrs === eligibility.eligible) {
    return context;
  }
  return {
    ...context,
    gradeableByFsrs: eligibility.eligible
  };
}

/**
 * Determines whether a trial should update `Card.stats` on a standard `Card`.
 *
 * Acquisition trials (`model`, `guided`, `qualify`, `mixedRetrieval`, `transfer`),
 * corrective retries (`corrective`), diagnostic Cold Tests (`coldTest`), and hinted/ineligible
 * `delayedCheck` or `ReviewKind`-mismatched attempts must NOT pollute `Card.stats`.
 */
export function isTrialCardStatsEligible(
  context: TrialContext,
  kind: ReviewKind
): boolean {
  const normalized = normalizeTrialContext(context);
  if (!normalized.firstAttempt) {
    return false;
  }

  if (normalized.mode === 'scheduledReview' || normalized.mode === 'delayedCheck') {
    return deriveFsrsApplicationDecision(normalized, kind).eligible;
  }

  if (normalized.mode === 'freePractice') {
    return kind === 'practice' || kind === 'confusion';
  }

  return false;
}

/**
 * TEMPORARY LEGACY ADAPTER (compatibility bridge until Milestone 3B/3C):
 * Maps the existing `ReviewKind` + `firstAttempt` into the corresponding `TrialMode`.
 *
 * Mapping for current legacy runtime:
 * - `!firstAttempt`      -> `'corrective'`
 * - `kind === 'scheduled'` -> `'scheduledReview'`
 * - `kind === 'new'`       -> `'delayedCheck'`
 * - `kind === 'practice'`  -> `'freePractice'`
 * - `kind === 'confusion'` -> `'freePractice'`
 * - `kind === 'cold'`      -> `'coldTest'`
 * - `kind === 'lesson'`    -> `'guided'`
 */
export function legacyReviewKindToTrialMode(
  kind: ReviewKind,
  firstAttempt = true
): TrialMode {
  if (!firstAttempt) {
    return 'corrective';
  }
  switch (kind) {
    case 'scheduled':
      return 'scheduledReview';
    case 'new':
      return 'delayedCheck';
    case 'practice':
    case 'confusion':
      return 'freePractice';
    case 'cold':
      return 'coldTest';
    case 'lesson':
      return 'guided';
    case 'transfer':
      return 'transfer';
  }
}

export interface CreateLegacyTrialContextParams {
  kind: ReviewKind;
  sessionId: string;
  cardId?: string;
  itemId?: string;
  firstAttempt?: boolean;
  hintLevel?: HintLevel;
  inputMethod?: TrialInputMethod;
  contextId?: string;
}

/**
 * TEMPORARY LEGACY ADAPTER (compatibility bridge until Milestone 3B/3C):
 * Creates a `TrialContext` from legacy Training parameters so current Training
 * behaviour remains unchanged while enforcing the new `TrialContext` FSRS boundary.
 */
export function createLegacyTrialContext(
  params: CreateLegacyTrialContextParams
): TrialContext {
  const firstAttempt = params.firstAttempt ?? true;
  const hintLevel = params.hintLevel ?? HINT_LEVEL.NONE;
  const mode = legacyReviewKindToTrialMode(params.kind, firstAttempt);

  return createTrialContext({
    mode,
    sessionId: params.sessionId,
    cardId: params.cardId,
    itemId: params.itemId ?? params.cardId,
    hintLevel,
    firstAttempt,
    inputMethod: params.inputMethod ?? 'screen',
    contextId: params.contextId
  });
}
