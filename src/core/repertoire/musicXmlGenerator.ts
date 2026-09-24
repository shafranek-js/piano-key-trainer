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

    if (accBeats >= measureBeats - 0.001 || i === song.notes.length - 1) {
      assignBeamsForMeasure(currentMeasure);
      measures.push(currentMeasure);
      currentMeasure = [];
      accBeats = 0;
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

      return `    <measure number="${mIdx + 1}">${attrXml}
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
