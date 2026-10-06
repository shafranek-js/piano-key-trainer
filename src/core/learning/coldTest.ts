import type { Skill } from '../fsrs/types';

export const COLD_TEST_TARGET_TRIALS = 20;

/**
 * Canonical skill families that may appear in the Cold Test queue
 * (`buildColdQueue` cycles through the families present in the card pool).
 */
export const COLD_TEST_SKILLS: readonly Skill[] = [
  'find',
  'identify',
  'patternIdentify',
  'notationToKey',
  'soundToKey',
  'notationBassToKey',
  'intervalBuild',
  'intervalIdentify',
  'triadBuild',
  'triadIdentify',
  'triadInversionBuild',
  'triadInversionIdentify',
  'chordSymbolRead',
  'harmonyFunctionIdentify',
  'harmonyNextChord',
  'harmonyProgressionPlay',
  'chordPulse',
  'chordChangeTiming',
  'chordRhythmPattern'
];

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
