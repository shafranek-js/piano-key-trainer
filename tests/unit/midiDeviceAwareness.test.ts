import { describe, expect, it } from 'vitest';
import {
  applyCalibration,
  applyUserConfig,
  calibrationCapability,
  calibrationRawNote,
  capabilityFromDescriptor,
  defaultRangeForKeyCount,
  findKnownDeviceProfile,
  markRangeStale,
  observeTransmittedNote,
  rangeLabel,
  startCalibration
} from '../../src/core/midi/deviceCapability';
import {
  arrangementNotes,
  originalRequiredRange,
  planTwoHandArrangement
} from '../../src/core/learning/twoHandArrangement';
import {
  TWO_HAND_ITEM_IDS,
  applyTwoHandArrangement,
  createTwoHandModuleState,
  reduceTwoHandState,
  twoHandSnapshotFor,
  normalizeTwoHandSnapshot,
  type TwoHandModuleState
} from '../../src/core/learning/twoHand';
import { HARMONY_CHORDS } from '../../src/core/learning/harmony';
import { midiFromKeyId } from '../../src/audio/types';

const MICROLAB = { id: 'port-1', name: 'Arturia MicroLab mk3', manufacturer: 'Arturia', portName: 'MicroLab mk3' };

describe('M3L Rev2 device capability model', () => {
  it('recognizes the Arturia MicroLab mk3 as a 25-key device with a typical C3–C5 fallback range', () => {
    const capability = capabilityFromDescriptor(MICROLAB);
    expect(capability.physicalKeyCount).toBe(25);
    expect(capability.source).toBe('known-profile');
    expect(capability.minNote).toBe(48);
    expect(capability.maxNote).toBe(72);
    expect(capability.calibrated).toBe(false);
    expect(findKnownDeviceProfile('Arturia MicroLab mk3', 'Arturia')?.physicalKeyCount).toBe(25);
  });

  it('does not guess a key count for unknown controllers and requires calibration or configuration', () => {
    const capability = capabilityFromDescriptor({ id: 'port-2', name: 'Generic Keys', manufacturer: 'Unknown', portName: 'Generic Keys' });
    expect(capability.physicalKeyCount).toBeNull();
    expect(capability.minNote).toBeNull();
    expect(capability.maxNote).toBeNull();
    expect(capability.source).toBe('fallback');
    const configured = applyUserConfig(capability, { physicalKeyCount: 61 });
    expect(configured.physicalKeyCount).toBe(61);
    expect(configured.minNote).toBe(36);
    expect(configured.maxNote).toBe(96);
    expect(configured.source).toBe('user-config');
  });

  it('calibrates leftmost/rightmost raw notes including notes outside the virtual C2–C6 piano', () => {
    const capability = capabilityFromDescriptor(MICROLAB);
    let state = startCalibration(MICROLAB);
    expect(state.step).toBe('awaiting-left');
    const left = calibrationRawNote(state, 30);
    expect(left.captured).toBe('left');
    state = left.state;
    expect(state.minNote).toBe(30);
    const right = calibrationRawNote(state, 96);
    expect(right.captured).toBe('right');
    state = right.state;
    expect(state.step).toBe('complete');
    const calibrated = calibrationCapability(capability, state);
    expect(calibrated?.calibrated).toBe(true);
    expect(calibrated?.minNote).toBe(30);
    expect(calibrated?.maxNote).toBe(96);
    expect(rangeLabel(calibrated?.minNote ?? null, calibrated?.maxNote ?? null)).toBe('F#1–C7');
  });

  it('flags a key-count mismatch and out-of-range notes (octave changes) as needing revalidation', () => {
    const capability = capabilityFromDescriptor(MICROLAB);
    const mismatched = applyCalibration(capability, { minNote: 48, maxNote: 60 });
    expect(mismatched.physicalKeyCount).toBe(25);
    expect(mismatched.needsRevalidation).toBe(true);

    const calibrated = applyCalibration(capability, { minNote: 48, maxNote: 72 });
    expect(calibrated.needsRevalidation).toBe(false);
    expect(observeTransmittedNote(calibrated, 60).staleTriggered).toBe(false);
    const shifted = observeTransmittedNote(calibrated, 36);
    expect(shifted.staleTriggered).toBe(true);
    expect(shifted.capability.needsRevalidation).toBe(true);
    expect(markRangeStale(calibrated).needsRevalidation).toBe(true);
  });

  it('provides default ranges for generic 25/37/49/61/88-key devices', () => {
    expect(defaultRangeForKeyCount(25)).toEqual({ minNote: 48, maxNote: 72 });
    expect(defaultRangeForKeyCount(37)).toEqual({ minNote: 36, maxNote: 72 });
    expect(defaultRangeForKeyCount(49)).toEqual({ minNote: 36, maxNote: 84 });
    expect(defaultRangeForKeyCount(61)).toEqual({ minNote: 36, maxNote: 96 });
    expect(defaultRangeForKeyCount(88)).toEqual({ minNote: 21, maxNote: 108 });
  });
});

describe('M3L Rev2 feasibility and adaptive voicings', () => {
  it('rejects the original four-chord phrase on a fixed 25-key span', () => {
    const original = originalRequiredRange();
    expect(original).toEqual({ minNote: 41, maxNote: 67, span: 27 });
    const plan = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    expect(plan.kind).toBe('compact');
    expect(plan.explanation.length).toBeGreaterThan(0);
  });

  it('selects a compact arrangement that preserves every chord identity and the slash bass', () => {
    const plan = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    const expected = {
      C: { bass: 'C3', triad: ['C4', 'E4', 'G4'] },
      'G/B': { bass: 'B3', triad: ['D4', 'G4', 'B4'] },
      Am: { bass: 'A3', triad: ['C4', 'E4', 'A4'] },
      F: { bass: 'F3', triad: ['A3', 'C4', 'F4'] }
    };
    for (const [chordId, voicing] of Object.entries(expected)) {
      expect(plan.voicings[chordId]?.bassKeyId).toBe(voicing.bass);
      expect([...plan.voicings[chordId]!.triadKeyIds]).toEqual(voicing.triad);
    }
    const notes = arrangementNotes(plan);
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...notes)).toBeLessThanOrEqual(72);
    expect(plan.handSeparationOk).toBe(true);
    for (const chordId of plan.sequence) {
      const voicing = plan.voicings[chordId];
      const bassPc = HARMONY_CHORDS[chordId].bassKeyId.replace(/\d/g, '');
      expect(voicing.bassKeyId.replace(/\d/g, '')).toBe(bassPc);
      const triadPcs = new Set([...HARMONY_CHORDS[chordId].keyIds].map(keyId => keyId.replace(/\d/g, '')));
      const playedPcs = new Set([...voicing.triadKeyIds].map(keyId => keyId.replace(/\d/g, '')));
      expect(playedPcs).toEqual(triadPcs);
    }
  });

  it('keeps one unchanged range across all four bars (no mid-phrase octave switch)', () => {
    const plan = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    const perChordNotes = plan.sequence.map(chordId => arrangementNotes({
      ...plan,
      voicings: { [chordId]: plan.voicings[chordId] }
    }));
    for (const notes of perChordNotes) {
      expect(Math.min(...notes)).toBeGreaterThanOrEqual(48);
      expect(Math.max(...notes)).toBeLessThanOrEqual(72);
    }
    expect(arrangementNotes(plan).length).toBe(16);
  });

  it('keeps the canonical arrangement playable on 37/49/61/88-key devices', () => {
    for (const count of [37, 49, 61, 88]) {
      const range = defaultRangeForKeyCount(count)!;
      const plan = planTwoHandArrangement({ rangeLo: range.minNote, rangeHi: range.maxNote });
      expect(plan.kind).toBe('original');
      expect(plan.voicings['G/B'].bassKeyId).toBe('B2');
    }
  });

  it('falls back to a shorter introduction or a clearly labelled simulation instead of a dead end', () => {
    const intro = planTwoHandArrangement({ rangeLo: 48, rangeHi: 68 });
    expect(intro.kind).toBe('compact-intro');
    expect(intro.sequence).toEqual(['C']);
    const simulation = planTwoHandArrangement({ rangeLo: 60, rangeHi: 64 });
    expect(simulation.kind).toBe('simulation');
    expect(simulation.explanation.length).toBeGreaterThan(0);
  });

  it('re-plans a C2–C4 calibrated range into playable voicings with the slash bass lowest', () => {
    const plan = planTwoHandArrangement({ rangeLo: 36, rangeHi: 60 });
    expect(plan.kind).toBe('compact');
    expect(plan.voicings['G/B'].bassKeyId).toBe('B2');
    expect([...plan.voicings['G/B'].triadKeyIds]).toEqual(['D3', 'G3', 'B3']);
    const notes = arrangementNotes(plan);
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(36);
    expect(Math.max(...notes)).toBeLessThanOrEqual(60);
    const bassMidi = midiFromKeyId(plan.voicings['G/B'].bassKeyId)!;
    const triadMidis = plan.voicings['G/B'].triadKeyIds.map(keyId => midiFromKeyId(keyId)!);
    expect(bassMidi).toBeLessThan(Math.min(...triadMidis));
    expect(plan.handSeparationOk).toBe(true);
  });
});

describe('M3L Rev2 assessment integrity and arrangement context', () => {
  function runAssessmentTrial(state: TwoHandModuleState, inputMode?: 'midi' | 'screen'): TwoHandModuleState {
    let next = reduceTwoHandState(state, { type: 'startRun' });
    next = reduceTwoHandState(next, {
      type: 'gradeAttempt',
      inputMode,
      result: {
        outcome: 'correct',
        correct: true,
        bassCorrect: true,
        chordCorrect: true,
        syncMs: 10,
        timing: 'on_time',
        feedbackText: 'ok'
      }
    });
    return next;
  }

  it('blocks synthetic-only completion but records MIDI completion', () => {
    let state = createTwoHandModuleState(null, { kind: 'compact', sequence: ['C', 'G/B', 'Am', 'F'], voicings: planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 }).voicings });
    state = { ...state, stage: 'transferAssessment' };
    for (let index = 0; index < 12; index++) state = runAssessmentTrial(state, 'screen');
    expect(state.assessment.phase).toBe('passed');
    const blocked = reduceTwoHandState(state, { type: 'completeModule' });
    expect(blocked.stage).not.toBe('moduleComplete');
    expect(blocked.feedbackTone).toBe('warn');

    let midiState = createTwoHandModuleState(null, { kind: 'compact', sequence: ['C', 'G/B', 'Am', 'F'], voicings: planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 }).voicings });
    midiState = { ...midiState, stage: 'transferAssessment' };
    for (let index = 0; index < 12; index++) midiState = runAssessmentTrial(midiState, 'midi');
    const completed = reduceTwoHandState(midiState, { type: 'completeModule' });
    expect(completed.stage).toBe('moduleComplete');
    expect(completed.assessment.inputModes).toEqual(['midi']);
  });

  it('swaps arrangements on a range change while preserving progress and stage', () => {
    const wide = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    const narrow = planTwoHandArrangement({ rangeLo: 36, rangeHi: 60 });
    let state = createTwoHandModuleState(null, wide, null);
    state = { ...state, stage: 'simultaneous', progress: { ...state.progress, leftIndex: 4, rightIndex: 4, simultaneousIndex: 2 } };
    const swapped = applyTwoHandArrangement(state, narrow, null);
    expect(swapped.voicings['G/B'].bassKeyId).toBe('B2');
    expect(swapped.arrangementKind).toBe('compact');
    expect(swapped.progress.simultaneousIndex).toBe(2);
    expect(swapped.stage).toBe('simultaneous');
  });

  it('persists arrangement kind, device context and input modes through the snapshot', () => {
    const plan = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    const deviceContext = {
      deviceId: 'port-1',
      name: 'Arturia MicroLab mk3',
      minNote: 48,
      maxNote: 72,
      calibrated: true,
      physicalKeyCount: 25
    };
    let state = createTwoHandModuleState(null, plan, deviceContext);
    state = { ...state, stage: 'transferAssessment' };
    state = runAssessmentTrial(state, 'midi');
    const snapshot = twoHandSnapshotFor(state);
    expect(snapshot.arrangementKind).toBe('compact');
    expect(snapshot.deviceContext?.name).toBe('Arturia MicroLab mk3');
    expect(snapshot.assessment?.inputModes).toEqual(['midi']);
    const restored = normalizeTwoHandSnapshot(snapshot);
    expect(restored?.arrangementKind).toBe('compact');
    expect(restored?.deviceContext?.physicalKeyCount).toBe(25);
    expect(restored?.assessment?.inputModes).toEqual(['midi']);
  });

  it('recomputes the arrangement for the current device but keeps the persisted identity', () => {
    const compact = planTwoHandArrangement({ rangeLo: 48, rangeHi: 72 });
    const state = createTwoHandModuleState(
      new Map([[TWO_HAND_ITEM_IDS.SESSION, { state: 'introduced', twoHandSnapshot: { ...twoHandSnapshotFor(createTwoHandModuleState()), arrangementKind: 'compact' } }]]),
      { kind: 'original', sequence: ['C', 'G/B', 'Am', 'F'], voicings: planTwoHandArrangement({ rangeLo: 36, rangeHi: 84 }).voicings }
    );
    expect(state.arrangementKind).toBe('original');
    expect(state.voicings['G/B'].bassKeyId).toBe('B2');
    expect(compact.voicings['G/B'].bassKeyId).toBe('B3');
  });
});
