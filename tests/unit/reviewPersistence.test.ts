import { describe, expect, it } from 'vitest';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import { commitCardReview, type PersistReviewRecord } from '../../src/core/fsrs/reviewPersistence';
import {
  BASS_GRAND_ITEM_IDS,
  applyBassGrandActionWithCards,
  initializeBassGrandCurriculumState
} from '../../src/core/learning/bassGrandStaff';
import {
  INTERVAL_ITEM_IDS,
  applyIntervalActionWithCards,
  buildIntervalStateForStep
} from '../../src/core/learning/intervals';
import {
  TRIAD_ITEM_IDS,
  applyTriadActionWithCards,
  buildTriadStateForStep
} from '../../src/core/learning/triads';
import {
  evaluateDailyInversionAttempt,
  buildTriadVoicing
} from '../../src/core/learning/chordInversions';
import { createInitialLearningProgress } from '../../src/core/learning/progress';
import type { LearningProgressRecord } from '../../src/core/learning/types';

const NOW = 1_791_916_528_197;

function makeCard(skill: Skill, note: NoteName): Card {
  const reps = 1;
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'review',
    stability: 2.5,
    difficulty: 5,
    dueAt: NOW,
    lastReviewAt: NOW - 86_400_000,
    firstSeenAt: NOW - 86_400_000,
    reps,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: reps,
      firstCorrect: reps,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: reps,
      scheduledSuccesses: reps,
      practiceTrials: 0
    }
  };
}

function progressRecord(id: string, state: LearningProgressRecord['state']): LearningProgressRecord {
  return { ...createInitialLearningProgress(id, NOW), state, contexts: [] };
}

async function exercisePersistenceBoundary(
  label: string,
  card: Card,
  attemptResult: { logEvent: Parameters<typeof commitCardReview>[0]['logEvent']; cardMutated: boolean }
) {
  expect(attemptResult.logEvent).not.toBeNull();
  const writes: PersistReviewRecord[] = [];
  const persist = async (record: PersistReviewRecord) => { writes.push(record); };
  const firstCommit = await commitCardReview({
    card,
    logEvent: attemptResult.logEvent,
    cardMutated: attemptResult.cardMutated,
    reviewLogs: [],
    persist
  });
  const duplicateCommit = await commitCardReview({
    card,
    logEvent: attemptResult.logEvent,
    cardMutated: attemptResult.cardMutated,
    reviewLogs: firstCommit,
    persist
  });

  expect(writes, label).toHaveLength(1);
  expect(writes[0].card, label).toEqual(attemptResult.cardMutated ? card : null);
  expect(writes[0].event, label).toEqual(attemptResult.logEvent);
  expect(firstCommit, label).toHaveLength(1);
  expect(duplicateCommit, label).toHaveLength(1);
}

describe('advanced module review persistence boundary', () => {
  it('commits real Bass delayed-check attempt once', async () => {
    const card = makeCard('notationBassToKey', 'F');
    const progress = {
      [BASS_GRAND_ITEM_IDS.ORIENTATION]: progressRecord(BASS_GRAND_ITEM_IDS.ORIENTATION, 'retention'),
      [BASS_GRAND_ITEM_IDS.NOTE_F]: {
        ...progressRecord(BASS_GRAND_ITEM_IDS.NOTE_F, 'mixReady'),
        modelCompleted: true
      }
    };
    const state = initializeBassGrandCurriculumState({ learningProgress: progress, now: NOW });
    const result = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards: [card],
      settings: DEFAULT_SETTINGS,
      now: NOW
    });

    expect(result.attemptResult?.cardMutated).toBe(true);
    await exercisePersistenceBoundary('Bass', result.mutatedCard!, result.attemptResult!);
  });

  it('commits real interval delayed-check attempt once', async () => {
    const card = makeCard('intervalBuild', 'P8');
    const progress = {
      [INTERVAL_ITEM_IDS.ORIENTATION]: progressRecord(INTERVAL_ITEM_IDS.ORIENTATION, 'retention'),
      [INTERVAL_ITEM_IDS.BUILD_P8]: progressRecord(INTERVAL_ITEM_IDS.BUILD_P8, 'mixReady')
    };
    const state = buildIntervalStateForStep('p8BuildDelayedCheck', progress, NOW);
    const result = applyIntervalActionWithCards({
      state,
      action: { type: 'keyPress', keyId: state.targetKeyId || 'C5', note: 'C' },
      cards: [card],
      settings: DEFAULT_SETTINGS,
      now: NOW
    });

    expect(result.attemptResult?.cardMutated).toBe(true);
    await exercisePersistenceBoundary('Intervals', result.mutatedCard!, result.attemptResult!);
  });

  it('commits real triad delayed-check attempt once', async () => {
    const card = makeCard('triadBuild', 'major');
    const progress = {
      [TRIAD_ITEM_IDS.BUILD_MAJOR]: progressRecord(TRIAD_ITEM_IDS.BUILD_MAJOR, 'retention')
    };
    const state = buildTriadStateForStep('majorBuildDelayedCheck', progress, NOW);
    const result = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: ['C4', 'D4', 'F4'] },
      cards: new Map([[card.id, card]]),
      userSettings: DEFAULT_SETTINGS,
      now: NOW
    });

    expect(result.attemptResult?.cardMutated).toBe(true);
    await exercisePersistenceBoundary('Triads', result.mutatedCard!, result.attemptResult!);
  });

  it('commits real inversion scheduled attempt once', async () => {
    const card = makeCard('triadInversionBuild', 'first');
    const expectedKeyIds = buildTriadVoicing('C4', 'major', 'first').keyIds;
    const result = evaluateDailyInversionAttempt({
      card,
      kind: 'scheduled',
      rootKeyId: 'C4',
      quality: 'major',
      inversion: 'first',
      expectedKeyIds,
      userKeyIds: ['C4', 'E4', 'G4'],
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      responseMs: 900,
      settings: DEFAULT_SETTINGS,
      sessionId: 'integration-inversion-session'
    });

    expect(result.attemptResult.cardMutated).toBe(true);
    await exercisePersistenceBoundary('Inversions', card, result.attemptResult);
  });
});
