import { describe, it, expect } from 'vitest';
import {
  REPERTOIRE,
  getSongMeasureCount,
  getMeasureForNoteIndex,
  getMeasureNoteRange,
  getSongDurationMs,
  type SongDef
} from '../../src/core/repertoire/repertoireData';

describe('Repertoire Data & Measure Logic', () => {
  it('contains valid piano note names and matching beat counts for all songs', () => {
    const validNoteRegex = /^[A-G](#?)\d$/;
    for (const song of REPERTOIRE) {
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.notes.length).toBe(song.beats.length);
      for (const note of song.notes) {
        expect(validNoteRegex.test(note), `Note ${note} in song ${song.id} should be valid`).toBe(true);
      }
      expect(song.measureBeats).toBeGreaterThanOrEqual(2);
    }
  });

  it('correctly calculates measure count and note indices', () => {
    const ode = REPERTOIRE.find(s => s.id === 'ode-joy')!;
    // 15 notes, 4 beats per measure => ceil(15 / 4) = 4 measures
    expect(getSongMeasureCount(ode)).toBe(4);

    // Note 0 (first note) is in measure 1
    expect(getMeasureForNoteIndex(ode, 0)).toBe(1);
    // Note 3 (4th note) is in measure 1
    expect(getMeasureForNoteIndex(ode, 3)).toBe(1);
    // Note 4 (5th note) is in measure 2
    expect(getMeasureForNoteIndex(ode, 4)).toBe(2);
    // Note 14 (last note) is in measure 4
    expect(getMeasureForNoteIndex(ode, 14)).toBe(4);
  });

  it('provides exact note slices for each measure in getMeasureNoteRange', () => {
    const bach = REPERTOIRE.find(s => s.id === 'bach-minuet-g')!;
    // 3 beats per measure (3/4 time signature)
    expect(bach.measureBeats).toBe(3);
    const m1 = getMeasureNoteRange(bach, 1);
    expect(m1.start).toBe(0);
    expect(m1.end).toBe(5);
    expect(m1.notes).toEqual(['D5', 'G4', 'A4', 'B4', 'C5']);

    const m2 = getMeasureNoteRange(bach, 2);
    expect(m2.start).toBe(5);
    expect(m2.end).toBe(8);
    expect(m2.notes).toEqual(['D5', 'G4', 'G4']);
  });

  it('safely clamps out-of-bound measure numbers', () => {
    const furElise = REPERTOIRE.find(s => s.id === 'beethoven-fur-elise')!;
    const total = getSongMeasureCount(furElise);

    const under = getMeasureNoteRange(furElise, 0);
    expect(under.start).toBe(0); // clamps to measure 1

    const over = getMeasureNoteRange(furElise, 999);
    expect(over.end).toBe(furElise.notes.length); // clamps to last measure
  });

  it('supports 3/4 and 4/4 pieces correctly', () => {
    const bach = REPERTOIRE.find(s => s.id === 'bach-minuet-g')!;
    expect(bach.timeSignature).toEqual([3, 4]);

    const elise = REPERTOIRE.find(s => s.id === 'beethoven-fur-elise')!;
    expect(elise.timeSignature).toEqual([4, 4]);
    expect(elise.notes).toContain('D#4');
    expect(elise.notes).toContain('G#4');
  });

  it('calculates total song duration in ms for demo playback', () => {
    const ode = REPERTOIRE.find(s => s.id === 'ode-joy')!;
    // 14 beats of 1, and 1 beat of 2 = 16 total beats
    // at 60 bpm, 16 beats = 16 * 1000 = 16000 ms
    const dur60 = getSongDurationMs(ode, 60);
    expect(dur60).toBe(16000);

    // at 120 bpm, 16 beats = 8000 ms
    const dur120 = getSongDurationMs(ode, 120);
    expect(dur120).toBe(8000);
  });
});
