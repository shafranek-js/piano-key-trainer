import type { Card, NoteName, ReviewLogEvent, Skill } from '../fsrs/types';
import { 
  CURRICULUM_GROUPS, 
  CURRICULUM_MIN_STABILITY_DAYS, 
  NATURAL_NOTES 
} from '../fsrs/constants';

export type CardGetter = (skill: Skill, note: NoteName) => Card;

export interface CurriculumPhase {
  id: string;
  title: string;
  detail: string;
  open: boolean;
  done: boolean;
  skipped?: boolean;
}

export function successfulScheduledSessions(
  cardId: string,
  reviewLog: readonly ReviewLogEvent[]
): number {
  return new Set(
    reviewLog
      .filter(
        e =>
          e.cardId === cardId &&
          (e.kind === 'scheduled' || e.kind === 'new') &&
          e.firstCorrect &&
          e.grade != null &&
          e.grade !== 1
      )
      .map(e => e.sessionId)
  ).size;
}

export function curriculumCardReady(
  card: Card | undefined,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return (
    !!card &&
    card.reps > 0 &&
    (card.stability ?? 0) >= CURRICULUM_MIN_STABILITY_DAYS &&
    (card.stats.scheduledSuccesses ?? 0) >= 2 &&
    successfulScheduledSessions(card.id, reviewLog) >= 2 &&
    card.lastGrade !== 1
  );
}

export function baseNoteReady(
  note: NoteName,
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return (
    curriculumCardReady(getCard('find', note), reviewLog) &&
    curriculumCardReady(getCard('identify', note), reviewLog)
  );
}

export function groupReady(
  notes: readonly NoteName[],
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return notes.every(note => baseNoteReady(note, getCard, reviewLog));
}

export function notationPrerequisitesMet(
  note: NoteName,
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return baseNoteReady(note, getCard, reviewLog);
}

export function notationCurriculumOpen(
  level: 'white' | 'all',
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  if (!groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog)) return false;
  return level === 'white' || groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
}

export function notationCurriculumReady(
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return NATURAL_NOTES.every(note =>
    curriculumCardReady(getCard('notationToKey', note), reviewLog)
  );
}

export function soundPrerequisitesMet(
  note: NoteName,
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return (
    notationPrerequisitesMet(note, getCard, reviewLog) &&
    curriculumCardReady(getCard('notationToKey', note), reviewLog)
  );
}

export function soundCurriculumOpen(
  level: 'white' | 'all',
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  return (
    notationCurriculumOpen(level, getCard, reviewLog) &&
    notationCurriculumReady(getCard, reviewLog)
  );
}

export function curriculumNoteAvailable(
  note: NoteName,
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): boolean {
  if (CURRICULUM_GROUPS.anchors.includes(note)) return true;
  if (CURRICULUM_GROUPS.neighbors.includes(note)) {
    return groupReady(CURRICULUM_GROUPS.anchors, getCard, reviewLog);
  }
  if (CURRICULUM_GROUPS.remaining.includes(note)) {
    return groupReady(CURRICULUM_GROUPS.neighbors, getCard, reviewLog);
  }
  if (CURRICULUM_GROUPS.black.includes(note)) {
    return groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog);
  }
  return false;
}

import type { LearningProgressRecord } from '../learning/types';
import { isFirstRunCfCompleted } from '../learning/firstRunCf';
import {
  isWhiteKeyCurriculumCompleted,
  WHITE_KEY_CURRICULUM_ITEM_IDS
} from '../learning/curriculumFlow';
import {
  isPhase4BlackKeysCompleted,
  isPhase5NotationCompleted,
  isPhase6EarCompleted
} from '../learning/curriculum3d';

export function getCurriculumPhases(
  level: 'white' | 'all',
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[],
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[],
  normalize = true
): CurriculumPhase[] {
  const lpList: LearningProgressRecord[] | null =
    learningProgress instanceof Map
      ? Array.from(learningProgress.values())
      : Array.isArray(learningProgress)
        ? [...learningProgress]
        : null;
  const lpMap = lpList ? new Map(lpList.map(r => [r.id, r])) : null;

  const anchorsReadyByFsrs = groupReady(CURRICULUM_GROUPS.anchors, getCard, reviewLog);
  const anchorsReady =
    anchorsReadyByFsrs || (lpList !== null && isFirstRunCfCompleted(lpList));

  const neighborsReadyByFsrs = groupReady(CURRICULUM_GROUPS.neighbors, getCard, reviewLog);
  const neighborsReadyByProgress =
    lpMap !== null &&
    lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_D)?.state === 'retention' &&
    lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E)?.state === 'retention' &&
    lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_B)?.state === 'retention' &&
    lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE)?.state === 'retention' &&
    lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB)?.state === 'retention';
  const neighborsReady = neighborsReadyByFsrs || neighborsReadyByProgress;

  const remainingReadyByFsrs = groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog);
  const remainingReadyByProgress =
    lpList !== null &&
    isWhiteKeyCurriculumCompleted({
      learningProgress: lpList,
      reviewLogs: reviewLog
    });
  const remainingReady = remainingReadyByFsrs || remainingReadyByProgress;

  if (lpList !== null) {
    const blackReadyByProgress = isPhase4BlackKeysCompleted(lpList, undefined, reviewLog);
    const blackReadyByFsrs = groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
    const blackOpen = remainingReady;
    const blackReady = blackOpen && (blackReadyByProgress || blackReadyByFsrs);

    const notationOpen = blackReady;
    const notationReady =
      notationOpen &&
      (isPhase5NotationCompleted(lpList) ||
        notationCurriculumReady(getCard, reviewLog));

    const soundOpen = notationReady;
    const soundReady =
      soundOpen &&
      (isPhase6EarCompleted(lpList) ||
        NATURAL_NOTES.every(note =>
          curriculumCardReady(getCard('soundToKey', note), reviewLog)
        ));

    const phases: CurriculumPhase[] = [
      { id: 'anchors', title: '1 · Ориентиры', detail: 'C + F', open: true, done: anchorsReady },
      { id: 'neighbors', title: '2 · Соседи', detail: 'D · E · B', open: anchorsReady, done: neighborsReady },
      { id: 'remaining', title: '3 · Белые', detail: 'G · A · C–B', open: neighborsReady, done: remainingReady },
      {
        id: 'black',
        title: '4 · Чёрные',
        detail: 'C♯ F♯ G♯ D♯ A♯',
        open: blackOpen,
        done: blackReady,
        skipped: false
      },
      { id: 'notation', title: '5 · Нотный стан', detail: 'C4–B4', open: notationOpen, done: notationReady },
      { id: 'sound', title: '6 · Слух', detail: 'C4 → target', open: soundOpen, done: soundReady }
    ];
    return normalize ? normalizeSequentialPhaseCompletion(phases) : phases;
  }

  const blackRequired = level === 'all';
  const blackReady = groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
  const notationOpen = remainingReady && (!blackRequired || blackReady);
  const notationReady = notationOpen && notationCurriculumReady(getCard, reviewLog);
  const soundOpen = notationReady;
  const soundReady =
    soundOpen &&
    NATURAL_NOTES.every(note =>
      curriculumCardReady(getCard('soundToKey', note), reviewLog)
    );

  const phases: CurriculumPhase[] = [
    { id: 'anchors', title: '1 · Ориентиры', detail: 'C + F', open: true, done: anchorsReady },
    { id: 'neighbors', title: '2 · Соседи', detail: 'D · E · B', open: anchorsReady, done: neighborsReady },
    { id: 'remaining', title: '3 · Белые', detail: 'G · A', open: neighborsReady, done: remainingReady },
    {
      id: 'black',
      title: '4 · Чёрные',
      detail: blackRequired ? 'C♯ F♯ G♯ D♯ A♯' : 'пропущено в White',
      open: remainingReady,
      done: blackReady,
      skipped: !blackRequired
    },
    { id: 'notation', title: '5 · Нотный стан', detail: 'C4–B4', open: notationOpen, done: notationReady },
    { id: 'sound', title: '6 · Слух', detail: 'C4 → target', open: soundOpen, done: soundReady }
  ];
  return normalize ? normalizeSequentialPhaseCompletion(phases) : phases;
}

/**
 * Normalizes sequential curriculum phase completion to strictly preserve the curriculum invariant:
 * The 6 core phases are sequential prerequisites.
 * If Phase N is completed, all prerequisite phases < N MUST be marked completed.
 * The current phase is strictly the first incomplete phase in sequential order.
 * Future phases after the current phase must remain locked (open: false, done: false).
 * Pure function: does not mutate input or any global state.
 */
export function normalizeSequentialPhaseCompletion(
  phases: readonly CurriculumPhase[]
): CurriculumPhase[] {
  if (!phases || phases.length === 0) return [];

  // 1. Find the highest index where raw done === true
  let highestDoneIndex = -1;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].done) {
      highestDoneIndex = i;
    }
  }

  // 2. Any phase <= highestDoneIndex must be passed
  const passed = phases.map((_, i) => i <= highestDoneIndex);

  // 3. Cascade any contiguous skipped phases forward:
  // If phase i is skipped AND all previous phases 0..i-1 are passed,
  // then phase i is also passed.
  for (let i = 0; i < phases.length; i++) {
    if (!passed[i] && phases[i].skipped) {
      const allPrevPassed = i === 0 || passed.slice(0, i).every(Boolean);
      if (allPrevPassed) {
        passed[i] = true;
      }
    }
  }

  // 4. Find the highest passed phase index
  let highestPassedIndex = -1;
  for (let i = 0; i < phases.length; i++) {
    if (passed[i]) {
      highestPassedIndex = i;
    }
  }

  return phases.map((phase, index) => {
    const isPassed = index <= highestPassedIndex;
    const isSkipped = Boolean(phase.skipped);
    const isDone = isSkipped ? false : isPassed;

    // A phase is open if it is the first phase, or if it is completed/skipped,
    // or if the immediately preceding phase is completed/skipped
    const isOpen = index === 0 || index <= highestPassedIndex + 1;

    return {
      ...phase,
      open: isOpen,
      done: isDone,
      skipped: isSkipped
    };
  });
}

