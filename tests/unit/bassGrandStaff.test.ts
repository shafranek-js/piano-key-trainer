import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';
import { SKILL_INPUT_POLICY } from '../../src/core/input/inputPolicy';
import {
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
  type LearningProgressRecord
} from '../../src/core/learning';
import {
  BASS_GRAND_ITEM_IDS,
  BASS_NOTE_ACQUISITION_ORDER,
  GRAND_STAFF_TRANSFER_TRIALS,
  applyBassGrandActionWithCards,
  canUseDontKnowInBassGrandStep,
  determineNextBassGrandStep,
  getBassGrandModuleStatus,
  getBassNoteCurriculumItemId,
  initializeBassGrandCurriculumState,
  isBassGrandModuleAvailable,
  isBassGrandModuleComplete
} from '../../src/core/learning/bassGrandStaff';
import { resolveAdvancedModuleStates } from '../../src/core/learning/advancedModules';
import { isCurriculumCardActive } from '../../src/core/learning/curriculumFlow';
import {
  buildDailyPracticePool,
  isCoreCurriculumComplete,
  resolveCardVisualConfig,
  selectDueCardWithInterleaving
} from '../../src/core/learning/dailyPractice';

function createCompleteCoreCurriculumProgress(now = 1000): Record<string, LearningProgressRecord> {
  const map: Record<string, LearningProgressRecord> = {};

  function markDone(id: string) {
    const base = createInitialLearningProgress(id, now);
    map[id] = {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    };
  }

  // Phase 1 (Orientation & CF)
  markDone(FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_C);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_F);
  markDone(FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF);
  markDone(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF);

  // Phase 2 (White keys)
  for (const n of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(n));
    markDone(getNoteMixCurriculumItemId(n));
  }
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE);

  // Phase 3 (Black keys)
  for (const n of BLACK_KEY_ACQUISITION_ORDER) {
    markDone(`curriculum-black:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE);

  // Phase 4 (Treble notation)
  for (const n of NOTATION_ACQUISITION_ORDER) {
    markDone(`curriculum-notation:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE);

  // Phase 5 (Ear training)
  for (const n of EAR_ACQUISITION_ORDER) {
    markDone(`curriculum-ear:${n}`);
  }
  markDone(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);

  return map;
}

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
    lastGrade: options.lastGrade ?? null,
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

describe('Milestone 3F: Bass Clef & Grand Staff Transfer', () => {
  it('isBassGrandModuleAvailable returns false before core completion and true after 6/6 phases', () => {
    // Empty progress
    expect(isBassGrandModuleAvailable({ learningProgress: {} })).toBe(false);

    // Partial progress (Phase 1 only)
    const partial: Record<string, LearningProgressRecord> = {};
    partial[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C] = markFsrsActivated(
      createInitialLearningProgress(FIRST_RUN_CF_ITEM_IDS.ANCHOR_C, 1000),
      1000
    );
    expect(isBassGrandModuleAvailable({ learningProgress: partial })).toBe(false);

    // Complete 6/6 phases
    const complete = createCompleteCoreCurriculumProgress();
    expect(isBassGrandModuleAvailable({ learningProgress: complete })).toBe(true);
  });

  it('starting the module does NOT create Phase 7 (core phases remain strictly 6)', () => {
    const complete = createCompleteCoreCurriculumProgress();
    expect(isCoreCurriculumComplete({ learningProgress: complete })).toBe(true);

    // Add bass module progress
    complete[BASS_GRAND_ITEM_IDS.ORIENTATION] = markFsrsActivated(
      createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      1000
    );
    complete[BASS_GRAND_ITEM_IDS.NOTE_F] = markFsrsActivated(
      createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000),
      1000
    );

    // Core remains complete and remains 6 phases
    expect(isCoreCurriculumComplete({ learningProgress: complete })).toBe(true);
    // Status is in_progress
    expect(getBassGrandModuleStatus({ learningProgress: complete })).toBe('in_progress');
  });

  it('teaching order begins with F3 landmark and follows F, C, E, G, D, A, B', () => {
    expect(BASS_NOTE_ACQUISITION_ORDER[0]).toBe('F');
    expect(BASS_NOTE_ACQUISITION_ORDER).toEqual(['F', 'C', 'E', 'G', 'D', 'A', 'B']);

    const progress = createCompleteCoreCurriculumProgress();
    // Before orientation
    expect(determineNextBassGrandStep(progress)).toBe('bassOrientation');

    // After orientation
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    expect(determineNextBassGrandStep(progress)).toBe('f3Model');
  });

  it('per-note progression advances through model -> qualify -> localMix -> delayedCheck', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };

    // 1. Model
    expect(determineNextBassGrandStep(progress)).toBe('f3Model');
    let f3Rec = createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000);
    f3Rec = recordModelCompleted(f3Rec, 1000);
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = f3Rec;

    // 2. Qualify
    expect(determineNextBassGrandStep(progress)).toBe('f3Qualify');
    f3Rec.independentUnhintedSuccesses = 1;
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = f3Rec;

    // 3. Local mix
    expect(determineNextBassGrandStep(progress)).toBe('f3LocalMix');
    f3Rec.state = 'mixReady';
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = f3Rec;

    // 4. Delayed check
    expect(determineNextBassGrandStep(progress)).toBe('f3DelayedCheck');
  });

  it('MODEL, QUALIFY and LOCAL MIX steps do NOT mutate FSRS cards', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const cards = [cardF];

    // Model action
    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('f3Model');

    let res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards
    });
    expect(res.outcome).toBe('advanced');
    expect(res.trialContext.mode).toBe('model');
    expect(res.trialContext.gradeableByFsrs).toBe(false);
    expect(res.fsrsDelayedCheck).toBeNull();
    expect(res.mutatedCard).toBeUndefined();

    // Qualify action
    state = res.state;
    expect(state.step).toBe('f3Qualify');
    res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards
    });
    expect(res.outcome).toBe('advanced');
    expect(res.trialContext.mode).toBe('qualify');
    expect(res.trialContext.gradeableByFsrs).toBe(false);
    expect(res.fsrsDelayedCheck).toBeNull();
    expect(res.mutatedCard).toBeUndefined();

    // Local mix action
    state = res.state;
    expect(state.step).toBe('f3LocalMix');
    res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards
    });
    expect(res.trialContext.mode).toBe('mixedRetrieval');
    expect(res.trialContext.gradeableByFsrs).toBe(false);
    expect(res.fsrsDelayedCheck).toBeNull();
    expect(res.mutatedCard).toBeUndefined();
  });

  it('delayed check activates ONLY its own card in FSRS retention upon success', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000),
      modelCompleted: true,
      state: 'mixReady'
    };

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const cardC = makeCard('notationBassToKey', 'C', { reps: 0 });
    const cards = [cardF, cardC];

    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('f3DelayedCheck');

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards
    });

    expect(res.outcome).toBe('advanced');
    expect(res.fsrsDelayedCheck).not.toBeNull();
    expect(res.fsrsDelayedCheck?.card.id).toBe('notationBassToKey:F');
    expect(res.fsrsDelayedCheck?.grade).toBe(3);
    expect(res.mutatedCard?.reps).toBe(1);

    // Progress record for F is in retention
    const recF = res.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.NOTE_F);
    expect(recF?.state).toBe('retention');

    // C is still unseen
    expect(res.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.NOTE_C)).toBeUndefined();
  });

  it('exact octave enforcement: F3 played as F4 returns wrong_octave', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000),
      modelCompleted: true,
      state: 'mixReady'
    };

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('f3DelayedCheck');

    // Press F4 instead of F3
    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'F4', note: 'F' },
      cards: [cardF]
    });

    expect(res.outcome).toBe('wrong_octave');
    expect(res.state.feedbackText).toContain('октава');
  });

  it('delayed check wrong note creates 1 FSRS Again, corrective prompt, intervening recall and retry', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000),
      modelCompleted: true,
      state: 'mixReady'
    };

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const cards = [cardF];
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });

    // Step 1: Wrong answer on H0 delayed check
    const resWrong = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'G3', note: 'G' },
      cards
    });

    expect(resWrong.outcome).toBe('wrong_note');
    expect(resWrong.fsrsDelayedCheck).not.toBeNull();
    expect(resWrong.fsrsDelayedCheck?.grade).toBe(1); // Again
    expect(resWrong.state.awaitingCorrective).toBe(true);
    expect(resWrong.state.targetKeyIds).toContain('F3'); // Highlighted

    // Step 2: Corrective key press
    const resCorrective = applyBassGrandActionWithCards({
      state: resWrong.state,
      action: { type: 'keyPress', keyId: 'F3', note: 'F' },
      cards
    });

    expect(resCorrective.state.isInterveningRecall).toBe(true);
    expect(resCorrective.state.awaitingCorrective).toBe(false);

    // Step 3: Intervening recall press
    const resIntervening = applyBassGrandActionWithCards({
      state: resCorrective.state,
      action: { type: 'keyPress', keyId: resCorrective.state.targetKeyId || 'F3' },
      cards
    });

    // Step 4: Fresh H0 retry is ready
    expect(resIntervening.state.isInterveningRecall).toBe(false);
    expect(resIntervening.state.awaitingCorrective).toBe(false);
  });

  it('delayed check Dont Know does NOT penalize FSRS, marks pending:delayedRetry and enters corrective', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.NOTE_F] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.NOTE_F, 1000),
      modelCompleted: true,
      state: 'mixReady'
    };

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });

    expect(canUseDontKnowInBassGrandStep(state)).toBe(true);

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards: [cardF]
    });

    // No FSRS penalty
    expect(res.fsrsDelayedCheck).toBeNull();
    expect(res.mutatedCard).toBeUndefined();
    // Corrective mode active with key highlighted
    expect(res.state.awaitingCorrective).toBe(true);
    expect(res.state.targetKeyIds).toContain('F3');
    // Progress marked with pending:delayedRetry
    const recF = res.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.NOTE_F);
    expect(recF?.contexts).toContain('pending:delayedRetry');
  });

  it('grand staff transfer: runs 12 trials, mixes clefs, exact octave required, does NOT mutate FSRS', () => {
    const progress = createCompleteCoreCurriculumProgress();
    // Set all bass notes to retention
    for (const n of BASS_NOTE_ACQUISITION_ORDER) {
      progress[getBassNoteCurriculumItemId(n)] = {
        ...createInitialLearningProgress(getBassNoteCurriculumItemId(n), 1000),
        state: 'retention'
      };
    }
    progress[BASS_GRAND_ITEM_IDS.FINAL_MIX] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.FINAL_MIX, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };

    expect(determineNextBassGrandStep(progress)).toBe('grandTransfer');

    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');
    expect(state.clef).toBe('grand');

    const clefsSeen = new Set<string>();

    // Simulate 12 trials
    for (let i = 0; i < GRAND_STAFF_TRANSFER_TRIALS; i++) {
      expect(state.step).toBe('grandTransfer');
      const target = state.targetKeyId!;
      expect(target).toBeTruthy();
      const targetClef = target.endsWith('3') ? 'bass' : 'treble';
      clefsSeen.add(targetClef);

      const res = applyBassGrandActionWithCards({
        state,
        action: { type: 'keyPress', keyId: target },
        cards: []
      });

      expect(res.trialContext.mode).toBe('transfer');
      expect(res.trialContext.gradeableByFsrs).toBe(false);
      expect(res.fsrsDelayedCheck).toBeNull();

      state = res.state;
    }

    // Both clefs were represented
    expect(clefsSeen.has('bass')).toBe(true);
    expect(clefsSeen.has('treble')).toBe(true);

    // Module completed
    expect(state.step).toBe('moduleComplete');
  });

  it('module completion sets isBassGrandModuleComplete and status completed', () => {
    const progress = createCompleteCoreCurriculumProgress();
    expect(getBassGrandModuleStatus({ learningProgress: progress })).toBe('not_started');

    progress[BASS_GRAND_ITEM_IDS.COMPLETE] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, 1000),
      state: 'retention'
    };

    expect(isBassGrandModuleComplete(progress)).toBe(true);
    expect(getBassGrandModuleStatus({ learningProgress: progress })).toBe('completed');
  });

  it('resolves legacy Grand Transfer retention as Bass completion and unlocks Intervals consistently', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, 1000),
      state: 'retention'
    };

    const resolved = resolveAdvancedModuleStates({ learningProgress: progress });
    expect(isBassGrandModuleComplete(progress)).toBe(true);
    expect(getBassGrandModuleStatus({ learningProgress: progress })).toBe('completed');
    expect(determineNextBassGrandStep(progress)).toBe('moduleComplete');
    expect(resolved.bassGrandStaff.state).toBe('completed');
    expect(resolved.intervals.available).toBe(true);

    const legacyBassCard = makeCard('notationBassToKey', 'F', { reps: 0 });
    expect(isCurriculumCardActive(legacyBassCard, { learningProgress: progress })).toBe(true);
    expect(resolveCardVisualConfig({ card: legacyBassCard, kind: 'transfer', isGrandStaff: true }).isGrandStaff).toBe(true);
  });

  it('input policy for notationBassToKey satisfies all pedagogical constraints', () => {
    const policy = SKILL_INPUT_POLICY.notationBassToKey;
    expect(policy.pianoKey).toBe(true);
    expect(policy.midi).toBe(true);
    expect(policy.pcNote).toBe(false);
    expect(policy.answerButton).toBe(false);
    expect(policy.requiresExactOctave).toBe(true);
  });

  it('scheduled clef invariant: notationBassToKey is always bass, notationToKey is always treble', () => {
    const cardBass = makeCard('notationBassToKey', 'F');
    const cardTreble = makeCard('notationToKey', 'F');

    // With default settings (clef = treble)
    const visualBass = resolveCardVisualConfig(cardBass, DEFAULT_SETTINGS);
    expect(visualBass.clef).toBe('bass');
    expect(visualBass.targetKeyId).toBe('F3');
    expect(visualBass.octave).toBe(3);

    const visualTreble = resolveCardVisualConfig(cardTreble, DEFAULT_SETTINGS);
    expect(visualTreble.clef).toBe('treble');
    expect(visualTreble.targetKeyId).toBe('F4');
    expect(visualTreble.octave).toBe(4);

    // Changing settings.notationClef to 'bass' or 'alto' does NOT change treble scheduled card
    const alteredSettings = { ...DEFAULT_SETTINGS, notationClef: 'bass' as const };
    const visualTrebleAltered = resolveCardVisualConfig(
      { card: cardTreble, kind: 'scheduled' },
      alteredSettings
    );
    expect(visualTrebleAltered.clef).toBe('treble');
    expect(visualTrebleAltered.targetKeyId).toBe('F4');
  });

  it('daily practice integration: due bass cards are selected when due', () => {
    const complete = createCompleteCoreCurriculumProgress();
    complete[BASS_GRAND_ITEM_IDS.COMPLETE] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, 1000),
      state: 'retention'
    };

    const cardBassF = makeCard('notationBassToKey', 'F', { reps: 2, dueAt: 500 });
    const cardTrebleC = makeCard('notationToKey', 'C', { reps: 2, dueAt: 3000 }); // Not due
    const cards = [cardBassF, cardTrebleC];

    const dueCard = selectDueCardWithInterleaving(cards, 1000);

    expect(dueCard).not.toBeNull();
    expect(dueCard?.id).toBe('notationBassToKey:F');
  });

  it('daily practice pool includes notationBassToKey cards after module completion', () => {
    const complete = createCompleteCoreCurriculumProgress();
    complete[BASS_GRAND_ITEM_IDS.COMPLETE] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, 1000),
      state: 'retention'
    };

    const cardBassF = makeCard('notationBassToKey', 'F', { reps: 1, dueAt: 500 });
    const pool = buildDailyPracticePool({
      cards: [cardBassF],
      learningProgress: complete
    });

    expect(pool.length).toBe(1);
    expect(pool[0].id).toBe('notationBassToKey:F');
  });

  it('12 trials with accuracy < 80% -> module NOT complete', () => {
    const progress = createCompleteCoreCurriculumProgress();
    for (const n of BASS_NOTE_ACQUISITION_ORDER) {
      const rec = createInitialLearningProgress(getBassNoteCurriculumItemId(n), 1000);
      progress[getBassNoteCurriculumItemId(n)] = {
        ...markFsrsActivated(markMixReady(recordModelCompleted(rec, 1000), 1000), 1000),
        state: 'retention'
      };
    }
    progress[BASS_GRAND_ITEM_IDS.FINAL_MIX] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.FINAL_MIX, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };

    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');

    // Perform 12 trials, with 5 correct first attempts and 7 wrong first attempts (5/12 = 41.7% < 80%)
    for (let i = 0; i < 12; i++) {
      const target = state.targetKeyId!;
      const isCorrectFirst = i < 5;

      if (isCorrectFirst) {
        const res = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res.state;
      } else {
        // Wrong first attempt
        const wrongKey = target === 'F3' ? 'C3' : 'F3';
        const res1 = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: wrongKey },
          cards: []
        });
        expect(res1.state.awaitingCorrective).toBe(true);
        // Corrective press
        const res2 = applyBassGrandActionWithCards({
          state: res1.state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res2.state;
      }
    }

    expect(state.grandTransferTrialsCompleted).toBe(12);
    expect(state.grandTransferCorrectFirstAttempts).toBe(5);
    // Accuracy is 5/12 < 80% => module must NOT complete
    expect(state.step).toBe('grandTransfer');
    expect(isBassGrandModuleComplete(state.progress)).toBe(false);
  });

  it('12 trials with >=80% + bass + treble -> module complete', () => {
    const progress = createCompleteCoreCurriculumProgress();
    for (const n of BASS_NOTE_ACQUISITION_ORDER) {
      const rec = createInitialLearningProgress(getBassNoteCurriculumItemId(n), 1000);
      progress[getBassNoteCurriculumItemId(n)] = {
        ...markFsrsActivated(markMixReady(recordModelCompleted(rec, 1000), 1000), 1000),
        state: 'retention'
      };
    }
    progress[BASS_GRAND_ITEM_IDS.FINAL_MIX] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.FINAL_MIX, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };

    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');

    // 10 correct first attempts out of 12 (83.3% >= 80%)
    for (let i = 0; i < 12; i++) {
      const target = state.targetKeyId!;
      const isCorrectFirst = i < 10;

      if (isCorrectFirst) {
        const res = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res.state;
      } else {
        const wrongKey = target === 'F3' ? 'C3' : 'F3';
        const res1 = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: wrongKey },
          cards: []
        });
        const res2 = applyBassGrandActionWithCards({
          state: res1.state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res2.state;
      }
    }

    expect(state.step).toBe('moduleComplete');
    expect(isBassGrandModuleComplete(state.progress)).toBe(true);
  });

  it('wrong first attempt + corrective -> trials +1, correctFirstAttempts unchanged', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');

    const initialTrials = state.grandTransferTrialsCompleted;
    const initialCorrect = state.grandTransferCorrectFirstAttempts;
    const target = state.targetKeyId!;
    const wrongKey = target === 'F3' ? 'C3' : 'F3';

    // Wrong attempt
    const res1 = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: wrongKey },
      cards: []
    });
    expect(res1.state.awaitingCorrective).toBe(true);
    expect(res1.state.grandTransferTrialsCompleted).toBe(initialTrials);
    expect(res1.state.grandTransferCorrectFirstAttempts).toBe(initialCorrect);

    // Corrective press
    const res2 = applyBassGrandActionWithCards({
      state: res1.state,
      action: { type: 'keyPress', keyId: target },
      cards: []
    });
    expect(res2.state.grandTransferTrialsCompleted).toBe(initialTrials + 1);
    expect(res2.state.grandTransferCorrectFirstAttempts).toBe(initialCorrect);
  });

  it('Grand Transfer after 5 trials -> persist -> reload -> resumes at 5 and preserves accuracy', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');

    // Execute 5 trials: 4 correct, 1 wrong + corrective
    for (let i = 0; i < 5; i++) {
      const target = state.targetKeyId!;
      if (i < 4) {
        const res = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res.state;
        for (const p of res.updatedProgress) {
          progress[p.id] = p;
        }
      } else {
        const wrongKey = target === 'F3' ? 'C3' : 'F3';
        const res1 = applyBassGrandActionWithCards({
          state,
          action: { type: 'keyPress', keyId: wrongKey },
          cards: []
        });
        const res2 = applyBassGrandActionWithCards({
          state: res1.state,
          action: { type: 'keyPress', keyId: target },
          cards: []
        });
        state = res2.state;
        for (const p of res2.updatedProgress) {
          progress[p.id] = p;
        }
      }
    }

    expect(state.grandTransferTrialsCompleted).toBe(5);
    expect(state.grandTransferCorrectFirstAttempts).toBe(4);

    // Simulated browser reload: re-initialize state from progress map
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('grandTransfer');
    expect(reloaded.grandTransferTrialsCompleted).toBe(5);
    expect(reloaded.grandTransferCorrectFirstAttempts).toBe(4);
  });

  it('grand transfer wrong -> reload -> awaitingCorrective=true -> same target', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('grandTransfer');
    const targetKey = state.targetKeyId!;
    const wrongKey = targetKey === 'F3' ? 'C3' : 'F3';

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: wrongKey },
      cards: []
    });

    expect(res.state.awaitingCorrective).toBe(true);
    expect(res.updatedProgress.length).toBeGreaterThan(0);
    const transRec = res.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
    expect(transRec?.contexts).toContain('pending:grandCorrective');

    for (const p of res.updatedProgress) {
      progress[p.id] = p;
    }

    // Reload from persisted progress
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('grandTransfer');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.targetKeyId).toBe(targetKey);
    expect(reloaded.targetKeyIds).toContain(targetKey);
    expect(reloaded.feedbackTone).toBe('bad');
  });

  it('grand transfer Don\'t Know -> reload -> awaitingCorrective=true', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    const targetKey = state.targetKeyId!;

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards: []
    });

    expect(res.state.awaitingCorrective).toBe(true);
    const transRec = res.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
    expect(transRec?.contexts).toContain('pending:grandCorrective');

    for (const p of res.updatedProgress) {
      progress[p.id] = p;
    }

    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('grandTransfer');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.targetKeyId).toBe(targetKey);
    expect(reloaded.targetKeyIds).toContain(targetKey);
  });

  it('corrective after reload -> completedTrials +1, correctFirstAttempts unchanged, pending context cleared', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    const targetKey = state.targetKeyId!;
    const wrongKey = targetKey === 'F3' ? 'C3' : 'F3';

    // Wrong attempt
    const resWrong = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: wrongKey },
      cards: []
    });
    for (const p of resWrong.updatedProgress) {
      progress[p.id] = p;
    }

    // Reload while awaiting corrective
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.grandTransferTrialsCompleted).toBe(0);
    expect(reloaded.grandTransferCorrectFirstAttempts).toBe(0);

    // Correct corrective press after reload
    const resCorrect = applyBassGrandActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', keyId: targetKey },
      cards: []
    });

    expect(resCorrect.state.grandTransferTrialsCompleted).toBe(1);
    expect(resCorrect.state.grandTransferCorrectFirstAttempts).toBe(0); // Unchanged!
    expect(resCorrect.state.awaitingCorrective).toBe(false);

    const updatedRec = resCorrect.updatedProgress.find(p => p.id === BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
    expect(updatedRec?.contexts).not.toContain('pending:grandCorrective');
  });

  it('wrong -> reload -> correct must NOT increase first-attempt accuracy', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    // Seed with 3 completed trials: 3 correct first attempts (100% accuracy)
    progress[BASS_GRAND_ITEM_IDS.GRAND_TRANSFER] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, 1000),
      state: 'qualifying',
      guidedSuccesses: 3,
      independentUnhintedSuccesses: 3,
      contexts: ['clef:bass', 'clef:treble']
    };

    let state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.grandTransferTrialsCompleted).toBe(3);
    expect(state.grandTransferCorrectFirstAttempts).toBe(3);

    // 4th trial: wrong answer
    const targetKey = state.targetKeyId!;
    const wrongKey = targetKey === 'F3' ? 'C3' : 'F3';
    const resWrong = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: wrongKey },
      cards: []
    });
    for (const p of resWrong.updatedProgress) {
      progress[p.id] = p;
    }

    // Reload
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.awaitingCorrective).toBe(true);

    // Answer target key correctly
    const resCorrect = applyBassGrandActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', keyId: targetKey },
      cards: []
    });

    // 4 trials completed, but still only 3 correct first attempts (accuracy dropped from 100% to 75%)
    expect(resCorrect.state.grandTransferTrialsCompleted).toBe(4);
    expect(resCorrect.state.grandTransferCorrectFirstAttempts).toBe(3);
    const accuracy = resCorrect.state.grandTransferCorrectFirstAttempts / resCorrect.state.grandTransferTrialsCompleted;
    expect(accuracy).toBe(0.75); // Exactly 3/4, NOT 4/4!
  });

  it('repeated reload while corrective preserves corrective state', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    progress[BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, 1000),
      state: 'retention'
    };
    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    const targetKey = state.targetKeyId!;
    const wrongKey = targetKey === 'F3' ? 'C3' : 'F3';

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: wrongKey },
      cards: []
    });
    for (const p of res.updatedProgress) {
      progress[p.id] = p;
    }

    // First reload
    const reload1 = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reload1.awaitingCorrective).toBe(true);
    expect(reload1.targetKeyId).toBe(targetKey);

    // Second reload without any action
    const reload2 = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reload2.awaitingCorrective).toBe(true);
    expect(reload2.targetKeyId).toBe(targetKey);
    expect(reload2.targetKeyIds).toContain(targetKey);
    expect(reload2.feedbackTone).toBe('bad');
  });

  it('Don\'t Know bass delayedCheck -> reload -> corrective H2', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    const fRec = createInitialLearningProgress(getBassNoteCurriculumItemId('F'), 1000);
    progress[getBassNoteCurriculumItemId('F')] = markMixReady(recordModelCompleted(fRec, 1000), 1000);

    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('f3DelayedCheck');

    const res = applyBassGrandActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards: []
    });

    expect(res.state.awaitingCorrective).toBe(true);
    expect(res.fsrsDelayedCheck).toBeNull(); // No FSRS mutation on Don't Know

    // Merge updated progress
    for (const p of res.updatedProgress) {
      progress[p.id] = p;
    }
    expect(progress[getBassNoteCurriculumItemId('F')].contexts).toContain('pending:corrective');

    // Reload from progress
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('f3DelayedCheck');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.targetKeyIds).toContain('F3');
    expect(reloaded.feedbackTone).toBe('bad');
  });

  it('wrong bass delayedCheck -> exactly one Again -> reload -> no duplicate Again', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    const fRec = createInitialLearningProgress(getBassNoteCurriculumItemId('F'), 1000);
    progress[getBassNoteCurriculumItemId('F')] = markMixReady(recordModelCompleted(fRec, 1000), 1000);

    const cardF = makeCard('notationBassToKey', 'F', { reps: 0 });
    const cards = [cardF];

    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(state.step).toBe('f3DelayedCheck');

    // First wrong attempt -> exactly one Again
    const resWrong = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'C3' },
      cards
    });
    expect(resWrong.fsrsDelayedCheck).not.toBeNull();
    expect(resWrong.fsrsDelayedCheck?.grade).toBe(1);

    for (const p of resWrong.updatedProgress) {
      progress[p.id] = p;
    }

    // Corrective press done
    const resCorrective = applyBassGrandActionWithCards({
      state: resWrong.state,
      action: { type: 'keyPress', keyId: 'F3' },
      cards
    });
    for (const p of resCorrective.updatedProgress) {
      progress[p.id] = p;
    }

    // Intervening recall press done -> enters fresh H0 retry with pending:delayedRetry preserved
    const resIntervening = applyBassGrandActionWithCards({
      state: resCorrective.state,
      action: { type: 'keyPress', keyId: 'C3' },
      cards
    });
    for (const p of resIntervening.updatedProgress) {
      progress[p.id] = p;
    }

    // Reload during fresh H0 retry
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('f3DelayedCheck');
    expect(reloaded.awaitingCorrective).toBe(false);

    // Another wrong answer during retry -> must NOT emit another Again
    const resRetryWrong = applyBassGrandActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', keyId: 'D3' },
      cards
    });
    expect(resRetryWrong.fsrsDelayedCheck).toBeNull();
  });

  it('reload during intervening recall -> resumes intervening recall', () => {
    const progress = createCompleteCoreCurriculumProgress();
    progress[BASS_GRAND_ITEM_IDS.ORIENTATION] = {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    };
    const fRec = createInitialLearningProgress(getBassNoteCurriculumItemId('F'), 1000);
    progress[getBassNoteCurriculumItemId('F')] = markMixReady(recordModelCompleted(fRec, 1000), 1000);

    const state = initializeBassGrandCurriculumState({ learningProgress: progress });
    const resWrong = applyBassGrandActionWithCards({
      state,
      action: { type: 'keyPress', keyId: 'C3' },
      cards: []
    });
    for (const p of resWrong.updatedProgress) {
      progress[p.id] = p;
    }

    const resCorrective = applyBassGrandActionWithCards({
      state: resWrong.state,
      action: { type: 'keyPress', keyId: 'F3' },
      cards: []
    });
    for (const p of resCorrective.updatedProgress) {
      progress[p.id] = p;
    }
    expect(resCorrective.state.isInterveningRecall).toBe(true);

    // Reload from progress
    const reloaded = initializeBassGrandCurriculumState({ learningProgress: progress });
    expect(reloaded.step).toBe('f3DelayedCheck');
    expect(reloaded.isInterveningRecall).toBe(true);
    expect(reloaded.targetKeyId).toBe('C3');
  });

  it('Daily Practice decision isGrandStaff=true -> visualConfig.isGrandStaff=true -> clef=grand', () => {
    const card = makeCard('notationToKey', 'G');
    const visual = resolveCardVisualConfig({
      card,
      isGrandStaff: true
    });
    expect(visual.isGrandStaff).toBe(true);
    expect(visual.clef).toBe('grand');
  });

  it('scheduled notationToKey + settings.notationClef=grand -> treble C4–B4 only', () => {
    const card = makeCard('notationToKey', 'E');
    const visual = resolveCardVisualConfig(
      { card, kind: 'scheduled' },
      { notationClef: 'grand' }
    );
    expect(visual.clef).toBe('treble');
    expect(visual.isGrandStaff).toBe(false);
    expect(visual.targetKeyId).toBe('E4');
    expect(visual.octave).toBe(4);
  });

  it('scheduled notationBassToKey + settings.notationClef=grand -> bass C3–B3 only', () => {
    const card = makeCard('notationBassToKey', 'E');
    const visual = resolveCardVisualConfig(
      { card, kind: 'scheduled' },
      { notationClef: 'grand' }
    );
    expect(visual.clef).toBe('bass');
    expect(visual.isGrandStaff).toBe(false);
    expect(visual.targetKeyId).toBe('E3');
    expect(visual.octave).toBe(3);
  });
});
