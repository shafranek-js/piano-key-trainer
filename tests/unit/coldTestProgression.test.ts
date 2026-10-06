import { describe, expect, it } from 'vitest';
import {
  COLD_TEST_SKILLS,
  COLD_TEST_TARGET_TRIALS,
  activateColdTestItem,
  coldTestActiveItemNumber,
  coldTestItemNumber,
  coldTestTotalTrials,
  createColdTestNavigation,
  isColdTestComplete,
  resolveColdTestCompletion,
  resolveColdTestItemCompletion
} from '../../src/core/learning/coldTest';
import type { ColdTestNavigation } from '../../src/core/learning/coldTest';
import { buildColdQueue } from '../../src/core/scheduler/queue';
import { evaluateDailyChordAttempt } from '../../src/core/learning/triads';
import { evaluateDailyInversionAttempt } from '../../src/core/learning/chordInversions';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';

const NOW = 1_791_916_528_197;

function makeCard(skill: Skill, note: NoteName, reps = 1): Card {
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

describe('Cold Test progression — supported task families', () => {
  it('the queue builder covers every Cold Test skill family', () => {
    const cards = COLD_TEST_SKILLS.map(skill => makeCard(skill, 'C'));
    expect(cards).toHaveLength(COLD_TEST_SKILLS.length);
    const queue = buildColdQueue(cards, 20);
    expect(queue).toHaveLength(20);
    const queueSkills = new Set(queue.map(id => id.split(':')[0]));
    for (const skill of COLD_TEST_SKILLS) {
      expect(queueSkills.has(skill), `Cold Test queue does not cover ${skill}`).toBe(true);
    }
  });

  it.each(COLD_TEST_SKILLS)('completion contract advances exactly once for %s', skill => {
    const itemKey = `session-cold:question-${skill}`;
    const first = resolveColdTestCompletion({
      queueLength: 20,
      index: 7,
      completedItemKey: null,
      itemKey
    });
    expect(first.claimed).toBe(true);
    expect(first.nextIndex).toBe(8);
    expect(first.progress.completedItemKey).toBe(itemKey);

    const duplicate = resolveColdTestCompletion({
      queueLength: 20,
      index: first.nextIndex,
      completedItemKey: first.progress.completedItemKey,
      itemKey
    });
    expect(duplicate.claimed).toBe(false);
    expect(duplicate.nextIndex).toBe(8);
  });
});

describe('Cold Test progression — negative and boundary cases', () => {
  it('never advances without a question identity', () => {
    const result = resolveColdTestCompletion({ queueLength: 20, index: 5, completedItemKey: null, itemKey: null });
    expect(result.claimed).toBe(false);
    expect(result.nextIndex).toBe(5);
  });

  it('cannot skip an item on duplicate completion callbacks', () => {
    const key = 'cold-q-8';
    let progress = resolveColdTestCompletion({ queueLength: 20, index: 7, completedItemKey: null, itemKey: key }).progress;
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = resolveColdTestCompletion({
        queueLength: 20,
        index: progress.index,
        completedItemKey: progress.completedItemKey,
        itemKey: key
      });
      expect(result.claimed).toBe(false);
      progress = result.progress;
    }
    expect(progress.index).toBe(8);
  });

  it('completes item 20 exactly once and never overflows', () => {
    const last = resolveColdTestCompletion({
      queueLength: 20,
      index: 19,
      completedItemKey: 'cold-q-19',
      itemKey: 'cold-q-20'
    });
    expect(last.claimed).toBe(true);
    expect(last.nextIndex).toBe(20);
    expect(isColdTestComplete(last.nextIndex, 20)).toBe(true);
    expect(coldTestTotalTrials(20)).toBe(20);

    const overflow = resolveColdTestCompletion({
      queueLength: 20,
      index: 20,
      completedItemKey: 'cold-q-20',
      itemKey: 'cold-q-21'
    });
    expect(overflow.claimed).toBe(false);
    expect(overflow.nextIndex).toBe(20);
  });

  it('a corrective replay (same question identity) is not a new Cold Test item', () => {
    const key = 'cold-q-12';
    const completed = resolveColdTestCompletion({ queueLength: 20, index: 11, completedItemKey: null, itemKey: key });
    expect(completed.nextIndex).toBe(12);
    const corrective = resolveColdTestCompletion({
      queueLength: 20,
      index: completed.nextIndex,
      completedItemKey: completed.progress.completedItemKey,
      itemKey: key
    });
    expect(corrective.claimed).toBe(false);
    expect(corrective.nextIndex).toBe(12);
  });
});

describe('Cold Test counter semantics', () => {
  it('maps the active item index to the visible x/20 label', () => {
    expect(coldTestItemNumber(0, 20)).toBe(1);
    expect(coldTestItemNumber(7, 20)).toBe(8);
    expect(coldTestItemNumber(19, 20)).toBe(20);
    expect(coldTestItemNumber(20, 20)).toBe(20);
    expect(coldTestTotalTrials(20)).toBe(COLD_TEST_TARGET_TRIALS);
  });

  it('clamps to a short queue without inventing items', () => {
    expect(coldTestTotalTrials(5)).toBe(5);
    expect(coldTestItemNumber(4, 5)).toBe(5);
    expect(coldTestItemNumber(5, 5)).toBe(5);
    expect(isColdTestComplete(5, 5)).toBe(true);
  });
});

describe('Cold Test specialized evaluators preserve completion flags', () => {
  it('triadBuild completes and locks on the single cold attempt', () => {
    const card = makeCard('triadBuild', 'major');
    const correct = evaluateDailyChordAttempt({
      card,
      kind: 'cold',
      rootKeyId: 'C4',
      quality: 'major',
      userKeyIds: ['C4', 'E4', 'G4'],
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      responseMs: 900,
      settings: DEFAULT_SETTINGS,
      reviewLogs: [],
      sessionId: 'cold-session'
    });
    expect(correct.isCorrect).toBe(true);
    expect(correct.updatedState.isCompleted).toBe(true);
    expect(correct.updatedState.isLocked).toBe(true);

    const wrong = evaluateDailyChordAttempt({
      card,
      kind: 'cold',
      rootKeyId: 'C4',
      quality: 'major',
      userKeyIds: ['D4', 'F4', 'A4'],
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      responseMs: 900,
      settings: DEFAULT_SETTINGS,
      reviewLogs: [],
      sessionId: 'cold-session'
    });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.updatedState.isCompleted).toBe(true);
    expect(wrong.updatedState.isLocked).toBe(true);
  });

  it('triadInversionBuild completes and locks on the single cold attempt', () => {
    const card = makeCard('triadInversionBuild', 'first');
    const result = evaluateDailyInversionAttempt({
      card,
      kind: 'cold',
      rootKeyId: 'C4',
      quality: 'major',
      inversion: 'first',
      expectedKeyIds: ['E4', 'G4', 'C5'],
      userKeyIds: ['E4', 'G4', 'C5'],
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      responseMs: 800,
      settings: DEFAULT_SETTINGS,
      reviewLogs: [],
      sessionId: 'cold-session'
    });
    expect(result.isCorrect).toBe(true);
    expect(result.updatedState.isCompleted).toBe(true);
    expect(result.updatedState.isLocked).toBe(true);
  });
});

describe('Cold Test navigation — displayed active item vs completion pointer', () => {
  function createSimulation(queueLength = 20) {
    let navigation = createColdTestNavigation();
    let lastKey: string | null = null;
    return {
      get navigation(): ColdTestNavigation {
        return navigation;
      },
      get display() {
        return coldTestActiveItemNumber(navigation, queueLength);
      },
      activate() {
        navigation = activateColdTestItem(navigation, queueLength);
      },
      complete(itemKey: string, expectedClaimed = true) {
        const result = resolveColdTestItemCompletion(navigation, {
          queueLength,
          completedItemKey: lastKey,
          itemKey
        });
        expect(result.claimed).toBe(expectedClaimed);
        if (result.claimed) lastKey = itemKey;
        navigation = result.navigation;
        return result;
      },
      advanceThrough(count: number) {
        for (let item = 0; item < count; item++) {
          this.activate();
          this.complete(`q-${item + 1}`);
        }
      }
    };
  }

  it('item 1 boundary: activates as 1/20 and stays 1/20 while its feedback is shown', () => {
    const sim = createSimulation();
    sim.activate();
    expect(sim.navigation.completedIndex).toBe(0);
    expect(sim.navigation.activeItemIndex).toBe(0);
    expect(sim.display).toBe(1);

    sim.complete('q-1');
    expect(sim.navigation.completedIndex).toBe(1);
    expect(sim.navigation.activeItemIndex).toBe(0);
    expect(sim.display).toBe(1);

    sim.activate();
    expect(sim.display).toBe(2);
    expect(sim.navigation.completedIndex).toBe(1);
  });

  it('item 8 reproduces the required sequence: 8/20 → feedback stays 8/20 → next 9/20', () => {
    const sim = createSimulation();
    sim.advanceThrough(7);
    expect(sim.navigation.completedIndex).toBe(7);

    sim.activate();
    expect(sim.display).toBe(8);
    expect(sim.navigation.activeItemIndex).toBe(7);

    sim.complete('q-8');
    expect(sim.navigation.completedIndex).toBe(8);
    expect(sim.navigation.activeItemIndex).toBe(7);
    expect(sim.display).toBe(8);

    sim.activate();
    expect(sim.navigation.activeItemIndex).toBe(8);
    expect(sim.display).toBe(9);
    expect(sim.navigation.completedIndex).toBe(8);
  });

  it('wrong and correct completions advance the pointer identically; the display never moves', () => {
    const correct = createSimulation();
    correct.advanceThrough(7);
    correct.activate();
    correct.complete('q-8');
    expect(correct.display).toBe(8);
    expect(correct.navigation.completedIndex).toBe(8);

    const wrong = createSimulation();
    wrong.advanceThrough(7);
    wrong.activate();
    wrong.complete('wrong-q-8');
    expect(wrong.display).toBe(8);
    expect(wrong.navigation.completedIndex).toBe(8);
  });

  it('duplicate completion callbacks cannot advance the pointer or the displayed item', () => {
    const sim = createSimulation();
    sim.advanceThrough(7);
    sim.activate();
    sim.complete('q-8');
    const snapshot = { ...sim.navigation };
    for (let attempt = 0; attempt < 5; attempt++) {
      sim.complete('q-8', false);
      expect(sim.navigation.completedIndex).toBe(snapshot.completedIndex);
      expect(sim.navigation.activeItemIndex).toBe(snapshot.activeItemIndex);
      expect(sim.display).toBe(8);
    }
  });

  it('repeated activation (manual + auto next race) never changes the completed pointer', () => {
    const sim = createSimulation();
    sim.advanceThrough(7);
    sim.activate();
    sim.complete('q-8');
    sim.activate();
    sim.activate();
    sim.activate();
    expect(sim.navigation.completedIndex).toBe(8);
    expect(sim.navigation.activeItemIndex).toBe(8);
    expect(sim.display).toBe(9);
  });

  it('item 19: feedback keeps 19/20, activation moves the display to 20/20', () => {
    const sim = createSimulation();
    sim.advanceThrough(18);
    sim.activate();
    expect(sim.display).toBe(19);

    sim.complete('q-19');
    expect(sim.navigation.completedIndex).toBe(19);
    expect(sim.display).toBe(19);

    sim.activate();
    expect(sim.display).toBe(20);
    expect(sim.navigation.completedIndex).toBe(19);
  });

  it('item 20: completes at 20/20, never 21/20, and clamps any further activation', () => {
    const sim = createSimulation();
    sim.advanceThrough(19);
    sim.activate();
    expect(sim.display).toBe(20);

    sim.complete('q-20');
    expect(sim.navigation.completedIndex).toBe(20);
    expect(sim.navigation.activeItemIndex).toBe(19);
    expect(sim.display).toBe(20);
    expect(isColdTestComplete(sim.navigation.completedIndex, 20)).toBe(true);

    sim.activate();
    expect(sim.display).toBe(20);
    expect(sim.navigation.activeItemIndex).toBe(19);
  });

  it('before the first activation the display is 0, not a pre-advanced item', () => {
    const sim = createSimulation();
    expect(sim.navigation.activeItemIndex).toBeNull();
    expect(sim.display).toBe(0);
  });
});
