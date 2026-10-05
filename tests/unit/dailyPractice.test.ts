import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, NATURAL_NOTES } from '../../src/core/fsrs/constants';
import type { Card, NoteName, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';
import { submitQuestionAttempt } from '../../src/core/fsrs/reviewLog';
import {
  isCoreCurriculumComplete,
  buildDailyPracticePool,
  selectDueCardWithInterleaving,
  selectBalancedRotationCard,
  selectWeakCard,
  selectTransferCard,
  resolveDailyPracticeNext,
  deriveRetentionMastery,
  buildDailyPracticeSummary,
  resolveCardVisualConfig,
  validateIdentifyVisualInvariant,
  toCanonicalNoteName,
  type TaskVisualState,
  WEAK_CARD_THRESHOLDS
} from '../../src/core/learning/dailyPractice';
import {
  ALL_WHITE_CURRICULUM_NOTES,
  BLACK_KEY_ACQUISITION_ORDER,
  EAR_ACQUISITION_ORDER,
  FIRST_RUN_CF_ITEM_IDS,
  MILESTONE_3D_ITEM_IDS,
  NOTATION_ACQUISITION_ORDER,
  WHITE_KEY_CURRICULUM_ITEM_IDS,
  createInitialLearningProgress,
  getNoteCurriculumItemId,
  getNoteMixCurriculumItemId,
  markFsrsActivated,
  markMixReady,
  recordModelCompleted,
  INVERSION_ITEM_IDS,
  type LearningProgressRecord
} from '../../src/core/learning';

function makeCard(
  skill: Skill,
  note: NoteName,
  options: {
    reps?: number;
    dueAt?: number;
    stability?: number | null;
    difficulty?: number | null;
    lapses?: number;
    lastGrade?: 1 | 2 | 3 | 4 | null;
  } = {}
): Card {
  const reps = options.reps ?? 0;
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: reps > 0 ? 'review' : 'new',
    stability: options.stability !== undefined ? options.stability : (reps > 0 ? 3.5 : null),
    difficulty: options.difficulty !== undefined ? options.difficulty : (reps > 0 ? 5.0 : null),
    dueAt: options.dueAt !== undefined ? options.dueAt : (reps > 0 ? 2000 : 0),
    reps,
    lapses: options.lapses ?? 0,
    lastReviewAt: reps > 0 ? 1000 : 0,
    firstSeenAt: reps > 0 ? 1000 : 0,
    lastGrade: options.lastGrade !== undefined ? options.lastGrade : (reps > 0 ? 3 : null),
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

function makePhase3CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = new Map<string, LearningProgressRecord>();
  const markDone = (id: string, contexts: string[] = []) => {
    const base = createInitialLearningProgress(id, now);
    map.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts
    });
  };

  markDone(FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_C, ['region-C3', 'region-C4']);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_F, ['region-F3', 'region-F4']);
  markDone(FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF);
  markDone(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF);

  for (const n of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(n), [`region-${n}3`, `region-${n}4`]);
    markDone(getNoteMixCurriculumItemId(n));
  }
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE);

  return map;
}

function makePhase4CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = makePhase3CompletedProgress(now);
  const markDone = (id: string) => {
    const base = createInitialLearningProgress(id, now);
    map.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    });
  };

  for (const n of BLACK_KEY_ACQUISITION_ORDER) {
    markDone(`curriculum-black:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE);
  return map;
}

function makePhase5CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = makePhase4CompletedProgress(now);
  const markDone = (id: string) => {
    const base = createInitialLearningProgress(id, now);
    map.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    });
  };

  for (const n of NOTATION_ACQUISITION_ORDER) {
    markDone(`curriculum-notation:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE);
  return map;
}

function makePhase6CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = makePhase5CompletedProgress(now);
  const markDone = (id: string) => {
    const base = createInitialLearningProgress(id, now);
    map.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    });
  };

  for (const n of EAR_ACQUISITION_ORDER) {
    markDone(`curriculum-ear:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);
  return map;
}

describe('Milestone 3E — Daily Practice Orchestration', () => {
  // Test 1: graduation-gate-state
  it('1. graduation-gate-state: verifies isCoreCurriculumComplete is true only when all 6 phases are complete and Phase 6 graduation is persisted', () => {
    const emptyProgress = new Map<string, LearningProgressRecord>();
    expect(isCoreCurriculumComplete({ learningProgress: emptyProgress })).toBe(false);

    // Partially completed: Phase 4 complete, but Phase 5/6 incomplete
    const phase4Progress = makePhase4CompletedProgress();
    expect(isCoreCurriculumComplete({ learningProgress: phase4Progress })).toBe(false);

    // Full 6 phases complete with Phase 6 graduation
    const fullProgress = makePhase6CompletedProgress();
    expect(isCoreCurriculumComplete({ learningProgress: fullProgress })).toBe(true);
  });

  // Test 2: reload-skips-graduation
  it('2. reload-skips-graduation: existing user with Phase 6 graduation persisted immediately yields isCoreCurriculumComplete === true without re-running Phase 6', () => {
    const fullProgress = makePhase6CompletedProgress();
    // Simulate startup/reload where records are reloaded from DB
    const isDone = isCoreCurriculumComplete({
      learningProgress: fullProgress,
      cards: [],
      reviewLogs: []
    });
    expect(isDone).toBe(true);
  });

  // Test 3: due-over-transfer
  it('3. due-over-transfer: priority 1 scheduled due card is selected even when transfer trials are requested/pending; transfer NEVER delays a due card', () => {
    const fullProgress = makePhase6CompletedProgress();
    const now = 5000;
    const dueCard = makeCard('find', 'C', { reps: 3, dueAt: 3000 });
    const nonDueCard = makeCard('identify', 'D', { reps: 3, dueAt: 10000 });
    const cards = [dueCard, nonDueCard];

    // Request decision with transfer due counter = 0 (which would otherwise trigger transfer)
    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      now,
      sessionTrials: 3,
      sessionTransferTrials: 0
    });

    expect(decision).not.toBeNull();
    expect(decision?.priority).toBe('due_scheduled_review');
    expect(decision?.card.id).toBe(dueCard.id);
    expect(decision?.isTransfer).toBe(false);
    expect(decision?.eyebrowLabel).toBe('ПЛАНОВОЕ ПОВТОРЕНИЕ');
  });

  // Test 4: interleaving-constraint-skill
  it('4. interleaving-constraint-skill: avoids 3 consecutive cards of the same skill when alternative due cards exist', () => {
    const now = 5000;
    const dueFind1 = makeCard('find', 'C', { reps: 2, dueAt: 1000 });
    const dueFind2 = makeCard('find', 'D', { reps: 2, dueAt: 1100 });
    const dueIdentify = makeCard('identify', 'E', { reps: 2, dueAt: 1200 });
    const candidateCards = [dueFind1, dueFind2, dueIdentify];

    // Recent cards were both 'find'
    const recentCards = [
      makeCard('find', 'G', { reps: 2 }),
      makeCard('find', 'A', { reps: 2 })
    ];

    const selected = selectDueCardWithInterleaving(candidateCards, now, recentCards);
    expect(selected).not.toBeNull();
    // Interleaving constraint should switch from 'find' to 'identify'
    expect(selected?.skill).toBe('identify');
    expect(selected?.id).toBe(dueIdentify.id);
  });

  // Test 5: interleaving-constraint-note
  it('5. interleaving-constraint-note: avoids 3 consecutive cards of the same pitch class when alternative due cards exist', () => {
    const now = 5000;
    const dueC1 = makeCard('find', 'C', { reps: 2, dueAt: 1000 });
    const dueC2 = makeCard('identify', 'C', { reps: 2, dueAt: 1100 });
    const dueD = makeCard('find', 'D', { reps: 2, dueAt: 1200 });
    const candidateCards = [dueC1, dueC2, dueD];

    // Recent cards were both note 'C'
    const recentCards = [
      makeCard('find', 'C', { reps: 2 }),
      makeCard('identify', 'C', { reps: 2 })
    ];

    const selected = selectDueCardWithInterleaving(candidateCards, now, recentCards);
    expect(selected).not.toBeNull();
    // Pitch class constraint should prevent a 3rd 'C' and return 'D'
    expect(selected?.note).toBe('D');
  });

  // Test 6: due-urgency-overrides-interleaving
  it('6. due-urgency-overrides-interleaving: when all available due cards violate interleaving, the most urgent due card is still returned', () => {
    const now = 5000;
    // Only 'find:C' cards are due
    const urgentFindC = makeCard('find', 'C', { reps: 2, dueAt: 1000 });
    const laterFindC = makeCard('find', 'C', { reps: 2, dueAt: 2000 });
    const candidateCards = [urgentFindC, laterFindC];

    const recentCards = [
      makeCard('find', 'C', { reps: 2 }),
      makeCard('find', 'C', { reps: 2 })
    ];

    const selected = selectDueCardWithInterleaving(candidateCards, now, recentCards);
    // Invariant: due urgency > cosmetic interleaving!
    expect(selected).not.toBeNull();
    expect(selected?.id).toBe(urgentFindC.id);
  });

  it('single due card is held in an unanswered Balanced round and rotation chooses another learned card', () => {
    const now = 5000;
    const due = makeCard('soundToKey', 'G', { reps: 5, dueAt: 4000 });
    const alternative = makeCard('find', 'C', { reps: 5, dueAt: 9000 });
    expect(selectDueCardWithInterleaving([due], now, [due], [], [], false)).toBeNull();

    const next = selectBalancedRotationCard({
      candidateCards: [due, alternative],
      now,
      recentCards: [due],
      sessionTrials: 1
    });
    expect(next?.id).toBe(alternative.id);
  });

  it('All Due can show its sole due card again after an unanswered restart', () => {
    const now = 5000;
    const due = makeCard('soundToKey', 'G', { reps: 5, dueAt: 4000 });
    expect(selectDueCardWithInterleaving([due], now, [due], [], [], true)?.id).toBe(due.id);
  });

  // Test 7: weak-card-selection-lapse
  it('7. weak-card-selection-lapse: selects card with active lapse or low accuracy when no due cards are pending', () => {
    const cards = [
      makeCard('find', 'C', { reps: 5, stability: 8.0, dueAt: 99999 }),
      makeCard('identify', 'D', { reps: 3, stability: 1.5, lapses: 1, dueAt: 99999 }),
      makeCard('find', 'E', { reps: 4, stability: 7.0, dueAt: 99999 })
    ];

    const weak = selectWeakCard(cards, []);
    expect(weak).not.toBeNull();
    expect(weak?.note).toBe('D');
    expect(weak?.skill).toBe('identify');
  });

  // Test 8: confusion-contrast-drill
  it('8. confusion-contrast-drill: selects confusion contrast pair when registered error exists and spacing criteria are met', () => {
    const fullProgress = makePhase6CompletedProgress();
    const cards = [
      makeCard('find', 'C', { reps: 3, stability: 5.0, dueAt: 99999 }),
      makeCard('find', 'F', { reps: 3, stability: 5.0, dueAt: 99999 }),
      makeCard('identify', 'G', { reps: 3, stability: 5.0, dueAt: 99999 })
    ];

    // Confusion error logs (2 events so minCount >= 2 is met)
    const reviewLogs: ReviewLogEvent[] = [
      {
        sessionId: 'test-session',
        cardId: 'find:C',
        skill: 'find',
        note: 'C',
        ts: 1000,
        responseMs: 1500,
        firstCorrect: false,
        hintUsed: false,
        grade: null,
        gradeName: null,
        kind: 'scheduled',
        answer: 'F', // Confusion error: C confused with F
        answerKeyId: null,
        attempts: 1,
        elapsedDays: 1,
        retrievabilityBefore: 0.9,
        stabilityBefore: 5.0,
        stabilityAfter: 5.0,
        difficultyBefore: 5.0,
        difficultyAfter: 5.0,
        scheduledDays: null,
        trialMode: 'scheduledReview',
        hintLevel: 0,
        contextId: undefined,
        gradeableByFsrs: false
      },
      {
        sessionId: 'test-session',
        cardId: 'find:F',
        skill: 'find',
        note: 'F',
        ts: 1100,
        responseMs: 1500,
        firstCorrect: false,
        hintUsed: false,
        grade: null,
        gradeName: null,
        kind: 'scheduled',
        answer: 'C', // Confusion error: F confused with C
        answerKeyId: null,
        attempts: 1,
        elapsedDays: 1,
        retrievabilityBefore: 0.9,
        stabilityBefore: 5.0,
        stabilityAfter: 5.0,
        difficultyBefore: 5.0,
        difficultyAfter: 5.0,
        scheduledDays: null,
        trialMode: 'scheduledReview',
        hintLevel: 0,
        contextId: undefined,
        gradeableByFsrs: false
      }
    ];

    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      reviewLogs,
      sessionTrials: 5,
      lastConfusionTrial: 0,
      sessionConfusionReviews: 0,
      now: 2000
    });

    expect(decision).not.toBeNull();
    expect(decision?.priority).toBe('confusion_contrast');
    expect(decision?.eyebrowLabel).toBe('КОНТРАСТ');
    expect(['C', 'F']).toContain(decision?.card.note);
  });

  // Test 9: transfer-mode-selection
  it('9. transfer-mode-selection: returns priority: "transfer", kind: "transfer", trialMode: "transfer", isTransfer: true, and eyebrow "ПЕРЕНОС НАВЫКА"', () => {
    const fullProgress = makePhase6CompletedProgress();
    const cards = [
      makeCard('find', 'C', { reps: 2, dueAt: 99999 }),
      makeCard('identify', 'D', { reps: 2, dueAt: 99999 })
    ];

    const transferCard = selectTransferCard({ candidateCards: cards });
    expect(transferCard).not.toBeNull();

    // On transfer turn (sessionTrials: 3), resolveDailyPracticeNext returns transfer decision
    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      sessionTrials: 3,
      now: 1000
    });

    expect(decision).not.toBeNull();
    expect(decision?.isTransfer).toBe(true);
    expect(decision?.priority).toBe('transfer');
    expect(decision?.kind).toBe('transfer');
    expect(decision?.trialMode).toBe('transfer');
    expect(decision?.eyebrowLabel).toBe('ПЕРЕНОС НАВЫКА');
  });

  // Test 10: transfer-fsrs-invariance
  it('10. transfer-fsrs-invariance: running attempt with kind: "transfer" does not mutate card FSRS parameters (stability, difficulty, dueAt, reps, lapses)', () => {
    const card = makeCard('find', 'C', {
      reps: 4,
      stability: 5.2,
      difficulty: 4.8,
      dueAt: 15000,
      lapses: 1
    });

    const preCardSnapshot = JSON.stringify(card);

    // Execute transfer attempt using submitQuestionAttempt
    const roundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };

    const result = submitQuestionAttempt({
      state: roundState,
      card,
      kind: 'transfer',
      isCorrect: true,
      answer: 'C',
      responseMs: 1200,
      settings: DEFAULT_SETTINGS
    });

    // Invariants:
    expect(result.cardMutated).toBe(false);
    expect(result.logEvent?.grade).toBeNull();
    expect(result.fsrsResult).toBeNull();
    expect(result.logEvent?.gradeableByFsrs).toBe(false);
    expect(card.reps).toBe(4);
    expect(card.stability).toBe(5.2);
    expect(card.difficulty).toBe(4.8);
    expect(card.dueAt).toBe(15000);
    expect(card.lapses).toBe(1);
    expect(JSON.stringify(card)).toBe(preCardSnapshot);
  });

  // Test 11: free-practice-pool-restriction
  it('11. free-practice-pool-restriction: pool for daily practice never selects an unintroduced/unactivated card', () => {
    // Only white keys are active; black keys are unactivated
    const partialProgress = new Map<string, LearningProgressRecord>();
    for (const n of ALL_WHITE_CURRICULUM_NOTES) {
      const id = `curriculum-white:${n}`;
      partialProgress.set(id, {
        ...markFsrsActivated(markMixReady(recordModelCompleted(createInitialLearningProgress(id, 1), 1), 1), 1),
        state: 'retention',
        contexts: [],
        updatedAt: 1
      });
    }

    const cards = [
      makeCard('find', 'C', { reps: 2 }),
      makeCard('find', 'C#', { reps: 0 }), // Unintroduced black key
      makeCard('identify', 'D#', { reps: 0 }) // Unintroduced black key
    ];

    const pool = buildDailyPracticePool({
      cards,
      learningProgress: partialProgress,
      level: 'all'
    });

    expect(pool.some(c => c.note === 'C#')).toBe(false);
    expect(pool.some(c => c.note === 'D#')).toBe(false);
    expect(pool.every(c => NATURAL_NOTES.includes(c.note as any))).toBe(true);
  });

  it('activates M3I Daily Practice cards only after their corresponding retention records are ready', () => {
    const progress = makePhase6CompletedProgress();
    const inversionItemIds = [
      INVERSION_ITEM_IDS.BUILD_FIRST,
      INVERSION_ITEM_IDS.BUILD_SECOND,
      INVERSION_ITEM_IDS.IDENTIFY,
      INVERSION_ITEM_IDS.BUILD_SLASH,
      INVERSION_ITEM_IDS.CHORD_SYMBOLS
    ];
    for (const id of inversionItemIds) {
      const base = createInitialLearningProgress(id, 1);
      progress.set(id, {
        ...markFsrsActivated(markMixReady(recordModelCompleted(base, 1), 1), 1),
        state: 'retention',
        contexts: [],
        updatedAt: 1
      });
    }

    const inversionCards = [
      makeCard('triadInversionBuild', 'first'),
      makeCard('triadInversionBuild', 'second'),
      makeCard('triadInversionIdentify', 'first'),
      makeCard('triadInversionBuild', 'slash'),
      makeCard('chordSymbolRead', 'slash')
    ];
    const pool = buildDailyPracticePool({
      cards: inversionCards,
      learningProgress: progress,
      level: 'white'
    });
    expect(pool.map(card => card.id).sort()).toEqual(inversionCards.map(card => card.id).sort());

    const firstBuild = progress.get(INVERSION_ITEM_IDS.BUILD_FIRST)!;
    progress.set(INVERSION_ITEM_IDS.BUILD_FIRST, {
      ...firstBuild,
      contexts: ['pending:delayedRetry']
    });
    const pendingPool = buildDailyPracticePool({
      cards: inversionCards,
      learningProgress: progress,
      level: 'white'
    });
    expect(pendingPool.some(card => card.id === 'triadInversionBuild:first')).toBe(false);
    expect(pendingPool.some(card => card.id === 'triadInversionBuild:second')).toBe(true);
  });

  it('resolves the M3I slash build card to a concrete slash chord rather than the literal slash label', () => {
    const card = makeCard('triadInversionBuild', 'slash');
    const visual = resolveCardVisualConfig({ card, contextIndex: 0 });

    expect(visual.symbol).toMatch(/\//);
    expect(['first', 'second']).toContain(visual.inversion);
    expect(visual.triadKeyIds).toHaveLength(3);
    expect(visual.targetKeyId).toBe(visual.structuralGuideKeyIds?.[0]);
  });

  // Test 12: all-due-preset-exits
  it('12. all-due-preset-exits: when sessionPreset === "due", orchestrator returns null as soon as all due cards are finished (never pads with transfer)', () => {
    const fullProgress = makePhase6CompletedProgress();
    const now = 5000;
    // All cards have dueAt > now (none are due)
    const cards = [
      makeCard('find', 'C', { reps: 3, dueAt: 10000 }),
      makeCard('identify', 'D', { reps: 3, dueAt: 12000 })
    ];

    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      now,
      settings: { sessionPreset: 'due' }
    });

    // Preset 'due' must terminate immediately when 0 due cards remain
    expect(decision).toBeNull();
  });

  // Test 13: quick-preset-allocations
  it('13. quick-preset-allocations: 3-min preset focuses primarily on due cards, allocating at most small transfer block', () => {
    const fullProgress = makePhase6CompletedProgress();
    const now = 5000;
    const cards = [
      makeCard('find', 'C', { reps: 3, dueAt: 10000 }),
      makeCard('identify', 'D', { reps: 3, dueAt: 12000 })
    ];

    // When sessionTransferTrials >= 3, quick preset stops offering transfer trials
    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      now,
      settings: { sessionPreset: 'quick' },
      sessionTrials: 4,
      sessionTransferTrials: 3
    });

    expect(decision?.isTransfer).toBe(false);
  });

  // Test 14: normal-preset-distribution
  it('14. normal-preset-distribution: 8-min preset alternates due reviews, weak reinforcement, and transfer practice following strict canonical priority', () => {
    const fullProgress = makePhase6CompletedProgress();
    const now = 5000;
    const dueCard = makeCard('find', 'C', { reps: 3, dueAt: 2000 });
    const weakCard = makeCard('identify', 'D', { reps: 2, stability: 1.0, lapses: 1, dueAt: 99999 });
    const healthyCard = makeCard('identify', 'E', { reps: 3, stability: 5.0, lapses: 0, dueAt: 99999 });
    const cards = [dueCard, weakCard, healthyCard];

    // Priority 1: Due card wins
    const d1 = resolveDailyPracticeNext({
      cards,
      learningProgress: fullProgress,
      now,
      sessionTrials: 1
    });
    expect(d1?.priority).toBe('due_scheduled_review');

    // Priority 2: When no due cards, weak card reinforcement is selected
    const d2 = resolveDailyPracticeNext({
      cards: [weakCard, healthyCard],
      learningProgress: fullProgress,
      now,
      sessionTrials: 1
    });
    expect(d2?.priority).toBe('weak_reinforcement');

    // Priority 2 vs Priority 4 invariant: Even when sessionTrials % 3 === 0, weak card ALWAYS wins over transfer
    const d3 = resolveDailyPracticeNext({
      cards: [weakCard, healthyCard],
      learningProgress: fullProgress,
      now,
      sessionTrials: 3
    });
    expect(d3?.priority).toBe('weak_reinforcement');

    // Priority 4: When no weak cards exist and sessionTrials % 3 === 0, transfer is selected
    const d4 = resolveDailyPracticeNext({
      cards: [healthyCard],
      learningProgress: fullProgress,
      now,
      sessionTrials: 3
    });
    expect(d4?.priority).toBe('transfer');

    // Priority 5: When not on transfer cadence, free practice is selected
    const d5 = resolveDailyPracticeNext({
      cards: [healthyCard],
      learningProgress: fullProgress,
      now,
      sessionTrials: 4
    });
    expect(d5?.priority).toBe('free_practice');
  });

  // Test 15: summary-transfer-metrics
  it('15. summary-transfer-metrics: buildDailyPracticeSummary correctly computes transferStats when transfer trials exist, and returns null when 0 transfer trials occurred', () => {
    const withTransfer = buildDailyPracticeSummary({
      sessionTrials: 10,
      sessionScore: 9,
      sessionScheduledReviews: 5,
      sessionScheduledCorrect: 5,
      sessionTransferTrials: 3,
      sessionTransferCorrect: 2
    });

    expect(withTransfer.transferStats).not.toBeNull();
    expect(withTransfer.transferStats?.trials).toBe(3);
    expect(withTransfer.transferStats?.correct).toBe(2);
    expect(withTransfer.transferStats?.accuracy).toBe('67%');

    const withoutTransfer = buildDailyPracticeSummary({
      sessionTrials: 5,
      sessionScore: 5,
      sessionScheduledReviews: 5,
      sessionScheduledCorrect: 5,
      sessionTransferTrials: 0,
      sessionTransferCorrect: 0
    });

    expect(withoutTransfer.transferStats).toBeNull();
  });

  it('daily session summary reports human-readable counts by skill family', () => {
    const reviewLogs: ReviewLogEvent[] = [
      { ts: 1000, sessionId: 'summary-session', cardId: 'find:C', note: 'C', skill: 'find', kind: 'scheduled', grade: 3, gradeName: 'Good', firstCorrect: true, answer: 'C', answerKeyId: 'C4', attempts: 1, hintUsed: false, responseMs: 1000, elapsedDays: 1, retrievabilityBefore: 0.9, stabilityBefore: 4, stabilityAfter: 5, difficultyBefore: 4, difficultyAfter: 4, scheduledDays: 2 },
      { ts: 1001, sessionId: 'summary-session', cardId: 'soundToKey:G', note: 'G', skill: 'soundToKey', kind: 'practice', grade: null, gradeName: null, firstCorrect: true, answer: 'G', answerKeyId: 'G4', attempts: 1, hintUsed: false, responseMs: 1200, elapsedDays: null, retrievabilityBefore: 0.8, stabilityBefore: 4, stabilityAfter: 4, difficultyBefore: 4, difficultyAfter: 4, scheduledDays: null },
      { ts: 1002, sessionId: 'summary-session', cardId: 'intervalBuild:P5', note: 'P5', skill: 'intervalBuild', kind: 'transfer', grade: null, gradeName: null, firstCorrect: true, answer: 'P5', answerKeyId: null, attempts: 1, hintUsed: false, responseMs: 1400, elapsedDays: null, retrievabilityBefore: 0.8, stabilityBefore: 4, stabilityAfter: 4, difficultyBefore: 4, difficultyAfter: 4, scheduledDays: null }
    ];
    const summary = buildDailyPracticeSummary({
      sessionTrials: 3,
      sessionScore: 3,
      sessionScheduledReviews: 1,
      sessionScheduledCorrect: 1,
      sessionTransferTrials: 1,
      sessionTransferCorrect: 1,
      reviewLogs,
      sessionId: 'summary-session'
    });

    expect(summary.skillSummary).toBe('3 заданий · Ноты: 1 · Слух: 1 · Интервалы: 1');
  });

  // Test 16: derived-retention-mastery
  it('16. derived-retention-mastery: deriveRetentionMastery derives stable, mastered, and consolidating without artificial DB flags', () => {
    // Mature retention (stability >= 7.0, reps >= 2)
    const stableCard = makeCard('find', 'C', { reps: 3, stability: 8.5 });
    expect(deriveRetentionMastery(stableCard)).toBe('stable');

    // Mastered card (stability >= 2.5)
    const masteredCard = makeCard('find', 'D', { reps: 2, stability: 3.0 });
    expect(deriveRetentionMastery(masteredCard)).toBe('mastered');

    // Active lapse or new/consolidating card
    const lapsedCard = makeCard('find', 'E', { reps: 4, stability: 1.2, lapses: 1 });
    expect(deriveRetentionMastery(lapsedCard)).toBe('consolidating');

    // Zero reps
    const newCard = makeCard('find', 'F', { reps: 0 });
    expect(deriveRetentionMastery(newCard)).toBe('consolidating');
  });

  // Test 17: canonical-priority-weak-and-confusion-over-transfer
  it('17. canonical-priority: weak card wins over transfer candidate; registered confusion wins over transfer', () => {
    const fullProgress = makePhase6CompletedProgress();
    const weakCard = makeCard('identify', 'D', { reps: 2, stability: 1.0, lapses: 1, dueAt: 99999 });
    const healthyC = makeCard('find', 'C', { reps: 3, stability: 5.0, dueAt: 99999 });
    const healthyF = makeCard('find', 'F', { reps: 3, stability: 5.0, dueAt: 99999 });

    // Invariant 1: Weak card wins over transfer even at sessionTrials = 3
    const weakDecision = resolveDailyPracticeNext({
      cards: [weakCard, healthyC, healthyF],
      learningProgress: fullProgress,
      now: 1000,
      sessionTrials: 3
    });
    expect(weakDecision?.priority).toBe('weak_reinforcement');
    expect(weakDecision?.card.id).toBe(weakCard.id);

    // Invariant 2: Confusion drill wins over transfer when no weak cards exist
    const reviewLogs: ReviewLogEvent[] = [
      {
        sessionId: 's',
        cardId: 'find:C',
        skill: 'find',
        note: 'C',
        ts: 1000,
        responseMs: 1500,
        firstCorrect: false,
        hintUsed: false,
        grade: null,
        gradeName: null,
        kind: 'scheduled',
        answer: 'F',
        answerKeyId: null,
        attempts: 1,
        elapsedDays: 1,
        retrievabilityBefore: 0.9,
        stabilityBefore: 5.0,
        stabilityAfter: 5.0,
        difficultyBefore: 5.0,
        difficultyAfter: 5.0,
        scheduledDays: null,
        trialMode: 'scheduledReview',
        hintLevel: 0,
        contextId: undefined,
        gradeableByFsrs: false
      },
      {
        sessionId: 's',
        cardId: 'find:F',
        skill: 'find',
        note: 'F',
        ts: 1100,
        responseMs: 1500,
        firstCorrect: false,
        hintUsed: false,
        grade: null,
        gradeName: null,
        kind: 'scheduled',
        answer: 'C',
        answerKeyId: null,
        attempts: 1,
        elapsedDays: 1,
        retrievabilityBefore: 0.9,
        stabilityBefore: 5.0,
        stabilityAfter: 5.0,
        difficultyBefore: 5.0,
        difficultyAfter: 5.0,
        scheduledDays: null,
        trialMode: 'scheduledReview',
        hintLevel: 0,
        contextId: undefined,
        gradeableByFsrs: false
      }
    ];

    const confusionDecision = resolveDailyPracticeNext({
      cards: [healthyC, healthyF],
      learningProgress: fullProgress,
      reviewLogs,
      now: 2000,
      sessionTrials: 3,
      lastConfusionTrial: 0,
      sessionConfusionReviews: 0
    });
    expect(confusionDecision?.priority).toBe('confusion_contrast');
  });

  // Test 18: transfer-visual-config-treble-c4-b4-isolation
  it('18. transfer-visual-config: notation transfer is strictly frozen to treble clef and C4–B4 (never bass or grand clef)', () => {
    const notationCard = makeCard('notationToKey', 'E', { reps: 3 });

    // Under user setting 'bass', transfer must ignore setting and freeze to treble / not grand
    const bassConfig = resolveCardVisualConfig({
      card: notationCard,
      isTransfer: true,
      userClef: 'bass'
    });
    expect(bassConfig.clef).toBe('treble');
    expect(bassConfig.isGrandStaff).toBe(false);
    expect(bassConfig.targetKeyId).toBe('E4');

    // Under user setting 'grand', transfer must ignore setting and freeze to treble / not grand
    const grandConfig = resolveCardVisualConfig({
      card: notationCard,
      isTransfer: true,
      userClef: 'grand'
    });
    expect(grandConfig.clef).toBe('treble');
    expect(grandConfig.isGrandStaff).toBe(false);
    expect(grandConfig.targetKeyId).toBe('E4');

    // Non-transfer notation respects user clef
    const normalBassConfig = resolveCardVisualConfig({
      card: notationCard,
      isTransfer: false,
      userClef: 'bass'
    });
    expect(normalBassConfig.clef).toBe('bass');
    expect(normalBassConfig.targetKeyId).toBe('E3');

    // Ear transfer is strictly C4-B4
    const earCard = makeCard('soundToKey', 'G', { reps: 3 });
    const earConfig = resolveCardVisualConfig({
      card: earCard,
      isTransfer: true,
      userClef: 'grand'
    });
    expect(earConfig.targetKeyId).toBe('G4');
    expect(earConfig.clef).toBe('treble');
  });

  // Test 19: deterministic-transfer-selector
  it('19. deterministic-transfer-selector: selectTransferCard is pure and deterministic across identical session states', () => {
    const cards = [
      makeCard('find', 'C', { reps: 2 }),
      makeCard('identify', 'D', { reps: 2 }),
      makeCard('notationToKey', 'E', { reps: 2 }),
      makeCard('soundToKey', 'F', { reps: 2 })
    ];

    const pick1 = selectTransferCard({ candidateCards: cards, sessionTrials: 3 });
    const pick2 = selectTransferCard({ candidateCards: cards, sessionTrials: 3 });
    const pick3 = selectTransferCard({ candidateCards: cards, sessionTrials: 3 });

    expect(pick1).not.toBeNull();
    expect(pick1?.id).toBe(pick2?.id);
    expect(pick2?.id).toBe(pick3?.id);

    // Rotation across trials
    const pickNext = selectTransferCard({ candidateCards: cards, sessionTrials: 6 });
    expect(pickNext).not.toBeNull();
  });

  // Test 20: centralized-weak-card-thresholds
  it('20. centralized-weak-card-thresholds: WEAK_CARD_THRESHOLDS matches documented architectural limits', () => {
    expect(WEAK_CARD_THRESHOLDS.maxStabilityForLapse).toBe(4.0);
    expect(WEAK_CARD_THRESHOLDS.minLapses).toBe(1);
    expect(WEAK_CARD_THRESHOLDS.minTrialsForAccuracy).toBe(2);
    expect(WEAK_CARD_THRESHOLDS.minAccuracyRatio).toBe(0.75);
    expect(WEAK_CARD_THRESHOLDS.minDifficulty).toBe(6.5);
  });

  // Milestone 3E Rev2 Regression Tests (21–29): Session Completion & Identify Visual-State Integrity

  // Test 21: scheduled identify => exactly one highlighted target
  it('21. scheduled-identify-highlight: scheduled identify card yields exactly one highlighted target key matching targetKeyId', () => {
    const identifyCard = makeCard('identify', 'C', { reps: 3, dueAt: 100 });
    const visual = resolveCardVisualConfig(identifyCard);

    expect(visual.targetKeyId).toBe('C4');
    expect(visual.targetKeyIds).toHaveLength(1);
    expect(visual.targetKeyIds[0]).toBe('C4');

    const state: TaskVisualState = {
      card: identifyCard,
      isSessionEnded: false,
      targetKeyId: visual.targetKeyId,
      targetKeyIds: visual.targetKeyIds
    };
    const validation = validateIdentifyVisualInvariant(state);
    expect(validation.valid).toBe(true);

    // Defensive check: invalid if targetKeyIds is empty or mismatched
    const brokenState: TaskVisualState = {
      card: identifyCard,
      isSessionEnded: false,
      targetKeyId: 'C4',
      targetKeyIds: []
    };
    expect(validateIdentifyVisualInvariant(brokenState).valid).toBe(false);
  });

  // Test 22: auto-advance to identify => new identify target highlighted
  it('22. auto-advance-to-identify: transitioning from another task to identify properly activates single target highlight', () => {
    const findCard = makeCard('find', 'D', { reps: 2 });
    const findVisual = resolveCardVisualConfig(findCard);
    expect(findVisual.targetKeyIds).toHaveLength(0);

    // Transition to identify
    const nextIdentifyCard = makeCard('identify', 'F', { reps: 2 });
    const identifyVisual = resolveCardVisualConfig(nextIdentifyCard);

    expect(identifyVisual.targetKeyId).toBe('F4');
    expect(identifyVisual.targetKeyIds).toEqual(['F4']);
    expect(validateIdentifyVisualInvariant({
      card: nextIdentifyCard,
      isSessionEnded: false,
      targetKeyId: identifyVisual.targetKeyId,
      targetKeyIds: identifyVisual.targetKeyIds
    }).valid).toBe(true);
  });

  // Test 23: Daily Practice transfer identify => target highlighted
  it('23. transfer-identify-highlight: Daily Practice transfer identify card has valid visual target highlight', () => {
    const transferIdentifyCard = makeCard('identify', 'G', { reps: 5 });
    const visual = resolveCardVisualConfig({
      card: transferIdentifyCard,
      isTransfer: true
    });

    expect(visual.targetKeyId).toBe('G4');
    expect(visual.targetKeyIds).toEqual(['G4']);
    expect(validateIdentifyVisualInvariant({
      card: transferIdentifyCard,
      isSessionEnded: false,
      targetKeyId: visual.targetKeyId,
      targetKeyIds: visual.targetKeyIds
    }).valid).toBe(true);
  });

  // Test 24: weak/confusion identify => target highlighted
  it('24. weak-confusion-identify-highlight: weak card and confusion drill identify have valid single target highlight', () => {
    const weakIdentifyCard = makeCard('identify', 'E', { reps: 4, lapses: 2, stability: 1.5 });
    const visual = resolveCardVisualConfig(weakIdentifyCard);

    expect(visual.targetKeyId).toBe('E4');
    expect(visual.targetKeyIds).toEqual(['E4']);
    expect(validateIdentifyVisualInvariant({
      card: weakIdentifyCard,
      isSessionEnded: false,
      targetKeyId: visual.targetKeyId,
      targetKeyIds: visual.targetKeyIds
    }).valid).toBe(true);
  });

  // Test 25: final due card completed => currentCard cleared
  it('25. final-due-card-completed: when all due cards finish in due preset, resolve returns null and state cleans up', () => {
    const progress = makePhase6CompletedProgress();
    // Card with dueAt in future (not due)
    const cards = [makeCard('identify', 'C', { reps: 3, dueAt: 9999999999 })];

    const decision = resolveDailyPracticeNext({
      cards,
      learningProgress: progress,
      now: 1000,
      settings: { sessionPreset: 'due' }
    });

    expect(decision).toBeNull();

    // State after clearActiveTask()
    const clearedState: TaskVisualState = {
      card: null,
      isSessionEnded: true,
      targetKeyId: null,
      targetKeyIds: []
    };
    expect(validateIdentifyVisualInvariant(clearedState).valid).toBe(true);
  });

  // Test 26: final due identify completed => no stale identify question remains
  it('26. final-due-identify-cleanup: completing final due identify card must not leave lingering question or target', () => {
    // Erroneous state where isSessionEnded is true but card was lingering
    const lingeringState: TaskVisualState = {
      card: makeCard('identify', 'C', { reps: 3 }),
      isSessionEnded: true,
      targetKeyId: null,
      targetKeyIds: []
    };
    const invalidCheck = validateIdentifyVisualInvariant(lingeringState);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.reason).toContain('Session ended but active task/visual state lingering');

    // Correct clean state
    const cleanState: TaskVisualState = {
      card: null,
      isSessionEnded: true,
      targetKeyId: null,
      targetKeyIds: []
    };
    expect(validateIdentifyVisualInvariant(cleanState).valid).toBe(true);
  });

  // Test 27: due=0 + sessionComplete => no answer buttons / no active task
  it('27. due-zero-session-complete-invariant: session complete state strictly requires zero active targets', () => {
    const completeState: TaskVisualState = {
      card: null,
      isSessionEnded: true,
      targetKeyId: null,
      targetKeyIds: []
    };
    expect(validateIdentifyVisualInvariant(completeState).valid).toBe(true);

    // If targetKeyIds lingered while session ended, invariant fails
    const badState: TaskVisualState = {
      card: null,
      isSessionEnded: true,
      targetKeyId: 'C4',
      targetKeyIds: ['C4']
    };
    expect(validateIdentifyVisualInvariant(badState).valid).toBe(false);
  });

  // Test 28: starting next session after completion => first identify initializes its own fresh highlight
  it('28. new-session-after-completion: starting next session correctly initializes fresh identify highlight', () => {
    // 1. Session completed and cleared
    const completedState: TaskVisualState = {
      card: null,
      isSessionEnded: true,
      targetKeyId: null,
      targetKeyIds: []
    };
    expect(validateIdentifyVisualInvariant(completedState).valid).toBe(true);

    // 2. Start new session with first identify card
    const firstCard = makeCard('identify', 'A', { reps: 1, dueAt: 100 });
    const visual = resolveCardVisualConfig(firstCard);

    const freshActiveState: TaskVisualState = {
      card: firstCard,
      isSessionEnded: false,
      targetKeyId: visual.targetKeyId,
      targetKeyIds: visual.targetKeyIds
    };
    expect(validateIdentifyVisualInvariant(freshActiveState).valid).toBe(true);
    expect(freshActiveState.targetKeyIds).toEqual(['A4']);
  });

  // Test 29: enharmonic identify test => single physical black key target
  it('29. enharmonic-identify-single-physical-target: enharmonic accidental cards map to single canonical physical key', () => {
    const enharmonics: Array<[string, string]> = [
      ['Db', 'C#4'],
      ['Eb', 'D#4'],
      ['Gb', 'F#4'],
      ['Ab', 'G#4'],
      ['Bb', 'A#4'],
      ['C#', 'C#4'],
      ['D#', 'D#4'],
      ['F#', 'F#4'],
      ['G#', 'G#4'],
      ['A#', 'A#4']
    ];

    for (const [note, expectedKeyId] of enharmonics) {
      const card = makeCard('identify', note as NoteName, { reps: 2 });
      const visual = resolveCardVisualConfig(card);

      expect(visual.targetKeyId).toBe(expectedKeyId);
      expect(visual.targetKeyIds).toEqual([expectedKeyId]);
      expect(visual.targetKeyIds).toHaveLength(1);

      const validation = validateIdentifyVisualInvariant({
        card,
        isSessionEnded: false,
        targetKeyId: visual.targetKeyId,
        targetKeyIds: visual.targetKeyIds
      });
      expect(validation.valid).toBe(true);
    }

    // Verify canonical note name mapping directly
    expect(toCanonicalNoteName('Db')).toBe('C#');
    expect(toCanonicalNoteName('Eb')).toBe('D#');
    expect(toCanonicalNoteName('Gb')).toBe('F#');
    expect(toCanonicalNoteName('Ab')).toBe('G#');
    expect(toCanonicalNoteName('Bb')).toBe('A#');
    expect(toCanonicalNoteName('C')).toBe('C');
  });

  it('Balanced composition rotates across four active skill families for 20 tasks', () => {
    const learningProgress = makePhase6CompletedProgress();
    const now = 5000;
    const cards = [
      makeCard('find', 'C', { reps: 4, dueAt: now + 100_000, stability: 6 }),
      makeCard('identify', 'D', { reps: 4, dueAt: now + 100_000, stability: 6 }),
      makeCard('notationToKey', 'E', { reps: 4, dueAt: now + 100_000, stability: 6 }),
      makeCard('soundToKey', 'F', { reps: 4, dueAt: now + 100_000, stability: 6 })
    ];
    const decisions: NonNullable<ReturnType<typeof resolveDailyPracticeNext>>[] = [];

    for (let sessionTrials = 0; sessionTrials < 20; sessionTrials++) {
      const decision = resolveDailyPracticeNext({
        cards,
        learningProgress,
        now,
        sessionTrials,
        recentCards: decisions.slice(-4).reverse().map(item => item.card),
        settings: { sessionPreset: 'normal', level: 'white', mode: 'smart' }
      });
      expect(decision).not.toBeNull();
      decisions.push(decision!);
    }

    const recent20 = decisions.slice(-20);
    const skills = new Set(recent20.map(decision => decision.card.skill));
    let maxSameSkillStreak = 0;
    let maxSameCardStreak = 0;
    let skillStreak = 0;
    let cardStreak = 0;
    for (let index = 0; index < recent20.length; index++) {
      skillStreak = index > 0 && recent20[index].card.skill === recent20[index - 1].card.skill
        ? skillStreak + 1
        : 1;
      cardStreak = index > 0 && recent20[index].card.id === recent20[index - 1].card.id
        ? cardStreak + 1
        : 1;
      maxSameSkillStreak = Math.max(maxSameSkillStreak, skillStreak);
      maxSameCardStreak = Math.max(maxSameCardStreak, cardStreak);
    }

    expect(skills.size).toBeGreaterThanOrEqual(4);
    expect(maxSameSkillStreak).toBeLessThanOrEqual(2);
    expect(maxSameCardStreak).toBe(1);
    expect(decisions.some(decision => decision.reason === 'balanced_rotation')).toBe(true);
    expect(decisions.every(decision => decision.reason !== 'fallback_emergency')).toBe(true);
  });
});

