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
  getSongVerification,
  songToRawMelodyEvents,
  normalizeSongToEvents,
  computeNoteEnvelopeTiming,
  buildSongPlaybackSchedule
} from '../../src/core/repertoire/repertoireData';
import {
  songToMusicXml,
  singleNoteToMusicXml,
  twoHandToMusicXml,
  parseMusicXmlToSongDef,
  pitchToKeyboardNoteId,
  decomposeDurationSpecs,
  getCursorStepForNoteIndex,
  getCursorSpanForNoteIndex
} from '../../src/core/repertoire/musicXmlGenerator';
import {
  REPERTOIRE_AUDIT_REGISTRY,
  validateEntireRepertoireLibrary,
  isValidPlayablePitch,
  getRepertoireVerificationCounts,
  getVariantAuditSummary,
  getAllVerifiedVariantAuditSummaries
} from '../../src/core/repertoire/repertoireAudit';

describe('Repertoire Data, Pipeline Integrity & Milestone 3B.5B-3 Complete Musical Verification (All 50 Variants)', () => {
  it('contains valid piano note names, variants, and matching beat counts for all 25 songs (excerpt and melodyArrangement)', () => {
    expect(REPERTOIRE).toHaveLength(25);
    for (const song of REPERTOIRE) {
      expect(song.variant).toBe('excerpt');
      expect(song.fullVariant).toBe('melodyArrangement');
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.notes.length).toBe(song.beats.length);
      for (const note of song.notes) {
        expect(isValidPlayablePitch(note), `Note ${note} in song ${song.id} should be valid C2..C6`).toBe(true);
      }
      expect(song.measureBeats).toBeGreaterThanOrEqual(1.5);

      // Every built-in repertoire piece must have a complete melodyArrangement version
      expect(hasFullVersion(song), `Song ${song.id} should have a melodyArrangement version`).toBe(true);
      const fullSong = getSongVersion(song, 'full');
      expect(fullSong.variant).toBe('melodyArrangement');
      expect(fullSong.notes.length).toBeGreaterThan(song.notes.length);
      expect(fullSong.notes.length).toBe(fullSong.beats.length);
      for (const note of fullSong.notes) {
        expect(isValidPlayablePitch(note), `Full note ${note} in song ${song.id} should be valid C2..C6`).toBe(true);
      }
    }
  });

  it('tracks verification status per variant across all 50 repertoire variants in REPERTOIRE_AUDIT_REGISTRY (46 verified, 4 intentionally unverified, 0 unchecked)', () => {
    expect(REPERTOIRE_AUDIT_REGISTRY).toHaveLength(50);

    const verifiedEntries = REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'verified');
    const unverifiedEntries = REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'unverified');
    const needsCorrectionEntries = REPERTOIRE_AUDIT_REGISTRY.filter(
      (e) => e.verificationStatus === 'needsCorrection'
    );
    const counts = getRepertoireVerificationCounts();
    expect(counts).toEqual({
      total: REPERTOIRE_AUDIT_REGISTRY.length,
      verified: verifiedEntries.length,
      unverified: unverifiedEntries.length,
      needsCorrection: needsCorrectionEntries.length
    });
    expect(counts.verified + counts.unverified + counts.needsCorrection).toBe(50);
    expect(counts).toEqual({
      total: 50,
      verified: 46,
      unverified: 4,
      needsCorrection: 0
    });

    expect(verifiedEntries.map((e) => e.id).sort()).toEqual([
      'bach-minuet-g:excerpt',
      'bach-minuet-g:melodyArrangement',
      'beethoven-fur-elise:excerpt',
      'bella-ciao:excerpt',
      'bella-ciao:melodyArrangement',
      'beyer-101-8:excerpt',
      'beyer-101-8:melodyArrangement',
      'brahms-wiegenlied:excerpt',
      'brahms-wiegenlied:melodyArrangement',
      'burgmuller-arabesque:excerpt',
      'burgmuller-arabesque:melodyArrangement',
      'czerny-599-1:excerpt',
      'czerny-599-1:melodyArrangement',
      'dvorak-new-world-largo:excerpt',
      'dvorak-new-world-largo:melodyArrangement',
      'five-note-c:excerpt',
      'five-note-c:melodyArrangement',
      'greensleeves:excerpt',
      'greensleeves:melodyArrangement',
      'grieg-morning-mood:excerpt',
      'hanon-1:excerpt',
      'joplin-entertainer:excerpt',
      'joplin-entertainer:melodyArrangement',
      'kocka-leze-dirou:excerpt',
      'kocka-leze-dirou:melodyArrangement',
      'korobeiniki-tetris:excerpt',
      'leontovych-shchedryk:excerpt',
      'leontovych-shchedryk:melodyArrangement',
      'mary-lamb:excerpt',
      'mary-lamb:melodyArrangement',
      'mozart-nachtmusik:excerpt',
      'mozart-nachtmusik:melodyArrangement',
      'ode-joy:excerpt',
      'ode-joy:melodyArrangement',
      'pachelbel-canon-d:excerpt',
      'pachelbel-canon-d:melodyArrangement',
      'sakura-traditional:excerpt',
      'sakura-traditional:melodyArrangement',
      'satie-gymnopedie-1:excerpt',
      'satie-gymnopedie-1:melodyArrangement',
      'tchaikovsky-swan-lake:excerpt',
      'tchaikovsky-swan-lake:melodyArrangement',
      'twinkle:excerpt',
      'twinkle:melodyArrangement',
      'vivaldi-spring:excerpt',
      'vivaldi-spring:melodyArrangement'
    ]);

    for (const entry of verifiedEntries) {
      expect(entry.referenceSource).toBeTruthy();
      expect(entry.sourceEdition).toBeTruthy();
      if (entry.songId === 'five-note-c') {
        expect(entry.sourceEdition).toContain('Piano Key Trainer Original Pedagogical Exercise');
      } else {
        expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      }
      expect(entry.sourceMovement).toBeTruthy();
      expect(entry.sourcePart).toBeTruthy();
      expect(entry.sourceMeasures).toBeTruthy();
      expect(entry.issues).toEqual([]);
    }

    // Zero variants remain unverified because they are "not checked yet":
    // Only the 4 documented pedagogical/modern adaptations remain unverified.
    expect(unverifiedEntries.map((e) => e.id).sort()).toEqual([
      'beethoven-fur-elise:melodyArrangement',
      'grieg-morning-mood:melodyArrangement',
      'hanon-1:melodyArrangement',
      'korobeiniki-tetris:melodyArrangement'
    ]);

    for (const entry of unverifiedEntries) {
      expect(entry.issues).toHaveLength(1);
      expect(entry.issues[0].length).toBeGreaterThan(80);
      expect(entry.issues[0]).not.toContain('Pending Milestone 3B.5B');
      expect(entry.sourceEdition).toBeTruthy();
      expect(entry.sourceMeasures).toBeTruthy();
    }

    // Variants with verified excerpt and honestly unverified condensed/adapted melodyArrangement
    for (const songId of ['grieg-morning-mood', 'beethoven-fur-elise', 'hanon-1', 'korobeiniki-tetris'] as const) {
      const song = REPERTOIRE.find((s) => s.id === songId)!;
      expect(getSongVerification(song, 'excerpt').status).toBe('verified');
      expect(getSongVerification(song, 'full').status).toBe('unverified');
      expect(getSongVersion(song, 'excerpt').activeVerification?.status).toBe('verified');
      expect(getSongVersion(song, 'full').activeVerification?.status).toBe('unverified');
    }

    // Explicit Option B check for grieg-morning-mood:melodyArrangement
    const grieg = REPERTOIRE.find((s) => s.id === 'grieg-morning-mood')!;
    const griegFullVer = getSongVerification(grieg, 'full');
    expect(griegFullVer.status).toBe('unverified');
    expect(griegFullVer.notes).toContain('Option B');
    expect(griegFullVer.notes).toContain('G# major');
  });

  it('enforces authoritative NMA provenance for Mozart K. 525 and rejects misattributed edition/locator metadata', () => {
    const mozart = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
    const excerptVer = getSongVerification(mozart, 'excerpt');
    const fullVer = getSongVerification(mozart, 'full');

    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(excerptVer.sourceMeasures).toBe('mm. 1–4');
    expect(fullVer.sourceMeasures).toBe('mm. 1–10');

    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceEdition).toContain('Karl Heinz Füssl');
      expect(ver.sourceEdition).toContain('Ernst Fritz Schmid');
      expect(ver.sourceEdition).toContain('BA 4544');
      expect(ver.sourceEdition).toContain('1964');
      expect(ver.sourceEdition).toContain('p. 43');
      expect(ver.sourceUrl).toContain('dme.mozarteum.at');
      expect(ver.sourceUrl).toContain('p1=43');
      expect(ver.sourcePart).toBe(
        'Violin I, melodic line, transposed one octave down for the training register'
      );

      // Negative assertions: must never reference Onslow IMSLP #70397, wrong NMA volume/editors, or stale 2-octave keyboard text
      expect(ver.sourceUrl).not.toContain('70397');
      expect(ver.sourceEdition).not.toContain('70397');
      expect(ver.sourceEdition).not.toContain('Haußwald');
      expect(ver.sourceEdition).not.toContain('Hausswald');
      expect(ver.sourceEdition).not.toContain('Plath');
      expect(ver.sourceEdition).not.toContain('BA 4525');
      expect(ver.sourceEdition).not.toContain('1961');
      expect(ver.sourceEdition).not.toContain('p. 45');
      expect(ver.sourcePart).not.toContain('2-octave');
    }

    const auditExcerpt = REPERTOIRE_AUDIT_REGISTRY.find((e) => e.id === 'mozart-nachtmusik:excerpt')!;
    const auditFull = REPERTOIRE_AUDIT_REGISTRY.find((e) => e.id === 'mozart-nachtmusik:melodyArrangement')!;
    for (const auditEntry of [auditExcerpt, auditFull]) {
      expect(auditEntry.verificationStatus).toBe('verified');
      expect(auditEntry.sourceEdition).toContain('Karl Heinz Füssl');
      expect(auditEntry.sourceEdition).toContain('Ernst Fritz Schmid');
      expect(auditEntry.sourceEdition).toContain('BA 4544');
      expect(auditEntry.sourceEdition).toContain('1964');
      expect(auditEntry.sourceUrl).toContain('dme.mozarteum.at');
      expect(auditEntry.sourceUrl).not.toContain('70397');
    }
  });

  it('preserves explicit rests in parseMusicXmlToSongDef (G4 -> REST -> A4 is never absorbed into G4)', () => {
    const xmlWithRest = `<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise version="4.0">
        <work><work-title>Rest Integrity Fixture</work-title></work>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>4</divisions>
              <key><fifths>1</fifths></key>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <direction><sound tempo="120"/></direction>
            <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
            <note><rest/><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
            <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
          </measure>
        </part>
      </score-partwise>`;

    const parsed = parseMusicXmlToSongDef(xmlWithRest);
    expect(parsed.notes).toEqual(['G4', 'A4']);
    expect(parsed.beats).toEqual([1, 0.5]);
    expect(parsed.restsAfter?.[0]).toBe(0.5);

    const rawEvents = songToRawMelodyEvents(parsed);
    expect(rawEvents).toEqual([
      { type: 'note', pitch: 'G4', beats: 1 },
      { type: 'rest', beats: 0.5 },
      { type: 'note', pitch: 'A4', beats: 0.5 }
    ]);

    const norm = normalizeSongToEvents(parsed);
    expect(norm).toEqual([
      {
        type: 'note',
        pitch: 'G4',
        startBeat: 0,
        durationBeats: 1,
        measure: 1,
        beatInMeasure: 0,
        noteIndex: 0
      },
      {
        type: 'rest',
        startBeat: 1,
        durationBeats: 0.5,
        measure: 1,
        beatInMeasure: 1
      },
      {
        type: 'note',
        pitch: 'A4',
        startBeat: 1.5,
        durationBeats: 0.5,
        measure: 1,
        beatInMeasure: 1.5,
        noteIndex: 1
      }
    ]);
  });

  it('matches the exact NMA reference-event fingerprint for Mozart K. 525 (excerpt mm. 1–4 and melodyArrangement mm. 1–10)', () => {
    const mozart = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
    expect(mozart.keySignatureFifths).toBe(1);
    expect(mozart.timeSignature).toEqual([4, 4]);
    expect(mozart.measureBeats).toBe(4);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // m. 1
      'm1@0:G4(1)', 'm1@1:REST(0.5)', 'm1@1.5:D4(0.5)', 'm1@2:G4(1)', 'm1@3:REST(0.5)', 'm1@3.5:D4(0.5)',
      // m. 2
      'm2@0:G4(0.5)', 'm2@0.5:D4(0.5)', 'm2@1:G4(0.5)', 'm2@1.5:B4(0.5)', 'm2@2:D5(1)', 'm2@3:REST(1)',
      // m. 3
      'm3@0:C5(1)', 'm3@1:REST(0.5)', 'm3@1.5:A4(0.5)', 'm3@2:C5(1)', 'm3@3:REST(0.5)', 'm3@3.5:A4(0.5)',
      // m. 4
      'm4@0:C5(0.5)', 'm4@0.5:A4(0.5)', 'm4@1:F#4(0.5)', 'm4@1.5:A4(0.5)', 'm4@2:D4(1)', 'm4@3:REST(1)'
    ];

    const excerptEvents = normalizeSongToEvents(mozart);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const mozartFull = getSongVersion(mozart, 'full');
    expect(getSongMeasureCount(mozartFull)).toBe(10);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // m. 5 (NMA K. 525 Violin I: eighth G4, eighth rest, dotted-quarter G4, eighth B4, eighth A4, eighth G4)
      'm5@0:G4(0.5)', 'm5@0.5:REST(0.5)', 'm5@1:G4(1.5)', 'm5@2.5:B4(0.5)', 'm5@3:A4(0.5)', 'm5@3.5:G4(0.5)',
      // m. 6 (appoggiatura G4 -> F#4, dotted-quarter F#4, eighth A4, eighth C5, eighth F#4)
      'm6@0:G4(0.5)', 'm6@0.5:F#4(0.5)', 'm6@1:F#4(1.5)', 'm6@2.5:A4(0.5)', 'm6@3:C5(0.5)', 'm6@3.5:F#4(0.5)',
      // m. 7 (appoggiatura A4 -> G4, dotted-quarter G4, eighth B4, eighth A4, eighth G4)
      'm7@0:A4(0.5)', 'm7@0.5:G4(0.5)', 'm7@1:G4(1.5)', 'm7@2.5:B4(0.5)', 'm7@3:A4(0.5)', 'm7@3.5:G4(0.5)',
      // m. 8 (appoggiatura G4 -> F#4, dotted-quarter F#4, eighth A4, eighth C5, eighth F#4)
      'm8@0:G4(0.5)', 'm8@0.5:F#4(0.5)', 'm8@1:F#4(1.5)', 'm8@2.5:A4(0.5)', 'm8@3:C5(0.5)', 'm8@3.5:F#4(0.5)',
      // m. 9
      'm9@0:G4(0.5)', 'm9@0.5:G4(0.5)', 'm9@1:F#4(0.5)', 'm9@1.5:E4(0.25)', 'm9@1.75:F#4(0.25)',
      'm9@2:G4(0.5)', 'm9@2.5:G4(0.5)', 'm9@3:A4(0.5)', 'm9@3.5:G4(0.25)', 'm9@3.75:A4(0.25)',
      // m. 10
      'm10@0:B4(0.5)', 'm10@0.5:B4(0.5)', 'm10@1:C5(0.5)', 'm10@1.5:B4(0.25)', 'm10@1.75:C5(0.25)',
      'm10@2:D5(1)', 'm10@3:REST(1)'
    ];

    const fullEvents = normalizeSongToEvents(mozartFull);
    expect(fullEvents).toHaveLength(65);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact G. Schirmer / Edition Peters reference-event fingerprint for Grieg Op. 46 No. 1 (excerpt mm. 1–4)', () => {
    const grieg = REPERTOIRE.find((s) => s.id === 'grieg-morning-mood')!;
    expect(grieg.timeSignature).toEqual([6, 8]);
    expect(grieg.measureBeats).toBe(3);
    expect(grieg.keySignatureFifths).toBe(4);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedGriegExcerptFingerprint = [
      // m. 1 (6 eighth notes in 6/8)
      'm1@0:B4(0.5)', 'm1@0.5:G#4(0.5)', 'm1@1:F#4(0.5)', 'm1@1.5:E4(0.5)', 'm1@2:F#4(0.5)', 'm1@2.5:G#4(0.5)',
      // m. 2 (4 eighth notes + 4 sixteenth notes F#4-G#4-F#4-G#4)
      'm2@0:B4(0.5)', 'm2@0.5:G#4(0.5)', 'm2@1:F#4(0.5)', 'm2@1.5:E4(0.5)',
      'm2@2:F#4(0.25)', 'm2@2.25:G#4(0.25)', 'm2@2.5:F#4(0.25)', 'm2@2.75:G#4(0.25)',
      // m. 3 (6 eighth notes)
      'm3@0:B4(0.5)', 'm3@0.5:G#4(0.5)', 'm3@1:B4(0.5)', 'm3@1.5:C#5(0.5)', 'm3@2:G#4(0.5)', 'm3@2.5:C#5(0.5)',
      // m. 4 (3 eighth notes + quarter E4 + eighth rest)
      'm4@0:B4(0.5)', 'm4@0.5:G#4(0.5)', 'm4@1:F#4(0.5)', 'm4@1.5:E4(1)', 'm4@2.5:REST(0.5)'
    ];

    const events = normalizeSongToEvents(grieg);
    expect(events).toHaveLength(25);
    expect(events.map(compact)).toEqual(expectedGriegExcerptFingerprint);

    const xml = songToMusicXml(grieg);
    expect(xml).toContain('<key><fifths>4</fifths></key>');
    expect(xml).toContain('<time><beats>6</beats><beat-type>8</beat-type></time>');
    expect(xml).toContain('<rest/>');
    // Measure 1 has 6 eighth notes beamed in two compound groups of 3 (begin, continue, end x 2)
    const m1Match = /<measure number="1">([\s\S]*?)<\/measure>/i.exec(xml);
    expect(m1Match).toBeTruthy();
    const m1Beams = Array.from(m1Match![1].matchAll(/<beam number="1">(begin|continue|end)<\/beam>/g)).map((m) => m[1]);
    expect(m1Beams).toEqual(['begin', 'continue', 'end', 'begin', 'continue', 'end']);
  });

  it('matches the exact 1902 John Stark & Son reference-event fingerprint for Joplin The Entertainer (excerpt and melodyArrangement)', () => {
    const joplin = REPERTOIRE.find((s) => s.id === 'joplin-entertainer')!;
    expect(joplin.timeSignature).toEqual([2, 4]);
    expect(joplin.measureBeats).toBe(2);
    expect(joplin.pickupBeats).toBe(0.5);
    expect(joplin.keySignatureFifths).toBe(0);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedJoplinExcerptFingerprint = [
      // Pickup (m. 1 in OSMD, implicit="yes", 0.5 beats = two 16ths at end of score m. 4)
      'm1@0:D4(0.25)', 'm1@0.25:D#4(0.25)',
      // Score m. 5 (m. 2 in OSMD): E4 on downbeat, C5 at 1.75 tied into score m. 6 for 1.5 beats total
      'm2@0:E4(0.25)', 'm2@0.25:C5(0.5)', 'm2@0.75:E4(0.25)', 'm2@1:C5(0.5)', 'm2@1.5:E4(0.25)', 'm2@1.75:C5(1.5)',
      // Score m. 6 (m. 3 in OSMD): after 1.25 beats of tied C5, three 16th pickups C5, D5, D#5
      'm3@1.25:C5(0.25)', 'm3@1.5:D5(0.25)', 'm3@1.75:D#5(0.25)',
      // Score m. 7 (m. 4 in OSMD)
      'm4@0:E5(0.25)', 'm4@0.25:C5(0.25)', 'm4@0.5:D5(0.25)', 'm4@0.75:E5(0.5)', 'm4@1.25:B4(0.25)', 'm4@1.5:D5(0.5)',
      // Score m. 8 (m. 5 in OSMD): C5 (1.5 beats) + eighth rest (0.5 beats)
      'm5@0:C5(1.5)', 'm5@1.5:REST(0.5)'
    ];

    const excerptEvents = normalizeSongToEvents(joplin);
    expect(excerptEvents).toHaveLength(19);
    expect(excerptEvents.map(compact)).toEqual(expectedJoplinExcerptFingerprint);

    const joplinFull = getSongVersion(joplin, 'full');
    expect(joplinFull.pickupBeats).toBe(0.5);

    const expectedJoplinFullFingerprint = [
      // Pickup (score m. 4 last two 16ths)
      'm1@0:D4(0.25)', 'm1@0.25:D#4(0.25)',
      // Score m. 5–6
      'm2@0:E4(0.25)', 'm2@0.25:C5(0.5)', 'm2@0.75:E4(0.25)', 'm2@1:C5(0.5)', 'm2@1.5:E4(0.25)', 'm2@1.75:C5(1.5)',
      'm3@1.25:C5(0.25)', 'm3@1.5:D5(0.25)', 'm3@1.75:D#5(0.25)',
      // Score m. 7–8
      'm4@0:E5(0.25)', 'm4@0.25:C5(0.25)', 'm4@0.5:D5(0.25)', 'm4@0.75:E5(0.5)', 'm4@1.25:B4(0.25)', 'm4@1.5:D5(0.5)',
      'm5@0:C5(1.5)', 'm5@1.5:D4(0.25)', 'm5@1.75:D#4(0.25)',
      // Score m. 9–10 (C5 tied across barline into dotted-quarter c4. = 1.75 beats total, followed by two 16ths A4, G4)
      'm6@0:E4(0.25)', 'm6@0.25:C5(0.5)', 'm6@0.75:E4(0.25)', 'm6@1:C5(0.5)', 'm6@1.5:E4(0.25)', 'm6@1.75:C5(1.75)',
      'm7@1.5:A4(0.25)', 'm7@1.75:G4(0.25)',
      // Score m. 11–12 (D5 held for 1.5 beats, followed by two 16ths D4, D#4)
      'm8@0:F#4(0.25)', 'm8@0.25:A4(0.25)', 'm8@0.5:C5(0.25)', 'm8@0.75:E5(0.5)',
      'm8@1.25:D5(0.25)', 'm8@1.5:C5(0.25)', 'm8@1.75:A4(0.25)',
      'm9@0:D5(1.5)', 'm9@1.5:D4(0.25)', 'm9@1.75:D#4(0.25)',
      // Score m. 13–14
      'm10@0:E4(0.25)', 'm10@0.25:C5(0.5)', 'm10@0.75:E4(0.25)', 'm10@1:C5(0.5)', 'm10@1.5:E4(0.25)', 'm10@1.75:C5(1.5)',
      'm11@1.25:C5(0.25)', 'm11@1.5:D5(0.25)', 'm11@1.75:D#5(0.25)',
      // Score m. 15–16
      'm12@0:E5(0.25)', 'm12@0.25:C5(0.25)', 'm12@0.5:D5(0.25)', 'm12@0.75:E5(0.5)', 'm12@1.25:B4(0.25)', 'm12@1.5:D5(0.5)',
      'm13@0:C5(1.5)', 'm13@1.5:C5(0.25)', 'm13@1.75:D5(0.25)',
      // Score m. 17–20
      'm14@0:E5(0.25)', 'm14@0.25:C5(0.25)', 'm14@0.5:D5(0.25)', 'm14@0.75:E5(0.5)',
      'm14@1.25:C5(0.25)', 'm14@1.5:D5(0.25)', 'm14@1.75:C5(0.25)',
      'm15@0:E5(0.25)', 'm15@0.25:C5(0.25)', 'm15@0.5:D5(0.25)', 'm15@0.75:E5(0.5)',
      'm15@1.25:C5(0.25)', 'm15@1.5:D5(0.25)', 'm15@1.75:C5(0.25)',
      'm16@0:E5(0.25)', 'm16@0.25:C5(0.25)', 'm16@0.5:D5(0.25)', 'm16@0.75:E5(0.5)',
      'm16@1.25:B4(0.25)', 'm16@1.5:D5(0.5)',
      'm17@0:C5(1.5)', 'm17@1.5:REST(0.5)'
    ];

    const fullEvents = normalizeSongToEvents(joplinFull);
    expect(fullEvents).toHaveLength(78);
    expect(fullEvents.map(compact)).toEqual(expectedJoplinFullFingerprint);

    // Note index 7 (C5[1.5] starting at m2@1.75) is split across barline into 3 tied notes (0.25 in m.2 + 1.0 + 0.25 in m.3)
    expect(getCursorSpanForNoteIndex(joplin, 7)).toBe(3);
    expect(getCursorStepForNoteIndex(joplin, 8) - getCursorStepForNoteIndex(joplin, 7)).toBe(3);
  });

  it('matches the exact Breitkopf & Härtel / Mutopia-528 reference-event fingerprint for Beethoven Ode to Joy (excerpt mm. 92–95 and melodyArrangement mm. 92–107)', () => {
    const ode = REPERTOIRE.find((s) => s.id === 'ode-joy')!;
    expect(ode.timeSignature).toEqual([4, 4]);
    expect(ode.measureBeats).toBe(4);
    expect(ode.keySignatureFifths).toBe(0);
    expect(ode.defaultBpm).toBe(104);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:E4(1)', 'm1@1:E4(1)', 'm1@2:F4(1)', 'm1@3:G4(1)',
      'm2@0:G4(1)', 'm2@1:F4(1)', 'm2@2:E4(1)', 'm2@3:D4(1)',
      'm3@0:C4(1)', 'm3@1:C4(1)', 'm3@2:D4(1)', 'm3@3:E4(1)',
      'm4@0:E4(1.5)', 'm4@1.5:D4(0.5)', 'm4@2:D4(2)'
    ];

    const excerptEvents = normalizeSongToEvents(ode);
    expect(excerptEvents).toHaveLength(15);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const odeFull = getSongVersion(ode, 'full');
    expect(getSongMeasureCount(odeFull)).toBe(16);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm5@0:E4(1)', 'm5@1:E4(1)', 'm5@2:F4(1)', 'm5@3:G4(1)',
      'm6@0:G4(1)', 'm6@1:F4(1)', 'm6@2:E4(1)', 'm6@3:D4(1)',
      'm7@0:C4(1)', 'm7@1:C4(1)', 'm7@2:D4(1)', 'm7@3:E4(1)',
      'm8@0:D4(1.5)', 'm8@1.5:C4(0.5)', 'm8@2:C4(2)',
      'm9@0:D4(1)', 'm9@1:D4(1)', 'm9@2:E4(1)', 'm9@3:C4(1)',
      'm10@0:D4(1)', 'm10@1:E4(0.5)', 'm10@1.5:F4(0.5)', 'm10@2:E4(1)', 'm10@3:C4(1)',
      'm11@0:D4(1)', 'm11@1:E4(0.5)', 'm11@1.5:F4(0.5)', 'm11@2:E4(1)', 'm11@3:D4(1)',
      'm12@0:C4(1)', 'm12@1:D4(1)', 'm12@2:G3(2)',
      'm13@0:E4(1)', 'm13@1:E4(1)', 'm13@2:F4(1)', 'm13@3:G4(1)',
      'm14@0:G4(1)', 'm14@1:F4(1)', 'm14@2:E4(1)', 'm14@3:D4(1)',
      'm15@0:C4(1)', 'm15@1:C4(1)', 'm15@2:D4(1)', 'm15@3:E4(1)',
      'm16@0:D4(1.5)', 'm16@1.5:C4(0.5)', 'm16@2:C4(2)'
    ];

    const fullEvents = normalizeSongToEvents(odeFull);
    expect(fullEvents).toHaveLength(62);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact Bach-Gesellschaft Band 43.2 / Mutopia-75 reference-event fingerprint for Christian Petzold Menuet in G, BWV Anh. 114 (excerpt mm. 1–8 and melodyArrangement mm. 1–32)', () => {
    const minuet = REPERTOIRE.find((s) => s.id === 'bach-minuet-g')!;
    expect(minuet.source).toContain('Christian Petzold');
    expect(REPERTOIRE_AUDIT_REGISTRY.find((e) => e.id === 'bach-minuet-g:excerpt')!.composer).toContain('Christian Petzold');
    expect(minuet.timeSignature).toEqual([3, 4]);
    expect(minuet.measureBeats).toBe(3);
    expect(minuet.keySignatureFifths).toBe(1);
    expect(minuet.defaultBpm).toBe(108);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:D5(1)', 'm1@1:G4(0.5)', 'm1@1.5:A4(0.5)', 'm1@2:B4(0.5)', 'm1@2.5:C5(0.5)',
      'm2@0:D5(1)', 'm2@1:G4(1)', 'm2@2:G4(1)',
      'm3@0:E5(1)', 'm3@1:C5(0.5)', 'm3@1.5:D5(0.5)', 'm3@2:E5(0.5)', 'm3@2.5:F#5(0.5)',
      'm4@0:G5(1)', 'm4@1:G4(1)', 'm4@2:G4(1)',
      'm5@0:C5(1)', 'm5@1:D5(0.5)', 'm5@1.5:C5(0.5)', 'm5@2:B4(0.5)', 'm5@2.5:A4(0.5)',
      'm6@0:B4(1)', 'm6@1:C5(0.5)', 'm6@1.5:B4(0.5)', 'm6@2:A4(0.5)', 'm6@2.5:G4(0.5)',
      'm7@0:F#4(1)', 'm7@1:G4(0.5)', 'm7@1.5:A4(0.5)', 'm7@2:B4(0.5)', 'm7@2.5:G4(0.5)',
      'm8@0:B4(1)', 'm8@1:A4(2)'
    ];

    const excerptEvents = normalizeSongToEvents(minuet);
    expect(excerptEvents).toHaveLength(33);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const minuetFull = getSongVersion(minuet, 'full');
    expect(getSongMeasureCount(minuetFull)).toBe(32);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm9@0:D5(1)', 'm9@1:G4(0.5)', 'm9@1.5:A4(0.5)', 'm9@2:B4(0.5)', 'm9@2.5:C5(0.5)',
      'm10@0:D5(1)', 'm10@1:G4(1)', 'm10@2:G4(1)',
      'm11@0:E5(1)', 'm11@1:C5(0.5)', 'm11@1.5:D5(0.5)', 'm11@2:E5(0.5)', 'm11@2.5:F#5(0.5)',
      'm12@0:G5(1)', 'm12@1:G4(1)', 'm12@2:G4(1)',
      'm13@0:C5(1)', 'm13@1:D5(0.5)', 'm13@1.5:C5(0.5)', 'm13@2:B4(0.5)', 'm13@2.5:A4(0.5)',
      'm14@0:B4(1)', 'm14@1:C5(0.5)', 'm14@1.5:B4(0.5)', 'm14@2:A4(0.5)', 'm14@2.5:G4(0.5)',
      'm15@0:A4(1)', 'm15@1:B4(0.5)', 'm15@1.5:A4(0.5)', 'm15@2:G4(0.5)', 'm15@2.5:F#4(0.5)',
      'm16@0:G4(3)',
      'm17@0:B5(1)', 'm17@1:G5(0.5)', 'm17@1.5:A5(0.5)', 'm17@2:B5(0.5)', 'm17@2.5:G5(0.5)',
      'm18@0:A5(1)', 'm18@1:D5(0.5)', 'm18@1.5:E5(0.5)', 'm18@2:F#5(0.5)', 'm18@2.5:D5(0.5)',
      'm19@0:G5(1)', 'm19@1:E5(0.5)', 'm19@1.5:F#5(0.5)', 'm19@2:G5(0.5)', 'm19@2.5:D5(0.5)',
      'm20@0:C#5(1)', 'm20@1:B4(0.5)', 'm20@1.5:C#5(0.5)', 'm20@2:A4(1)',
      'm21@0:A4(0.5)', 'm21@0.5:B4(0.5)', 'm21@1:C#5(0.5)', 'm21@1.5:D5(0.5)', 'm21@2:E5(0.5)', 'm21@2.5:F#5(0.5)',
      'm22@0:G5(1)', 'm22@1:F#5(1)', 'm22@2:E5(1)',
      'm23@0:F#5(1)', 'm23@1:A4(1)', 'm23@2:C#5(1)',
      'm24@0:D5(3)',
      'm25@0:D5(1)', 'm25@1:G4(0.5)', 'm25@1.5:F#4(0.5)', 'm25@2:G4(1)',
      'm26@0:E5(1)', 'm26@1:G4(0.5)', 'm26@1.5:F#4(0.5)', 'm26@2:G4(1)',
      'm27@0:D5(1)', 'm27@1:C5(1)', 'm27@2:B4(1)',
      'm28@0:A4(0.5)', 'm28@0.5:G4(0.5)', 'm28@1:F#4(0.5)', 'm28@1.5:G4(0.5)', 'm28@2:A4(1)',
      'm29@0:D4(0.5)', 'm29@0.5:E4(0.5)', 'm29@1:F#4(0.5)', 'm29@1.5:G4(0.5)', 'm29@2:A4(0.5)', 'm29@2.5:B4(0.5)',
      'm30@0:C5(1)', 'm30@1:B4(1)', 'm30@2:A4(1)',
      'm31@0:B4(0.5)', 'm31@0.5:D5(0.5)', 'm31@1:G4(1)', 'm31@2:F#4(1)',
      'm32@0:G4(3)'
    ];

    const fullEvents = normalizeSongToEvents(minuetFull);
    expect(fullEvents).toHaveLength(127);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact Breitkopf & Härtel Serie 18 Nr. 199 / Mutopia-931 reference-event fingerprint for Beethoven Für Elise WoO 59 (excerpt pickup + mm. 1–8a in 3/8)', () => {
    const elise = REPERTOIRE.find((s) => s.id === 'beethoven-fur-elise')!;
    expect(elise.timeSignature).toEqual([3, 8]);
    expect(elise.measureBeats).toBe(1.5);
    expect(elise.pickupBeats).toBe(0.5);
    expect(elise.keySignatureFifths).toBe(0);
    expect(elise.defaultBpm).toBe(72);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Pickup (2 sixteenth notes = 0.5 quarter-beats)
      'm1@0:E5(0.25)', 'm1@0.25:D#5(0.25)',
      // Score m. 1
      'm2@0:E5(0.25)', 'm2@0.25:D#5(0.25)', 'm2@0.5:E5(0.25)', 'm2@0.75:B4(0.25)', 'm2@1:D5(0.25)', 'm2@1.25:C5(0.25)',
      // Score m. 2 (eighth A4 + sixteenth rest + 3 sixteenths C4-E4-A4)
      'm3@0:A4(0.5)', 'm3@0.5:REST(0.25)', 'm3@0.75:C4(0.25)', 'm3@1:E4(0.25)', 'm3@1.25:A4(0.25)',
      // Score m. 3 (eighth B4 + sixteenth rest + 3 sixteenths E4-G#4-B4)
      'm4@0:B4(0.5)', 'm4@0.5:REST(0.25)', 'm4@0.75:E4(0.25)', 'm4@1:G#4(0.25)', 'm4@1.25:B4(0.25)',
      // Score m. 4 (eighth C5 + sixteenth rest + 3 sixteenths E4-E5-D#5)
      'm5@0:C5(0.5)', 'm5@0.5:REST(0.25)', 'm5@0.75:E4(0.25)', 'm5@1:E5(0.25)', 'm5@1.25:D#5(0.25)',
      // Score m. 5
      'm6@0:E5(0.25)', 'm6@0.25:D#5(0.25)', 'm6@0.5:E5(0.25)', 'm6@0.75:B4(0.25)', 'm6@1:D5(0.25)', 'm6@1.25:C5(0.25)',
      // Score m. 6
      'm7@0:A4(0.5)', 'm7@0.5:REST(0.25)', 'm7@0.75:C4(0.25)', 'm7@1:E4(0.25)', 'm7@1.25:A4(0.25)',
      // Score m. 7
      'm8@0:B4(0.5)', 'm8@0.5:REST(0.25)', 'm8@0.75:E4(0.25)', 'm8@1:C5(0.25)', 'm8@1.25:B4(0.25)',
      // Score m. 8 first ending (quarter A4 = 1.0 quarter-beats, leaving 0.5 for repeat pickup)
      'm9@0:A4(1)'
    ];

    const excerptEvents = normalizeSongToEvents(elise);
    expect(excerptEvents).toHaveLength(40);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    // Full arrangement is upgraded to 3/8 with explicit rests and dotted-eighth notes in mm. 9-11, kept unverified due to condensed mm. 12-14 transition
    const eliseFull = getSongVersion(elise, 'full');
    expect(getSongVerification(elise, 'full').status).toBe('unverified');
    expect(eliseFull.pickupBeats).toBe(0.5);
    expect(eliseFull.measureBeats).toBe(1.5);
    const fullEvents = normalizeSongToEvents(eliseFull);
    expect(fullEvents.filter((e) => e.type === 'rest')).toHaveLength(12);
  });

  it('matches the exact Collection Litolff / Mutopia-203 reference-event fingerprint for Burgmüller Op. 100 No. 2 L\'Arabesque (excerpt mm. 3–10a and melodyArrangement mm. 3–26a)', () => {
    const arabesque = REPERTOIRE.find((s) => s.id === 'burgmuller-arabesque')!;
    expect(arabesque.timeSignature).toEqual([2, 4]);
    expect(arabesque.measureBeats).toBe(2);
    expect(arabesque.keySignatureFifths).toBe(0);
    expect(arabesque.defaultBpm).toBe(120);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Score m. 3 (a16 b c b a8 r)
      'm1@0:A3(0.25)', 'm1@0.25:B3(0.25)', 'm1@0.5:C4(0.25)', 'm1@0.75:B3(0.25)', 'm1@1:A3(0.5)', 'm1@1.5:REST(0.5)',
      // Score m. 4 (a16 b c d e8 r)
      'm2@0:A3(0.25)', 'm2@0.25:B3(0.25)', 'm2@0.5:C4(0.25)', 'm2@0.75:D4(0.25)', 'm2@1:E4(0.5)', 'm2@1.5:REST(0.5)',
      // Score m. 5 (d16 e f g a8 r)
      'm3@0:D4(0.25)', 'm3@0.25:E4(0.25)', 'm3@0.5:F4(0.25)', 'm3@0.75:G4(0.25)', 'm3@1:A4(0.5)', 'm3@1.5:REST(0.5)',
      // Score m. 6–7 (a16 b c d e8 r | r8 e, e f)
      'm4@0:A4(0.25)', 'm4@0.25:B4(0.25)', 'm4@0.5:C5(0.25)', 'm4@0.75:D5(0.25)', 'm4@1:E5(0.5)', 'm4@1.5:REST(1)',
      'm5@0.5:E4(0.5)', 'm5@1:E4(0.5)', 'm5@1.5:F4(0.5)',
      // Score m. 8–9 (d8 r d4 ~ | d8 g d e)
      'm6@0:D4(0.5)', 'm6@0.5:REST(0.5)', 'm6@1:D4(1.5)',
      'm7@0.5:G4(0.5)', 'm7@1:D4(0.5)', 'm7@1.5:E4(0.5)',
      // Score m. 10a (first ending: c8 r e4)
      'm8@0:C4(0.5)', 'm8@0.5:REST(0.5)', 'm8@1:E4(1)'
    ];

    const excerptEvents = normalizeSongToEvents(arabesque);
    expect(excerptEvents).toHaveLength(36);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const arabesqueFull = getSongVersion(arabesque, 'full');
    expect(getSongMeasureCount(arabesqueFull)).toBe(24);

    const expectedFullFingerprint = [
      // Score mm. 3–9
      'm1@0:A3(0.25)', 'm1@0.25:B3(0.25)', 'm1@0.5:C4(0.25)', 'm1@0.75:B3(0.25)', 'm1@1:A3(0.5)', 'm1@1.5:REST(0.5)',
      'm2@0:A3(0.25)', 'm2@0.25:B3(0.25)', 'm2@0.5:C4(0.25)', 'm2@0.75:D4(0.25)', 'm2@1:E4(0.5)', 'm2@1.5:REST(0.5)',
      'm3@0:D4(0.25)', 'm3@0.25:E4(0.25)', 'm3@0.5:F4(0.25)', 'm3@0.75:G4(0.25)', 'm3@1:A4(0.5)', 'm3@1.5:REST(0.5)',
      'm4@0:A4(0.25)', 'm4@0.25:B4(0.25)', 'm4@0.5:C5(0.25)', 'm4@0.75:D5(0.25)', 'm4@1:E5(0.5)', 'm4@1.5:REST(1)',
      'm5@0.5:E4(0.5)', 'm5@1:E4(0.5)', 'm5@1.5:F4(0.5)',
      'm6@0:D4(0.5)', 'm6@0.5:REST(0.5)', 'm6@1:D4(1.5)',
      'm7@0.5:G4(0.5)', 'm7@1:D4(0.5)', 'm7@1.5:E4(0.5)',
      // Score m. 10b (second ending: c4 c'8 r)
      'm8@0:C4(1)', 'm8@1:C5(0.5)', 'm8@1.5:REST(0.5)',
      // Score mm. 11–18 (B section)
      'm9@0:E4(1.5)', 'm9@1.5:B3(0.5)',
      'm10@0:C4(1.5)', 'm10@1.5:A3(0.5)',
      'm11@0:E4(1.5)', 'm11@1.5:B3(0.5)',
      'm12@0:C4(1.5)', 'm12@1.5:A3(0.5)',
      'm13@0:A4(1.5)', 'm13@1.5:E4(0.5)',
      'm14@0:F4(1.5)', 'm14@1.5:E4(0.5)',
      'm15@0:D4(0.5)', 'm15@0.5:C4(0.5)', 'm15@1:B3(0.5)', 'm15@1.5:A3(0.5)',
      'm16@0:G#3(1)', 'm16@1:E4(1)',
      // Score mm. 19–26a (A' reprise)
      'm17@0:A3(0.25)', 'm17@0.25:B3(0.25)', 'm17@0.5:C4(0.25)', 'm17@0.75:B3(0.25)', 'm17@1:A3(0.5)', 'm17@1.5:REST(0.5)',
      'm18@0:A3(0.25)', 'm18@0.25:B3(0.25)', 'm18@0.5:C4(0.25)', 'm18@0.75:D4(0.25)', 'm18@1:E4(0.5)', 'm18@1.5:REST(0.5)',
      'm19@0:D4(0.25)', 'm19@0.25:E4(0.25)', 'm19@0.5:F4(0.25)', 'm19@0.75:G4(0.25)', 'm19@1:A4(0.5)', 'm19@1.5:REST(0.5)',
      'm20@0:A4(0.25)', 'm20@0.25:B4(0.25)', 'm20@0.5:C5(0.25)', 'm20@0.75:D5(0.25)', 'm20@1:E5(0.5)', 'm20@1.5:REST(1)',
      'm21@0.5:B3(0.5)', 'm21@1:B3(0.5)', 'm21@1.5:C4(0.5)',
      'm22@0:A3(1)', 'm22@1:E4(1.5)',
      'm23@0.5:B3(0.5)', 'm23@1:B3(0.5)', 'm23@1.5:C4(0.5)',
      'm24@0:A3(2)'
    ];

    const fullEvents = normalizeSongToEvents(arabesqueFull);
    expect(fullEvents).toHaveLength(87);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact G. Schirmer 1900 / Mutopia-2037 reference-event fingerprint for Hanon Exercise No. 1 (excerpt mm. 8–11 in 2/4)', () => {
    const hanon = REPERTOIRE.find((s) => s.id === 'hanon-1')!;
    expect(hanon.timeSignature).toEqual([2, 4]);
    expect(hanon.measureBeats).toBe(2);
    expect(hanon.keySignatureFifths).toBe(0);
    expect(hanon.defaultBpm).toBe(96);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:C4(0.25)', 'm1@0.25:E4(0.25)', 'm1@0.5:F4(0.25)', 'm1@0.75:G4(0.25)', 'm1@1:A4(0.25)', 'm1@1.25:G4(0.25)', 'm1@1.5:F4(0.25)', 'm1@1.75:E4(0.25)',
      'm2@0:D4(0.25)', 'm2@0.25:F4(0.25)', 'm2@0.5:G4(0.25)', 'm2@0.75:A4(0.25)', 'm2@1:B4(0.25)', 'm2@1.25:A4(0.25)', 'm2@1.5:G4(0.25)', 'm2@1.75:F4(0.25)',
      'm3@0:E4(0.25)', 'm3@0.25:G4(0.25)', 'm3@0.5:A4(0.25)', 'm3@0.75:B4(0.25)', 'm3@1:C5(0.25)', 'm3@1.25:B4(0.25)', 'm3@1.5:A4(0.25)', 'm3@1.75:G4(0.25)',
      'm4@0:F4(0.25)', 'm4@0.25:A4(0.25)', 'm4@0.5:B4(0.25)', 'm4@0.75:C5(0.25)', 'm4@1:D5(0.25)', 'm4@1.25:C5(0.25)', 'm4@1.5:B4(0.25)', 'm4@1.75:A4(0.25)'
    ];

    const excerptEvents = normalizeSongToEvents(hanon);
    expect(excerptEvents).toHaveLength(32);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const hanonFull = getSongVersion(hanon, 'full');
    expect(getSongVerification(hanon, 'full').status).toBe('unverified');
    expect(getSongMeasureCount(hanonFull)).toBe(16);
    expect(normalizeSongToEvents(hanonFull)).toHaveLength(121);
  });

  it('matches the exact Op. 599 No. 1 (PMLP08821) reference-event fingerprint for Czerny Practical Method for Beginners No. 1 (excerpt mm. 1–8 and melodyArrangement mm. 1–16)', () => {
    const czerny = REPERTOIRE.find((s) => s.id === 'czerny-599-1')!;
    expect(czerny.timeSignature).toEqual([4, 4]);
    expect(czerny.measureBeats).toBe(4);
    expect(czerny.keySignatureFifths).toBe(0);
    expect(czerny.defaultBpm).toBe(100);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:C5(4)',
      'm2@0:D5(2)', 'm2@2:E5(2)',
      'm3@0:C5(4)',
      'm4@0:D5(2)', 'm4@2:E5(2)',
      'm5@0:C5(2)', 'm5@2:E5(2)',
      'm6@0:G5(2)', 'm6@2:F5(2)',
      'm7@0:E5(2)', 'm7@2:D5(2)',
      'm8@0:C5(4)'
    ];

    const excerptEvents = normalizeSongToEvents(czerny);
    expect(excerptEvents).toHaveLength(13);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const czernyFull = getSongVersion(czerny, 'full');
    expect(getSongMeasureCount(czernyFull)).toBe(16);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm9@0:D5(2)', 'm9@2:E5(2)',
      'm10@0:F5(2)', 'm10@2:D5(2)',
      'm11@0:E5(2)', 'm11@2:F5(2)',
      'm12@0:G5(2)', 'm12@2:E5(2)',
      'm13@0:D5(2)', 'm13@2:E5(2)',
      'm14@0:F5(2)', 'm14@2:D5(2)',
      'm15@0:C5(2)', 'm15@2:E5(2)',
      'm16@0:C5(4)'
    ];

    const fullEvents = normalizeSongToEvents(czernyFull);
    expect(fullEvents).toHaveLength(28);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact Edition Peters Plate 8033 reference-event fingerprint for Beyer Op. 101 No. 8 (excerpt mm. 1–8 and melodyArrangement mm. 1–16)', () => {
    const beyer = REPERTOIRE.find((s) => s.id === 'beyer-101-8')!;
    expect(beyer.timeSignature).toEqual([4, 4]);
    expect(beyer.measureBeats).toBe(4);
    expect(beyer.keySignatureFifths).toBe(0);
    expect(beyer.defaultBpm).toBe(96);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:C5(1)', 'm1@1:E5(1)', 'm1@2:C5(1)', 'm1@3:E5(1)',
      'm2@0:G5(1)', 'm2@1:C5(1)', 'm2@2:C5(1)', 'm2@3:C5(1)',
      'm3@0:D5(1)', 'm3@1:D5(1)', 'm3@2:D5(1)', 'm3@3:D5(1)',
      'm4@0:E5(1)', 'm4@1:E5(1)', 'm4@2:E5(1)', 'm4@3:E5(1)',
      'm5@0:C5(1)', 'm5@1:E5(1)', 'm5@2:C5(1)', 'm5@3:E5(1)',
      'm6@0:G5(1)', 'm6@1:C5(1)', 'm6@2:C5(1)', 'm6@3:C5(1)',
      'm7@0:D5(1)', 'm7@1:D5(1)', 'm7@2:E5(1)', 'm7@3:D5(1)',
      'm8@0:C5(1)', 'm8@1:E5(1)', 'm8@2:C5(2)'
    ];

    const excerptEvents = normalizeSongToEvents(beyer);
    expect(excerptEvents).toHaveLength(31);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);

    // Negative assertions against previous unverified/invented Beyer patterns
    expect(actualExcerptFp).not.toContain('m1@1:D5(1)');
    expect(actualExcerptFp).not.toContain('m2@1:E5(1)');
    expect(actualExcerptFp).not.toContain('m3@1:E5(1)');
    expect(actualExcerptFp).not.toContain('m4@0:C5(1)');
    expect(actualExcerptFp).not.toContain('m6@1:E5(1)');
    expect(actualExcerptFp).not.toContain('m7@1:E5(1)');

    const beyerFull = getSongVersion(beyer, 'full');
    expect(getSongMeasureCount(beyerFull)).toBe(16);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm9@0:G5(1)', 'm9@1:D5(1)', 'm9@2:D5(1)', 'm9@3:D5(1)',
      'm10@0:E5(1)', 'm10@1:C5(1)', 'm10@2:C5(1)', 'm10@3:C5(1)',
      'm11@0:G5(1)', 'm11@1:D5(1)', 'm11@2:D5(1)', 'm11@3:D5(1)',
      'm12@0:E5(1)', 'm12@1:C5(1)', 'm12@2:E5(1)', 'm12@3:D5(1)',
      'm13@0:C5(1)', 'm13@1:E5(1)', 'm13@2:C5(1)', 'm13@3:E5(1)',
      'm14@0:G5(1)', 'm14@1:C5(1)', 'm14@2:C5(1)', 'm14@3:C5(1)',
      'm15@0:D5(1)', 'm15@1:D5(1)', 'm15@2:E5(1)', 'm15@3:D5(1)',
      'm16@0:C5(1)', 'm16@1:E5(1)', 'm16@2:C5(2)'
    ];

    const fullEvents = normalizeSongToEvents(beyerFull);
    expect(fullEvents).toHaveLength(62);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);

    expect(actualFullFp).not.toContain('m9@2:G5(1)');
    expect(actualFullFp).not.toContain('m10@2:E5(1)');
    expect(actualFullFp).not.toContain('m11@2:G5(1)');
    expect(actualFullFp).not.toContain('m12@3:C5(1)');
    expect(actualFullFp).not.toContain('m14@1:E5(1)');
    expect(actualFullFp).not.toContain('m15@1:E5(1)');
  });

  it('generates deterministic audit summaries directly from verified repertoire data and enforces Czerny and Beyer measure-by-measure report consistency', () => {
    const summaries = getAllVerifiedVariantAuditSummaries();
    const counts = getRepertoireVerificationCounts();
    expect(summaries).toHaveLength(counts.verified);

    for (const summary of summaries) {
      const baseSong = REPERTOIRE.find((s) => s.id === summary.songId)!;
      const versionMode = summary.variant === 'melodyArrangement' ? 'full' : 'excerpt';
      const song = getSongVersion(baseSong, versionMode);
      const events = normalizeSongToEvents(song);
      const ver = getSongVerification(baseSong, versionMode);

      expect(summary.verificationStatus).toBe('verified');
      expect(summary.eventCount).toBe(events.length);
      expect(summary.noteCount + summary.restCount).toBe(events.length);
      expect(summary.measureCount).toBe(getSongMeasureCount(song));
      expect(summary.sourceMeasures).toBe(ver.sourceMeasures);
      expect(summary.firstMeasureEvents.length).toBeGreaterThan(0);
      expect(summary.measureSummaries).toHaveLength(summary.measureCount);
      expect(summary.compactFingerprint).toHaveLength(events.length);
    }

    const czernyExcerptSummary = getVariantAuditSummary('czerny-599-1', 'excerpt');
    expect(czernyExcerptSummary.eventCount).toBe(13);
    expect(czernyExcerptSummary.totalBeats).toBe(32);
    expect(czernyExcerptSummary.measureCount).toBe(8);
    expect(czernyExcerptSummary.firstMeasureEvents).toEqual(['m1@0:C5(4)']);
    expect(czernyExcerptSummary.measureSummaries).toEqual([
      'm1: C5(4)',
      'm2: D5(2) E5(2)',
      'm3: C5(4)',
      'm4: D5(2) E5(2)',
      'm5: C5(2) E5(2)',
      'm6: G5(2) F5(2)',
      'm7: E5(2) D5(2)',
      'm8: C5(4)'
    ]);
    expect(czernyExcerptSummary.measureSummaries[0]).not.toContain('D5');

    const czernyFullSummary = getVariantAuditSummary('czerny-599-1', 'melodyArrangement');
    expect(czernyFullSummary.eventCount).toBe(28);
    expect(czernyFullSummary.totalBeats).toBe(64);
    expect(czernyFullSummary.measureCount).toBe(16);
    expect(czernyFullSummary.measureSummaries.slice(8)).toEqual([
      'm9: D5(2) E5(2)',
      'm10: F5(2) D5(2)',
      'm11: E5(2) F5(2)',
      'm12: G5(2) E5(2)',
      'm13: D5(2) E5(2)',
      'm14: F5(2) D5(2)',
      'm15: C5(2) E5(2)',
      'm16: C5(4)'
    ]);

    const beyerFullSummary = getVariantAuditSummary('beyer-101-8', 'melodyArrangement');
    expect(beyerFullSummary.eventCount).toBe(62);
    expect(beyerFullSummary.totalBeats).toBe(64);
    expect(beyerFullSummary.measureCount).toBe(16);
    expect(beyerFullSummary.measureSummaries).toEqual([
      'm1: C5(1) E5(1) C5(1) E5(1)',
      'm2: G5(1) C5(1) C5(1) C5(1)',
      'm3: D5(1) D5(1) D5(1) D5(1)',
      'm4: E5(1) E5(1) E5(1) E5(1)',
      'm5: C5(1) E5(1) C5(1) E5(1)',
      'm6: G5(1) C5(1) C5(1) C5(1)',
      'm7: D5(1) D5(1) E5(1) D5(1)',
      'm8: C5(1) E5(1) C5(2)',
      'm9: G5(1) D5(1) D5(1) D5(1)',
      'm10: E5(1) C5(1) C5(1) C5(1)',
      'm11: G5(1) D5(1) D5(1) D5(1)',
      'm12: E5(1) C5(1) E5(1) D5(1)',
      'm13: C5(1) E5(1) C5(1) E5(1)',
      'm14: G5(1) C5(1) C5(1) C5(1)',
      'm15: D5(1) D5(1) E5(1) D5(1)',
      'm16: C5(1) E5(1) C5(2)'
    ]);
  });

  it('matches the exact 1888 First Edition / Mutopia-37 reference-event fingerprint for Satie Gymnopédie No. 1 (excerpt mm. 5–16 and melodyArrangement mm. 5–39)', () => {
    const satie = REPERTOIRE.find((s) => s.id === 'satie-gymnopedie-1')!;
    expect(satie.timeSignature).toEqual([3, 4]);
    expect(satie.measureBeats).toBe(3);
    expect(satie.keySignatureFifths).toBe(2);
    expect(satie.defaultBpm).toBe(66);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Score mm. 5–8 (quarter rest on beat 1 of m. 5)
      'm1@0:REST(1)', 'm1@1:F#5(1)', 'm1@2:A5(1)',
      'm2@0:G5(1)', 'm2@1:F#5(1)', 'm2@2:C#5(1)',
      'm3@0:B4(1)', 'm3@1:C#5(1)', 'm3@2:D5(1)',
      'm4@0:A4(3)',
      // Score mm. 9–12 (F#4 tied across 4 measures = 12 beats)
      'm5@0:F#4(12)',
      // Score mm. 13–16 (quarter rest on beat 1 of m. 13)
      'm9@0:REST(1)', 'm9@1:F#5(1)', 'm9@2:A5(1)',
      'm10@0:G5(1)', 'm10@1:F#5(1)', 'm10@2:C#5(1)',
      'm11@0:B4(1)', 'm11@1:C#5(1)', 'm11@2:D5(1)',
      'm12@0:A4(3)'
    ];

    const excerptEvents = normalizeSongToEvents(satie);
    expect(excerptEvents).toHaveLength(21);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const satieFull = getSongVersion(satie, 'full');
    expect(getSongMeasureCount(satieFull)).toBe(35);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Score mm. 17–21 (C#5, F#5, and E4 tied across 3 measures = 9 beats)
      'm13@0:C#5(3)',
      'm14@0:F#5(3)',
      'm15@0:E4(9)',
      // Score mm. 22–26 (D5 tied for 5 beats across mm. 25–26, then quarter D5 on beat 3 of m. 26)
      'm18@0:A4(1)', 'm18@1:B4(1)', 'm18@2:C5(1)',
      'm19@0:E5(1)', 'm19@1:D5(1)', 'm19@2:B4(1)',
      'm20@0:D5(1)', 'm20@1:C5(1)', 'm20@2:B4(1)',
      'm21@0:D5(5)', 'm22@2:D5(1)',
      // Score mm. 27–31
      'm23@0:E5(1)', 'm23@1:F5(1)', 'm23@2:G5(1)',
      'm24@0:A5(1)', 'm24@1:C5(1)', 'm24@2:D5(1)',
      'm25@0:E5(1)', 'm25@1:D5(1)', 'm25@2:B4(1)',
      'm26@0:D5(5)', 'm27@2:D5(1)',
      // Score mm. 32–39 (first ending)
      'm28@0:G5(1)', 'm28@1:F#5(2)',
      'm29@0:B4(1)', 'm29@1:A4(1)', 'm29@2:B4(1)',
      'm30@0:C#5(1)', 'm30@1:D5(1)', 'm30@2:E5(1)',
      'm31@0:C#5(1)', 'm31@1:D5(1)', 'm31@2:E5(1)',
      'm32@0:F#4(3)',
      'm33@0:C5(3)',
      'm34@0:D5(3)',
      'm35@0:D5(3)'
    ];

    const fullEvents = normalizeSongToEvents(satieFull);
    expect(fullEvents).toHaveLength(61);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact Mus.ms. 16481/8 / Mutopia-2047 reference-event fingerprint for Pachelbel Canon in D, P. 37 (excerpt Violin I mm. 3–6 and melodyArrangement Violin I mm. 3–10)', () => {
    const canon = REPERTOIRE.find((s) => s.id === 'pachelbel-canon-d')!;
    expect(canon.timeSignature).toEqual([4, 4]);
    expect(canon.measureBeats).toBe(4);
    expect(canon.keySignatureFifths).toBe(2);
    expect(canon.defaultBpm).toBe(72);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:F#5(1)', 'm1@1:E5(1)', 'm1@2:D5(1)', 'm1@3:C#5(1)',
      'm2@0:B4(1)', 'm2@1:A4(1)', 'm2@2:B4(1)', 'm2@3:C#5(1)',
      'm3@0:D5(1)', 'm3@1:C#5(1)', 'm3@2:B4(1)', 'm3@3:A4(1)',
      'm4@0:G4(1)', 'm4@1:F#4(1)', 'm4@2:G4(1)', 'm4@3:E4(1)'
    ];

    const excerptEvents = normalizeSongToEvents(canon);
    expect(excerptEvents).toHaveLength(16);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const canonFull = getSongVersion(canon, 'full');
    expect(getSongMeasureCount(canonFull)).toBe(8);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm5@0:D4(0.5)', 'm5@0.5:F#4(0.5)', 'm5@1:A4(0.5)', 'm5@1.5:G4(0.5)', 'm5@2:F#4(0.5)', 'm5@2.5:D4(0.5)', 'm5@3:F#4(0.5)', 'm5@3.5:E4(0.5)',
      'm6@0:D4(0.5)', 'm6@0.5:B3(0.5)', 'm6@1:D4(0.5)', 'm6@1.5:A4(0.5)', 'm6@2:G4(0.5)', 'm6@2.5:B4(0.5)', 'm6@3:A4(0.5)', 'm6@3.5:G4(0.5)',
      'm7@0:F#4(0.5)', 'm7@0.5:D4(0.5)', 'm7@1:E4(0.5)', 'm7@1.5:C#5(0.5)', 'm7@2:D5(0.5)', 'm7@2.5:F#5(0.5)', 'm7@3:A5(0.5)', 'm7@3.5:A4(0.5)',
      'm8@0:B4(0.5)', 'm8@0.5:G4(0.5)', 'm8@1:A4(0.5)', 'm8@1.5:F#4(0.5)', 'm8@2:D4(0.5)', 'm8@2.5:D5(0.5)', 'm8@3:D5(0.75)', 'm8@3.75:C#5(0.25)'
    ];

    const fullEvents = normalizeSongToEvents(canonFull);
    expect(fullEvents).toHaveLength(48);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('enforces authoritative bibliographic provenance for Tchaikovsky Op. 20 (Jurgenson Plate 4432 vs. Broude Brothers 1951 Plate B.B. 59) and Dvořák Op. 95 (Simrock Orchestral Parts Plate 10140 vs. Full Score Plate 10139)', () => {
    // 1. Tchaikovsky Swan Lake Op. 20 Act II No. 10
    const swan = REPERTOIRE.find((s) => s.id === 'tchaikovsky-swan-lake')!;
    const swanExcerptVer = getSongVerification(swan, 'excerpt');
    const swanFullVer = getSongVerification(swan, 'full');

    expect(swanExcerptVer.status).toBe('verified');
    expect(swanFullVer.status).toBe('verified');
    expect(swanExcerptVer.sourceEdition).toContain('pp. 223–224');
    expect(swanFullVer.sourceEdition).toContain('pp. 223–226');

    for (const ver of [swanExcerptVer, swanFullVer]) {
      expect(ver.sourceEdition).toContain('Jurgenson');
      expect(ver.sourceEdition).toContain('4432');
      if (/B\.B\.\s*59/i.test(ver.sourceEdition ?? '')) {
        expect(ver.sourceEdition).toContain('Broude Brothers');
        expect(ver.sourceEdition).toContain('1951');
      }
      // Negative assertions: must never associate Plate B.B. 59 directly with P. Jurgenson 1895
      expect(ver.sourceEdition).not.toMatch(/Jurgenson[^;]*B\.B\.\s*59/i);
      expect(ver.sourceEdition).not.toMatch(/Plate\s+B\.B\.\s*59\s*\(1895\)/i);
      expect(ver.notes).not.toMatch(/Jurgenson\s+Plate\s+B\.B\.\s*59/i);
    }

    for (const entryId of ['tchaikovsky-swan-lake:excerpt', 'tchaikovsky-swan-lake:melodyArrangement'] as const) {
      const auditEntry = REPERTOIRE_AUDIT_REGISTRY.find((e) => e.id === entryId)!;
      expect(auditEntry.verificationStatus).toBe('verified');
      expect(auditEntry.sourceEdition).toContain('Jurgenson');
      expect(auditEntry.sourceEdition).toContain('4432');
      expect(auditEntry.sourceEdition).toContain('Broude Brothers');
      expect(auditEntry.sourceEdition).toContain('1951');
      expect(auditEntry.sourceEdition).not.toMatch(/Jurgenson[^;]*B\.B\.\s*59/i);
    }

    // 2. Dvořák Symphony No. 9, Op. 95, II. Largo
    const dvorak = REPERTOIRE.find((s) => s.id === 'dvorak-new-world-largo')!;
    const dvorakExcerptVer = getSongVerification(dvorak, 'excerpt');
    const dvorakFullVer = getSongVerification(dvorak, 'full');

    expect(dvorakExcerptVer.status).toBe('verified');
    expect(dvorakFullVer.status).toBe('verified');

    for (const ver of [dvorakExcerptVer, dvorakFullVer]) {
      expect(ver.sourceEdition).toContain('Simrock');
      expect(ver.sourceEdition).toContain('1894');
      expect(ver.sourceEdition).toContain('10140');
      expect(ver.sourceEdition).toMatch(/Orchestral Parts/i);
      expect(ver.sourcePart).toContain('Oboe 1, 2 / English Horn orchestral part');
      // Negative assertions: Plate 10140 is Orchestral Parts (Full Score is Plate 10139); must never call 10140 a Full Score
      expect(ver.sourceEdition).not.toMatch(/Full Score[^;]*10140/i);
      expect(ver.sourceEdition).not.toContain('Full Score');
    }

    for (const entryId of ['dvorak-new-world-largo:excerpt', 'dvorak-new-world-largo:melodyArrangement'] as const) {
      const auditEntry = REPERTOIRE_AUDIT_REGISTRY.find((e) => e.id === entryId)!;
      expect(auditEntry.verificationStatus).toBe('verified');
      expect(auditEntry.sourceEdition).toContain('10140');
      expect(auditEntry.sourceEdition).toMatch(/Orchestral Parts/i);
      expect(auditEntry.sourceEdition).not.toContain('Full Score');
      expect(auditEntry.sourcePart).toContain('Oboe 1, 2 / English Horn orchestral part');
    }
  });

  it('matches the exact P. Jurgenson (1895, Plate 4432; repr. Broude Brothers 1951, Plate B.B. 59) Oboe I reference-event fingerprint for Tchaikovsky Swan Lake, Op. 20, Act II No. 10 (excerpt mm. 2–5 and melodyArrangement mm. 2–19)', () => {
    const swan = REPERTOIRE.find((s) => s.id === 'tchaikovsky-swan-lake')!;
    expect(swan.timeSignature).toEqual([4, 4]);
    expect(swan.measureBeats).toBe(4);
    expect(swan.keySignatureFifths).toBe(0);
    expect(swan.defaultBpm).toBe(84);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Score m. 2 (bar 1)
      'm1@0:E5(2)', 'm1@2:A4(0.5)', 'm1@2.5:B4(0.5)', 'm1@3:C5(0.5)', 'm1@3.5:D5(0.5)',
      // Score m. 3 (bar 2)
      'm2@0:E5(1.5)', 'm2@1.5:C5(0.5)', 'm2@2:E5(1.5)', 'm2@3.5:C5(0.5)',
      // Score m. 4 (bar 3)
      'm3@0:E5(1.5)', 'm3@1.5:A4(0.5)', 'm3@2:C5(0.5)', 'm3@2.5:A4(0.5)', 'm3@3:F4(0.5)', 'm3@3.5:C5(0.5)',
      // Score m. 5 (bar 4: tied half+eighth A4(2.5) + D5–C5–B4 lead-back)
      'm4@0:A4(2.5)', 'm4@2.5:D5(0.5)', 'm4@3:C5(0.5)', 'm4@3.5:B4(0.5)'
    ];

    const excerptEvents = normalizeSongToEvents(swan);
    expect(excerptEvents).toHaveLength(19);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    expect(actualExcerptFp).not.toContain('m4@0:A4(4)');

    const swanFull = getSongVersion(swan, 'full');
    expect(getSongMeasureCount(swanFull)).toBe(18);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Score mm. 6–9 (bars 5–8)
      'm5@0:E5(2)', 'm5@2:A4(0.5)', 'm5@2.5:B4(0.5)', 'm5@3:C5(0.5)', 'm5@3.5:D5(0.5)',
      'm6@0:E5(1.5)', 'm6@1.5:C5(0.5)', 'm6@2:E5(1.5)', 'm6@3.5:C5(0.5)',
      'm7@0:E5(1.5)', 'm7@1.5:A4(0.5)', 'm7@2:C5(0.5)', 'm7@2.5:A4(0.5)', 'm7@3:F4(0.5)', 'm7@3.5:C5(0.5)',
      'm8@0:A4(3)', 'm8@3:A4(1)',
      // Score mm. 10–13 (bars 9–12)
      'm9@0:B4(1)', 'm9@1:C5(1)', 'm9@2:D5(1)', 'm9@3:E5(0.5)', 'm9@3.5:F5(0.5)',
      'm10@0:G5(1.5)', 'm10@1.5:F5(0.5)', 'm10@2:E5(1)', 'm10@3:F5(0.5)', 'm10@3.5:G5(0.5)',
      'm11@0:A5(1.5)', 'm11@1.5:G5(0.5)', 'm11@2:F5(1)', 'm11@3:G5(0.5)', 'm11@3.5:A5(0.5)',
      'm12@0:B5(1.5)', 'm12@1.5:A5(0.5)', 'm12@2:E5(0.5)', 'm12@2.5:C5(0.5)', 'm12@3:B4(0.5)', 'm12@3.5:A4(0.5)',
      // Score mm. 14–18 (bars 13–17, including Neapolitan inflection in Score m. 17 = bar 16)
      'm13@0:B4(1)', 'm13@1:C5(1)', 'm13@2:D5(1)', 'm13@3:E5(0.5)', 'm13@3.5:F5(0.5)',
      'm14@0:G5(1.5)', 'm14@1.5:F5(0.5)', 'm14@2:E5(1)', 'm14@3:F5(0.5)', 'm14@3.5:G5(0.5)',
      'm15@0:A5(1.5)', 'm15@1.5:G5(0.5)', 'm15@2:F5(1)', 'm15@3:G5(0.5)', 'm15@3.5:A5(0.5)',
      'm16@0:A#5(1.5)', 'm16@1.5:D#5(0.5)', 'm16@2:D5(1)', 'm16@3:F5(0.5)', 'm16@3.5:A#5(0.5)',
      'm17@0:B5(1.5)', 'm17@1.5:E5(0.5)', 'm17@2:B5(1.5)', 'm17@3.5:C5(0.5)',
      // Score m. 19 (bar 18, Rehearsal Mark [1]: A5(1) + REST(3))
      'm18@0:A5(1)', 'm18@1:REST(3)'
    ];

    const fullEvents = normalizeSongToEvents(swanFull);
    expect(fullEvents).toHaveLength(83);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);

    // Negative assertions against old shifted B-section and synthetic repeat
    expect(actualFullFp).not.toContain('m8@3:B4(1)');
    expect(actualFullFp).not.toContain('m9@0:C5(1)');
    expect(actualFullFp).not.toContain('m16@0:G#5(2)');
  });

  it('matches the exact Le Cène 1725 / Mutopia-301 reference-event fingerprint for Vivaldi Spring, RV 269, I. Allegro (excerpt pickup + mm. 1–3a and melodyArrangement pickup + mm. 1–13)', () => {
    const vivaldi = REPERTOIRE.find((s) => s.id === 'vivaldi-spring')!;
    expect(vivaldi.timeSignature).toEqual([4, 4]);
    expect(vivaldi.measureBeats).toBe(4);
    expect(vivaldi.pickupBeats).toBe(0.5);
    expect(vivaldi.keySignatureFifths).toBe(0);
    expect(vivaldi.defaultBpm).toBe(100);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Pickup (m1 in OSMD, 0.5 beat)
      'm1@0:C5(0.5)',
      // Score m. 1 (m2 in OSMD)
      'm2@0:E5(0.5)', 'm2@0.5:E5(0.5)', 'm2@1:E5(0.5)', 'm2@1.5:D5(0.25)', 'm2@1.75:C5(0.25)', 'm2@2:G5(1.5)', 'm2@3.5:G5(0.25)', 'm2@3.75:F5(0.25)',
      // Score m. 2 (m3 in OSMD)
      'm3@0:E5(0.5)', 'm3@0.5:E5(0.5)', 'm3@1:E5(0.5)', 'm3@1.5:D5(0.25)', 'm3@1.75:C5(0.25)', 'm3@2:G5(1.5)', 'm3@3.5:G5(0.25)', 'm3@3.75:F5(0.25)',
      // Score m. 3a (m4 in OSMD, 3.5 beats ending on D5–B4–G4)
      'm4@0:E5(0.5)', 'm4@0.5:F5(0.25)', 'm4@0.75:G5(0.25)', 'm4@1:F5(0.5)', 'm4@1.5:E5(0.5)', 'm4@2:D5(0.5)', 'm4@2.5:B4(0.5)', 'm4@3:G4(0.5)'
    ];

    const excerptEvents = normalizeSongToEvents(vivaldi);
    expect(excerptEvents).toHaveLength(25);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    expect(actualExcerptFp).not.toContain('m1@0:C5(1)');
    expect(actualExcerptFp).not.toContain('m2@0:E5(1)');

    const vivaldiFull = getSongVersion(vivaldi, 'full');
    expect(vivaldiFull.pickupBeats).toBe(0.5);
    expect(getSongMeasureCount(vivaldiFull)).toBe(14);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Pickup to Piano repeat at m4@3.5 (Score m. 3 last eighth)
      'm4@3.5:C5(0.5)',
      // Score mm. 4–6 (m5–m7 in OSMD, with r8 rest at m7@3)
      'm5@0:E5(0.5)', 'm5@0.5:E5(0.5)', 'm5@1:E5(0.5)', 'm5@1.5:D5(0.25)', 'm5@1.75:C5(0.25)', 'm5@2:G5(1.5)', 'm5@3.5:G5(0.25)', 'm5@3.75:F5(0.25)',
      'm6@0:E5(0.5)', 'm6@0.5:E5(0.5)', 'm6@1:E5(0.5)', 'm6@1.5:D5(0.25)', 'm6@1.75:C5(0.25)', 'm6@2:G5(1.5)', 'm6@3.5:G5(0.25)', 'm6@3.75:F5(0.25)',
      'm7@0:E5(0.5)', 'm7@0.5:F5(0.25)', 'm7@0.75:G5(0.25)', 'm7@1:F5(0.5)', 'm7@1.5:E5(0.5)', 'm7@2:D5(1)', 'm7@3:REST(0.5)', 'm7@3.5:C5(0.5)',
      // Score mm. 7–9 (m8–m10 in OSMD, Forte second phrase)
      'm8@0:G5(0.5)', 'm8@0.5:F5(0.25)', 'm8@0.75:E5(0.25)', 'm8@1:F5(0.5)', 'm8@1.5:G5(0.5)', 'm8@2:A5(0.5)', 'm8@2.5:G5(1)', 'm8@3.5:C5(0.5)',
      'm9@0:G5(0.5)', 'm9@0.5:F5(0.25)', 'm9@0.75:E5(0.25)', 'm9@1:F5(0.5)', 'm9@1.5:G5(0.5)', 'm9@2:A5(0.5)', 'm9@2.5:G5(1)', 'm9@3.5:C5(0.5)',
      'm10@0:A5(0.5)', 'm10@0.5:G5(1)', 'm10@1.5:F5(0.5)', 'm10@2:E5(0.5)', 'm10@2.5:D5(0.25)', 'm10@2.75:C5(0.25)', 'm10@3:D5(1)',
      // Score mm. 10–13 (m11–m14 in OSMD, Piano repeat + final cadence and quarter rest)
      'm11@0:C5(1)', 'm11@1:REST(0.5)', 'm11@1.5:C5(0.5)', 'm11@2:G5(0.5)', 'm11@2.5:F5(0.25)', 'm11@2.75:E5(0.25)', 'm11@3:F5(0.5)', 'm11@3.5:G5(0.5)',
      'm12@0:A5(0.5)', 'm12@0.5:G5(1)', 'm12@1.5:C5(0.5)', 'm12@2:G5(0.5)', 'm12@2.5:F5(0.25)', 'm12@2.75:E5(0.25)', 'm12@3:F5(0.5)', 'm12@3.5:G5(0.5)',
      'm13@0:A5(0.5)', 'm13@0.5:G5(1)', 'm13@1.5:C5(0.5)', 'm13@2:A5(0.5)', 'm13@2.5:G5(1)', 'm13@3.5:F5(0.5)',
      'm14@0:E5(0.5)', 'm14@0.5:D5(0.25)', 'm14@0.75:C5(0.25)', 'm14@1:D5(1)', 'm14@2:C5(1)', 'm14@3:REST(1)'
    ];

    const fullEvents = normalizeSongToEvents(vivaldiFull);
    expect(fullEvents).toHaveLength(101);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('matches the exact N. Simrock First Edition Orchestral Parts (1894, Plate 10140) / Mutopia-1793 Oboe 1, 2 / English Horn reference-event fingerprint for Dvořák Symphony No. 9, Op. 95, II. Largo (excerpt mm. 7–10 and melodyArrangement mm. 7–18)', () => {
    const dvorak = REPERTOIRE.find((s) => s.id === 'dvorak-new-world-largo')!;
    expect(dvorak.timeSignature).toEqual([4, 4]);
    expect(dvorak.measureBeats).toBe(4);
    expect(dvorak.keySignatureFifths).toBe(0);
    expect(dvorak.defaultBpm).toBe(56);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Score m. 7 (bar 1)
      'm1@0:E4(0.75)', 'm1@0.75:G4(0.25)', 'm1@1:G4(1)', 'm1@2:E4(0.75)', 'm1@2.75:D4(0.25)', 'm1@3:C4(1)',
      // Score m. 8 (bar 2)
      'm2@0:D4(0.75)', 'm2@0.75:E4(0.25)', 'm2@1:G4(0.75)', 'm2@1.75:E4(0.25)', 'm2@2:D4(2)',
      // Score m. 9 (bar 3)
      'm3@0:E4(0.75)', 'm3@0.75:G4(0.25)', 'm3@1:G4(1)', 'm3@2:E4(0.75)', 'm3@2.75:D4(0.25)', 'm3@3:C4(1)',
      // Score m. 10 (bar 4: two eighth notes D4(0.5)–E4(0.5) on beat 1)
      'm4@0:D4(0.5)', 'm4@0.5:E4(0.5)', 'm4@1:D4(0.75)', 'm4@1.75:C4(0.25)', 'm4@2:C4(2)'
    ];

    const excerptEvents = normalizeSongToEvents(dvorak);
    expect(excerptEvents).toHaveLength(22);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    expect(actualExcerptFp).not.toContain('m1@0:E4(1.5)');

    const dvorakFull = getSongVersion(dvorak, 'full');
    expect(getSongMeasureCount(dvorakFull)).toBe(12);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Score mm. 11–14 (bars 5–8)
      'm5@0:A4(0.75)', 'm5@0.75:C5(0.25)', 'm5@1:C5(1)', 'm5@2:B4(0.5)', 'm5@2.5:G4(0.5)', 'm5@3:A4(1)',
      'm6@0:A4(0.5)', 'm6@0.5:C5(0.5)', 'm6@1:B4(0.5)', 'm6@1.5:G4(0.5)', 'm6@2:A4(2)',
      'm7@0:A4(0.75)', 'm7@0.75:C5(0.25)', 'm7@1:C5(1)', 'm7@2:B4(0.5)', 'm7@2.5:G4(0.5)', 'm7@3:A4(1)',
      'm8@0:A4(0.5)', 'm8@0.5:C5(0.5)', 'm8@1:B4(0.5)', 'm8@1.5:G4(0.5)', 'm8@2:A4(2)',
      // Score mm. 15–18 (bars 9–12: E4(0.5)–D4(0.5) in m. 15; ascending C4–D4–E4 in m. 17; A3 cadence in m. 18)
      'm9@0:E4(0.75)', 'm9@0.75:G4(0.25)', 'm9@1:G4(1)', 'm9@2:E4(0.5)', 'm9@2.5:D4(0.5)', 'm9@3:C4(1)',
      'm10@0:D4(0.75)', 'm10@0.75:E4(0.25)', 'm10@1:G4(0.75)', 'm10@1.75:E4(0.25)', 'm10@2:D4(2)',
      'm11@0:E4(0.75)', 'm11@0.75:G4(0.25)', 'm11@1:G4(1)', 'm11@2:C4(0.75)', 'm11@2.75:D4(0.25)', 'm11@3:E4(1)',
      'm12@0:D4(0.75)', 'm12@0.75:C4(0.25)', 'm12@1:D4(0.5)', 'm12@1.5:A3(0.5)', 'm12@2:C4(2)'
    ];

    const fullEvents = normalizeSongToEvents(dvorakFull);
    expect(fullEvents).toHaveLength(66);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);
    expect(actualFullFp).not.toContain('m11@2:E4(0.75)');
    expect(actualFullFp).not.toContain('m12@0:D4(0.5)');
  });

  it('matches the exact N. Simrock 1868 / Mutopia-1037 reference-event fingerprint for Brahms Wiegenlied, Op. 49 No. 4 (excerpt m. 2b–10a and melodyArrangement m. 2b–18)', () => {
    const brahms = REPERTOIRE.find((s) => s.id === 'brahms-wiegenlied')!;
    expect(brahms.timeSignature).toEqual([3, 4]);
    expect(brahms.measureBeats).toBe(3);
    expect(brahms.pickupBeats).toBe(1);
    expect(brahms.keySignatureFifths).toBe(0);
    expect(brahms.defaultBpm).toBe(76);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Pickup (m1 in OSMD, 1.0 beat)
      'm1@0:E4(0.5)', 'm1@0.5:E4(0.5)',
      // Score m. 3 (m2 in OSMD)
      'm2@0:G4(1.5)', 'm2@1.5:E4(0.5)', 'm2@2:E4(1)',
      // Score m. 4 (m3 in OSMD: quarter G4 + quarter rest + eighth pickup)
      'm3@0:G4(1)', 'm3@1:REST(1)', 'm3@2:E4(0.5)', 'm3@2.5:G4(0.5)',
      // Score m. 5 (m4 in OSMD)
      'm4@0:C5(1)', 'm4@1:B4(1.5)', 'm4@2.5:A4(0.5)',
      // Score m. 6 (m5 in OSMD)
      'm5@0:A4(1)', 'm5@1:G4(1)', 'm5@2:D4(0.5)', 'm5@2.5:E4(0.5)',
      // Score m. 7 (m6 in OSMD)
      'm6@0:F4(1)', 'm6@1:D4(1)', 'm6@2:D4(0.5)', 'm6@2.5:E4(0.5)',
      // Score m. 8 (m7 in OSMD: quarter F4 + quarter rest + eighth pickup)
      'm7@0:F4(1)', 'm7@1:REST(1)', 'm7@2:D4(0.5)', 'm7@2.5:F4(0.5)',
      // Score m. 9 (m8 in OSMD)
      'm8@0:B4(0.5)', 'm8@0.5:A4(0.5)', 'm8@1:G4(1)', 'm8@2:B4(1)',
      // Score m. 10a (m9 in OSMD: quarter C5 + quarter rest)
      'm9@0:C5(1)', 'm9@1:REST(1)'
    ];

    const excerptEvents = normalizeSongToEvents(brahms);
    expect(excerptEvents).toHaveLength(30);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    expect(actualExcerptFp).not.toContain('m3@0:G4(2)');
    expect(actualExcerptFp).not.toContain('m7@0:F4(2)');
    expect(actualExcerptFp).not.toContain('m9@0:C5(2)');

    const brahmsFull = getSongVersion(brahms, 'full');
    expect(brahmsFull.pickupBeats).toBe(1);
    expect(getSongMeasureCount(brahmsFull)).toBe(17);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Score m. 10b pickup (m9@2 in OSMD)
      'm9@2:C4(0.5)', 'm9@2.5:C4(0.5)',
      // Score mm. 11–18 (m10–m17 in OSMD)
      'm10@0:C5(2)', 'm10@2:A4(0.5)', 'm10@2.5:F4(0.5)',
      'm11@0:G4(2)', 'm11@2:E4(0.5)', 'm11@2.5:C4(0.5)',
      'm12@0:F4(1)', 'm12@1:G4(1)', 'm12@2:A4(1)',
      'm13@0:G4(2)', 'm13@2:C4(0.5)', 'm13@2.5:C4(0.5)',
      'm14@0:C5(2)', 'm14@2:A4(0.5)', 'm14@2.5:F4(0.5)',
      'm15@0:G4(2)', 'm15@2:E4(0.5)', 'm15@2.5:C4(0.5)',
      'm16@0:F4(1)', 'm16@1:E4(1)', 'm16@2:D4(1)',
      'm17@0:C4(2)'
    ];

    const fullEvents = normalizeSongToEvents(brahmsFull);
    expect(fullEvents).toHaveLength(54);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('verifies five-note-c (excerpt mm. 1–3 & melodyArrangement mm. 1–12) event-by-event against Piano Key Trainer Original Pedagogical Exercise specification', () => {
    const fiveNote = REPERTOIRE.find((s) => s.id === 'five-note-c')!;
    expect(getSongVerification(fiveNote, 'excerpt').status).toBe('verified');
    expect(getSongVerification(fiveNote, 'full').status).toBe('verified');
    expect(fiveNote.keySignatureFifths).toBe(0);
    expect(fiveNote.timeSignature).toEqual([4, 4]);
    expect(fiveNote.measureBeats).toBe(4);
    expect(fiveNote.defaultBpm).toBe(84);
    expect(getSongMeasureCount(fiveNote)).toBe(3);

    for (const ver of [getSongVerification(fiveNote, 'excerpt'), getSongVerification(fiveNote, 'full')]) {
      expect(ver.sourceEdition).toContain('Piano Key Trainer Original Pedagogical Exercise');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // Piano Key Trainer Original Pedagogical Exercise (C4–G4 5-finger position, 4/4, mm. 1–3)
    const expectedExcerptFingerprint = [
      'm1@0:C4(1)', 'm1@1:D4(1)', 'm1@2:E4(1)', 'm1@3:F4(1)',
      'm2@0:G4(1)', 'm2@1:F4(1)', 'm2@2:E4(1)', 'm2@3:D4(1)',
      'm3@0:C4(4)'
    ];
    const excerptEvents = normalizeSongToEvents(fiveNote);
    expect(excerptEvents).toHaveLength(9);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    // Sequential 12-measure pedagogical exercise (C4–G4, D4–A4, E4–C5 modules)
    const fiveNoteFull = getSongVersion(fiveNote, 'full');
    expect(getSongMeasureCount(fiveNoteFull)).toBe(12);
    const expectedFullFingerprint = [
      // Module 1 (C4–G4 + broken C-major triad)
      'm1@0:C4(1)', 'm1@1:D4(1)', 'm1@2:E4(1)', 'm1@3:F4(1)',
      'm2@0:G4(1)', 'm2@1:F4(1)', 'm2@2:E4(1)', 'm2@3:D4(1)',
      'm3@0:C4(1)', 'm3@1:E4(1)', 'm3@2:G4(1)', 'm3@3:E4(1)',
      'm4@0:C4(4)',
      // Module 2 (D4–A4 + broken D-minor triad)
      'm5@0:D4(1)', 'm5@1:E4(1)', 'm5@2:F4(1)', 'm5@3:G4(1)',
      'm6@0:A4(1)', 'm6@1:G4(1)', 'm6@2:F4(1)', 'm6@3:E4(1)',
      'm7@0:D4(1)', 'm7@1:F4(1)', 'm7@2:A4(1)', 'm7@3:F4(1)',
      'm8@0:D4(4)',
      // Module 3 (E4–C5 + stepwise tonic cadence)
      'm9@0:E4(1)', 'm9@1:F4(1)', 'm9@2:G4(1)', 'm9@3:A4(1)',
      'm10@0:B4(1)', 'm10@1:A4(1)', 'm10@2:G4(1)', 'm10@3:F4(1)',
      'm11@0:E4(1)', 'm11@1:G4(1)', 'm11@2:C5(1)', 'm11@3:G4(1)',
      'm12@0:E4(1)', 'm12@1:D4(1)', 'm12@2:C4(2)'
    ];
    const fullEvents = normalizeSongToEvents(fiveNoteFull);
    expect(fullEvents).toHaveLength(41);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('verifies Mary Had a Little Lamb (excerpt mm. 1–4 & melodyArrangement mm. 1–8) event-by-event against the "Merrily We Roll Along" chorus melody in Carmina Yalensia (1867, p. 47) and Carmina Collegensia (1868, p. 41)', () => {
    const mary = REPERTOIRE.find((s) => s.id === 'mary-lamb')!;
    const excerptVer = getSongVerification(mary, 'excerpt');
    const fullVer = getSongVerification(mary, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(mary.keySignatureFifths).toBe(0);
    expect(mary.timeSignature).toEqual([4, 4]);
    expect(mary.measureBeats).toBe(4);
    expect(mary.defaultBpm).toBe(100);
    expect(getSongMeasureCount(mary)).toBe(4);

    // Provenance regression assertions:
    // 1. Primary musical source must be Carmina Yalensia (1867, p. 47, "Good Night" / "Merrily We Roll Along") & Carmina Collegensia (1868, p. 41)
    // 2. Must not claim E. P. Christy (1847) as direct source of the "Merrily We Roll Along" chorus melody (Christy 1847 "Farewell Ladies" is only an earlier precursor)
    // 3. Must not use the unreviewed Wikibooks image File:Mary_Had_a_Little_Lamb_Harmony.png as sourceUrl
    expect(mary.source).toContain('Carmina Yalensia, 1867, p. 47');
    expect(mary.source).not.toContain('мелодия E. P. Christy (1847)');
    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceTitle).toContain('Sarah Josepha Hale');
      expect(ver.sourceTitle).toContain('Carmina Yalensia, 1867, p. 47');
      expect(ver.sourceTitle).toContain('precursor');
      expect(ver.sourceEdition).toContain('Carmina Yalensia');
      expect(ver.sourceEdition).toContain('1867');
      expect(ver.sourceEdition).toContain('p. 47');
      expect(ver.sourceEdition).toContain('Carmina Collegensia');
      expect(ver.sourceUrl).toContain('Carmina_Yalensia');
      expect(ver.sourceUrl).not.toContain('Mary_Had_a_Little_Lamb_Harmony.png');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:E4(1)', 'm1@1:D4(1)', 'm1@2:C4(1)', 'm1@3:D4(1)',
      'm2@0:E4(1)', 'm2@1:E4(1)', 'm2@2:E4(2)',
      'm3@0:D4(1)', 'm3@1:D4(1)', 'm3@2:D4(2)',
      'm4@0:E4(1)', 'm4@1:G4(1)', 'm4@2:G4(2)'
    ];
    const excerptEvents = normalizeSongToEvents(mary);
    expect(excerptEvents).toHaveLength(13);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const maryFull = getSongVersion(mary, 'full');
    expect(getSongMeasureCount(maryFull)).toBe(8);
    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      'm5@0:E4(1)', 'm5@1:D4(1)', 'm5@2:C4(1)', 'm5@3:D4(1)',
      'm6@0:E4(1)', 'm6@1:E4(1)', 'm6@2:E4(1)', 'm6@3:E4(1)',
      'm7@0:D4(1)', 'm7@1:D4(1)', 'm7@2:E4(1)', 'm7@3:D4(1)',
      'm8@0:C4(4)'
    ];
    const fullEvents = normalizeSongToEvents(maryFull);
    expect(fullEvents).toHaveLength(26);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('verifies Twinkle, Twinkle, Little Star (excerpt mm. 1–4 & melodyArrangement mm. 1–12) event-by-event with accurate Bouin early-1760s (1762) historical context, exact BnF Gallica Recueil d\'Airs Choisis ([1770–1790], ark:/12148/btv1b52501904w/f102, pp. 99–100) scan, and modern transcription cross-check', () => {
    const twinkle = REPERTOIRE.find((s) => s.id === 'twinkle')!;
    const excerptVer = getSongVerification(twinkle, 'excerpt');
    const fullVer = getSongVerification(twinkle, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(twinkle.keySignatureFifths).toBe(0);
    expect(twinkle.timeSignature).toEqual([4, 4]);
    expect(twinkle.measureBeats).toBe(4);
    expect(twinkle.defaultBpm).toBe(96);
    expect(getSongMeasureCount(twinkle)).toBe(4);

    // Provenance regression assertions (Milestone 3B.5B-3 Rev3):
    // 1. sourceUrl === https://gallica.bnf.fr/ark:/12148/btv1b52501904w/f102.item
    // 2. sourceEdition contains "Recueil d'Airs Choisis", "1770–1790", and "pp. 99–100"
    // 3. sourceEdition does NOT contain "1761" ("Les Amusements ... 1761"), "earliest known printed witness", or "Recueil de Romances"
    expect(twinkle.source).not.toContain('Mozart');
    expect(twinkle.source).not.toContain('1761');
    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceTitle).toContain('Ah! vous dirai-je, maman');
      expect(ver.sourceTitle).toContain('18th-century French melody');
      expect(ver.sourceTitle).toContain('Jane Taylor');
      expect(ver.sourceTitle).not.toContain('1761');
      expect(ver.sourceUrl).toBe('https://gallica.bnf.fr/ark:/12148/btv1b52501904w/f102.item');
      expect(ver.sourceUrl).not.toContain('Ah!_vous_dirai-je,_Maman_(partition).jpg');
      expect(ver.sourceEdition).toContain('Historical context: François Bouin publications of the melody in the early 1760s');
      expect(ver.sourceEdition).toContain('1762');
      expect(ver.sourceEdition).toContain('Recueil d\'Airs Choisis');
      expect(ver.sourceEdition).toContain('1770–1790');
      expect(ver.sourceEdition).toContain('pp. 99–100');
      expect(ver.sourceEdition).toContain('ark:/12148/btv1b52501904w/f102');
      expect(ver.sourceEdition).toContain('Modern transcription reference for event cross-check:');
      expect(ver.sourceEdition).not.toContain('1761');
      expect(ver.sourceEdition).not.toContain('earliest known printed witness');
      expect(ver.sourceEdition).not.toContain('Recueil de Romances');
      expect(ver.notes).toContain('Recueil d\'Airs Choisis');
      expect(ver.notes).toContain('1770–1790');
      expect(ver.notes).toContain('pp. 99–100');
      expect(ver.notes).not.toContain('1761');
      expect(ver.notes).not.toContain('earliest known printed witness');
      expect(ver.notes).not.toContain('Recueil de Romances');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      'm1@0:C4(1)', 'm1@1:C4(1)', 'm1@2:G4(1)', 'm1@3:G4(1)',
      'm2@0:A4(1)', 'm2@1:A4(1)', 'm2@2:G4(2)',
      'm3@0:F4(1)', 'm3@1:F4(1)', 'm3@2:E4(1)', 'm3@3:E4(1)',
      'm4@0:D4(1)', 'm4@1:D4(1)', 'm4@2:C4(2)'
    ];
    const excerptEvents = normalizeSongToEvents(twinkle);
    expect(excerptEvents).toHaveLength(14);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const twinkleFull = getSongVersion(twinkle, 'full');
    expect(getSongMeasureCount(twinkleFull)).toBe(12);
    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Section B1 ("Up above the world so high")
      'm5@0:G4(1)', 'm5@1:G4(1)', 'm5@2:F4(1)', 'm5@3:F4(1)',
      'm6@0:E4(1)', 'm6@1:E4(1)', 'm6@2:D4(2)',
      // Section B2 ("Like a diamond in the sky")
      'm7@0:G4(1)', 'm7@1:G4(1)', 'm7@2:F4(1)', 'm7@3:F4(1)',
      'm8@0:E4(1)', 'm8@1:E4(1)', 'm8@2:D4(2)',
      // Section A Da Capo ("Twinkle, twinkle, little star...")
      'm9@0:C4(1)', 'm9@1:C4(1)', 'm9@2:G4(1)', 'm9@3:G4(1)',
      'm10@0:A4(1)', 'm10@1:A4(1)', 'm10@2:G4(2)',
      'm11@0:F4(1)', 'm11@1:F4(1)', 'm11@2:E4(1)', 'm11@3:E4(1)',
      'm12@0:D4(1)', 'm12@1:D4(1)', 'm12@2:C4(2)'
    ];
    const fullEvents = normalizeSongToEvents(twinkleFull);
    expect(fullEvents).toHaveLength(42);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('verifies Korobeiniki excerpt (mm. 1–4 in 4/4) against the public-domain Russian folk dance-song score (File:Korobeiniki.svg, transposed to A minor) while retaining melodyArrangement as an honestly unverified hybrid Tetris adaptation', () => {
    const korobeiniki = REPERTOIRE.find((s) => s.id === 'korobeiniki-tetris')!;
    const excerptVer = getSongVerification(korobeiniki, 'excerpt');
    const fullVer = getSongVerification(korobeiniki, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('unverified');
    expect(korobeiniki.keySignatureFifths).toBe(0);
    expect(korobeiniki.timeSignature).toEqual([4, 4]);
    expect(korobeiniki.measureBeats).toBe(4);
    expect(korobeiniki.defaultBpm).toBe(132);
    expect(getSongMeasureCount(korobeiniki)).toBe(4);

    expect(excerptVer.sourceUrl).toBe('https://commons.wikimedia.org/wiki/File:Korobeiniki.svg');
    expect(fullVer.notes).toContain('deliberate adaptation');
    expect(fullVer.notes).toContain('mm. 9–16');

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // Public-domain Russian folk dance-song variant (File:Korobeiniki.svg Part A, transposed -3 semitones to A minor in 4/4)
    const expectedExcerptFingerprint = [
      'm1@0:E5(1)', 'm1@1:B4(0.5)', 'm1@1.5:C5(0.5)', 'm1@2:D5(1)', 'm1@3:C5(0.5)', 'm1@3.5:B4(0.5)',
      'm2@0:A4(1)', 'm2@1:A4(0.5)', 'm2@1.5:C5(0.5)', 'm2@2:E5(1)', 'm2@3:D5(0.5)', 'm2@3.5:C5(0.5)',
      'm3@0:B4(1.5)', 'm3@1.5:C5(0.5)', 'm3@2:D5(1)', 'm3@3:E5(1)',
      'm4@0:C5(1)', 'm4@1:A4(1)', 'm4@2:A4(2)'
    ];
    const excerptEvents = normalizeSongToEvents(korobeiniki);
    expect(excerptEvents).toHaveLength(19);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const korobeinikiFull = getSongVersion(korobeiniki, 'full');
    expect(getSongMeasureCount(korobeinikiFull)).toBe(16);
    const fullEvents = normalizeSongToEvents(korobeinikiFull);
    expect(fullEvents).toHaveLength(52);
    expect(fullEvents.slice(0, 19).map(compact)).toEqual(expectedExcerptFingerprint);
  });

  it('verifies Mykola Leontovych Shchedryk (excerpt mm. 1–4 & melodyArrangement mm. 17–32) event-by-event against the 1916 Ukrainian SATB choral score (Щедрик.pdf, transposed +2 semitones from G minor to A minor)', () => {
    const shchedryk = REPERTOIRE.find((s) => s.id === 'leontovych-shchedryk')!;
    const excerptVer = getSongVerification(shchedryk, 'excerpt');
    const fullVer = getSongVerification(shchedryk, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(shchedryk.keySignatureFifths).toBe(0);
    expect(shchedryk.timeSignature).toEqual([3, 4]);
    expect(shchedryk.measureBeats).toBe(3);
    expect(shchedryk.defaultBpm).toBe(138);
    expect(getSongMeasureCount(shchedryk)).toBe(4);

    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceTitle).toContain('Mykola Leontovych');
      expect(ver.sourceUrl).toContain('%D0%A9%D0%B5%D0%B4%D1%80%D0%B8%D0%BA.pdf');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // Leontovych 1916 SATB score mm. 1–4 (Soprano ostinato Bb4–A4–Bb4–G4 in G minor -> C5–B4–C5–A4 in A minor)
    const expectedExcerptFingerprint = [
      'm1@0:C5(1)', 'm1@1:B4(0.5)', 'm1@1.5:C5(0.5)', 'm1@2:A4(1)',
      'm2@0:C5(1)', 'm2@1:B4(0.5)', 'm2@1.5:C5(0.5)', 'm2@2:A4(1)',
      'm3@0:C5(1)', 'm3@1:B4(0.5)', 'm3@1.5:C5(0.5)', 'm3@2:A4(1)',
      'm4@0:C5(1)', 'm4@1:B4(0.5)', 'm4@1.5:C5(0.5)', 'm4@2:A4(1)'
    ];
    const excerptEvents = normalizeSongToEvents(shchedryk);
    expect(excerptEvents).toHaveLength(16);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    // Negative assertion: must not contain the Wilhousky-derived E5–D5–E5–C5 shift in mm. 3–4
    expect(actualExcerptFp).not.toContain('m3@0:E5(1)');

    // Leontovych 1916 SATB score mm. 17–32 (16 contiguous measures, transposed +2 semitones to A minor)
    const shchedrykFull = getSongVersion(shchedryk, 'full');
    expect(getSongMeasureCount(shchedrykFull)).toBe(16);
    const expectedFullFingerprint = [
      // Score mm. 17–20 (m1–m4: Soprano ostinato)
      'm1@0:C5(1)', 'm1@1:B4(0.5)', 'm1@1.5:C5(0.5)', 'm1@2:A4(1)',
      'm2@0:C5(1)', 'm2@1:B4(0.5)', 'm2@1.5:C5(0.5)', 'm2@2:A4(1)',
      'm3@0:C5(1)', 'm3@1:B4(0.5)', 'm3@1.5:C5(0.5)', 'm3@2:A4(1)',
      'm4@0:C5(1)', 'm4@1:B4(0.5)', 'm4@1.5:C5(0.5)', 'm4@2:A4(1)',
      // Score mm. 21–24 (m5–m8: Soprano forte climax)
      'm5@0:E5(1)', 'm5@1:E5(0.5)', 'm5@1.5:E5(0.5)', 'm5@2:D5(0.5)', 'm5@2.5:C5(0.5)',
      'm6@0:C5(1)', 'm6@1:C5(0.5)', 'm6@1.5:C5(0.5)', 'm6@2:B4(0.5)', 'm6@2.5:A4(0.5)',
      'm7@0:D5(1)', 'm7@1:D5(0.5)', 'm7@1.5:D5(0.5)', 'm7@2:C5(0.5)', 'm7@2.5:B4(0.5)',
      'm8@0:C5(1)', 'm8@1:B4(0.5)', 'm8@1.5:C5(0.5)', 'm8@2:A4(1)',
      // Score mm. 25–28 (m9–m12: Alto ascending melodic-minor scale under Soprano tied E5 pedal)
      'm9@0:E4(0.5)', 'm9@0.5:F#4(0.5)', 'm9@1:G#4(0.5)', 'm9@1.5:A4(0.5)', 'm9@2:B4(0.5)', 'm9@2.5:C5(0.5)',
      'm10@0:D5(0.5)', 'm10@0.5:E5(0.5)', 'm10@1:D5(1)', 'm10@2:C5(1)',
      'm11@0:E4(0.5)', 'm11@0.5:F#4(0.5)', 'm11@1:G#4(0.5)', 'm11@1.5:A4(0.5)', 'm11@2:B4(0.5)', 'm11@2.5:C5(0.5)',
      'm12@0:D5(0.5)', 'm12@0.5:E5(0.5)', 'm12@1:D5(1)', 'm12@2:C5(1)',
      // Score mm. 29–32 (m13–m16: Soprano ostinato return)
      'm13@0:C5(1)', 'm13@1:B4(0.5)', 'm13@1.5:C5(0.5)', 'm13@2:A4(1)',
      'm14@0:C5(1)', 'm14@1:B4(0.5)', 'm14@1.5:C5(0.5)', 'm14@2:A4(1)',
      'm15@0:C5(1)', 'm15@1:B4(0.5)', 'm15@1.5:C5(0.5)', 'm15@2:A4(1)',
      'm16@0:C5(1)', 'm16@1:B4(0.5)', 'm16@1.5:C5(0.5)', 'm16@2:A4(1)'
    ];
    const fullEvents = normalizeSongToEvents(shchedrykFull);
    expect(fullEvents).toHaveLength(71);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);
    // Negative assertion: must not contain the unauthentic A5–A5–A5–G5–F5 Wilhousky climax
    expect(actualFullFp.some((tok) => tok.includes(':A5('))).toBe(false);
  });

  it('verifies Greensleeves (excerpt pickup + mm. 1–8a & melodyArrangement pickup + mm. 1–32) event-by-event against Mutopia-2008/01/20-1265 (GreensleevesAcc.ly in A minor, 3/4)', () => {
    const greensleeves = REPERTOIRE.find((s) => s.id === 'greensleeves')!;
    expect(getSongVerification(greensleeves, 'excerpt').status).toBe('verified');
    expect(getSongVerification(greensleeves, 'full').status).toBe('verified');
    expect(greensleeves.keySignatureFifths).toBe(0);
    expect(greensleeves.timeSignature).toEqual([3, 4]);
    expect(greensleeves.measureBeats).toBe(3);
    expect(greensleeves.pickupBeats).toBe(1);
    expect(greensleeves.defaultBpm).toBe(88);
    expect(getSongMeasureCount(greensleeves)).toBe(9);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    const expectedExcerptFingerprint = [
      // Pickup (m1 in OSMD)
      'm1@0:A4(1)',
      // Score mm. 1–8a (m2–m9 in OSMD)
      'm2@0:C5(2)', 'm2@2:D5(1)',
      'm3@0:E5(1.5)', 'm3@1.5:F5(0.5)', 'm3@2:E5(1)',
      'm4@0:D5(2)', 'm4@2:B4(1)',
      'm5@0:G4(1.5)', 'm5@1.5:A4(0.5)', 'm5@2:B4(1)',
      'm6@0:C5(2)', 'm6@2:A4(1)',
      'm7@0:A4(1.5)', 'm7@1.5:G#4(0.5)', 'm7@2:A4(1)',
      'm8@0:B4(2)', 'm8@2:G#4(1)',
      'm9@0:E4(2)'
    ];
    const excerptEvents = normalizeSongToEvents(greensleeves);
    expect(excerptEvents).toHaveLength(19);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const greensleevesFull = getSongVersion(greensleeves, 'full');
    expect(greensleevesFull.pickupBeats).toBe(1);
    // 1 pickup measure + 32 full 3/4 measures = 33 OSMD measures
    expect(getSongMeasureCount(greensleevesFull)).toBe(33);

    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Pickup to score m. 9 (m9@2 in OSMD)
      'm9@2:A4(1)',
      // Score mm. 9–16 (m10–m17 in OSMD, ending with two-bar tonic cadence A4(3) | A4(3))
      'm10@0:C5(2)', 'm10@2:D5(1)',
      'm11@0:E5(1.5)', 'm11@1.5:F5(0.5)', 'm11@2:E5(1)',
      'm12@0:D5(2)', 'm12@2:B4(1)',
      'm13@0:G4(1.5)', 'm13@1.5:A4(0.5)', 'm13@2:B4(1)',
      'm14@0:C5(1.5)', 'm14@1.5:B4(0.5)', 'm14@2:A4(1)',
      'm15@0:G#4(1.5)', 'm15@1.5:F#4(0.5)', 'm15@2:G#4(1)',
      'm16@0:A4(3)',
      'm17@0:A4(3)',
      // Score mm. 17–24 ("Greensleeves was all my joy", m18–m25 in OSMD)
      'm18@0:G5(3)',
      'm19@0:G5(1.5)', 'm19@1.5:F#5(0.5)', 'm19@2:E5(1)',
      'm20@0:D5(2)', 'm20@2:B4(1)',
      'm21@0:G4(1.5)', 'm21@1.5:A4(0.5)', 'm21@2:B4(1)',
      'm22@0:C5(2)', 'm22@2:A4(1)',
      'm23@0:A4(1.5)', 'm23@1.5:G#4(0.5)', 'm23@2:A4(1)',
      'm24@0:B4(2)', 'm24@2:G#4(1)',
      'm25@0:E4(3)',
      // Score mm. 25–32 ("Greensleeves was my delight...", m26–m33 in OSMD)
      'm26@0:G5(3)',
      'm27@0:G5(1.5)', 'm27@1.5:F#5(0.5)', 'm27@2:E5(1)',
      'm28@0:D5(2)', 'm28@2:B4(1)',
      'm29@0:G4(1.5)', 'm29@1.5:A4(0.5)', 'm29@2:B4(1)',
      'm30@0:C5(1.5)', 'm30@1.5:B4(0.5)', 'm30@2:A4(1)',
      'm31@0:G#4(1.5)', 'm31@1.5:F#4(0.5)', 'm31@2:G#4(1)',
      'm32@0:A4(3)',
      'm33@0:A4(3)'
    ];
    const fullEvents = normalizeSongToEvents(greensleevesFull);
    expect(fullEvents).toHaveLength(72);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);
    // Negative assertion: refrain G5(3) must not enter prematurely in OSMD m17 (score m. 16)
    expect(actualFullFp).not.toContain('m17@0:G5(3)');
  });

  it('verifies Bella Ciao (excerpt pickup + mm. 1–4a & melodyArrangement pickup + mm. 1–8) event-by-event against File:BellaCiao Accordion.png (StropheEins, transposed +7 semitones from D minor to A minor, pickupBeats = 1.5)', () => {
    const bella = REPERTOIRE.find((s) => s.id === 'bella-ciao')!;
    expect(getSongVerification(bella, 'excerpt').status).toBe('verified');
    expect(getSongVerification(bella, 'full').status).toBe('verified');
    expect(bella.keySignatureFifths).toBe(0);
    expect(bella.timeSignature).toEqual([4, 4]);
    expect(bella.measureBeats).toBe(4);
    expect(bella.pickupBeats).toBe(1.5);
    expect(bella.defaultBpm).toBe(116);
    expect(getSongMeasureCount(bella)).toBe(5);

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // File:BellaCiao Accordion.png StropheEins (transposed +7 semitones from D minor to A minor):
    // \partial 4. E4(0.5) A4(0.5) B4(0.5) | C5(0.5) A4(2) E4(0.5) A4(0.5) B4(0.5) | ...
    const expectedExcerptFingerprint = [
      // Pickup (1.5 beats, m1 in OSMD: "U-na mat-")
      'm1@0:E4(0.5)', 'm1@0.5:A4(0.5)', 'm1@1:B4(0.5)',
      // Score m. 1 (m2 in OSMD: "-ti-na mi son sve-")
      'm2@0:C5(0.5)', 'm2@0.5:A4(2)', 'm2@2.5:E4(0.5)', 'm2@3:A4(0.5)', 'm2@3.5:B4(0.5)',
      // Score m. 2 (m3 in OSMD: "-glia-to, o bel-la")
      'm3@0:C5(0.5)', 'm3@0.5:A4(2)', 'm3@2.5:E4(0.5)', 'm3@3:A4(0.5)', 'm3@3.5:B4(0.5)',
      // Score m. 3 (m4 in OSMD: "ciao, bel-la ciao, bel-la")
      'm4@0:C5(1)', 'm4@1:B4(0.5)', 'm4@1.5:A4(0.5)', 'm4@2:C5(1)', 'm4@3:B4(0.5)', 'm4@3.5:A4(0.5)',
      // Score m. 4a (m5 in OSMD: "ciao, ciao, ciao!")
      'm5@0:E5(1)', 'm5@1:E5(1)', 'm5@2:E5(0.5)'
    ];
    const excerptEvents = normalizeSongToEvents(bella);
    expect(excerptEvents).toHaveLength(22);
    const actualExcerptFp = excerptEvents.map(compact);
    expect(actualExcerptFp).toEqual(expectedExcerptFingerprint);
    // Negative assertion: C5 must not be trapped in the pickup at m1@1.5
    expect(actualExcerptFp).not.toContain('m1@1.5:C5(0.5)');
    expect(actualExcerptFp).not.toContain('m2@0:A4(2)');

    const bellaFull = getSongVersion(bella, 'full');
    expect(bellaFull.pickupBeats).toBe(1.5);
    expect(getSongMeasureCount(bellaFull)).toBe(9);
    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // Score m. 4b pickup to second half ("u-na mat-", m5@2.5..3.5 in OSMD)
      'm5@2.5:E5(0.5)', 'm5@3:D5(0.5)', 'm5@3.5:E5(0.5)',
      // Score m. 5 (m6 in OSMD: "-ti-na mi son sve-")
      'm6@0:F5(0.5)', 'm6@0.5:F5(2)', 'm6@2.5:F5(0.5)', 'm6@3:E5(0.5)', 'm6@3.5:D5(0.5)',
      // Score m. 6 (m7 in OSMD: "-glia-to ed ho tro-")
      'm7@0:F5(0.5)', 'm7@0.5:E5(2)', 'm7@2.5:E5(0.5)', 'm7@3:D5(0.5)', 'm7@3.5:C5(0.5)',
      // Score m. 7 (m8 in OSMD: "-va-to l'in-va-")
      'm8@0:B4(1)', 'm8@1:E5(1)', 'm8@2:C5(1)', 'm8@3:B4(1)',
      // Score m. 8 (m9 in OSMD: "-sor.")
      'm9@0:A4(4)'
    ];
    const fullEvents = normalizeSongToEvents(bellaFull);
    expect(fullEvents).toHaveLength(40);
    expect(fullEvents.map(compact)).toEqual(expectedFullFingerprint);
  });

  it('verifies Sakura Sakura (excerpt mm. 1–6 & melodyArrangement mm. 1–14) event-by-event against the 1888 文部省音楽取調掛 Sōkyoku-shū 『箏曲集』 koto notation (NDL info:ndljp/pid/857651, DOI 10.11501/857651, frames 22–23)', () => {
    const sakura = REPERTOIRE.find((s) => s.id === 'sakura-traditional')!;
    const excerptVer = getSongVerification(sakura, 'excerpt');
    const fullVer = getSongVerification(sakura, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(sakura.keySignatureFifths).toBe(0);
    expect(sakura.timeSignature).toEqual([4, 4]);
    expect(sakura.measureBeats).toBe(4);
    expect(sakura.defaultBpm).toBe(72);
    expect(getSongMeasureCount(sakura)).toBe(6);

    // Provenance regression assertions:
    // Must cite 箏曲集, 文部省音楽取調掛, 1888, info:ndljp/pid/857651, DOI 10.11501/857651, frames 6 and 22–23
    // Must not use generic Category:Sakura_Sakura URL or wrong PID 855956
    expect(sakura.source).toContain('857651');
    expect(sakura.source).not.toContain('855956');
    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceEdition).toContain('箏曲集');
      expect(ver.sourceEdition).toContain('文部省音楽取調掛');
      expect(ver.sourceEdition).toContain('1888');
      expect(ver.sourceEdition).toContain('info:ndljp/pid/857651');
      expect(ver.sourceEdition).toContain('DOI 10.11501/857651');
      expect(ver.sourceEdition).toContain('frame 6');
      expect(ver.sourceEdition).toContain('frames 22–23');
      expect(ver.sourceEdition).not.toContain('855956');
      expect(ver.sourceUrl).toBe('https://dl.ndl.go.jp/pid/857651/1/22');
      expect(ver.sourceUrl).not.toContain('Category:Sakura_Sakura');
      expect(ver.notes).toContain('857651');
      expect(ver.notes).not.toContain('855956');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // 1888 Sōkyoku-shū Hirajōshi koto notation (三=B3, 四=C4, 五=E4, 六=F4, 七=A4, 八=B4, 九=C5)
    const expectedExcerptFingerprint = [
      'm1@0:A4(1)', 'm1@1:A4(1)', 'm1@2:B4(2)',
      'm2@0:A4(1)', 'm2@1:A4(1)', 'm2@2:B4(2)',
      'm3@0:A4(1)', 'm3@1:B4(1)', 'm3@2:C5(1)', 'm3@3:B4(1)',
      'm4@0:A4(1)', 'm4@1:B4(0.5)', 'm4@1.5:A4(0.5)', 'm4@2:F4(2)',
      'm5@0:E4(1)', 'm5@1:C4(1)', 'm5@2:E4(1)', 'm5@3:F4(1)',
      'm6@0:E4(1)', 'm6@1:E4(0.5)', 'm6@1.5:C4(0.5)', 'm6@2:B3(2)'
    ];
    const excerptEvents = normalizeSongToEvents(sakura);
    expect(excerptEvents).toHaveLength(22);
    expect(excerptEvents.map(compact)).toEqual(expectedExcerptFingerprint);

    const sakuraFull = getSongVersion(sakura, 'full');
    expect(getSongMeasureCount(sakuraFull)).toBe(14);
    const expectedFullFingerprint = [
      ...expectedExcerptFingerprint,
      // mm. 7–10 ("Kasumi ka kumo ka / nioi zo izuru")
      'm7@0:A4(1)', 'm7@1:B4(1)', 'm7@2:C5(1)', 'm7@3:B4(1)',
      'm8@0:A4(1)', 'm8@1:B4(0.5)', 'm8@1.5:A4(0.5)', 'm8@2:F4(2)',
      'm9@0:E4(1)', 'm9@1:C4(1)', 'm9@2:E4(1)', 'm9@3:F4(1)',
      'm10@0:E4(1)', 'm10@1:E4(0.5)', 'm10@1.5:C4(0.5)', 'm10@2:B3(2)',
      // mm. 11–14 ("Iza ya, iza ya / mini yukan": 七七八 | 七七八 | 五〇六〇 | 八七六五)
      'm11@0:A4(1)', 'm11@1:A4(1)', 'm11@2:B4(2)',
      'm12@0:A4(1)', 'm12@1:A4(1)', 'm12@2:B4(2)',
      'm13@0:E4(2)', 'm13@2:F4(2)',
      'm14@0:B4(0.5)', 'm14@0.5:A4(0.5)', 'm14@1:F4(1)', 'm14@2:E4(2)'
    ];
    const fullEvents = normalizeSongToEvents(sakuraFull);
    expect(fullEvents).toHaveLength(50);
    const actualFullFp = fullEvents.map(compact);
    expect(actualFullFp).toEqual(expectedFullFingerprint);

    // Strict In-sen pentatonic pitch-class check: only {B3, C4, E4, F4, A4, B4, C5} may appear (no D4)
    const allowedPentatonicPitches = new Set(['B3', 'C4', 'E4', 'F4', 'A4', 'B4', 'C5']);
    for (const pitch of sakuraFull.notes) {
      expect(allowedPentatonicPitches.has(pitch), `Pitch ${pitch} must belong to Hirajōshi/In-sen pentatonic scale`).toBe(true);
    }
    expect(actualFullFp).not.toContain('m13@0:D4(1)');
  });

  it('verifies Kočka leze dírou (excerpt mm. 1–14 & melodyArrangement mm. 1–28) event-by-event against the modern CC0 Czech C-major transcription (File:Kočka-leze-dírou.svg, 2023) without falsely attributing the C-major melody to K. J. Erben (1864)', () => {
    const kocka = REPERTOIRE.find((s) => s.id === 'kocka-leze-dirou')!;
    const excerptVer = getSongVerification(kocka, 'excerpt');
    const fullVer = getSongVerification(kocka, 'full');
    expect(excerptVer.status).toBe('verified');
    expect(fullVer.status).toBe('verified');
    expect(kocka.keySignatureFifths).toBe(0);
    expect(kocka.timeSignature).toEqual([2, 4]);
    expect(kocka.measureBeats).toBe(2);
    expect(kocka.defaultBpm).toBe(104);
    expect(getSongMeasureCount(kocka)).toBe(14);

    // Provenance regression assertions:
    // Erben 1864 records a different G-minor melody; metadata for this C-major tune must cite the modern CC0 transcription (File:Kočka-leze-dírou.svg, 2023) and must NOT claim Erben 1864
    expect(kocka.source).toContain('File:Kočka-leze-dírou.svg');
    expect(kocka.source).not.toContain('Erben');
    expect(kocka.source).not.toContain('1864');
    for (const ver of [excerptVer, fullVer]) {
      expect(ver.sourceEdition).toContain('Modern CC0 LilyPond transcription');
      expect(ver.sourceEdition).toContain('File:Kočka-leze-dírou.svg');
      expect(ver.sourceEdition).toContain('2023');
      expect(ver.sourceUrl).toBe('https://commons.wikimedia.org/wiki/File:Ko%C4%8Dka-leze-d%C3%ADrou.svg');
      expect(ver.sourceTitle).not.toContain('Erben');
      expect(ver.sourceEdition).not.toContain('Erben');
      expect(ver.sourceEdition).not.toContain('1864');
      expect(ver.notes).not.toContain('Erben');
      expect(ver.notes).not.toContain('1864');
    }

    const compact = (ev: ReturnType<typeof normalizeSongToEvents>[number]) =>
      ev.type === 'rest'
        ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
        : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

    // File:Kočka-leze-dírou.svg in 2/4 meter (Stanza 1 with unfolded 1st and 2nd volta endings)
    const expectedStanza1Fingerprint = [
      'm1@0:C4(0.5)', 'm1@0.5:D4(0.5)', 'm1@1:E4(0.5)', 'm1@1.5:F4(0.5)',
      'm2@0:G4(1)', 'm2@1:G4(1)',
      'm3@0:A4(1)', 'm3@1:A4(1)',
      'm4@0:G4(2)',
      'm5@0:A4(1)', 'm5@1:A4(1)',
      'm6@0:G4(2)',
      'm7@0:F4(0.5)', 'm7@0.5:F4(0.5)', 'm7@1:F4(0.5)', 'm7@1.5:F4(0.5)',
      'm8@0:E4(1)', 'm8@1:E4(1)',
      'm9@0:D4(1)', 'm9@1:D4(1)',
      'm10@0:G4(2)',
      'm11@0:F4(0.5)', 'm11@0.5:F4(0.5)', 'm11@1:F4(0.5)', 'm11@1.5:F4(0.5)',
      'm12@0:E4(1)', 'm12@1:E4(1)',
      'm13@0:D4(1)', 'm13@1:D4(1)',
      'm14@0:C4(2)'
    ];
    const excerptEvents = normalizeSongToEvents(kocka);
    expect(excerptEvents).toHaveLength(30);
    expect(excerptEvents.map(compact)).toEqual(expectedStanza1Fingerprint);

    const kockaFull = getSongVersion(kocka, 'full');
    expect(kockaFull.timeSignature).toEqual([2, 4]);
    expect(kockaFull.measureBeats).toBe(2);
    expect(getSongMeasureCount(kockaFull)).toBe(28);
    const expectedStanza2Fingerprint = [
      'm15@0:C4(0.5)', 'm15@0.5:D4(0.5)', 'm15@1:E4(0.5)', 'm15@1.5:F4(0.5)',
      'm16@0:G4(1)', 'm16@1:G4(1)',
      'm17@0:A4(1)', 'm17@1:A4(1)',
      'm18@0:G4(2)',
      'm19@0:A4(1)', 'm19@1:A4(1)',
      'm20@0:G4(2)',
      'm21@0:F4(0.5)', 'm21@0.5:F4(0.5)', 'm21@1:F4(0.5)', 'm21@1.5:F4(0.5)',
      'm22@0:E4(1)', 'm22@1:E4(1)',
      'm23@0:D4(1)', 'm23@1:D4(1)',
      'm24@0:G4(2)',
      'm25@0:F4(0.5)', 'm25@0.5:F4(0.5)', 'm25@1:F4(0.5)', 'm25@1.5:F4(0.5)',
      'm26@0:E4(1)', 'm26@1:E4(1)',
      'm27@0:D4(1)', 'm27@1:D4(1)',
      'm28@0:C4(2)'
    ];
    const fullEvents = normalizeSongToEvents(kockaFull);
    expect(fullEvents).toHaveLength(60);
    expect(fullEvents.map(compact)).toEqual([...expectedStanza1Fingerprint, ...expectedStanza2Fingerprint]);
  });

  it('emits <measure number="1" implicit="yes"> for pickup pieces (Joplin, Für Elise, Vivaldi, Brahms, Greensleeves, and Bella Ciao) and round-trips pickupBeats losslessly', () => {
    for (const [songId, expectedPickupBeats] of [
      ['joplin-entertainer', 0.5],
      ['beethoven-fur-elise', 0.5],
      ['vivaldi-spring', 0.5],
      ['brahms-wiegenlied', 1],
      ['greensleeves', 1],
      ['bella-ciao', 1.5]
    ] as const) {
      const song = REPERTOIRE.find((s) => s.id === songId)!;
      expect(song.pickupBeats).toBe(expectedPickupBeats);

      const xml = songToMusicXml(song);
      expect(xml).toContain('<measure number="1" implicit="yes">');

      const parsed = parseMusicXmlToSongDef(xml, song.title);
      expect(parsed.pickupBeats).toBe(expectedPickupBeats);
      expect(normalizeSongToEvents(parsed)).toEqual(normalizeSongToEvents(song));
    }
  });

  it('performs lossless round-trip (SongDef -> normalizeSongToEvents -> songToMusicXml -> parseMusicXmlToSongDef -> normalizeSongToEvents) for all 25 pieces (excerpt & melodyArrangement)', () => {
    const results = validateEntireRepertoireLibrary();
    expect(results).toHaveLength(50);
    for (const res of results) {
      expect(res.errors, `${res.songId} (${res.variant}) failed structural/round-trip validation`).toEqual([]);
      expect(res.valid).toBe(true);
    }
  });

  it('round-trips keySignatureFifths (-7..+7) and meter metadata (2/4, 3/4, 3/8, 4/4, 6/8) without auto-transposing pitches', () => {
    for (const fifths of [-3, -1, 0, 1, 2, 4]) {
      const base = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
      const custom = { ...base, keySignatureFifths: fifths, defaultBpm: 112 };
      const xml = songToMusicXml(custom);
      expect(xml).toContain(`<key><fifths>${fifths}</fifths></key>`);
      const parsed = parseMusicXmlToSongDef(xml);
      expect(parsed.keySignatureFifths).toBe(fifths);
      expect(parsed.defaultBpm).toBe(112);
      expect(parsed.notes).toEqual(base.notes);
    }

    for (const [songId, expectedTimeSig, expectedMeasureBeats] of [
      ['joplin-entertainer', [2, 4], 2],
      ['kocka-leze-dirou', [2, 4], 2],
      ['bach-minuet-g', [3, 4], 3],
      ['beethoven-fur-elise', [3, 8], 1.5],
      ['mozart-nachtmusik', [4, 4], 4],
      ['grieg-morning-mood', [6, 8], 3]
    ] as const) {
      const song = REPERTOIRE.find((s) => s.id === songId)!;
      const xml = songToMusicXml(song);
      const parsed = parseMusicXmlToSongDef(xml);
      expect(parsed.timeSignature).toEqual(expectedTimeSig);
      expect(parsed.measureBeats).toBe(expectedMeasureBeats);
    }
  });

  it('guarantees deterministic non-overlapping note envelopes and silent rest spans in buildSongPlaybackSchedule across all 46 verified variants', () => {
    for (const durMs of [100, 125, 250, 500, 1000]) {
      const env = computeNoteEnvelopeTiming(1000, durMs);
      expect(env.onsetMs).toBe(1000);
      expect(env.nominalDurationMs).toBe(durMs);
      expect(env.nextOnsetMs).toBe(1000 + durMs);
      expect(env.releaseStartMs).toBeGreaterThan(0);
      expect(env.releaseDurationMs).toBeGreaterThan(0);
      expect(env.releaseStartMs + env.releaseDurationMs).toBeLessThanOrEqual(env.nominalDurationMs);
    }

    const mozart = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
    const schedule = buildSongPlaybackSchedule(mozart, 120);
    expect(schedule[0].type).toBe('note');
    expect(schedule[0].pitch).toBe('G4');
    expect(schedule[0].onsetMs).toBe(0);
    expect(schedule[0].nominalDurationMs).toBe(500);
    expect(schedule[0].releaseStartMs + schedule[0].releaseDurationMs).toBeLessThanOrEqual(500);
    expect(schedule[0].nextOnsetMs).toBe(500);

    expect(schedule[1].type).toBe('rest');
    expect(schedule[1].onsetMs).toBe(500);
    expect(schedule[1].nominalDurationMs).toBe(250);
    expect(schedule[1].releaseStartMs).toBe(0);
    expect(schedule[1].releaseDurationMs).toBe(0);
    expect(schedule[1].nextOnsetMs).toBe(750);

    expect(schedule[2].type).toBe('note');
    expect(schedule[2].pitch).toBe('D4');
    expect(schedule[2].onsetMs).toBe(750);
    expect(schedule[2].nominalDurationMs).toBe(250);
    expect(schedule[2].releaseStartMs + schedule[2].releaseDurationMs).toBeLessThanOrEqual(250);
    expect(schedule[2].nextOnsetMs).toBe(1000);

    // Verify all 46 verified variants produce monotonic, gapless, non-overlapping playback schedules
    for (const song of REPERTOIRE) {
      for (const versionMode of ['excerpt', 'full'] as const) {
        if (getSongVerification(song, versionMode).status !== 'verified') continue;
        const variantSong = getSongVersion(song, versionMode);
        const bpm = variantSong.defaultBpm ?? 96;
        const sched = buildSongPlaybackSchedule(variantSong, bpm);
        expect(sched.length).toBeGreaterThan(0);
        let expectedOnset = 0;
        for (const item of sched) {
          expect(item.onsetMs).toBeCloseTo(expectedOnset, 2);
          expect(item.nominalDurationMs).toBeGreaterThan(0);
          if (item.type === 'rest') {
            expect(item.releaseStartMs).toBe(0);
            expect(item.releaseDurationMs).toBe(0);
          } else {
            expect(item.releaseStartMs).toBeGreaterThan(0);
            expect(item.releaseDurationMs).toBeGreaterThan(0);
            expect(item.releaseStartMs + item.releaseDurationMs).toBeLessThanOrEqual(item.nominalDurationMs + 1e-6);
          }
          expectedOnset = item.nextOnsetMs;
        }
      }
    }
  });

  it('correctly calculates measure count, note indices, and measure note slices', () => {
    const ode = REPERTOIRE.find((s) => s.id === 'ode-joy')!;
    expect(getSongMeasureCount(ode)).toBe(4);
    expect(getMeasureForNoteIndex(ode, 0)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 3)).toBe(1);
    expect(getMeasureForNoteIndex(ode, 4)).toBe(2);
    expect(getMeasureForNoteIndex(ode, 14)).toBe(4);

    const odeFull = getSongVersion(ode, 'full');
    expect(getSongMeasureCount(odeFull)).toBeGreaterThan(4);

    const bach = REPERTOIRE.find((s) => s.id === 'bach-minuet-g')!;
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

  it('calculates total song duration in ms (including rests) and piece-specific effective BPM', () => {
    const ode = REPERTOIRE.find((s) => s.id === 'ode-joy')!;
    expect(getSongDurationMs(ode, 60)).toBe(16000);
    expect(getSongDurationMs(ode, 120)).toBe(8000);

    const mozart = REPERTOIRE.find((s) => s.id === 'mozart-nachtmusik')!;
    expect(getSongDurationMs(mozart, 120)).toBe(8000);

    const gym = REPERTOIRE.find((s) => s.id === 'satie-gymnopedie-1')!;
    const tetris = REPERTOIRE.find((s) => s.id === 'korobeiniki-tetris')!;
    expect(getEffectiveSongBpm(gym, 'wait', false)).toBeNull();
    expect(getEffectiveSongBpm(gym, 'wait', true)).toBe(66);
    expect(getEffectiveSongBpm(tetris, 'normal', false)).toBe(132);
    expect(getEffectiveSongBpm(tetris, 'slow', false)).toBeLessThan(132);
  });

  it('supports single-note and two-hand Grand Staff MusicXML generation and multi-voice MusicXML import', () => {
    expect(decomposeDurationSpecs(2.5)).toHaveLength(2);
    expect(pitchToKeyboardNoteId('B', -1, 4)).toBe('A#4');
    expect(pitchToKeyboardNoteId('E', -1, 4)).toBe('D#4');

    const singleGrand = singleNoteToMusicXml('C3', 'grand');
    expect(singleGrand).toContain('<staves>2</staves>');
    expect(singleGrand).toContain('<sign>F</sign>');

    const twoHandXml = twoHandToMusicXml('C3', 'E4');
    expect(twoHandXml).toContain('<staves>2</staves>');
    expect(twoHandXml).toContain('<staff>1</staff>');
    expect(twoHandXml).toContain('<staff>2</staff>');

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
            <note>
              <pitch><step>A</step><octave>2</octave></pitch>
              <duration>12</duration>
              <voice>2</voice>
              <staff>2</staff>
            </note>
          </measure>
        </part>
      </score-partwise>`;

    const parsedMulti = parseMusicXmlToSongDef(multiVoiceTiedXml);
    expect(parsedMulti.title).toBe('Tie &amp; Backup Test');
    expect(parsedMulti.defaultBpm).toBe(112);
    expect(parsedMulti.pickupBeats).toBe(1);
    expect(parsedMulti.notes).toEqual(['E5', 'D#5', 'A4']);
    expect(parsedMulti.beats).toEqual([0.5, 0.5, 3]);
  });
});
