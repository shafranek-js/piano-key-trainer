import JSZip from 'jszip';
import {
  DEFAULT_BPM_BY_SONG_ID,
  normalizeSongToEvents,
  type MelodyEvent,
  type SongDef
} from './repertoireData';

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
  const totalDivs = Math.max(1, Math.round(beats * DIVISIONS));
  const standardAtoms: DurationSpec[] = [
    { type: 'whole', dotted: false, divisions: 16 },
    { type: 'half', dotted: true, divisions: 12 },
    { type: 'half', dotted: false, divisions: 8 },
    { type: 'quarter', dotted: true, divisions: 6 },
    { type: 'quarter', dotted: false, divisions: 4 },
    { type: 'eighth', dotted: true, divisions: 3 },
    { type: 'eighth', dotted: false, divisions: 2 },
    { type: '16th', dotted: false, divisions: 1 }
  ];

  const result: DurationSpec[] = [];
  let remaining = totalDivs;
  while (remaining > 0) {
    const match = standardAtoms.find((atom) => atom.divisions <= remaining);
    if (!match) {
      result.push({ type: '16th', dotted: false, divisions: 1 });
      remaining -= 1;
    } else {
      result.push({ ...match });
      remaining -= match.divisions;
    }
  }
  return result;
}

export interface MeasureNoteItem {
  isRest: boolean;
  noteId?: string;
  beats: number;
  startBeatInMeasure: number;
  globalIndex?: number;
  spec: DurationSpec;
  tieStart?: boolean;
  tieStop?: boolean;
  beam?: 'begin' | 'continue' | 'end';
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function getKeySignatureStepAlters(fifths = 0): Record<string, number> {
  const map: Record<string, number> = {
    C: 0,
    D: 0,
    E: 0,
    F: 0,
    G: 0,
    A: 0,
    B: 0
  };
  const clamped = Math.max(-7, Math.min(7, Math.trunc(fifths)));
  if (clamped > 0) {
    for (let i = 0; i < clamped; i++) {
      map[SHARP_ORDER[i]] = 1;
    }
  } else if (clamped < 0) {
    for (let i = 0; i < Math.abs(clamped); i++) {
      map[FLAT_ORDER[i]] = -1;
    }
  }
  return map;
}

function assignBeamsForMeasure(items: MeasureNoteItem[], timeSignature?: [number, number]): void {
  const isCompoundSixEight =
    Boolean(timeSignature && timeSignature[0] === 6 && timeSignature[1] === 8);

  const getBeamGroupKey = (item: MeasureNoteItem): number => {
    if (isCompoundSixEight) {
      // Two compound dotted-quarter beats per 6/8 measure: [0, 1.5) and [1.5, 3.0)
      return Math.floor((item.startBeatInMeasure + 1e-4) / 1.5);
    }
    if (timeSignature && timeSignature[0] === 2 && timeSignature[1] === 4) {
      // Group by quarter-note beat in 2/4
      return Math.floor((item.startBeatInMeasure + 1e-4) / 1.0);
    }
    // In 3/4 or 4/4, group within half-measure or beat-pair boundaries
    return Math.floor((item.startBeatInMeasure + 1e-4) / 2.0);
  };

  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (!item.isRest && item.beats <= 0.5 && !item.tieStop) {
      const groupKey = getBeamGroupKey(item);
      const maxRun = isCompoundSixEight ? 6 : 4;
      const run: MeasureNoteItem[] = [];
      while (
        i < items.length &&
        !items[i].isRest &&
        items[i].beats <= 0.5 &&
        !items[i].tieStop &&
        getBeamGroupKey(items[i]) === groupKey &&
        run.length < maxRun
      ) {
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

export function buildMeasuresFromSong(song: SongDef): MeasureNoteItem[][] {
  const measureBeats = song.measureBeats || 4;
  const events = normalizeSongToEvents(song);

  const measures: MeasureNoteItem[][] = [];
  let currentMeasure: MeasureNoteItem[] = [];
  let accBeats = 0;
  let targetMeasureBeats =
    song.pickupBeats && song.pickupBeats > 0 ? song.pickupBeats : measureBeats;

  const flushMeasure = () => {
    if (currentMeasure.length === 0) return;
    assignBeamsForMeasure(currentMeasure, song.timeSignature);
    measures.push(currentMeasure);
    currentMeasure = [];
    accBeats = 0;
    targetMeasureBeats = measureBeats;
  };

  for (const ev of events) {
    let remainingEventBeats = Number(ev.durationBeats.toFixed(4));
    const subItemsForEvent: MeasureNoteItem[] = [];

    while (remainingEventBeats > 1e-4) {
      const remainingInMeasure = Number((targetMeasureBeats - accBeats).toFixed(4));
      if (remainingInMeasure <= 1e-4) {
        flushMeasure();
        continue;
      }

      const chunkBeats = Math.min(remainingEventBeats, remainingInMeasure);
      const specs = decomposeDurationSpecs(chunkBeats);

      for (const spec of specs) {
        const specBeats = spec.divisions / DIVISIONS;
        const item: MeasureNoteItem = {
          isRest: ev.type === 'rest',
          noteId: ev.type === 'note' ? ev.pitch : undefined,
          beats: specBeats,
          startBeatInMeasure: Number(accBeats.toFixed(4)),
          globalIndex: ev.type === 'note' ? ev.noteIndex : undefined,
          spec
        };
        currentMeasure.push(item);
        subItemsForEvent.push(item);
        accBeats = Number((accBeats + specBeats).toFixed(4));
      }

      remainingEventBeats = Number((remainingEventBeats - chunkBeats).toFixed(4));
      if (accBeats >= targetMeasureBeats - 1e-3) {
        flushMeasure();
      }
    }

    if (ev.type === 'note' && subItemsForEvent.length > 1) {
      for (let idx = 0; idx < subItemsForEvent.length; idx++) {
        subItemsForEvent[idx].tieStart = idx < subItemsForEvent.length - 1;
        subItemsForEvent[idx].tieStop = idx > 0;
      }
    }
  }

  if (currentMeasure.length > 0) {
    flushMeasure();
  }

  return measures;
}

/**
 * Maps a logical note index in `song.notes` to its exact OSMD cursor step index,
 * accounting for rests, cross-barline ties, and compound tied durations.
 */
export function getCursorStepForNoteIndex(song: SongDef, noteIndex: number): number {
  if (song.cursorStepByNote && song.cursorStepByNote[noteIndex] !== undefined) {
    return song.cursorStepByNote[noteIndex];
  }
  const flatItems = buildMeasuresFromSong(song).flat();
  const foundIdx = flatItems.findIndex((item) => !item.isRest && item.globalIndex === noteIndex);
  if (foundIdx !== -1) {
    return foundIdx;
  }
  return Math.max(0, flatItems.length);
}

/**
 * Returns how many OSMD cursor steps a given playable note spans (1 for normal notes,
 * >1 for notes split across barlines or compound durations connected by ties).
 */
export function getCursorSpanForNoteIndex(song: SongDef, noteIndex: number): number {
  const flatItems = buildMeasuresFromSong(song).flat();
  const count = flatItems.filter((item) => !item.isRest && item.globalIndex === noteIndex).length;
  return Math.max(1, count);
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
  const keyFifths = song.keySignatureFifths ?? 0;
  const effectiveTempo = song.defaultBpm ?? DEFAULT_BPM_BY_SONG_ID[song.id] ?? 96;
  const keySignatureDefaults = getKeySignatureStepAlters(keyFifths);

  const measures = buildMeasuresFromSong(song);

  const measuresXml = measures
    .map((mNotes, mIdx) => {
      const attrXml =
        mIdx === 0
          ? `
      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key><fifths>${keyFifths}</fifths></key>
        <time><beats>${timeTop}</beats><beat-type>${timeBottom}</beat-type></time>
        <staves>1</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
      </attributes>
      <sound tempo="${effectiveTempo}"/>`
          : '';

      const alterState = new Map<string, number>();

      const notesXml = mNotes
        .map((item) => {
          const dotXml = item.spec.dotted ? '<dot/>' : '';
          if (item.isRest || !item.noteId) {
            return `      <note>
        <rest/>
        <duration>${item.spec.divisions}</duration>
        <voice>1</voice>
        <type>${item.spec.type}</type>${dotXml}
        <staff>1</staff>
      </note>`;
          }

          const pitch = parsePitchXml(item.noteId);
          const pitchKey = `${pitch.step}${pitch.octave}`;
          const prevAlter = alterState.has(pitchKey)
            ? alterState.get(pitchKey)!
            : (keySignatureDefaults[pitch.step] ?? 0);

          let accidentalXml = '';
          if (!item.tieStop && pitch.alter !== prevAlter) {
            if (pitch.alter === 1) {
              accidentalXml = '<accidental>sharp</accidental>';
            } else if (pitch.alter === -1) {
              accidentalXml = '<accidental>flat</accidental>';
            } else {
              accidentalXml = '<accidental>natural</accidental>';
            }
          }
          alterState.set(pitchKey, pitch.alter);

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
 * using a lossless monophonic timeline architecture:
 * - Tracks `divisions`, `<backup>`, `<forward>`, `<staff>`, and `<voice>` per measure
 * - Expands `<repeat direction="forward|backward">` sections
 * - Resolves `<tie type="start|stop">` via `resolveTiedNotes` so tied durations are summed
 * - Preserves rests explicitly as `MelodyEvent`s (`type: 'rest'`) and `restsAfter` — NEVER absorbs rests into notes
 * - Extracts `<key><fifths>...</fifths></key>` and `<sound tempo="..."/>`
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
  let keySignatureFifths = 0;
  let hasParsedKey = false;
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

    const fifthsMatch = /<key\b[^>]*>[\s\S]*?<fifths>\s*(-?\d+)\s*<\/fifths>[\s\S]*?<\/key>/i.exec(measureBody);
    if (fifthsMatch && !hasParsedKey) {
      const f = Number(fifthsMatch[1]);
      if (Number.isFinite(f)) {
        keySignatureFifths = Math.max(-7, Math.min(7, Math.trunc(f)));
        hasParsedKey = true;
      }
    }

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
  const melodyEvents: MelodyEvent[] = [];
  const restsAfter: Record<number, number> = {};

  for (const event of expandedEvents) {
    if (event.isRest || event.notes.length === 0) {
      const restBeats = Math.max(0.125, Math.round(event.durationBeats * 10000) / 10000);
      const prevEvent = melodyEvents[melodyEvents.length - 1];
      if (prevEvent && prevEvent.type === 'rest') {
        prevEvent.beats = Number((prevEvent.beats + restBeats).toFixed(4));
      } else {
        melodyEvents.push({ type: 'rest', beats: restBeats });
      }
      const afterNoteIdx = allNotes.length - 1;
      restsAfter[afterNoteIdx] = Number(((restsAfter[afterNoteIdx] ?? 0) + restBeats).toFixed(4));
      continue;
    }

    const melodyNote = event.notes[0];
    if (!melodyNote.shouldPlay) {
      // Tied continuation note: its duration was already accumulated into the tieStart note by resolveTiedNotes
      continue;
    }

    const roundedBeat = Math.max(0.125, Math.round(melodyNote.durationBeats * 10000) / 10000);
    allNotes.push(melodyNote.name);
    allBeats.push(roundedBeat);
    melodyEvents.push({
      type: 'note',
      pitch: melodyNote.name,
      beats: roundedBeat
    });

    if (allNotes.length >= 512) break;
  }

  if (allNotes.length === 0) {
    allNotes.push('C4', 'D4', 'E4', 'F4', 'G4');
    allBeats.push(1, 1, 1, 1, 2);
    melodyEvents.push(
      { type: 'note', pitch: 'C4', beats: 1 },
      { type: 'note', pitch: 'D4', beats: 1 },
      { type: 'note', pitch: 'E4', beats: 1 },
      { type: 'note', pitch: 'F4', beats: 1 },
      { type: 'note', pitch: 'G4', beats: 2 }
    );
  }

  const measureBeats = Math.max(1, Math.round(((timeTop * 4) / timeBottom) * 100) / 100);
  const firstMeasureBeats = parsedMeasures[0]?.totalBeats ?? measureBeats;
  const pickupBeats =
    parsedMeasures[0]?.implicit || (firstMeasureBeats > 0 && firstMeasureBeats < measureBeats - 0.05)
      ? Math.round(firstMeasureBeats * 100) / 100
      : undefined;

  return {
    id: `custom-${Date.now()}`,
    title,
    source: composer,
    level: 'MusicXML Импорт',
    category: 'classical',
    variant: 'melodyArrangement',
    keySignatureFifths,
    verification: {
      excerpt: {
        status: 'unverified',
        sourceTitle: `${composer} — ${title} (MusicXML import)`,
        sourceMeasures: 'Imported score'
      },
      melodyArrangement: {
        status: 'unverified',
        sourceTitle: `${composer} — ${title} (MusicXML import)`,
        sourceMeasures: 'Imported score'
      }
    },
    description: `Импортированная партитура MusicXML (${allNotes.length} нот, размер ${timeTop}/${timeBottom}, ♩=${detectedTempo}).`,
    events: melodyEvents,
    notes: allNotes,
    beats: allBeats,
    restsAfter: Object.keys(restsAfter).length > 0 ? restsAfter : undefined,
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
