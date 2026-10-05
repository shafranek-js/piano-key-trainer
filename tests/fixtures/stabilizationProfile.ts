import type { Card, NoteName, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';
import {
  createInitialLearningProgress,
  markFsrsActivated,
  markMixReady,
  recordModelCompleted
} from '../../src/core/learning/progress';
import type { LearningProgressRecord } from '../../src/core/learning/types';
import {
  getNoteCurriculumItemId,
  getNoteMixCurriculumItemId,
  WHITE_KEY_CURRICULUM_ITEM_IDS
} from '../../src/core/learning/curriculumFlow';
import {
  BLACK_KEY_ACQUISITION_ORDER,
  EAR_ACQUISITION_ORDER,
  MILESTONE_3D_ITEM_IDS,
  NOTATION_ACQUISITION_ORDER
} from '../../src/core/learning/curriculum3d';

export const STABILIZATION_PROFILE_NOW = 1_791_018_000_000;

function completedRecord(id: string, now: number): LearningProgressRecord {
  const base = createInitialLearningProgress(id, now);
  const record = markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now);
  return {
    ...record,
    state: 'retention',
    guidedSuccesses: 2,
    independentUnhintedSuccesses: 5,
    contexts: []
  };
}

function card(skill: Skill, note: NoteName, now: number, dueAt: number): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'review',
    stability: 6,
    difficulty: 4,
    dueAt,
    lastReviewAt: now - 10 * 86_400_000,
    firstSeenAt: now - 30 * 86_400_000,
    reps: 5,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 5,
      firstCorrect: 5,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 5,
      scheduledSuccesses: 5,
      practiceTrials: 0
    }
  };
}

function newCard(skill: Skill, note: NoteName): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'new',
    stability: null,
    difficulty: null,
    dueAt: 0,
    lastReviewAt: 0,
    firstSeenAt: 0,
    reps: 0,
    lapses: 0,
    lastGrade: null,
    stats: {
      trials: 0,
      firstCorrect: 0,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: 0,
      practiceTrials: 0
    }
  };
}

function reviewEvent(
  sessionId: string,
  ts: number,
  skill: Skill,
  note: NoteName
): ReviewLogEvent {
  return {
    ts,
    sessionId,
    cardId: `${skill}:${note}`,
    note,
    skill,
    kind: 'scheduled',
    grade: 3,
    gradeName: 'Good',
    firstCorrect: true,
    answer: note,
    answerKeyId: `${note}4`,
    attempts: 1,
    hintUsed: false,
    responseMs: 1200,
    elapsedDays: 3,
    retrievabilityBefore: 0.85,
    stabilityBefore: 4,
    stabilityAfter: 6,
    difficultyBefore: 4,
    difficultyAfter: 4,
    scheduledDays: 6,
    schedulerReason: 'scheduled_due'
  };
}

/** Sanitized regression profile for the stabilization checkpoint; contains no user data. */
export function createSanitizedStabilizationProfile() {
  const now = STABILIZATION_PROFILE_NOW;
  const learningProgress = new Map<string, LearningProgressRecord>();
  const markDone = (id: string) => learningProgress.set(id, completedRecord(id, now - 100_000));

  // Leave Phase 1 raw evidence absent so diagnostics exercises raw-versus-normalized state.
  for (const note of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(note));
    markDone(getNoteMixCurriculumItemId(note));
  }
  for (const id of Object.values(WHITE_KEY_CURRICULUM_ITEM_IDS).filter(id =>
    !id.includes('curriculum-note:') && !id.includes('curriculum-mix:')
  )) markDone(id);
  for (const note of BLACK_KEY_ACQUISITION_ORDER) markDone(`curriculum-black:${note}`);
  for (const note of NOTATION_ACQUISITION_ORDER) markDone(`curriculum-notation:${note}`);
  for (const note of EAR_ACQUISITION_ORDER) markDone(`curriculum-ear:${note}`);
  for (const id of Object.values(MILESTONE_3D_ITEM_IDS)) markDone(id);

  // Historical shape: transfer persisted as retention without the later COMPLETE marker.
  learningProgress.set('advanced-grand:transfer', completedRecord('advanced-grand:transfer', now - 80_000));
  const intervalOrientation = createInitialLearningProgress('advanced-interval:orientation', now - 70_000);
  intervalOrientation.state = 'introduced';
  learningProgress.set(intervalOrientation.id, intervalOrientation);

  const cards = [
    card('find', 'C', now, now - 2 * 86_400_000),
    card('identify', 'D', now, now + 3 * 86_400_000),
    card('notationToKey', 'E', now, now + 3 * 86_400_000),
    card('soundToKey', 'F', now, now + 3 * 86_400_000),
    newCard('notationToKey', 'G'),
    newCard('intervalBuild', 'P8')
  ];

  // Mirror the additional fresh FSRS cards that App.loadData() creates for an
  // existing profile, keeping exported diagnostics and the runtime capture aligned.
  const defaultRows: Array<{ skill: Skill; note: NoteName }> = [];
  for (const note of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const) {
    defaultRows.push({ skill: 'notationBassToKey', note });
  }
  for (const interval of ['P8', 'P5', 'M3', 'm3'] as const) {
    defaultRows.push({ skill: 'intervalBuild', note: interval });
    defaultRows.push({ skill: 'intervalIdentify', note: interval });
  }
  for (const quality of ['major', 'minor'] as const) {
    defaultRows.push({ skill: 'triadBuild', note: quality });
    defaultRows.push({ skill: 'triadIdentify', note: quality });
  }
  defaultRows.push(
    { skill: 'triadInversionBuild', note: 'first' },
    { skill: 'triadInversionBuild', note: 'second' },
    { skill: 'triadInversionIdentify', note: 'first' },
    { skill: 'triadInversionBuild', note: 'slash' },
    { skill: 'chordSymbolRead', note: 'slash' }
  );
  const cardIds = new Set(cards.map(item => item.id));
  for (const item of defaultRows) {
    const id = `${item.skill}:${item.note}`;
    if (!cardIds.has(id)) {
      cards.push(newCard(item.skill, item.note));
      cardIds.add(id);
    }
  }

  const family: Array<{ skill: Skill; note: NoteName }> = [
    { skill: 'find', note: 'C' },
    { skill: 'identify', note: 'D' },
    { skill: 'notationToKey', note: 'E' },
    { skill: 'soundToKey', note: 'F' }
  ];
  const reviewLogs: ReviewLogEvent[] = [];
  for (let index = 0; index < 12; index++) {
    const item = family[index % family.length];
    const ts = now - 20_000 + index * 1000;
    reviewLogs.push(reviewEvent(`practice-${index + 1}`, ts, item.skill, item.note));
  }
  // A compact historical burst and an event from the earlier session after its successor began.
  reviewLogs.push(reviewEvent('practice-10', now - 61, 'find', 'C'));
  reviewLogs.push(reviewEvent('practice-11', now - 41, 'identify', 'D'));
  reviewLogs.push(reviewEvent('practice-12', now - 21, 'notationToKey', 'E'));
  reviewLogs.push(reviewEvent('practice-10', now - 19, 'find', 'C'));

  return {
    now,
    cards,
    learningProgress,
    reviewLogs
  };
}
