import JSZip from 'jszip';
import type { SongDef } from './repertoireData';

const DIVISIONS = 4; // 4 divisions per quarter note

export interface DurationSpec {
  type: '16th' | 'eighth' | 'quarter' | 'half' | 'whole';
  dotted: boolean;
  divisions: number;
}

/**
 * Decomposes a beat duration (e.g. 2.5 beats = half + eighth) into one or more
 * standard MusicXML duration specs connected by ties if length > 1.
 */
export function decomposeDurationSpecs(beats: number): DurationSpec[] {
  if (Math.abs(beats - 0.25) < 0.05) {
    return [{ type: '16th', dotted: false, divisions: 1 }];
  }
  if (Math.abs(beats - 0.5) < 0.05) {
    return [{ type: 'eighth', dotted: false, divisions: 2 }];
  }
  if (Math.abs(beats - 0.75) < 0.05) {
    return [{ type: 'eighth', dotted: true, divisions: 3 }];
  }
  if (Math.abs(beats - 1) < 0.05) {
    return [{ type: 'quarter', dotted: false, divisions: 4 }];
  }
  if (Math.abs(beats - 1.25) < 0.05) {
    return [
      { type: 'quarter', dotted: false, divisions: 4 },
      { type: '16th', dotted: false, divisions: 1 }
    ];
  }
  if (Math.abs(beats - 1.5) < 0.05) {
    return [{ type: 'quarter', dotted: true, divisions: 6 }];
  }
  if (Math.abs(beats - 2) < 0.05) {
    return [{ type: 'half', dotted: false, divisions: 8 }];
  }
  if (Math.abs(beats - 2.5) < 0.05) {
    return [
      { type: 'half', dotted: false, divisions: 8 },
      { type: 'eighth', dotted: false, divisions: 2 }
    ];
  }
  if (Math.abs(beats - 3) < 0.05) {
    return [{ type: 'half', dotted: true, divisions: 12 }];
  }
  if (Math.abs(beats - 3.5) < 0.05) {
    return [
      { type: 'half', dotted: true, divisions: 12 },
      { type: 'eighth', dotted: false, divisions: 2 }
    ];
  }
  if (beats >= 3.9) {
    return [{ type: 'whole', dotted: false, divisions: 16 }];
  }
  return [
    {
      type: 'quarter',
      dotted: false,
      divisions: Math.max(1, Math.round(beats * DIVISIONS))
    }
  ];
}

/**
 * Maps a logical note index in `song.notes` to its exact OSMD cursor step index,
 * accounting for compound tied notes (e.g. 2.5 beats rendered as half + eighth)
 * or imported MusicXML `cursorStepByNote` (which accounts for rests and ties).
 */
export function getCursorStepForNoteIndex(song: SongDef, noteIndex: number): number {
  if (song.cursorStepByNote && song.cursorStepByNote[noteIndex] !== undefined) {
    return song.cursorStepByNote[noteIndex];
  }
  let cursorStep = 0;
  const limit = Math.max(0, Math.min(noteIndex, song.beats.length));
  for (let i = 0; i < limit; i++) {
    const specs = decomposeDurationSpecs(song.beats[i] ?? 1);
    cursorStep += specs.length;
  }
  return cursorStep;
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parsePitchXml(noteId: string): {
  step: string;
  alter: number;
  octave: number;
  xml: string;
  accidentalXml: string;
} {
  const m = /^([A-G])([#b]?)(\d)$/.exec((noteId || 'C4').trim());
  if (!m) {
    return {
      step: 'C',
      alter: 0,
      octave: 4,
      xml: '<pitch><step>C</step><octave>4</octave></pitch>',
      accidentalXml: ''
    };
  }
  const [, step, acc, octStr] = m;
  const alter = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  const octave = Number(octStr);
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : '';
  const accidentalXml =
    alter === 1 ? '<accidental>sharp</accidental>' : alter === -1 ? '<accidental>flat</accidental>' : '';
  return {
    step,
    alter,
    octave,
    xml: `<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>`,
    accidentalXml
  };
}

interface MeasureNoteItem {
  noteId: string;
  beats: number;
  globalIndex: number;
  spec: DurationSpec;
  tieStart?: boolean;
  tieStop?: boolean;
  beam?: 'begin' | 'continue' | 'end';
}

function assignBeamsForMeasure(items: MeasureNoteItem[]): void {
  let i = 0;
  while (i < items.length) {
    if (items[i].beats <= 0.5 && !items[i].tieStop) {
      const run: MeasureNoteItem[] = [];
      while (i < items.length && items[i].beats <= 0.5 && !items[i].tieStop && run.length < 4) {
        run.push(items[i]);
        i++;
      }
      if (run.length >= 2) {
        run[0].beam = 'begin';
        for (let k = 1; k < run.length - 1; k++) {
          run[k].beam = 'continue';
        }
        run[run.length - 1].beam = 'end';
      }
    } else {
      i++;
    }
  }
}

/**
 * Converts a SongDef from REPERTOIRE into a standard MusicXML 4.0 document string
 * suitable for rendering with OpenSheetMusicDisplay (OSMD).
 * If `song.rawXml` is present (from an imported MusicXML score), returns it directly.
 */
export function songToMusicXml(song: SongDef): string {
  if (song.rawXml) {
    return song.rawXml;
  }

  const measureBeats = song.measureBeats || 4;
  const timeTop = song.timeSignature ? song.timeSignature[0] : measureBeats;
  const timeBottom = song.timeSignature ? song.timeSignature[1] : 4;

  const measures: MeasureNoteItem[][] = [];
  let currentMeasure: MeasureNoteItem[] = [];
  let accBeats = 0;
  let targetMeasureBeats =
    song.pickupBeats && song.pickupBeats > 0 ? song.pickupBeats : measureBeats;

  for (let i = 0; i < song.notes.length; i++) {
    const noteId = song.notes[i];
    const b = song.beats[i] ?? 1;
    const specs = decomposeDurationSpecs(b);

    for (let sIdx = 0; sIdx < specs.length; sIdx++) {
      const spec = specs[sIdx];
      const specBeats = spec.divisions / DIVISIONS;
      currentMeasure.push({
        noteId,
        beats: specBeats,
        globalIndex: i,
        spec,
        tieStart: specs.length > 1 && sIdx < specs.length - 1,
        tieStop: specs.length > 1 && sIdx > 0
      });
    }
    accBeats += b;

    if (accBeats >= targetMeasureBeats - 0.001 || i === song.notes.length - 1) {
      assignBeamsForMeasure(currentMeasure);
      measures.push(currentMeasure);
      currentMeasure = [];
      accBeats = 0;
      targetMeasureBeats = measureBeats;
    }
  }

  const measuresXml = measures
    .map((mNotes, mIdx) => {
      const attrXml =
        mIdx === 0
          ? `
      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${timeTop}</beats><beat-type>${timeBottom}</beat-type></time>
        <staves>1</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>`
          : '';

      const alterState = new Map<string, number>();

      const notesXml = mNotes
        .map((item) => {
          const pitch = parsePitchXml(item.noteId);
          const pitchKey = `${pitch.step}${pitch.octave}`;
          const prevAlter = alterState.get(pitchKey) ?? 0;
          let accidentalXml = '';
          if (!item.tieStop) {
            if (pitch.alter === 1 && prevAlter !== 1) {
              accidentalXml = '<accidental>sharp</accidental>';
            } else if (pitch.alter === -1 && prevAlter !== -1) {
              accidentalXml = '<accidental>flat</accidental>';
            } else if (pitch.alter === 0 && prevAlter !== 0) {
              accidentalXml = '<accidental>natural</accidental>';
            }
          }
          alterState.set(pitchKey, pitch.alter);

          const dotXml = item.spec.dotted ? '<dot/>' : '';
          const beamXml = item.beam ? `<beam number="1">${item.beam}</beam>` : '';
          const tieXml =
            (item.tieStop ? '<tie type="stop"/>' : '') +
            (item.tieStart ? '<tie type="start"/>' : '');
          const notationsXml =
            item.tieStop || item.tieStart
              ? `<notations>${item.tieStop ? '<tied type="stop"/>' : ''}${item.tieStart ? '<tied type="start"/>' : ''}</notations>`
              : '';

          return `      <note>
        ${pitch.xml}
        <duration>${item.spec.divisions}</duration>${tieXml}
        <voice>1</voice>
        <type>${item.spec.type}</type>${dotXml}${accidentalXml}
        <staff>1</staff>${beamXml}${notationsXml}
      </note>`;
        })
        .join('\n');

      const barlineXml =
        mIdx === measures.length - 1
          ? `\n      <barline location="right"><bar-style>light-heavy</bar-style></barline>`
          : '';

      const implicitAttr = mIdx === 0 && song.pickupBeats && song.pickupBeats > 0 ? ' implicit="yes"' : '';

      return `    <measure number="${mIdx + 1}"${implicitAttr}>${attrXml}
${notesXml}${barlineXml}
    </measure>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${escapeXml(song.title)}</work-title></work>
  <identification>
    <creator type="composer">${escapeXml(song.source)}</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measuresXml}
  </part>
</score-partwise>`;
}

/**
 * Generates a 1-measure MusicXML for a single-note flashcard drill (Treble, Bass, or Grand Staff).
 */
export function singleNoteToMusicXml(
  keyId: string,
  clefMode: 'auto' | 'treble' | 'bass' | 'grand' = 'auto'
): string {
  const pitch = parsePitchXml(keyId || 'C4');
  const effectiveClef: 'treble' | 'bass' | 'grand' =
    clefMode === 'auto' ? (pitch.octave <= 3 ? 'bass' : 'treble') : clefMode;

  if (effectiveClef === 'grand') {
    const targetStaff = pitch.octave <= 3 ? 2 : 1;
    const staff1Note =
      targetStaff === 1
        ? `<note>${pitch.xml}<duration>4</duration><voice>1</voice><type>quarter</type>${pitch.accidentalXml}<staff>1</staff></note>`
        : `<note print-object="no"><rest/><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
    const staff2Note =
      targetStaff === 2
        ? `<note>${pitch.xml}<duration>4</duration><voice>2</voice><type>quarter</type>${pitch.accidentalXml}<staff>2</staff></note>`
        : `<note print-object="no"><rest/><duration>4</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      ${staff1Note}
      <backup><duration>4</duration></backup>
      ${staff2Note}
    </measure>
  </part>
</score-partwise>`;
  }

  const clefSign = effectiveClef === 'bass' ? 'F' : 'G';
  const clefLine = effectiveClef === 'bass' ? 4 : 2;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <staves>1</staves>
        <clef number="1"><sign>${clefSign}</sign><line>${clefLine}</line></clef>
      </attributes>
      <note>
        ${pitch.xml}
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>${pitch.accidentalXml}
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

/**
 * Generates a 1-measure Grand Staff MusicXML for Two-Hand coordination exercises.
 */
export function twoHandToMusicXml(leftKeyId: string | null, rightKeyId: string | null): string {
  const rightPitch = rightKeyId ? parsePitchXml(rightKeyId) : null;
  const leftPitch = leftKeyId ? parsePitchXml(leftKeyId) : null;

  const staff1Note = rightPitch
    ? `<note>${rightPitch.xml}<duration>4</duration><voice>1</voice><type>quarter</type>${rightPitch.accidentalXml}<staff>1</staff></note>`
    : `<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;

  const staff2Note = leftPitch
    ? `<note>${leftPitch.xml}<duration>4</duration><voice>2</voice><type>quarter</type>${leftPitch.accidentalXml}<staff>2</staff></note>`
    : `<note><rest/><duration>4</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      ${staff1Note}
      <backup><duration>4</duration></backup>
      ${staff2Note}
    </measure>
  </part>
</score-partwise>`;
}

const SEMITONE_BY_STEP: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchToKeyboardNoteId(step: string, alter: number, octave: number): string {
  const base = SEMITONE_BY_STEP[step.toUpperCase()] ?? 0;
  let midi = (octave + 1) * 12 + base + alter;
  while (midi < 36) midi += 12; // C2 = 36
  while (midi > 84) midi -= 12; // C6 = 84
  const noteName = SHARP_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${noteName}${oct}`;
}

export interface ParsedMusicXmlNote {
  name: string;
  midi: number;
  durationBeats: number;
  tieStart: boolean;
  tieStop: boolean;
  shouldPlay: boolean;
}

export interface ParsedMusicXmlEvent {
  durationBeats: number;
  tempoBpm: number;
  notes: ParsedMusicXmlNote[];
  isRest: boolean;
  sourceEventIndex: number;
}

/**
 * Resolves tied notes across sequential events (ported from MelodicaTrainer's `resolveTiedNotes`
 * in `playbackParser.ts`). Sustains the starting note for the full tied duration and marks
 * continuation notes with `shouldPlay = false` so they are not re-triggered or re-prompted.
 */
export function resolveTiedNotes(events: ParsedMusicXmlEvent[]): ParsedMusicXmlEvent[] {
  events.forEach((event, eventIndex) => {
    event.notes.forEach((note) => {
      if (note.tieStop) {
        note.shouldPlay = false;
      }

      if (!note.tieStart || note.tieStop) return;

      for (let nextIdx = eventIndex + 1; nextIdx < events.length; nextIdx++) {
        const nextEvent = events[nextIdx];
        const tiedNote = nextEvent.notes.find(
          (candidate) => candidate.name === note.name && candidate.tieStop
        );
        if (!tiedNote) break;

        note.durationBeats += nextEvent.durationBeats;
        tiedNote.shouldPlay = false;

        if (!tiedNote.tieStart) break;
      }
    });
  });

  return events;
}

/**
 * Parses a MusicXML (.musicxml / .xml) string into a playable SongDef
 * using MelodicaTrainer's measure-by-measure timeline architecture:
 * - Tracks `divisions`, `<backup>`, `<forward>`, `<staff>`, and `<voice>` per measure
 * - Expands `<repeat direction="forward|backward">` sections
 * - Resolves `<tie type="start|stop">` via `resolveTiedNotes` so tied durations are summed
 * - Preserves rest timing by adding rest durations to the preceding note or pickup structure
 * - Extracts `<sound tempo="..."/>` for authentic playback speed
 */
export function parseMusicXmlToSongDef(xmlText: string, fallbackTitle = 'Импортированная пьеса'): SongDef {
  const workTitleMatch = /<work-title>([\s\S]*?)<\/work-title>/i.exec(xmlText);
  const movementTitleMatch = /<movement-title>([\s\S]*?)<\/movement-title>/i.exec(xmlText);
  const composerMatch = /<creator[^>]*type=["']composer["'][^>]*>([\s\S]*?)<\/creator>/i.exec(xmlText);

  const cleanFallback = fallbackTitle.replace(/\.(musicxml|xml|mxl)$/i, '').trim();
  const title = (workTitleMatch?.[1] || movementTitleMatch?.[1] || cleanFallback).trim();
  const composer = (composerMatch?.[1] || 'MusicXML Импорт').trim();

  // Detect initial tempo from <sound tempo="..."/>
  let detectedTempo = 96;
  const soundTempoMatch = /<sound\b[^>]*tempo=["']([\d.]+)["']/i.exec(xmlText);
  if (soundTempoMatch) {
    const t = Number(soundTempoMatch[1]);
    if (Number.isFinite(t) && t > 0) detectedTempo = Math.round(t);
  }

  // Extract first <part>...</part>
  const partMatch = /<part\b[^>]*>([\s\S]*?)<\/part>/i.exec(xmlText);
  const partContent = partMatch ? partMatch[1] : xmlText;

  let divisions = 4;
  let timeTop = 4;
  let timeBottom = 4;
  let currentTempo = detectedTempo;

  interface MeasureParsed {
    implicit: boolean;
    forwardRepeat: boolean;
    backwardRepeat: boolean;
    repeatTimes: number;
    events: ParsedMusicXmlEvent[];
    totalBeats: number;
  }

  const parsedMeasures: MeasureParsed[] = [];
  let nextCursorPositionIndex = 0;

  const measureRegex = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
  let mMatch: RegExpExecArray | null;

  while ((mMatch = measureRegex.exec(partContent)) !== null) {
    const measureAttrs = mMatch[1] || '';
    const measureBody = mMatch[2] || '';
    const isImplicit = /implicit=["']yes["']/i.test(measureAttrs);

    // Check attributes inside measure
    const divMatch = /<divisions>\s*(\d+)\s*<\/divisions>/i.exec(measureBody);
    if (divMatch) divisions = Math.max(1, Number(divMatch[1]));

    const beatsMatch = /<time\b[^>]*>[\s\S]*?<beats>\s*(\d+)\s*<\/beats>[\s\S]*?<beat-type>\s*(\d+)\s*<\/beat-type>[\s\S]*?<\/time>/i.exec(
      measureBody
    );
    if (beatsMatch && parsedMeasures.length === 0) {
      timeTop = Math.max(1, Number(beatsMatch[1]));
      timeBottom = Math.max(1, Number(beatsMatch[2]));
    }

    const dirTempoMatch = /<sound\b[^>]*tempo=["']([\d.]+)["']/i.exec(measureBody);
    if (dirTempoMatch) {
      const t = Number(dirTempoMatch[1]);
      if (Number.isFinite(t) && t > 0) currentTempo = Math.round(t);
    }

    const forwardRepeat = /<repeat\b[^>]*direction=["']forward["']/i.test(measureBody);
    const backwardRepeatMatch = /<repeat\b[^>]*direction=["']backward["']([^>]*)/i.exec(measureBody);
    const backwardRepeat = Boolean(backwardRepeatMatch);
    const timesMatch = backwardRepeatMatch ? /times=["'](\d+)["']/i.exec(backwardRepeatMatch[0]) : null;
    const repeatTimes = timesMatch ? Math.max(2, Number(timesMatch[1])) : 2;

    // Walk <backup>, <forward>, and <note> in exact document order within the measure
    const tokenRegex = /<(backup|forward|note)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let tok: RegExpExecArray | null;
    let cursorPos = 0;

    // Group Staff 1 notes by their start position (in divisions)
    const slotsByPos = new Map<
      number,
      { durationDivs: number; isRest: boolean; notes: ParsedMusicXmlNote[]; voice: string }
    >();
    let primaryVoice: string | null = null;

    while ((tok = tokenRegex.exec(measureBody)) !== null) {
      const tag = tok[1].toLowerCase();
      const body = tok[2];

      const durMatch = /<duration>\s*(\d+)\s*<\/duration>/i.exec(body);
      const durDivs = durMatch ? Number(durMatch[1]) : 0;

      if (tag === 'backup') {
        cursorPos = Math.max(0, cursorPos - durDivs);
        continue;
      }
      if (tag === 'forward') {
        cursorPos += durDivs;
        continue;
      }

      // <note>
      if (/<grace\b/i.test(body)) continue;

      const isChord = /<chord\b/i.test(body);
      const isRest = /<rest\b/i.test(body);
      const noteDuration = durDivs > 0 ? durDivs : divisions;
      const noteStartPos = isChord ? Math.max(0, cursorPos - noteDuration) : cursorPos;

      if (!isChord) {
        cursorPos += noteDuration;
      }

      const staffMatch = /<staff>\s*(\d+)\s*<\/staff>/i.exec(body);
      if (staffMatch && Number(staffMatch[1]) !== 1) continue;

      const voiceMatch = /<voice>\s*([^<\s]+)\s*<\/voice>/i.exec(body);
      const voice = voiceMatch ? voiceMatch[1] : '1';
      if (primaryVoice === null && !isRest) {
        primaryVoice = voice;
      }
      if (primaryVoice !== null && voice !== primaryVoice) continue;

      const durationBeats = noteDuration / divisions;
      const tieStart = /<tie\b[^>]*type=["']start["']/i.test(body);
      const tieStop = /<tie\b[^>]*type=["']stop["']/i.test(body);

      let parsedNote: ParsedMusicXmlNote | null = null;
      if (!isRest) {
        const stepMatch = /<step>\s*([A-G])\s*<\/step>/i.exec(body);
        const octMatch = /<octave>\s*(\d+)\s*<\/octave>/i.exec(body);
        if (stepMatch && octMatch) {
          const alterMatch = /<alter>\s*(-?\d+)\s*<\/alter>/i.exec(body);
          const alter = alterMatch ? Number(alterMatch[1]) : 0;
          const step = stepMatch[1].toUpperCase();
          const oct = Number(octMatch[1]);
          const midi = (oct + 1) * 12 + (SEMITONE_BY_STEP[step] ?? 0) + alter;
          parsedNote = {
            name: pitchToKeyboardNoteId(step, alter, oct),
            midi,
            durationBeats,
            tieStart,
            tieStop,
            shouldPlay: true
          };
        }
      }

      const existingSlot = slotsByPos.get(noteStartPos);
      if (existingSlot) {
        if (parsedNote) {
          existingSlot.notes.push(parsedNote);
          existingSlot.isRest = false;
        }
      } else {
        slotsByPos.set(noteStartPos, {
          durationDivs: noteDuration,
          isRest: isRest || !parsedNote,
          notes: parsedNote ? [parsedNote] : [],
          voice
        });
      }
    }

    const sortedPositions = Array.from(slotsByPos.keys()).sort((a, b) => a - b);
    const measureEvents: ParsedMusicXmlEvent[] = [];
    let measureBeatsSum = 0;

    sortedPositions.forEach((pos, idx) => {
      const slot = slotsByPos.get(pos)!;
      const durationBeats = slot.durationDivs / divisions;
      measureBeatsSum += durationBeats;
      // For chords on Staff 1, pick the highest (melody) note first
      slot.notes.sort((a, b) => b.midi - a.midi);

      measureEvents.push({
        durationBeats,
        tempoBpm: currentTempo,
        notes: slot.notes,
        isRest: slot.isRest,
        sourceEventIndex: nextCursorPositionIndex + idx
      });
    });

    nextCursorPositionIndex += sortedPositions.length;
    parsedMeasures.push({
      implicit: isImplicit,
      forwardRepeat,
      backwardRepeat,
      repeatTimes,
      events: measureEvents,
      totalBeats: measureBeatsSum
    });
  }

  // Expand repeats (MelodicaTrainer expandRepeats pattern)
  const expandedEvents: ParsedMusicXmlEvent[] = [];
  let repeatStartMeasureIndex = 0;

  const cloneEvent = (ev: ParsedMusicXmlEvent): ParsedMusicXmlEvent => ({
    ...ev,
    notes: ev.notes.map((n) => ({ ...n }))
  });

  parsedMeasures.forEach((measure, mIdx) => {
    if (measure.forwardRepeat) {
      repeatStartMeasureIndex = mIdx;
    }
    expandedEvents.push(...measure.events.map(cloneEvent));

    if (measure.backwardRepeat) {
      const slice = parsedMeasures.slice(repeatStartMeasureIndex, mIdx + 1);
      for (let r = 1; r < measure.repeatTimes; r++) {
        slice.forEach((rm) => {
          expandedEvents.push(...rm.events.map(cloneEvent));
        });
      }
      repeatStartMeasureIndex = mIdx + 1;
    }
  });

  // Resolve tied notes across all events
  resolveTiedNotes(expandedEvents);

  const allNotes: string[] = [];
  const allBeats: number[] = [];

  for (const event of expandedEvents) {
    if (event.isRest || event.notes.length === 0) {
      // Absorb rest duration into the preceding playable note so measure alignment stays intact
      if (allBeats.length > 0) {
        allBeats[allBeats.length - 1] = Math.round((allBeats[allBeats.length - 1] + event.durationBeats) * 100) / 100;
      }
      continue;
    }

    const melodyNote = event.notes[0];
    if (!melodyNote.shouldPlay) {
      // Tied continuation note: its duration was already accumulated into the tieStart note by resolveTiedNotes
      continue;
    }

    const roundedBeat = Math.max(0.25, Math.round(melodyNote.durationBeats * 100) / 100);
    allNotes.push(melodyNote.name);
    allBeats.push(roundedBeat);

    if (allNotes.length >= 512) break;
  }

  if (allNotes.length === 0) {
    allNotes.push('C4', 'D4', 'E4', 'F4', 'G4');
    allBeats.push(1, 1, 1, 1, 2);
  }

  const measureBeats = Math.max(1, Math.round(((timeTop * 4) / timeBottom) * 100) / 100);
  const firstMeasureBeats = parsedMeasures[0]?.totalBeats ?? measureBeats;
  const pickupBeats =
    parsedMeasures[0]?.implicit || (firstMeasureBeats > 0 && firstMeasureBeats < measureBeats - 0.05)
      ? Math.round(firstMeasureBeats * 100) / 100
      : undefined;

  const excerptCount = Math.min(allNotes.length, 24);
  const notes = allNotes.slice(0, excerptCount);
  const beats = allBeats.slice(0, excerptCount);
  const hasLongerFull = allNotes.length > excerptCount;

  return {
    id: `custom-${Date.now()}`,
    title,
    source: composer,
    level: 'MusicXML Импорт',
    category: 'classical',
    description: `Импортированная партитура MusicXML (${allNotes.length} нот, размер ${timeTop}/${timeBottom}, ♩=${detectedTempo}).`,
    notes,
    beats,
    fullNotes: hasLongerFull ? allNotes : undefined,
    fullBeats: hasLongerFull ? allBeats : undefined,
    measureBeats,
    pickupBeats,
    defaultBpm: detectedTempo,
    timeSignature: [timeTop, timeBottom],
    phraseBars: 2
  };
}

/**
 * Reads either an uncompressed (.musicxml / .xml) or compressed (.mxl) MusicXML file
 * and converts it into a playable SongDef.
 */
export async function parseMusicXmlFileToSongDef(file: File): Promise<SongDef> {
  const isMxl = /\.mxl$/i.test(file.name);
  let xmlText = '';

  if (isMxl) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const containerEntry = zip.file('META-INF/container.xml');
    let rootPath: string | null = null;
    if (containerEntry) {
      const containerXml = await containerEntry.async('string');
      const rootMatch = /full-path=["']([^"']+)["']/i.exec(containerXml);
      if (rootMatch) rootPath = rootMatch[1];
    }
    const targetEntry =
      (rootPath && zip.file(rootPath)) ||
      Object.values(zip.files).find(
        (entry) =>
          !entry.dir &&
          /\.(musicxml|xml)$/i.test(entry.name) &&
          entry.name !== 'META-INF/container.xml'
      );
    if (!targetEntry) {
      throw new Error('В архиве .mxl не найден файл партитуры MusicXML.');
    }
    xmlText = await targetEntry.async('string');
  } else {
    xmlText = await file.text();
  }

  return parseMusicXmlToSongDef(xmlText, file.name);
}
