import { describe, it, expect } from 'vitest';
import {
  REPERTOIRE,
  getSongMeasureCount,
  getMeasureForNoteIndex,
  getMeasureNoteRange,
  getSongDurationMs,
  getEffectiveSongBpm,
  hasFullVersion,
  getSongVersion,
  type SongDef
} from '../../src/core/repertoire/repertoireData';
import {
  songToMusicXml,
  singleNoteToMusicXml,
  twoHandToMusicXml,
  parseMusicXmlToSongDef,
  pitchToKeyboardNoteId,
  decomposeDurationSpecs,
  getCursorStepForNoteIndex
} from '../../src/core/repertoire/musicXmlGenerator';

describe('Repertoire Data & Measure Logic', () => {
  it('contains valid piano note names and matching beat counts for all songs (excerpt and full)', () => {
    const validNoteRegex = /^[A-G](#?)\d$/;
    for (const song of REPERTOIRE) {
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.notes.length).toBe(song.beats.length);
      for (const note of song.notes) {
        expect(validNoteRegex.test(note), `Note ${note} in song ${song.id} should be valid`).toBe(true);
      }
      expect(song.measureBeats).toBeGreaterThanOrEqual(2);

      // Every built-in repertoire piece must have a complete full version
      expect(hasFullVersion(song), `Song ${song.id} should have a full version`).toBe(true);
      const fullSong = getSongVersion(song, 'full');
      expect(fullSong.notes.length).toBeGreaterThan(song.notes.length);
      expect(fullSong.notes.length).toBe(fullSong.beats.length);
      for (const note of fullSong.notes) {
        expect(validNoteRegex.test(note), `Full note ${note} in song ${song.id} should be valid`).toBe(true);
      }
    }
  });

  it('correctly calculates measure count and note indices', () => {
    const ode = REPERTOIRE.find(s => s.id === 'ode-joy')!;
    expect(getSongMeasureCount(ode)).toBe(4);
    expect(getMeasureForNoteIndex(ode, 0)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 3)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 4)).toBe(2);
    expect(getMeasureForNoteIndex(ode, 14)).toBe(4);

    const odeFull = getSongVersion(ode, 'full');
    expect(getSongMeasureCount(odeFull)).toBeGreaterThan(4);
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

  it('supports 3/4 and 4/4 pieces and pickup measures correctly', () => {
    const bach = REPERTOIRE.find(s => s.id === 'bach-minuet-g')!;
    expect(bach.timeSignature).toEqual([3, 4]);

    const elise = REPERTOIRE.find(s => s.id === 'beethoven-fur-elise')!;
    expect(elise.timeSignature).toEqual([3, 4]);
    expect(elise.pickupBeats).toBe(1);
    expect(elise.notes).toContain('D#5');
    expect(elise.notes).toContain('G#4');
  });

  it('aligns every measure to measureBeats (and pickupBeats) across all 25 excerpt and full scores', () => {
    for (const song of REPERTOIRE) {
      for (const mode of ['excerpt', 'full'] as const) {
        const version = getSongVersion(song, mode);
        const totalMeasures = getSongMeasureCount(version);
        for (let m = 1; m < totalMeasures; m++) {
          const range = getMeasureNoteRange(version, m);
          const sumBeats = version.beats.slice(range.start, range.end).reduce((a, b) => a + b, 0);
          const expected = (m === 1 && version.pickupBeats) ? version.pickupBeats : version.measureBeats;
          expect(sumBeats, `${song.id} (${mode}) measure ${m} should sum to ${expected} beats`).toBeCloseTo(expected, 5);
        }
      }
    }
  });

  it('calculates total song duration in ms and piece-specific effective BPM for demo playback', () => {
    const ode = REPERTOIRE.find(s => s.id === 'ode-joy')!;
    const dur60 = getSongDurationMs(ode, 60);
    expect(dur60).toBe(16000);

    const dur120 = getSongDurationMs(ode, 120);
    expect(dur120).toBe(8000);

    const gym = REPERTOIRE.find(s => s.id === 'satie-gymnopedie-1')!;
    const tetris = REPERTOIRE.find(s => s.id === 'korobeiniki-tetris')!;
    expect(getEffectiveSongBpm(gym, 'wait', false)).toBeNull();
    expect(getEffectiveSongBpm(gym, 'wait', true)).toBe(66);
    expect(getEffectiveSongBpm(tetris, 'normal', false)).toBe(132);
    expect(getEffectiveSongBpm(tetris, 'slow', false)).toBeLessThan(132);
  });

  it('generates valid MusicXML 4.0 with beams, dots, compound ties, and cursor step mapping', () => {
    for (const song of REPERTOIRE) {
      const xml = songToMusicXml(song);
      expect(xml).toContain('<score-partwise version="4.0">');
      expect(xml).toContain(`<work-title>${song.title}</work-title>`);

      const fullXml = songToMusicXml(getSongVersion(song, 'full'));
      expect(fullXml).toContain('<score-partwise version="4.0">');
    }

    const elise = REPERTOIRE.find(s => s.id === 'beethoven-fur-elise')!;
    const eliseXml = songToMusicXml(elise);
    expect(eliseXml).toContain('<type>eighth</type>');
    expect(eliseXml).toContain('<beam number="1">begin</beam>');
    expect(eliseXml).toContain('<accidental>sharp</accidental>');
    expect(eliseXml).toContain('<dot/>');

    // Compound 2.5-beat note decomposes into half (2) + eighth (0.5) tied together
    const joplin = REPERTOIRE.find(s => s.id === 'joplin-entertainer')!;
    expect(decomposeDurationSpecs(2.5)).toHaveLength(2);
    const joplinXml = songToMusicXml(joplin);
    expect(joplinXml).toContain('<tie type="start"/>');
    expect(joplinXml).toContain('<tie type="stop"/>');
    // Note index 7 in joplin is C5[2.5]; note index 8 is after the 2-element tied note, so cursor step increases by 2
    expect(getCursorStepForNoteIndex(joplin, 8) - getCursorStepForNoteIndex(joplin, 7)).toBe(2);

    const singleGrand = singleNoteToMusicXml('C3', 'grand');
    expect(singleGrand).toContain('<staves>2</staves>');
    expect(singleGrand).toContain('<sign>F</sign>');

    const twoHandXml = twoHandToMusicXml('C3', 'E4');
    expect(twoHandXml).toContain('<staves>2</staves>');
    expect(twoHandXml).toContain('<staff>1</staff>');
    expect(twoHandXml).toContain('<staff>2</staff>');
  });

  it('parses MusicXML using MelodicaTrainer timeline rules (resolveTiedNotes, backup/voice filtering, pickup, tempo)', () => {
    expect(REPERTOIRE.length).toBeGreaterThanOrEqual(25);
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

    // Verify tied note duration accumulation + <backup> secondary voice & staff 2 filtering + pickup detection
    const multiVoiceTiedXml = `<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise version="4.0">
        <work><work-title>Tie &amp; Backup Test</work-title></work>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1" implicit="yes">
            <attributes>
              <divisions>4</divisions>
              <time><beats>3</beats><beat-type>4</beat-type></time>
            </attributes>
            <direction><sound tempo="112"/></direction>
            <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
            <note><pitch><step>D</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
          </measure>
          <measure number="2">
            <note>
              <pitch><step>A</step><octave>4</octave></pitch>
              <duration>8</duration>
              <tie type="start"/>
              <voice>1</voice>
              <staff>1</staff>
            </note>
            <note>
              <pitch><step>A</step><octave>4</octave></pitch>
              <duration>4</duration>
              <tie type="stop"/>
              <voice>1</voice>
              <staff>1</staff>
            </note>
            <backup><duration>12</duration></backup>
            <note><pitch><step>C</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><staff>2</staff></note>
          </measure>
        </part>
      </score-partwise>`;

    const polyParsed = parseMusicXmlToSongDef(multiVoiceTiedXml);
    expect(polyParsed.pickupBeats).toBe(1);
    expect(polyParsed.defaultBpm).toBe(112);
    expect(polyParsed.notes).toEqual(['E5', 'D#5', 'A4']);
    // Tied A4 (2 beats + 1 beat) is merged into a single 3-beat note, and Staff 2 C3 is excluded!
    expect(polyParsed.beats).toEqual([0.5, 0.5, 3]);
  });
});

