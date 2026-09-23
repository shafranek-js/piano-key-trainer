import type { Card, NoteName, NaturalNoteName, ReviewLogEvent, Skill } from '../fsrs/types';
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

export function getCurriculumPhases(
  level: 'white' | 'all',
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[]
): CurriculumPhase[] {
  const anchorsReady = groupReady(CURRICULUM_GROUPS.anchors, getCard, reviewLog);
  const neighborsReady = groupReady(CURRICULUM_GROUPS.neighbors, getCard, reviewLog);
  const remainingReady = groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog);
  const blackRequired = level === 'all';
  const blackReady = !blackRequired || groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
  const notationOpen = remainingReady && blackReady;
  const notationReady = notationOpen && notationCurriculumReady(getCard, reviewLog);
  const soundOpen = notationReady;
  const soundReady =
    soundOpen &&
    NATURAL_NOTES.every(note =>
      curriculumCardReady(getCard('soundToKey', note), reviewLog)
    );

  return [
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
}
