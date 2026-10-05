import {
  NATURAL_NOTES,
  DISPLAY_NAMES
} from '../fsrs/constants';
import { isMastered } from '../fsrs/fsrs6';
import { isFsrsCardDue } from '../fsrs/cardClassification';
import type {
  Card,
  NoteName,
  ReviewKind,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../fsrs/types';
import { choosePractice, chooseConfusionPractice } from '../scheduler/queue';
import {
  filterCurriculumActiveCards,
  isCurriculumCardActive,
  isWhiteKeyCurriculumCompleted,
  type ProgressCollectionInput
} from './curriculumFlow';
import {
  isPhase4BlackKeysCompleted,
  isPhase5NotationCompleted,
  isPhase6EarCompleted,
  MILESTONE_3D_ITEM_IDS
} from './curriculum3d';
import type {
  LearningProgressRecord,
  TrialMode
} from './types';
import {
  resolveIntervalTarget,
  type IntervalId
} from './intervals';
import {
  resolveTriadPitches,
  resolveTriadPracticeRootKeyId
} from './triads';
import {
  buildTriadVoicing,
  CANONICAL_INVERSION_PRACTICE_ITEMS,
  resolveInversionPracticeItem,
  parseChordSymbol,
  type TriadInversion
} from './chordInversions';
import type { TriadQualityId } from '../fsrs/types';

function requireTriadQuality(card: Card): TriadQualityId {
  if (card.note === 'major' || card.note === 'minor') return card.note;
  throw new TypeError(`Expected a triad quality on ${card.skill} card ${card.id}, received ${card.note}.`);
}

function requireIntervalId(card: Card): IntervalId {
  if (card.note === 'P8' || card.note === 'P5' || card.note === 'M3' || card.note === 'm3') return card.note;
  throw new TypeError(`Expected an interval answer on ${card.skill} card ${card.id}, received ${card.note}.`);
}

function requireTriadInversion(card: Card): TriadInversion {
  if (card.note === 'root' || card.note === 'first' || card.note === 'second') return card.note;
  throw new TypeError(`Expected an inversion answer on ${card.skill} card ${card.id}, received ${card.note}.`);
}

export type DailyPracticePriority =
  | 'due_scheduled_review'
  | 'weak_reinforcement'
  | 'confusion_contrast'
  | 'balanced_rotation'
  | 'transfer'
  | 'free_practice';

export type DailyPracticeReason =
  | 'scheduled_due'
  | 'weak_skill'
  | 'recent_error'
  | 'balanced_rotation'
  | 'transfer'
  | 'remediation'
  | 'newly_unlocked'
  | 'fallback_emergency';

export interface ResolveDailyPracticeParams {
  cards: readonly Card[];
  learningProgress?: ProgressCollectionInput;
  reviewLogs?: readonly ReviewLogEvent[];
  settings?: Pick<UserSettings, 'level' | 'sessionPreset' | 'mode'>;
  now?: number;
  recentCards?: readonly Card[];
  recentSkills?: readonly Skill[];
  recentNotes?: readonly NoteName[];
  sessionTrials?: number;
  lastConfusionTrial?: number;
  sessionConfusionReviews?: number;
  sessionTransferTrials?: number;
  audioAvailable?: boolean;
}

export interface DailyPracticeDecision {
  priority: DailyPracticePriority;
  reason: DailyPracticeReason;
  card: Card;
  kind: ReviewKind;
  trialMode: TrialMode;
  eyebrowLabel: string;
  isTransfer: boolean;
  isGrandStaff?: boolean;
}

export interface DailyPracticeSummary {
  scheduledCount: number;
  scheduledAccuracy: string;
  firstAttemptAccuracy: string;
  reinforcementAccuracy: string;
  confusionPairs: string[];
  skillSummary: string | null;
  transferStats: {
    trials: number;
    correct: number;
    accuracy: string | null;
  } | null;
}

export type RetentionMasteryLevel = 'mastered' | 'consolidating' | 'stable';

function normalizeProgressMap(
  input?: ProgressCollectionInput
): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of input) {
      if (item && item.id) map.set(item.id, item);
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [k, v] of Object.entries(input as Record<string, LearningProgressRecord>)) {
    if (v && v.id) map.set(k, v);
  }
  return map;
}

/**
 * Checks whether all 6 phases of the core curriculum have been completed
 * and graduation has been finalized.
 * When true, the application transitions from ACQUISITION to DAILY RETENTION PRACTICE.
 */
export function isCoreCurriculumComplete(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
} | ProgressCollectionInput): boolean {
  const normalized = (input && typeof input === 'object' && ('learningProgress' in input || 'cards' in input))
    ? input as { learningProgress?: ProgressCollectionInput; cards?: any; reviewLogs?: any }
    : { learningProgress: input as ProgressCollectionInput };
  const map = normalizeProgressMap(normalized.learningProgress);
  const p6 = map.get(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);

  // If Phase 6 graduation is persisted as retention, curriculum is complete
  if (p6 && p6.state === 'retention') {
    return true;
  }

  // Otherwise check if all phases (1 to 6) are mastered and p6 is retention
  return (
    isWhiteKeyCurriculumCompleted({
      learningProgress: normalized.learningProgress,
      cards: normalized.cards,
      reviewLogs: normalized.reviewLogs
    }) &&
    isPhase4BlackKeysCompleted(normalized.learningProgress, normalized.cards, normalized.reviewLogs) &&
    isPhase5NotationCompleted(normalized.learningProgress, normalized.cards) &&
    isPhase6EarCompleted(normalized.learningProgress, normalized.cards) &&
    p6?.state === 'retention'
  );
}

/**
 * Derives the active card candidate pool for Daily Practice.
 * Strictly enforces that only curriculum-activated cards participate.
 */
export function buildDailyPracticePool(input: {
  cards: readonly Card[];
  learningProgress?: ProgressCollectionInput;
  reviewLogs?: readonly ReviewLogEvent[];
  level?: 'white' | 'all';
  mode?: string;
  /** Rhythm cards require an available Web Audio context; other cards do not. */
  audioAvailable?: boolean;
}): Card[] {
  const level = input.level ?? 'white';
  const levelCards =
    level === 'all'
      ? input.cards
      : input.cards.filter(c =>
          NATURAL_NOTES.includes(c.note as any) ||
          c.skill === 'intervalBuild' || c.skill === 'intervalIdentify' ||
          c.skill === 'triadBuild' || c.skill === 'triadIdentify' ||
          c.skill === 'triadInversionBuild' || c.skill === 'triadInversionIdentify' ||
          c.skill === 'chordSymbolRead' ||
          c.skill === 'harmonyFunctionIdentify' ||
          c.skill === 'harmonyNextChord' ||
          c.skill === 'harmonyProgressionPlay' ||
          ((c.skill === 'chordPulse' || c.skill === 'chordChangeTiming' || c.skill === 'chordRhythmPattern') && input.audioAvailable === true)
        );

  const modeCards =
    input.mode &&
    input.mode !== 'smart' &&
    ['find', 'identify', 'pattern', 'notationToKey', 'soundToKey'].includes(input.mode)
      ? levelCards.filter(
          c => c.skill === (input.mode === 'pattern' ? 'patternIdentify' : input.mode)
        )
      : levelCards;

  return filterCurriculumActiveCards(modeCards, {
    learningProgress: input.learningProgress,
    cards: input.cards,
    reviewLogs: input.reviewLogs,
    level
  });
}

/**
 * Checks whether selecting a candidate card would violate the controlled interleaving rules:
 * - At most 2 consecutive of the same skill
 * - At most 2 consecutive of the same pitch class
 * - Avoid immediate repetition of the exact same card
 */
export function checkInterleavingConstraint(
  card: Card,
  recentCards: readonly Card[] = [],
  recentSkills: readonly Skill[] = [],
  recentNotes: readonly NoteName[] = []
): { ok: boolean; reason?: 'skill_streak' | 'note_streak' | 'immediate_repeat' } {
  // Avoid immediate exact repeat
  if (recentCards.length > 0 && recentCards[0]?.id === card.id) {
    return { ok: false, reason: 'immediate_repeat' };
  }

  // Check skill streak (>= 2 recent of same skill)
  const effectiveSkills = recentSkills.length > 0
    ? recentSkills
    : recentCards.map(c => c.skill);
  if (
    effectiveSkills.length >= 2 &&
    effectiveSkills[0] === card.skill &&
    effectiveSkills[1] === card.skill
  ) {
    return { ok: false, reason: 'skill_streak' };
  }

  // Check pitch class streak (>= 2 recent of same note)
  const effectiveNotes = recentNotes.length > 0
    ? recentNotes
    : recentCards.map(c => c.note);
  if (
    effectiveNotes.length >= 2 &&
    effectiveNotes[0] === card.note &&
    effectiveNotes[1] === card.note
  ) {
    return { ok: false, reason: 'note_streak' };
  }

  return { ok: true };
}

/**
 * Selects a due scheduled card with controlled interleaving where possible.
 * Invariant: due ordering > cosmetic interleaving. If all due cards violate interleaving,
 * the most urgent due card is still returned!
 */
export function selectDueCardWithInterleaving(
  candidateCards: readonly Card[],
  now: number,
  recentCards: readonly Card[] = [],
  recentSkills: readonly Skill[] = [],
  recentNotes: readonly NoteName[] = [],
  allowConstraintOverride = true
): Card | null {
  const dueCards = candidateCards
    .filter(c => isFsrsCardDue(c, now))
    .sort((a, b) => a.dueAt - b.dueAt);

  if (dueCards.length === 0) return null;
  // Try to find a due card that respects interleaving
  for (const card of dueCards) {
    const { ok } = checkInterleavingConstraint(
      card,
      recentCards,
      recentSkills,
      recentNotes
    );
    if (ok) return card;
  }

  // All Due honors FSRS urgency. Balanced mode can defer a due card briefly when
  // every due choice would repeat the same skill/card and another family is available.
  return allowConstraintOverride ? dueCards[0] : null;
}

/** Selects a stable, non-due card from another available skill family for Balanced sessions. */
export function selectBalancedRotationCard(params: {
  candidateCards: readonly Card[];
  now: number;
  recentCards?: readonly Card[];
  recentSkills?: readonly Skill[];
  recentNotes?: readonly NoteName[];
  sessionTrials?: number;
}): Card | null {
  const {
    candidateCards,
    now,
    recentCards = [],
    recentSkills = recentCards.map(card => card.skill),
    recentNotes = recentCards.map(card => card.note),
    sessionTrials = 0
  } = params;
  const recentIds = new Set(recentCards.map(card => card.id));
  const learnedNonDue = candidateCards.filter(card =>
    !recentIds.has(card.id) &&
    card.reps > 0 &&
    card.memoryState !== 'new' &&
    card.dueAt > now
  );
  const constrained = learnedNonDue.filter(card =>
    checkInterleavingConstraint(card, recentCards, recentSkills, recentNotes).ok
  );
  if (constrained.length === 0) return null;

  const lastSkills = recentSkills.slice(0, 2);
  const differentSkill = constrained.filter(card => !lastSkills.includes(card.skill));
  const skillPool = differentSkill.length > 0 ? differentSkill : constrained;
  const lastNotes = recentNotes.slice(0, 2);
  const differentNote = skillPool.filter(card => !lastNotes.includes(card.note));
  const pool = differentNote.length > 0 ? differentNote : skillPool;
  const stablePool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return stablePool[Math.abs(sessionTrials) % stablePool.length] ?? null;
}

export const WEAK_CARD_THRESHOLDS = {
  maxStabilityForLapse: 4.0, // stability < 4.0
  minLapses: 1,              // lapses >= 1
  minTrialsForAccuracy: 2,   // trials >= 2
  minAccuracyRatio: 0.75,    // accuracy < 75%
  minDifficulty: 6.5         // difficulty >= 6.5
} as const;

/**
 * Identifies weak cards among active cards:
 * - Active lapse (`lapses >= 1` and `stability < 4.0` or `memoryState === 'relearning'`)
 * - Recent failure: graded `Again` (1) in recent review logs
 * - Low accuracy: `trials >= 2` and `firstCorrect / trials < 0.75`
 * - High difficulty: `difficulty >= 6.5`
 */
export function selectWeakCard(
  candidateCards: readonly Card[],
  reviewLogs: readonly ReviewLogEvent[] = [],
  recentCards: readonly Card[] = [],
  recentSkills: readonly Skill[] = [],
  recentNotes: readonly NoteName[] = [],
  allowConstraintOverride = true
): Card | null {
  const recentLogSlice = reviewLogs.slice(-30);
  const recentFailedCardIds = new Set<string>();
  for (const log of recentLogSlice) {
    if (log.grade === 1) {
      recentFailedCardIds.add(log.cardId);
    }
  }

  const weakCandidates = candidateCards.filter(card => {
    // Exclude cards already shown recently
    if (recentCards.some(rc => rc.id === card.id)) return false;

    if (
      card.lapses >= WEAK_CARD_THRESHOLDS.minLapses &&
      (card.stability == null || card.stability < WEAK_CARD_THRESHOLDS.maxStabilityForLapse)
    ) {
      return true;
    }
    if (card.memoryState === 'relearning') {
      return true;
    }
    if (recentFailedCardIds.has(card.id)) {
      return true;
    }
    if (card.stats && card.stats.trials >= WEAK_CARD_THRESHOLDS.minTrialsForAccuracy) {
      const acc = card.stats.firstCorrect / card.stats.trials;
      if (acc < WEAK_CARD_THRESHOLDS.minAccuracyRatio) return true;
    }
    if (card.difficulty != null && card.difficulty >= WEAK_CARD_THRESHOLDS.minDifficulty) {
      return true;
    }
    return false;
  });

  if (weakCandidates.length === 0) return null;

  // Sort by weakness severity (most recent failure / lowest stability)
  const sorted = [...weakCandidates].sort((a, b) => {
    const aFail = recentFailedCardIds.has(a.id) ? 1 : 0;
    const bFail = recentFailedCardIds.has(b.id) ? 1 : 0;
    if (bFail !== aFail) return bFail - aFail;
    const aStab = a.stability ?? 1;
    const bStab = b.stability ?? 1;
    return aStab - bStab;
  });

  // Pick first that satisfies interleaving
  for (const card of sorted) {
    const { ok } = checkInterleavingConstraint(card, recentCards, recentSkills, recentNotes);
    if (ok) return card;
  }

  return allowConstraintOverride ? sorted[0] : null;
}

/**
 * Selects a transfer card from the active pool across modalities.
 * Transfer promotes flexible cross-modal retrieval without mutating FSRS.
 * Pure and deterministic selection: no Math.random().
 */
export function selectTransferCard(params: {
  candidateCards: readonly Card[];
  recentCards?: readonly Card[];
  recentSkills?: readonly Skill[];
  recentNotes?: readonly NoteName[];
  sessionTrials?: number;
}): Card | null {
  const {
    candidateCards,
    recentCards = [],
    recentSkills = [],
    recentNotes = [],
    sessionTrials = 0
  } = params;
  if (candidateCards.length === 0) return null;

  // Filter out recent cards to enforce interleaving
  const available = candidateCards.filter(c => !recentCards.some(rc => rc.id === c.id));
  const pool = available.length > 0 ? available : candidateCards;

  // Sort pool stably by card id for deterministic behavior
  const sortedPool = [...pool].sort((a, b) => a.id.localeCompare(b.id));

  // Try to find a cross-skill candidate:
  // Note that appeared in recent history under a different skill (cross-skill transfer)
  const effectiveSkills = recentSkills.length > 0
    ? recentSkills
    : recentCards.map(c => c.skill);
  const effectiveNotes = recentNotes.length > 0
    ? recentNotes
    : recentCards.map(c => c.note);

  const lastNote = effectiveNotes[0];
  const lastSkill = effectiveSkills[0];

  // Candidates that respect interleaving constraints
  const constrained = sortedPool.filter(card => {
    const { ok } = checkInterleavingConstraint(card, recentCards, effectiveSkills, effectiveNotes);
    return ok;
  });

  const targetList = constrained.length > 0 ? constrained : sortedPool;

  // Look for a candidate whose pitch class was seen 1-4 trials ago but under a DIFFERENT skill
  const crossSkillCandidate = targetList.find(c => {
    const noteSeen = effectiveNotes.slice(0, 4).includes(c.note);
    return noteSeen && c.skill !== lastSkill && c.note !== lastNote;
  });

  if (crossSkillCandidate) return crossSkillCandidate;

  // Rotate skills: prefer a skill different from recent skills using deterministic rotation
  const differentSkillCandidates = targetList.filter(c => c.skill !== lastSkill);
  if (differentSkillCandidates.length > 0) {
    const idx = Math.abs(sessionTrials) % differentSkillCandidates.length;
    return differentSkillCandidates[idx];
  }

  const idx = Math.abs(sessionTrials) % targetList.length;
  return targetList[idx];
}

export const CANONICAL_ACCIDENTAL_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'C#': 'C#',
  'D#': 'D#',
  'F#': 'F#',
  'G#': 'G#',
  'A#': 'A#'
};

export function toCanonicalNoteName(note: string): NoteName {
  const mapped = CANONICAL_ACCIDENTAL_MAP[note];
  if (mapped) return mapped as NoteName;
  return note as NoteName;
}

export interface PracticeCardVisualConfig {
  targetKeyId: string;
  targetKeyIds: string[];
  clef: 'treble' | 'bass' | 'auto' | 'grand';
  isGrandStaff: boolean;
  octave?: number;
  rootKeyId?: string;
  structuralGuideKeyIds?: string[];
  triadKeyIds?: readonly string[];
  inversion?: TriadInversion;
  symbol?: string;
}

export interface TaskVisualState {
  card: Card | null;
  isSessionEnded: boolean;
  targetKeyId: string | null;
  targetKeyIds: readonly string[];
}

/**
 * Defensive invariant for identify tasks and session completion states:
 * 1. When session is ended (isSessionEnded === true), there MUST be NO lingering active card or visual target.
 * 2. When an identify task is active (skill === 'identify' and !isSessionEnded), there MUST be:
 *    - targetKeyId !== null
 *    - targetKeyIds.length === 1
 *    - targetKeyIds[0] === targetKeyId
 */
export function validateIdentifyVisualInvariant(
  state: TaskVisualState
): { valid: boolean; reason?: string } {
  if (state.isSessionEnded) {
    if (state.card !== null || state.targetKeyId !== null || state.targetKeyIds.length > 0) {
      return {
        valid: false,
        reason: `Session ended but active task/visual state lingering (card=${state.card?.id}, targetKeyId=${state.targetKeyId}, targetKeyIds=${state.targetKeyIds.length})`
      };
    }
    return { valid: true };
  }

  if (state.card && state.card.skill === 'identify') {
    if (!state.targetKeyId) {
      return { valid: false, reason: 'Active identify task has null targetKeyId' };
    }
    if (state.targetKeyIds.length !== 1) {
      return {
        valid: false,
        reason: `Active identify task must have exactly 1 targetKeyId, found ${state.targetKeyIds.length}`
      };
    }
    if (state.targetKeyIds[0] !== state.targetKeyId) {
      return {
        valid: false,
        reason: `Active identify task targetKeyIds[0] (${state.targetKeyIds[0]}) does not match targetKeyId (${state.targetKeyId})`
      };
    }
  }

  return { valid: true };
}

/**
 * Resolves keyboard targetKeyId, clef, and grand staff container for card visuals.
 * Frozen 3E Transfer Invariant:
 * Notation transfer is strictly frozen to trained Phase 5 material: treble clef C4–B4.
 * Relative ear transfer is strictly frozen to trained Phase 6 material: octave 4 (C4–B4) with reference C4.
 * settings.notationClef = 'bass' | 'grand' does not expand transfer trials.
 */
export function resolveCardVisualConfig(
  cardOrInput:
    | Card
    | {
        card: Card;
        isTransfer?: boolean;
        isGrandStaff?: boolean;
        kind?: ReviewKind;
        userClef?: 'auto' | 'treble' | 'bass' | 'grand';
        notationClef?: 'auto' | 'treble' | 'bass' | 'grand';
        random?: () => number;
        rootKeyId?: string;
        contextIndex?: number;
        sessionTrials?: number;
      },
  options: {
    kind?: ReviewKind;
    notationClef?: 'auto' | 'treble' | 'bass' | 'grand';
    random?: () => number;
    isGrandStaff?: boolean;
    rootKeyId?: string;
    contextIndex?: number;
    sessionTrials?: number;
  } = {}
): PracticeCardVisualConfig {
  let card: Card;
  let isTransfer: boolean;
  let isGrandStaff: boolean;
  let clefSetting: 'auto' | 'treble' | 'bass' | 'grand';
  let rng: () => number;
  let rootKeyIdOption: string | undefined;
  let contextIndexOption: number | undefined;
  let sessionTrialsOption: number | undefined;

  if ('card' in cardOrInput) {
    card = cardOrInput.card;
    isTransfer = cardOrInput.isTransfer ?? (cardOrInput.kind === 'transfer');
    isGrandStaff = Boolean(cardOrInput.isGrandStaff);
    clefSetting = cardOrInput.userClef ?? cardOrInput.notationClef ?? 'auto';
    rng = cardOrInput.random ?? Math.random;
    rootKeyIdOption = cardOrInput.rootKeyId;
    contextIndexOption = cardOrInput.contextIndex;
    sessionTrialsOption = cardOrInput.sessionTrials;
  } else {
    card = cardOrInput;
    isTransfer = options.kind === 'transfer';
    isGrandStaff = Boolean(options.isGrandStaff);
    clefSetting = options.notationClef ?? 'auto';
    rng = options.random ?? Math.random;
    rootKeyIdOption = options.rootKeyId;
    contextIndexOption = options.contextIndex;
    sessionTrialsOption = options.sessionTrials;
  }

  const canonicalNote = toCanonicalNoteName(card.note);

  if (
    card.skill === 'harmonyFunctionIdentify' ||
    card.skill === 'harmonyNextChord' ||
    card.skill === 'harmonyProgressionPlay'
  ) {
    return {
      targetKeyId: '',
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      clef: 'auto',
      isGrandStaff: false
    };
  }

  if (card.skill === 'chordPulse' || card.skill === 'chordChangeTiming' || card.skill === 'chordRhythmPattern') {
    return {
      targetKeyId: '',
      targetKeyIds: [],
      structuralGuideKeyIds: [],
      clef: 'auto',
      isGrandStaff: false
    };
  }

  // Grand staff transfer trial explicitly requested
  if (isGrandStaff) {
    const isBass =
      card.skill === 'notationBassToKey'
        ? true
        : card.skill === 'notationToKey'
        ? false
        : rng() < 0.5;
    const targetKeyId = isBass ? `${canonicalNote}3` : `${canonicalNote}4`;
    return {
      targetKeyId,
      targetKeyIds: [],
      clef: 'grand',
      isGrandStaff: true,
      octave: isBass ? 3 : 4
    };
  }

  // Milestone 3F: Scheduled, transfer, weak, and confusion reviews for notationBassToKey are ALWAYS bass clef C3–B3.
  // Global settings.notationClef must NOT alter scheduled card semantics.
  if (card.skill === 'notationBassToKey') {
    const targetKeyId = `${canonicalNote}3`;
    return {
      targetKeyId,
      targetKeyIds: [],
      clef: 'bass',
      isGrandStaff: false,
      octave: 3
    };
  }

  if (card.skill === 'notationToKey') {
    // Scheduled, transfer, weak, and confusion reviews for notationToKey are strictly treble clef C4–B4.
    // Global settings.notationClef must NOT alter scheduled card semantics.
    const effectiveKind = 'kind' in cardOrInput ? cardOrInput.kind : options.kind;
    const isScheduledOrDrill =
      effectiveKind === 'scheduled' ||
      effectiveKind === 'practice' ||
      effectiveKind === 'confusion';

    if (isTransfer || isScheduledOrDrill) {
      const targetKeyId = `${canonicalNote}4`;
      return {
        targetKeyId,
        targetKeyIds: [],
        clef: 'treble',
        isGrandStaff: false,
        octave: 4
      };
    }

    // Only in free practice / manual exploration can user clef setting override
    if (clefSetting === 'bass') {
      const targetKeyId = `${canonicalNote}3`;
      return {
        targetKeyId,
        targetKeyIds: [],
        clef: 'bass',
        isGrandStaff: false,
        octave: 3
      };
    }
    if (clefSetting === 'grand') {
      const useBass = rng() < 0.5;
      const targetKeyId = useBass ? `${canonicalNote}3` : `${canonicalNote}4`;
      return {
        targetKeyId,
        targetKeyIds: [],
        clef: useBass ? 'bass' : 'treble',
        isGrandStaff: true,
        octave: useBass ? 3 : 4
      };
    }

    const targetKeyId = `${canonicalNote}4`;
    return {
      targetKeyId,
      targetKeyIds: [],
      clef: 'treble',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'soundToKey') {
    const targetKeyId = `${canonicalNote}4`;
    return {
      targetKeyId,
      targetKeyIds: [],
      clef: 'treble',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'identify') {
    const targetKeyId = `${canonicalNote}4`;
    return {
      targetKeyId,
      targetKeyIds: [targetKeyId],
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'intervalBuild') {
    const intervalId = requireIntervalId(card);
    const rootKeyId = 'C4';
    const { targetKeyId } = resolveIntervalTarget(rootKeyId, intervalId);
    return {
      targetKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [rootKeyId],
      rootKeyId,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'intervalIdentify') {
    const intervalId = requireIntervalId(card);
    const rootKeyId = 'C4';
    const { targetKeyId } = resolveIntervalTarget(rootKeyId, intervalId);
    return {
      targetKeyId,
      targetKeyIds: [rootKeyId, targetKeyId],
      structuralGuideKeyIds: [rootKeyId],
      rootKeyId,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'triadBuild') {
    const quality = requireTriadQuality(card);
    const rootKeyId = resolveTriadPracticeRootKeyId(quality, {
      rootKeyId: rootKeyIdOption,
      contextIndex: contextIndexOption,
      sessionTrials: sessionTrialsOption,
      card,
      random: rng
    });
    const { triadKeyIds } = resolveTriadPitches(rootKeyId, quality);
    return {
      targetKeyId: rootKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [rootKeyId],
      rootKeyId,
      triadKeyIds,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'triadIdentify') {
    const quality = requireTriadQuality(card);
    const rootKeyId = resolveTriadPracticeRootKeyId(quality, {
      rootKeyId: rootKeyIdOption,
      contextIndex: contextIndexOption,
      sessionTrials: sessionTrialsOption,
      card,
      random: rng
    });
    const { triadKeyIds } = resolveTriadPitches(rootKeyId, quality);
    return {
      targetKeyId: rootKeyId,
      targetKeyIds: [...triadKeyIds],
      structuralGuideKeyIds: [rootKeyId],
      rootKeyId,
      triadKeyIds,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'triadInversionBuild') {
    if (card.note === 'slash') {
      const slashItems = CANONICAL_INVERSION_PRACTICE_ITEMS.filter(item =>
        item.skill === 'chordSymbolRead' &&
        item.symbol.includes('/') &&
        parseChordSymbol(item.symbol)?.inversion !== 'root'
      );
      const rotationOffset = contextIndexOption ?? sessionTrialsOption ??
        (card.reps ?? 0) * 3 + (card.lapses ?? 0) * 5;
      const item = slashItems[Math.abs(rotationOffset) % slashItems.length];
      const parsed = parseChordSymbol(item.symbol);
      if (!parsed || !parsed.isSupported || parsed.inversion === 'root') {
        throw new Error(`Invalid canonical slash chord for ${card.id}: ${item.symbol}`);
      }
      const voicing = buildTriadVoicing(item.rootKeyId, parsed.quality, parsed.inversion);
      return {
        targetKeyId: voicing.bassKeyId,
        targetKeyIds: [],
        structuralGuideKeyIds: [voicing.bassKeyId],
        rootKeyId: voicing.rootKeyId,
        triadKeyIds: voicing.keyIds,
        inversion: parsed.inversion,
        symbol: item.symbol,
        clef: 'auto',
        isGrandStaff: false,
        octave: 4
      };
    }
    const inv = (card.note as TriadInversion) || 'first';
    const item = resolveInversionPracticeItem('triadInversionBuild', {
      card,
      sessionTrials: sessionTrialsOption,
      contextIndex: contextIndexOption,
      inversion: inv
    });
    const voicing = buildTriadVoicing(item.rootKeyId, item.quality, inv);
    return {
      targetKeyId: voicing.bassKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [voicing.bassKeyId],
      rootKeyId: voicing.rootKeyId,
      triadKeyIds: voicing.keyIds,
      inversion: inv,
      symbol: item.symbol,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'triadInversionIdentify') {
    const inv = requireTriadInversion(card);
    const item = resolveInversionPracticeItem('triadInversionIdentify', {
      card,
      sessionTrials: sessionTrialsOption,
      contextIndex: contextIndexOption,
      inversion: inv
    });
    const voicing = buildTriadVoicing(item.rootKeyId, item.quality, inv);
    return {
      targetKeyId: voicing.bassKeyId,
      targetKeyIds: [...voicing.keyIds],
      structuralGuideKeyIds: [voicing.bassKeyId],
      rootKeyId: voicing.rootKeyId,
      triadKeyIds: voicing.keyIds,
      inversion: inv,
      symbol: item.symbol,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  if (card.skill === 'chordSymbolRead') {
    const item = resolveInversionPracticeItem('chordSymbolRead', {
      card,
      sessionTrials: sessionTrialsOption,
      contextIndex: contextIndexOption
    });
    const parsed = parseChordSymbol(item.symbol);
    const quality = parsed?.quality ?? 'major';
    const inv = parsed?.inversion ?? 'root';
    const voicing = buildTriadVoicing(item.rootKeyId, quality, inv);
    return {
      targetKeyId: voicing.bassKeyId,
      targetKeyIds: [],
      structuralGuideKeyIds: [voicing.bassKeyId],
      rootKeyId: voicing.rootKeyId,
      triadKeyIds: voicing.keyIds,
      inversion: inv,
      symbol: item.symbol,
      clef: 'auto',
      isGrandStaff: false,
      octave: 4
    };
  }

  const targetKeyId = `${canonicalNote}4`;
  return {
    targetKeyId,
    targetKeyIds: [],
    clef: 'auto',
    isGrandStaff: false,
    octave: 4
  };
}

/**
 * Pure Planning Layer for Daily Practice (Section 4):
 * Orchestrates training after core curriculum completion according to strict canonical priority:
 * 1. Due scheduled reviews (`due_scheduled_review`)
 * 2. Recent failures / weak cards (`weak_reinforcement`)
 * 3. Confusion contrast (`confusion_contrast`)
 * 4. Transfer / cross-modality retrieval (`transfer`)
 * 5. Free practice reinforcement (`free_practice`)
 *
 * Balanced sessions preserve due work while reserving a deterministic interleaving slot
 * after each two consecutive tasks. All Due keeps strict due-card priority.
 */
export function resolveDailyPracticeNext(
  params: ResolveDailyPracticeParams
): DailyPracticeDecision | null {
  const now = params.now ?? Date.now();
  const recentCards = params.recentCards ?? [];
  const recentSkills = params.recentSkills ?? recentCards.map(c => c.skill);
  const recentNotes = params.recentNotes ?? recentCards.map(c => c.note);
  const sessionPreset = params.settings?.sessionPreset ?? 'normal';
  const sessionTrials = params.sessionTrials ?? 0;
  const sessionTransferTrials = params.sessionTransferTrials ?? 0;

  // 1. Build canonical active card pool
  const candidateCards = buildDailyPracticePool({
    cards: params.cards,
    learningProgress: params.learningProgress,
    reviewLogs: params.reviewLogs,
    level: params.settings?.level ?? 'white',
    mode: params.settings?.mode,
    audioAvailable: params.audioAvailable
  });

  if (candidateCards.length === 0) {
    return null;
  }

  // 2. Due Scheduled Reviews remain first priority outside the reserved balanced slot.
  const dueCard = selectDueCardWithInterleaving(
    candidateCards,
    now,
    recentCards,
    recentSkills,
    recentNotes,
    sessionPreset === 'due'
  );

  if (dueCard) {
    return {
      priority: 'due_scheduled_review',
      reason: 'scheduled_due',
      card: dueCard,
      kind: 'scheduled',
      trialMode: 'scheduledReview',
      eyebrowLabel: 'ПЛАНОВОЕ ПОВТОРЕНИЕ',
      isTransfer: false
    };
  }

  // If the user selected "All Due" preset and all due cards are finished, session completes!
  if (sessionPreset === 'due') {
    return null;
  }

  // 3. Priority 2: Weak Cards / Recent Failures (Weak always wins over lower priorities)
  const weakCard = selectWeakCard(
    candidateCards,
    params.reviewLogs ?? [],
    recentCards,
    recentSkills,
    recentNotes,
    false
  );

  if (weakCard) {
    return {
      priority: 'weak_reinforcement',
      reason: (params.reviewLogs ?? []).slice(-30).some(log => log.cardId === weakCard.id && log.grade === 1)
        ? 'recent_error'
        : 'weak_skill',
      card: weakCard,
      kind: 'practice',
      trialMode: 'mixedRetrieval',
      eyebrowLabel: 'ЗАКРЕПЛЕНИЕ',
      isTransfer: false
    };
  }

  // 4. Priority 3: Confusion Contrast (registered confusion wins over transfer)
  const lastConfusion = params.lastConfusionTrial ?? -99;
  const confusionReviews = params.sessionConfusionReviews ?? 0;
  if (sessionTrials - lastConfusion >= 3 && confusionReviews < 3) {
    const confusionCard = chooseConfusionPractice(
      candidateCards,
      (params.reviewLogs ?? []) as readonly {
        kind: string;
        note: NoteName;
        answer?: NoteName | null;
      }[],
      recentCards,
      lastConfusion,
      sessionTrials,
      confusionReviews
    );
    if (
      confusionCard &&
      isCurriculumCardActive(confusionCard, {
        learningProgress: params.learningProgress,
        cards: params.cards,
        reviewLogs: params.reviewLogs,
        level: params.settings?.level ?? 'white'
      })
    ) {
      return {
        priority: 'confusion_contrast',
        reason: 'recent_error',
        card: confusionCard,
        kind: 'confusion',
        trialMode: 'mixedRetrieval',
        eyebrowLabel: 'КОНТРАСТ',
        isTransfer: false
      };
    }
  }

  const balancedRotationTurn = sessionTrials > 0 && sessionTrials % 3 === 2;
  if (balancedRotationTurn) {
    const rotationCard = selectBalancedRotationCard({
      candidateCards,
      now,
      recentCards,
      recentSkills,
      recentNotes,
      sessionTrials
    });
    if (rotationCard) {
      return {
        priority: 'balanced_rotation',
        reason: 'balanced_rotation',
        card: rotationCard,
        kind: 'practice',
        trialMode: 'freePractice',
        eyebrowLabel: 'СБАЛАНСИРОВАННАЯ ПРАКТИКА',
        isTransfer: false
      };
    }
  }

  // 5. Priority 4: Transfer / Cross-Modality Retrieval
  // Explicit quota and interleaving policy:
  // - Reached only after due reviews, weak cards, and confusion drills are handled.
  // - Appears on periodic cadence (every 3rd trial: sessionTrials % 3 === 0).
  // - Quick preset (3-min) caps transfer to at most 2 trials (sessionTransferTrials < 2).
  const isTransferTurn = sessionTrials % 3 === 0;
  const transferQuotaAvailable = sessionPreset === 'quick' ? sessionTransferTrials < 2 : true;

  if (isTransferTurn && transferQuotaAvailable) {
    const transferCard = selectTransferCard({
      candidateCards,
      recentCards,
      recentSkills,
      recentNotes,
      sessionTrials
    });

    if (transferCard) {
      const progressMap = normalizeProgressMap(params.learningProgress);
      const isGrandModuleDone =
        progressMap.get('advanced-grand:complete')?.state === 'retention' ||
        progressMap.get('advanced-bass-module:complete')?.state === 'retention' ||
        progressMap.get('advanced-grand:transfer')?.state === 'retention';
      const isNotationTransfer =
        transferCard.skill === 'notationToKey' || transferCard.skill === 'notationBassToKey';
      const isGrandStaff = Boolean(isGrandModuleDone && isNotationTransfer);

      return {
        priority: 'transfer',
        reason: 'transfer',
        card: transferCard,
        kind: 'transfer',
        trialMode: 'transfer',
        eyebrowLabel: isGrandStaff ? 'ПЕРЕНОС · БОЛЬШАЯ СИСТЕМА' : 'ПЕРЕНОС НАВЫКА',
        isTransfer: true,
        isGrandStaff
      };
    }
  }

  // 6. Priority 5: Free Practice Reinforcement (ONLY over curriculum-active cards)
  const interleavedPracticeCards = candidateCards.filter(card =>
    checkInterleavingConstraint(card, recentCards, recentSkills, recentNotes).ok
  );
  const withoutImmediateRepeat = candidateCards.filter(card => card.id !== recentCards[0]?.id);
  const fallbackPool = interleavedPracticeCards.length > 0
    ? interleavedPracticeCards
    : withoutImmediateRepeat.length > 0
      ? withoutImmediateRepeat
      : candidateCards;
  const practiceCard = choosePractice(fallbackPool, now, recentCards) ??
    [...fallbackPool].sort((a, b) => a.id.localeCompare(b.id))[0];
  const usedEmergencyFallback = fallbackPool.length === 1 &&
    candidateCards.length > 1 &&
    fallbackPool[0].id === recentCards[0]?.id;
  return {
    priority: 'free_practice',
    reason: practiceCard.reps === 0
      ? 'newly_unlocked'
      : usedEmergencyFallback
        ? 'fallback_emergency'
        : 'balanced_rotation',
    card: practiceCard,
    kind: 'practice',
    trialMode: 'freePractice',
    eyebrowLabel: 'ЗАКРЕПЛЕНИЕ',
    isTransfer: false
  };
}

/**
 * Derives retention mastery level from existing card memory state and FSRS stability:
 * - 'stable': mature retention, high stability (>= 7.0 days)
 * - 'mastered': successfully graduated curriculum and active in scheduled reviews (stability >= 2.5)
 * - 'consolidating': actively reinforcing in practice or recovering from recent lapse
 */
export function deriveRetentionMastery(
  card?: Card
): RetentionMasteryLevel {
  if (!card || card.reps === 0) {
    return 'consolidating';
  }
  if (card.lapses > 0 && (card.stability == null || card.stability < 3.0)) {
    return 'consolidating';
  }
  if ((card.stability ?? 0) >= 7.0 && card.reps >= 2 && card.lastGrade !== 1) {
    return 'stable';
  }
  if (isMastered(card) || (card.stability ?? 0) >= 2.5) {
    return 'mastered';
  }
  return 'consolidating';
}

/**
 * Builds the session summary metrics for Daily Practice.
 */
export function buildDailyPracticeSummary(input: {
  sessionTrials: number;
  sessionScore: number;
  sessionScheduledReviews: number;
  sessionScheduledCorrect: number;
  sessionTransferTrials: number;
  sessionTransferCorrect: number;
  reviewLogs?: readonly ReviewLogEvent[];
  sessionId?: string;
  startedAt?: number;
  endedAt?: number;
}): DailyPracticeSummary {
  const trials = input.sessionTrials;
  const score = input.sessionScore;
  const firstAttemptAccuracy = trials > 0 ? `${Math.round((score / trials) * 100)}%` : '—';

  const schedCount = input.sessionScheduledReviews;
  const schedCorrect = input.sessionScheduledCorrect;
  const scheduledAccuracy = schedCount > 0 ? `${Math.round((schedCorrect / schedCount) * 100)}%` : '—';

  const nonSchedTrials = trials - schedCount;
  const nonSchedScore = Math.max(0, score - schedCorrect);
  const reinforcementAccuracy = nonSchedTrials > 0 ? `${Math.round((nonSchedScore / nonSchedTrials) * 100)}%` : '—';

  const sessionLogs = input.reviewLogs
    ? input.reviewLogs.filter(log => input.sessionId
      ? log.sessionId === input.sessionId
      : Boolean(input.startedAt && input.endedAt && log.ts >= input.startedAt && log.ts <= input.endedAt))
    : [];

  const skillCounts = new Map<string, number>();
  for (const log of sessionLogs) {
    const family = log.skill === 'find' || log.skill === 'identify' || log.skill === 'patternIdentify'
      ? 'Ноты'
      : log.skill === 'soundToKey'
        ? 'Слух'
        : log.skill === 'notationToKey' || log.skill === 'notationBassToKey'
          ? 'Чтение нот'
          : log.skill === 'intervalBuild' || log.skill === 'intervalIdentify'
            ? 'Интервалы'
            : log.skill === 'triadBuild' || log.skill === 'triadIdentify' ||
                log.skill === 'triadInversionBuild' || log.skill === 'triadInversionIdentify' ||
                log.skill === 'chordSymbolRead'
              ? 'Аккорды'
              : 'Другое';
    skillCounts.set(family, (skillCounts.get(family) ?? 0) + 1);
  }
  const skillSummary = skillCounts.size > 0
    ? `${trials} заданий · ${[...skillCounts].map(([family, count]) => `${family}: ${count}`).join(' · ')}`
    : null;

  // Identify confusion pairs from this session's first-attempt review events.
  const confusionPairs: string[] = [];
  if (sessionLogs.length > 0) {
    for (const log of sessionLogs) {
      if (log.firstCorrect === false && log.answer && log.answer !== log.note) {
        const pair = `${DISPLAY_NAMES[log.note]} ↔ ${DISPLAY_NAMES[log.answer as NoteName] ?? log.answer}`;
        if (!confusionPairs.includes(pair)) {
          confusionPairs.push(pair);
        }
      }
    }
  }

  const transferStats = input.sessionTransferTrials > 0
    ? {
        trials: input.sessionTransferTrials,
        correct: input.sessionTransferCorrect,
        accuracy: `${Math.round((input.sessionTransferCorrect / input.sessionTransferTrials) * 100)}%`
      }
    : null;

  return {
    scheduledCount: schedCount,
    scheduledAccuracy,
    firstAttemptAccuracy,
    reinforcementAccuracy,
    confusionPairs,
    skillSummary,
    transferStats
  };
}
