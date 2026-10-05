import { describe, expect, it } from 'vitest';
import {
  classifyRhythmChord,
  classifyRhythmTiming,
  createChordRhythmModuleState,
  createRhythmAssessment,
  isRhythmTimingWindowOpen,
  reduceChordRhythmState,
  rhythmRunPhase,
  type ChordRhythmModuleState,
  type RhythmChordInputNote
} from '../../src/core/learning/chordRhythm';

const notes = (...keyIds: string[]): RhythmChordInputNote[] => keyIds.map(keyId => ({ keyId }));
const midiNotes = (...midi: number[]): RhythmChordInputNote[] => midi.map(value => ({ midi: value }));

describe('M3K chord semantics — plain chords are chord identity (octave- and inversion-independent)', () => {
  it('accepts C major in any register', () => {
    for (const voicing of [
      notes('C3', 'E3', 'G3'),
      notes('C4', 'E4', 'G4'),
      notes('C5', 'E5', 'G5'),
      midiNotes(48, 52, 55),
      midiNotes(72, 76, 79)
    ]) {
      const result = classifyRhythmChord('C', voicing);
      expect(result.outcome).toBe('correct');
      expect(result.chordCorrect).toBe(true);
      expect(result.targetChordLabel).toBe('C');
    }
  });

  it('accepts plain-chord inversions', () => {
    expect(classifyRhythmChord('C', notes('E3', 'G3', 'C4')).outcome).toBe('correct');
    expect(classifyRhythmChord('C', notes('G3', 'C4', 'E4')).outcome).toBe('correct');
    expect(classifyRhythmChord('Am', notes('E3', 'A3', 'C4')).outcome).toBe('correct');
    expect(classifyRhythmChord('F', notes('C4', 'F4', 'A4')).outcome).toBe('correct');
  });

  it('accepts Am and F across octaves', () => {
    expect(classifyRhythmChord('Am', notes('A2', 'C3', 'E3')).chordCorrect).toBe(true);
    expect(classifyRhythmChord('Am', notes('A3', 'C4', 'E4')).chordCorrect).toBe(true);
    expect(classifyRhythmChord('F', notes('F3', 'A3', 'C4')).chordCorrect).toBe(true);
    expect(classifyRhythmChord('F', notes('F4', 'A4', 'C5')).chordCorrect).toBe(true);
  });
});

describe('M3K chord semantics — slash chords stay bass-sensitive', () => {
  it('accepts G/B in any register with B in the bass', () => {
    for (const voicing of [
      notes('B2', 'D3', 'G3'),
      notes('B3', 'D4', 'G4'),
      midiNotes(47, 50, 55)
    ]) {
      const result = classifyRhythmChord('G/B', voicing);
      expect(result.outcome).toBe('correct');
      expect(result.chordCorrect).toBe(true);
      expect(result.targetBassRequirement).toBe('B');
      expect(result.playedBass).toBe('B');
    }
  });

  it('rejects G/B when the bass is not B', () => {
    const rootPosition = classifyRhythmChord('G/B', notes('G3', 'B3', 'D4'));
    expect(rootPosition.outcome).toBe('wrong_bass');
    expect(rootPosition.chordCorrect).toBe(false);
    expect(rootPosition.playedBass).toBe('G');

    const secondInversion = classifyRhythmChord('G/B', notes('D3', 'G3', 'B3'));
    expect(secondInversion.outcome).toBe('wrong_bass');
    expect(secondInversion.playedBass).toBe('D');
  });
});

describe('M3K chord semantics — diagnostics', () => {
  it('detects a wrong quality instead of a generic wrong chord', () => {
    const minor = classifyRhythmChord('C', notes('C3', 'D#3', 'G3'));
    expect(minor.outcome).toBe('wrong_quality');
    expect(minor.detectedQuality).toBe('minor');
    expect(minor.detectedChordLabel).toContain('C');
    expect(minor.detectedChordLabel).toContain('minor');
    expect(minor.targetChordLabel).toBe('C');

    const major = classifyRhythmChord('Am', notes('A3', 'C#4', 'E4'));
    expect(major.outcome).toBe('wrong_quality');
    expect(major.detectedQuality).toBe('major');
  });

  it('reports incomplete and extra note counts without timing ambiguity', () => {
    const two = classifyRhythmChord('C', notes('C3', 'E3'));
    expect(two.outcome).toBe('incomplete_chord');
    expect(two.chordCorrect).toBe(false);

    const four = classifyRhythmChord('C', notes('C3', 'E3', 'G3', 'B3'));
    expect(four.outcome).toBe('extra_notes');
    expect(four.chordCorrect).toBe(false);

    const duplicate = classifyRhythmChord('C', notes('C3', 'C4', 'E3'));
    expect(duplicate.outcome).toBe('incomplete_chord');
  });

  it('labels a wrong chord and preserves played pitch classes and bass', () => {
    const result = classifyRhythmChord('C', notes('G3', 'B3', 'D4'));
    expect(result.outcome).toBe('wrong_chord');
    expect(result.detectedChordLabel).toContain('G');
    expect(result.playedPitchClasses.sort()).toEqual(['B', 'D', 'G']);
    expect(result.playedBass).toBe('G');
    expect(result.targetPitchClasses.sort()).toEqual(['C', 'E', 'G']);
  });

  it('never requires a hidden canonical register', () => {
    expect(classifyRhythmChord('C', notes('C2', 'E2', 'G2')).chordCorrect).toBe(true);
    expect(classifyRhythmChord('C', notes('C6', 'E6', 'G6')).chordCorrect).toBe(true);
    expect(classifyRhythmChord('G/B', notes('B1', 'D2', 'G2')).chordCorrect).toBe(true);
  });
});

describe('M3K late-diagnostic window — pitch survives timing failure', () => {
  function freshAssessmentState(): ChordRhythmModuleState {
    return { ...createChordRhythmModuleState(), step: 'transferAssessment' };
  }

  it('keeps the attempt ungraded during the soft-miss window and applies it exactly once', () => {
    let state = freshAssessmentState();
    state = reduceChordRhythmState(state, { type: 'startRun', expectedOnset: 1_000 });
    state = reduceChordRhythmState(state, { type: 'missedOnset' });
    expect(state.lateWindow).toBe(true);
    expect(state.isRunning).toBe(true);
    expect(state.assessment.trialsCompleted).toBe(0);

    // A late but musically correct chord keeps chordCorrect=true and timing=missed.
    const lateCorrect = classifyRhythmTiming(1_000, 1_600, true);
    const classification = classifyRhythmChord('C', notes('C4', 'E4', 'G4'));
    state = reduceChordRhythmState(state, {
      type: 'recordOutcome',
      outcome: lateCorrect,
      classification,
      questionInstanceId: 'q-0'
    });
    expect(state.lateWindow).toBe(false);
    expect(state.lastOutcome?.chordCorrect).toBe(true);
    expect(state.lastOutcome?.timingBand).toBe('missed');
    expect(state.lastOutcome?.correct).toBe(false);
    expect(state.assessment.trialsCompleted).toBe(1);
    expect(state.assessment.pendingCorrective).toBe(true);
  });

  it('records the missed attempt when the window expires with no input', () => {
    let state = freshAssessmentState();
    state = reduceChordRhythmState(state, { type: 'startRun', expectedOnset: 1_000 });
    state = reduceChordRhythmState(state, { type: 'missedOnset' });
    state = reduceChordRhythmState(state, { type: 'missedExpired' });
    expect(state.lateWindow).toBe(false);
    expect(state.isRunning).toBe(false);
    expect(state.assessment.trialsCompleted).toBe(1);
    expect(state.lastOutcome?.chordCorrect).toBe(false);
  });

  it('exposes an explicit timing state machine', () => {
    let state = freshAssessmentState();
    expect(rhythmRunPhase(state)).toBe('prepare');
    expect(isRhythmTimingWindowOpen(state)).toBe(false);

    state = reduceChordRhythmState(state, { type: 'startRun', expectedOnset: 1_000 });
    expect(rhythmRunPhase(state)).toBe('countIn');

    state = reduceChordRhythmState(state, { type: 'clockBeat', beat: 0, countInValue: null });
    state = { ...state, expectedOnset: 1_000 };
    expect(rhythmRunPhase(state)).toBe('armed');
    expect(isRhythmTimingWindowOpen(state)).toBe(true);

    state = reduceChordRhythmState(state, { type: 'missedOnset' });
    expect(rhythmRunPhase(state)).toBe('late');
    expect(isRhythmTimingWindowOpen(state)).toBe(false);

    state = reduceChordRhythmState(state, { type: 'missedExpired' });
    expect(rhythmRunPhase(state)).toBe('retry');
  });

  it('creates fresh module states outside any late window', () => {
    const state = createChordRhythmModuleState();
    expect(state.lateWindow).toBe(false);
    expect(state.lastClassification).toBeNull();
    expect(state.assessment).toEqual(createRhythmAssessment());
  });
});
