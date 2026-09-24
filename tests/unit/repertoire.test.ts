import { describe, it, expect } from 'vitest';
import {
  REPERTOIRE,
  getSongMeasureCount,
  getMeasureForNoteIndex,
  getMeasureNoteRange,
  getSongDurationMs,
  type SongDef
} from '../../src/core/repertoire/repertoireData';
import {
  songToMusicXml,
  singleNoteToMusicXml,
  twoHandToMusicXml,
  parseMusicXmlToSongDef,
  pitchToKeyboardNoteId
} from '../../src/core/repertoire/musicXmlGenerator';

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
    expect(getSongMeasureCount(ode)).toBe(4);
    expect(getMeasureForNoteIndex(ode, 0)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 3)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 4)).toBe(2);
    expect(getMeasureForNoteIndex(ode, 14)).toBe(4);
  });

  it('provides exact note slices for each measure in getMeasureNoteRange', () => {
    const bach = REPERTOIRE.find(s => s.id === 'bach-minuet-g')!;
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

    const under = getMeasureNoteRange(furElise, 0);
    expect(under.start).toBe(0);

    const over = getMeasureNoteRange(furElise, 999);
    expect(over.end).toBe(furElise.notes.length);
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
    const dur60 = getSongDurationMs(ode, 60);
    expect(dur60).toBe(16000);

    const dur120 = getSongDurationMs(ode, 120);
    expect(dur120).toBe(8000);
  });

  it('generates valid MusicXML 4.0 with beams, dots, and durations for OSMD', () => {
    for (const song of REPERTOIRE) {
      const xml = songToMusicXml(song);
      expect(xml).toContain('<score-partwise version="4.0">');
      expect(xml).toContain(`<work-title>${song.title}</work-title>`);
    }

    const elise = REPERTOIRE.find(s => s.id === 'beethoven-fur-elise')!;
    const eliseXml = songToMusicXml(elise);
    expect(eliseXml).toContain('<type>eighth</type>');
    expect(eliseXml).toContain('<beam number="1">begin</beam>');
    expect(eliseXml).toContain('<accidental>sharp</accidental>');
    expect(eliseXml).toContain('<dot/>');

    const singleGrand = singleNoteToMusicXml('C3', 'grand');
    expect(singleGrand).toContain('<staves>2</staves>');
    expect(singleGrand).toContain('<sign>F</sign>');

    const twoHandXml = twoHandToMusicXml('C3', 'E4');
    expect(twoHandXml).toContain('<staves>2</staves>');
    expect(twoHandXml).toContain('<staff>1</staff>');
    expect(twoHandXml).toContain('<staff>2</staff>');
  });

  it('includes curated MelodicaTrainer pieces and parses imported MusicXML into SongDef', () => {
    expect(REPERTOIRE.length).toBeGreaterThanOrEqual(25);
    expect(REPERTOIRE.some(s => s.id === 'satie-gymnopedie-1')).toBe(true);
    expect(REPERTOIRE.some(s => s.id === 'korobeiniki-tetris')).toBe(true);
    expect(REPERTOIRE.some(s => s.id === 'leontovych-shchedryk')).toBe(true);

    const gymnopedie = REPERTOIRE.find(s => s.id === 'satie-gymnopedie-1')!;
    const xml = songToMusicXml(gymnopedie);
    const parsed = parseMusicXmlToSongDef(xml);
    expect(parsed.title).toBe(gymnopedie.title);
    expect(parsed.notes).toEqual(gymnopedie.notes);
    expect(parsed.beats).toEqual(gymnopedie.beats);
    expect(parsed.timeSignature).toEqual([3, 4]);

    // Enharmonic flat-to-sharp conversion for keyboard compatibility (Bb4 -> A#4, Eb4 -> D#4)
    expect(pitchToKeyboardNoteId('B', -1, 4)).toBe('A#4');
    expect(pitchToKeyboardNoteId('E', -1, 4)).toBe('D#4');
  });
});
