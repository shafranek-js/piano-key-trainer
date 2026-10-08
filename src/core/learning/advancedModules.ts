import type { Card, ReviewLogEvent } from '../fsrs/types';
import {
  getBassGrandModuleStatus,
  isBassGrandModuleAvailable,
  isBassGrandModuleComplete
} from './bassGrandStaff';
import {
  getIntervalModuleStatus,
  isIntervalModuleAvailable,
  isIntervalModuleComplete
} from './intervals';
import {
  getTriadModuleStatus,
  isTriadModuleAvailable,
  isTriadModuleComplete
} from './triads';
import {
  getInversionModuleStatus,
  isInversionModuleAvailable,
  isInversionModuleComplete
} from './chordInversions';
import { getHarmonyModuleStatus, isHarmonyModuleAvailable } from './harmony';
import { getChordRhythmModuleStatus } from './chordRhythm';
import { getTwoHandModuleStatus } from './twoHand';
import type { ProgressCollectionInput } from './curriculumFlow';
import type { LearningProgressRecord } from './types';

export type AdvancedModuleState = 'completed' | 'in_progress' | 'available' | 'locked';
export type AdvancedModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface ResolvedAdvancedModuleState {
  state: AdvancedModuleState;
  available: boolean;
  progressStatus: AdvancedModuleProgressStatus;
}

export interface AdvancedModuleStateInput {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
}

function resolveState(
  progressStatus: AdvancedModuleProgressStatus,
  available: boolean
): ResolvedAdvancedModuleState {
  const state: AdvancedModuleState =
    progressStatus === 'completed'
      ? 'completed'
      : progressStatus === 'in_progress'
        ? 'in_progress'
        : available
          ? 'available'
          : 'locked';

  return {
    state,
    available: available || progressStatus === 'completed',
    progressStatus
  };
}

/**
 * Resolves all advanced-module progression and availability from the same persisted
 * domain state. Completion takes precedence over progress, then availability, then lock.
 */
export function resolveAdvancedModuleStates(input: AdvancedModuleStateInput): {
  bassGrandStaff: ResolvedAdvancedModuleState;
  intervals: ResolvedAdvancedModuleState;
  triads: ResolvedAdvancedModuleState;
  chordInversions: ResolvedAdvancedModuleState;
  harmony: ResolvedAdvancedModuleState;
  chordRhythm: ResolvedAdvancedModuleState;
  twoHand: ResolvedAdvancedModuleState;
} {
  const learningProgress = input.learningProgress as
    | ProgressCollectionInput
    | ReadonlyMap<string, LearningProgressRecord>
    | undefined;

  const bassStatus = getBassGrandModuleStatus(input);
  const bassComplete = isBassGrandModuleComplete(learningProgress);
  const bassAvailable = isBassGrandModuleAvailable(input);

  const intervalStatus = getIntervalModuleStatus(input);
  const intervalComplete = isIntervalModuleComplete(learningProgress);
  const intervalAvailable = isIntervalModuleAvailable(input);

  const triadStatus = getTriadModuleStatus(input);
  const triadComplete = isTriadModuleComplete(learningProgress);
  const triadAvailable = isTriadModuleAvailable(input);

  const inversionStatus = getInversionModuleStatus(input);
  const inversionComplete = isInversionModuleComplete(learningProgress);
  const inversionAvailable = isInversionModuleAvailable(input);

  const harmonyStatus = getHarmonyModuleStatus(learningProgress);
  const harmonyAvailable = isHarmonyModuleAvailable({ inversionComplete });
  const rhythmStatus = getChordRhythmModuleStatus(learningProgress);
  const rhythmAvailable = harmonyStatus === 'completed';
  const twoHandStatus = getTwoHandModuleStatus(learningProgress);
  const twoHandAvailable = rhythmStatus === 'completed';

  return {
    bassGrandStaff: resolveState(bassComplete ? 'completed' : bassStatus, bassAvailable),
    intervals: resolveState(intervalComplete ? 'completed' : intervalStatus, intervalAvailable),
    triads: resolveState(triadComplete ? 'completed' : triadStatus, triadAvailable),
    chordInversions: resolveState(
      inversionComplete ? 'completed' : inversionStatus,
      inversionAvailable
    ),
    harmony: resolveState(
      harmonyStatus === 'completed' ? 'completed' : harmonyStatus,
      harmonyAvailable
    ),
    chordRhythm: resolveState(rhythmStatus, rhythmAvailable),
    twoHand: resolveState(twoHandStatus, twoHandAvailable)
  };
}
