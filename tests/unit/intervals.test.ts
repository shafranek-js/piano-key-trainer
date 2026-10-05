import { describe, expect, it } from 'vitest';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';
import {
  SKILL_INPUT_POLICY,
  isSemanticAnswerCorrect,
  resolvePcKeyboardSemanticAnswer,
  resolvePianoKeyFromKeyboard
} from '../../src/core/input/inputPolicy';
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
  isCurriculumCardActive,
  markFsrsActivated,
  markMixReady,
  recordModelCompleted,
  type LearningProgressRecord
} from '../../src/core/learning';
import {
  BASS_GRAND_ITEM_IDS,
  isBassGrandModuleComplete
} from '../../src/core/learning/bassGrandStaff';
import {
  INTERVAL_ITEM_IDS,
  INTERVAL_ORDER,
  TRANSFER_CYCLE,
  applyIntervalActionWithCards,
  buildIntervalStateForStep,
  buildIntervalTransferTrial,
  deriveIntervalStep,
  getIntervalBuildItemId,
  getIntervalDefinition,
  getIntervalIdentifyItemId,
  getIntervalModuleStatus,
  getValidRootsForInterval,
  isIntervalAvailable,
  isIntervalComplete,
  isTransferGateSatisfied,
  resolveIntervalKeyAction,
  resolveIntervalTarget,
  type IntervalCurriculumState
} from '../../src/core/learning/intervals';
import {
  buildDailyPracticePool,
  isCoreCurriculumComplete,
  resolveCardVisualConfig
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

function createCompleteBassGrandProgress(now = 1000): Record<string, LearningProgressRecord> {
  const map = createCompleteCoreCurriculumProgress(now);
  const markDone = (id: string) => {
    const base = createInitialLearningProgress(id, now);
    map[id] = {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    };
  };

  markDone(BASS_GRAND_ITEM_IDS.ORIENTATION);
  for (const n of ['F', 'C', 'E', 'G', 'D', 'A', 'B']) {
    markDone(`advanced-bass-note:${n}`);
  }
  markDone(BASS_GRAND_ITEM_IDS.FINAL_MIX);
  markDone(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION);
  markDone(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
  markDone(BASS_GRAND_ITEM_IDS.COMPLETE);

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
    lastGrade: null,
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

describe('Milestone 3G — Interval Foundations Module', () => {
  describe('0. Module Gating & Invariants', () => {
    it('is not available before core curriculum graduation', () => {
      const emptyProgress: Record<string, LearningProgressRecord> = {};
      expect(isCoreCurriculumComplete(emptyProgress)).toBe(false);
      expect(isIntervalAvailable(emptyProgress)).toBe(false);
    });

    it('is not available before Milestone 3F (Bass & Grand Staff) completion', () => {
      const coreOnly = createCompleteCoreCurriculumProgress();
      expect(isCoreCurriculumComplete(coreOnly)).toBe(true);
      expect(isBassGrandModuleComplete(coreOnly)).toBe(false);
      expect(isIntervalAvailable(coreOnly)).toBe(false);
    });

    it('unlocks only when both core curriculum AND Milestone 3F are complete', () => {
      const complete3F = createCompleteBassGrandProgress();
      expect(isCoreCurriculumComplete(complete3F)).toBe(true);
      expect(isBassGrandModuleComplete(complete3F)).toBe(true);
      expect(isIntervalAvailable(complete3F)).toBe(true);
    });

    it('does not create Phase 7 in the core curriculum', () => {
      const complete3F = createCompleteBassGrandProgress();
      expect(isCoreCurriculumComplete(complete3F)).toBe(true);
      // Completing or modifying intervals progress does not alter core graduation
      const intervalProgress = { ...complete3F };
      intervalProgress[INTERVAL_ITEM_IDS.COMPLETE] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, 2000),
        state: 'retention'
      };
      expect(isCoreCurriculumComplete(intervalProgress)).toBe(true);
      expect(isIntervalComplete(intervalProgress)).toBe(true);
    });
  });

  describe('1. Canonical Interval Definitions & Semitone Distance', () => {
    it('defines exactly the 4 required ascending intervals with correct semitones', () => {
      expect(INTERVAL_ORDER).toEqual(['P8', 'P5', 'M3', 'm3']);

      expect(getIntervalDefinition('P8').semitones).toBe(12);
      expect(getIntervalDefinition('P5').semitones).toBe(7);
      expect(getIntervalDefinition('M3').semitones).toBe(4);
      expect(getIntervalDefinition('m3').semitones).toBe(3);
    });

    it('resolves interval targets correctly from natural roots', () => {
      // C4 + P8 -> C5
      const p8 = resolveIntervalTarget('C4', 'P8');
      expect(p8.targetKeyId).toBe('C5');
      expect(p8.targetMidi).toBe(72);
      expect(p8.semitones).toBe(12);

      // C4 + P5 -> G4
      const p5 = resolveIntervalTarget('C4', 'P5');
      expect(p5.targetKeyId).toBe('G4');
      expect(p5.targetMidi).toBe(67);
      expect(p5.semitones).toBe(7);

      // C4 + M3 -> E4
      const m3Maj = resolveIntervalTarget('C4', 'M3');
      expect(m3Maj.targetKeyId).toBe('E4');
      expect(m3Maj.targetMidi).toBe(64);
      expect(m3Maj.semitones).toBe(4);

      // C4 + m3 -> D#4
      const m3Min = resolveIntervalTarget('C4', 'm3');
      expect(m3Min.targetKeyId).toBe('D#4');
      expect(m3Min.targetMidi).toBe(63);
      expect(m3Min.semitones).toBe(3);
    });

    it('resolves interval targets correctly from chromatic roots', () => {
      // F#3 (MIDI 54) + P5 (7) -> C#4 (MIDI 61)
      const fsharpP5 = resolveIntervalTarget('F#3', 'P5');
      expect(fsharpP5.targetKeyId).toBe('C#4');
      expect(fsharpP5.targetMidi).toBe(61);

      // G#3 (MIDI 56) + M3 (4) -> C4 (MIDI 60)
      const gsharpM3 = resolveIntervalTarget('G#3', 'M3');
      expect(gsharpM3.targetKeyId).toBe('C4');
      expect(gsharpM3.targetMidi).toBe(60);
    });

    it('restricts roots so target never exceeds physical keyboard range (C2–C6, MIDI 36..84)', () => {
      for (const id of INTERVAL_ORDER) {
        const roots = getValidRootsForInterval(id, true);
        expect(roots.length).toBeGreaterThan(0);
        for (const root of roots) {
          const res = resolveIntervalTarget(root, id);
          expect(res.targetMidi).toBeLessThanOrEqual(84);
          expect(res.targetMidi).toBeGreaterThanOrEqual(36);
        }
      }
    });
  });

  describe('2. Input Policy & Routing', () => {
    it('configures intervalBuild to accept on-screen piano and MIDI with exact octave enforcement', () => {
      const policy = SKILL_INPUT_POLICY.intervalBuild;
      expect(policy.pianoKey).toBe(true);
      expect(policy.midi).toBe(true);
      expect(policy.pcNote).toBe(false);
      expect(policy.answerButton).toBe(false);
      expect(policy.requiresExactOctave).toBe(true);
    });

    it('configures intervalIdentify to accept answer buttons without piano/midi or note letters', () => {
      const policy = SKILL_INPUT_POLICY.intervalIdentify;
      expect(policy.answerButton).toBe(true);
      expect(policy.pcNote).toBe(false);
      expect(policy.pianoKey).toBe(false);
      expect(policy.midi).toBe(false);
      expect(policy.requiresExactOctave).toBe(false);
    });

    it('maps digits 1..4 correctly to interval answer buttons in identify mode', () => {
      const identifyState: IntervalCurriculumState = {
        step: 'p8IdentifyQualify',
        progress: {},
        activeSkill: 'intervalIdentify',
        focusInterval: 'P8',
        targetKeyIds: [],
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        isInterveningRecall: false,
        localMixSuccessCount: 0,
        localMixTarget: 3,
        transferTrialsCompleted: 0,
        transferCorrectFirstAttempts: 0,
        transferIntervalsSeen: [],
        transferSkillsSeen: [],
        transferChromaticSeen: 0
      };

      expect(resolveIntervalKeyAction(identifyState, '1', 'Digit1')).toEqual({ type: 'selectAnswer', intervalId: 'P8' });
      expect(resolveIntervalKeyAction(identifyState, '2', 'Digit2')).toEqual({ type: 'selectAnswer', intervalId: 'P5' });
      expect(resolveIntervalKeyAction(identifyState, '3', 'Digit3')).toEqual({ type: 'selectAnswer', intervalId: 'M3' });
      expect(resolveIntervalKeyAction(identifyState, '4', 'Digit4')).toEqual({ type: 'selectAnswer', intervalId: 'm3' });
    });
  });

  describe('3. Progression Step Machine & Acquisition Sequence', () => {
    it('initializes at intervalOrientation and follows P8 -> P5 -> M3 -> m3 build sequence', () => {
      const progress: Record<string, LearningProgressRecord> = {};
      expect(deriveIntervalStep(progress)).toBe('intervalOrientation');

      progress[INTERVAL_ITEM_IDS.ORIENTATION] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION, 1000),
        state: 'retention'
      };
      expect(deriveIntervalStep(progress)).toBe('p8BuildModel');

      // Model seen -> Guided
      progress[INTERVAL_ITEM_IDS.BUILD_P8] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8, 1000),
        state: 'introduced'
      };
      expect(deriveIntervalStep(progress)).toBe('p8BuildGuided');

      // Guided seen -> Qualify
      progress[INTERVAL_ITEM_IDS.BUILD_P8].state = 'guided';
      expect(deriveIntervalStep(progress)).toBe('p8BuildQualify');

      // Qualify done -> LocalMix
      progress[INTERVAL_ITEM_IDS.BUILD_P8].state = 'qualifying';
      expect(deriveIntervalStep(progress)).toBe('p8BuildLocalMix');

      // LocalMix done -> DelayedCheck
      progress[INTERVAL_ITEM_IDS.BUILD_P8].state = 'mixReady';
      expect(deriveIntervalStep(progress)).toBe('p8BuildDelayedCheck');

      // DelayedCheck retention -> advances to P5 Build Model
      progress[INTERVAL_ITEM_IDS.BUILD_P8].state = 'retention';
      expect(deriveIntervalStep(progress)).toBe('p5BuildModel');
    });

    it('inserts contrastM3m3 after completing all 4 build intervals', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P8]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P5]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P5), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_M3]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_M3), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_m3]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_m3), state: 'retention' }
      };

      expect(deriveIntervalStep(progress)).toBe('contrastM3m3');

      // After contrast is marked retention -> p8IdentifyModel
      progress[INTERVAL_ITEM_IDS.CONTRAST_M3_m3] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.CONTRAST_M3_m3),
        state: 'retention'
      };
      expect(deriveIntervalStep(progress)).toBe('p8IdentifyModel');
    });
  });

  describe('4. Exact Octave Check & Diagnosis in intervalBuild', () => {
    it('diagnoses wrong octave (same pitch class, wrong octave) separately from wrong note', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' }
      };
      const state = buildIntervalStateForStep('p8BuildQualify', progress);
      // state: root C4, target C5
      expect(state.rootKeyId).toBe('C4');
      expect(state.targetKeyId).toBe('C5');

      // User presses C4 instead of C5: same note class 'C', but wrong octave
      const res = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: 'C4', note: 'C' },
        { progress, cards: [] }
      );

      expect(res.outcome).toBe('wrong_octave');
      expect(res.state.feedbackText).toBe(
        'C4 — это уже опорная нота. Нужно найти вторую ноту интервала выше неё.'
      );
      expect(res.state.awaitingCorrective).toBe(true);
    });

    it('rejects completely wrong notes and requests corrective press', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' }
      };
      const state = buildIntervalStateForStep('p8BuildQualify', progress);

      const res = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: 'F4', note: 'F' },
        { progress, cards: [] }
      );

      expect(res.outcome).toBe('wrong_note');
      expect(res.state.awaitingCorrective).toBe(true);
    });
  });

  describe('5. FSRS Eligibility & Delayed Check Invariants', () => {
    it('does NOT mutate FSRS cards during Model, Qualify, or LocalMix', () => {
      const cards: Card[] = [makeCard('intervalBuild', 'P8', { reps: 0 })];
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' }
      };

      // Model advance
      const modelState = buildIntervalStateForStep('p8BuildModel', progress);
      const modelRes = applyIntervalActionWithCards(modelState, { type: 'advanceStage' }, { progress, cards });
      expect(modelRes.mutatedCard).toBeUndefined();
      expect(cards[0].reps).toBe(0);

      // Qualify correct
      const qualState = modelRes.state;
      const qualRes = applyIntervalActionWithCards(
        qualState,
        { type: 'keyPress', keyId: qualState.targetKeyId || 'C5', note: 'C' },
        { progress, cards }
      );
      expect(qualRes.mutatedCard).toBeUndefined();
      expect(cards[0].reps).toBe(0);
    });

    it('DelayedCheck H0 first attempt mutates FSRS card and promotes to retention on success', () => {
      const cards: Card[] = [makeCard('intervalBuild', 'P8', { reps: 0 })];
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P8]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8), state: 'mixReady' }
      };

      const delayState = buildIntervalStateForStep('p8BuildDelayedCheck', progress);
      const res = applyIntervalActionWithCards(
        delayState,
        { type: 'keyPress', keyId: delayState.targetKeyId || 'C5', note: 'C' },
        { progress, cards }
      );

      expect(res.outcome).toBe('correct');
      expect(res.attemptResult?.cardMutated).toBe(true);
      expect(res.mutatedCard?.reps).toBe(1);
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].state).toBe('retention');
    });

    it('DelayedCheck error sets pending:delayedRetry, grade 1, and locks card from Daily Practice', () => {
      const card = makeCard('intervalBuild', 'P8', { reps: 0 });
      const cards: Card[] = [card];
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P8]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8), state: 'mixReady' }
      };

      const delayState = buildIntervalStateForStep('p8BuildDelayedCheck', progress);
      const res = applyIntervalActionWithCards(
        delayState,
        { type: 'keyPress', keyId: 'G4', note: 'G' }, // wrong note
        { progress, cards }
      );

      expect(res.outcome).toBe('wrong_note');
      expect(res.attemptResult?.cardMutated).toBe(true);
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:delayedRetry');

      // When pending:delayedRetry is set, card is NOT active for scheduler
      expect(isCurriculumCardActive(card, { learningProgress: progress })).toBe(false);
    });
  });

  describe('6. Identify Mechanics (Visual stimulus & 4 answer buttons)', () => {
    it('renders both stimulus keys (root + target) for intervalIdentify', () => {
      const progress: Record<string, LearningProgressRecord> = {};
      const state = buildIntervalStateForStep('p8IdentifyModel', progress);

      expect(state.activeSkill).toBe('intervalIdentify');
      expect(state.targetKeyIds.length).toBe(2);
      expect(state.targetKeyIds).toContain(state.rootKeyId);
      expect(state.targetKeyIds).toContain(state.targetKeyId);
    });

    it('handles selectAnswer correctly in Identify stage', () => {
      const card = makeCard('intervalIdentify', 'P8', { reps: 0 });
      const cards: Card[] = [card];
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.IDENTIFY_P8]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.IDENTIFY_P8), state: 'guided' }
      };
      const state = buildIntervalStateForStep('p8IdentifyQualify', progress);

      // Correct answer selection
      const res = applyIntervalActionWithCards(
        state,
        { type: 'selectAnswer', intervalId: 'P8' },
        { progress, cards }
      );

      expect(res.outcome).toBe('correct');
      expect(progress[INTERVAL_ITEM_IDS.IDENTIFY_P8].state).toBe('qualifying');
    });

    it('rejects wrong answer selection in Identify stage and requires corrective choice', () => {
      const card = makeCard('intervalIdentify', 'P8', { reps: 0 });
      const cards: Card[] = [card];
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.IDENTIFY_P8]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.IDENTIFY_P8), state: 'guided' }
      };
      const state = buildIntervalStateForStep('p8IdentifyQualify', progress);

      const res = applyIntervalActionWithCards(
        state,
        { type: 'selectAnswer', intervalId: 'P5' },
        { progress, cards }
      );

      expect(res.outcome).toBe('wrong_interval');
      expect(res.state.awaitingCorrective).toBe(true);
    });
  });

  describe('7. Final Transfer Phase & Completion Gate', () => {
    function setupTransferReadyProgress(): Record<string, LearningProgressRecord> {
      const p: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.CONTRAST_M3_m3]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.CONTRAST_M3_m3), state: 'retention' },
        [INTERVAL_ITEM_IDS.TRANSFER]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER), state: 'qualifying', contexts: [] }
      };
      for (const id of INTERVAL_ORDER) {
        p[getIntervalBuildItemId(id)] = { ...createInitialLearningProgress(getIntervalBuildItemId(id)), state: 'retention' };
        p[getIntervalIdentifyItemId(id)] = { ...createInitialLearningProgress(getIntervalIdentifyItemId(id)), state: 'retention' };
      }
      return p;
    }

    it('transitions to intervalTransfer once all build and identify items are in retention', () => {
      const progress = setupTransferReadyProgress();
      expect(deriveIntervalStep(progress)).toBe('intervalTransfer');
    });

    it('transfer interleaves both skills (build and identify) and chromatic roots', () => {
      const progress = setupTransferReadyProgress();
      const skillsSeen = new Set<string>();
      const intervalsSeen = new Set<string>();
      let chromaticCount = 0;

      for (let i = 0; i < 12; i++) {
        const state = buildIntervalStateForStep('intervalTransfer', progress, 1000 + i, i);
        skillsSeen.add(state.activeSkill);
        if (state.focusInterval) intervalsSeen.add(state.focusInterval);
        if (state.rootKeyId?.includes('#')) chromaticCount++;
      }

      expect(skillsSeen.has('intervalBuild')).toBe(true);
      expect(skillsSeen.has('intervalIdentify')).toBe(true);
      expect(intervalsSeen.size).toBe(4);
      expect(chromaticCount).toBeGreaterThan(0);
    });

    it('persists pending:intervalTransferCorrective on first-attempt error and prevents inflation on corrective reload', () => {
      const progress = setupTransferReadyProgress();
      let state = buildIntervalStateForStep('intervalTransfer', progress);

      // Wrong attempt
      const wrongRes = applyIntervalActionWithCards(
        state,
        state.activeSkill === 'intervalBuild'
          ? { type: 'keyPress', keyId: 'F2', note: 'F' }
          : { type: 'selectAnswer', intervalId: 'm3' },
        { progress, cards: [] }
      );

      expect(wrongRes.state.awaitingCorrective).toBe(true);
      expect(progress[INTERVAL_ITEM_IDS.TRANSFER].contexts).toContain('pending:intervalTransferCorrective');

      // Reloading state preserves awaitingCorrective
      const reloadedState = buildIntervalStateForStep('intervalTransfer', progress);
      expect(reloadedState.awaitingCorrective).toBe(true);

      // Successful corrective press resolves corrective state and increments guidedSuccesses (trials) but NOT independentUnhintedSuccesses
      const expectedKey = reloadedState.targetKeyId;
      const expectedInterval = reloadedState.focusInterval!;
      const correctAction = reloadedState.activeSkill === 'intervalBuild'
        ? { type: 'keyPress' as const, keyId: expectedKey || 'C5', note: 'C' as NoteName }
        : { type: 'selectAnswer' as const, intervalId: expectedInterval };

      const corrRes = applyIntervalActionWithCards(reloadedState, correctAction, { progress, cards: [] });
      expect(corrRes.state.awaitingCorrective).toBe(false);
      expect(progress[INTERVAL_ITEM_IDS.TRANSFER].guidedSuccesses).toBe(1);
      expect(progress[INTERVAL_ITEM_IDS.TRANSFER].independentUnhintedSuccesses).toBe(0);
    });

    it('requires at least 12 trials and >= 80% accuracy to complete module', () => {
      const progress = setupTransferReadyProgress();

      // Case A: 12 trials with 8/12 (66.7%) -> fails gate, does not complete
      progress[INTERVAL_ITEM_IDS.TRANSFER] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
        state: 'qualifying',
        guidedSuccesses: 11,
        independentUnhintedSuccesses: 7,
        contexts: []
      };

      let state = buildIntervalStateForStep('intervalTransfer', progress, 1000, 11);
      // 12th trial correct: 8/12 = 66.7% < 80%
      const resA = applyIntervalActionWithCards(
        state,
        state.activeSkill === 'intervalBuild'
          ? { type: 'keyPress', keyId: state.targetKeyId || 'C5', note: 'C' }
          : { type: 'selectAnswer', intervalId: state.focusInterval! },
        { progress, cards: [] }
      );
      expect(resA.state.step).toBe('intervalTransfer');
      expect(isIntervalComplete(progress)).toBe(false);

      // Case B: 12 trials with 10/12 (83.3%) and full coverage -> passes gate, completes module!
      progress[INTERVAL_ITEM_IDS.TRANSFER] = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
        state: 'qualifying',
        guidedSuccesses: 11,
        independentUnhintedSuccesses: 9,
        contexts: ['interval:P8', 'interval:P5', 'interval:M3', 'skill:intervalBuild', 'skill:intervalIdentify', 'root:chromatic']
      };

      state = buildIntervalStateForStep('intervalTransfer', progress, 2000, 11);
      const resB = applyIntervalActionWithCards(
        state,
        state.activeSkill === 'intervalBuild'
          ? { type: 'keyPress', keyId: state.targetKeyId || 'C5', note: 'C' }
          : { type: 'selectAnswer', intervalId: state.focusInterval! },
        { progress, cards: [] }
      );

      expect(resB.state.step).toBe('moduleComplete');
      expect(isIntervalComplete(progress)).toBe(true);
      expect(getIntervalModuleStatus(progress)).toBe('completed');
    });
  });

  describe('8. Daily Practice Integration & Admission', () => {
    it('admits active interval cards into Daily Practice and resolves visual cues accurately', () => {
      const completeIntervalProgress = setupTransferCompleteProgress();
      const activeCard = makeCard('intervalBuild', 'P8', { reps: 3 });

      expect(isCurriculumCardActive(activeCard, { learningProgress: completeIntervalProgress })).toBe(true);

      const pool = buildDailyPracticePool({
        cards: [activeCard],
        learningProgress: completeIntervalProgress
      });

      expect(pool.length).toBe(1);
      expect(pool[0].id).toBe('intervalBuild:P8');

      // Visual resolver: for intervalBuild, highlights rootKeyId as structural guide, hides target
      const visual = resolveCardVisualConfig(activeCard);
      expect(visual.rootKeyId).toBe('C4');
      expect(visual.structuralGuideKeyIds).toContain('C4');
      expect(visual.targetKeyIds).toEqual([]); // Hidden for recall!

      // Visual resolver: for intervalIdentify, highlights both root and target
      const identifyCard = makeCard('intervalIdentify', 'P5', { reps: 2 });
      const identifyVisual = resolveCardVisualConfig(identifyCard);
      expect(identifyVisual.rootKeyId).toBe('C4');
      expect(identifyVisual.targetKeyIds).toContain('C4');
      expect(identifyVisual.targetKeyIds).toContain('G4');
    });

    it('strictly locks unintroduced or pending interval cards from Daily Practice', () => {
      const emptyProgress: Record<string, LearningProgressRecord> = {};
      const card = makeCard('intervalBuild', 'P8', { reps: 0 });
      expect(isCurriculumCardActive(card, { learningProgress: emptyProgress })).toBe(false);

      const pool = buildDailyPracticePool({
        cards: [card],
        learningProgress: emptyProgress
      });
      expect(pool.length).toBe(0);
    });
  });

  describe('9. Milestone 3G Rev1 Canonical Remediation, Guided Stages & Transfer Gates', () => {
    it('scheduled intervalIdentify P5 + answer P5 -> correct', () => {
      expect(isSemanticAnswerCorrect('intervalIdentify', 'P5', 'P5', undefined, undefined)).toBe(true);
    });

    it('scheduled intervalIdentify P5 + answer M3 -> wrong', () => {
      expect(isSemanticAnswerCorrect('intervalIdentify', 'M3', 'P5', undefined, undefined)).toBe(false);
    });

    it('digit 1–4 mapping works in scheduled intervalIdentify', () => {
      const ans1 = resolvePcKeyboardSemanticAnswer('intervalIdentify', { key: '1', code: 'Digit1', shiftKey: false });
      expect(ans1?.answerNote).toBe('P8');
      const ans2 = resolvePcKeyboardSemanticAnswer('intervalIdentify', { key: '2', code: 'Digit2', shiftKey: false });
      expect(ans2?.answerNote).toBe('P5');
      const ans3 = resolvePcKeyboardSemanticAnswer('intervalIdentify', { key: '3', code: 'Digit3', shiftKey: false });
      expect(ans3?.answerNote).toBe('M3');
      const ans4 = resolvePcKeyboardSemanticAnswer('intervalIdentify', { key: '4', code: 'Digit4', shiftKey: false });
      expect(ans4?.answerNote).toBe('m3');
    });

    it('scheduled intervalBuild visual config survives activateTask (root highlighted, target hidden)', () => {
      const buildCard = makeCard('intervalBuild', 'P8', { reps: 1 });
      const visual = resolveCardVisualConfig(buildCard);
      expect(visual.structuralGuideKeyIds).toEqual(['C4']);
      expect(visual.targetKeyIds).toEqual([]);
    });

    it('Delayed Don\'t Know Build -> 0 FSRS mutations and enters corrective', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.BUILD_P8]: {
          ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8),
          state: 'mixReady'
        }
      };
      const card = makeCard('intervalBuild', 'P8', { reps: 0 });
      const state = buildIntervalStateForStep('p8BuildDelayedCheck', progress);

      const res = applyIntervalActionWithCards(
        state,
        { type: 'dontKnow' },
        { progress, cards: [card] }
      );

      // 0 FSRS mutations
      expect(res.mutatedCard).toBeUndefined();
      expect(res.attemptResult).toBeUndefined();
      expect(res.state.awaitingCorrective).toBe(true);
      expect(res.state.targetKeyIds).toEqual([state.targetKeyId]); // Corrective illuminates target
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:delayedRetry');
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:corrective');
    });

    it('Delayed Don\'t Know Identify -> 0 FSRS mutations and enters corrective', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.IDENTIFY_P5]: {
          ...createInitialLearningProgress(INTERVAL_ITEM_IDS.IDENTIFY_P5),
          state: 'qualifying'
        }
      };
      const card = makeCard('intervalIdentify', 'P5', { reps: 0 });
      const state = buildIntervalStateForStep('p5IdentifyDelayedCheck', progress);

      const res = applyIntervalActionWithCards(
        state,
        { type: 'dontKnow' },
        { progress, cards: [card] }
      );

      // 0 FSRS mutations
      expect(res.mutatedCard).toBeUndefined();
      expect(res.attemptResult).toBeUndefined();
      expect(res.state.awaitingCorrective).toBe(true);
      expect(progress[INTERVAL_ITEM_IDS.IDENTIFY_P5].contexts).toContain('pending:delayedRetry');
      expect(progress[INTERVAL_ITEM_IDS.IDENTIFY_P5].contexts).toContain('pending:corrective');
    });

    it('Delayed wrong octave Build -> exactly one Again -> persisted corrective after reload', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P8]: {
          ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8),
          state: 'mixReady'
        }
      };
      const card = makeCard('intervalBuild', 'P8', { reps: 0 });
      const state = buildIntervalStateForStep('p8BuildDelayedCheck', progress);

      // Plays same pitch class as target, but wrong octave:
      const targetKeyId = state.targetKeyId!;
      const pitchClass = targetKeyId.slice(0, -1) as NoteName;
      const wrongOctaveKey = targetKeyId.endsWith('4')
        ? `${pitchClass}3`
        : `${pitchClass}4`;

      const res = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: wrongOctaveKey, note: pitchClass },
        { progress, cards: [card] }
      );

      expect(res.outcome).toBe('wrong_octave');
      expect(res.mutatedCard).toBeDefined();
      expect(res.attemptResult?.cardMutated).toBe(true);
      expect(res.attemptResult?.grade).toBe(1);
      expect(res.state.awaitingCorrective).toBe(true);
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:delayedRetry');
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:corrective');

      // Reloading recovers corrective state
      const reloadedState = buildIntervalStateForStep('p8BuildDelayedCheck', progress);
      expect(reloadedState.awaitingCorrective).toBe(true);
      expect(reloadedState.targetKeyIds).toEqual([targetKeyId]);
    });

    it('wrong delayed -> corrective -> intervening -> H0 retry -> no second FSRS mutation', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
        [INTERVAL_ITEM_IDS.BUILD_P8]: {
          ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8),
          state: 'mixReady'
        }
      };
      const card = makeCard('intervalBuild', 'P8', { reps: 0 });
      let state = buildIntervalStateForStep('p8BuildDelayedCheck', progress);

      // 1. Wrong key: logged 1 Again
      const wrongRes = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: 'B2', note: 'B' },
        { progress, cards: [card] }
      );
      expect(wrongRes.mutatedCard).toBeDefined();
      state = wrongRes.state;
      expect(state.awaitingCorrective).toBe(true);

      // 2. Corrective press: moves to intervening recall
      const targetKeyId = state.targetKeyId!;
      const pitchClass = targetKeyId.slice(0, -1) as NoteName;
      const correctiveRes = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: targetKeyId, note: pitchClass },
        { progress, cards: [card] }
      );
      state = correctiveRes.state;
      expect(state.isInterveningRecall).toBe(true);
      expect(state.awaitingCorrective).toBe(false);
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:interveningRecall');

      // 3. Intervening recall success: moves to fresh H0 retry (pending:delayedRetry remains)
      const interveningTarget = state.targetKeyId!;
      const interveningNote = interveningTarget.slice(0, -1) as NoteName;
      const interveningRes = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: interveningTarget, note: interveningNote },
        { progress, cards: [card] }
      );
      state = interveningRes.state;
      expect(state.isInterveningRecall).toBe(false);
      expect(state.awaitingCorrective).toBe(false);
      expect(state.targetKeyIds).toEqual([]); // H0 check: target hidden!
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).toContain('pending:delayedRetry');

      // 4. Retry H0 success: activates FSRS and sets retention, with NO second FSRS mutation logged!
      const retryTarget = state.targetKeyId!;
      const retryNote = retryTarget.slice(0, -1) as NoteName;
      const retryRes = applyIntervalActionWithCards(
        state,
        { type: 'keyPress', keyId: retryTarget, note: retryNote },
        { progress, cards: [card] }
      );
      expect(retryRes.mutatedCard).toBeUndefined(); // NO second FSRS mutation!
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].state).toBe('retention');
      expect(progress[INTERVAL_ITEM_IDS.BUILD_P8].contexts).not.toContain('pending:delayedRetry');
    });

    it('Guided H2 exists for every Build interval with target hidden and semitone span in prompt', () => {
      const buildSteps = ['p8BuildGuided', 'p5BuildGuided', 'major3BuildGuided', 'minor3BuildGuided'] as const;
      for (const step of buildSteps) {
        const state = buildIntervalStateForStep(step, {});
        expect(state.activeSkill).toBe('intervalBuild');
        expect(state.structuralGuideKeyIds.length).toBeGreaterThan(0);
        expect(state.targetKeyIds).toEqual([]); // Target is hidden in H2 Guided!
        expect(state.feedbackText).toContain('полутон');
      }
    });

    it('transfer cannot complete without all 4 interval contexts', () => {
      const transRec: LearningProgressRecord = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
        guidedSuccesses: 12,
        independentUnhintedSuccesses: 12,
        contexts: ['interval:P8', 'interval:P5', 'interval:M3', 'skill:intervalBuild', 'skill:intervalIdentify', 'root:chromatic'] // missing interval:m3
      };
      expect(isTransferGateSatisfied(transRec)).toBe(false);
    });

    it('transfer cannot complete without both skill contexts', () => {
      const transRec: LearningProgressRecord = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
        guidedSuccesses: 12,
        independentUnhintedSuccesses: 12,
        contexts: ['interval:P8', 'interval:P5', 'interval:M3', 'interval:m3', 'skill:intervalBuild', 'root:chromatic'] // missing skill:intervalIdentify
      };
      expect(isTransferGateSatisfied(transRec)).toBe(false);
    });

    it('transfer cannot complete without chromatic-root context', () => {
      const transRec: LearningProgressRecord = {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
        guidedSuccesses: 12,
        independentUnhintedSuccesses: 12,
        contexts: ['interval:P8', 'interval:P5', 'interval:M3', 'interval:m3', 'skill:intervalBuild', 'skill:intervalIdentify'] // missing root:chromatic
      };
      expect(isTransferGateSatisfied(transRec)).toBe(false);
    });

    it('transfer coverage survives reload', () => {
      const progress: Record<string, LearningProgressRecord> = {
        [INTERVAL_ITEM_IDS.TRANSFER]: {
          ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
          guidedSuccesses: 8,
          independentUnhintedSuccesses: 8,
          contexts: ['interval:P8', 'interval:P5', 'skill:intervalBuild', 'root:chromatic']
        }
      };
      const state = buildIntervalStateForStep('intervalTransfer', progress);
      expect(state.transferIntervalsSeen).toContain('P8');
      expect(state.transferIntervalsSeen).toContain('P5');
      expect(state.transferSkillsSeen).toContain('intervalBuild');
      expect(state.transferChromaticSeen).toBe(1);
    });

    it('first deterministic transfer cycle covers all 8 skill × interval combinations and chromatic roots', () => {
      expect(TRANSFER_CYCLE.length).toBe(12);
      const combos = new Set<string>();
      let hasChromatic = false;
      for (let i = 0; i < 8; i++) {
        const trial = buildIntervalTransferTrial(i);
        combos.add(`${trial.skill}:${trial.intervalId}`);
        if (trial.isChromaticRoot) hasChromatic = true;
      }
      expect(combos.size).toBe(8);
      expect(combos).toContain('intervalBuild:P8');
      expect(combos).toContain('intervalIdentify:P8');
      expect(combos).toContain('intervalBuild:P5');
      expect(combos).toContain('intervalIdentify:P5');
      expect(combos).toContain('intervalBuild:M3');
      expect(combos).toContain('intervalIdentify:M3');
      expect(combos).toContain('intervalBuild:m3');
      expect(combos).toContain('intervalIdentify:m3');
      expect(hasChromatic).toBe(true);
    });
  });
});

function setupTransferCompleteProgress(): Record<string, LearningProgressRecord> {
  const p: Record<string, LearningProgressRecord> = {
    [INTERVAL_ITEM_IDS.ORIENTATION]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION), state: 'retention' },
    [INTERVAL_ITEM_IDS.CONTRAST_M3_m3]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.CONTRAST_M3_m3), state: 'retention' },
    [INTERVAL_ITEM_IDS.TRANSFER]: {
      ...createInitialLearningProgress(INTERVAL_ITEM_IDS.TRANSFER),
      state: 'retention',
      guidedSuccesses: 12,
      independentUnhintedSuccesses: 11,
      contexts: ['interval:P8', 'interval:P5', 'interval:M3', 'interval:m3', 'skill:intervalBuild', 'skill:intervalIdentify', 'root:chromatic']
    },
    [INTERVAL_ITEM_IDS.COMPLETE]: { ...createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE), state: 'retention' }
  };
  for (const id of INTERVAL_ORDER) {
    p[getIntervalBuildItemId(id)] = { ...createInitialLearningProgress(getIntervalBuildItemId(id)), state: 'retention' };
    p[getIntervalIdentifyItemId(id)] = { ...createInitialLearningProgress(getIntervalIdentifyItemId(id)), state: 'retention' };
  }
  return p;
}

describe('Interval Build one-target input regression', () => {
  function guidedP8State(): IntervalCurriculumState {
    const progress: Record<string, LearningProgressRecord> = {
      [INTERVAL_ITEM_IDS.ORIENTATION]: {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.ORIENTATION, 1000),
        state: 'retention'
      },
      [INTERVAL_ITEM_IDS.BUILD_P8]: {
        ...createInitialLearningProgress(INTERVAL_ITEM_IDS.BUILD_P8, 1000),
        state: 'introduced'
      }
    };
    return buildIntervalStateForStep('p8BuildGuided', progress, 1000);
  }

  it('P8 Guided C4 to C5 accepts only the target and advances exactly once', () => {
    const state = guidedP8State();
    expect(state.rootKeyId).toBe('C4');
    expect(state.targetKeyId).toBe('C5');

    const result = applyIntervalActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C5' },
      now: 2000
    });

    expect(result.outcome).toBe('correct');
    expect(result.state.step).toBe('p8BuildQualify');
    expect(result.state.feedbackText).toContain('Верно!');
  });

  it.each([
    { step: 'p5BuildGuided' as const, interval: 'P5' as const, root: 'C4', target: 'G4', note: 'G' as const },
    { step: 'major3BuildGuided' as const, interval: 'M3' as const, root: 'C4', target: 'E4', note: 'E' as const },
    { step: 'minor3BuildGuided' as const, interval: 'm3' as const, root: 'A3', target: 'C4', note: 'C' as const }
  ])('$interval Guided expects only target $target above root $root', ({ step, interval, root, target, note }) => {
    const state = buildIntervalStateForStep(step, {}, 1000);
    expect(state.rootKeyId).toBe(root);
    expect(state.targetKeyId).toBe(target);

    const result = applyIntervalActionWithCards({
      state,
      action: { type: 'keyPress', note, keyId: target },
      now: 2000
    });
    expect(result.outcome).toBe('correct');
    expect(result.updatedProgress.some(record => record.id === getIntervalBuildItemId(interval))).toBe(true);
  });

  it('pressing the given root explains that it is already the anchor', () => {
    const result = applyIntervalActionWithCards({
      state: guidedP8State(),
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      now: 2000
    });

    expect(result.outcome).toBe('wrong_octave');
    expect(result.state.feedbackText).toBe(
      'C4 — это уже опорная нота. Нужно найти вторую ноту интервала выше неё.'
    );
  });

  it('screen, PC keyboard, and MIDI C5 use the same keyPress and reducer outcome', () => {
    const pcKey = resolvePianoKeyFromKeyboard(
      { code: 'KeyC', key: 'c', shiftKey: false },
      5
    );
    expect(pcKey).toEqual({ note: 'C', keyId: 'C5' });

    const actions = [
      { type: 'keyPress' as const, note: 'C' as const, keyId: 'C5' },
      { type: 'keyPress' as const, ...pcKey! },
      { type: 'keyPress' as const, note: 'C' as const, keyId: 'C5' }
    ];
    const results = actions.map(action =>
      applyIntervalActionWithCards({ state: guidedP8State(), action, now: 2000 })
    );

    expect(actions[0]).toEqual(actions[1]);
    expect(actions[1]).toEqual(actions[2]);
    expect(results.map(result => [result.outcome, result.state.step, result.state.feedbackText])).toEqual([
      ['correct', 'p8BuildQualify', results[0].state.feedbackText],
      ['correct', 'p8BuildQualify', results[0].state.feedbackText],
      ['correct', 'p8BuildQualify', results[0].state.feedbackText]
    ]);
  });
});
