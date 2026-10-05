import { describe, expect, it } from 'vitest';
import { MidiChordTracker } from '../../src/core/input/chordInput';

describe('MidiChordTracker — two distinct attacks lifecycle', () => {
  it('locks after three held notes and cannot evaluate again while any chord key is held', () => {
    const tracker = new MidiChordTracker();
    const evaluations: string[][] = [];
    const onChord = (keyIds: string[]) => evaluations.push(keyIds);

    tracker.handleNoteOn('C4', onChord);
    tracker.handleNoteOn('E4', onChord);
    expect(evaluations).toHaveLength(0);
    tracker.handleNoteOn('G4', onChord);
    expect(evaluations).toHaveLength(1);
    expect(tracker.isLocked()).toBe(true);

    // A fourth held note must not create a second evaluation while locked.
    tracker.handleNoteOn('B4', onChord);
    expect(evaluations).toHaveLength(1);

    // Partial release keeps the tracker locked; the exercise UI must ask for a full release.
    tracker.handleNoteOff('C4');
    expect(tracker.isLocked()).toBe(true);
    tracker.handleNoteOn('E4', onChord);
    expect(evaluations).toHaveLength(1);

    tracker.handleNoteOff('E4');
    tracker.handleNoteOff('G4');
    tracker.handleNoteOff('B4');
    expect(tracker.isLocked()).toBe(false);
  });

  it('re-arms after a full release and evaluates the same chord again', () => {
    const tracker = new MidiChordTracker();
    const evaluations: string[][] = [];
    const onChord = (keyIds: string[]) => evaluations.push([...keyIds]);

    for (const keyId of ['C4', 'E4', 'G4']) tracker.handleNoteOn(keyId, onChord);
    expect(evaluations).toHaveLength(1);

    for (const keyId of ['C4', 'E4', 'G4']) tracker.handleNoteOff(keyId);
    expect(tracker.isLocked()).toBe(false);

    for (const keyId of ['C4', 'E4', 'G4']) tracker.handleNoteOn(keyId, onChord);
    expect(evaluations).toHaveLength(2);
    expect(evaluations[1]).toEqual(evaluations[0]);
  });

  it('uses actual held-note state for the release condition', () => {
    const tracker = new MidiChordTracker();
    tracker.handleNoteOn('C4');
    tracker.handleNoteOn('E4');
    tracker.handleNoteOn('G4');
    expect(tracker.getActiveNotes()).toEqual(['C4', 'E4', 'G4']);
    tracker.handleNoteOff('E4');
    expect(tracker.getActiveNotes()).toEqual(['C4', 'G4']);
    tracker.handleNoteOff('C4');
    tracker.handleNoteOff('G4');
    expect(tracker.getActiveNotes()).toEqual([]);
    expect(tracker.isLocked()).toBe(false);
  });
});
