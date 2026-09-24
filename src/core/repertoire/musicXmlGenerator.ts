import JSZip from 'jszip';
import type { SongDef } from './repertoireData';

const DIVISIONS = 4; // 4 divisions per quarter note

interface DurationSpec {
  type: '16th' | 'eighth' | 'quarter' | 'half' | 'whole';
  dotted: boolean;
  divisions: number;
}

function getDurationSpec(beats: number): DurationSpec {
  if (Math.abs(beats - 0.25) < 0.05) {
    return { type: '16th', dotted: false, divisions: 1 };
  }
  if (Math.abs(beats - 0.5) < 0.05) {
    return { type: 'eighth', dotted: false, divisions: 2 };
  }
  if (Math.abs(beats - 0.75) < 0.05) {
    return { type: 'eighth', dotted: true, divisions: 3 };
  }
  if (Math.abs(beats - 1) < 0.05) {
    return { type: 'quarter', dotted: false, divisions: 4 };
  }
  if (Math.abs(beats - 1.5) < 0.05) {
    return { type: 'quarter', dotted: true, divisions: 6 };
  }
  if (Math.abs(beats - 2) < 0.05) {
    return { type: 'half', dotted: false, divisions: 8 };
  }
  if (Math.abs(beats - 3) < 0.05) {
    return { type: 'half', dotted: true, divisions: 12 };
  }
  if (beats >= 3.5) {
    return { type: 'whole', dotted: false, divisions: 16 };
  }
  return {
    type: 'quarter',
    dotted: false,
    divisions: Math.max(1, Math.round(beats * DIVISIONS))
  };
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
  beam?: 'begin' | 'continue' | 'end';
}

function assignBeamsForMeasure(items: MeasureNoteItem[]): void {
  let i = 0;
  while (i < items.length) {
    if (items[i].beats <= 0.5) {
      const run: MeasureNoteItem[] = [];
      while (i < items.length && items[i].beats <= 0.5 && run.length < 4) {
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
 */
export function songToMusicXml(song: SongDef): string {
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
    const spec = getDurationSpec(b);

    currentMeasure.push({
      noteId,
      beats: b,
      globalIndex: i,
      spec
    });
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
          if (pitch.alter === 1 && prevAlter !== 1) {
            accidentalXml = '<accidental>sharp</accidental>';
          } else if (pitch.alter === -1 && prevAlter !== -1) {
            accidentalXml = '<accidental>flat</accidental>';
          } else if (pitch.alter === 0 && prevAlter !== 0) {
            accidentalXml = '<accidental>natural</accidental>';
          }
          alterState.set(pitchKey, pitch.alter);

          const dotXml = item.spec.dotted ? '<dot/>' : '';
          const beamXml = item.beam ? `<beam number="1">${item.beam}</beam>` : '';

          return `      <note>
        ${pitch.xml}
        <duration>${item.spec.divisions}</duration>
        <voice>1</voice>
        <type>${item.spec.type}</type>${dotXml}${accidentalXml}
        <staff>1</staff>${beamXml}
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

/**
 * Parses a MusicXML (.musicxml / .xml) string into a playable SongDef
 * (following MelodicaTrainer's first-part, first-staff melody extraction pattern).
 */
export function parseMusicXmlToSongDef(xmlText: string, fallbackTitle = 'Импортированная пьеса'): SongDef {
  const workTitleMatch = /<work-title>([\s\S]*?)<\/work-title>/i.exec(xmlText);
  const movementTitleMatch = /<movement-title>([\s\S]*?)<\/movement-title>/i.exec(xmlText);
  const composerMatch = /<creator[^>]*type=["']composer["'][^>]*>([\s\S]*?)<\/creator>/i.exec(xmlText);

  const cleanFallback = fallbackTitle.replace(/\.(musicxml|xml|mxl)$/i, '').trim();
  const title = (workTitleMatch?.[1] || movementTitleMatch?.[1] || cleanFallback).trim();
  const composer = (composerMatch?.[1] || 'MusicXML Импорт').trim();

  // Extract first <part>...</part>
  const partMatch = /<part\b[^>]*>([\s\S]*?)<\/part>/i.exec(xmlText);
  const partContent = partMatch ? partMatch[1] : xmlText;

  let divisions = 4;
  let timeTop = 4;
  let timeBottom = 4;

  const divMatch = /<divisions>\s*(\d+)\s*<\/divisions>/i.exec(partContent);
  if (divMatch) divisions = Math.max(1, Number(divMatch[1]));

  const beatsMatch = /<time\b[^>]*>[\s\S]*?<beats>\s*(\d+)\s*<\/beats>[\s\S]*?<beat-type>\s*(\d+)\s*<\/beat-type>[\s\S]*?<\/time>/i.exec(
    partContent
  );
  if (beatsMatch) {
    timeTop = Math.max(1, Number(beatsMatch[1]));
    timeBottom = Math.max(1, Number(beatsMatch[2]));
  }

  const allNotes: string[] = [];
  const allBeats: number[] = [];

  const noteRegex = /<note\b[^>]*>([\s\S]*?)<\/note>/gi;
  let m: RegExpExecArray | null;
  while ((m = noteRegex.exec(partContent)) !== null) {
    const noteBody = m[1];
    // Skip rests, chord secondary notes, grace notes, and tie-stop continuations
    if (/<rest\b/i.test(noteBody)) continue;
    if (/<chord\b/i.test(noteBody)) continue;
    if (/<grace\b/i.test(noteBody)) continue;
    if (/<tie\b[^>]*type=["']stop["']/i.test(noteBody) && !/<tie\b[^>]*type=["']start["']/i.test(noteBody)) {
      continue;
    }

    const staffMatch = /<staff>\s*(\d+)\s*<\/staff>/i.exec(noteBody);
    if (staffMatch && Number(staffMatch[1]) !== 1) continue;

    const stepMatch = /<step>\s*([A-G])\s*<\/step>/i.exec(noteBody);
    const octMatch = /<octave>\s*(\d+)\s*<\/octave>/i.exec(noteBody);
    if (!stepMatch || !octMatch) continue;

    const alterMatch = /<alter>\s*(-?\d+)\s*<\/alter>/i.exec(noteBody);
    const alter = alterMatch ? Number(alterMatch[1]) : 0;

    const durMatch = /<duration>\s*(\d+)\s*<\/duration>/i.exec(noteBody);
    const rawDivs = durMatch ? Number(durMatch[1]) : divisions;
    const rawBeats = Math.max(0.25, Math.min(4, rawDivs / divisions));
    // Snap to standard grid (0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4)
    const standardGrid = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
    const snappedBeat = standardGrid.reduce((prev, curr) =>
      Math.abs(curr - rawBeats) < Math.abs(prev - rawBeats) ? curr : prev
    );

    allNotes.push(pitchToKeyboardNoteId(stepMatch[1], alter, Number(octMatch[1])));
    allBeats.push(snappedBeat);

    if (allNotes.length >= 512) break;
  }

  if (allNotes.length === 0) {
    allNotes.push('C4', 'D4', 'E4', 'F4', 'G4');
    allBeats.push(1, 1, 1, 1, 2);
  }

  const measureBeats = timeBottom === 8 ? Math.max(2, Math.round(timeTop / 2)) : timeTop;
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
    description: `Импортированная партитура MusicXML (${allNotes.length} нот, размер ${timeTop}/${timeBottom}).`,
    notes,
    beats,
    fullNotes: hasLongerFull ? allNotes : undefined,
    fullBeats: hasLongerFull ? allBeats : undefined,
    measureBeats,
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


