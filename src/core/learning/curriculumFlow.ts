import { DISPLAY_NAMES, NATURAL_NOTES } from '../fsrs/constants';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import type {
  Card,
  NoteName,
  ReviewKind,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../fsrs/types';
import {
  canUseInputForSkill,
  type InputChannel
} from '../input/inputPolicy';
import { chooseDue, chooseNew, choosePractice, chooseConfusionPractice } from '../scheduler/queue';
import {
  FIRST_RUN_CF_ITEM_IDS,
  evaluateFirstRunCfEntry,
  resolveFirstRunRegionContext
} from './firstRunCf';
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
import { harmonyCardGateSatisfied } from './harmony';
import { chordRhythmCardGateSatisfied } from './chordRhythm';
import {
  ALL_WHITE_CURRICULUM_NOTES,
  CURRICULUM_ACQUISITION_ORDER,
  DEFAULT_WHITE_KEY_CURRICULUM_CONFIG,
  WHITE_KEY_GEOMETRY,
  buildInitialAllWhiteMixQueue,
  buildInitialIdentifyQueue,
  buildInitialLocalMixQueue,
  buildWhiteKeyContrastFeedback,
  getDeterministicKeyIdForWhiteNote,
  getDeterministicOctaveForTrial,
  getIdentifyPoolForStage,
  getLocalMixPool,
  getStructuralGuideForWhiteNote,
  isValidWhiteKeyRegionContext,
  scheduleMissedWhiteMixNote,
  type CurriculumAcquisitionNote,
  type CurriculumIdentifyStageId,
  type WhiteKeyCurriculumConfig,
  type WhiteKeyNote
} from './whiteKeys';

export type NoteAcquisitionSubStage =
  | 'model'
  | 'guided'
  | 'qualify'
  | 'localMix'
  | 'delayedCheck';

export type WhiteKeyCurriculumStep =
  | 'dModel'
  | 'dGuided'
  | 'dQualify'
  | 'dLocalMix'
  | 'dDelayedCheck'
  | 'eModel'
  | 'eGuided'
  | 'eQualify'
  | 'eLocalMix'
  | 'eDelayedCheck'
  | 'cdeIdentify'
  | 'bModel'
  | 'bGuided'
  | 'bQualify'
  | 'bLocalMix'
  | 'bDelayedCheck'
  | 'fbIdentify'
  | 'gModel'
  | 'gGuided'
  | 'gQualify'
  | 'gLocalMix'
  | 'gDelayedCheck'
  | 'aModel'
  | 'aGuided'
  | 'aQualify'
  | 'aLocalMix'
  | 'aDelayedCheck'
  | 'fgabIdentify'
  | 'allWhiteMix'
  | 'allWhiteIdentify'
  | 'phase3Complete';

export const WHITE_KEY_CURRICULUM_STEPS: readonly WhiteKeyCurriculumStep[] = [
  'dModel',
  'dGuided',
  'dQualify',
  'dLocalMix',
  'dDelayedCheck',
  'eModel',
  'eGuided',
  'eQualify',
  'eLocalMix',
  'eDelayedCheck',
  'cdeIdentify',
  'bModel',
  'bGuided',
  'bQualify',
  'bLocalMix',
  'bDelayedCheck',
  'fbIdentify',
  'gModel',
  'gGuided',
  'gQualify',
  'gLocalMix',
  'gDelayedCheck',
  'aModel',
  'aGuided',
  'aQualify',
  'aLocalMix',
  'aDelayedCheck',
  'fgabIdentify',
  'allWhiteMix',
  'allWhiteIdentify',
  'phase3Complete'
] as const;

export const WHITE_KEY_CURRICULUM_ITEM_IDS = {
  NOTE_D: 'curriculum-note:D',
  NOTE_E: 'curriculum-note:E',
  NOTE_B: 'curriculum-note:B',
  NOTE_G: 'curriculum-note:G',
  NOTE_A: 'curriculum-note:A',
  MIX_D: 'curriculum-mix:D',
  MIX_E: 'curriculum-mix:E',
  MIX_B: 'curriculum-mix:B',
  MIX_G: 'curriculum-mix:G',
  MIX_A: 'curriculum-mix:A',
  IDENTIFY_CDE: 'curriculum-identify:CDE',
  IDENTIFY_FB: 'curriculum-identify:FB',
  IDENTIFY_FGAB: 'curriculum-identify:FGAB',
  MIX_ALL_WHITE: 'curriculum-mix:ALL_WHITE',
  IDENTIFY_ALL_WHITE: 'curriculum-identify:ALL_WHITE',
  PHASE3_COMPLETE: 'curriculum-phase3:complete'
} as const;

export const WHITE_KEY_CURRICULUM_ALL_ITEM_IDS: readonly string[] = [
  FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3,
  FIRST_RUN_CF_ITEM_IDS.ANCHOR_C,
  FIRST_RUN_CF_ITEM_IDS.ANCHOR_F,
  FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF,
  FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF,
  WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_D,
  WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E,
  WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_B,
  WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_G,
  WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_A,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_D,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_E,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_B,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_G,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_A,
  WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE,
  WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB,
  WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB,
  WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE,
  WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE,
  WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE
] as const;

export function getNoteCurriculumItemId(note: WhiteKeyNote): string {
  if (note === 'C') return FIRST_RUN_CF_ITEM_IDS.ANCHOR_C;
  if (note === 'F') return FIRST_RUN_CF_ITEM_IDS.ANCHOR_F;
  return `curriculum-note:${note}`;
}

export function getNoteMixCurriculumItemId(
  note: CurriculumAcquisitionNote
): string {
  return `curriculum-mix:${note}`;
}

export function getIdentifyStageItemId(
  stage: CurriculumIdentifyStageId
): string {
  switch (stage) {
    case 'cdeIdentify':
      return WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE;
    case 'fbIdentify':
      return WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB;
    case 'fgabIdentify':
      return WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB;
    case 'allWhiteIdentify':
      return WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE;
  }
}

export function getNoteStepName(
  note: CurriculumAcquisitionNote,
  subStage: NoteAcquisitionSubStage
): WhiteKeyCurriculumStep {
  const prefix = note.toLowerCase() as 'd' | 'e' | 'b' | 'g' | 'a';
  switch (subStage) {
    case 'model':
      return `${prefix}Model` as WhiteKeyCurriculumStep;
    case 'guided':
      return `${prefix}Guided` as WhiteKeyCurriculumStep;
    case 'qualify':
      return `${prefix}Qualify` as WhiteKeyCurriculumStep;
    case 'localMix':
      return `${prefix}LocalMix` as WhiteKeyCurriculumStep;
    case 'delayedCheck':
      return `${prefix}DelayedCheck` as WhiteKeyCurriculumStep;
  }
}

export interface CurriculumStepDescriptor {
  step: WhiteKeyCurriculumStep;
  kind: 'noteAcquisition' | 'identifyMix' | 'allWhiteMix' | 'complete';
  focusNote: CurriculumAcquisitionNote | null;
  subStage: NoteAcquisitionSubStage | null;
  identifyStage: CurriculumIdentifyStageId | null;
  phase: 2 | 3;
}

const NOTE_PREFIX_MAP: Record<string, CurriculumAcquisitionNote> = {
  d: 'D',
  e: 'E',
  b: 'B',
  g: 'G',
  a: 'A'
};

export function describeCurriculumStep(
  step: WhiteKeyCurriculumStep
): CurriculumStepDescriptor {
  if (step === 'phase3Complete') {
    return {
      step,
      kind: 'complete',
      focusNote: null,
      subStage: null,
      identifyStage: null,
      phase: 3
    };
  }
  if (step === 'allWhiteMix') {
    return {
      step,
      kind: 'allWhiteMix',
      focusNote: null,
      subStage: null,
      identifyStage: null,
      phase: 3
    };
  }
  if (
    step === 'cdeIdentify' ||
    step === 'fbIdentify' ||
    step === 'fgabIdentify' ||
    step === 'allWhiteIdentify'
  ) {
    return {
      step,
      kind: 'identifyMix',
      focusNote: null,
      subStage: null,
      identifyStage: step,
      phase: step === 'cdeIdentify' || step === 'fbIdentify' ? 2 : 3
    };
  }

  const prefix = step[0];
  const focusNote = NOTE_PREFIX_MAP[prefix] ?? 'D';
  const rest = step.slice(1);
  const subStage: NoteAcquisitionSubStage =
    rest === 'Model'
      ? 'model'
      : rest === 'Guided'
        ? 'guided'
        : rest === 'Qualify'
          ? 'qualify'
          : rest === 'LocalMix'
            ? 'localMix'
            : 'delayedCheck';
  const phase: 2 | 3 =
    focusNote === 'D' || focusNote === 'E' || focusNote === 'B' ? 2 : 3;

  return {
    step,
    kind: 'noteAcquisition',
    focusNote,
    subStage,
    identifyStage: null,
    phase
  };
}

export type ProgressCollectionInput =
  | ReadonlyMap<string, LearningProgressRecord>
  | readonly LearningProgressRecord[]
  | Record<string, LearningProgressRecord>
  | undefined;

function normalizeProgressMap(
  input?: ProgressCollectionInput
): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) {
    return new Map(input);
  }
  if (Array.isArray(input)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of input) {
      if (item && typeof item.id === 'string') {
        map.set(item.id, item);
      }
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [key, val] of Object.entries(
    input as Record<string, LearningProgressRecord>
  )) {
    if (val && typeof val === 'object') {
      map.set(key, val);
    }
  }
  return map;
}

function normalizeCardsMap(
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): Map<string, Card> {
  if (!cards) return new Map();
  if (cards instanceof Map) return new Map(cards);
  const map = new Map<string, Card>();
  for (const c of cards as readonly Card[]) {
    if (c && typeof c.id === 'string') {
      map.set(c.id, c);
    }
  }
  return map;
}

/**
 * Extracts only the unhinted (`H0`) regional contexts (`region-D2`..`region-D5`, etc.)
 * from a note's `LearningProgressRecord.contexts` array, excluding `guided:`, `model:`,
 * or `pending:` markers and excluding right-edge `region-C6`.
 */
export function getUnhintedWhiteNoteContexts(
  record: LearningProgressRecord | undefined
): string[] {
  if (!record || !Array.isArray(record.contexts)) return [];
  return record.contexts.filter(
    ctx =>
      !ctx.startsWith('guided:') &&
      !ctx.startsWith('model:') &&
      !ctx.startsWith('pending:') &&
      isValidWhiteKeyRegionContext(ctx)
  );
}

/**
 * Checks whether an existing user has meaningful stored evidence (`Card.reps > 0`,
 * `Card.stats.scheduledSuccesses > 0`, `Card.stats.firstCorrect > 0`, or a successful
 * scheduled/new `ReviewLogEvent`) for a specific white note.
 */
export function hasMeaningfulLegacyWhiteNoteEvidence(
  note: WhiteKeyNote,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const cardsMap = normalizeCardsMap(cards);
  const findCard = cardsMap.get(`find:${note}`);
  if (
    findCard &&
    (findCard.reps > 0 ||
      (findCard.stats &&
        (findCard.stats.scheduledSuccesses > 0 ||
          findCard.stats.firstCorrect > 0)))
  ) {
    return true;
  }

  if (Array.isArray(reviewLogs)) {
    for (const ev of reviewLogs) {
      if (
        ev &&
        ev.note === note &&
        (!ev.skill || ev.skill === 'find') &&
        ev.firstCorrect === true &&
        (!ev.kind || ev.kind === 'scheduled' || ev.kind === 'new')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Explicit Acquisition Gate (`MIX_READY`, Section 19):
 * True when a white note has passed `model -> guided -> qualify` (`state === 'mixReady' | 'retention'`)
 * or has existing legacy mastery evidence, allowing it to be interleaved with known notes.
 * Guided attempts alone (`state === 'guided'`) NEVER satisfy `MIX_READY`.
 */
export function isNoteMixReady(
  note: WhiteKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const rec = map.get(getNoteCurriculumItemId(note));
  if (rec && (rec.state === 'mixReady' || rec.state === 'retention')) {
    return true;
  }
  // Only fall back to legacy card/review evidence if there is no active in-progress record
  // that is still in unseen/introduced/guided/qualifying
  if (rec && rec.state !== 'unseen') {
    return false;
  }
  return hasMeaningfulLegacyWhiteNoteEvidence(note, cards, reviewLogs);
}

/**
 * Explicit Retention Gate (`RETENTION_MASTERED`, Section 19):
 * True ONLY when a white note has passed an unhinted H0 `delayedCheck` (`state === 'retention'`)
 * or has existing legacy scheduled/review mastery evidence.
 * `state === 'mixReady'` or guided attempts NEVER satisfy `RETENTION_MASTERED`.
 */
export function isNoteRetentionMastered(
  note: WhiteKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const phase3Done = map.get(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE);
  if (phase3Done && phase3Done.state === 'retention') {
    return true;
  }

  const rec = map.get(getNoteCurriculumItemId(note));
  if (rec) {
    if (rec.state === 'retention') {
      return true;
    }
    if (rec.contexts.includes('pending:delayedRetry')) {
      return false;
    }
    if (rec.state !== 'unseen') {
      return false;
    }
  }

  return hasMeaningfulLegacyWhiteNoteEvidence(note, cards, reviewLogs);
}

export interface CurriculumCardActivationInput {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
  level?: 'white' | 'all';
  settings?: Pick<UserSettings, 'level'>;
}

/**
 * Single canonical source of truth for whether a `Card` (`skill:note`) is active
 * and eligible to be selected by the normal FSRS scheduler (Section 22):
 * - Unseen curriculum cards (`find:D`, `find:E`, `find:B`, `find:G`, `find:A`, `identify:*`)
 *   are NEVER active until they pass their pedagogical acquisition + delayed/identify gate.
 * - Phase 4 Black Keys (`C#`, `D#`, `F#`, `G#`, `A#`), Phase 5 (`notationToKey:<note>`),
 *   and Phase 6 (`soundToKey:<note>`) activate per-card only after their own independent
 *   H0 `delayedCheck` reaches `retention` (and while `settings.level !== 'white'` for black keys).
 */
export function isCurriculumCardActive(
  cardOrId: Pick<Card, 'id' | 'skill' | 'note' | 'reps'> | string,
  input: CurriculumCardActivationInput = {}
): boolean {
  const cardsMap = normalizeCardsMap(input.cards);
  let id: string;
  let skill: Skill;
  let note: NoteName;
  let reps = 0;

  if (typeof cardOrId === 'string') {
    id = cardOrId;
    const existing = cardsMap.get(id);
    if (existing) {
      skill = existing.skill;
      note = existing.note;
      reps = existing.reps;
    } else {
      const [rawSkill, rawNote] = id.split(':');
      skill = (rawSkill as Skill) || 'find';
      note = (rawNote as NoteName) || 'C';
    }
  } else {
    id = cardOrId.id;
    skill = cardOrId.skill;
    note = cardOrId.note;
    reps = cardOrId.reps ?? cardsMap.get(id)?.reps ?? 0;
  }

  const effectiveLevel = input.level ?? input.settings?.level;
  const progressMap = normalizeProgressMap(input.learningProgress);

  // Milestone 3G Advanced Module: Interval Foundations (`intervalBuild:<id>` and `intervalIdentify:<id>`)
  if (skill === 'intervalBuild' || skill === 'intervalIdentify') {
    const intervalId = note;
    const typePrefix = skill === 'intervalBuild' ? 'build' : 'identify';
    const intervalRec = progressMap.get(`advanced-interval-${typePrefix}:${intervalId}`);
    if (intervalRec) {
      if (intervalRec.contexts.includes('pending:delayedRetry')) {
        return false;
      }
      if (intervalRec.state === 'retention') {
        return true;
      }
      if (intervalRec.state !== 'unseen') {
        return false;
      }
    }
    const moduleDone = progressMap.get('advanced-interval:complete');
    if (moduleDone && moduleDone.state === 'retention') {
      return true;
    }
    return reps > 0;
  }

  // Milestone 3H Advanced Module: Triads (`triadBuild:<quality>` and `triadIdentify:<quality>`)
  if (skill === 'triadBuild' || skill === 'triadIdentify') {
    const quality = note;
    const typePrefix = skill === 'triadBuild' ? 'build' : 'identify';
    const triadRec = progressMap.get(`advanced-triad-${typePrefix}:${quality}`);
    if (triadRec) {
      if (triadRec.contexts.includes('pending:delayedRetry')) {
        return false;
      }
      if (triadRec.state === 'retention') {
        return true;
      }
      if (triadRec.state !== 'unseen') {
        return false;
      }
    }
    const moduleDone = progressMap.get('advanced-triad:complete');
    if (moduleDone && moduleDone.state === 'retention') {
      return true;
    }
    return reps > 0;
  }

  // Milestone 3I Advanced Module: inversion and slash-chord retention cards.
  // Keep these mappings local: chordInversions imports this module, so importing
  // its item IDs here would introduce a circular dependency.
  const inversionItemIds: string[] | null =
    skill === 'triadInversionBuild'
      ? note === 'first'
        ? ['advanced-inversion-build:first']
        : note === 'second'
          ? ['advanced-inversion-build:second']
          : note === 'slash'
            ? ['advanced-inversion-build:slash']
            : null
      : skill === 'triadInversionIdentify'
        ? ['advanced-inversion-identify:inversion']
        : skill === 'chordSymbolRead'
          ? note === 'slash'
            ? ['advanced-inversion:chord-symbols', 'advanced-inversion-build:slash']
            : ['advanced-inversion:chord-symbols']
          : null;

  if (inversionItemIds) {
    const inversionRecords = inversionItemIds.map(id => progressMap.get(id));
    if (inversionRecords.some(rec => rec?.contexts.includes('pending:delayedRetry'))) {
      return false;
    }
    const moduleDone = progressMap.get('advanced-inversion:complete');
    if (moduleDone?.state === 'retention') {
      return true;
    }
    if (inversionRecords.every(rec => rec?.state === 'retention')) {
      return true;
    }
    if (inversionRecords.some(rec => rec && rec.state !== 'unseen')) {
      return false;
    }
    return reps > 0;
  }

  // Milestone 3J cards remain new/inactive until their specific learning gate.
  if (
    skill === 'harmonyFunctionIdentify' ||
    skill === 'harmonyNextChord' ||
    skill === 'harmonyProgressionPlay'
  ) {
    return harmonyCardGateSatisfied(skill, note, progressMap);
  }

  if (skill === 'chordPulse' || skill === 'chordChangeTiming' || skill === 'chordRhythmPattern') {
    return chordRhythmCardGateSatisfied(skill, note, progressMap);
  }

  const isWhite = (ALL_WHITE_CURRICULUM_NOTES as readonly string[]).includes(note);

  if (!isWhite) {
    // Explicit user setting `level === 'white'` always excludes black-key cards
    // even if Phase 4 was previously completed.
    if (effectiveLevel === 'white') {
      return false;
    }

    // `patternIdentify` only exists for white landmark notes (`C, F, E, B`).
    if (skill !== 'find' && skill !== 'identify') {
      return false;
    }

    // Phase 4 Black Keys (`C#`, `D#`, `F#`, `G#`, `A#`)
    const blackRec = progressMap.get(`curriculum-note:${note}`);
    if (
      blackRec &&
      blackRec.state !== 'unseen' &&
      blackRec.state !== 'retention'
    ) {
      return false;
    }
    if (blackRec && blackRec.contexts.includes('pending:delayedRetry')) {
      return false;
    }
    if (reps > 0) {
      return true;
    }

    const phase4Done = progressMap.get('curriculum-phase4:complete');
    const blackRetention =
      (phase4Done && phase4Done.state === 'retention') ||
      (blackRec &&
        blackRec.state === 'retention' &&
        !blackRec.contexts.includes('pending:delayedRetry'));

    if (!blackRetention) {
      return false;
    }

    if (skill === 'find') {
      return true;
    }

    if (skill === 'identify') {
      const allBlackId = progressMap.get('curriculum-identify:ALL_BLACK');
      if (
        (phase4Done && phase4Done.state === 'retention') ||
        (allBlackId &&
          (allBlackId.state === 'mixReady' ||
            allBlackId.state === 'retention'))
      ) {
        return true;
      }
      if (note === 'C#' || note === 'D#') {
        const twoId = progressMap.get('curriculum-identify:TWO_BLACK');
        return !!(
          twoId &&
          (twoId.state === 'mixReady' || twoId.state === 'retention')
        );
      }
      if (note === 'F#' || note === 'G#' || note === 'A#') {
        const threeId = progressMap.get('curriculum-identify:THREE_BLACK');
        return !!(
          threeId &&
          (threeId.state === 'mixReady' || threeId.state === 'retention')
        );
      }
    }

    return false;
  }

  const whiteNote = note as WhiteKeyNote;

  // Phase 5 — Staff Notation (`notationToKey:<note>`) — per-note activation
  if (skill === 'notationToKey') {
    const notationNoteRec = progressMap.get(
      `curriculum-notation-note:${whiteNote}`
    );
    if (notationNoteRec) {
      if (notationNoteRec.contexts.includes('pending:delayedRetry')) {
        return false;
      }
      if (notationNoteRec.state === 'retention') {
        return true;
      }
      if (notationNoteRec.state !== 'unseen') {
        return false;
      }
    }
    const phase5Done = progressMap.get('curriculum-phase5:complete');
    if (phase5Done && phase5Done.state === 'retention') {
      return true;
    }
    return reps > 0;
  }

  // Phase 6 — Relative Ear (`soundToKey:<note>`) — per-note activation
  if (skill === 'soundToKey') {
    const earNoteRec = progressMap.get(`curriculum-ear-note:${whiteNote}`);
    if (earNoteRec) {
      if (earNoteRec.contexts.includes('pending:delayedRetry')) {
        return false;
      }
      if (earNoteRec.state === 'retention') {
        return true;
      }
      if (earNoteRec.state !== 'unseen') {
        return false;
      }
    }
    const phase6Done = progressMap.get('curriculum-phase6:complete');
    if (phase6Done && phase6Done.state === 'retention') {
      return true;
    }
    return reps > 0;
  }

  // Milestone 3F Advanced Module: Bass Clef Notation (`notationBassToKey:<note>`) — per-note activation
  if (skill === 'notationBassToKey') {
    const bassNoteRec = progressMap.get(`advanced-bass-note:${whiteNote}`);
    if (bassNoteRec) {
      if (bassNoteRec.contexts.includes('pending:delayedRetry')) {
        return false;
      }
      if (bassNoteRec.state === 'retention') {
        return true;
      }
      if (bassNoteRec.state !== 'unseen') {
        return false;
      }
    }
    const moduleDone =
      progressMap.get('advanced-grand:complete') ||
      progressMap.get('advanced-bass-module:complete') ||
      progressMap.get('advanced-grand:transfer');
    if (moduleDone && moduleDone.state === 'retention') {
      return true;
    }
    return reps > 0;
  }

  // Pattern Identify (`C, F, E, B`) activates once Phase 3 is complete (or if legacy reps > 0)
  if (skill === 'patternIdentify') {
    if (!['C', 'F', 'E', 'B'].includes(whiteNote)) {
      return false;
    }
    if (reps > 0) {
      return true;
    }
    const phase3Done = progressMap.get(
      WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE
    );
    return !!(phase3Done && phase3Done.state === 'retention');
  }

  // If the white note has an explicit in-progress 3C record that has NOT reached 'retention'
  // (e.g. failed delayedCheck with pending:delayedRetry, or currently in guided/qualify/localMix),
  // it is NOT active for normal random scheduler selection yet.
  const noteRec = progressMap.get(getNoteCurriculumItemId(whiteNote));
  if (
    noteRec &&
    noteRec.state !== 'unseen' &&
    noteRec.state !== 'retention'
  ) {
    return false;
  }
  if (noteRec && noteRec.contexts.includes('pending:delayedRetry')) {
    return false;
  }

  // Already scheduled/activated white-key find/identify card with FSRS history
  if (reps > 0) {
    return true;
  }

  if (skill === 'find') {
    return isNoteRetentionMastered(
      whiteNote,
      progressMap,
      input.cards,
      input.reviewLogs
    );
  }

  if (skill === 'identify') {
    if (
      !isNoteRetentionMastered(
        whiteNote,
        progressMap,
        input.cards,
        input.reviewLogs
      )
    ) {
      return false;
    }

    const phase3Done = progressMap.get(
      WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE
    );
    const allWhiteIdentify = progressMap.get(
      WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE
    );
    if (
      (phase3Done &&
        (phase3Done.state === 'mixReady' || phase3Done.state === 'retention')) ||
      (allWhiteIdentify &&
        (allWhiteIdentify.state === 'mixReady' ||
          allWhiteIdentify.state === 'retention'))
    ) {
      return true;
    }

    if (whiteNote === 'C' || whiteNote === 'F') {
      const cfIdentify = progressMap.get(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF);
      if (
        (cfIdentify &&
          (cfIdentify.state === 'mixReady' ||
            cfIdentify.state === 'retention')) ||
        (isNoteRetentionMastered(
          'C',
          progressMap,
          input.cards,
          input.reviewLogs
        ) &&
          isNoteRetentionMastered(
            'F',
            progressMap,
            input.cards,
            input.reviewLogs
          ))
      ) {
        return true;
      }
    }

    if (whiteNote === 'C' || whiteNote === 'D' || whiteNote === 'E') {
      const cdeIdentify = progressMap.get(
        WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE
      );
      if (
        cdeIdentify &&
        (cdeIdentify.state === 'mixReady' || cdeIdentify.state === 'retention')
      ) {
        return true;
      }
    }

    if (whiteNote === 'F' || whiteNote === 'B') {
      const fbIdentify = progressMap.get(
        WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB
      );
      if (
        fbIdentify &&
        (fbIdentify.state === 'mixReady' || fbIdentify.state === 'retention')
      ) {
        return true;
      }
    }

    if (
      whiteNote === 'F' ||
      whiteNote === 'G' ||
      whiteNote === 'A' ||
      whiteNote === 'B'
    ) {
      const fgabIdentify = progressMap.get(
        WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB
      );
      if (
        fgabIdentify &&
        (fgabIdentify.state === 'mixReady' ||
          fgabIdentify.state === 'retention')
      ) {
        return true;
      }
    }

    return false;
  }

  return false;
}

/**
 * Filters a card pool down to only the cards that are currently curriculum-active.
 */
export function filterCurriculumActiveCards(
  cards: readonly Card[],
  input: CurriculumCardActivationInput = {}
): Card[] {
  return cards.filter(card =>
    isCurriculumCardActive(card, {
      ...input,
      cards: input.cards ?? cards
    })
  );
}

/**
 * Returns the target number of first-attempt H0 successes for a note's local/family mix.
 * - E (completing 2-black family C/D/E) and A (completing 3-black family F/G/A/B)
 *   use `config.familyMixTarget`.
 * - D, B, and G use `config.localMixSuccessTarget`.
 */
export function getMixTargetForNote(
  note: CurriculumAcquisitionNote,
  config: WhiteKeyCurriculumConfig = DEFAULT_WHITE_KEY_CURRICULUM_CONFIG
): number {
  return note === 'E' || note === 'A'
    ? config.familyMixTarget
    : config.localMixSuccessTarget;
}

/**
 * Hydrates a `Record<string, LearningProgressRecord>` from persisted `learningProgress`
 * PLUS any existing legacy `cards` / `reviewLogs` evidence so an existing user with
 * meaningful history on e.g. C/D/E does NOT restart at `dModel`, while unseen notes
 * (e.g. B, G, A) remain in `'unseen'` and are taught in curriculum order.
 */
export function hydrateWhiteKeyProgressFromEvidence(
  input: CurriculumCardActivationInput & { now?: number } = {}
): Record<string, LearningProgressRecord> {
  const now = input.now ?? 0;
  const map = normalizeProgressMap(input.learningProgress);
  const progress: Record<string, LearningProgressRecord> = {};

  for (const itemId of WHITE_KEY_CURRICULUM_ALL_ITEM_IDS) {
    const found = map.get(itemId);
    progress[itemId] = found
      ? { ...found, contexts: [...found.contexts] }
      : createInitialLearningProgress(itemId, now);
  }

  // Hydrate C and F if legacy evidence exists and anchor records are unseen
  for (const anchor of ['C', 'F'] as const) {
    const anchorId = getNoteCurriculumItemId(anchor);
    if (
      progress[anchorId].state === 'unseen' &&
      hasMeaningfulLegacyWhiteNoteEvidence(anchor, input.cards, input.reviewLogs)
    ) {
      progress[anchorId] = {
        ...progress[anchorId],
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: 1,
        independentUnhintedSuccesses: 2,
        contexts: [`region-${anchor}3`, `region-${anchor}4`],
        firstFsrsEligibleAt: now,
        updatedAt: now
      };
    }
  }

  let legacyD = false;
  let legacyE = false;
  let legacyB = false;
  let legacyG = false;
  let legacyA = false;

  for (const note of CURRICULUM_ACQUISITION_ORDER) {
    const noteId = getNoteCurriculumItemId(note);
    const mixId = getNoteMixCurriculumItemId(note);
    const rec = progress[noteId];

    // Never overwrite partial in-progress 3C state
    const hasPartial3C =
      rec.state !== 'unseen' ||
      rec.modelCompleted ||
      rec.guidedSuccesses > 0 ||
      rec.independentUnhintedSuccesses > 0 ||
      rec.contexts.length > 0;

    if (
      !hasPartial3C &&
      hasMeaningfulLegacyWhiteNoteEvidence(note, input.cards, input.reviewLogs)
    ) {
      progress[noteId] = {
        ...rec,
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: DEFAULT_WHITE_KEY_CURRICULUM_CONFIG.guidedSuccessTarget,
        independentUnhintedSuccesses:
          DEFAULT_WHITE_KEY_CURRICULUM_CONFIG.qualifySuccessTarget,
        contexts: [`region-${note}3`, `region-${note}4`],
        mixReadyAt: now,
        firstFsrsEligibleAt: now,
        updatedAt: now
      };
      progress[mixId] = {
        ...progress[mixId],
        state: 'retention',
        independentUnhintedSuccesses: getMixTargetForNote(note),
        contexts: [`${note}:1:region-${note}4`],
        mixReadyAt: now,
        updatedAt: now
      };
      if (note === 'D') legacyD = true;
      if (note === 'E') legacyE = true;
      if (note === 'B') legacyB = true;
      if (note === 'G') legacyG = true;
      if (note === 'A') legacyA = true;
    }
  }

  // If D and E were satisfied via legacy evidence, also ensure C and F anchors and CDE identify
  // don't block the user from starting directly at the next unlearned note (B).
  if (legacyD || legacyE) {
    for (const anchor of ['C', 'F'] as const) {
      const anchorId = getNoteCurriculumItemId(anchor);
      if (progress[anchorId].state !== 'retention') {
        progress[anchorId] = {
          ...progress[anchorId],
          state: 'retention',
          modelCompleted: true,
          guidedSuccesses: 1,
          independentUnhintedSuccesses: 2,
          contexts: [`region-${anchor}3`, `region-${anchor}4`],
          firstFsrsEligibleAt: now,
          updatedAt: now
        };
      }
    }
  }

  if (
    legacyD &&
    legacyE &&
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE].state === 'unseen'
  ) {
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE],
      state: 'retention',
      independentUnhintedSuccesses: 3,
      contexts: ['identify:C', 'identify:D', 'identify:E'],
      mixReadyAt: now,
      updatedAt: now
    };
  }

  if (
    legacyB &&
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB].state === 'unseen'
  ) {
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB],
      state: 'retention',
      independentUnhintedSuccesses: 2,
      contexts: ['identify:F', 'identify:B'],
      mixReadyAt: now,
      updatedAt: now
    };
  }

  if (
    legacyD &&
    legacyE &&
    legacyB &&
    legacyG &&
    legacyA &&
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB].state === 'unseen' &&
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE].state === 'unseen' &&
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE].state === 'unseen'
  ) {
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB],
      state: 'retention',
      independentUnhintedSuccesses: 4,
      contexts: ['identify:F', 'identify:G', 'identify:A', 'identify:B'],
      mixReadyAt: now,
      updatedAt: now
    };
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE],
      state: 'retention',
      independentUnhintedSuccesses: 7,
      contexts: ALL_WHITE_CURRICULUM_NOTES.map(n => `${n}:1:region-${n}4`),
      mixReadyAt: now,
      updatedAt: now
    };
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE],
      state: 'retention',
      independentUnhintedSuccesses: 7,
      contexts: ALL_WHITE_CURRICULUM_NOTES.map(n => `identify:${n}`),
      mixReadyAt: now,
      updatedAt: now
    };
    progress[WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE] = {
      ...progress[WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE],
      state: 'retention',
      modelCompleted: true,
      updatedAt: now
    };
  }

  return progress;
}

function deriveNoteSubStageFromProgress(
  note: CurriculumAcquisitionNote,
  progress: Record<string, LearningProgressRecord>,
  config: WhiteKeyCurriculumConfig
): NoteAcquisitionSubStage | 'done' {
  const noteRec = progress[getNoteCurriculumItemId(note)];
  const mixRec = progress[getNoteMixCurriculumItemId(note)];

  if (!noteRec || !noteRec.modelCompleted) {
    return 'model';
  }
  if (noteRec.guidedSuccesses < config.guidedSuccessTarget) {
    return 'guided';
  }
  const unhintedRegions = getUnhintedWhiteNoteContexts(noteRec);
  if (
    unhintedRegions.length < config.qualifySuccessTarget ||
    noteRec.independentUnhintedSuccesses < config.qualifySuccessTarget
  ) {
    return 'qualify';
  }
  const mixTarget = getMixTargetForNote(note, config);
  if (
    !mixRec ||
    (mixRec.state !== 'mixReady' && mixRec.state !== 'retention') ||
    mixRec.independentUnhintedSuccesses < mixTarget
  ) {
    return 'localMix';
  }
  if (
    noteRec.state !== 'retention' ||
    noteRec.contexts.includes('pending:delayedRetry')
  ) {
    return 'delayedCheck';
  }
  return 'done';
}

function isIdentifyStageCompletedInProgress(
  stage: CurriculumIdentifyStageId,
  progress: Record<string, LearningProgressRecord>
): boolean {
  const rec = progress[getIdentifyStageItemId(stage)];
  if (!rec) return false;
  if (rec.state !== 'mixReady' && rec.state !== 'retention') return false;
  const pool = getIdentifyPoolForStage(stage);
  return pool.every(note => rec.contexts.includes(`identify:${note}`));
}

/**
 * Purely derives the active `WhiteKeyCurriculumStep` from persisted `LearningProgressRecord`s
 * and the configurable thresholds.
 */
export function deriveWhiteKeyCurriculumStep(
  progressInput?: ProgressCollectionInput,
  config: WhiteKeyCurriculumConfig = DEFAULT_WHITE_KEY_CURRICULUM_CONFIG
): WhiteKeyCurriculumStep {
  const progress = hydrateWhiteKeyProgressFromEvidence({
    learningProgress: progressInput
  });

  // 1. D -> E
  for (const note of ['D', 'E'] as const) {
    const sub = deriveNoteSubStageFromProgress(note, progress, config);
    if (sub !== 'done') {
      return getNoteStepName(note, sub);
    }
  }

  // 2. CDE Identify (2-black family inverse task)
  if (!isIdentifyStageCompletedInProgress('cdeIdentify', progress)) {
    return 'cdeIdentify';
  }

  // 3. B (right boundary of 3-black group)
  {
    const sub = deriveNoteSubStageFromProgress('B', progress, config);
    if (sub !== 'done') {
      return getNoteStepName('B', sub);
    }
  }

  // 4. FB Identify (3-black boundaries inverse task)
  if (!isIdentifyStageCompletedInProgress('fbIdentify', progress)) {
    return 'fbIdentify';
  }

  // 5. G -> A (interior of 3-black group)
  for (const note of ['G', 'A'] as const) {
    const sub = deriveNoteSubStageFromProgress(note, progress, config);
    if (sub !== 'done') {
      return getNoteStepName(note, sub);
    }
  }

  // 6. FGAB Identify (3-black family inverse task)
  if (!isIdentifyStageCompletedInProgress('fgabIdentify', progress)) {
    return 'fgabIdentify';
  }

  // 7. Final All-White Spatial Mix (C D E F G A B across octaves)
  const allWhiteMix = progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE];
  if (
    !allWhiteMix ||
    (allWhiteMix.state !== 'mixReady' && allWhiteMix.state !== 'retention') ||
    allWhiteMix.independentUnhintedSuccesses < config.allWhiteMixTarget
  ) {
    return 'allWhiteMix';
  }

  // 8. Final All-White Identify Mix (C D E F G A B inverse task)
  if (!isIdentifyStageCompletedInProgress('allWhiteIdentify', progress)) {
    return 'allWhiteIdentify';
  }

  return 'phase3Complete';
}

export function getNextCurriculumTarget(
  progressInput?: ProgressCollectionInput,
  config: WhiteKeyCurriculumConfig = DEFAULT_WHITE_KEY_CURRICULUM_CONFIG
): CurriculumStepDescriptor {
  const step = deriveWhiteKeyCurriculumStep(progressInput, config);
  return describeCurriculumStep(step);
}

export function isWhiteKeyCurriculumCompleted(
  input: CurriculumCardActivationInput = {},
  config: WhiteKeyCurriculumConfig = DEFAULT_WHITE_KEY_CURRICULUM_CONFIG
): boolean {
  const hydrated = hydrateWhiteKeyProgressFromEvidence(input);
  const phase3Rec = hydrated[WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE];
  if (phase3Rec && phase3Rec.state === 'retention') {
    return true;
  }
  return deriveWhiteKeyCurriculumStep(hydrated, config) === 'phase3Complete' &&
    Boolean(phase3Rec?.modelCompleted);
}

export type CurriculumEntryReason =
  | 'awaiting_first_run_cf'
  | 'start_after_cf'
  | 'resume'
  | 'resume_from_legacy_partial'
  | 'skip_completed'
  | 'skip_legacy_all_white';

export interface CurriculumEntryDecision {
  shouldEnter: boolean;
  reason: CurriculumEntryReason;
  initialStep: WhiteKeyCurriculumStep;
  masteredWhiteNotes: WhiteKeyNote[];
}

export interface CurriculumEntryInput extends CurriculumCardActivationInput {
  lessonProgress?:
    | ReadonlyMap<string, { completed?: boolean; passed?: boolean }>
    | readonly { completed?: boolean; passed?: boolean }[];
  coldTests?: readonly unknown[];
  config?: WhiteKeyCurriculumConfig;
}

/**
 * Deterministic entry decision for Milestone 3C White-Key Curriculum (Section 25):
 * - If brand-new user (or incomplete C/F first-run), returns `awaiting_first_run_cf`.
 * - If all 7 white notes are already mastered (via 3C completion or legacy evidence),
 *   returns `shouldEnter: false`.
 * - If partial legacy evidence exists (e.g. C, D, E have history, while B, G, A are unseen),
 *   skips D and E and enters at `bModel` (`resume_from_legacy_partial`).
 * - If mid-3C progress exists, resumes at the exact persisted step (`resume`).
 * - Otherwise starts at `dModel` right after C/F onboarding (`start_after_cf`).
 */
export function evaluateCurriculumEntry(
  input: CurriculumEntryInput = {}
): CurriculumEntryDecision {
  const config = input.config ?? DEFAULT_WHITE_KEY_CURRICULUM_CONFIG;
  const cfDecision = evaluateFirstRunCfEntry({
    cards: input.cards as readonly Card[] | undefined,
    reviewLogs: input.reviewLogs as readonly unknown[] | undefined,
    learningProgress: input.learningProgress as
      | ReadonlyMap<string, LearningProgressRecord>
      | readonly LearningProgressRecord[]
      | undefined,
    lessonProgress: input.lessonProgress,
    coldTests: input.coldTests
  });

  if (cfDecision.shouldEnter) {
    return {
      shouldEnter: false,
      reason: 'awaiting_first_run_cf',
      initialStep: 'dModel',
      masteredWhiteNotes: []
    };
  }

  const rawMap = normalizeProgressMap(input.learningProgress);
  const hydrated = hydrateWhiteKeyProgressFromEvidence(input);
  const step = deriveWhiteKeyCurriculumStep(hydrated, config);

  const masteredWhiteNotes = ALL_WHITE_CURRICULUM_NOTES.filter(note =>
    isNoteRetentionMastered(note, hydrated, input.cards, input.reviewLogs)
  );

  const phase3Done = hydrated[WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE];
  if (step === 'phase3Complete' && phase3Done?.state === 'retention') {
    const hadExplicitPhase3 =
      rawMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE)?.state ===
      'retention';
    return {
      shouldEnter: false,
      reason: hadExplicitPhase3 ? 'skip_completed' : 'skip_legacy_all_white',
      initialStep: 'phase3Complete',
      masteredWhiteNotes
    };
  }

  const hasExplicit3CProgress = CURRICULUM_ACQUISITION_ORDER.some(note => {
    const rec = rawMap.get(getNoteCurriculumItemId(note));
    return (
      !!rec &&
      (rec.state !== 'unseen' ||
        rec.modelCompleted ||
        rec.guidedSuccesses > 0 ||
        rec.independentUnhintedSuccesses > 0 ||
        rec.contexts.length > 0)
    );
  });

  const hasLegacySkippedNotes = CURRICULUM_ACQUISITION_ORDER.some(note => {
    const rawRec = rawMap.get(getNoteCurriculumItemId(note));
    const hydRec = hydrated[getNoteCurriculumItemId(note)];
    return (
      (!rawRec || rawRec.state === 'unseen') && hydRec?.state === 'retention'
    );
  });

  return {
    shouldEnter: true,
    reason: hasExplicit3CProgress
      ? 'resume'
      : hasLegacySkippedNotes
        ? 'resume_from_legacy_partial'
        : 'start_after_cf',
    initialStep: step,
    masteredWhiteNotes
  };
}

export function shouldEnterWhiteKeyCurriculum(
  input: CurriculumEntryInput = {}
): boolean {
  return evaluateCurriculumEntry(input).shouldEnter;
}

export interface WhiteKeyCurriculumState {
  step: WhiteKeyCurriculumStep;
  config: WhiteKeyCurriculumConfig;
  progress: Record<string, LearningProgressRecord>;
  focusNote: CurriculumAcquisitionNote | null;
  targetNote: WhiteKeyNote | null;
  identifyTargetKeyId: string | null;
  answerPool: WhiteKeyNote[];
  structuralGuideKeyIds: string[];
  modelLabelKeyIds: string[];
  hintLevel: HintLevel;
  trialMode: TrialMode;
  awaitingCorrective: boolean;
  awaitingRemediationPress: boolean;
  isInterveningRecall: boolean;
  remainingInterveningRecalls: number;
  mixQueue: WhiteKeyNote[];
  mixHistory: WhiteKeyNote[];
  identifyQueue: WhiteKeyNote[];
  identifyCompletedNotes: WhiteKeyNote[];
  feedbackText: string;
  feedbackTone: 'good' | 'warn' | 'bad' | '';
}

function reconstructMixQueueFromRecord(
  initialQueue: readonly WhiteKeyNote[],
  pool: readonly WhiteKeyNote[],
  record: LearningProgressRecord | undefined,
  targetCount: number
): { queue: WhiteKeyNote[]; history: WhiteKeyNote[] } {
  const history: WhiteKeyNote[] = [];
  for (const ctx of record?.contexts ?? []) {
    const candidate = ctx.split(':')[0] as WhiteKeyNote;
    if ((pool as readonly string[]).includes(candidate)) {
      history.push(candidate);
    }
  }

  const remaining = [...initialQueue];
  for (const h of history) {
    const idx = remaining.indexOf(h);
    if (idx >= 0) {
      remaining.splice(idx, 1);
    }
  }

  while (history.length + remaining.length < targetCount) {
    const last =
      remaining[remaining.length - 1] ?? history[history.length - 1] ?? pool[0];
    const nextNote = pool.find(n => n !== last) ?? pool[0];
    remaining.push(nextNote);
  }

  if (remaining.length === 0) {
    remaining.push(pool[0]);
  }

  return { queue: remaining, history };
}

function reconstructIdentifyQueueFromRecord(
  stage: CurriculumIdentifyStageId,
  record: LearningProgressRecord | undefined
): { queue: WhiteKeyNote[]; completed: WhiteKeyNote[] } {
  const pool = getIdentifyPoolForStage(stage);
  const baseQueue = buildInitialIdentifyQueue(stage);
  const completed: WhiteKeyNote[] = [];

  for (const note of pool) {
    if (record?.contexts.includes(`identify:${note}`)) {
      completed.push(note);
    }
  }

  const queue = baseQueue.filter(n => !completed.includes(n));
  if (queue.length === 0) {
    queue.push(...baseQueue);
  }
  return { queue, completed };
}

function chooseContrastLandmarkForNote(note: WhiteKeyNote): WhiteKeyNote {
  const spec = WHITE_KEY_GEOMETRY[note];
  if (spec.blackGroupSize === 2) {
    return note === 'C' ? 'F' : 'C';
  }
  return note === 'F' ? 'C' : 'F';
}

function getCurriculumStepVisualConfig(
  step: WhiteKeyCurriculumStep,
  statePatch: Pick<
    WhiteKeyCurriculumState,
    | 'progress'
    | 'mixQueue'
    | 'mixHistory'
    | 'identifyQueue'
    | 'identifyCompletedNotes'
    | 'awaitingCorrective'
    | 'awaitingRemediationPress'
    | 'isInterveningRecall'
  >
): Pick<
  WhiteKeyCurriculumState,
  | 'focusNote'
  | 'targetNote'
  | 'identifyTargetKeyId'
  | 'answerPool'
  | 'structuralGuideKeyIds'
  | 'modelLabelKeyIds'
  | 'hintLevel'
  | 'trialMode'
> {
  const desc = describeCurriculumStep(step);
  const showGuide =
    statePatch.awaitingCorrective || statePatch.awaitingRemediationPress;

  if (desc.kind === 'complete') {
    return {
      focusNote: null,
      targetNote: null,
      identifyTargetKeyId: null,
      answerPool: [],
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      hintLevel: HINT_LEVEL.NONE,
      trialMode: 'model'
    };
  }

  if (desc.kind === 'identifyMix' && desc.identifyStage) {
    const pool = [...getIdentifyPoolForStage(desc.identifyStage)];
    const targetNote = statePatch.identifyQueue[0] ?? pool[0];
    const trialIdx = statePatch.identifyCompletedNotes.length;
    const keyId = getDeterministicKeyIdForWhiteNote(targetNote, trialIdx);
    const octave = Number(keyId.slice(-1)) as 2 | 3 | 4 | 5;
    return {
      focusNote: null,
      targetNote,
      identifyTargetKeyId: keyId,
      answerPool: pool,
      structuralGuideKeyIds: showGuide
        ? getStructuralGuideForWhiteNote(targetNote, octave)
        : [],
      modelLabelKeyIds: [],
      hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
      trialMode: statePatch.awaitingCorrective ? 'corrective' : 'mixedRetrieval'
    };
  }

  if (desc.kind === 'allWhiteMix') {
    const targetNote = statePatch.mixQueue[0] ?? 'D';
    const guideOctave = getDeterministicOctaveForTrial(
      statePatch.mixHistory.length
    );
    return {
      focusNote: null,
      targetNote,
      identifyTargetKeyId: null,
      answerPool: [],
      structuralGuideKeyIds: showGuide
        ? getStructuralGuideForWhiteNote(targetNote, guideOctave)
        : [],
      modelLabelKeyIds: [],
      hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
      trialMode: statePatch.awaitingCorrective ? 'corrective' : 'mixedRetrieval'
    };
  }

  const focusNote = desc.focusNote ?? 'D';
  const spec = WHITE_KEY_GEOMETRY[focusNote];
  const noteRec = statePatch.progress[getNoteCurriculumItemId(focusNote)];

  switch (desc.subStage) {
    case 'model':
      return {
        focusNote,
        targetNote: focusNote,
        identifyTargetKeyId: null,
        answerPool: [],
        structuralGuideKeyIds: [...spec.allStructuralBlackKeyIds],
        modelLabelKeyIds: [...spec.landmarkKeyIds],
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        trialMode: 'model'
      };

    case 'guided': {
      const guidedTrialIndex = noteRec?.guidedSuccesses ?? 0;
      const octave = getDeterministicOctaveForTrial(guidedTrialIndex);
      return {
        focusNote,
        targetNote: focusNote,
        identifyTargetKeyId: null,
        answerPool: [],
        structuralGuideKeyIds: getStructuralGuideForWhiteNote(
          focusNote,
          octave
        ),
        modelLabelKeyIds: [],
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        trialMode: 'guided'
      };
    }

    case 'qualify': {
      const unhintedCount = getUnhintedWhiteNoteContexts(noteRec).length;
      const octave = getDeterministicOctaveForTrial(unhintedCount);
      return {
        focusNote,
        targetNote: focusNote,
        identifyTargetKeyId: null,
        answerPool: [],
        structuralGuideKeyIds: showGuide
          ? getStructuralGuideForWhiteNote(focusNote, octave)
          : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective ? 'corrective' : 'qualify'
      };
    }

    case 'localMix': {
      const targetNote = statePatch.mixQueue[0] ?? focusNote;
      const octave = getDeterministicOctaveForTrial(
        statePatch.mixHistory.length
      );
      return {
        focusNote,
        targetNote,
        identifyTargetKeyId: null,
        answerPool: [],
        structuralGuideKeyIds: showGuide
          ? getStructuralGuideForWhiteNote(targetNote, octave)
          : [],
        modelLabelKeyIds: [],
        hintLevel: showGuide ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
        trialMode: statePatch.awaitingCorrective
          ? 'corrective'
          : 'mixedRetrieval'
      };
    }

    case 'delayedCheck':
    default: {
      const activeNote: WhiteKeyNote = statePatch.isInterveningRecall
        ? chooseContrastLandmarkForNote(focusNote)
        : focusNote;
      return {
        focusNote,
        targetNote: activeNote,
        identifyTargetKeyId: null,
        answerPool: [],
        structuralGuideKeyIds: showGuide
          ? getStructuralGuideForWhiteNote(activeNote, 4)
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
  }
}

/**
 * Creates or deterministically resumes a `WhiteKeyCurriculumState` from persisted
 * `learningProgress` records (and optional legacy `cards`/`reviewLogs` evidence).
 */
export function createWhiteKeyCurriculumState(
  input?:
    | ProgressCollectionInput
    | (CurriculumCardActivationInput & {
        now?: number;
        config?: WhiteKeyCurriculumConfig;
      }),
  nowArg = 0,
  configArg: WhiteKeyCurriculumConfig = DEFAULT_WHITE_KEY_CURRICULUM_CONFIG
): WhiteKeyCurriculumState {
  const isFullInputObject =
    input &&
    typeof input === 'object' &&
    !(input instanceof Map) &&
    !Array.isArray(input) &&
    ('learningProgress' in input ||
      'cards' in input ||
      'reviewLogs' in input ||
      'config' in input);

  const learningProgress = isFullInputObject
    ? (input as CurriculumCardActivationInput).learningProgress
    : (input as ProgressCollectionInput);
  const cards = isFullInputObject
    ? (input as CurriculumCardActivationInput).cards
    : undefined;
  const reviewLogs = isFullInputObject
    ? (input as CurriculumCardActivationInput).reviewLogs
    : undefined;
  const now =
    isFullInputObject && typeof (input as { now?: number }).now === 'number'
      ? (input as { now: number }).now
      : nowArg;
  const config =
    isFullInputObject && (input as { config?: WhiteKeyCurriculumConfig }).config
      ? (input as { config: WhiteKeyCurriculumConfig }).config
      : configArg;

  const progress = hydrateWhiteKeyProgressFromEvidence({
    learningProgress,
    cards,
    reviewLogs,
    now
  });

  const step = deriveWhiteKeyCurriculumStep(progress, config);
  const desc = describeCurriculumStep(step);

  let mixQueue: WhiteKeyNote[] = [];
  let mixHistory: WhiteKeyNote[] = [];
  let identifyQueue: WhiteKeyNote[] = [];
  let identifyCompletedNotes: WhiteKeyNote[] = [];

  if (desc.kind === 'noteAcquisition' && desc.focusNote) {
    const mixRec = progress[getNoteMixCurriculumItemId(desc.focusNote)];
    const reconstructed = reconstructMixQueueFromRecord(
      buildInitialLocalMixQueue(desc.focusNote),
      getLocalMixPool(desc.focusNote),
      mixRec,
      getMixTargetForNote(desc.focusNote, config)
    );
    mixQueue = reconstructed.queue;
    mixHistory = reconstructed.history;
  } else if (desc.kind === 'allWhiteMix') {
    const mixRec = progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE];
    const reconstructed = reconstructMixQueueFromRecord(
      buildInitialAllWhiteMixQueue(),
      ALL_WHITE_CURRICULUM_NOTES,
      mixRec,
      config.allWhiteMixTarget
    );
    mixQueue = reconstructed.queue;
    mixHistory = reconstructed.history;
  } else if (desc.kind === 'identifyMix' && desc.identifyStage) {
    const idRec = progress[getIdentifyStageItemId(desc.identifyStage)];
    const reconstructed = reconstructIdentifyQueueFromRecord(
      desc.identifyStage,
      idRec
    );
    identifyQueue = reconstructed.queue;
    identifyCompletedNotes = reconstructed.completed;
  }

  const visuals = getCurriculumStepVisualConfig(step, {
    progress,
    mixQueue,
    mixHistory,
    identifyQueue,
    identifyCompletedNotes,
    awaitingCorrective: false,
    awaitingRemediationPress: false,
    isInterveningRecall: false
  });

  return {
    step,
    config,
    progress,
    ...visuals,
    awaitingCorrective: false,
    awaitingRemediationPress: false,
    isInterveningRecall: false,
    remainingInterveningRecalls: 0,
    mixQueue,
    mixHistory,
    identifyQueue,
    identifyCompletedNotes,
    feedbackText: '',
    feedbackTone: ''
  };
}

/**
 * Pure helper returning the current teaching trial specification (`getTeachingTrial`).
 */
export function getTeachingTrial(state: WhiteKeyCurriculumState): {
  step: WhiteKeyCurriculumStep;
  focusNote: CurriculumAcquisitionNote | null;
  targetNote: WhiteKeyNote | null;
  skill: Skill | null;
  trialMode: TrialMode;
  hintLevel: HintLevel;
  identifyTargetKeyId: string | null;
  structuralGuideKeyIds: string[];
  modelLabelKeyIds: string[];
  answerPool: WhiteKeyNote[];
} {
  return {
    step: state.step,
    focusNote: state.focusNote,
    targetNote: state.targetNote,
    skill: getCurriculumStepSkill(state.step),
    trialMode: state.trialMode,
    hintLevel: state.hintLevel,
    identifyTargetKeyId: state.identifyTargetKeyId,
    structuralGuideKeyIds: [...state.structuralGuideKeyIds],
    modelLabelKeyIds: [...state.modelLabelKeyIds],
    answerPool: [...state.answerPool]
  };
}

export function getCurriculumStepSkill(
  step: WhiteKeyCurriculumStep
): Skill | null {
  const desc = describeCurriculumStep(step);
  if (desc.kind === 'complete') return null;
  if (desc.kind === 'identifyMix') return 'identify';
  return 'find';
}

export function canUseInputForCurriculumStep(
  step: WhiteKeyCurriculumStep,
  channel: InputChannel
): boolean {
  const skill = getCurriculumStepSkill(step);
  if (!skill) return false;
  return canUseInputForSkill(skill, channel);
}

export function canUseDontKnowInCurriculumStep(
  stepOrState:
    | WhiteKeyCurriculumStep
    | Pick<
        WhiteKeyCurriculumState,
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

  const desc = describeCurriculumStep(step);
  if (desc.kind === 'complete') return false;
  if (
    desc.kind === 'noteAcquisition' &&
    (desc.subStage === 'model' || desc.subStage === 'guided')
  ) {
    return false;
  }
  return true;
}

export type CurriculumKeydownCommand =
  | { type: 'completePhase3' }
  | { type: 'dontKnow' }
  | null;

export function resolveCurriculumKeydownAction(
  state: Pick<
    WhiteKeyCurriculumState,
    'step' | 'awaitingCorrective' | 'awaitingRemediationPress'
  >,
  key: string,
  code?: string
): CurriculumKeydownCommand {
  const isSpace = code === 'Space' || key === ' ' || key === 'Spacebar';
  const isEnter = key === 'Enter' || code === 'Enter';

  if (!isSpace && !isEnter) return null;

  if (state.step === 'phase3Complete') {
    return { type: 'completePhase3' };
  }

  if (isEnter && canUseDontKnowInCurriculumStep(state)) {
    return { type: 'dontKnow' };
  }

  return null;
}

export interface CurriculumDiagramSpec {
  kind: 'landmark' | 'none';
  blackGroupSize: 2 | 3 | null;
  highlightTargetWhite: boolean;
  targetWhiteIndex: 0 | 1 | 2 | 3 | null;
  targetWhiteLabel: string | null;
  groupTitle: string | null;
  caption: string | null;
}

/**
 * Derives the pedagogical mini-diagram specification for Milestone 3C steps:
 * - H3 (`model` steps): highlights the black-key group AND highlights/labels the target white key
 *   at its exact geometric index (`whiteIndexInGroup`).
 * - H2 (`guided` steps and corrective/remediation states): highlights ONLY the black-key group;
 *   `highlightTargetWhite` is `false`, `targetWhiteIndex` is `null`, and `targetWhiteLabel` is `null`.
 * - H0 (`qualify`, `localMix`, `allWhiteMix`, `identifyMix`, `delayedCheck`): `kind: 'none'`.
 */
export function getCurriculumDiagramSpec(
  state: Pick<
    WhiteKeyCurriculumState,
    | 'step'
    | 'targetNote'
    | 'hintLevel'
    | 'awaitingCorrective'
    | 'awaitingRemediationPress'
  >
): CurriculumDiagramSpec {
  const desc = describeCurriculumStep(state.step);
  if (desc.kind === 'complete') {
    return {
      kind: 'none',
      blackGroupSize: null,
      highlightTargetWhite: false,
      targetWhiteIndex: null,
      targetWhiteLabel: null,
      groupTitle: null,
      caption: null
    };
  }

  if (desc.kind === 'noteAcquisition' && desc.subStage === 'model' && desc.focusNote) {
    const spec = WHITE_KEY_GEOMETRY[desc.focusNote];
    return {
      kind: 'landmark',
      blackGroupSize: spec.blackGroupSize,
      highlightTargetWhite: true,
      targetWhiteIndex: spec.whiteIndexInGroup,
      targetWhiteLabel: DISPLAY_NAMES[desc.focusNote],
      groupTitle: spec.diagramGroupTitle,
      caption: spec.diagramCaption
    };
  }

  const isH2GuidedOrRemediation =
    (desc.kind === 'noteAcquisition' && desc.subStage === 'guided') ||
    state.awaitingCorrective ||
    state.awaitingRemediationPress ||
    state.hintLevel === HINT_LEVEL.VISUAL_CUE;

  if (isH2GuidedOrRemediation && state.targetNote) {
    const spec = WHITE_KEY_GEOMETRY[state.targetNote];
    return {
      kind: 'landmark',
      blackGroupSize: spec.blackGroupSize,
      highlightTargetWhite: false,
      targetWhiteIndex: null,
      targetWhiteLabel: null,
      groupTitle: spec.diagramGroupTitle,
      caption: spec.diagramCaption
    };
  }

  return {
    kind: 'none',
    blackGroupSize: null,
    highlightTargetWhite: false,
    targetWhiteIndex: null,
    targetWhiteLabel: null,
    groupTitle: null,
    caption: null
  };
}

export interface WhiteKeyCurriculumProgressInfo {
  step: WhiteKeyCurriculumStep;
  phase: 2 | 3;
  masteredWhiteCount: number;
  totalWhiteCount: 7;
  progressPct: number;
  headerMeta: string;
  headerTitle: string;
  stepLabel: string;
  whiteKeysBadgeText: string;
}

/**
 * Returns clean user-facing progress metadata (`Белые клавиши · X из 7`) without exposing
 * internal state names (`qualifying`, `mixReady`, `contextId`, `FSRS`).
 */
export function getWhiteKeyCurriculumStepProgress(
  state: Pick<WhiteKeyCurriculumState, 'step' | 'progress'>
): WhiteKeyCurriculumProgressInfo {
  const desc = describeCurriculumStep(state.step);
  const masteredNotes = ALL_WHITE_CURRICULUM_NOTES.filter(note =>
    isNoteRetentionMastered(note, state.progress)
  );
  const masteredWhiteCount =
    state.step === 'phase3Complete'
      ? 7
      : Math.max(2, Math.min(7, masteredNotes.length));

  const stepIndex = WHITE_KEY_CURRICULUM_STEPS.indexOf(state.step);
  const totalSteps = WHITE_KEY_CURRICULUM_STEPS.length - 1;
  const progressPct =
    state.step === 'phase3Complete'
      ? 100
      : Math.max(
          15,
          Math.min(98, Math.round(((stepIndex + 1) / totalSteps) * 100))
        );

  const whiteKeysBadgeText = `Белые клавиши · ${masteredWhiteCount} из 7`;
  const headerMeta =
    desc.phase === 2 ? 'ЭТАП 2 · СОСЕДИ ОРИЕНТИРОВ' : 'ЭТАП 3 · ВСЕ БЕЛЫЕ КЛАВИШИ';

  let stepLabel = 'Геометрия клавиатуры';
  if (desc.kind === 'complete') {
    stepLabel = 'Все 7 белых клавиш освоены';
  } else if (desc.kind === 'allWhiteMix') {
    stepLabel = 'Итоговое смешивание C–B';
  } else if (desc.kind === 'identifyMix') {
    stepLabel = 'Распознавание клавиш по названию';
  } else if (desc.focusNote) {
    stepLabel = `Клавиша ${DISPLAY_NAMES[desc.focusNote]}`;
  }

  return {
    step: state.step,
    phase: desc.phase,
    masteredWhiteCount,
    totalWhiteCount: 7,
    progressPct,
    headerMeta,
    headerTitle: whiteKeysBadgeText,
    stepLabel,
    whiteKeysBadgeText
  };
}

export type WhiteKeyCurriculumAction =
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
    }
  | {
      type: 'completePhase3';
      at?: number;
      sessionId?: string;
    };

export type WhiteKeyCurriculumOutcome =
  | 'advanced'
  | 'progressed'
  | 'duplicate_context'
  | 'wrong_note'
  | 'corrective_completed'
  | 'remediation_activated'
  | 'remediation_completed'
  | 'ignored';

export interface CurriculumDelayedCheckPayload {
  cardId: `find:${CurriculumAcquisitionNote}`;
  note: CurriculumAcquisitionNote;
  isCorrect: boolean;
  answer: NoteName | null;
  answerKeyId: string | null;
  trialContext: TrialContext;
}

export interface WhiteKeyCurriculumTransitionResult {
  state: WhiteKeyCurriculumState;
  updatedProgress: LearningProgressRecord[];
  trialContext: TrialContext | null;
  ignoredInput: boolean;
  outcome: WhiteKeyCurriculumOutcome;
  fsrsDelayedCheck: CurriculumDelayedCheckPayload | null;
}

function transitionToCurriculumStep(
  state: WhiteKeyCurriculumState,
  nextStep: WhiteKeyCurriculumStep,
  patches: Partial<WhiteKeyCurriculumState> = {}
): WhiteKeyCurriculumState {
  const merged: WhiteKeyCurriculumState = {
    ...state,
    ...patches,
    step: nextStep,
    awaitingCorrective: patches.awaitingCorrective ?? false,
    awaitingRemediationPress: patches.awaitingRemediationPress ?? false,
    isInterveningRecall: patches.isInterveningRecall ?? false,
    remainingInterveningRecalls: patches.remainingInterveningRecalls ?? 0
  };

  if (nextStep !== state.step) {
    const nextDesc = describeCurriculumStep(nextStep);
    if (nextDesc.kind === 'noteAcquisition' && nextDesc.focusNote) {
      if (!patches.mixQueue) {
        merged.mixQueue = buildInitialLocalMixQueue(nextDesc.focusNote);
        merged.mixHistory = [];
      }
    } else if (nextDesc.kind === 'allWhiteMix') {
      if (!patches.mixQueue) {
        merged.mixQueue = buildInitialAllWhiteMixQueue();
        merged.mixHistory = [];
      }
    } else if (nextDesc.kind === 'identifyMix' && nextDesc.identifyStage) {
      if (!patches.identifyQueue) {
        merged.identifyQueue = buildInitialIdentifyQueue(nextDesc.identifyStage);
        merged.identifyCompletedNotes = [];
      }
    }
  }

  const visuals = getCurriculumStepVisualConfig(nextStep, merged);
  return {
    ...merged,
    ...visuals
  };
}

function chooseNextFromPool(
  pool: readonly WhiteKeyNote[],
  history: readonly WhiteKeyNote[],
  focusNote?: WhiteKeyNote | null
): WhiteKeyNote {
  const len = history.length;
  const last = len > 0 ? history[len - 1] : null;
  const secondLast = len > 1 ? history[len - 2] : null;

  if (last && secondLast && last === secondLast) {
    return pool.find(n => n !== last) ?? pool[0];
  }

  // Prefer the least-practiced note in the pool (with focusNote priority)
  const counts = new Map<WhiteKeyNote, number>();
  for (const n of pool) counts.set(n, 0);
  for (const h of history) {
    if (counts.has(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }

  if (focusNote && (counts.get(focusNote) ?? 0) < 2 && last !== focusNote) {
    return focusNote;
  }

  const sorted = [...pool].sort((a, b) => {
    const cA = counts.get(a) ?? 0;
    const cB = counts.get(b) ?? 0;
    if (cA !== cB) return cA - cB;
    if (a === last) return 1;
    if (b === last) return -1;
    return 0;
  });

  return sorted[0] ?? pool[0];
}

/**
 * Pure state machine reducer for the Milestone 3C White-Key Curriculum (`advanceCurriculumProgress`).
 * Uses a single generic acquisition flow (`model -> guided -> qualify -> localMix -> delayedCheck`)
 * for all 5 notes (`D, E, B, G, A`) plus family/all-white mix and inverse `identify` stages.
 */
export function advanceCurriculumProgress(
  state: WhiteKeyCurriculumState,
  action: WhiteKeyCurriculumAction
): WhiteKeyCurriculumTransitionResult {
  const at = action.at ?? Date.now();
  const sessionId = action.sessionId ?? 'curriculum-3c';
  const progress = { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];
  const config = state.config;

  const saveProgress = (record: LearningProgressRecord) => {
    progress[record.id] = record;
    const idx = updatedProgress.findIndex(p => p.id === record.id);
    if (idx >= 0) {
      updatedProgress[idx] = record;
    } else {
      updatedProgress.push(record);
    }
  };

  // Handle Phase 3 completion acknowledgement
  if (action.type === 'completePhase3') {
    if (state.step !== 'phase3Complete') {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }

    const doneRec = markFsrsActivated(
      recordModelCompleted(
        progress[WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE],
        at,
        'phase3:complete'
      ),
      at
    );
    saveProgress(doneRec);

    return {
      state: {
        ...state,
        progress
      },
      updatedProgress,
      trialContext: null,
      ignoredInput: false,
      outcome: 'advanced',
      fsrsDelayedCheck: null
    };
  }

  if (state.step === 'phase3Complete') {
    return {
      state,
      updatedProgress: [],
      trialContext: null,
      ignoredInput: true,
      outcome: 'ignored',
      fsrsDelayedCheck: null
    };
  }

  const desc = describeCurriculumStep(state.step);

  // 1. Handle 'Don't Know' -> Supported H2 Remediation (NO FSRS mutation)
  if (action.type === 'dontKnow') {
    if (!canUseDontKnowInCurriculumStep(state)) {
      return {
        state,
        updatedProgress: [],
        trialContext: null,
        ignoredInput: true,
        outcome: 'ignored',
        fsrsDelayedCheck: null
      };
    }

    const target = state.targetNote ?? desc.focusNote ?? 'D';
    const spec = WHITE_KEY_GEOMETRY[target];
    const hintFeedback = spec.remediationHint;

    const itemId =
      desc.kind === 'identifyMix' && desc.identifyStage
        ? getIdentifyStageItemId(desc.identifyStage)
        : desc.kind === 'allWhiteMix'
          ? WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE
          : desc.subStage === 'localMix' && desc.focusNote
            ? getNoteMixCurriculumItemId(desc.focusNote)
            : getNoteCurriculumItemId(target);

    const cardId =
      desc.kind === 'noteAcquisition' &&
      desc.subStage === 'delayedCheck' &&
      desc.focusNote &&
      !state.isInterveningRecall
        ? (`find:${desc.focusNote}` as const)
        : undefined;

    const trialContext = createTrialContext({
      mode:
        desc.kind === 'noteAcquisition' && desc.subStage === 'delayedCheck'
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

    const nextState = transitionToCurriculumStep(state, state.step, {
      awaitingRemediationPress: true,
      feedbackText: hintFeedback,
      feedbackTone: 'warn'
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

  // 2. Enforce Input Routing Matrix strictly (Section 17)
  if (action.type === 'keyPress') {
    const channel: InputChannel =
      action.inputMethod === 'midi' ? 'midi' : 'pianoKey';
    if (!canUseInputForCurriculumStep(state.step, channel)) {
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
    if (!canUseInputForCurriculumStep(state.step, action.channel)) {
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
  const pressedKeyId =
    action.type === 'keyPress' ? (action.keyId ?? null) : null;
  const explicitContextId =
    action.type === 'keyPress' ? action.contextId : undefined;

  // =========================================================================
  // GENERIC SUB-STAGE 1: MODEL (H3, TrialMode = 'model', NO FSRS)
  // =========================================================================
  if (desc.kind === 'noteAcquisition' && desc.subStage === 'model' && desc.focusNote) {
    const focusNote = desc.focusNote;
    const spec = WHITE_KEY_GEOMETRY[focusNote];
    const itemId = getNoteCurriculumItemId(focusNote);
    const isCorrect = pressedNote === focusNote;
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
      return {
        state: {
          ...state,
          feedbackText: `${spec.modelPrompt}`,
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    if (!isValidWhiteKeyRegionContext(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText:
            'У правого края (C6) группа чёрных клавиш неполная. Нажмите одну из подсвеченных клавиш в полных октавах (C2–B5).',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    const updatedNote = recordModelCompleted(progress[itemId], at, contextId);
    saveProgress(updatedNote);

    const nextStep = getNoteStepName(focusNote, 'guided');
    return {
      state: transitionToCurriculumStep(
        { ...state, progress },
        nextStep,
        {
          feedbackText: `✓ Отлично! ${spec.modelPrompt.split('.')[0]}.`,
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

  // =========================================================================
  // GENERIC SUB-STAGE 2: GUIDED (H2, TrialMode = 'guided', NO FSRS)
  // =========================================================================
  if (desc.kind === 'noteAcquisition' && desc.subStage === 'guided' && desc.focusNote) {
    const focusNote = desc.focusNote;
    const itemId = getNoteCurriculumItemId(focusNote);
    const isCorrect = pressedNote === focusNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );

    if (isCorrect && !isValidWhiteKeyRegionContext(regionCtx)) {
      const trialContext = createTrialContext({
        mode: 'guided',
        sessionId,
        itemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: true,
        inputMethod,
        contextId: regionCtx
      });
      return {
        state: {
          ...state,
          feedbackText:
            'Используйте полные октавы клавиатуры (C2–B5), где видна вся группа чёрных клавиш.',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    const trialIdx = (progress[itemId]?.guidedSuccesses ?? 0) + 1;
    const guidedCtx = `guided:${trialIdx}:${regionCtx}`;

    const trialContext = createTrialContext({
      mode: 'guided',
      sessionId,
      itemId,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      firstAttempt: true,
      inputMethod,
      contextId: regionCtx
    });

    const updatedNote = recordGuidedAttempt(progress[itemId], {
      correct: isCorrect,
      hintLevel: HINT_LEVEL.VISUAL_CUE,
      contextId: guidedCtx,
      at
    });
    saveProgress(updatedNote);

    if (!isCorrect) {
      return {
        state: {
          ...state,
          progress,
          feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
          feedbackTone: 'warn'
        },
        updatedProgress,
        trialContext,
        ignoredInput: false,
        outcome: 'wrong_note',
        fsrsDelayedCheck: null
      };
    }

    if (updatedNote.guidedSuccesses >= config.guidedSuccessTarget) {
      const nextStep = getNoteStepName(focusNote, 'qualify');
      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          nextStep,
          {
            feedbackText: `✓ Верно, это ${DISPLAY_NAMES[focusNote]}! Теперь найдите ${focusNote} самостоятельно без подсказок.`,
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

    return {
      state: transitionToCurriculumStep(
        { ...state, progress },
        state.step,
        {
          feedbackText: `✓ Верно (${updatedNote.guidedSuccesses}/${config.guidedSuccessTarget}). Теперь найдите ${focusNote} рядом со следующей подсвеченной группой чёрных клавиш.`,
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

  // =========================================================================
  // GENERIC SUB-STAGE 3: QUALIFY (H0, TrialMode = 'qualify', Multi-Region, NO FSRS)
  // =========================================================================
  if (desc.kind === 'noteAcquisition' && desc.subStage === 'qualify' && desc.focusNote) {
    const focusNote = desc.focusNote;
    const itemId = getNoteCurriculumItemId(focusNote);
    const isCorrect = pressedNote === focusNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );

    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const mode: TrialMode = state.awaitingCorrective
        ? 'corrective'
        : 'qualify';
      const trialContext = createTrialContext({
        mode,
        sessionId,
        itemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const nextState = transitionToCurriculumStep(state, state.step, {
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        feedbackText: `✓ Исправлено: это ${DISPLAY_NAMES[focusNote]}. Теперь найдите ${focusNote} самостоятельно без подсказки.`,
        feedbackTone: 'good'
      });

      return {
        state: nextState,
        updatedProgress: [],
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
      const updatedNote = recordIndependentAttempt(progress[itemId], {
        correct: false,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: regionCtx,
        at
      });
      saveProgress(updatedNote);

      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          state.step,
          {
            awaitingCorrective: true,
            feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
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

    if (!isValidWhiteKeyRegionContext(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText:
            'У правого края (C6) нет полной группы чёрных клавиш. Найдите клавишу в другой октаве (C2–B5).',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    const existingRegions = getUnhintedWhiteNoteContexts(progress[itemId]);
    if (existingRegions.includes(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText: `Правильно, это ${focusNote}! Теперь найдите ${focusNote} в другой части клавиатуры (в другой октаве).`,
          feedbackTone: 'good'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    let updatedNote = recordIndependentAttempt(progress[itemId], {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: regionCtx,
      at
    });

    const newRegions = getUnhintedWhiteNoteContexts(updatedNote);
    if (
      newRegions.length >= config.qualifySuccessTarget &&
      updatedNote.independentUnhintedSuccesses >= config.qualifySuccessTarget
    ) {
      // Acquisition Gate reached: MIX_READY!
      updatedNote = markMixReady(updatedNote, at);
      saveProgress(updatedNote);

      const nextStep = getNoteStepName(focusNote, 'localMix');
      return {
        state: transitionToCurriculumStep(
          {
            ...state,
            progress,
            mixQueue: buildInitialLocalMixQueue(focusNote),
            mixHistory: []
          },
          nextStep,
          {
            feedbackText: `✓ Клавиша ${DISPLAY_NAMES[focusNote]} освоена в разных октавах! Теперь смешаем её с уже знакомыми клавишами.`,
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

    saveProgress(updatedNote);
    return {
      state: transitionToCurriculumStep(
        { ...state, progress },
        state.step,
        {
          feedbackText: `✓ Правильно, это ${focusNote} (${newRegions.length}/${config.qualifySuccessTarget}). Теперь найдите ${focusNote} в другой части клавиатуры.`,
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

  // =========================================================================
  // GENERIC SUB-STAGE 4 & ALL-WHITE MIX: LOCAL / FAMILY / ALL-WHITE MIX (H0, mixedRetrieval, NO FSRS)
  // =========================================================================
  if (
    (desc.kind === 'noteAcquisition' &&
      desc.subStage === 'localMix' &&
      desc.focusNote) ||
    desc.kind === 'allWhiteMix'
  ) {
    const isAllWhite = desc.kind === 'allWhiteMix';
    const focusNote = desc.focusNote;
    const pool = isAllWhite
      ? ALL_WHITE_CURRICULUM_NOTES
      : getLocalMixPool(focusNote!);
    const mixItemId = isAllWhite
      ? WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE
      : getNoteMixCurriculumItemId(focusNote!);
    const mixTarget = isAllWhite
      ? config.allWhiteMixTarget
      : getMixTargetForNote(focusNote!, config);

    const expectedNote: WhiteKeyNote =
      state.targetNote ?? state.mixQueue[0] ?? focusNote ?? 'D';
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
        itemId: mixItemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildWhiteKeyContrastFeedback(
              expectedNote,
              pressedNote
            ),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const remainingAfterCurrent = state.mixQueue.slice(1);
      const nextQueue = scheduleMissedWhiteMixNote(
        remainingAfterCurrent,
        expectedNote,
        pool
      );

      return {
        state: transitionToCurriculumStep(
          {
            ...state,
            progress,
            mixQueue: nextQueue
          },
          state.step,
          {
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            feedbackText: `✓ Исправлено: это ${DISPLAY_NAMES[expectedNote]}. Продолжаем смешивание!`,
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
      itemId: mixItemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod,
      contextId: regionCtx
    });

    if (!isCorrect) {
      const updatedMix = recordIndependentAttempt(progress[mixItemId], {
        correct: false,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `miss:${expectedNote}:${regionCtx}`,
        at
      });
      saveProgress(updatedMix);

      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          state.step,
          {
            awaitingCorrective: true,
            feedbackText: buildWhiteKeyContrastFeedback(
              expectedNote,
              pressedNote
            ),
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

    if (!isValidWhiteKeyRegionContext(regionCtx)) {
      return {
        state: {
          ...state,
          feedbackText:
            'Нажмите клавишу в одной из полных октав клавиатуры (C2–B5), а не крайний C6.',
          feedbackTone: 'warn'
        },
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'duplicate_context',
        fsrsDelayedCheck: null
      };
    }

    // Also record the region on the individual note's LearningProgressRecord
    const targetNoteItemId = getNoteCurriculumItemId(expectedNote);
    if (progress[targetNoteItemId]) {
      const updatedTargetNote = recordIndependentAttempt(
        progress[targetNoteItemId],
        {
          correct: true,
          hinted: false,
          hintLevel: HINT_LEVEL.NONE,
          contextId: regionCtx,
          at
        }
      );
      saveProgress(updatedTargetNote);
    }

    const nextHistory = [...state.mixHistory, expectedNote];
    const nextSuccessCount =
      (progress[mixItemId]?.independentUnhintedSuccesses ?? 0) + 1;

    let updatedMix = recordIndependentAttempt(progress[mixItemId], {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: `${expectedNote}:${nextSuccessCount}:${regionCtx}`,
      at
    });

    const hasFocusSuccess = isAllWhite
      ? ALL_WHITE_CURRICULUM_NOTES.every(n => nextHistory.includes(n)) ||
        nextSuccessCount >= mixTarget
      : nextHistory.includes(focusNote!) || expectedNote === focusNote;

    if (nextSuccessCount >= mixTarget && hasFocusSuccess) {
      updatedMix = markMixReady(updatedMix, at);
      saveProgress(updatedMix);

      const nextStep: WhiteKeyCurriculumStep = isAllWhite
        ? 'allWhiteIdentify'
        : getNoteStepName(focusNote!, 'delayedCheck');

      return {
        state: transitionToCurriculumStep(
          {
            ...state,
            progress,
            mixHistory: nextHistory,
            mixQueue: []
          },
          nextStep,
          {
            feedbackText: isAllWhite
              ? '✓ Все 7 белых клавиш уверенно различаются на клавиатуре! Теперь финальное распознавание по названию.'
              : `✓ Отлично! Теперь финальная проверка ${DISPLAY_NAMES[focusNote!]} по памяти без подсказок.`,
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

    saveProgress(updatedMix);
    const remainingQueue = state.mixQueue.slice(1);
    if (remainingQueue.length === 0) {
      remainingQueue.push(chooseNextFromPool(pool, nextHistory, focusNote));
    }

    return {
      state: transitionToCurriculumStep(
        {
          ...state,
          progress,
          mixQueue: remainingQueue,
          mixHistory: nextHistory
        },
        state.step,
        {
          feedbackText: `✓ Верно, это ${DISPLAY_NAMES[expectedNote]}! (${nextSuccessCount}/${mixTarget})`,
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

  // =========================================================================
  // INVERSE SKILL: IDENTIFY MIX (`cdeIdentify`, `fbIdentify`, `fgabIdentify`, `allWhiteIdentify`)
  // =========================================================================
  if (desc.kind === 'identifyMix' && desc.identifyStage) {
    const stage = desc.identifyStage;
    const pool = getIdentifyPoolForStage(stage);
    const itemId = getIdentifyStageItemId(stage);
    const expectedNote: WhiteKeyNote =
      state.targetNote ?? state.identifyQueue[0] ?? pool[0];
    const isCorrect = pressedNote === expectedNote;
    const contextId = `identify:${expectedNote}`;

    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const mode: TrialMode = state.awaitingCorrective
        ? 'corrective'
        : 'mixedRetrieval';
      const trialContext = createTrialContext({
        mode,
        sessionId,
        itemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: !state.awaitingCorrective,
        inputMethod,
        contextId
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildWhiteKeyContrastFeedback(
              expectedNote,
              pressedNote
            ),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const remaining = state.identifyQueue.slice(1);
      const nextIdentifyQueue = scheduleMissedWhiteMixNote(
        remaining,
        expectedNote,
        pool
      );

      return {
        state: transitionToCurriculumStep(
          {
            ...state,
            progress,
            identifyQueue: nextIdentifyQueue
          },
          state.step,
          {
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            feedbackText: `✓ Исправлено: это ${DISPLAY_NAMES[expectedNote]}. Продолжаем!`,
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
      itemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: true,
      inputMethod,
      contextId
    });

    if (!isCorrect) {
      const updatedIdentify = recordIndependentAttempt(progress[itemId], {
        correct: false,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `miss:${expectedNote}`,
        at
      });
      saveProgress(updatedIdentify);

      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          state.step,
          {
            awaitingCorrective: true,
            feedbackText: buildWhiteKeyContrastFeedback(
              expectedNote,
              pressedNote
            ),
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

    let updatedIdentify = recordIndependentAttempt(progress[itemId], {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId,
      at
    });

    const allIdentified = pool.every(n => nextCompleted.includes(n));
    if (allIdentified) {
      updatedIdentify = markFsrsActivated(markMixReady(updatedIdentify, at), at);
      saveProgress(updatedIdentify);

      const nextStep = deriveWhiteKeyCurriculumStep(progress, config);
      return {
        state: transitionToCurriculumStep(
          {
            ...state,
            progress,
            identifyCompletedNotes: nextCompleted,
            identifyQueue: []
          },
          nextStep,
          {
            feedbackText:
              nextStep === 'phase3Complete'
                ? '✓ Все 7 белых клавиш освоены в обоих направлениях (найти и назвать)!'
                : '✓ Отлично! Группа клавиш уверенно распознаётся по названию.',
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
    const remainingQueue = state.identifyQueue.slice(1);
    if (remainingQueue.length === 0) {
      const missing = pool.filter(n => !nextCompleted.includes(n));
      remainingQueue.push(missing[0] ?? pool[0]);
    }

    return {
      state: transitionToCurriculumStep(
        {
          ...state,
          progress,
          identifyCompletedNotes: nextCompleted,
          identifyQueue: remainingQueue
        },
        state.step,
        {
          feedbackText: `✓ Верно, это ${DISPLAY_NAMES[expectedNote]}! (${nextCompleted.length}/${pool.length})`,
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

  // =========================================================================
  // GENERIC SUB-STAGE 5: DELAYED CHECK (First FSRS-Eligible Trial at H0)
  // =========================================================================
  if (
    desc.kind === 'noteAcquisition' &&
    desc.subStage === 'delayedCheck' &&
    desc.focusNote
  ) {
    const focusNote = desc.focusNote;
    const activeNote: WhiteKeyNote = state.isInterveningRecall
      ? (state.targetNote ?? chooseContrastLandmarkForNote(focusNote))
      : focusNote;
    const isCorrect = pressedNote === activeNote;
    const regionCtx = resolveFirstRunRegionContext(
      pressedNote,
      pressedKeyId,
      explicitContextId
    );
    const noteItemId = getNoteCurriculumItemId(focusNote);
    const mixItemId = getNoteMixCurriculumItemId(focusNote);
    const cardId = `find:${focusNote}` as const;

    // Case A: Intervening recall trial (`delayedRetrySpacing`) before retrying H0 delayedCheck
    if (state.isInterveningRecall) {
      if (state.awaitingCorrective || state.awaitingRemediationPress) {
        const trialContext = createTrialContext({
          mode: 'corrective',
          sessionId,
          itemId: mixItemId,
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          firstAttempt: false,
          inputMethod,
          contextId: regionCtx
        });
        if (!isCorrect) {
          return {
            state: {
              ...state,
              feedbackText: buildWhiteKeyContrastFeedback(
                activeNote,
                pressedNote
              ),
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
          state: transitionToCurriculumStep(state, state.step, {
            isInterveningRecall: false,
            remainingInterveningRecalls: 0,
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            feedbackText: `✓ Верно. Теперь снова проверьте ${DISPLAY_NAMES[focusNote]} по памяти без подсказок.`,
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
        itemId: mixItemId,
        hintLevel: HINT_LEVEL.NONE,
        firstAttempt: true,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: transitionToCurriculumStep(state, state.step, {
            isInterveningRecall: true,
            remainingInterveningRecalls: state.remainingInterveningRecalls,
            awaitingCorrective: true,
            feedbackText: buildWhiteKeyContrastFeedback(
              activeNote,
              pressedNote
            ),
            feedbackTone: 'bad'
          }),
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const nextRemaining = Math.max(0, state.remainingInterveningRecalls - 1);
      if (nextRemaining > 0) {
        return {
          state: transitionToCurriculumStep(state, state.step, {
            isInterveningRecall: true,
            remainingInterveningRecalls: nextRemaining,
            feedbackText: `✓ Верно! Ещё один контрастный шаг перед повторной проверкой ${focusNote}.`,
            feedbackTone: 'good'
          }),
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'progressed',
          fsrsDelayedCheck: null
        };
      }

      // Intervening spacing complete -> return to H0 delayedCheck on focusNote!
      return {
        state: transitionToCurriculumStep(state, state.step, {
          isInterveningRecall: false,
          remainingInterveningRecalls: 0,
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          feedbackText: `✓ Отлично! Теперь снова найдите ${DISPLAY_NAMES[focusNote]} без подсказки.`,
          feedbackTone: 'good'
        }),
        updatedProgress: [],
        trialContext,
        ignoredInput: false,
        outcome: 'progressed',
        fsrsDelayedCheck: null
      };
    }

    // Case B: Corrective press after a failed H0 delayedCheck (which already graded Again once)
    // Section 21: Do NOT unlock the next curriculum note! Transition to short remediation
    // (`isInterveningRecall`) and keep focusNote until independent H0 delayedCheck succeeds.
    if (state.awaitingCorrective) {
      const trialContext = createTrialContext({
        mode: 'corrective',
        sessionId,
        cardId,
        itemId: noteItemId,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        firstAttempt: false,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const contrastLandmark = chooseContrastLandmarkForNote(focusNote);
      const spacing = Math.max(1, config.delayedRetrySpacing);

      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          state.step,
          {
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            isInterveningRecall: true,
            remainingInterveningRecalls: spacing,
            feedbackText: `✓ Исправлено: это ${DISPLAY_NAMES[focusNote]}. Сначала найдите опорную клавишу ${contrastLandmark}, а затем повторим проверку ${focusNote} без подсказки.`,
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

    // Case C: Hinted delayedCheck (via prior 'Don't know' remediation OR caller-passed hintLevel > H0)
    // Section 20 & 36: Hinted delayedCheck NEVER mutates FSRS and requires intervening recall + H0 retry.
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
        itemId: noteItemId,
        hintLevel: callerHintLevel,
        firstAttempt: true,
        inputMethod,
        contextId: regionCtx
      });

      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
            feedbackTone: 'bad'
          },
          updatedProgress: [],
          trialContext,
          ignoredInput: false,
          outcome: 'wrong_note',
          fsrsDelayedCheck: null
        };
      }

      const contrastLandmark = chooseContrastLandmarkForNote(focusNote);
      const spacing = Math.max(1, config.delayedRetrySpacing);

      return {
        state: transitionToCurriculumStep(state, state.step, {
          awaitingRemediationPress: false,
          isInterveningRecall: true,
          remainingInterveningRecalls: spacing,
          feedbackText: `✓ Нашли ${focusNote} с подсказкой. Сначала найдите опорную ${contrastLandmark}, а затем проверим ${focusNote} без подсказки.`,
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
    // A retry after remediation keeps `pending:delayedRetry` and must not grade FSRS again.
    const trialContext = createTrialContext({
      mode: 'delayedCheck',
      sessionId,
      cardId,
      itemId: noteItemId,
      hintLevel: HINT_LEVEL.NONE,
      firstAttempt: isDelayedCheckFirstAttempt(progress[noteItemId].contexts),
      inputMethod,
      contextId: regionCtx
    });

    const fsrsDelayedCheck: CurriculumDelayedCheckPayload = {
      cardId,
      note: focusNote,
      isCorrect,
      answer: pressedNote,
      answerKeyId: pressedKeyId,
      trialContext
    };

    if (!isCorrect) {
      // Failed H0 delayedCheck (Section 21):
      // 1. FSRS grades Again (via fsrsDelayedCheck payload in applyCurriculumActionWithCards)
      // 2. Persist 'pending:delayedRetry' in contexts so reload/resume keeps this note on delayedCheck
      // 3. Do NOT advance to next curriculum note; enter awaitingCorrective -> interveningRecall -> retry!
      const curNoteRec = progress[noteItemId];
      const pendingNoteRec: LearningProgressRecord = {
        ...curNoteRec,
        state: 'mixReady',
        contexts: appendUniqueContext(
          appendUniqueContext(
            curNoteRec.contexts,
            'pending:delayedRetry'
          ),
          GRADED_FAILURE_CONTEXT
        ),
        updatedAt: at
      };
      saveProgress(pendingNoteRec);

      return {
        state: transitionToCurriculumStep(
          { ...state, progress },
          state.step,
          {
            awaitingCorrective: true,
            feedbackText: buildWhiteKeyContrastFeedback(focusNote, pressedNote),
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

    // Successful H0 delayedCheck -> promote note to 'retention' (RETENTION_MASTERED) and advance!
    const cleanContexts = progress[noteItemId].contexts.filter(
      c => c !== 'pending:delayedRetry' && c !== GRADED_FAILURE_CONTEXT
    );
    const activatedNote = markFsrsActivated(
      {
        ...progress[noteItemId],
        contexts: appendUniqueContext(cleanContexts, regionCtx)
      },
      at
    );
    saveProgress(activatedNote);

    const nextStep = deriveWhiteKeyCurriculumStep(progress, config);
    return {
      state: transitionToCurriculumStep(
        { ...state, progress },
        nextStep,
        {
          feedbackText: `✓ Отлично! Клавиша ${DISPLAY_NAMES[focusNote]} закреплена по памяти и добавлена в расписание повторений.`,
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

export interface ApplyCurriculumActionWithCardsParams {
  state: WhiteKeyCurriculumState;
  action: WhiteKeyCurriculumAction;
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

export interface ApplyCurriculumActionWithCardsResult
  extends WhiteKeyCurriculumTransitionResult {
  attemptResult: SubmitQuestionAttemptResult | null;
  mutatedCard: Card | null;
}

/**
 * High-level helper that advances the Milestone 3C White-Key Curriculum state machine
 * and applies FSRS ONLY when an unhinted H0 `delayedCheck` occurs on `find:<Note>`.
 * - If the H0 `delayedCheck` is correct: mutates the FSRS card and promotes the note to `'retention'`.
 * - If the H0 `delayedCheck` is wrong: mutates the FSRS card with `grade = Again` (`1`),
 *   keeps the note in `'mixReady'` (NOT `'retention'`), and blocks unlocking the next concept
 *   until correction + short remediation + delayed H0 retry succeeds.
 */
export function applyCurriculumActionWithCards(
  params: ApplyCurriculumActionWithCardsParams
): ApplyCurriculumActionWithCardsResult {
  const reviewedAt = params.reviewedAt ?? params.action.at ?? Date.now();
  const transition = advanceCurriculumProgress(params.state, {
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
    // Missing card guard: do not transition to retention or advance if target card is missing
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

  const reviewKind: ReviewKind = card.reps > 0 ? 'scheduled' : 'new';
  const attemptResult = submitQuestionAttempt({
    state: roundState,
    card,
    kind: reviewKind,
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

  if (!attemptResult.cardMutated || !attemptResult.logEvent?.gradeableByFsrs) {
    // Canonical rule: a remediation retry never grades FSRS, but its pedagogical
    // transition (corrective requirement or retention on success) must still apply.
    const itemId = getNoteCurriculumItemId(note as WhiteKeyNote);
    const wasPendingRetry = hasPendingDelayedRetry(params.state.progress[itemId]?.contexts);
    if (!wasPendingRetry) {
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
    return {
      ...transition,
      attemptResult,
      mutatedCard: null
    };
  }

  // Note: If `isCorrect === false`, `advanceCurriculumProgress` already kept the note in
  // `'mixReady'` (with `'pending:delayedRetry'`) and kept `state.step` on `<note>DelayedCheck`.
  // If `isCorrect === true`, `advanceCurriculumProgress` already marked the note `'retention'`
  // and advanced `state.step` to the next curriculum step.
  void note;

  return {
    ...transition,
    attemptResult,
    mutatedCard: card
  };
}

export type TrainingQueuePriority =
  | 'due_scheduled_review'
  | 'active_teaching_continuation'
  | 'controlled_mixed_retrieval'
  | 'next_curriculum_introduction'
  | 'free_practice';

export interface ResolveTrainingOrchestrationParams {
  cards: readonly Card[];
  learningProgress?: ProgressCollectionInput;
  reviewLogs?: readonly ReviewLogEvent[];
  curriculumState?: WhiteKeyCurriculumState | null;
  now?: number;
  recentCards?: readonly Card[];
  sessionIntroducedNotes?: Set<NoteName>;
  maxNewPitchClasses?: number;
  lastConfusionTrial?: number;
  sessionTrials?: number;
  sessionConfusionReviews?: number;
}

export interface TrainingOrchestrationDecision {
  priority: TrainingQueuePriority;
  activeCards: Card[];
  dueCard: Card | null;
  curriculumStep: WhiteKeyCurriculumStep | null;
  schedulerCard: Card | null;
  schedulerKind: ReviewKind | null;
}

/**
 * Canonical Milestone 3C Training queue orchestrator (Section 23):
 * Enforces the 5-level priority order strictly over curriculum-active material:
 * 1. due scheduled reviews (`due_scheduled_review`)
 * 2. active teaching continuation (`active_teaching_continuation`)
 * 3. controlled mixed retrieval (`controlled_mixed_retrieval`)
 * 4. next curriculum introduction (`next_curriculum_introduction`)
 * 5. optional free practice (`free_practice`)
 */
export function resolveTrainingOrchestration(
  params: ResolveTrainingOrchestrationParams
): TrainingOrchestrationDecision {
  const now = params.now ?? Date.now();
  const recentCards = params.recentCards ?? [];
  const activeCards = filterCurriculumActiveCards(params.cards, {
    learningProgress: params.learningProgress,
    cards: params.cards,
    reviewLogs: params.reviewLogs
  });

  const cState = params.curriculumState ?? null;
  const isMidRemediation = Boolean(
    cState &&
      (cState.awaitingCorrective ||
        cState.awaitingRemediationPress ||
        cState.isInterveningRecall)
  );

  // 1. Due scheduled reviews for already activated curriculum cards
  if (!isMidRemediation) {
    const dueCard = chooseDue(activeCards, now, recentCards);
    if (dueCard) {
      return {
        priority: 'due_scheduled_review',
        activeCards,
        dueCard,
        curriculumStep: cState?.step ?? null,
        schedulerCard: dueCard,
        schedulerKind: 'scheduled'
      };
    }
  }

  // 2, 3, 4. Active Milestone 3C curriculum flow (when Phase 3 is not yet completed)
  if (cState && cState.step !== 'phase3Complete') {
    const desc = describeCurriculumStep(cState.step);
    if (
      desc.kind === 'allWhiteMix' ||
      desc.kind === 'identifyMix' ||
      (desc.kind === 'noteAcquisition' && desc.subStage === 'localMix')
    ) {
      return {
        priority: 'controlled_mixed_retrieval',
        activeCards,
        dueCard: null,
        curriculumStep: cState.step,
        schedulerCard: null,
        schedulerKind: null
      };
    }

    if (desc.kind === 'noteAcquisition' && desc.subStage === 'model') {
      return {
        priority: 'next_curriculum_introduction',
        activeCards,
        dueCard: null,
        curriculumStep: cState.step,
        schedulerCard: null,
        schedulerKind: null
      };
    }

    return {
      priority: 'active_teaching_continuation',
      activeCards,
      dueCard: null,
      curriculumStep: cState.step,
      schedulerCard: null,
      schedulerKind: null
    };
  }

  // 5. Post-curriculum / optional free practice (ONLY over curriculum-active cards!)
  const introducedSet = params.sessionIntroducedNotes ?? new Set<NoteName>();
  const maxNew = params.maxNewPitchClasses ?? 2;

  const freshActive = chooseNew(
    activeCards,
    introducedSet,
    maxNew,
    n => activeCards.some(c => c.note === n && c.reps > 0),
    recentCards
  );
  if (freshActive) {
    return {
      priority: 'free_practice',
      activeCards,
      dueCard: null,
      curriculumStep: null,
      schedulerCard: freshActive,
      schedulerKind: 'new'
    };
  }

  const confusion = chooseConfusionPractice(
    activeCards,
    (params.reviewLogs ?? []) as readonly {
      kind: string;
      note: NoteName;
      answer?: NoteName | null;
    }[],
    recentCards,
    params.lastConfusionTrial ?? -99,
    params.sessionTrials ?? 0,
    params.sessionConfusionReviews ?? 0
  );
  if (confusion) {
    return {
      priority: 'free_practice',
      activeCards,
      dueCard: null,
      curriculumStep: null,
      schedulerCard: confusion,
      schedulerKind: 'confusion'
    };
  }

  const practice = choosePractice(activeCards, now, recentCards);
  return {
    priority: 'free_practice',
    activeCards,
    dueCard: null,
    curriculumStep: null,
    schedulerCard: practice,
    schedulerKind: practice ? 'practice' : null
  };
}

export {
  ALL_WHITE_CURRICULUM_NOTES,
  CURRICULUM_ACQUISITION_ORDER,
  DEFAULT_WHITE_KEY_CURRICULUM_CONFIG,
  THREE_BLACK_FAMILY_NOTES,
  TWO_BLACK_FAMILY_NOTES,
  WHITE_KEY_GEOMETRY,
  getFamilyMixPool,
  getIdentifyPoolForStage,
  getLocalMixPool,
  isConstrainedWhiteMixSequence,
  type CurriculumAcquisitionNote,
  type CurriculumIdentifyStageId,
  type WhiteKeyCurriculumConfig,
  type WhiteKeyFamilyId,
  type WhiteKeyNote
} from './whiteKeys';
void NATURAL_NOTES;
