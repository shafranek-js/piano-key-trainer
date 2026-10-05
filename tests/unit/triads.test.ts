import { describe, expect, it } from 'vitest';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';
import {
  SKILL_INPUT_POLICY,
  isSemanticAnswerCorrect,
  resolvePcKeyboardSemanticAnswer
} from '../../src/core/input/inputPolicy';
import {
  sortKeyIdsByPitch,
  toggleKeyInChordSelection,
  areChordKeyIdsEqual,
  MidiChordTracker
} from '../../src/core/input/chordInput';
import {
  TRIAD_DEFINITIONS,
  TRIAD_ITEM_IDS,
  TRIAD_TRANSFER_CYCLE,
  resolveTriadPitches,
  classifyTriadAnswer,
  isTriadModuleAvailable,
  isTriadModuleComplete,
  getTriadModuleStatus,
  buildTriadStateForStep,
  createTriadCurriculumState,
  applyTriadActionWithCards,
  canUseDontKnowInTriadStep,
  resolveTriadKeydownAction,
  getValidTriadRoots,
  CANONICAL_TRIAD_PRACTICE_ROOTS,
  resolveTriadPracticeRootKeyId,
  evaluateDailyChordAttempt,
  isTriadTransferGateSatisfied,
  deriveTriadStep
} from '../../src/core/learning/triads';
import {
  INTERVAL_ITEM_IDS
} from '../../src/core/learning/intervals';
import {
  BASS_GRAND_ITEM_IDS
} from '../../src/core/learning/bassGrandStaff';
import {
  createInitialLearningProgress,
  markFsrsActivated
} from '../../src/core/learning/progress';
import type { LearningProgressRecord } from '../../src/core/learning/types';
import {
  resolveCardVisualConfig
} from '../../src/core/learning/dailyPractice';

function createMockIntervalCompletedProgress(now = 1000): Record<string, LearningProgressRecord> {
  const map: Record<string, LearningProgressRecord> = {};
  const rec = createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
  map[INTERVAL_ITEM_IDS.COMPLETE] = {
    ...markFsrsActivated(rec, now),
    state: 'retention',
    contexts: []
  };
  return map;
}

function createMockTriadPreTransferProgress(transRec?: LearningProgressRecord, now = 1000): Record<string, LearningProgressRecord> {
  const map: Record<string, LearningProgressRecord> = {};
  const orient = createInitialLearningProgress(TRIAD_ITEM_IDS.ORIENTATION, now);
  map[TRIAD_ITEM_IDS.ORIENTATION] = { ...orient, state: 'introduced' };

  const buildMaj = createInitialLearningProgress(TRIAD_ITEM_IDS.BUILD_MAJOR, now);
  map[TRIAD_ITEM_IDS.BUILD_MAJOR] = { ...buildMaj, state: 'retention' };

  const buildMin = createInitialLearningProgress(TRIAD_ITEM_IDS.BUILD_MINOR, now);
  map[TRIAD_ITEM_IDS.BUILD_MINOR] = { ...buildMin, state: 'retention' };

  const contrast = createInitialLearningProgress(TRIAD_ITEM_IDS.CONTRAST, now);
  map[TRIAD_ITEM_IDS.CONTRAST] = { ...contrast, state: 'retention' };

  const idMaj = createInitialLearningProgress(TRIAD_ITEM_IDS.IDENTIFY_MAJOR, now);
  map[TRIAD_ITEM_IDS.IDENTIFY_MAJOR] = { ...idMaj, state: 'retention' };

  const idMin = createInitialLearningProgress(TRIAD_ITEM_IDS.IDENTIFY_MINOR, now);
  map[TRIAD_ITEM_IDS.IDENTIFY_MINOR] = { ...idMin, state: 'retention' };

  if (transRec) {
    map[TRIAD_ITEM_IDS.TRANSFER] = transRec;
  }
  return map;
}

function createCard(id: string, skill: Skill, note: NoteName): Card {
  return {
    id,
    skill,
    note,
    stability: 2.5,
    difficulty: 5.0,
    reps: 1,
    lapses: 0,
    memoryState: 'review',
    dueAt: 1000,
    lastReviewAt: 1000,
    firstSeenAt: 1000,
    lastGrade: null,
    stats: {
      trials: 1,
      firstCorrect: 1,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 1,
      scheduledSuccesses: 1,
      practiceTrials: 0
    }
  };
}

function createGuidedTriadBuildState(quality: 'major' | 'minor' = 'major') {
  const buildId = quality === 'major' ? TRIAD_ITEM_IDS.BUILD_MAJOR : TRIAD_ITEM_IDS.BUILD_MINOR;
  const progress: Record<string, LearningProgressRecord> = {
    [TRIAD_ITEM_IDS.ORIENTATION]: {
      ...createInitialLearningProgress(TRIAD_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    },
    [buildId]: {
      ...createInitialLearningProgress(buildId, 1000),
      state: 'introduced'
    }
  };
  return buildTriadStateForStep(
    quality === 'major' ? 'majorBuildGuided' : 'minorBuildGuided',
    progress,
    1000
  );
}

function createQualifyTriadBuildState() {
  const progress: Record<string, LearningProgressRecord> = {
    [TRIAD_ITEM_IDS.ORIENTATION]: {
      ...createInitialLearningProgress(TRIAD_ITEM_IDS.ORIENTATION, 1000),
      state: 'retention'
    },
    [TRIAD_ITEM_IDS.BUILD_MAJOR]: {
      ...createInitialLearningProgress(TRIAD_ITEM_IDS.BUILD_MAJOR, 1000),
      state: 'guided'
    }
  };
  return buildTriadStateForStep('majorBuildQualify', progress, 1000);
}

function createMajorIdentifyQualifyState() {
  const progress: Record<string, LearningProgressRecord> = {};
  for (const id of [
    TRIAD_ITEM_IDS.ORIENTATION,
    TRIAD_ITEM_IDS.BUILD_MAJOR,
    TRIAD_ITEM_IDS.BUILD_MINOR,
    TRIAD_ITEM_IDS.CONTRAST
  ]) {
    progress[id] = { ...createInitialLearningProgress(id, 1000), state: 'retention' };
  }
  progress[TRIAD_ITEM_IDS.IDENTIFY_MAJOR] = {
    ...createInitialLearningProgress(TRIAD_ITEM_IDS.IDENTIFY_MAJOR, 1000),
    state: 'guided'
  };
  return buildTriadStateForStep('majorIdentifyQualify', progress, 1000);
}

function createMajorIdentifyDelayedCheckState() {
  const progress: Record<string, LearningProgressRecord> = {};
  for (const id of [
    TRIAD_ITEM_IDS.ORIENTATION,
    TRIAD_ITEM_IDS.BUILD_MAJOR,
    TRIAD_ITEM_IDS.BUILD_MINOR,
    TRIAD_ITEM_IDS.CONTRAST
  ]) {
    progress[id] = { ...createInitialLearningProgress(id, 1000), state: 'retention' };
  }
  progress[TRIAD_ITEM_IDS.IDENTIFY_MAJOR] = {
    ...createInitialLearningProgress(TRIAD_ITEM_IDS.IDENTIFY_MAJOR, 1000),
    state: 'mixReady'
  };
  return buildTriadStateForStep('majorIdentifyDelayedCheck', progress, 1000);
}

function createMinorIdentifyQualifyState() {
  const progress: Record<string, LearningProgressRecord> = {};
  for (const id of [
    TRIAD_ITEM_IDS.ORIENTATION,
    TRIAD_ITEM_IDS.BUILD_MAJOR,
    TRIAD_ITEM_IDS.BUILD_MINOR,
    TRIAD_ITEM_IDS.CONTRAST,
    TRIAD_ITEM_IDS.IDENTIFY_MAJOR
  ]) {
    progress[id] = { ...createInitialLearningProgress(id, 1000), state: 'retention' };
  }
  progress[TRIAD_ITEM_IDS.IDENTIFY_MINOR] = {
    ...createInitialLearningProgress(TRIAD_ITEM_IDS.IDENTIFY_MINOR, 1000),
    state: 'guided'
  };
  return buildTriadStateForStep('minorIdentifyQualify', progress, 1000);
}

describe('Milestone 3H — Triads Unit Tests', () => {
  describe('1. Triad Definitions & Structural Relations', () => {
    it('defines major triad as root + M3 (4 semitones) + P5 (7 semitones)', () => {
      const def = TRIAD_DEFINITIONS.major;
      expect(def.rootToThird).toBe(4);
      expect(def.rootToFifth).toBe(7);
      expect(def.nameRu).toBe('Мажорное трезвучие');
    });

    it('defines minor triad as root + m3 (3 semitones) + P5 (7 semitones)', () => {
      const def = TRIAD_DEFINITIONS.minor;
      expect(def.rootToThird).toBe(3);
      expect(def.rootToFifth).toBe(7);
      expect(def.nameRu).toBe('Минорное трезвучие');
    });

    it('confirms key pedagogical insight: fifth is unchanged (7 semitones), only third shifts by 1 semitone', () => {
      expect(TRIAD_DEFINITIONS.major.rootToFifth).toBe(TRIAD_DEFINITIONS.minor.rootToFifth);
      expect(TRIAD_DEFINITIONS.major.rootToThird - TRIAD_DEFINITIONS.minor.rootToThird).toBe(1);
    });
  });

  describe('2. Pitch Resolution (resolveTriadPitches)', () => {
    it('resolves white-root triads: C major = C4 + E4 + G4', () => {
      const res = resolveTriadPitches('C4', 'major');
      expect(res.triadKeyIds).toEqual(['C4', 'E4', 'G4']);
      expect(res.thirdKeyId).toBe('E4');
      expect(res.fifthKeyId).toBe('G4');
    });

    it('resolves white-root triads: C minor = C4 + D#4(Eb4) + G4', () => {
      const res = resolveTriadPitches('C4', 'minor');
      expect(res.triadKeyIds).toEqual(['C4', 'D#4', 'G4']);
      expect(res.thirdKeyId).toBe('D#4');
      expect(res.fifthKeyId).toBe('G4');
    });

    it('resolves chromatic-root triads: F#3 major = F#3 + A#3 + C#4', () => {
      const res = resolveTriadPitches('F#3', 'major');
      expect(res.triadKeyIds).toEqual(['F#3', 'A#3', 'C#4']);
    });

    it('resolves chromatic-root triads: C#4 minor = C#4 + E4 + G#4', () => {
      const res = resolveTriadPitches('C#4', 'minor');
      expect(res.triadKeyIds).toEqual(['C#4', 'E4', 'G#4']);
    });

    it('provides valid root keys within playable keyboard range', () => {
      const roots = getValidTriadRoots();
      expect(roots).toContain('C4');
      expect(roots).toContain('A3');
      expect(roots).toContain('F#3');
      expect(roots.length).toBeGreaterThan(12);
    });
  });

  describe('3. Answer Classifier (classifyTriadAnswer)', () => {
    it('diagnoses correct root position major chord', () => {
      const result = classifyTriadAnswer('C4', 'major', ['C4', 'E4', 'G4']);
      expect(result.outcome).toBe('correct');
      expect(result.feedbackText).toContain('Верно');
    });

    it('diagnoses correct root position minor chord', () => {
      const result = classifyTriadAnswer('C4', 'minor', ['C4', 'D#4', 'G4']);
      expect(result.outcome).toBe('correct');
      expect(result.feedbackText).toContain('Верно');
    });

    it('constructively diagnoses 1st inversion as wrong_voicing (not punitive)', () => {
      // E4 G4 C5 has the right pitch classes (C, E, G), but root is not lowest
      const result = classifyTriadAnswer('C4', 'major', ['E4', 'G4', 'C5']);
      expect(result.outcome).toBe('wrong_voicing');
      expect(result.feedbackText).toContain('обращение');
      expect(result.feedbackText).toContain('основном положении');
    });

    it('constructively diagnoses 2nd inversion as wrong_voicing', () => {
      // G3 C4 E4 has right pitch classes, but 5th is bass
      const result = classifyTriadAnswer('C4', 'major', ['G3', 'C4', 'E4']);
      expect(result.outcome).toBe('wrong_voicing');
      expect(result.feedbackText).toContain('обращение');
    });

    it('diagnoses wrong_quality when major was played instead of minor', () => {
      // Requested C minor, played C major
      const result = classifyTriadAnswer('C4', 'minor', ['C4', 'E4', 'G4']);
      expect(result.outcome).toBe('wrong_quality');
      expect(result.feedbackText).toContain('мажор');
      expect(result.feedbackText).toContain('минор');
    });

    it('diagnoses wrong_quality when minor was played instead of major', () => {
      // Requested C major, played C minor
      const result = classifyTriadAnswer('C4', 'major', ['C4', 'D#4', 'G4']);
      expect(result.outcome).toBe('wrong_quality');
      expect(result.feedbackText).toContain('минор');
      expect(result.feedbackText).toContain('мажор');
    });

    it('diagnoses wrong_octave when correct chord is played in wrong octave', () => {
      // Target was C4 major, played C5 major
      const result = classifyTriadAnswer('C4', 'major', ['C5', 'E5', 'G5']);
      expect(result.outcome).toBe('wrong_octave');
      expect(result.feedbackText).toContain('октав');
    });

    it('diagnoses wrong_notes when wrong keys are played', () => {
      const result = classifyTriadAnswer('C4', 'major', ['C4', 'D4', 'F4']);
      expect(result.outcome).toBe('wrong_notes');
    });
  });

  describe('4. Chord Input Helpers & MIDI Tracker', () => {
    it('sortKeyIdsByPitch sorts keys by ascending MIDI pitch', () => {
      const unsorted = ['G4', 'C4', 'E4'];
      const sorted = sortKeyIdsByPitch(unsorted);
      expect(sorted).toEqual(['C4', 'E4', 'G4']);

      const crossOctave = ['C5', 'A3', 'E4'];
      expect(sortKeyIdsByPitch(crossOctave)).toEqual(['A3', 'E4', 'C5']);
    });

    it('toggleKeyInChordSelection adds keys up to 3 and removes existing', () => {
      let sel: string[] = [];
      sel = toggleKeyInChordSelection(sel, 'C4');
      expect(sel).toEqual(['C4']);

      sel = toggleKeyInChordSelection(sel, 'E4');
      expect(sel).toEqual(['C4', 'E4']);

      sel = toggleKeyInChordSelection(sel, 'G4');
      expect(sel).toEqual(['C4', 'E4', 'G4']);

      // 4th key is ignored since max is 3
      sel = toggleKeyInChordSelection(sel, 'B4');
      expect(sel).toEqual(['C4', 'E4', 'G4']);

      // Toggling existing key removes it
      sel = toggleKeyInChordSelection(sel, 'E4');
      expect(sel).toEqual(['C4', 'G4']);
    });

    it('areChordKeyIdsEqual tests order-independent equality', () => {
      expect(areChordKeyIdsEqual(['C4', 'E4', 'G4'], ['G4', 'C4', 'E4'])).toBe(true);
      expect(areChordKeyIdsEqual(['C4', 'E4', 'G4'], ['C4', 'D#4', 'G4'])).toBe(false);
      expect(areChordKeyIdsEqual(['C4', 'E4'], ['C4', 'E4', 'G4'])).toBe(false);
    });

    it('MidiChordTracker evaluates chord on 3 simultaneous keys and locks repeats until release', () => {
      const tracker = new MidiChordTracker(3);
      let chordReceived: string[] | null = null;

      tracker.handleNoteOn('C4', (keys) => { chordReceived = keys; });
      expect(chordReceived).toBeNull();
      expect(tracker.isLocked()).toBe(false);

      tracker.handleNoteOn('E4', (keys) => { chordReceived = keys; });
      expect(chordReceived).toBeNull();

      // Third note completes chord
      const triggered = tracker.handleNoteOn('G4', (keys) => { chordReceived = keys; });
      expect(triggered).toBe(true);
      expect(chordReceived).toEqual(['C4', 'E4', 'G4']);
      expect(tracker.isLocked()).toBe(true);

      // Subsequent key press does not re-trigger while locked
      let secondChord: string[] | null = null;
      tracker.handleNoteOn('B4', (keys) => { secondChord = keys; });
      expect(secondChord).toBeNull();

      // Release some keys
      tracker.handleNoteOff('C4');
      tracker.handleNoteOff('E4');
      expect(tracker.isLocked()).toBe(true); // Still locked until all notes released

      // Release last note
      tracker.handleNoteOff('G4');
      tracker.handleNoteOff('B4');
      expect(tracker.isLocked()).toBe(false); // Unlocked!
    });

    it('MidiChordTracker can count only the two notes missing from a guided triad', () => {
      const tracker = new MidiChordTracker(3);
      let chordReceived: string[] | null = null;
      const guidedOptions = { requiredNoteCount: 2, excludedFromCount: ['C4'] };

      tracker.handleNoteOn('E4', keys => { chordReceived = keys; }, guidedOptions);
      expect(chordReceived).toBeNull();
      expect(tracker.isLocked()).toBe(false);

      const triggered = tracker.handleNoteOn('G4', keys => { chordReceived = keys; }, guidedOptions);
      expect(triggered).toBe(true);
      expect(chordReceived).toEqual(['E4', 'G4']);

      const fullChordTracker = new MidiChordTracker(3);
      let fullChordReceived: string[] | null = null;
      fullChordTracker.handleNoteOn('C4', keys => { fullChordReceived = keys; }, guidedOptions);
      fullChordTracker.handleNoteOn('E4', keys => { fullChordReceived = keys; }, guidedOptions);
      fullChordTracker.handleNoteOn('G4', keys => { fullChordReceived = keys; }, guidedOptions);
      expect(fullChordReceived).toEqual(['C4', 'E4', 'G4']);
    });
  });

  describe('5. Prerequisite & Availability Gating', () => {
    it('is locked when 3G (Intervals) is not completed', () => {
      const emptyProgress = {};
      expect(isTriadModuleAvailable(emptyProgress)).toBe(false);
      expect(getTriadModuleStatus(emptyProgress)).toBe('not_started');
    });

    it('is unlocked when 3G (Intervals) is completed', () => {
      const progress = createMockIntervalCompletedProgress();
      // Bass grand also needs to be marked complete
      const bassRec = createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, 1000);
      progress[BASS_GRAND_ITEM_IDS.COMPLETE] = {
        ...markFsrsActivated(bassRec, 1000),
        state: 'retention'
      };
      expect(isTriadModuleAvailable(progress)).toBe(true);
      expect(getTriadModuleStatus(progress)).toBe('not_started');
    });

    it('detects in_progress status when user starts the module', () => {
      const progress = createMockIntervalCompletedProgress();
      progress[TRIAD_ITEM_IDS.ORIENTATION] = createInitialLearningProgress(TRIAD_ITEM_IDS.ORIENTATION, 1000);
      expect(getTriadModuleStatus(progress)).toBe('in_progress');
    });

    it('detects completed status when complete card is in retention', () => {
      const progress = createMockIntervalCompletedProgress();
      const comp = createInitialLearningProgress(TRIAD_ITEM_IDS.COMPLETE, 1000);
      progress[TRIAD_ITEM_IDS.COMPLETE] = {
        ...comp,
        state: 'retention'
      };
      expect(isTriadModuleComplete(progress)).toBe(true);
      expect(getTriadModuleStatus(progress)).toBe('completed');
    });
  });

  describe('6. Triad Curriculum State Machine', () => {
    it('initializes to triadOrientation when no progress exists', () => {
      const state = createTriadCurriculumState({});
      expect(state.step).toBe('triadOrientation');
      expect(state.activeSkill).toBe('none');
      expect(canUseDontKnowInTriadStep(state)).toBe(false);
    });

    it('advances from orientation to majorBuildModel', () => {
      const state = createTriadCurriculumState({});
      const res = applyTriadActionWithCards({
        state,
        action: { type: 'advanceStage' },
        now: 1000
      });
      expect(res.state.step).toBe('majorBuildModel');
      expect(res.state.activeSkill).toBe('triadBuild');
      expect(res.state.quality).toBe('major');
      expect(res.state.targetTriadKeyIds).toEqual(['C4', 'E4', 'G4']);
    });

    it('advances through Major Build stages: Model -> Guided -> Qualify -> LocalMix -> DelayedCheck', () => {
      let state = createTriadCurriculumState({});
      // Orientation -> Model
      state = applyTriadActionWithCards({ state, action: { type: 'advanceStage' }, now: 1000 }).state;
      expect(state.step).toBe('majorBuildModel');

      // Model -> Guided
      state = applyTriadActionWithCards({ state, action: { type: 'advanceStage' }, now: 1000 }).state;
      expect(state.step).toBe('majorBuildGuided');
      expect(state.structuralGuideKeyIds).toEqual([state.rootKeyId!]);
      expect(state.targetKeyIds).toEqual([]); // Target keys hidden in Guided!

      // Complete Guided with correct chord submission -> Qualify
      state = applyTriadActionWithCards({
        state,
        action: { type: 'submitChord', keyIds: ['C4', 'E4', 'G4'] },
        now: 1000
      }).state;
      expect(state.step).toBe('majorBuildQualify');

      // Qualify streak 2 -> LocalMix
      state = applyTriadActionWithCards({
        state,
        action: { type: 'submitChord', keyIds: ['C4', 'E4', 'G4'] },
        now: 1000
      }).state;
      state = applyTriadActionWithCards({
        state,
        action: { type: 'submitChord', keyIds: ['C4', 'E4', 'G4'] },
        now: 1000
      }).state;
      expect(state.step).toBe('majorBuildLocalMix');

      // Complete LocalMix streak -> DelayedCheck
      while (state.step === 'majorBuildLocalMix') {
        const root = state.rootKeyId || 'C4';
        const chord = resolveTriadPitches(root, 'major').triadKeyIds;
        state = applyTriadActionWithCards({
          state,
          action: { type: 'submitChord', keyIds: chord },
          now: 1000
        }).state;
      }
      expect(state.step).toBe('majorBuildDelayedCheck');
    });
  });

  describe('7. Delayed Check Remediation Lifecycle (FSRS Consistency)', () => {
    it('Wrong attempt triggers exactly 1 Again rating, sets awaitingCorrective, and does not duplicate FSRS on success', () => {
      const cardsMap = new Map<string, Card>();
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      cardsMap.set(card.id, card);

      // Start directly at Delayed Check
      const progress: Record<string, LearningProgressRecord> = {};
      const rec = createInitialLearningProgress(TRIAD_ITEM_IDS.BUILD_MAJOR, 1000);
      rec.state = 'retention';
      rec.contexts = [];
      progress[TRIAD_ITEM_IDS.BUILD_MAJOR] = rec;

      const state = buildTriadStateForStep('majorBuildDelayedCheck', progress, 1000);
      expect(state.step).toBe('majorBuildDelayedCheck');
      expect(canUseDontKnowInTriadStep(state)).toBe(true);

      // 1. Wrong attempt
      const wrongRes = applyTriadActionWithCards({
        state,
        action: { type: 'submitChord', keyIds: ['C4', 'D4', 'F4'] },
        cards: cardsMap,
        now: 1000
      });

      expect(wrongRes.outcome).toBe('wrong_notes');
      expect(wrongRes.state.awaitingCorrective).toBe(true);
      expect(wrongRes.attemptResult?.cardMutated).toBe(true);
      expect(wrongRes.attemptResult?.grade).toBe(1); // Again!

      // 2. Corrective attempt
      const correctiveRes = applyTriadActionWithCards({
        state: wrongRes.state,
        action: { type: 'submitChord', keyIds: wrongRes.state.targetTriadKeyIds },
        cards: cardsMap,
        now: 1000
      });

      expect(correctiveRes.outcome).toBe('correct');
      expect(correctiveRes.state.isInterveningRecall).toBe(true);
      // Strictly NO second FSRS mutation during corrective!
      expect(correctiveRes.attemptResult).toBeUndefined();

      // 3. Intervening recall success -> ready for fresh H0 retry
      const interveningRes = applyTriadActionWithCards({
        state: correctiveRes.state,
        action: { type: 'submitChord', keyIds: correctiveRes.state.targetTriadKeyIds },
        cards: cardsMap,
        now: 1000
      });
      expect(interveningRes.outcome).toBe('correct');
      expect(interveningRes.state.isInterveningRecall).toBe(false);
      expect(interveningRes.state.awaitingCorrective).toBe(false);

      // 4. Fresh H0 retry solved -> retention with 0 extra FSRS ratings
      const freshH0Res = applyTriadActionWithCards({
        state: interveningRes.state,
        action: { type: 'submitChord', keyIds: interveningRes.state.targetTriadKeyIds },
        cards: cardsMap,
        now: 1000
      });
      expect(freshH0Res.outcome).toBe('correct');
      expect(freshH0Res.updatedProgress[0].state).toBe('retention');
      // No extra FSRS rating on clean remediation completion!
      expect(freshH0Res.attemptResult).toBeUndefined();
    });

    it('Don’t Know on Delayed Check generates 0 FSRS rating and guides through corrective without penalty', () => {
      const cardsMap = new Map<string, Card>();
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      cardsMap.set(card.id, card);

      const progress: Record<string, LearningProgressRecord> = {};
      const rec = createInitialLearningProgress(TRIAD_ITEM_IDS.BUILD_MAJOR, 1000);
      rec.state = 'retention';
      rec.contexts = ['pending:delayedRetry'];
      progress[TRIAD_ITEM_IDS.BUILD_MAJOR] = rec;

      const state = buildTriadStateForStep('majorBuildDelayedCheck', progress, 1000);

      const dkRes = applyTriadActionWithCards({
        state,
        action: { type: 'dontKnow' },
        cards: cardsMap,
        now: 1000
      });

      expect(dkRes.outcome).toBe('dont_know');
      expect(dkRes.state.awaitingCorrective).toBe(true);
      // Strictly 0 FSRS mutation on Don't Know!
      expect(dkRes.attemptResult).toBeUndefined();
    });
  });

  describe('8. Transfer Gate Validation', () => {
    it('deterministic first 8 trials cover all 8 combinations (2 skills × 2 qualities × 2 root types)', () => {
      expect(TRIAD_TRANSFER_CYCLE.length).toBeGreaterThanOrEqual(8);
      const first8 = TRIAD_TRANSFER_CYCLE.slice(0, 8);

      const buildMajorWhite = first8.some(t => t.skill === 'triadBuild' && t.quality === 'major' && !t.isChromaticRoot);
      const buildMinorWhite = first8.some(t => t.skill === 'triadBuild' && t.quality === 'minor' && !t.isChromaticRoot);
      const identifyMajorWhite = first8.some(t => t.skill === 'triadIdentify' && t.quality === 'major' && !t.isChromaticRoot);
      const identifyMinorWhite = first8.some(t => t.skill === 'triadIdentify' && t.quality === 'minor' && !t.isChromaticRoot);

      const buildMajorChromatic = first8.some(t => t.skill === 'triadBuild' && t.quality === 'major' && t.isChromaticRoot);
      const buildMinorChromatic = first8.some(t => t.skill === 'triadBuild' && t.quality === 'minor' && t.isChromaticRoot);
      const identifyMajorChromatic = first8.some(t => t.skill === 'triadIdentify' && t.quality === 'major' && t.isChromaticRoot);
      const identifyMinorChromatic = first8.some(t => t.skill === 'triadIdentify' && t.quality === 'minor' && t.isChromaticRoot);

      expect(buildMajorWhite).toBe(true);
      expect(buildMinorWhite).toBe(true);
      expect(identifyMajorWhite).toBe(true);
      expect(identifyMinorWhite).toBe(true);
      expect(buildMajorChromatic).toBe(true);
      expect(buildMinorChromatic).toBe(true);
      expect(identifyMajorChromatic).toBe(true);
      expect(identifyMinorChromatic).toBe(true);
    });

    it('requires >= 12 trials and >= 80% accuracy to graduate from Transfer stage', () => {
      const progress: Record<string, LearningProgressRecord> = {};
      function markItemDone(id: string) {
        progress[id] = {
          ...createInitialLearningProgress(id, 1000),
          state: 'retention',
          contexts: []
        };
      }
      markItemDone(TRIAD_ITEM_IDS.ORIENTATION);
      markItemDone(TRIAD_ITEM_IDS.BUILD_MAJOR);
      markItemDone(TRIAD_ITEM_IDS.BUILD_MINOR);
      markItemDone(TRIAD_ITEM_IDS.CONTRAST);
      markItemDone(TRIAD_ITEM_IDS.IDENTIFY_MAJOR);
      markItemDone(TRIAD_ITEM_IDS.IDENTIFY_MINOR);
      const transferRec = createInitialLearningProgress(TRIAD_ITEM_IDS.TRANSFER, 1000);
      progress[TRIAD_ITEM_IDS.TRANSFER] = transferRec;

      let state = buildTriadStateForStep('triadTransfer', progress, 1000);
      expect(state.step).toBe('triadTransfer');

      // Run 12 trials with 100% accuracy
      for (let i = 0; i < 12; i++) {
        if (state.activeSkill === 'triadBuild') {
          const chord = resolveTriadPitches(state.rootKeyId!, state.quality!).triadKeyIds;
          state = applyTriadActionWithCards({
            state,
            action: { type: 'submitChord', keyIds: chord },
            now: 1000
          }).state;
        } else {
          state = applyTriadActionWithCards({
            state,
            action: { type: 'selectAnswer', quality: state.quality! },
            now: 1000
          }).state;
        }
      }

      // After 12 trials with 100% accuracy, graduates to moduleComplete
      expect(state.step).toBe('moduleComplete');
      expect(state.transferTrialsCompleted).toBe(12);
      expect(state.transferCorrectFirstAttempts).toBe(12);
    });
  });

  describe('9. Daily Practice & Card Visual Config Integration', () => {
    it('resolveCardVisualConfig for triadBuild keeps root visible as stimulus and hides chord keys', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const visual = resolveCardVisualConfig(card, { rootKeyId: 'C4' });

      expect(visual.structuralGuideKeyIds).toEqual(['C4']);
      expect(visual.targetKeyIds).toEqual([]); // Target is unlit!
      expect(visual.triadKeyIds).toEqual(['C4', 'E4', 'G4']);
    });

    it('resolveCardVisualConfig for triadIdentify lights all 3 chord keys as stimulus', () => {
      const card = createCard('triadIdentify:minor', 'triadIdentify', 'minor');
      const visual = resolveCardVisualConfig(card, { rootKeyId: 'C4' });

      expect(visual.targetKeyIds).toEqual(['C4', 'D#4', 'G4']);
      expect(visual.structuralGuideKeyIds).toEqual(['C4']);
    });

    it('repeated major contexts include >1 root across rotation', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const roots = new Set<string>();
      for (let trial = 0; trial < 6; trial++) {
        const visual = resolveCardVisualConfig(card, { sessionTrials: trial });
        roots.add(visual.rootKeyId!);
      }
      expect(roots.size).toBeGreaterThan(1);
    });

    it('CANONICAL_TRIAD_PRACTICE_ROOTS contains balanced roots and resolves deterministically', () => {
      expect(CANONICAL_TRIAD_PRACTICE_ROOTS.length).toBeGreaterThanOrEqual(8);
      expect(CANONICAL_TRIAD_PRACTICE_ROOTS).toContain('C4');
      expect(CANONICAL_TRIAD_PRACTICE_ROOTS).toContain('F#3');
      const root0 = resolveTriadPracticeRootKeyId('major', { contextIndex: 0 });
      expect(root0).toBe(CANONICAL_TRIAD_PRACTICE_ROOTS[0]);
      const rootChrom = resolveTriadPracticeRootKeyId('major', { contextIndex: 2 });
      expect(rootChrom).toBe('F#3');
    });

    it('chromatic root can appear in daily practice', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const visual = resolveCardVisualConfig(card, { contextIndex: 2 });
      expect(visual.rootKeyId).toBe('F#3');
      expect(visual.rootKeyId).toContain('#');
      expect(visual.structuralGuideKeyIds).toEqual(['F#3']);
      expect(visual.triadKeyIds).toEqual(['F#3', 'A#3', 'C#4']);
    });

    it('same card ID remains triadBuild:major regardless of root context', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const visual1 = resolveCardVisualConfig(card, { sessionTrials: 0 });
      const visual2 = resolveCardVisualConfig(card, { sessionTrials: 2 });
      expect(card.id).toBe('triadBuild:major');
      expect(card.note).toBe('major');
      expect(visual1.rootKeyId).not.toBe(visual2.rootKeyId);
    });

    it('target chord remains mathematically correct for chosen root', () => {
      const card = createCard('triadBuild:minor', 'triadBuild', 'minor');
      const visual = resolveCardVisualConfig(card, { rootKeyId: 'C#4' });
      expect(visual.rootKeyId).toBe('C#4');
      expect(visual.triadKeyIds).toEqual(['C#4', 'E4', 'G#4']);
    });

    it('isSemanticAnswerCorrect validates triadIdentify exact quality match', () => {
      expect(isSemanticAnswerCorrect('triadIdentify', 'major', 'major')).toBe(true);
      expect(isSemanticAnswerCorrect('triadIdentify', 'minor', 'minor')).toBe(true);
      expect(isSemanticAnswerCorrect('triadIdentify', 'major', 'minor')).toBe(false);
      expect(isSemanticAnswerCorrect('triadIdentify', 'minor', 'major')).toBe(false);
    });

    it('resolvePcKeyboardSemanticAnswer resolves digits 1/2 to major/minor for triadIdentify', () => {
      const e1 = { code: 'Digit1', key: '1', shiftKey: false };
      const e2 = { code: 'Digit2', key: '2', shiftKey: false };
      const eNumpad1 = { code: 'Numpad1', key: '1', shiftKey: false };

      expect(resolvePcKeyboardSemanticAnswer('triadIdentify', e1)?.answerNote).toBe('major');
      expect(resolvePcKeyboardSemanticAnswer('triadIdentify', e2)?.answerNote).toBe('minor');
      expect(resolvePcKeyboardSemanticAnswer('triadIdentify', eNumpad1)?.answerNote).toBe('major');
    });

    it('input policy defines exact octave requirement for triadBuild and answer button policy for triadIdentify', () => {
      expect(SKILL_INPUT_POLICY.triadBuild.pianoKey).toBe(true);
      expect(SKILL_INPUT_POLICY.triadBuild.midi).toBe(true);
      expect(SKILL_INPUT_POLICY.triadBuild.requiresExactOctave).toBe(true);

      expect(SKILL_INPUT_POLICY.triadIdentify.answerButton).toBe(true);
      expect(SKILL_INPUT_POLICY.triadIdentify.pcNote).toBe(false);
      expect(SKILL_INPUT_POLICY.triadIdentify.pianoKey).toBe(false);
    });

    it('resolveTriadKeydownAction routes Digit and Numpad 1/2 to canonical selectAnswer', () => {
      const identifyState = createTriadCurriculumState({});
      identifyState.activeSkill = 'triadIdentify';
      expect(resolveTriadKeydownAction(identifyState, '1', 'Digit1')).toEqual({ type: 'selectAnswer', quality: 'major' });
      expect(resolveTriadKeydownAction(identifyState, '2', 'Digit2')).toEqual({ type: 'selectAnswer', quality: 'minor' });
      expect(resolveTriadKeydownAction(identifyState, '1', 'Numpad1')).toEqual({ type: 'selectAnswer', quality: 'major' });
      expect(resolveTriadKeydownAction(identifyState, '2', 'Numpad2')).toEqual({ type: 'selectAnswer', quality: 'minor' });

      const buildState = createTriadCurriculumState({});
      buildState.step = 'majorBuildGuided';
      buildState.activeSkill = 'triadBuild';
      (buildState as any).selectedKeyIds = ['C4', 'E4', 'G4'];
      expect(resolveTriadKeydownAction(buildState, 'Enter', 'Enter')).toEqual({ type: 'submitChord' });
    });

    it('accepts the major answer once and advances Identify from Qualify to Delayed Check', () => {
      const state = createMajorIdentifyQualifyState();
      expect(state.step).toBe('majorIdentifyQualify');
      expect(state.targetKeyIds).toEqual(['C4', 'E4', 'G4']);

      const result = applyTriadActionWithCards({
        state,
        action: { type: 'selectAnswer', quality: 'major' },
        now: 2000
      });

      expect(result.outcome).toBe('correct');
      expect(result.state.step).toBe('majorIdentifyDelayedCheck');
      expect(result.state.feedbackText).toContain('Верно!');
      expect(result.state.feedbackTone).toBe('good');
      expect(result.updatedProgress).toHaveLength(1);
      expect(result.attemptResult).toBeUndefined();
    });

    it('accepts the Minor answer button for a minor Identify stimulus', () => {
      const state = createMinorIdentifyQualifyState();
      expect(state.targetKeyIds).toEqual(['C4', 'D#4', 'G4']);

      const result = applyTriadActionWithCards({
        state,
        action: { type: 'selectAnswer', quality: 'minor' },
        now: 2000
      });

      expect(result.outcome).toBe('correct');
      expect(result.state.step).toBe('minorIdentifyDelayedCheck');
      expect(result.state.feedbackText).toContain('Верно!');
      expect(result.state.feedbackTone).toBe('good');
      expect(result.updatedProgress).toHaveLength(1);
    });

    it('shows corrective feedback when Minor is selected for a major Identify stimulus', () => {
      const state = createMajorIdentifyQualifyState();
      const result = applyTriadActionWithCards({
        state,
        action: { type: 'selectAnswer', quality: 'minor' },
        now: 2000
      });

      expect(result.outcome).toBe('wrong_quality');
      expect(result.state.step).toBe('majorIdentifyQualify');
      expect(result.state.awaitingCorrective).toBe(true);
      expect(result.state.feedbackText).toContain('Неверно. Это Мажорное трезвучие');
      expect(result.updatedProgress).toHaveLength(0);
    });

    it('creates at most one ReviewLog event for one gradeable Identify answer', () => {
      const state = createMajorIdentifyDelayedCheckState();
      const card = createCard('triadIdentify:major', 'triadIdentify', 'major');
      const result = applyTriadActionWithCards({
        state,
        action: { type: 'selectAnswer', quality: 'major' },
        cards: new Map([[card.id, card]]),
        now: 2000
      });

      expect(result.outcome).toBe('correct');
      expect(result.attemptResult?.logEvent?.cardId).toBe(card.id);
      expect(result.attemptResult?.logEvent?.grade).toBeGreaterThanOrEqual(1);
      expect(result.attemptResult?.logEvent?.grade).toBeLessThanOrEqual(4);
      expect(result.updatedProgress).toHaveLength(1);
    });
  });

  describe('10. Daily Practice Scheduled Chord Grading (Pure Evaluator Regression)', () => {
    it('Daily triadBuild wrong_quality is incorrect and FSRS first attempt records Again (1)', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const result = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['C4', 'D#4', 'G4'], // minor played for major target
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1200
      });

      expect(result.isCorrect).toBe(false);
      expect(result.classification.outcome).toBe('wrong_quality');
      expect(result.attemptResult.isFirstAttempt).toBe(true);
      expect(result.attemptResult.logEvent?.grade).toBe(1);
      expect(result.attemptResult.logEvent?.firstCorrect).toBe(false);
      expect(result.attemptResult.cardMutated).toBe(true);
      expect(result.feedbackText).toContain('Получился C4 минор');
      expect(result.feedbackText).toContain('Первая попытка засчитана как ошибка');
      expect(result.shouldAdvance).toBe(false);
    });

    it('Daily triadBuild wrong_voicing is incorrect and constructively diagnoses inversion', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const result = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['E4', 'G4', 'C5'], // 1st inversion
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1400
      });

      expect(result.isCorrect).toBe(false);
      expect(result.classification.outcome).toBe('wrong_voicing');
      expect(result.attemptResult.isFirstAttempt).toBe(true);
      expect(result.attemptResult.logEvent?.grade).toBe(1);
      expect(result.feedbackText).toContain('обращение аккорда');
      expect(result.shouldAdvance).toBe(false);
    });

    it('Daily triadBuild wrong_notes is incorrect', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const result = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['C4', 'D4', 'G4'],
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1500
      });

      expect(result.isCorrect).toBe(false);
      expect(result.classification.outcome).toBe('wrong_notes');
      expect(result.attemptResult.logEvent?.grade).toBe(1);
      expect(result.shouldAdvance).toBe(false);
    });

    it('Daily triadBuild correct exact triad is correct and grades FSRS success', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      const result = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['C4', 'E4', 'G4'],
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1100
      });

      expect(result.isCorrect).toBe(true);
      expect(result.classification.outcome).toBe('correct');
      expect(result.attemptResult.isFirstAttempt).toBe(true);
      expect(result.attemptResult.logEvent?.firstCorrect).toBe(true);
      expect(result.attemptResult.logEvent?.grade).toBeGreaterThanOrEqual(2);
      expect(result.shouldAdvance).toBe(true);
    });

    it('chord-specific feedback survives on error and subsequent corrective does not rewrite first attempt', () => {
      const card = createCard('triadBuild:major', 'triadBuild', 'major');
      // Step 1: wrong quality on first attempt
      const step1 = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['C4', 'D#4', 'G4'],
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1600
      });
      expect(step1.feedbackText).toContain('Получился C4 минор');
      expect(step1.attemptResult.logEvent?.grade).toBe(1);

      // Step 2: corrected on second attempt
      const step2 = evaluateDailyChordAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        userKeyIds: ['C4', 'E4', 'G4'],
        firstResponseRecorded: step1.updatedState.firstResponseRecorded,
        attempts: step1.updatedState.attempts,
        hintUsed: step1.updatedState.hintUsed,
        responseMs: 800
      });
      expect(step2.isCorrect).toBe(true);
      expect(step2.attemptResult.isFirstAttempt).toBe(false);
      expect(step2.attemptResult.logEvent).toBeNull(); // No second FSRS event
      expect(step2.feedbackClass).toBe('warn');
      expect(step2.feedbackText).toContain('Исправлено (2-я попытка)');
      expect(step2.shouldAdvance).toBe(true);
    });
  });

  describe('11. Transfer Persistence & Completion Gate Regressions', () => {
    it('transfer wrong -> pending:triadTransferCorrective -> reload -> same trial + corrective', () => {
      const progress = createMockTriadPreTransferProgress();
      const state = buildTriadStateForStep('triadTransfer', progress);
      expect(state.step).toBe('triadTransfer');
      expect(state.transferTrialsCompleted).toBe(0);

      // Submit incorrect answer in transfer
      const action = state.activeSkill === 'triadBuild'
        ? { type: 'submitChord' as const, keyIds: ['C4', 'D4', 'G4'] }
        : { type: 'selectAnswer' as const, quality: state.quality === 'major' ? ('minor' as const) : ('major' as const) };

      const wrongResult = applyTriadActionWithCards({ state, action, now: 1000 });
      expect(wrongResult.state.awaitingCorrective).toBe(true);

      const transRec = wrongResult.state.progress[TRIAD_ITEM_IDS.TRANSFER];
      expect(transRec?.contexts).toContain('pending:triadTransferCorrective');

      // Simulate reload
      const reloadedState = buildTriadStateForStep('triadTransfer', wrongResult.state.progress);
      expect(reloadedState.awaitingCorrective).toBe(true);
      expect(reloadedState.rootKeyId).toBe(state.rootKeyId);
      expect(reloadedState.quality).toBe(state.quality);
      expect(reloadedState.activeSkill).toBe(state.activeSkill);
      expect(reloadedState.transferTrialsCompleted).toBe(0);
    });

    it('corrective after reload -> completed +1 -> firstAttemptCorrect unchanged', () => {
      const progress = createMockTriadPreTransferProgress();
      const state = buildTriadStateForStep('triadTransfer', progress);
      const actionWrong = state.activeSkill === 'triadBuild'
        ? { type: 'submitChord' as const, keyIds: ['C4', 'D4', 'G4'] }
        : { type: 'selectAnswer' as const, quality: state.quality === 'major' ? ('minor' as const) : ('major' as const) };
      const wrongResult = applyTriadActionWithCards({ state, action: actionWrong, now: 1000 });

      // Reload into corrective state
      const reloadedState = buildTriadStateForStep('triadTransfer', wrongResult.state.progress);
      expect(reloadedState.awaitingCorrective).toBe(true);

      // Corrective submission
      const actionCorrect = reloadedState.activeSkill === 'triadBuild'
        ? { type: 'submitChord' as const, keyIds: reloadedState.targetTriadKeyIds }
        : { type: 'selectAnswer' as const, quality: reloadedState.quality! };

      const correctResult = applyTriadActionWithCards({ state: reloadedState, action: actionCorrect, now: 1000 });
      expect(correctResult.state.transferTrialsCompleted).toBe(1);
      expect(correctResult.state.transferCorrectFirstAttempts).toBe(0); // firstAttemptCorrect unchanged!
      const updatedTransRec = correctResult.state.progress[TRIAD_ITEM_IDS.TRANSFER];
      expect(updatedTransRec?.contexts).not.toContain('pending:triadTransferCorrective');
    });

    it('repeated reload preserves corrective state', () => {
      const progress = createMockTriadPreTransferProgress();
      const state = buildTriadStateForStep('triadTransfer', progress);
      const actionWrong = state.activeSkill === 'triadBuild'
        ? { type: 'submitChord' as const, keyIds: ['C4', 'D4', 'G4'] }
        : { type: 'selectAnswer' as const, quality: state.quality === 'major' ? ('minor' as const) : ('major' as const) };
      const wrongResult = applyTriadActionWithCards({ state, action: actionWrong, now: 1000 });

      const reload1 = buildTriadStateForStep('triadTransfer', wrongResult.state.progress);
      expect(reload1.awaitingCorrective).toBe(true);

      const reload2 = buildTriadStateForStep('triadTransfer', reload1.progress);
      expect(reload2.awaitingCorrective).toBe(true);
      expect(reload2.rootKeyId).toBe(state.rootKeyId);
    });

    it('missing coverage prevents completion even if trials >= 12 and accuracy >= 80%', () => {
      const transRec: LearningProgressRecord = {
        id: TRIAD_ITEM_IDS.TRANSFER,
        itemId: TRIAD_ITEM_IDS.TRANSFER,
        state: 'guided',
        modelCompleted: true,
        guidedSuccesses: 12,
        independentUnhintedSuccesses: 12, // 100%
        currentHintLevel: 0,
        contexts: [
          'quality:major',
          'quality:minor',
          'skill:triadBuild',
          'skill:triadIdentify',
          'root:white'
          // missing 'root:chromatic' !
        ],
        updatedAt: 1000
      };

      expect(isTriadTransferGateSatisfied(transRec)).toBe(false);
      const progress = createMockTriadPreTransferProgress(transRec);
      expect(deriveTriadStep(progress)).toBe('triadTransfer');
    });

    it('<80% prevents completion even if trials >= 12 and full coverage is met', () => {
      const transRec: LearningProgressRecord = {
        id: TRIAD_ITEM_IDS.TRANSFER,
        itemId: TRIAD_ITEM_IDS.TRANSFER,
        state: 'guided',
        modelCompleted: true,
        guidedSuccesses: 12,
        independentUnhintedSuccesses: 9, // 9/12 = 75% < 80%
        currentHintLevel: 0,
        contexts: [
          'quality:major',
          'quality:minor',
          'skill:triadBuild',
          'skill:triadIdentify',
          'root:white',
          'root:chromatic'
        ],
        updatedAt: 1000
      };

      expect(isTriadTransferGateSatisfied(transRec)).toBe(false);
      const progress = createMockTriadPreTransferProgress(transRec);
      expect(deriveTriadStep(progress)).toBe('triadTransfer');
    });
  });
});

describe('Guided triad build with a supplied root', () => {
  it('screen piano treats C4 as fixed and submits the two added notes through the canonical evaluator', () => {
    let state = createGuidedTriadBuildState('major');
    expect(state.structuralGuideKeyIds).toEqual(['C4']);
    expect(state.selectedKeyIds).toEqual([]);

    state = applyTriadActionWithCards({ state, action: { type: 'toggleKey', keyId: 'C4' }, now: 2000 }).state;
    expect(state.selectedKeyIds).toEqual([]);
    state = applyTriadActionWithCards({ state, action: { type: 'toggleKey', keyId: 'E4' }, now: 2000 }).state;
    expect(state.selectedKeyIds).toEqual(['E4']);
    state = applyTriadActionWithCards({ state, action: { type: 'toggleKey', keyId: 'G4' }, now: 2000 }).state;
    expect(state.selectedKeyIds).toEqual(['E4', 'G4']);

    const submitted = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: state.selectedKeyIds },
      now: 2000
    });
    expect(submitted.outcome).toBe('correct');
    expect(submitted.state.step).toBe('majorBuildQualify');
    expect(submitted.state.feedbackTone).toBe('good');
  });

  it('guided minor accepts the two missing notes (D#4 is enharmonic to Eb4)', () => {
    const result = applyTriadActionWithCards({
      state: createGuidedTriadBuildState('minor'),
      action: { type: 'submitChord', keyIds: ['D#4', 'G4'] },
      now: 2000
    });
    expect(result.outcome).toBe('correct');
    expect(result.state.feedbackTone).toBe('good');
  });

  it('guided MIDI can submit the complete chord including the supplied root', () => {
    const result = applyTriadActionWithCards({
      state: createGuidedTriadBuildState('major'),
      action: { type: 'submitChord', keyIds: ['C4', 'E4', 'G4'] },
      now: 2000
    });
    expect(result.outcome).toBe('correct');
    expect(result.state.step).toBe('majorBuildQualify');
  });

  it('one missing note remains incomplete without FSRS mutation, while two wrong notes are diagnosed', () => {
    const state = createGuidedTriadBuildState('major');
    const incomplete = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: ['E4'] },
      now: 2000
    });
    expect(incomplete.outcome).toBeUndefined();
    expect(incomplete.updatedProgress).toEqual([]);
    expect(incomplete.mutatedCard).toBeUndefined();
    expect(incomplete.attemptResult).toBeUndefined();

    const wrong = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: ['E4', 'F4'] },
      now: 2000
    });
    expect(wrong.outcome).not.toBe('correct');
    expect(wrong.state.awaitingCorrective).toBe(true);
    expect(wrong.state.feedbackText).toContain('Опорная нота C4 уже дана');
  });

  it('qualify does not supply the root and still requires all three notes', () => {
    const state = createQualifyTriadBuildState();
    expect(state.structuralGuideKeyIds).toEqual(['C4']);
    expect(state.targetTriadKeyIds).toEqual(['C4', 'E4', 'G4']);

    const incomplete = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: ['E4', 'G4'] },
      now: 2000
    });
    expect(incomplete.outcome).toBeUndefined();
    expect(incomplete.state).toBe(state);

    const complete = applyTriadActionWithCards({
      state,
      action: { type: 'submitChord', keyIds: ['C4', 'E4', 'G4'] },
      now: 2000
    });
    expect(complete.outcome).toBe('correct');
    expect(complete.state.step).toBe('majorBuildQualify');
  });
});
