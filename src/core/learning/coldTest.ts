import type { Skill } from '../fsrs/types';
import { FSRS_SKILLS } from '../fsrs/skills';

export const COLD_TEST_TARGET_TRIALS = 20;

/**
 * Canonical skill families that may appear in the Cold Test queue
 * (`buildColdQueue` cycles through the families present in the card pool).
 * Shares the canonical FSRS skill registry.
 */
export const COLD_TEST_SKILLS: readonly Skill[] = FSRS_SKILLS;

export interface ColdTestProgress {
  queueLength: number;
  index: number;
  completedItemKey: string | null;
}

export interface ColdTestCompletionInput {
  queueLength: number;
  index: number;
  completedItemKey: string | null;
  itemKey: string | null;
  targetTrials?: number;
}

export interface ColdTestCompletionResult {
  claimed: boolean;
  progress: ColdTestProgress;
  nextIndex: number;
}

export function coldTestTotalTrials(queueLength: number, targetTrials = COLD_TEST_TARGET_TRIALS): number {
  return Math.max(1, Math.min(targetTrials, queueLength || targetTrials));
}

/** 1-based number of the item currently shown (completed + 1, clamped to the total). */
export function coldTestItemNumber(index: number, queueLength: number, targetTrials = COLD_TEST_TARGET_TRIALS): number {
  return Math.min(index + 1, coldTestTotalTrials(queueLength, targetTrials));
}

/**
 * Cold Test navigation state separates two concepts:
 * - `completedIndex` — progression pointer / number of completed items (drives persistence,
 *   queue selection, progress bar and «выполнено X из 20»);
 * - `activeItemIndex` — index of the question actually rendered on screen. It changes ONLY when
 *   a Cold Test question is activated, never when a question is completed, so the visible
 *   `Cold Test · N/20` label always describes the question the user is looking at (including
 *   while its feedback is still on screen).
 */
export interface ColdTestNavigation {
  completedIndex: number;
  activeItemIndex: number | null;
}

export function createColdTestNavigation(): ColdTestNavigation {
  return { completedIndex: 0, activeItemIndex: null };
}

/** Called exactly when a Cold Test question becomes the rendered task. */
export function activateColdTestItem(
  navigation: ColdTestNavigation,
  queueLength: number,
  targetTrials = COLD_TEST_TARGET_TRIALS
): ColdTestNavigation {
  const total = coldTestTotalTrials(queueLength, targetTrials);
  return {
    ...navigation,
    activeItemIndex: Math.max(0, Math.min(navigation.completedIndex, total - 1))
  };
}

/** 1-based number of the rendered question; 0 before the first activation. */
export function coldTestActiveItemNumber(
  navigation: ColdTestNavigation,
  queueLength: number,
  targetTrials = COLD_TEST_TARGET_TRIALS
): number {
  if (navigation.activeItemIndex == null) return 0;
  return coldTestItemNumber(navigation.activeItemIndex, queueLength, targetTrials);
}

export interface ColdTestItemCompletionInput {
  queueLength: number;
  completedItemKey: string | null;
  itemKey: string | null;
  targetTrials?: number;
}

export interface ColdTestItemCompletionResult {
  claimed: boolean;
  navigation: ColdTestNavigation;
  nextIndex: number;
}

/**
 * Completion advances the progression pointer only; the displayed active item is untouched
 * until the next question is actually activated.
 */
export function resolveColdTestItemCompletion(
  navigation: ColdTestNavigation,
  input: ColdTestItemCompletionInput
): ColdTestItemCompletionResult {
  const result = resolveColdTestCompletion({
    queueLength: input.queueLength,
    index: navigation.completedIndex,
    completedItemKey: input.completedItemKey,
    itemKey: input.itemKey,
    targetTrials: input.targetTrials
  });
  return {
    claimed: result.claimed,
    navigation: result.claimed
      ? { ...navigation, completedIndex: result.nextIndex }
      : navigation,
    nextIndex: result.nextIndex
  };
}

export function isColdTestComplete(index: number, queueLength: number, targetTrials = COLD_TEST_TARGET_TRIALS): boolean {
  return index >= coldTestTotalTrials(queueLength, targetTrials);
}

/**
 * Central, idempotent Cold Test completion contract.
 *
 * Every task family resolves its terminal outcome through this function exactly once per
 * question identity. The completed-item key is the question instance id:
 * - a duplicate callback (double click, duplicated MIDI event, delayed async completion)
 *   returns `claimed: false` and never advances the index twice;
 * - a missing item key never advances;
 * - the index can never overflow the queue/target length.
 */
export function resolveColdTestCompletion(input: ColdTestCompletionInput): ColdTestCompletionResult {
  const progress: ColdTestProgress = {
    queueLength: input.queueLength,
    index: input.index,
    completedItemKey: input.completedItemKey
  };
  const total = coldTestTotalTrials(input.queueLength, input.targetTrials ?? COLD_TEST_TARGET_TRIALS);
  if (!input.itemKey) return { claimed: false, progress, nextIndex: input.index };
  if (input.completedItemKey === input.itemKey) return { claimed: false, progress, nextIndex: input.index };
  if (input.index >= total) return { claimed: false, progress, nextIndex: input.index };
  const nextIndex = input.index + 1;
  return {
    claimed: true,
    progress: { queueLength: input.queueLength, index: nextIndex, completedItemKey: input.itemKey },
    nextIndex
  };
}
