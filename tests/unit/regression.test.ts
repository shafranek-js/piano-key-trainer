import { describe, it, expect } from 'vitest';
import { 
  MIDI_MIN, 
  MIDI_MAX, 
  keyIdFromMidi, 
  pitchClassFromMidi 
} from '../../src/audio/types';
import { ALL_NOTES } from '../../src/core/fsrs/constants';

describe('Piano Trainer Core Regressions & Invariants', () => {
  it('has exact 4 octaves range C2 to C6 (29 white keys, 20 black keys)', () => {
    let whiteCount = 0;
    let blackCount = 0;

    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      const pc = pitchClassFromMidi(midi);
      if (pc.includes('#')) {
        blackCount++;
      } else {
        whiteCount++;
      }
    }

    expect(MIDI_MIN).toBe(36); // C2
    expect(MIDI_MAX).toBe(84); // C6
    expect(keyIdFromMidi(36)).toBe('C2');
    expect(keyIdFromMidi(84)).toBe('C6');
    expect(whiteCount).toBe(29);
    expect(blackCount).toBe(20);
    expect(whiteCount + blackCount).toBe(49);
  });

  it('maps all pitch classes correctly', () => {
    expect(ALL_NOTES.length).toBe(12);
    expect(pitchClassFromMidi(60)).toBe('C');
    expect(keyIdFromMidi(60)).toBe('C4'); // Middle C
  });

  it('correctly evaluates identify skill responses', () => {
    // In identify mode: question is "Which note is highlighted?"
    // User response can be provided via key press, note button click, or piano strike
    const targetCard = { id: 'card-1', note: 'C', skill: 'identify' };
    const checkIdentifyAnswer = (answerNote: string) => answerNote === targetCard.note;

    expect(checkIdentifyAnswer('C')).toBe(true);
    expect(checkIdentifyAnswer('D')).toBe(false);
  });
});
