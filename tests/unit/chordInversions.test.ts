import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/core/fsrs/types';
import {
  buildTriadVoicing,
  classifyPlayedTriad,
  classifyTriadInversionAnswer,
  parseChordSymbol,
  formatChordSymbol,
  createInversionCurriculumState,
  applyInversionAction,
  canUseDontKnowInInversionStep,
  isInversionTransferGateSatisfied,
  INVERSION_TRANSFER_CYCLE,
  INVERSION_TRANSFER_RETRY_CYCLE,
  INVERSION_TRANSFER_BLOCK_TRIALS,
  INVERSION_TRANSFER_RETRY_TRIALS,
  INVERSION_TRANSFER_REQUIRED_ACCURACY,
  canInputInversionChord,
  canSelectInversionAnswer,
  resolveInversionKeydownAction,
  evaluateDailyInversionAttempt,
  isInversionModuleAvailable,
  isInversionModuleComplete,
  getInversionModuleStatus,
  INVERSION_ITEM_IDS,
  INVERSION_DEFINITIONS,
  CANONICAL_HARMONY_SEQUENCE,
  type InversionStep
} from '../../src/core/learning/chordInversions';
import { TRIAD_ITEM_IDS } from '../../src/core/learning/triads';
import { INTERVAL_ITEM_IDS } from '../../src/core/learning/intervals';
import { BASS_GRAND_ITEM_IDS } from '../../src/core/learning/bassGrandStaff';
import {
  createInitialLearningProgress,
  markFsrsActivated
} from '../../src/core/learning/progress';
import type { LearningProgressRecord } from '../../src/core/learning/types';

function createMockCompletedTriadsProgress(now = 1000): Record<string, LearningProgressRecord> {
  const map: Record<string, LearningProgressRecord> = {};

  // Bass grand staff complete
  const bassRec = createInitialLearningProgress(BASS_GRAND_ITEM_IDS.COMPLETE, now);
  map[BASS_GRAND_ITEM_IDS.COMPLETE] = {
    ...markFsrsActivated(bassRec, now),
    state: 'retention',
    contexts: []
  };

  // Intervals complete
  const intRec = createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, now);
  map[INTERVAL_ITEM_IDS.COMPLETE] = {
    ...markFsrsActivated(intRec, now),
    state: 'retention',
    contexts: []
  };

  // Triads complete
  const triadRec = createInitialLearningProgress(TRIAD_ITEM_IDS.COMPLETE, now);
  map[TRIAD_ITEM_IDS.COMPLETE] = {
    ...markFsrsActivated(triadRec, now),
    state: 'retention',
    contexts: []
  };

  return map;
}

function createInversionTransferReadyProgress(now = 1000): Record<string, LearningProgressRecord> {
  const progress = createMockCompletedTriadsProgress(now);
  const doneIds = [
    INVERSION_ITEM_IDS.ORIENTATION,
    INVERSION_ITEM_IDS.BUILD_FIRST,
    INVERSION_ITEM_IDS.BUILD_SECOND,
    INVERSION_ITEM_IDS.CONTRAST,
    INVERSION_ITEM_IDS.IDENTIFY,
    INVERSION_ITEM_IDS.CHORD_SYMBOLS,
    INVERSION_ITEM_IDS.BUILD_SLASH,
    INVERSION_ITEM_IDS.HARMONY_SEQUENCE
  ];
  for (const id of doneIds) {
    const rec = createInitialLearningProgress(id, now);
    progress[id] = {
      ...rec,
      state: 'retention',
      modelCompleted: true,
      independentUnhintedSuccesses: id === INVERSION_ITEM_IDS.HARMONY_SEQUENCE ? 4 : 1
    };
  }
  return progress;
}

function respondToTransfer(state: ReturnType<typeof createInversionCurriculumState>, answerCorrect = true) {
  if (state.activeSkill === 'triadInversionIdentify') {
    const inversion = answerCorrect
      ? state.inversion!
      : state.inversion === 'root' ? 'first' : 'root';
    return applyInversionAction(state, { type: 'selectAnswer', inversion });
  }
  return applyInversionAction(state, {
    type: 'submitChord',
    keyIds: answerCorrect ? state.expectedVoicingKeyIds : ['C2', 'C#2', 'D2']
  });
}

function createMockCard(id: string, skill: any, note: any = 'C'): Card {
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

describe('Milestone 3I — Chord Inversions & Lead-Sheet Harmony', () => {
  describe('Voicing Construction & Inversion Definitions', () => {
    it('builds C major voicings in root, 1st, and 2nd inversions correctly', () => {
      // Root position: C4 (root), E4 (third), G4 (fifth)
      const rootPos = buildTriadVoicing('C4', 'major', 'root');
      expect(rootPos.keyIds).toEqual(['C4', 'E4', 'G4']);
      expect(rootPos.bassKeyId).toBe('C4');
      expect(rootPos.bassPitchClass).toBe('C');

      // 1st inversion: E4 (third/bass), G4 (fifth), C5 (root)
      const firstInv = buildTriadVoicing('C4', 'major', 'first');
      expect(firstInv.keyIds).toEqual(['E4', 'G4', 'C5']);
      expect(firstInv.bassKeyId).toBe('E4');
      expect(firstInv.bassPitchClass).toBe('E');

      // 2nd inversion: G4 (fifth/bass), C5 (root), E5 (third)
      const secondInv = buildTriadVoicing('C4', 'major', 'second');
      expect(secondInv.keyIds).toEqual(['G4', 'C5', 'E5']);
      expect(secondInv.bassKeyId).toBe('G4');
      expect(secondInv.bassPitchClass).toBe('G');
    });

    it('builds A minor voicings in root, 1st, and 2nd inversions correctly', () => {
      // Root position: A3, C4, E4
      const rootPos = buildTriadVoicing('A3', 'minor', 'root');
      expect(rootPos.keyIds).toEqual(['A3', 'C4', 'E4']);
      expect(rootPos.bassKeyId).toBe('A3');

      // 1st inversion: C4, E4, A4
      const firstInv = buildTriadVoicing('A3', 'minor', 'first');
      expect(firstInv.keyIds).toEqual(['C4', 'E4', 'A4']);
      expect(firstInv.bassKeyId).toBe('C4');

      // 2nd inversion: E4, A4, C5
      const secondInv = buildTriadVoicing('A3', 'minor', 'second');
      expect(secondInv.keyIds).toEqual(['E4', 'A4', 'C5']);
      expect(secondInv.bassKeyId).toBe('E4');
    });

    it('builds G major 1st inversion (G/B) with B3 bass', () => {
      const gFirst = buildTriadVoicing('G3', 'major', 'first');
      expect(gFirst.keyIds).toEqual(['B3', 'D4', 'G4']);
      expect(gFirst.bassKeyId).toBe('B3');
      expect(gFirst.bassPitchClass).toBe('B');
    });

    it('defines pedagogical degree order and descriptions in Russian', () => {
      expect(INVERSION_DEFINITIONS.root.degreeOrder).toBe('1 – 3 – 5');
      expect(INVERSION_DEFINITIONS.first.degreeOrder).toBe('3 – 5 – 1');
      expect(INVERSION_DEFINITIONS.second.degreeOrder).toBe('5 – 1 – 3');
      expect(INVERSION_DEFINITIONS.first.bassDegree).toBe('3');
      expect(INVERSION_DEFINITIONS.second.bassDegree).toBe('5');
    });
  });

  describe('Played Triad Classifier', () => {
    it('classifies C major played in root, 1st, and 2nd inversions', () => {
      const rootClass = classifyPlayedTriad(['C4', 'E4', 'G4']);
      expect(rootClass.isValidTriad).toBe(true);
      expect(rootClass.root).toBe('C');
      expect(rootClass.quality).toBe('major');
      expect(rootClass.inversion).toBe('root');
      expect(rootClass.bassKeyId).toBe('C4');

      const firstClass = classifyPlayedTriad(['E4', 'G4', 'C5']);
      expect(firstClass.isValidTriad).toBe(true);
      expect(firstClass.root).toBe('C');
      expect(firstClass.quality).toBe('major');
      expect(firstClass.inversion).toBe('first');
      expect(firstClass.bassKeyId).toBe('E4');

      const secondClass = classifyPlayedTriad(['G4', 'C5', 'E5']);
      expect(secondClass.isValidTriad).toBe(true);
      expect(secondClass.root).toBe('C');
      expect(secondClass.quality).toBe('major');
      expect(secondClass.inversion).toBe('second');
      expect(secondClass.bassKeyId).toBe('G4');
    });

    it('classifies C minor played in root, 1st, and 2nd inversions', () => {
      const firstClass = classifyPlayedTriad(['D#4', 'G4', 'C5']);
      expect(firstClass.isValidTriad).toBe(true);
      expect(firstClass.root).toBe('C');
      expect(firstClass.quality).toBe('minor');
      expect(firstClass.inversion).toBe('first');
    });

    it('rejects incomplete note groups or non-triad combinations', () => {
      expect(classifyPlayedTriad(['C4', 'E4']).isValidTriad).toBe(false);
      expect(classifyPlayedTriad(['C4', 'D4', 'E4']).isValidTriad).toBe(false);
      expect(classifyPlayedTriad(['C4', 'E4', 'G4', 'B4']).isValidTriad).toBe(false);
    });
  });

  describe('Triad Inversion Answer Diagnostics', () => {
    it('detects correct inversion response', () => {
      const res = classifyTriadInversionAnswer(
        ['E4', 'G4', 'C5'],
        'C4',
        'major',
        'first'
      );
      expect(res.outcome).toBe('correct');
      expect(res.feedbackText).toContain('Верно');
    });

    it('diagnoses wrong_inversion when root position is played instead of 1st inversion', () => {
      const res = classifyTriadInversionAnswer(
        ['C4', 'E4', 'G4'],
        'C4',
        'major',
        'first'
      );
      expect(res.outcome).toBe('wrong_inversion');
      expect(res.feedbackText).toContain('в основном положении');
      expect(res.feedbackText).toContain('терция');
    });

    it('diagnoses wrong_inversion when 1st inversion is played instead of 2nd inversion', () => {
      const res = classifyTriadInversionAnswer(
        ['E4', 'G4', 'C5'],
        'C4',
        'major',
        'second'
      );
      expect(res.outcome).toBe('wrong_inversion');
      expect(res.feedbackText).toContain('первое обращение');
      expect(res.feedbackText).toContain('квинта');
    });

    it('diagnoses wrong_quality when minor is played instead of major', () => {
      const res = classifyTriadInversionAnswer(
        ['D#4', 'G4', 'C5'],
        'C4',
        'major',
        'first'
      );
      expect(res.outcome).toBe('wrong_quality');
      expect(res.feedbackText).toContain('C минор');
      expect(res.feedbackText).toContain('терция должна быть на полутон выше');
    });

    it('diagnoses wrong_bass for slash chord with specific bass note mention', () => {
      // User played G/D (second inversion) when G/B (first inversion) was requested
      const res = classifyTriadInversionAnswer(
        ['D4', 'G4', 'B4'],
        'G3',
        'major',
        'first',
        ['B3', 'D4', 'G4'],
        'G/B'
      );
      expect(res.outcome).toBe('wrong_bass');
      expect(res.feedbackText).toContain('в басу должна быть B');
    });

    it('diagnoses wrong_octave when correct pitch classes and inversion are played in wrong octave', () => {
      const res = classifyTriadInversionAnswer(
        ['E5', 'G5', 'C6'],
        'C4',
        'major',
        'first',
        ['E4', 'G4', 'C5']
      );
      expect(res.outcome).toBe('wrong_octave');
      expect(res.feedbackText).toContain('расположение по октавам отличается');
      expect(res.feedbackText).toContain('Нужное расположение');
    });

    it('diagnoses incomplete_chord and extra_notes', () => {
      const tooFew = classifyTriadInversionAnswer(['C4', 'E4'], 'C4', 'major', 'first');
      expect(tooFew.outcome).toBe('incomplete_chord');

      const tooMany = classifyTriadInversionAnswer(['C4', 'E4', 'G4', 'C5'], 'C4', 'major', 'first');
      expect(tooMany.outcome).toBe('extra_notes');
    });
  });

  describe('Chord Symbols & Lead-Sheet Notation', () => {
    it('parses basic root triads: C and Cm', () => {
      const cMajor = parseChordSymbol('C');
      expect(cMajor).not.toBeNull();
      expect(cMajor?.root).toBe('C');
      expect(cMajor?.quality).toBe('major');
      expect(cMajor?.inversion).toBe('root');
      expect(cMajor?.isSlash).toBe(false);

      const cMinor = parseChordSymbol('Cm');
      expect(cMinor).not.toBeNull();
      expect(cMinor?.root).toBe('C');
      expect(cMinor?.quality).toBe('minor');
      expect(cMinor?.inversion).toBe('root');
    });

    it('parses the supported major/minor and slash symbols used by this module', () => {
      for (const symbol of ['C', 'Cm', 'C/E', 'C/G', 'G/B', 'G/D', 'Am/C', 'Am/E', 'F/A', 'F/C']) {
        const parsed = parseChordSymbol(symbol);
        expect(parsed?.isSupported, `${symbol} should be supported`).toBe(true);
      }

      const gb = parseChordSymbol('G/B');
      expect(gb).not.toBeNull();
      expect(gb?.root).toBe('G');
      expect(gb?.quality).toBe('major');
      expect(gb?.bass).toBe('B');
      expect(gb?.inversion).toBe('first');
      expect(gb?.isTriadInversion).toBe(true);

      const ce = parseChordSymbol('C/E');
      expect(ce?.root).toBe('C');
      expect(ce?.inversion).toBe('first');

      const cg = parseChordSymbol('C/G');
      expect(cg?.root).toBe('C');
      expect(cg?.inversion).toBe('second');

      const amc = parseChordSymbol('Am/C');
      expect(amc?.root).toBe('A');
      expect(amc?.quality).toBe('minor');
      expect(amc?.inversion).toBe('first');

      const ame = parseChordSymbol('Am/E');
      expect(ame?.root).toBe('A');
      expect(ame?.quality).toBe('minor');
      expect(ame?.inversion).toBe('second');
    });

    it('identifies unsupported/non-triad bass tones like C/F#', () => {
      const nonTriad = parseChordSymbol('C/F#');
      expect(nonTriad).not.toBeNull();
      expect(nonTriad?.isTriadInversion).toBe(false);
      expect(nonTriad?.isSupported).toBe(false);
      expect(parseChordSymbol('C/')).toBeNull();
      expect(parseChordSymbol('G/B/D')).toBeNull();
    });

    it('formats chord symbols cleanly', () => {
      expect(formatChordSymbol('C', 'major', 'root')).toBe('C');
      expect(formatChordSymbol('C', 'minor', 'root')).toBe('Cm');
      expect(formatChordSymbol('G', 'major', 'first')).toBe('G/B');
      expect(formatChordSymbol('C', 'major', 'second')).toBe('C/G');
      expect(formatChordSymbol('A', 'minor', 'first')).toBe('Am/C');
    });

    it('verifies the 4-step canonical harmony sequence (C -> G/B -> Am -> F)', () => {
      expect(CANONICAL_HARMONY_SEQUENCE).toHaveLength(4);
      expect(CANONICAL_HARMONY_SEQUENCE[0].symbol).toBe('C');
      expect(CANONICAL_HARMONY_SEQUENCE[0].voicing).toEqual(['C4', 'E4', 'G4']);

      expect(CANONICAL_HARMONY_SEQUENCE[1].symbol).toBe('G/B');
      expect(CANONICAL_HARMONY_SEQUENCE[1].voicing).toEqual(['B3', 'D4', 'G4']);
      expect(CANONICAL_HARMONY_SEQUENCE[1].bassKeyId).toBe('B3');

      expect(CANONICAL_HARMONY_SEQUENCE[2].symbol).toBe('Am');
      expect(CANONICAL_HARMONY_SEQUENCE[2].voicing).toEqual(['A3', 'C4', 'E4']);
      expect(CANONICAL_HARMONY_SEQUENCE[2].bassKeyId).toBe('A3');

      expect(CANONICAL_HARMONY_SEQUENCE[3].symbol).toBe('F');
      expect(CANONICAL_HARMONY_SEQUENCE[3].voicing).toEqual(['F3', 'A3', 'C4']);
      expect(CANONICAL_HARMONY_SEQUENCE[3].bassKeyId).toBe('F3');
    });
  });

  describe('Curriculum State Machine & Step Navigation', () => {
    it('initializes curriculum state at orientation step', () => {
      const state = createInversionCurriculumState();
      expect(state.step).toBe('inversionOrientation');
      expect(state.selectedKeyIds).toEqual([]);
      expect(state.awaitingCorrective).toBe(false);
    });

    it('navigates orientation -> firstInversionModel -> firstInversionGuided', () => {
      const state0 = createInversionCurriculumState();
      const res1 = applyInversionAction(state0, { type: 'advanceStage' });
      expect(res1.state.step).toBe('firstInversionModel');

      const res2 = applyInversionAction(res1.state, { type: 'advanceStage' });
      expect(res2.state.step).toBe('firstInversionGuided');
    });

    it('allows Don’t Know during qualify and delayed check steps, but not in model', () => {
      const makeState = (step: InversionStep, awaitingCorrective = false) => ({
        ...createInversionCurriculumState(),
        step,
        awaitingCorrective
      });

      expect(canUseDontKnowInInversionStep(makeState('firstInversionModel'))).toBe(false);
      expect(canUseDontKnowInInversionStep(makeState('secondInversionModel'))).toBe(false);
      expect(canUseDontKnowInInversionStep(makeState('inversionOrientation'))).toBe(false);

      expect(canUseDontKnowInInversionStep(makeState('firstInversionQualify'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('firstInversionDelayedCheck'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('secondInversionQualify'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('secondInversionDelayedCheck'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('inversionIdentifyQualify'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('inversionIdentifyDelayedCheck'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('slashChordDelayedCheck'))).toBe(true);
      expect(canUseDontKnowInInversionStep(makeState('inversionTransfer'))).toBe(true);

      // Disabled if already awaiting corrective
      expect(canUseDontKnowInInversionStep(makeState('firstInversionDelayedCheck', true))).toBe(false);
    });

    it('enters corrective remediation on wrong delayed check answer and requires remediation', () => {
      let state = createInversionCurriculumState();
      state.step = 'firstInversionDelayedCheck';
      state.activeSkill = 'triadInversionBuild';
      state.rootKeyId = 'C4';
      state.quality = 'major';
      state.inversion = 'first';
      state.expectedVoicingKeyIds = ['E4', 'G4', 'C5'];
      state.targetKeyIds = ['E4', 'G4', 'C5'];

      // Submit incorrect chord (root position instead of first inversion)
      state.selectedKeyIds = ['C4', 'E4', 'G4'];
      const res = applyInversionAction(state, { type: 'submitChord' });

      expect(res.state.awaitingCorrective).toBe(true);
      expect(res.state.feedbackTone).toBe('bad');
      expect(res.state.step).toBe('firstInversionDelayedCheck'); // Remains on step for remediation

      // Remediation: submit correct chord
      const remediatingState = {
        ...res.state,
        selectedKeyIds: ['E4', 'G4', 'C5']
      };
      const res2 = applyInversionAction(remediatingState, { type: 'submitChord' });
      expect(res2.outcome).toBe('correct');
      expect(res2.state.awaitingCorrective).toBe(false);
      expect(res2.state.isInterveningRecall).toBe(true);
    });
  });

  describe('Interaction contracts', () => {
    it('does not advertise or accept chord input while the inversion example is still on screen', () => {
      const model = {
        ...createInversionCurriculumState(),
        step: 'firstInversionModel' as const,
        activeSkill: 'triadInversionBuild' as const
      };
      expect(canInputInversionChord(model)).toBe(false);
      expect(applyInversionAction(model, { type: 'toggleKey', keyId: 'E4' }).state.selectedKeyIds).toEqual([]);
      const rejected = applyInversionAction(model, { type: 'submitChord', keyIds: ['E4', 'G4', 'C5'] });
      expect(rejected.updatedProgress).toEqual([]);
      expect(rejected.state.feedbackText).toContain('пример');
    });

    it('only routes Identify answer controls and digits on answer stages', () => {
      const model = {
        ...createInversionCurriculumState(),
        step: 'inversionIdentifyModel' as const,
        activeSkill: 'triadInversionIdentify' as const
      };
      expect(canSelectInversionAnswer(model)).toBe(false);
      expect(resolveInversionKeydownAction(model, '1', 'Digit1')).toBeNull();
      expect(applyInversionAction(model, { type: 'selectAnswer', inversion: 'root' }).state.feedbackText).toContain('пример');

      const answer = { ...model, step: 'inversionIdentifyQualify' as const };
      expect(canSelectInversionAnswer(answer)).toBe(true);
      expect(resolveInversionKeydownAction(answer, '1', 'Digit1')).toEqual({ type: 'selectAnswer', inversion: 'root' });
      expect(resolveInversionKeydownAction(answer, '2', 'Numpad2')).toEqual({ type: 'selectAnswer', inversion: 'first' });
      expect(resolveInversionKeydownAction(answer, '3', 'Digit3')).toEqual({ type: 'selectAnswer', inversion: 'second' });
    });

    it('keeps incomplete MIDI/screen chord input out of transfer scoring', () => {
      const state = createInversionCurriculumState(createInversionTransferReadyProgress());
      const result = applyInversionAction(state, { type: 'submitChord', keyIds: ['C4', 'E4'] });
      expect(result.outcome).toBe('incomplete_chord');
      expect(result.updatedProgress).toEqual([]);
      expect(result.state.transferTrialsCompleted).toBe(0);
      expect(result.state.feedbackText).toContain('из трёх нот');
    });
  });

  describe('Transfer Gate Requirements', () => {
    it('covers every required category inside each deterministic bounded block', () => {
      const required = [
        'quality:major', 'quality:minor', 'inversion:first', 'inversion:second',
        'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
        'symbol:normal', 'symbol:slash', 'root:chromatic'
      ];
      for (const cycle of [INVERSION_TRANSFER_CYCLE, INVERSION_TRANSFER_RETRY_CYCLE]) {
        const tags = new Set(cycle.flatMap((item) => [
          `quality:${item.quality}`,
          `inversion:${item.inversion}`,
          `skill:${item.skill}`,
          item.symbol.includes('/') ? 'symbol:slash' : 'symbol:normal',
          item.isChromaticRoot ? 'root:chromatic' : 'root:white'
        ]));
        expect(required.every((tag) => tags.has(tag))).toBe(true);
      }
      expect(INVERSION_TRANSFER_CYCLE).toHaveLength(INVERSION_TRANSFER_BLOCK_TRIALS);
      expect(INVERSION_TRANSFER_RETRY_CYCLE).toHaveLength(INVERSION_TRANSFER_RETRY_TRIALS);
    });

    it('stops a failed 16-trial first-attempt block, teaches failed items, then starts a fresh 8-trial retry', () => {
      let state = createInversionCurriculumState(createInversionTransferReadyProgress());
      expect(state.step).toBe('inversionTransfer');
      expect(state.transferBlockSize).toBe(16);

      for (let index = 0; index < INVERSION_TRANSFER_BLOCK_TRIALS; index++) {
        const shouldAnswerCorrectly = index >= 4;
        const firstAttempt = respondToTransfer(state, shouldAnswerCorrectly);
        if (shouldAnswerCorrectly) {
          state = firstAttempt.state;
          continue;
        }
        expect(firstAttempt.state.transferTrialsCompleted).toBe(index + 1);
        expect(firstAttempt.state.transferCorrectFirstAttempts).toBe(0);
        const storedAfterFirstAnswer = firstAttempt.state.progress[INVERSION_ITEM_IDS.TRANSFER];
        const corrective = respondToTransfer(firstAttempt.state, true);
        state = corrective.state;
        expect(state.progress[INVERSION_ITEM_IDS.TRANSFER].transferAssessment?.trialsCompleted).toBe(index + 1);
        expect(state.progress[INVERSION_ITEM_IDS.TRANSFER].transferAssessment?.correctFirstAttempts).toBe(0);
        expect(state.progress[INVERSION_ITEM_IDS.TRANSFER].transferLifetimeTrials).toBe(storedAfterFirstAnswer.transferLifetimeTrials);
      }

      expect(state.step).toBe('inversionTransferResult');
      expect(state.transferTrialsCompleted).toBe(16);
      expect(state.transferCorrectFirstAttempts / state.transferTrialsCompleted).toBeLessThan(INVERSION_TRANSFER_REQUIRED_ACCURACY);

      state = applyInversionAction(state, { type: 'advanceStage' }).state;
      expect(state.step).toBe('inversionTransferRemediation');
      const remediationCount = state.transferRemediationTrialIndexes.length;
      expect(remediationCount).toBeGreaterThan(0);
      for (let index = 0; index < remediationCount; index++) {
        state = respondToTransfer(state, true).state;
      }
      expect(state.step).toBe('inversionTransfer');
      expect(state.transferBlockKind).toBe('retry');
      expect(state.transferBlockNumber).toBe(2);
      expect(state.transferBlockSize).toBe(INVERSION_TRANSFER_RETRY_TRIALS);
      expect(state.transferTrialsCompleted).toBe(0);

      for (let index = 0; index < INVERSION_TRANSFER_RETRY_TRIALS; index++) {
        const firstAttempt = respondToTransfer(state, index < 6);
        if (index < 6) state = firstAttempt.state;
        else state = respondToTransfer(firstAttempt.state, true).state;
      }
      expect(state.step).toBe('inversionTransferResult');
      expect(state.transferTrialsCompleted).toBe(8);
    });

    it('passes at 13/16 first answers and restores completion after reloading progress', () => {
      let state = createInversionCurriculumState(createInversionTransferReadyProgress());
      for (let index = 0; index < INVERSION_TRANSFER_BLOCK_TRIALS; index++) {
        if (index < 3) {
          const failed = respondToTransfer(state, false);
          state = respondToTransfer(failed.state, true).state;
        } else {
          state = respondToTransfer(state, true).state;
        }
      }
      expect(state.step).toBe('moduleComplete');
      expect(state.transferTrialsCompleted).toBe(16);
      expect(state.transferCorrectFirstAttempts).toBe(13);
      expect(isInversionTransferGateSatisfied(state.progress[INVERSION_ITEM_IDS.TRANSFER])).toBe(true);
      const reloaded = createInversionCurriculumState(state.progress);
      expect(reloaded.step).toBe('moduleComplete');
      expect(isInversionModuleComplete(reloaded.progress)).toBe(true);
    });

    it('converts an overlong legacy failed run into a result instead of task 17 of 16', () => {
      const progress = createInversionTransferReadyProgress();
      progress[INVERSION_ITEM_IDS.TRANSFER] = {
        ...createInitialLearningProgress(INVERSION_ITEM_IDS.TRANSFER),
        guidedSuccesses: 18,
        independentUnhintedSuccesses: 13,
        contexts: [
          'quality:major', 'quality:minor', 'inversion:first', 'inversion:second',
          'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
          'symbol:normal', 'symbol:slash', 'root:chromatic'
        ]
      };
      const state = createInversionCurriculumState(progress);
      expect(state.step).toBe('inversionTransferResult');
      expect(state.transferTrialsCompleted).toBe(18);
    });

    it('rejects transfer gate if trial count is below 16', () => {
      const rec: LearningProgressRecord = {
        id: INVERSION_ITEM_IDS.TRANSFER,
        state: 'learning',
        guidedSuccesses: 15,
        independentUnhintedSuccesses: 15,
        contexts: [
          'quality:major', 'quality:minor',
          'inversion:first', 'inversion:second',
          'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
          'symbol:normal', 'symbol:slash', 'root:chromatic'
        ]
      } as any;

      expect(isInversionTransferGateSatisfied(rec)).toBe(false);
    });

    it('rejects transfer gate if accuracy is below 80%', () => {
      const rec: LearningProgressRecord = {
        id: INVERSION_ITEM_IDS.TRANSFER,
        state: 'learning',
        guidedSuccesses: 20,
        independentUnhintedSuccesses: 15, // 15 / 20 = 75% < 80%
        contexts: [
          'quality:major', 'quality:minor',
          'inversion:first', 'inversion:second',
          'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
          'symbol:normal', 'symbol:slash', 'root:chromatic'
        ]
      } as any;

      expect(isInversionTransferGateSatisfied(rec)).toBe(false);
    });

    it('satisfies transfer gate when trials >= 16, accuracy >= 80%, and full coverage met', () => {
      const rec: LearningProgressRecord = {
        id: INVERSION_ITEM_IDS.TRANSFER,
        state: 'learning',
        guidedSuccesses: 16,
        independentUnhintedSuccesses: 14, // 14 / 16 = 87.5% >= 80%
        contexts: [
          'quality:major', 'quality:minor',
          'inversion:first', 'inversion:second',
          'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
          'symbol:normal', 'symbol:slash', 'root:chromatic'
        ]
      } as any;

      expect(isInversionTransferGateSatisfied(rec)).toBe(true);
    });
  });

  describe('Daily Practice Evaluator Safety', () => {
    it('prevents false single-note root match from marking chord attempt correct', () => {
      const card = createMockCard('c1', 'triadInversionBuild', 'first');
      const result = evaluateDailyInversionAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        inversion: 'first',
        expectedKeyIds: ['E4', 'G4', 'C5'],
        userKeyIds: ['C4', 'E4', 'G4'], // Root position played instead of 1st inversion
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 2500
      });

      expect(result.isCorrect).toBe(false);
      expect(result.classification.outcome).toBe('wrong_inversion');
      expect(result.shouldAdvance).toBe(false);
      expect(result.attemptResult.logEvent?.grade).toBe(1); // FSRS recorded failure (Again)
    });

    it('correctly passes on accurate multi-key inversion chord attempt', () => {
      const card = createMockCard('c1', 'triadInversionBuild', 'first');
      const result = evaluateDailyInversionAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'C4',
        quality: 'major',
        inversion: 'first',
        expectedKeyIds: ['E4', 'G4', 'C5'],
        userKeyIds: ['E4', 'G4', 'C5'],
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 1800
      });

      expect(result.isCorrect).toBe(true);
      expect(result.classification.outcome).toBe('correct');
      expect(result.shouldAdvance).toBe(true);
      expect(result.feedbackClass).toBe('good');
    });

    it('gives slash-bass feedback on a scheduled wrong-bass response and logs only the first attempt', () => {
      const card = createMockCard('chordSymbolRead:slash', 'chordSymbolRead', 'slash');
      const wrongFirst = evaluateDailyInversionAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'G3',
        quality: 'major',
        inversion: 'first',
        expectedKeyIds: ['B3', 'D4', 'G4'],
        targetSymbol: 'G/B',
        userKeyIds: ['D4', 'G4', 'B4'],
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        responseMs: 900
      });
      expect(wrongFirst.isCorrect).toBe(false);
      expect(wrongFirst.classification.outcome).toBe('wrong_bass');
      expect(wrongFirst.feedbackText).toContain('в басу должна быть B');
      expect(wrongFirst.attemptResult.logEvent?.grade).toBe(1);
      expect(wrongFirst.attemptResult.logEvent?.answerKeyId).toBe('D4+G4+B4');

      const correction = evaluateDailyInversionAttempt({
        card,
        kind: 'scheduled',
        rootKeyId: 'G3',
        quality: 'major',
        inversion: 'first',
        expectedKeyIds: ['B3', 'D4', 'G4'],
        targetSymbol: 'G/B',
        userKeyIds: ['B3', 'D4', 'G4'],
        firstResponseRecorded: true,
        attempts: 1,
        hintUsed: false,
        responseMs: 0
      });
      expect(correction.isCorrect).toBe(true);
      expect(correction.feedbackText).toContain('первая ошибка');
      expect(correction.attemptResult.logEvent).toBeNull();
    });
  });

  describe('Module Availability & Status', () => {
    it('is locked if prerequisites (triads, intervals, bass) are not complete', () => {
      expect(isInversionModuleAvailable()).toBe(false);
      expect(isInversionModuleAvailable({})).toBe(false);

      const partialProgress: Record<string, LearningProgressRecord> = {};
      const intRec = createInitialLearningProgress(INTERVAL_ITEM_IDS.COMPLETE, 1000);
      partialProgress[INTERVAL_ITEM_IDS.COMPLETE] = {
        ...markFsrsActivated(intRec, 1000),
        state: 'retention',
        contexts: []
      };

      expect(isInversionModuleAvailable(partialProgress)).toBe(false);
    });

    it('is available when bass, intervals, and triads modules are all complete', () => {
      const completePrereqs = createMockCompletedTriadsProgress();
      expect(isInversionModuleAvailable(completePrereqs)).toBe(true);
    });

    it('reports not_started, in_progress, and completed statuses accurately', () => {
      const completePrereqs = createMockCompletedTriadsProgress();
      expect(getInversionModuleStatus(completePrereqs)).toBe('not_started');

      // Start inversion module
      completePrereqs[INVERSION_ITEM_IDS.ORIENTATION] = createInitialLearningProgress(
        INVERSION_ITEM_IDS.ORIENTATION,
        1000
      );
      expect(getInversionModuleStatus(completePrereqs)).toBe('in_progress');

      // Complete inversion module
      const compRec = createInitialLearningProgress(INVERSION_ITEM_IDS.COMPLETE, 1000);
      completePrereqs[INVERSION_ITEM_IDS.COMPLETE] = {
        ...markFsrsActivated(compRec, 1000),
        state: 'retention',
        contexts: []
      };
      expect(getInversionModuleStatus(completePrereqs)).toBe('completed');
      expect(isInversionModuleComplete(completePrereqs)).toBe(true);
    });
  });
});
