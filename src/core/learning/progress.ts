import {
  HINT_LEVEL,
  type AcquisitionState,
  type HintLevel,
  type LearningEvent,
  type LearningProgressRecord
} from './types';
import { normalizeChordRhythmSnapshot } from './chordRhythm';
import { normalizeTwoHandSnapshot } from './twoHand';

/**
 * Creates a fresh `LearningProgressRecord` in the `'unseen'` acquisition state.
 *
 * `LearningProgressRecord` is independent of FSRS `Card` state; a pedagogical `itemId`
 * may represent a conceptual or structural item (e.g. `'keyboard-geometry:two-black'`,
 * `'keyboard-anchor:C'`) or a skill/note item before any FSRS card is activated.
 */
export function createInitialLearningProgress(
  itemId: string,
  now = 0,
  id = itemId
): LearningProgressRecord {
  return {
    id,
    itemId,
    state: 'unseen',
    modelCompleted: false,
    guidedSuccesses: 0,
    independentUnhintedSuccesses: 0,
    contexts: [],
    currentHintLevel: HINT_LEVEL.NONE,
    updatedAt: now
  };
}

/**
 * Deterministically appends `contextId` to `contexts` only if it is non-empty and
 * not already present, preserving insertion order without duplicates.
 */
export function appendUniqueContext(
  contexts: readonly string[],
  contextId?: string
): string[] {
  if (!contextId || contextId.trim().length === 0) {
    return [...contexts];
  }
  const normalized = contextId.trim();
  if (contexts.includes(normalized)) {
    return [...contexts];
  }
  return [...contexts, normalized];
}

function advanceStateToAtLeast(
  current: AcquisitionState,
  target: AcquisitionState
): AcquisitionState {
  const order: Record<AcquisitionState, number> = {
    unseen: 0,
    introduced: 1,
    guided: 2,
    qualifying: 3,
    mixReady: 4,
    retention: 5
  };
  return order[target] > order[current] ? target : current;
}

/**
 * Pure acquisition state reducer for `LearningProgressRecord`.
 *
 * Note (Milestone 3A): Automatic `mixReady` / `retention` threshold promotion is intentionally
 * NOT embedded in `independentAttempt`; Milestone 3B/3C will invoke `{ type: 'mixReady' }`
 * and `{ type: 'fsrsActivated' }` explicitly according to the finalized teaching flow.
 */
export function reduceLearningProgress(
  progress: LearningProgressRecord,
  event: LearningEvent
): LearningProgressRecord {
  switch (event.type) {
    case 'modelCompleted': {
      return {
        ...progress,
        state: advanceStateToAtLeast(progress.state, 'introduced'),
        modelCompleted: true,
        contexts: appendUniqueContext(progress.contexts, event.contextId),
        currentHintLevel: HINT_LEVEL.MODEL_VISIBLE,
        introducedAt: progress.introducedAt ?? event.at,
        updatedAt: event.at
      };
    }

    case 'guidedAttempt': {
      const nextGuidedSuccesses = event.correct
        ? progress.guidedSuccesses + 1
        : progress.guidedSuccesses;
      const nextContexts = event.correct
        ? appendUniqueContext(progress.contexts, event.contextId)
        : [...progress.contexts];

      return {
        ...progress,
        state: advanceStateToAtLeast(progress.state, 'guided'),
        guidedSuccesses: nextGuidedSuccesses,
        contexts: nextContexts,
        currentHintLevel: event.hintLevel ?? progress.currentHintLevel,
        introducedAt: progress.introducedAt ?? event.at,
        updatedAt: event.at
      };
    }

    case 'independentAttempt': {
      const effectiveHintLevel: HintLevel =
        event.hintLevel ?? (event.hinted ? HINT_LEVEL.VERBAL_CUE : HINT_LEVEL.NONE);
      const isUnhinted = !event.hinted && effectiveHintLevel === HINT_LEVEL.NONE;
      const nextIndependentUnhintedSuccesses =
        event.correct && isUnhinted
          ? progress.independentUnhintedSuccesses + 1
          : progress.independentUnhintedSuccesses;
      const nextContexts = event.correct
        ? appendUniqueContext(progress.contexts, event.contextId)
        : [...progress.contexts];

      return {
        ...progress,
        state: advanceStateToAtLeast(progress.state, 'qualifying'),
        independentUnhintedSuccesses: nextIndependentUnhintedSuccesses,
        contexts: nextContexts,
        currentHintLevel: effectiveHintLevel,
        introducedAt: progress.introducedAt ?? event.at,
        updatedAt: event.at
      };
    }

    case 'mixReady': {
      return {
        ...progress,
        state: advanceStateToAtLeast(progress.state, 'mixReady'),
        currentHintLevel: HINT_LEVEL.NONE,
        introducedAt: progress.introducedAt ?? event.at,
        mixReadyAt: progress.mixReadyAt ?? event.at,
        updatedAt: event.at
      };
    }

    case 'fsrsActivated': {
      return {
        ...progress,
        state: 'retention',
        currentHintLevel: HINT_LEVEL.NONE,
        introducedAt: progress.introducedAt ?? event.at,
        firstFsrsEligibleAt: progress.firstFsrsEligibleAt ?? event.at,
        updatedAt: event.at
      };
    }
  }
}

export function recordModelCompleted(
  progress: LearningProgressRecord,
  at: number,
  contextId?: string
): LearningProgressRecord {
  return reduceLearningProgress(progress, {
    type: 'modelCompleted',
    at,
    contextId
  });
}

export function recordGuidedAttempt(
  progress: LearningProgressRecord,
  params: {
    correct: boolean;
    hintLevel?: HintLevel;
    contextId?: string;
    at: number;
  }
): LearningProgressRecord {
  return reduceLearningProgress(progress, {
    type: 'guidedAttempt',
    correct: params.correct,
    hintLevel: params.hintLevel,
    contextId: params.contextId,
    at: params.at
  });
}

export function recordIndependentAttempt(
  progress: LearningProgressRecord,
  params: {
    correct: boolean;
    hinted: boolean;
    hintLevel?: HintLevel;
    contextId?: string;
    at: number;
  }
): LearningProgressRecord {
  return reduceLearningProgress(progress, {
    type: 'independentAttempt',
    correct: params.correct,
    hinted: params.hinted,
    hintLevel: params.hintLevel,
    contextId: params.contextId,
    at: params.at
  });
}

export function markMixReady(
  progress: LearningProgressRecord,
  at: number
): LearningProgressRecord {
  return reduceLearningProgress(progress, {
    type: 'mixReady',
    at
  });
}

export function markFsrsActivated(
  progress: LearningProgressRecord,
  at: number
): LearningProgressRecord {
  return reduceLearningProgress(progress, {
    type: 'fsrsActivated',
    at
  });
}

/**
 * Normalizes optional `learningProgress` records from an imported JSON profile backup.
 * Old backups without `learningProgress` return `null` so import succeeds without error.
 */
export function normalizeBackupLearningProgress(
  rawBackup: unknown
): LearningProgressRecord[] | null {
  if (!rawBackup || typeof rawBackup !== 'object') {
    return null;
  }
  const candidate = (rawBackup as Record<string, unknown>).learningProgress;
  if (!Array.isArray(candidate)) {
    return null;
  }
  const acquisitionStates: readonly AcquisitionState[] = ['unseen', 'introduced', 'guided', 'qualifying', 'mixReady', 'retention'];
  const validRecords: LearningProgressRecord[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<LearningProgressRecord>;
    if (typeof rec.id !== 'string' || typeof rec.itemId !== 'string') continue;

    let dedupedContexts: string[] = [];
    if (Array.isArray(rec.contexts)) {
      for (const ctx of rec.contexts) {
        if (typeof ctx === 'string') {
          dedupedContexts = appendUniqueContext(dedupedContexts, ctx);
        }
      }
    }

    validRecords.push({
      id: rec.id,
      itemId: rec.itemId,
      state: acquisitionStates.includes(rec.state as AcquisitionState) ? rec.state as AcquisitionState : 'unseen',
      modelCompleted: Boolean(rec.modelCompleted),
      guidedSuccesses: Number.isFinite(rec.guidedSuccesses) ? Number(rec.guidedSuccesses) : 0,
      independentUnhintedSuccesses: Number.isFinite(rec.independentUnhintedSuccesses)
        ? Number(rec.independentUnhintedSuccesses)
        : 0,
      contexts: dedupedContexts,
      transferAssessment: rec.transferAssessment && typeof rec.transferAssessment === 'object'
        ? {
            blockNumber: Math.max(1, Math.floor(Number(rec.transferAssessment.blockNumber) || 1)),
            blockKind: rec.transferAssessment.blockKind === 'retry' ? 'retry' : 'initial',
            phase: ['active', 'result', 'remediation', 'passed'].includes(rec.transferAssessment.phase)
              ? rec.transferAssessment.phase
              : 'active',
            trialsCompleted: Math.max(0, Math.floor(Number(rec.transferAssessment.trialsCompleted) || 0)),
            correctFirstAttempts: Math.max(0, Math.floor(Number(rec.transferAssessment.correctFirstAttempts) || 0)),
            coverageTags: Array.isArray(rec.transferAssessment.coverageTags)
              ? rec.transferAssessment.coverageTags.filter((tag): tag is string => typeof tag === 'string')
              : [],
            failedTrialIndexes: Array.isArray(rec.transferAssessment.failedTrialIndexes)
              ? rec.transferAssessment.failedTrialIndexes.filter((index): index is number => Number.isInteger(index) && index >= 0)
              : [],
            remediationTrialIndexes: Array.isArray(rec.transferAssessment.remediationTrialIndexes)
              ? rec.transferAssessment.remediationTrialIndexes.filter((index): index is number => Number.isInteger(index) && index >= 0)
              : [],
            remediationIndex: Math.max(0, Math.floor(Number(rec.transferAssessment.remediationIndex) || 0)),
            pendingCorrective: Boolean(rec.transferAssessment.pendingCorrective)
          }
        : undefined,
      transferLifetimeTrials: Number.isFinite(rec.transferLifetimeTrials)
        ? Math.max(0, Math.floor(Number(rec.transferLifetimeTrials)))
        : undefined,
      transferLifetimeCorrectFirstAttempts: Number.isFinite(rec.transferLifetimeCorrectFirstAttempts)
        ? Math.max(0, Math.floor(Number(rec.transferLifetimeCorrectFirstAttempts)))
        : undefined,
      harmonySnapshot: normalizeHarmonySnapshot(rec.harmonySnapshot),
      chordRhythmSnapshot: normalizeChordRhythmSnapshot(rec.chordRhythmSnapshot),
      twoHandSnapshot: normalizeTwoHandSnapshot(rec.twoHandSnapshot),
      currentHintLevel: ([0, 1, 2, 3] as HintLevel[]).includes(rec.currentHintLevel as HintLevel)
        ? rec.currentHintLevel as HintLevel
        : HINT_LEVEL.NONE,
      introducedAt: normalizeOptionalTimestamp(rec.introducedAt),
      mixReadyAt: normalizeOptionalTimestamp(rec.mixReadyAt),
      firstFsrsEligibleAt: normalizeOptionalTimestamp(rec.firstFsrsEligibleAt),
      updatedAt: Number.isFinite(rec.updatedAt) ? Number(rec.updatedAt) : 0
    });
  }
  return validRecords;
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeHarmonySnapshot(value: unknown): LearningProgressRecord['harmonySnapshot'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.step !== 'string' || raw.step.length === 0 || raw.step.length > 64) return undefined;
  const count = (candidate: unknown): number => {
    const num = typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
      ? Math.floor(candidate)
      : 0;
    return num;
  };
  return {
    step: raw.step,
    sequenceIndex: count(raw.sequenceIndex),
    quizIndex: count(raw.quizIndex),
    assessmentIndex: count(raw.assessmentIndex),
    assessmentChordIndex: count(raw.assessmentChordIndex),
    awaitingCorrective: raw.awaitingCorrective === true,
    trialHadWrong: raw.trialHadWrong === true
  };
}

