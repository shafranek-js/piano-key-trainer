import { DISPLAY_NAMES } from '../fsrs/constants';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import type {
  Card,
  NoteName,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../fsrs/types';
import {
  canUseInputForSkill,
  type InputChannel
} from '../input/inputPolicy';
import {
  appendUniqueContext,
  createInitialLearningProgress,
  markFsrsActivated,
  markMixReady,
  recordGuidedAttempt,
  recordIndependentAttempt,
  recordModelCompleted
} from './progress';
import { GRADED_FAILURE_CONTEXT, createTrialContext, hasPendingDelayedRetry, isDelayedCheckFirstAttempt } from './trialPolicy';
import {
  HINT_LEVEL,
  type HintLevel,
  type LearningProgressRecord,
  type TrialContext,
  type TrialInputMethod,
  type TrialMode
} from './types';

export type FirstRunCfStep =
  | 'orientation'
  | 'cModel'
  | 'cGuided'
  | 'cQualify'
  | 'fModel'
  | 'fGuided'
  | 'fQualify'
  | 'cfMix'
  | 'cfIdentify'
  | 'delayedC'
  | 'delayedF'
  | 'complete';

export type FirstRunAnchorNote = 'C' | 'F';

export const FIRST_RUN_CF_STEPS: readonly FirstRunCfStep[] = [
  'orientation',
  'cModel',
  'cGuided',
  'cQualify',
  'fModel',
  'fGuided',
  'fQualify',
  'cfMix',
  'cfIdentify',
  'delayedC',
  'delayedF',
  'complete'
] as const;

export const FIRST_RUN_CF_TOTAL_ACTIVE_STEPS = 11;

export const FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET = 2;

// HYPOTHESIS default; tune using retention telemetry
export const CF_MIX_SUCCESS_TARGET = 4;

/**
 * The on-screen 4-octave keyboard (C2–C6) ends at C6, where C#6 + D#6 are not visible.
 * First-run C landmark modeling and qualifying contexts therefore use C2–C5 only.
 */
export const FIRST_RUN_C_LANDMARK_KEY_IDS = ['C2', 'C3', 'C4', 'C5'] as const;

export const FIRST_RUN_F_LANDMARK_KEY_IDS = ['F2', 'F3', 'F4', 'F5'] as const;

export const FIRST_RUN_VALID_C_QUALIFY_CONTEXTS = [
  'region-C2',
  'region-C3',
  'region-C4',
  'region-C5'
] as const;

export function isValidFirstRunCContext(regionCtx: string): boolean {
  return (FIRST_RUN_VALID_C_QUALIFY_CONTEXTS as readonly string[]).includes(
    regionCtx
  );
}

export const FIRST_RUN_CF_ITEM_IDS = {
  GROUPS_2_3: 'keyboard-geometry:groups-2-3',
  ANCHOR_C: 'keyboard-anchor:C',
  ANCHOR_F: 'keyboard-anchor:F',
  CONTRAST_CF: 'keyboard-contrast:C-F',
  IDENTIFY_CF: 'keyboard-identify:C-F'
} as const;

export const FIRST_RUN_CF_ALL_ITEM_IDS: readonly string[] = [
  FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3,
  FIRST_RUN_CF_ITEM_IDS.ANCHOR_C,
  FIRST_RUN_CF_ITEM_IDS.ANCHOR_F,
  FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
  FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF
] as const;

export type FirstRunCfEntryReason =
  | 'start'
  | 'resume'
  | 'skip_completed'
  | 'skip_legacy';

export interface FirstRunCfEntryDecision {
  shouldEnter: boolean;
  reason: FirstRunCfEntryReason;
}

export interface FirstRunCfEntryInput {
  cards?: readonly Pick<Card, 'reps' | 'firstSeenAt' | 'stats'>[];
  reviewLogs?: readonly unknown[];
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[];
  lessonProgress?:
    | ReadonlyMap<string, { completed?: boolean; passed?: boolean }>
    | readonly { completed?: boolean; passed?: boolean }[];
  coldTests?: readonly unknown[];
}

function toProgressMap(
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
): Map<string, LearningProgressRecord> {
  if (!learningProgress) return new Map();
  if (learningProgress instanceof Map) {
    return new Map(learningProgress);
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const item of learningProgress as readonly LearningProgressRecord[]) {
    if (item && typeof item.id === 'string') {
      map.set(item.id, item);
    }
  }
  return map;
}

/**
 * Extracts only the unhinted (`H0`) regional contexts (`region-C2`..`region-C5`, `region-F2`..`region-F5`)
 * from an anchor's `LearningProgressRecord.contexts` array, excluding `guided:` or `model:`
 * context prefixes and excluding the right-edge `region-C6` (which has no visible black-key pair).
 */
export function getUnhintedAnchorContexts(
  record: LearningProgressRecord | undefined
): string[] {
  if (!record || !Array.isArray(record.contexts)) return [];
  return record.contexts.filter(
    ctx =>
      !ctx.startsWith('guided:') &&
      !ctx.startsWith('model:') &&
      ctx !== 'region-C6'
  );
}

/**
 * Checks whether all first-run C/F milestones have been completed in `learningProgress`.
 */
export function isFirstRunCfCompleted(
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
): boolean {
  const map = toProgressMap(learningProgress);
  const anchorC = map.get(FIRST_RUN_CF_ITEM_IDS.ANCHOR_C);
  const anchorF = map.get(FIRST_RUN_CF_ITEM_IDS.ANCHOR_F);
  const identify = map.get(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF);

  return (
    !!anchorC &&
    anchorC.state === 'retention' &&
    !!anchorF &&
    anchorF.state === 'retention' &&
    !!identify &&
    (identify.state === 'mixReady' || identify.state === 'retention')
  );
}

/**
 * Checks whether any first-run item has partial/in-progress state in `learningProgress`
 * without the full first-run flow being completed yet.
 */
export function hasIncompleteFirstRunCfProgress(
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
): boolean {
  const map = toProgressMap(learningProgress);
  if (isFirstRunCfCompleted(map)) return false;

  for (const id of FIRST_RUN_CF_ALL_ITEM_IDS) {
    const rec = map.get(id);
    if (!rec) continue;
    if (
      rec.state !== 'unseen' ||
      rec.modelCompleted ||
      rec.guidedSuccesses > 0 ||
      rec.independentUnhintedSuccesses > 0 ||
      rec.contexts.length > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether the profile already has meaningful legacy progress that should bypass
 * automatic first-run onboarding.
 */
export function hasMeaningfulLegacyProgress(
  input: FirstRunCfEntryInput
): boolean {
  if (input.reviewLogs && input.reviewLogs.length > 0) {
    return true;
  }
  if (
    input.cards &&
    input.cards.some(
      c =>
        c.reps > 0 ||
        c.firstSeenAt > 0 ||
        (c.stats && c.stats.trials > 0)
    )
  ) {
    return true;
  }
  if (input.coldTests && input.coldTests.length > 0) {
    return true;
  }
  if (input.lessonProgress) {
    const values =
      input.lessonProgress instanceof Map
        ? Array.from(input.lessonProgress.values())
        : Array.from(
            input.lessonProgress as readonly {
              completed?: boolean;
              passed?: boolean;
            }[]
          );
    if (values.some(l => Boolean(l?.completed) || Boolean(l?.passed))) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates whether the user should enter the First-Run C/F Guided Learning flow
 * and returns both the boolean decision and the canonical reason:
 * - `'skip_completed'` if first-run is already complete in `learningProgress`
 * - `'resume'` if incomplete first-run progress exists in `learningProgress`
 * - `'skip_legacy'` if meaningful legacy progress exists (`reviewLogs`, `cards`, `lessonProgress`, `coldTests`)
 * - `'start'` for a brand-new user (or after `Reset all progress`)
 */
export function evaluateFirstRunCfEntry(
  input: FirstRunCfEntryInput
): FirstRunCfEntryDecision {
  if (isFirstRunCfCompleted(input.learningProgress)) {
    return { shouldEnter: false, reason: 'skip_completed' };
  }
  if (hasIncompleteFirstRunCfProgress(input.learningProgress)) {
    return { shouldEnter: true, reason: 'resume' };
  }
  if (hasMeaningfulLegacyProgress(input)) {
    return { shouldEnter: false, reason: 'skip_legacy' };
  }
  return { shouldEnter: true, reason: 'start' };
}

/**
 * Boolean convenience wrapper around `evaluateFirstRunCfEntry(...)`.
 */
export function shouldEnterFirstRunCf(input: FirstRunCfEntryInput): boolean {
  return evaluateFirstRunCfEntry(input).shouldEnter;
}

/**
 * Resolves the active skill for a given `FirstRunCfStep` so input routing can delegate
 * directly to Milestone 1's `canUseInputForSkill(...)`.
 */
export function getFirstRunStepSkill(step: FirstRunCfStep): Skill | null {
  switch (step) {
    case 'cModel':
    case 'cGuided':
    case 'cQualify':
    case 'fModel':
    case 'fGuided':
    case 'fQualify':
    case 'cfMix':
    case 'delayedC':
    case 'delayedF':
      return 'find';
    case 'cfIdentify':
      return 'identify';
    case 'orientation':
    case 'complete':
      return null;
  }
}

/**
 * Enforces Milestone 1's authoritative input matrix for the active `FirstRunCfStep`.
 */
export function canUseInputForFirstRunStep(
  step: FirstRunCfStep,
  channel: InputChannel
): boolean {
  const skill = getFirstRunStepSkill(step);
  if (!skill) return false;
  return canUseInputForSkill(skill, channel);
}

/**
 * Single source of truth for whether the 'Don't know' action (and Enter shortcut for it)
 * is allowed in the current first-run step/state.
 * - Allowed only in active unhinted retrieval steps (`cQualify`, `fQualify`, `cfMix`, `cfIdentify`, `delayedC`, `delayedF`)
 * - Disallowed in `orientation`, `cModel`, `cGuided`, `fModel`, `fGuided`, `complete`,
 *   and whenever a corrective or remediation press is already active.
 */
export function canUseDontKnowInFirstRunStep(
  stepOrState:
    | FirstRunCfStep
    | Pick<
        FirstRunCfState,
        'step' | 'awaitingCorrective' | 'awaitingRemediationPress'
      >
): boolean {
  const step =
    typeof stepOrState === 'string' ? stepOrState : stepOrState.step;
  const awaitingCorrective =
    typeof stepOrState === 'string'
      ? false
      : Boolean(stepOrState.awaitingCorrective);
  const awaitingRemediationPress =
    typeof stepOrState === 'string'
      ? false
      : Boolean(stepOrState.awaitingRemediationPress);

  if (awaitingCorrective || awaitingRemediationPress) {
    return false;
  }

  switch (step) {
    case 'cQualify':
    case 'fQualify':
    case 'cfMix':
    case 'cfIdentify':
    case 'delayedC':
    case 'delayedF':
      return true;
    case 'orientation':
    case 'cModel':
    case 'cGuided':
    case 'fModel':
    case 'fGuided':
    case 'complete':
      return false;
  }
}

export type FirstRunKeydownCommand =
  | { type: 'continue' }
  | { type: 'completeFirstRun' }
  | { type: 'dontKnow' }
  | null;

/**
 * Resolves Enter / Space keyboard shortcuts during First-Run C/F Guided Learning:
 * - `orientation`: Enter / Space -> `{ type: 'continue' }`
 * - `complete`: Enter / Space -> `{ type: 'completeFirstRun' }`
 * - steps where 'Don't know' is visible: Enter -> `{ type: 'dontKnow' }`
 * - `cModel`, `cGuided`, `fModel`, `fGuided` (where 'Don't know' is hidden): `null`
 */
export function resolveFirstRunKeydownAction(
  state: Pick<
    FirstRunCfState,
    'step' | 'awaitingCorrective' | 'awaitingRemediationPress'
  >,
  key: string,
  code?: string
): FirstRunKeydownCommand {
  const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
  const isEnter = key === 'Enter' || code === 'Enter';

  if (!isSpace && !isEnter) {
    return null;
  }

  if (state.step === 'orientation') {
    return { type: 'continue' };
  }

  if (state.step === 'complete') {
    return { type: 'completeFirstRun' };
  }

  if (isEnter && canUseDontKnowInFirstRunStep(state)) {
    return { type: 'dontKnow' };
  }

  return null;
}

export interface FirstRunTimingPolicy {
  hasSessionCountdown: false;
  hasAutoAdvanceTimer: false;
  usesLatencyGrading: false;
  progressMode: 'milestone_step';
}

/**
 * Returns the explicit timing & progress policy for First-Run Guided Learning:
 * no countdown timer, no auto-advance timer, no latency grading, and milestone/step-based progress.
 */
export function getFirstRunTimingPolicy(
  _step?: FirstRunCfStep
): FirstRunTimingPolicy {
  return {
    hasSessionCountdown: false,
    hasAutoAdvanceTimer: false,
    usesLatencyGrading: false,
    progressMode: 'milestone_step'
  };
}

export interface FirstRunDiagramSpec {
  kind: 'orientation' | 'landmark' | 'none';
  blackGroupSize: 2 | 3 | null;
  highlightTargetWhite: boolean;
  targetWhiteLabel: string | null;
  groupTitle: string | null;
  caption: string | null;
}

/**
 * Derives the central pedagogical mini-diagram specification for `FirstRunStage.svelte`
 * while strictly enforcing the HintLevel contract:
 * - H3 (`cModel`, `fModel`): target white key is highlighted and labeled (`C · До` / `F · Фа`),
 *   and the relevant black-key group is highlighted.
 * - H2 (`cGuided`, `fGuided`, and remediation/corrective in `cQualify`, `fQualify`,
 *   `cfMix`, `cfIdentify`, `delayedC`, `delayedF`): ONLY the relevant black-key group
 *   is highlighted; the target white key remains neutral (`highlightTargetWhite: false`)
 *   with NO `C/F` label (`targetWhiteLabel: null`).
 * - H0: no landmark diagram (`kind: 'none'`).
 */
export function getFirstRunDiagramSpec(
  state: Pick<
    FirstRunCfState,
    | 'step'
    | 'targetNote'
    | 'hintLevel'
    | 'awaitingCorrective'
    | 'awaitingRemediationPress'
  >
): FirstRunDiagramSpec {
  if (state.step === 'orientation') {
    return {
      kind: 'orientation',
      blackGroupSize: null,
      highlightTargetWhite: false,
      targetWhiteLabel: null,
      groupTitle: null,
      caption: null
    };
  }

  if (state.step === 'cModel') {
    return {
      kind: 'landmark',
      blackGroupSize: 2,
      highlightTargetWhite: true,
      targetWhiteLabel: 'C · До',
      groupTitle: 'Группа из 2 чёрных',
      caption: '← слева от 2 чёрных'
    };
  }

  if (state.step === 'fModel') {
    return {
      kind: 'landmark',
      blackGroupSize: 3,
      highlightTargetWhite: true,
      targetWhiteLabel: 'F · Фа',
      groupTitle: 'Группа из 3 чёрных',
      caption: '← слева от 3 чёрных'
    };
  }

  const isH2GuidedOrRemediation =
    state.step === 'cGuided' ||
    state.step === 'fGuided' ||
    state.awaitingCorrective ||
    state.awaitingRemediationPress ||
    state.hintLevel === HINT_LEVEL.VISUAL_CUE;

  if (isH2GuidedOrRemediation && state.targetNote) {
    const isC = state.targetNote === 'C';
    return {
      kind: 'landmark',
      blackGroupSize: isC ? 2 : 3,
      highlightTargetWhite: false,
      targetWhiteLabel: null,
      groupTitle: isC ? 'Группа из 2 чёрных' : 'Группа из 3 чёрных',
      caption: 'белая сразу слева'
    };
  }

  return {
    kind: 'none',
    blackGroupSize: null,
    highlightTargetWhite: false,
    targetWhiteLabel: null,
    groupTitle: null,
    caption: null
  };
}

/**
 * Maps a pressed key or explicit context string to an internal octave/region context ID
 * (`'region-C2'`, `'region-C3'`, `'region-C4'`, `'region-C5'`, `'region-C6'`, etc.)
 * without exposing octave numbers in the UI.
 */
export function resolveFirstRunRegionContext(
  note: NoteName,
  keyId?: string | null,
  explicitContextId?: string
): string {
  if (explicitContextId && explicitContextId.trim().length > 0) {
    return explicitContextId.trim();
  }
  if (keyId && keyId.trim().length > 0) {
    const trimmed = keyId.trim();
    if (trimmed.startsWith('region-')) {
      return trimmed;
    }
    const match = /^([A-G]#?)(\d)$/i.exec(trimmed);
    if (match) {
      return `region-${note}${match[2]}`;
    }
  }
  return `region-${note}4`;
}

/**
 * Builds the initial constrained C/F mix sequence.
 * Uses a non-mechanical 2+2 contrast pattern (`['C', 'F', 'F', 'C']`) so the learner
 * cannot rely on blind `C-F-C-F` alternation while avoiding any `CCC` or `FFF` blocks.
 */
export function buildInitialCfMixQueue(): FirstRunAnchorNote[] {
  return ['C', 'F', 'F', 'C'];
}

/**
 * Validates that a C/F mix sequence:
 * - contains only `'C'` and `'F'`,
 * - never contains 3 or more identical notes in a row (`CCC` / `FFF`),
 * - is not purely alternating `CFCFCF...` when length >= 4.
 */
export function isConstrainedCfMixSequence(
  sequence: readonly FirstRunAnchorNote[]
): boolean {
  if (sequence.length === 0) return false;
  for (let i = 0; i < sequence.length; i++) {
    const note = sequence[i];
    if (note !== 'C' && note !== 'F') return false;
    if (
      i >= 2 &&
      sequence[i - 1] === note &&
      sequence[i - 2] === note
    ) {
      return false;
    }
  }
  if (sequence.length >= 4) {
    let strictlyAlternating = true;
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] === sequence[i - 1]) {
        strictlyAlternating = false;
        break;
      }
    }
    if (strictlyAlternating) return false;
  }
  return true;
}

/**
 * Schedules a missed note in `cfMix` to reappear after at least one intervening opposite note
 * while preserving the max-2-consecutive constraint.
 */
export function scheduleMissedMixNote(
  remainingQueue: readonly FirstRunAnchorNote[],
  missedNote: FirstRunAnchorNote
): FirstRunAnchorNote[] {
  const opposite: FirstRunAnchorNote = missedNote === 'C' ? 'F' : 'C';
  const next = [...remainingQueue];

  if (next.length === 0) {
    return [opposite, missedNote];
  }

  // Ensure the immediate next item is an intervening trial if possible
  if (next[0] === missedNote) {
    next.unshift(opposite);
  }

  // Ensure `missedNote` appears right after the first intervening item
  if (next[1] !== missedNote) {
    next.splice(1, 0, missedNote);
  }

  // Sanitize any accidental 3-in-a-row runs
  const sanitized: FirstRunAnchorNote[] = [];
  for (const item of next) {
    const len = sanitized.length;
    if (len >= 2 && sanitized[len - 1] === item && sanitized[len - 2] === item) {
      sanitized.push(item === 'C' ? 'F' : 'C');
    }
    sanitized.push(item);
  }
  return sanitized;
}

export interface FirstRunCfState {
  step: FirstRunCfStep;
  progress: Record<string, LearningProgressRecord>;
  targetNote: FirstRunAnchorNote | null;
  identifyTargetKeyId: string | null;
  structuralGuideKeyIds: string[];
  modelLabelKeyIds: string[];
  hintLevel: HintLevel;
  trialMode: TrialMode;
  awaitingCorrective: boolean;
  awaitingRemediationPress: boolean;
  isInterveningRecall: boolean;
  mixQueue: FirstRunAnchorNote[];
  mixHistory: FirstRunAnchorNote[];
  mixCSuccesses: number;
  mixFSuccesses: number;
  mixCContexts: string[];
  mixFContexts: string[];
  identifyQueue: FirstRunAnchorNote[];
  identifyCompletedNotes: FirstRunAnchorNote[];
  delayedQueue: FirstRunAnchorNote[];
  delayedCompletedNotes: FirstRunAnchorNote[];
  feedbackText: string;
  feedbackTone: 'good' | 'warn' | 'bad' | '';
}

export function deriveFirstRunCfStepFromProgress(
  progress: Record<string, LearningProgressRecord>
): FirstRunCfStep {
  const groups = progress[FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3];
  if (!groups || !groups.modelCompleted) {
    return 'orientation';
  }

  const anchorC = progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C];
  if (!anchorC || !anchorC.modelCompleted) {
    return 'cModel';
  }
  if (anchorC.guidedSuccesses < 1) {
    return 'cGuided';
  }
  if (
    getUnhintedAnchorContexts(anchorC).length <
      FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET ||
    anchorC.independentUnhintedSuccesses < FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET
  ) {
    return 'cQualify';
  }

  const anchorF = progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_F];
  if (!anchorF || !anchorF.modelCompleted) {
    return 'fModel';
  }
  if (anchorF.guidedSuccesses < 1) {
    return 'fGuided';
  }
  if (
    getUnhintedAnchorContexts(anchorF).length <
      FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET ||
    anchorF.independentUnhintedSuccesses < FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET
  ) {
    return 'fQualify';
  }

  const contrast = progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF];
  if (
    !contrast ||
    (contrast.state !== 'mixReady' && contrast.state !== 'retention') ||
    contrast.independentUnhintedSuccesses < CF_MIX_SUCCESS_TARGET
  ) {
    return 'cfMix';
  }

  const identify = progress[FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF];
  if (
    !identify ||
    (identify.state !== 'mixReady' && identify.state !== 'retention') ||
    identify.independentUnhintedSuccesses < 2
  ) {
    return 'cfIdentify';
  }

  if (anchorC.state !== 'retention') {
    return 'delayedC';
  }
  if (anchorF.state !== 'retention') {
    return 'delayedF';
  }

  return 'complete';
}

function getStepVisualConfig(
  step: FirstRunCfStep,
  statePatch: Pick<
    FirstRunCfState,
    | 'mixQueue'
    | 'identifyQueue'
    | 'awaitingCorrective'
    | 'awaitingRemediationPress'
    | 'isInterveningRecall'
  >
): Pick<
  FirstRunCfState,
  | 'targetNote'
  | 'identifyTargetKeyId'
  | 'structuralGuideKeyIds'
  | 'modelLabelKeyIds'
  | 'hintLevel'
  | 'trialMode'
> {
  switch (step) {
    case 'orientation':
      return {
        targetNote: null,
        identifyTargetKeyId: null,
        structuralGuideKeyIds: [
          'C#3',
          'D#3',
          'F#3',
          'G#3',
          'A#3',
          'C#4',
          'D#4',
          'F#4',
          'G#4',
          'A#4'
        ],
        modelLabelKeyIds: [],
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        trialMode: 'model'
      };

    case 'cModel':
      return {
        targetNote: 'C',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: [
          'C#2',
          'D#2',
          'C#3',
          'D#3',
          'C#4',
          'D#4',
          'C#5',
          'D#5'
        ],
        modelLabelKeyIds: [...FIRST_RUN_C_LANDMARK_KEY_IDS],
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        trialMode: 'model'
      };

    case 'cGuided':
      return {
        targetNote: 'C',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: ['C#4', 'D#4'],
        modelLabelKeyIds: [],
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        trialMode: 'guided'
      };

    case 'cQualify': {
      const showGuide =
        statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;
      return {
        targetNote: 'C',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: showGuide ? ['C#4', 'D#4'] : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective ? 'corrective' : 'qualify'
      };
    }

    case 'fModel':
      return {
        targetNote: 'F',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: [
          'F#2',
          'G#2',
          'A#2',
          'F#3',
          'G#3',
          'A#3',
          'F#4',
          'G#4',
          'A#4',
          'F#5',
          'G#5',
          'A#5'
        ],
        modelLabelKeyIds: [...FIRST_RUN_F_LANDMARK_KEY_IDS],
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        trialMode: 'model'
      };

    case 'fGuided':
      return {
        targetNote: 'F',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: ['F#4', 'G#4', 'A#4'],
        modelLabelKeyIds: [],
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        trialMode: 'guided'
      };

    case 'fQualify': {
      const showGuide =
        statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;
      return {
        targetNote: 'F',
        identifyTargetKeyId: null,
        structuralGuideKeyIds: showGuide ? ['F#4', 'G#4', 'A#4'] : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective ? 'corrective' : 'qualify'
      };
    }

    case 'cfMix': {
      const targetNote = statePatch.mixQueue[0] ?? 'C';
      const showGuide =
        statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;
      return {
        targetNote,
        identifyTargetKeyId: null,
        structuralGuideKeyIds: showGuide
          ? targetNote === 'C'
            ? ['C#4', 'D#4']
            : ['F#4', 'G#4', 'A#4']
          : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective
          ? 'corrective'
          : 'mixedRetrieval'
      };
    }

    case 'cfIdentify': {
      const targetNote = statePatch.identifyQueue[0] ?? 'C';
      const showGuide =
        statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;
      return {
        targetNote,
        identifyTargetKeyId: targetNote === 'C' ? 'C4' : 'F4',
        structuralGuideKeyIds: showGuide
          ? targetNote === 'C'
            ? ['C#4', 'D#4']
            : ['F#4', 'G#4', 'A#4']
          : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective
          ? 'corrective'
          : 'mixedRetrieval'
      };
    }

    case 'delayedC':
    case 'delayedF': {
      const primaryNote: FirstRunAnchorNote = step === 'delayedC' ? 'C' : 'F';
      const activeNote: FirstRunAnchorNote = statePatch.isInterveningRecall
        ? primaryNote === 'C'
          ? 'F'
          : 'C'
        : primaryNote;
      const showGuide =
        statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;
      return {
        targetNote: activeNote,
        identifyTargetKeyId: null,
        structuralGuideKeyIds: showGuide
          ? activeNote === 'C'
            ? ['C#4', 'D#4']
            : ['F#4', 'G#4', 'A#4']
          : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective
          ? 'corrective'
          : statePatch.isInterveningRecall
            ? 'mixedRetrieval'
            : 'delayedCheck'
      };
    }

    case 'complete':
      return {
        targetNote: null,
        identifyTargetKeyId: null,
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        hintLevel: HINT_LEVEL.NONE,
        trialMode: 'model'
      };
  }
}

/**
 * Creates a fresh or resumed `FirstRunCfState` from existing `learningProgress` records.
 */
export function createFirstRunCfState(
  existingProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[],
  now = 0
): FirstRunCfState {
  const map = toProgressMap(existingProgress);
  const progress: Record<string, LearningProgressRecord> = {};

  for (const itemId of FIRST_RUN_CF_ALL_ITEM_IDS) {
    const found = map.get(itemId);
    progress[itemId] = found
      ? { ...found, contexts: [...found.contexts] }
      : createInitialLearningProgress(itemId, now);
  }

  const step = deriveFirstRunCfStepFromProgress(progress);
  const contrast = progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF];
  const identify = progress[FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF];
  const anchorC = progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C];
  const anchorF = progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_F];

  // Reconstruct partial cfMix state from persistent C:... / F:... contrast contexts
  const mixCContexts = getUnhintedAnchorContexts(anchorC);
  const mixFContexts = getUnhintedAnchorContexts(anchorF);
  const savedMixSuccesses = contrast?.independentUnhintedSuccesses ?? 0;
  const baseMixQueue = buildInitialCfMixQueue();

  const parsedMixHistory: FirstRunAnchorNote[] = [];
  let mixCSuccesses = 0;
  let mixFSuccesses = 0;

  for (const ctx of contrast?.contexts ?? []) {
    if (ctx.startsWith('C:')) {
      mixCSuccesses += 1;
      parsedMixHistory.push('C');
    } else if (ctx.startsWith('F:')) {
      mixFSuccesses += 1;
      parsedMixHistory.push('F');
    }
  }

  if (parsedMixHistory.length === 0 && savedMixSuccesses > 0) {
    for (const note of baseMixQueue.slice(0, savedMixSuccesses)) {
      parsedMixHistory.push(note);
      if (note === 'C') mixCSuccesses += 1;
      else mixFSuccesses += 1;
    }
  }

  const remainingMixQueue = [...baseMixQueue];
  for (const completedNote of parsedMixHistory) {
    const idx = remainingMixQueue.indexOf(completedNote);
    if (idx >= 0) {
      remainingMixQueue.splice(idx, 1);
    }
  }
  if (
    remainingMixQueue.length === 0 &&
    mixCSuccesses + mixFSuccesses < CF_MIX_SUCCESS_TARGET
  ) {
    remainingMixQueue.push(
      chooseNextMixNote(parsedMixHistory, mixCSuccesses, mixFSuccesses)
    );
  }

  // Reconstruct partial cfIdentify state if resuming mid-cfIdentify
  const identifyCompletedNotes: FirstRunAnchorNote[] = [];
  if (identify?.contexts.includes('identify:C')) {
    identifyCompletedNotes.push('C');
  }
  if (identify?.contexts.includes('identify:F')) {
    identifyCompletedNotes.push('F');
  }
  const identifyQueue: FirstRunAnchorNote[] = (
    ['C', 'F'] as FirstRunAnchorNote[]
  ).filter(n => !identifyCompletedNotes.includes(n));
  if (identifyQueue.length === 0) {
    identifyQueue.push('C', 'F');
  }

  // Reconstruct delayedQueue
  const delayedCompletedNotes: FirstRunAnchorNote[] = [];
  if (anchorC?.state === 'retention') delayedCompletedNotes.push('C');
  if (anchorF?.state === 'retention') delayedCompletedNotes.push('F');
  const delayedQueue: FirstRunAnchorNote[] = (
    ['C', 'F'] as FirstRunAnchorNote[]
  ).filter(n => !delayedCompletedNotes.includes(n));

  // A failed anchor keeps `pending:delayedRetry`; resume its corrective remediation after reload.
  const pendingAnchorNote: FirstRunAnchorNote | null =
    anchorC.contexts.includes('pending:delayedRetry')
      ? 'C'
      : anchorF.contexts.includes('pending:delayedRetry')
        ? 'F'
        : null;
  const resumeRemediation = Boolean(pendingAnchorNote) && (step === 'delayedC' || step === 'delayedF');
  const orderedDelayedQueue: FirstRunAnchorNote[] = pendingAnchorNote
    ? [pendingAnchorNote, ...delayedQueue.filter(n => n !== pendingAnchorNote)]
    : delayedQueue;
  const resumeVisuals = getStepVisualConfig(step, {
    mixQueue: remainingMixQueue,
    identifyQueue,
    awaitingCorrective: resumeRemediation,
    awaitingRemediationPress: false,
    isInterveningRecall: false
  });

  return {
    step,
    progress,
    ...resumeVisuals,
    awaitingCorrective: resumeRemediation,
    awaitingRemediationPress: false,
    isInterveningRecall: false,
    mixQueue: remainingMixQueue,
    mixHistory: parsedMixHistory,
    mixCSuccesses,
    mixFSuccesses,
    mixCContexts,
    mixFContexts,
    identifyQueue,
    identifyCompletedNotes,
    delayedQueue: orderedDelayedQueue,
    delayedCompletedNotes,
    feedbackText: '',
    feedbackTone: ''
  };
}

export interface FirstRunCfStepProgressInfo {
  step: FirstRunCfStep;
  stepNumber: number;
  totalSteps: number;
  progressPct: number;
  headerMeta: string;
  headerTitle: string;
  stepLabel: string;
}

/**
 * Returns SessionStrip metadata for the active `FirstRunCfStep`:
 * - `headerMeta`: `'ПЕРВЫЙ ЗАПУСК'`
 * - `headerTitle`: `'Знакомство с клавиатурой'`
 * - `stepLabel`: `'Шаг X из 11'`
 * - `progressPct`: `0..100`
 */
export function getFirstRunCfStepProgress(
  step: FirstRunCfStep
): FirstRunCfStepProgressInfo {
  const index = FIRST_RUN_CF_STEPS.indexOf(step);
  const stepNumber =
    step === 'complete'
      ? FIRST_RUN_CF_TOTAL_ACTIVE_STEPS
      : Math.min(
          FIRST_RUN_CF_TOTAL_ACTIVE_STEPS,
          Math.max(1, index + 1)
        );
  const progressPct =
    step === 'complete'
      ? 100
      : Math.round((stepNumber / FIRST_RUN_CF_TOTAL_ACTIVE_STEPS) * 100);

  return {
    step,
    stepNumber,
    totalSteps: FIRST_RUN_CF_TOTAL_ACTIVE_STEPS,
    progressPct,
    headerMeta: 'ПЕРВЫЙ ЗАПУСК',
    headerTitle: 'Знакомство с клавиатурой',
    stepLabel: `Шаг ${stepNumber} из ${FIRST_RUN_CF_TOTAL_ACTIVE_STEPS}`
  };
}

export type FirstRunCfAction =
  | {
      type: 'continue';
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'keyPress';
      note: NoteName;
      keyId?: string | null;
      contextId?: string;
      inputMethod?: TrialInputMethod;
      hintLevel?: HintLevel;
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'semanticAnswer';
      note: NoteName;
      channel: 'answerButton' | 'pcNote';
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'dontKnow';
      at?: number;
      sessionId?: string;
    };

export type FirstRunCfOutcome =
  | 'advanced'
  | 'progressed'
  | 'duplicate_context'
  | 'wrong_note'
  | 'corrective_completed'
  | 'remediation_activated'
  | 'remediation_completed'
  | 'ignored';

export interface FirstRunCfDelayedCheckPayload {
  cardId: 'find:C' | 'find:F';
  note: FirstRunAnchorNote;
  isCorrect: boolean;
  answer: NoteName | null;
  answerKeyId: string | null;
  trialContext: TrialContext;
}

export interface FirstRunCfTransitionResult {
  state: FirstRunCfState;
  updatedProgress: LearningProgressRecord[];
  trialContext: TrialContext | null;
  ignoredInput: boolean;
  outcome: FirstRunCfOutcome;
  fsrsDelayedCheck: FirstRunCfDelayedCheckPayload | null;
}

function transitionToStep(
  state: FirstRunCfState,
  nextStep: FirstRunCfStep,
  patches: Partial<FirstRunCfState> = {}
): FirstRunCfState {
  const merged = {
    ...state,
    ...patches,
    step: nextStep,
    awaitingCorrective: patches.awaitingCorrective ?? false,
    awaitingRemediationPress: patches.awaitingRemediationPress ?? false,
    isInterveningRecall: patches.isInterveningRecall ?? false
  };
  const visuals = getStepVisualConfig(nextStep, merged);
  return {
    ...merged,
    ...visuals
  };
}

function buildContrastErrorFeedback(
  expected: FirstRunAnchorNote,
  pressed: NoteName
): string {
  if (expected === 'C' && pressed === 'F') {
    return 'Это F — она слева от группы из 3 чёрных. Для C ищите группу из 2.';
  }
  if (expected === 'F' && pressed === 'C') {
    return 'Это C — она слева от группы из 2 чёрных. Для F ищите группу из 3.';
  }
  if (expected === 'C') {
    return `Это ${DISPLAY_NAMES[pressed]}. Для C ищите группу из 2 чёрных клавиш — белая сразу слева.`;
  }
  return `Это ${DISPLAY_NAMES[pressed]}. Для F ищите группу из 3 чёрных клавиш — белая сразу слева.`;
}

function chooseNextMixNote(
  mixHistory: readonly FirstRunAnchorNote[],
  mixCSuccesses: number,
  mixFSuccesses: number
): FirstRunAnchorNote {
  const len = mixHistory.length;
  if (len >= 2 && mixHistory[len - 1] === mixHistory[len - 2]) {
    return mixHistory[len - 1] === 'C' ? 'F' : 'C';
  }
  if (mixCSuccesses < mixFSuccesses) return 'C';
  if (mixFSuccesses < mixCSuccesses) return 'F';
  return mixHistory[len - 1] === 'C' ? 'F' : 'C';
}

/**
 * Pure state machine reducer for the First-Run C/F Guided Learning flow.
 */
export function advanceFirstRunCf(
  state: FirstRunCfState,
  action: FirstRunCfAction
): FirstRunCfTransitionResult {
  const at = action.at ?? Date.now();
  const sessionId = action.sessionId ?? 'first-run-cf';
  const progress = { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];

  const saveProgress = (record: LearningProgressRecord) => {
    progress[record.id] = record;
    const idx = updatedProgress.findIndex(p => p.id === record.id);
    if (idx >= 0) {
      updatedProgress[idx] = record;
    } else {
      updatedProgress.push(record);
    }
  };

  if (state.step === 'complete') {
    return {
      state,
      updatedProgress: [],
      trialContext: null,
      ignoredInput: true,
      outcome: 'ignored',
      fsrsDelayedCheck: null
    };
  }

  // 1. Orientation Continue
  if (action.type === 'continue') {
    if (state.step !== 'orientation') {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }

    const updatedGroups = recordModelCompleted(
      progress[FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3],
      at,
      'model:groups-2-3'
    );
    saveProgress(updatedGroups);

    const trialContext = createTrialContext({
      mode: 'model',
      sessionId,
      itemId: FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3,
      hintLevel: HINT_LEVEL.MODEL_VISIBLE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    const nextState = transitionToStep(
      { ...state, progress },
      'cModel',
      {
        feedbackText: '',
        feedbackTone: ''
      }
    );

    return {
      state: nextState,
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'advanced',
      fsrsDelayedCheck: null
    };
  }

  // 2. 'Don't Know' -> Supported Acquisition / Remediation (H2, NO FSRS)
  if (action.type === 'dontKnow') {
    if (!canUseDontKnowInFirstRunStep(state)) {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }

    const target = state.targetNote ?? 'C';
    const hintFeedback =
      state.step === 'cfIdentify'
        ? target === 'C'
          ? 'Подсказка: справа от этой клавиши подсвечена группа из 2 чёрных клавиш (2 чёрные → C, 3 чёрные → F).'
          : 'Подсказка: справа от этой клавиши подсвечена группа из 3 чёрных клавиш (2 чёрные → C, 3 чёрные → F).'
        : target === 'C'
          ? 'Подсказка: найдите подсвеченную группу из 2 чёрных клавиш и нажмите белую клавишу сразу слева.'
          : 'Подсказка: найдите подсвеченную группу из 3 чёрных клавиш и нажмите белую клавишу сразу слева.';

    const nextState = transitionToStep(state, state.step, {
      awaitingRemediationPress: true,
      feedbackText: hintFeedback,
      feedbackTone: 'warn'
    });

    const itemId =
      state.step === 'cfIdentify'
        ? FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF
        : state.step === 'cfMix'
          ? FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF
          : target === 'C'
            ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
            : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;

    const cardId =
      (state.step === 'delayedC' || state.step === 'delayedF') &&
      !state.isInterveningRecall
        ? (`find:${target}` as const)
        : undefined;

    const trialContext = createTrialContext({
      mode:
        state.step === 'delayedC' || state.step === 'delayedF'
          ? state.isInterveningRecall
            ? 'mixedRetrieval'
            : 'delayedCheck'
          : state.trialMode,
      sessionId,
      cardId,
      itemId,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      firstAttempt: true,
      inputMethod: 'screen'
    });

    return {
      state: nextState,
      updatedProgress: [],
      trialContext,
      ignoredInput: false,
      outcome: 'remediation_activated',
      fsrsDelayedCheck: null
    };
  }

  // 3. Enforce input routing matrix per step
  if (action.type === 'keyPress') {
    const channel: InputChannel =
      action.inputMethod === 'midi' ? 'midi' : 'pianoKey';
    if (!canUseInputForFirstRunStep(state.step, channel)) {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }
  } else if (action.type === 'semanticAnswer') {
    if (!canUseInputForFirstRunStep(state.step, action.channel)) {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }
  }

  const inputMethod: TrialInputMethod =
    action.type === 'keyPress'
      ? (action.inputMethod ?? 'screen')
      : action.channel === 'pcNote'
        ? 'pc'
        : 'answerButton';
  const pressedNote = action.note;
  const pressedKeyId = action.type === 'keyPress' ? (action.keyId ?? null) : null;
  const explicitContextId =
    action.type === 'keyPress' ? action.contextId : undefined;

  // --- STEP 2 & 5: cModel / fModel (H3) ---
  if (state.step === 'cModel' || state.step === 'fModel') {
    const anchorNote: FirstRunAnchorNote = state.step === 'cModel' ? 'C' : 'F';
    const itemId =
      anchorNote === 'C'
        ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
        : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
    const isCorrect = pressedNote === anchorNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );
    const contextId = `model:${regionCtx}`;

    const trialContext = createTrialContext({
      mode: 'model',
      sessionId,
      itemId,
      hintLevel: HINT_LEVEL.MODEL_VISIBLE,
      firstAttempt: true,
      inputMethod,
      contextId
    });

    if (!isCorrect) {
      const feedbackText =
        anchorNote === 'C'
          ? 'Ищите группу из 2 чёрных клавиш: белая клавиша сразу слева — это C (До). Нажмите любую подсвеченную C.'
          : 'Ищите группу из 3 чёрных клавиш: белая клавиша сразу слева — это F (Фа). Нажмите любую подсвеченную F.';
      return {
        state: {
          ...state,
          feedbackText,
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    if (anchorNote === 'C' && !isValidFirstRunCContext(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText:
            'У правого края (C6) группа из 2 чёрных клавиш не видна. Нажмите одну из подсвеченных клавиш C слева от пары чёрных клавиш (C2–C5).',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    const updatedAnchor = recordModelCompleted(
      progress[itemId],
      at,
      contextId
    );
    saveProgress(updatedAnchor);

    const nextStep: FirstRunCfStep =
      anchorNote === 'C' ? 'cGuided' : 'fGuided';
    const feedbackText =
      anchorNote === 'C'
        ? '✓ Отлично! Это C · До — сразу слева от 2 чёрных клавиш.'
        : '✓ Отлично! Это F · Фа — сразу слева от 3 чёрных клавиш.';

    return {
      state: transitionToStep(
        { ...state, progress },
        nextStep,
        { feedbackText, feedbackTone: 'good' }
      ),
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'advanced',
      fsrsDelayedCheck: null
    };
  }

  // --- STEP 3 & 6: cGuided / fGuided (H2) ---
  if (state.step === 'cGuided' || state.step === 'fGuided') {
    const anchorNote: FirstRunAnchorNote = state.step === 'cGuided' ? 'C' : 'F';
    const itemId =
      anchorNote === 'C'
        ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
        : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
    const isCorrect = pressedNote === anchorNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );
    const guidedCtx = `guided:${regionCtx}`;

    const trialContext = createTrialContext({
      mode: 'guided',
      sessionId,
      itemId,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      firstAttempt: true,
      inputMethod,
      contextId: regionCtx
    });

    const updatedAnchor = recordGuidedAttempt(progress[itemId], {
      correct: isCorrect,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      contextId: guidedCtx,
      at
    });
    saveProgress(updatedAnchor);

    if (!isCorrect) {
      const feedbackText =
        anchorNote === 'C'
          ? 'Посмотрите на подсвеченную группу из 2 чёрных клавиш. C (До) — белая клавиша сразу слева от неё.'
          : 'Посмотрите на подсвеченную группу из 3 чёрных клавиш. F (Фа) — белая клавиша сразу слева от неё.';
      return {
        state: {
          ...state,
          progress,
          feedbackText,
          feedbackTone: 'warn'
        },
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    const nextStep: FirstRunCfStep =
      anchorNote === 'C' ? 'cQualify' : 'fQualify';
    const feedbackText =
      anchorNote === 'C'
        ? '✓ Верно, это C! Теперь найдите C без подсказок.'
        : '✓ Верно, это F! Теперь найдите F без подсказок.';

    return {
      state: transitionToStep(
        { ...state, progress },
        nextStep,
        { feedbackText, feedbackTone: 'good' }
      ),
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'advanced',
      fsrsDelayedCheck: null
    };
  }

  // --- STEP 4 & 7: cQualify / fQualify (H0) ---
  if (state.step === 'cQualify' || state.step === 'fQualify') {
    const anchorNote: FirstRunAnchorNote =
      state.step === 'cQualify' ? 'C' : 'F';
    const itemId =
      anchorNote === 'C'
        ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
        : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
    const isCorrect = pressedNote === anchorNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );

    // If awaiting corrective or remediation press in qualify:
    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const mode: TrialMode = state.awaitingCorrective
        ? 'corrective'
        : 'qualify';
      const hintLevel: HintLevel = HINT_LEVEL.VISUAL_CUE;
      const trialContext = createTrialContext({
        mode,
        sessionId,
        itemId,
        hintLevel,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildContrastErrorFeedback(anchorNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      if (state.awaitingRemediationPress) {
        const remediated = recordIndependentAttempt(progress[itemId], {
          correct: true,
          hinted: true,
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          contextId: `guided:${regionCtx}`,
          at
        });
        saveProgress(remediated);
      }

      const nextState = transitionToStep(
        { ...state, progress },
        state.step,
        {
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          feedbackText: `✓ Хорошо, это ${anchorNote}. Теперь найдите ${anchorNote} самостоятельно без подсказки.`,
          feedbackTone: 'good'
        }
      );

      return {
        state: nextState,
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: state.awaitingCorrective
          ? 'corrective_completed'
          : 'remediation_completed',
        fsrsDelayedCheck: null
      };
    }

    const trialContext = createTrialContext({
      mode: 'qualify',
      sessionId,
      itemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod,
      contextId: regionCtx
    });

    if (!isCorrect) {
      const updatedAnchor = recordIndependentAttempt(progress[itemId], {
        correct: false,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: regionCtx,
        at
      });
      saveProgress(updatedAnchor);

      const nextState = transitionToStep(
        { ...state, progress },
        state.step,
        {
          awaitingCorrective: true,
          feedbackText: buildContrastErrorFeedback(anchorNote, pressedNote),
          feedbackTone: 'bad'
        }
      );

      return {
        state: nextState,
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    if (anchorNote === 'C' && !isValidFirstRunCContext(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText:
            'У правого края (C6) группа из 2 чёрных клавиш не видна. Найдите C слева от видимой пары чёрных клавиш в другой части клавиатуры.',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    const existingUnhintedContexts = getUnhintedAnchorContexts(progress[itemId]);
    if (existingUnhintedContexts.includes(regionCtx)) {
      const duplicateFeedback = `Правильно, это ${anchorNote}. Теперь найдите ещё одну ${anchorNote} в другой части клавиатуры.`;
      return {
        state: {
          ...state,
          feedbackText: duplicateFeedback,
          feedbackTone: 'good'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    let updatedAnchor = recordIndependentAttempt(progress[itemId], {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: regionCtx,
      at
    });

    const newUnhintedContexts = getUnhintedAnchorContexts(updatedAnchor);
    if (
      newUnhintedContexts.length >= FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET &&
      updatedAnchor.independentUnhintedSuccesses >=
        FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET
    ) {
      updatedAnchor = markMixReady(updatedAnchor, at);
      saveProgress(updatedAnchor);

      if (anchorNote === 'C') {
        return {
          state: transitionToStep(
            {
              ...state,
              progress,
              mixCContexts: newUnhintedContexts
            },
            'fModel',
            {
              feedbackText: '✓ Ориентир C готов! Переходим ко второму ориентиру — F.',
              feedbackTone: 'good'
            }
          ),
          updatedProgress,
          trialContext,
          ignoredInput: false,
          outcome: 'advanced',
          fsrsDelayedCheck: null
        };
      }

      // F Qualify complete -> advance to cfMix
      return {
        state: transitionToStep(
          {
            ...state,
            progress,
            mixFContexts: newUnhintedContexts
          },
          'cfMix',
          {
            feedbackText: '✓ Ориентир F готов! Теперь сравним C и F вместе.',
            feedbackTone: 'good'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'advanced',
        fsrsDelayedCheck: null
      };
    }

    saveProgress(updatedAnchor);
    return {
      state: {
        ...state,
        progress,
        feedbackText: `Правильно, это ${anchorNote}. Теперь найдите ещё одну ${anchorNote} в другой части клавиатуры.`,
        feedbackTone: 'good'
      },
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'progressed',
      fsrsDelayedCheck: null
    };
  }

  // --- STEP 8: cfMix (mixedRetrieval, H0) ---
  if (state.step === 'cfMix') {
    const expectedNote: FirstRunAnchorNote = state.targetNote ?? 'C';
    const isCorrect = pressedNote === expectedNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );

    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const mode: TrialMode = state.awaitingCorrective
        ? 'corrective'
        : 'mixedRetrieval';
      const trialContext = createTrialContext({
        mode,
        sessionId,
        itemId: FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildContrastErrorFeedback(expectedNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      // Advance queue past the missed item and schedule it after an intervening item
      const remainingAfterCurrent = state.mixQueue.slice(1);
      const nextQueue = scheduleMissedMixNote(
        remainingAfterCurrent,
        expectedNote
      );
      const nextHistory = [...state.mixHistory, expectedNote];

      const nextState = transitionToStep(
        {
          ...state,
          progress,
          mixQueue: nextQueue,
          mixHistory: nextHistory
        },
        'cfMix',
        {
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          feedbackText: `✓ Исправлено: это ${expectedNote}. Продолжаем!`,
          feedbackTone: 'good'
        }
      );

      return {
        state: nextState,
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: state.awaitingCorrective
          ? 'corrective_completed'
          : 'remediation_completed',
        fsrsDelayedCheck: null
      };
    }

    const trialContext = createTrialContext({
      mode: 'mixedRetrieval',
      sessionId,
      itemId: FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod,
      contextId: regionCtx
    });

    if (!isCorrect) {
      const updatedContrast = recordIndependentAttempt(
        progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF],
        {
          correct: false,
          hinted: false,
          hintLevel: HINT_LEVEL.NONE,
          contextId: `${expectedNote}:${regionCtx}`,
          at
        }
      );
      saveProgress(updatedContrast);

      const nextState = transitionToStep(
        { ...state, progress },
        'cfMix',
        {
          awaitingCorrective: true,
          feedbackText: buildContrastErrorFeedback(expectedNote, pressedNote),
          feedbackTone: 'bad'
        }
      );

      return {
        state: nextState,
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    // Correct first-attempt mixed retrieval
    const anchorItemId =
      expectedNote === 'C'
        ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
        : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
    const updatedAnchor = recordIndependentAttempt(progress[anchorItemId], {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: regionCtx,
      at
    });
    saveProgress(updatedAnchor);

    const nextCSuccesses =
      expectedNote === 'C' ? state.mixCSuccesses + 1 : state.mixCSuccesses;
    const nextFSuccesses =
      expectedNote === 'F' ? state.mixFSuccesses + 1 : state.mixFSuccesses;
    const totalMixSuccesses = nextCSuccesses + nextFSuccesses;

    let updatedContrast = recordIndependentAttempt(
      progress[FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF],
      {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `${expectedNote}:${totalMixSuccesses}:${regionCtx}`,
        at
      }
    );

    const cContexts = getUnhintedAnchorContexts(
      progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]
    );
    const fContexts = getUnhintedAnchorContexts(
      progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_F]
    );

    const mixComplete =
      totalMixSuccesses >= CF_MIX_SUCCESS_TARGET &&
      nextCSuccesses >= 1 &&
      nextFSuccesses >= 1 &&
      cContexts.length >= FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET &&
      fContexts.length >= FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET;

    if (mixComplete) {
      updatedContrast = markMixReady(updatedContrast, at);
      saveProgress(updatedContrast);

      return {
        state: transitionToStep(
          {
            ...state,
            progress,
            mixCSuccesses: nextCSuccesses,
            mixFSuccesses: nextFSuccesses,
            mixCContexts: cContexts,
            mixFContexts: fContexts,
            mixHistory: [...state.mixHistory, expectedNote]
          },
          'cfIdentify',
          {
            feedbackText: '✓ Отлично! Теперь определите подсвеченную клавишу по названию.',
            feedbackTone: 'good'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'advanced',
        fsrsDelayedCheck: null
      };
    }

    saveProgress(updatedContrast);
    const nextHistory = [...state.mixHistory, expectedNote];
    const remainingQueue = state.mixQueue.slice(1);
    if (remainingQueue.length === 0) {
      remainingQueue.push(
        chooseNextMixNote(nextHistory, nextCSuccesses, nextFSuccesses)
      );
    }

    return {
      state: transitionToStep(
        {
          ...state,
          progress,
          mixQueue: remainingQueue,
          mixHistory: nextHistory,
          mixCSuccesses: nextCSuccesses,
          mixFSuccesses: nextFSuccesses,
          mixCContexts: cContexts,
          mixFContexts: fContexts
        },
        'cfMix',
        {
          feedbackText: `✓ Верно, это ${DISPLAY_NAMES[expectedNote]}! (${totalMixSuccesses}/${CF_MIX_SUCCESS_TARGET})`,
          feedbackTone: 'good'
        }
      ),
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'progressed',
      fsrsDelayedCheck: null
    };
  }

  // --- STEP 9: cfIdentify (mixedRetrieval, H0, FSRS = OFF) ---
  if (state.step === 'cfIdentify') {
    const expectedNote: FirstRunAnchorNote = state.targetNote ?? 'C';
    const isCorrect = pressedNote === expectedNote;
    const contextId = `identify:${expectedNote}`;

    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const mode: TrialMode = state.awaitingCorrective
        ? 'corrective'
        : 'mixedRetrieval';
      const trialContext = createTrialContext({
        mode,
        sessionId,
        itemId: FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildContrastErrorFeedback(expectedNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const opposite: FirstRunAnchorNote = expectedNote === 'C' ? 'F' : 'C';
      const remaining = state.identifyQueue.slice(1);
      const nextIdentifyQueue: FirstRunAnchorNote[] = remaining.includes(
        expectedNote
      )
        ? remaining
        : remaining.length > 0
          ? [...remaining, expectedNote]
          : [opposite, expectedNote];

      return {
        state: transitionToStep(
          {
            ...state,
            progress,
            identifyQueue: nextIdentifyQueue
          },
          'cfIdentify',
          {
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            feedbackText: `✓ Исправлено: это ${DISPLAY_NAMES[expectedNote]}.`,
            feedbackTone: 'good'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: state.awaitingCorrective
          ? 'corrective_completed'
          : 'remediation_completed',
        fsrsDelayedCheck: null
      };
    }

    const trialContext = createTrialContext({
      mode: 'mixedRetrieval',
      sessionId,
      itemId: FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod,
      contextId
    });

    if (!isCorrect) {
      const updatedIdentify = recordIndependentAttempt(
        progress[FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF],
        {
          correct: false,
          hinted: false,
          hintLevel: HINT_LEVEL.NONE,
          contextId,
          at
        }
      );
      saveProgress(updatedIdentify);

      return {
        state: transitionToStep(
          { ...state, progress },
          'cfIdentify',
          {
            awaitingCorrective: true,
            feedbackText: buildContrastErrorFeedback(expectedNote, pressedNote),
            feedbackTone: 'bad'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    const nextCompleted = state.identifyCompletedNotes.includes(expectedNote)
      ? [...state.identifyCompletedNotes]
      : [...state.identifyCompletedNotes, expectedNote];

    let updatedIdentify = recordIndependentAttempt(
      progress[FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF],
      {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId,
        at
      }
    );

    if (nextCompleted.includes('C') && nextCompleted.includes('F')) {
      updatedIdentify = markMixReady(updatedIdentify, at);
      saveProgress(updatedIdentify);

      return {
        state: transitionToStep(
          {
            ...state,
            progress,
            identifyCompletedNotes: nextCompleted,
            identifyQueue: []
          },
          'delayedC',
          {
            feedbackText: '✓ Отлично! Финальная проверка по памяти без подсказок.',
            feedbackTone: 'good'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'advanced',
        fsrsDelayedCheck: null
      };
    }

    saveProgress(updatedIdentify);
    const nextQueue = state.identifyQueue.slice(1);
    if (nextQueue.length === 0) {
      nextQueue.push(expectedNote === 'C' ? 'F' : 'C');
    }

    return {
      state: transitionToStep(
        {
          ...state,
          progress,
          identifyCompletedNotes: nextCompleted,
          identifyQueue: nextQueue
        },
        'cfIdentify',
        {
          feedbackText: `✓ Верно, это ${DISPLAY_NAMES[expectedNote]}!`,
          feedbackTone: 'good'
        }
      ),
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'progressed',
      fsrsDelayedCheck: null
    };
  }

  // --- STEP 10 & 11: delayedC / delayedF (delayedCheck -> First FSRS Mutation) ---
  if (state.step === 'delayedC' || state.step === 'delayedF') {
    const stepNote: FirstRunAnchorNote = state.step === 'delayedC' ? 'C' : 'F';
    const activeNote: FirstRunAnchorNote = state.targetNote ?? stepNote;
    const isCorrect = pressedNote === activeNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );

    // Case A: Intervening recall trial before repeating an unhinted H0 delayedCheck
    if (state.isInterveningRecall) {
      if (state.awaitingCorrective || state.awaitingRemediationPress) {
        const trialContext = createTrialContext({
          mode: 'corrective',
          sessionId,
          itemId: FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          firstAttempt: false,
          inputMethod,
          contextId: regionCtx
        });
        if (!isCorrect) {
          return {
            state: {
              ...state,
              feedbackText: buildContrastErrorFeedback(activeNote, pressedNote),
              feedbackTone: 'bad'
            },
            updatedProgress: [],
            trialContext,
            ignoredInput: false,
            outcome: 'wrong_note',
            fsrsDelayedCheck: null
          };
        }
        return {
          state: transitionToStep(state, state.step, {
            isInterveningRecall: false,
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            feedbackText: `✓ Верно. Теперь снова проверьте ${stepNote} без подсказки.`,
            feedbackTone: 'good'
          }),
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'corrective_completed',
          fsrsDelayedCheck: null
        };
      }

      const trialContext = createTrialContext({
        mode: 'mixedRetrieval',
        sessionId,
        itemId: FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: transitionToStep(state, state.step, {
            isInterveningRecall: true,
            awaitingCorrective: true,
            feedbackText: buildContrastErrorFeedback(activeNote, pressedNote),
            feedbackTone: 'bad'
          }),
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      // Intervening trial succeeded -> now repeat the H0 delayedCheck on stepNote!
      return {
        state: transitionToStep(state, state.step, {
          isInterveningRecall: false,
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          feedbackText: `✓ Верно! Теперь найдите ${stepNote} без подсказки.`,
          feedbackTone: 'good'
        }),
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'progressed',
        fsrsDelayedCheck: null
      };
    }

    const cardId = `find:${stepNote}` as const;
    const itemId =
      stepNote === 'C'
        ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
        : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;

    // Case B: Corrective press after a failed H0 delayedCheck (which already graded Again once)
    if (state.awaitingCorrective) {
      const trialContext = createTrialContext({
        mode: 'corrective',
        sessionId,
        cardId,
        itemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: false,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildContrastErrorFeedback(stepNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      // Canonical remediation: the corrective press does not promote the anchor.
      // It routes through an intervening recall and then a fresh unhinted H0 retry.
      const otherNote: FirstRunAnchorNote = stepNote === 'C' ? 'F' : 'C';
      return {
        state: transitionToStep(
          {
            ...state,
            progress
          },
          state.step,
          {
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            isInterveningRecall: true,
            feedbackText: `✓ Исправлено: это ${stepNote}. Найдите ${otherNote}, а затем повторим ${stepNote} без подсказки.`,
            feedbackTone: 'good'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'corrective_completed',
        fsrsDelayedCheck: null
      };
    }

    // Case C: Hinted delayedCheck (either via prior 'Don't know' remediation OR caller-passed hintLevel > H0)
    const callerHintLevel =
      action.type === 'keyPress' && action.hintLevel !== undefined
        ? action.hintLevel
        : state.awaitingRemediationPress
          ? HINT_LEVEL.VISUAL_CUE
          : HINT_LEVEL.NONE;

    if (callerHintLevel !== HINT_LEVEL.NONE) {
      const trialContext = createTrialContext({
        mode: 'delayedCheck',
        sessionId,
        cardId,
        itemId,
        hintLevel: callerHintLevel,
        firstAttempt: true,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildContrastErrorFeedback(stepNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      // Hinted delayedCheck succeeded -> NO FSRS mutation; schedule repeat H0 delayedCheck after intervening step!
      const otherNote: FirstRunAnchorNote = stepNote === 'C' ? 'F' : 'C';
      const otherStillPending = state.delayedQueue.includes(otherNote);

      if (otherStillPending) {
        // Use the other anchor's delayedCheck as the intervening step, then return to stepNote!
        const reorderedQueue: FirstRunAnchorNote[] = [otherNote, stepNote];
        const nextStep: FirstRunCfStep =
          otherNote === 'C' ? 'delayedC' : 'delayedF';
        return {
          state: transitionToStep(
            {
              ...state,
              progress,
              delayedQueue: reorderedQueue
            },
            nextStep,
            {
              awaitingRemediationPress: false,
              feedbackText: `✓ Нашли ${stepNote} с подсказкой. Проверим ${otherNote}, а затем вернёмся к ${stepNote} без подсказки.`,
              feedbackTone: 'good'
            }
          ),
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'remediation_completed',
          fsrsDelayedCheck: null
        };
      }

      // Otherwise run 1 intervening unhinted retrieval on the opposite note before repeating stepNote's H0 delayedCheck
      return {
        state: transitionToStep(state, state.step, {
          awaitingRemediationPress: false,
          isInterveningRecall: true,
          feedbackText: `✓ Нашли ${stepNote} с подсказкой. Сначала найдите ${otherNote}, а затем снова проверим ${stepNote} без подсказки.`,
          feedbackTone: 'good'
        }),
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'remediation_completed',
        fsrsDelayedCheck: null
      };
    }

    // Case D: Genuine unhinted H0 delayedCheck.
    // A retry after remediation carries `pending:delayedRetry` and must not grade FSRS again.
    const trialContext = createTrialContext({
      mode: 'delayedCheck',
      sessionId,
      cardId,
      itemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: isDelayedCheckFirstAttempt(progress[itemId].contexts),
      inputMethod,
      contextId: regionCtx
    });

    const fsrsDelayedCheck: FirstRunCfDelayedCheckPayload = {
      cardId,
      note: stepNote,
      isCorrect,
      answer: pressedNote,
      answerKeyId: pressedKeyId,
      trialContext
    };

    const nextDelayedCompleted = state.delayedCompletedNotes.includes(stepNote)
      ? [...state.delayedCompletedNotes]
      : [...state.delayedCompletedNotes, stepNote];

    if (!isCorrect) {
      // Wrong H0 delayedCheck: grades Again once, keeps the anchor pending and requires corrective.
      const anchorRecord = progress[itemId];
      saveProgress({
        ...anchorRecord,
        contexts: appendUniqueContext(
          appendUniqueContext(anchorRecord.contexts, 'pending:delayedRetry'),
          GRADED_FAILURE_CONTEXT
        ),
        updatedAt: at
      });
      return {
        state: transitionToStep(
          {
            ...state,
            progress
          },
          state.step,
          {
            awaitingCorrective: true,
            feedbackText: buildContrastErrorFeedback(stepNote, pressedNote),
            feedbackTone: 'bad'
          }
        ),
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck
      };
    }

    const remainingDelayed = state.delayedQueue.filter(n => n !== stepNote);
    const nextStep: FirstRunCfStep =
      remainingDelayed.length > 0
        ? remainingDelayed[0] === 'C'
          ? 'delayedC'
          : 'delayedF'
        : 'complete';

    return {
      state: transitionToStep(
        {
          ...state,
          progress,
          delayedQueue: remainingDelayed,
          delayedCompletedNotes: nextDelayedCompleted
        },
        nextStep,
        {
          feedbackText:
            nextStep === 'complete'
              ? '✓ Два ориентира готовы!'
              : `✓ Отлично, ${stepNote} найдена по памяти!`,
          feedbackTone: 'good'
        }
      ),
      updatedProgress,
      trialContext,
      ignoredInput: false,
      outcome: 'advanced',
      fsrsDelayedCheck
    };
  }

  return {
    state,
    updatedProgress: [],
    trialContext: null,
    ignoredInput: true,
    outcome: 'ignored',
    fsrsDelayedCheck: null
  };
}

export interface ApplyFirstRunCfActionWithCardsParams {
  state: FirstRunCfState;
  action: FirstRunCfAction;
  cards: ReadonlyMap<string, Card> | readonly Card[];
  settings: Pick<
    UserSettings,
    | 'desiredRetention'
    | 'maxIntervalDays'
    | 'relearningSeconds'
    | 'useLatencyGrading'
  >;
  reviewLog?: readonly ReviewLogEvent[];
  responseMs?: number | null;
  reviewedAt?: number;
}

export interface ApplyFirstRunCfActionWithCardsResult
  extends FirstRunCfTransitionResult {
  attemptResult: SubmitQuestionAttemptResult | null;
  mutatedCard: Card | null;
}

/**
 * High-level helper that advances the First-Run C/F state machine and, ONLY when
 * an unhinted H0 `delayedCheck` occurs on `find:C` or `find:F` and the corresponding
 * `Card` exists and is mutated by FSRS, transitions the anchor's `LearningProgressRecord`
 * to `'retention'`.
 */
export function applyFirstRunCfActionWithCards(
  params: ApplyFirstRunCfActionWithCardsParams
): ApplyFirstRunCfActionWithCardsResult {
  const reviewedAt = params.reviewedAt ?? params.action.at ?? Date.now();
  const transition = advanceFirstRunCf(params.state, {
    ...params.action,
    at: reviewedAt
  });

  if (!transition.fsrsDelayedCheck) {
    return {
      ...transition,
      attemptResult: null,
      mutatedCard: null
    };
  }

  const { cardId, note, isCorrect, answer, answerKeyId, trialContext } =
    transition.fsrsDelayedCheck;
  const card =
    params.cards instanceof Map
      ? params.cards.get(cardId)
      : (params.cards as readonly Card[]).find(c => c.id === cardId);

  if (!card) {
    // Missing card guard: no FSRS application and no retention transition
    return {
      state: params.state,
      updatedProgress: [],
      trialContext,
      ignoredInput: false,
      outcome: 'ignored',
      fsrsDelayedCheck: transition.fsrsDelayedCheck,
      attemptResult: null,
      mutatedCard: null
    };
  }

  const roundState: QuestionRoundState = {
    firstResponseRecorded: false,
    attempts: 0,
    hintUsed: false,
    isCompleted: false,
    isLocked: false
  };

  const attemptResult = submitQuestionAttempt({
    state: roundState,
    card,
    kind: 'new',
    isCorrect,
    answer,
    answerKeyId,
    hintUsedOnFirstAttempt: false,
    responseMs: params.responseMs ?? null,
    settings: params.settings,
    reviewLog: params.reviewLog ?? [],
    sessionId: trialContext.sessionId,
    reviewedAt,
    trialContext
  });

  const itemId =
    note === 'C'
      ? FIRST_RUN_CF_ITEM_IDS.ANCHOR_C
      : FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
  const anchorRecord = transition.state.progress[itemId];
  const graded = attemptResult.cardMutated && Boolean(attemptResult.logEvent?.gradeableByFsrs);
  const pendingRetrySuccess = isCorrect && hasPendingDelayedRetry(anchorRecord.contexts);
  if (!graded && !pendingRetrySuccess) {
    return {
      state: params.state,
      updatedProgress: [],
      trialContext,
      ignoredInput: false,
      outcome: 'ignored',
      fsrsDelayedCheck: transition.fsrsDelayedCheck,
      attemptResult,
      mutatedCard: null
    };
  }

  if (!isCorrect) {
    // Graded failure: FSRS applied once; the anchor stays pending for remediation.
    return {
      ...transition,
      attemptResult,
      mutatedCard: graded ? card : null
    };
  }

  // A successful unhinted attempt clears the pending remediation without an extra FSRS grade.
  const cleanAnchor = {
    ...anchorRecord,
    contexts: anchorRecord.contexts.filter(
      c => c !== 'pending:delayedRetry' && c !== GRADED_FAILURE_CONTEXT
    )
  };
  const activatedAnchor = markFsrsActivated(
    cleanAnchor,
    reviewedAt
  );
  const nextProgress = {
    ...transition.state.progress,
    [itemId]: activatedAnchor
  };
  const nextUpdatedProgress = [
    ...transition.updatedProgress.filter(p => p.id !== itemId),
    activatedAnchor
  ];

  return {
    ...transition,
    state: {
      ...transition.state,
      progress: nextProgress
    },
    updatedProgress: nextUpdatedProgress,
    attemptResult,
    mutatedCard: graded ? card : null
  };
}
