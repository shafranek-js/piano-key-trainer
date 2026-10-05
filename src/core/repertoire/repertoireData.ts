import { FULL_REPERTOIRE_DATA } from './fullRepertoireData';

export type RepertoireLengthMode = 'excerpt' | 'full';

export type RepertoireVariant =
  | 'excerpt'
  | 'melodyArrangement'
  | 'fullScore';

export type RepertoireVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'needsCorrection';

export interface RepertoireVerificationRecord {
  status: RepertoireVerificationStatus;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceEdition?: string;
  sourceMovement?: string;
  sourcePart?: string;
  sourceMeasures?: string;
  verifiedAt?: string;
  notes?: string;
}

export type RepertoireVerificationMetadata = RepertoireVerificationRecord;

export interface SongVerificationMap {
  excerpt: RepertoireVerificationRecord;
  melodyArrangement: RepertoireVerificationRecord;
}

export type MelodyEvent =
  | { type: 'note'; pitch: string; beats: number }
  | { type: 'rest'; beats: number };

export interface NormalizedMelodyEvent {
  type: 'note' | 'rest';
  pitch?: string;
  startBeat: number;
  durationBeats: number;
  measure: number;
  beatInMeasure: number;
  noteIndex?: number;
}

export interface NoteEnvelopeOptions {
  allowTailOverlapMs?: number;
  legatoRatio?: number;
  defaultReleaseSec?: number;
}

export interface NoteEnvelopeTiming {
  onsetMs: number;
  nominalDurationMs: number;
  releaseStartMs: number;
  releaseDurationMs: number;
  nextOnsetMs: number;
}

export interface ScheduledPlaybackItem {
  type: 'note' | 'rest';
  pitch?: string;
  noteIndex?: number;
  measure: number;
  beatInMeasure: number;
  startBeat: number;
  durationBeats: number;
  onsetMs: number;
  nominalDurationMs: number;
  releaseStartMs: number;
  releaseDurationMs: number;
  nextOnsetMs: number;
}

export interface SongDef {
  id: string;
  title: string;
  source: string;
  level: string;
  category?: 'warmup' | 'study' | 'classical' | 'melody';
  description: string;
  variant: RepertoireVariant;
  fullVariant?: RepertoireVariant;
  keySignatureFifths?: number;
  verification: SongVerificationMap;
  activeVerification?: RepertoireVerificationRecord;
  events?: MelodyEvent[];
  fullEvents?: MelodyEvent[];
  notes: string[];
  beats: number[];
  fullNotes?: string[];
  fullBeats?: number[];
  measureBeats: number;
  pickupBeats?: number;
  defaultBpm?: number;
  rawXml?: string;
  fullRawXml?: string;
  cursorStepByNote?: number[];
  fullCursorStepByNote?: number[];
  timeSignature?: [number, number];
  phraseBars: number;
  restsAfter?: Record<number, number>;
  fullRestsAfter?: Record<number, number>;
}

export const REPERTOIRE: readonly SongDef[] = [
  {
    id: 'five-note-c',
    title: 'Пять нот C',
    source: 'Оригинальное упражнение Piano Key Trainer',
    level: 'Очень легко',
    category: 'warmup',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Piano Key Trainer Original Pedagogical Exercise: Five-Finger C Major Warmup',
        sourceEdition: 'Piano Key Trainer Original Pedagogical Exercise (internal curriculum specification, 2026)',
        sourceMovement: 'Five-Finger C Major Position Warmup (4/4, C major)',
        sourcePart: 'Single-line right-hand five-finger C4–G4 pattern',
        sourceMeasures: 'mm. 1–3',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (9 notes, 0 rests, 12.0 quarter-beats across 3 measures in 4/4 meter) against the internal Piano Key Trainer pedagogical specification: ascending C4–D4–E4–F4 (m. 1), descending G4–F4–E4–D4 (m. 2), and whole-note tonic resolution C4(4) (m. 3) strictly within the C4–G4 five-finger position.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Piano Key Trainer Original Pedagogical Exercise: Five-Finger C Major Sequential Warmup',
        sourceEdition: 'Piano Key Trainer Original Pedagogical Exercise (internal curriculum specification, 2026)',
        sourceMovement: 'Sequential Five-Finger & Broken-Triad Warmup on C4, D4, and E4 (4/4, C major)',
        sourcePart: 'Single-line diatonic C-major warmup spanning C4–C5',
        sourceMeasures: 'mm. 1–12 (three 4-measure sequential modules on C4–G4, D4–A4, and E4–C5)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (41 notes, 0 rests, 48.0 quarter-beats across 12 measures in 4/4 meter) against the internal Piano Key Trainer pedagogical specification: mm. 1–2 match the excerpt 5-finger arch C4..G4..D4, m. 3 adds the tonic broken triad C4–E4–G4–E4 resolving to C4(4) in m. 4, followed by diatonic transpositions to D4–A4 (mm. 5–8) and E4–C5 (mm. 9–11) with a stepwise E4(1)–D4(1)–C4(2) cadence in m. 12.'
      }
    },
    description: 'Короткий ход C–D–E–F–G и обратно в пятипальцевой позиции C4–G4. Читается по тактам и фразам.',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 4],
    defaultBpm: 84,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'ode-joy',
    title: 'Ode to Joy · тема',
    source: 'L. van Beethoven · Симфония № 9 (Op. 125)',
    level: 'Легко',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Ludwig van Beethoven, Symphony No. 9 in D minor, Op. 125, IV. Finale ("Ode to Joy")',
        sourceEdition:
          'Breitkopf & Härtel, Ludwig van Beethovens Werke, Serie 1, Nr. 9 (Leipzig, 1863), IV. Finale, mm. 92–95 / Mutopia-2009/08/05-528 (ode.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly',
        sourceMovement: 'IV. Presto – Allegro assai (4/4, transposed from D/G major to C major)',
        sourcePart: 'Principal Joy theme (Soprano / Violoncello & Contrabasso theme, transposed to C major)',
        sourceMeasures: 'mm. 1–4 (orchestral score mm. 92–95)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (15 notes, 0 rests, 16.0 quarter-beats) against Mutopia-2009/08/05-528 (ode.ly, mm. 1–4) and Breitkopf & Härtel Serie 1 Nr. 9 (mm. 92–95), transposed to C major.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Ludwig van Beethoven, Symphony No. 9 in D minor, Op. 125, IV. Finale ("Ode to Joy")',
        sourceEdition:
          'Mutopia-2009/08/05-528 (ode.ly, Soprano voice) / derived from Breitkopf & Härtel Serie 1 Nr. 9, IV. Finale, mm. 92–107',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly',
        sourceMovement: 'IV. Allegro assai / Hymn setting (4/4, transposed from G major to C major)',
        sourcePart: 'Soprano melody line (\sop in ode.ly), transposed a fifth down from G major to C major',
        sourceMeasures: 'mm. 1–16',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (62 notes, 0 rests, 64.0 quarter-beats) against Mutopia-2009/08/05-528 (ode.ly, \sop, mm. 1–16) transposed from G major to C major, including the standard unsyncopated hymn cadence G3(2) | E4(1) at mm. 12–13.'
      }
    },
    description: 'Четыре такта 4/4: знаменитый гимн Бетховена с пунктирным ритмом и половинной нотой в каденции.',
    notes: ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2],
    defaultBpm: 104,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    source: 'Американская детская песня XIX в. · стихи S. J. Hale (1830) · мелодия «Good Night / Merrily We Roll Along» (Carmina Yalensia, 1867, p. 47)',
    level: 'Легко',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle:
          'Mary Had a Little Lamb (Poem by Sarah Josepha Hale, Poems for Our Children, Boston: Marsh, Capen & Lyon, 1830; set to the chorus melody "Merrily We Roll Along" from "Good Night", first published in Carmina Yalensia, 1867, p. 47, with E. P. Christy\'s 1847 "Farewell Ladies" as an earlier precursor)',
        sourceEdition:
          'Ferd. V. D. Garretson (ed.), Carmina Yalensia: A Complete and Accurate Collection of Yale College Songs, with Piano Accompaniment (New York: Taintor Brothers & Co., 1867), p. 47 ("Good Night" / chorus "Merrily we roll along"); cross-checked with Henry Randall Waite, Carmina Collegensia (Boston: Oliver Ditson & Co., 1868), p. 41',
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/e/e4/Carmina_Yalensia_-_a_complete_and_accurate_collection_of_Yale_College_songs_-_with_piano_accompaniment_%28IA_carminayalensiac00garr%29.pdf',
        sourceMovement: 'Moderato (4/4, C major)',
        sourcePart: 'Vocal / right-hand chorus melody line in C4–G4 five-finger position',
        sourceMeasures: 'mm. 1–4 (antecedent phrase: "Mary had a little lamb, little lamb, little lamb")',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (13 notes, 0 rests, 16.0 quarter-beats across 4 measures in 4/4 meter) against the "Merrily We Roll Along" chorus melody first printed in Carmina Yalensia (1867, p. 47, "Good Night", with E. P. Christy\'s 1847 "Farewell Ladies" as historical precursor) and Carmina Collegensia (1868, p. 41), transposed to C major (distinct from Lowell Mason\'s 1831 Juvenile Lyre tune), preserving repeated-note quarter/half articulations E4(1)–E4(1)–E4(2), D4(1)–D4(1)–D4(2), and E4(1)–G4(1)–G4(2).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle:
          'Mary Had a Little Lamb (Poem by Sarah Josepha Hale, Poems for Our Children, Boston: Marsh, Capen & Lyon, 1830; set to the chorus melody "Merrily We Roll Along" from "Good Night", first published in Carmina Yalensia, 1867, p. 47, with E. P. Christy\'s 1847 "Farewell Ladies" as an earlier precursor)',
        sourceEdition:
          'Ferd. V. D. Garretson (ed.), Carmina Yalensia: A Complete and Accurate Collection of Yale College Songs, with Piano Accompaniment (New York: Taintor Brothers & Co., 1867), p. 47 ("Good Night" / chorus "Merrily we roll along"); cross-checked with Henry Randall Waite, Carmina Collegensia (Boston: Oliver Ditson & Co., 1868), p. 41',
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/e/e4/Carmina_Yalensia_-_a_complete_and_accurate_collection_of_Yale_College_songs_-_with_piano_accompaniment_%28IA_carminayalensiac00garr%29.pdf',
        sourceMovement: 'Moderato (4/4, C major)',
        sourcePart: 'Vocal / right-hand chorus melody line in C4–G4 five-finger position',
        sourceMeasures: 'mm. 1–8 (complete 8-measure nursery stanza)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (26 notes, 0 rests, 32.0 quarter-beats across 8 measures in 4/4 meter) against the "Merrily We Roll Along" chorus melody first printed in Carmina Yalensia (1867, p. 47, "Good Night", with E. P. Christy\'s 1847 "Farewell Ladies" as historical precursor) and Carmina Collegensia (1868, p. 41), transposed to C major, with four repeated E4 quarter notes in m. 6 ("whose fleece was white") and a whole-note tonic cadence C4(4) in m. 8.'
      }
    },
    description: 'Классическая детская мелодия: чередование четвертных (1 счёт) и протяжных половинных нот (2 счёта).',
    notes: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4'],
    beats: [1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2],
    defaultBpm: 100,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    source: 'Французская мелодия XVIII в. «Ah! vous dirai-je, maman» · стихи Jane Taylor (1806)',
    level: 'Легко +',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle:
          'Ah! vous dirai-je, maman (18th-century French melody) / Twinkle, Twinkle, Little Star (poem "The Star" by Jane Taylor, Rhymes for the Nursery, London, 1806)',
        sourceEdition:
          'Historical context: François Bouin publications of the melody in the early 1760s (including Les Amusements d\'une heure et demy, Paris, 1762). Exact event-reference scan: anonymous Recueil d\'Airs Choisis comme Brunettes, Romances, Villageoises, Vaudevilles, Rondes & Autres, manuscript dated [1770–1790], BnF Gallica ark:/12148/btv1b52501904w/f102, "Ah vous dirai-je Maman", pp. 99–100; Modern transcription reference for event cross-check: Wikimedia Commons File:Ah!_vous_dirai-je,_Maman_(partition).jpg (typeset 2007, transposed -2 semitones from D major to C major)',
        sourceUrl: 'https://gallica.bnf.fr/ark:/12148/btv1b52501904w/f102.item',
        sourceMovement: 'Section A (4/4, original D major transposed -2 semitones to C major)',
        sourcePart: 'Vocal / principal melody line (not derived from W. A. Mozart\'s variation set K. 265/300e)',
        sourceMeasures: 'mm. 1–4 (opening 4-measure A-section)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (14 notes, 0 rests, 16.0 quarter-beats across 4 measures in 4/4 meter) against the 18th-century French melody "Ah! vous dirai-je, maman" (historical context: François Bouin publications in the early 1760s, including Les Amusements d\'une heure et demy, Paris, 1762; exact digitized event-reference scan: anonymous Recueil d\'Airs Choisis comme Brunettes, Romances, Villageoises, Vaudevilles, Rondes & Autres, manuscript dated [1770–1790], BnF Gallica ark:/12148/btv1b52501904w/f102, "Ah vous dirai-je Maman", pp. 99–100; cross-checked against modern transcription File:Ah!_vous_dirai-je,_Maman_(partition).jpg, transposed -2 semitones from D major to C major), with twin-note quarter pairs and half-note phrase endings G4(2) in m. 2 and C4(2) in m. 4.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle:
          'Ah! vous dirai-je, maman (18th-century French melody) / Twinkle, Twinkle, Little Star (poem "The Star" by Jane Taylor, Rhymes for the Nursery, London, 1806)',
        sourceEdition:
          'Historical context: François Bouin publications of the melody in the early 1760s (including Les Amusements d\'une heure et demy, Paris, 1762). Exact event-reference scan: anonymous Recueil d\'Airs Choisis comme Brunettes, Romances, Villageoises, Vaudevilles, Rondes & Autres, manuscript dated [1770–1790], BnF Gallica ark:/12148/btv1b52501904w/f102, "Ah vous dirai-je Maman", pp. 99–100; Modern transcription reference for event cross-check: Wikimedia Commons File:Ah!_vous_dirai-je,_Maman_(partition).jpg (typeset 2007, transposed -2 semitones from D major to C major)',
        sourceUrl: 'https://gallica.bnf.fr/ark:/12148/btv1b52501904w/f102.item',
        sourceMovement: 'Complete A–B–B–A ternary song form (4/4, original D major transposed -2 semitones to C major)',
        sourcePart: 'Vocal / principal melody line with unfolded Da Capo (D.C. al Fine)',
        sourceMeasures: 'mm. 1–12 (A: mm. 1–4; B1: mm. 5–6; B2: mm. 7–8; A Da Capo: mm. 9–12)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (42 notes, 0 rests, 48.0 quarter-beats across 12 measures in 4/4 meter) against the 18th-century French melody "Ah! vous dirai-je, maman" (historical context: François Bouin publications in the early 1760s, including Les Amusements d\'une heure et demy, Paris, 1762; exact digitized event-reference scan: anonymous Recueil d\'Airs Choisis comme Brunettes, Romances, Villageoises, Vaudevilles, Rondes & Autres, manuscript dated [1770–1790], BnF Gallica ark:/12148/btv1b52501904w/f102, "Ah vous dirai-je Maman", pp. 99–100; cross-checked against modern transcription File:Ah!_vous_dirai-je,_Maman_(partition).jpg, transposed -2 semitones from D major to C major) with the repeat of the 2-bar B-phrase ("Up above the world so high / Like a diamond in the sky") and full Da Capo return of Section A.'
      }
    },
    description: 'Четыре такта 4/4: скачки на квинту со светлыми половинными каденциями на нотах G4 и C4.',
    notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2],
    defaultBpm: 96,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'bach-minuet-g',
    title: 'Minuet in G major (BWV Anh. 114)',
    source: 'Christian Petzold (attr. J. S. Bach) · BWV Anh. 114 · Нотная тетрадь Анны Магдалены',
    level: 'Классика · Барокко',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 1,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle:
          'Christian Petzold (1677–1733; traditionally attributed to J. S. Bach), Menuet in G major, BWV Anh. 114, from Notebook for Anna Magdalena Bach (1725)',
        sourceEdition:
          'Bach-Gesellschaft Ausgabe, Band 43.2: Joh. Seb. Bachs Musikstücke in den Notenbüchern der Anna Magdalena Bach, ed. Paul Graf Waldersee (Breitkopf & Härtel, Leipzig, 1894), No. 4, p. 31 / Mutopia-2017/01/19-75',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.ly',
        sourceMovement: 'Menuet in G major (3/4, G major)',
        sourcePart: 'Harpsichord / Clavichord right-hand upper voice (voiceone)',
        sourceMeasures: 'mm. 1–8',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (33 notes, 0 rests, 24.0 quarter-beats) against Bach-Gesellschaft Band 43.2 / Mutopia-2017/01/19-75 (mm. 1–8); m. 8 appoggiatura (\\grace b8 a2.) is realized on the beat as B4(1.0) + A4(2.0), and mordents are omitted in monophonic pitch training.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle:
          'Christian Petzold (1677–1733; traditionally attributed to J. S. Bach), Menuet in G major, BWV Anh. 114, from Notebook for Anna Magdalena Bach (1725)',
        sourceEdition:
          'Bach-Gesellschaft Ausgabe, Band 43.2: Joh. Seb. Bachs Musikstücke in den Notenbüchern der Anna Magdalena Bach, ed. Paul Graf Waldersee (Breitkopf & Härtel, Leipzig, 1894), No. 4, p. 31 / Mutopia-2017/01/19-75',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.ly',
        sourceMovement: 'Menuet in G major (3/4, G major)',
        sourcePart: 'Harpsichord / Clavichord right-hand upper voice (voiceone)',
        sourceMeasures: 'mm. 1–32 (complete binary form without repeats)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (127 notes, 0 rests, 96.0 quarter-beats) against Bach-Gesellschaft Band 43.2 / Mutopia-2017/01/19-75 (mm. 1–32); m. 8 appoggiatura (\\grace b8 a2.) is realized on the beat as B4(1.0) + A4(2.0), and m. 32 final chord <d b g\'>2. uses the upper melody note G4(3.0).'
      }
    },
    description: 'Подлинный ритм барочного менуэта Кристиана Петцольда (BWV Anh. 114) в размере 3/4: четверти сочетаются с грациозными пассажами восьмых нот.',
    notes: [
      'D5', 'G4', 'A4', 'B4', 'C5',
      'D5', 'G4', 'G4',
      'E5', 'C5', 'D5', 'E5', 'F#5',
      'G5', 'G4', 'G4',
      'C5', 'D5', 'C5', 'B4', 'A4',
      'B4', 'C5', 'B4', 'A4', 'G4',
      'F#4', 'G4', 'A4', 'B4', 'G4',
      'B4', 'A4'
    ],
    beats: [
      1, 0.5, 0.5, 0.5, 0.5,
      1, 1, 1,
      1, 0.5, 0.5, 0.5, 0.5,
      1, 1, 1,
      1, 0.5, 0.5, 0.5, 0.5,
      1, 0.5, 0.5, 0.5, 0.5,
      1, 0.5, 0.5, 0.5, 0.5,
      1, 2
    ],
    defaultBpm: 108,
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'beethoven-fur-elise',
    title: 'Für Elise (WoO 59) · Тема',
    source: 'L. van Beethoven · Багатель ля минор (WoO 59)',
    level: 'Классика · Романтизм',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Ludwig van Beethoven, Bagatelle in A minor ("Für Elise"), WoO 59',
        sourceEdition:
          'Breitkopf & Härtel, Ludwig van Beethovens Werke, Serie 18: Kleinere Stücke für das Pianoforte, Nr. 199 (Leipzig, 1888), p. 20 / Mutopia-2015/08/18-931',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly',
        sourceMovement: 'Poco moto (3/8, A minor)',
        sourcePart: 'Piano right-hand part (Staff = "up", treble clef)',
        sourceMeasures: 'pickup (last eighth of m. 0: two 16ths E5–D#5) + mm. 1–8 (1st ending)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (35 notes + 5 sixteenth rests = 40 events, 12.0 quarter-beats in 3/8 meter, pickupBeats = 0.5, measureBeats = 1.5) against Breitkopf & Härtel (1888) Serie 18 Nr. 199 / Mutopia-2015/08/18-931, preserving the explicit r16 rests after A4, B4, and C5 in mm. 2–4 and 6–7.'
      },
      melodyArrangement: {
        status: 'unverified',
        sourceTitle: 'Ludwig van Beethoven, Bagatelle in A minor ("Für Elise"), WoO 59 (abridged A–B–A\' pedagogical arrangement)',
        sourceEdition:
          'Breitkopf & Härtel, Ludwig van Beethovens Werke, Serie 18, Nr. 199 (Leipzig, 1888) / Mutopia-2015/08/18-931 (with condensed m. 12–14 transition)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly',
        sourceMovement: 'Poco moto (3/8, A minor)',
        sourcePart: 'Piano right-hand part (Staff = "up", with 1-bar pedagogical condensation of mm. 12–14)',
        sourceMeasures: 'pickup + mm. 1–7, 8b, 9–11, condensed m. 12/14, mm. 15–22',
        notes:
          'Unverified pedagogical arrangement: mm. 1–11 and mm. 15–22 match Breitkopf & Härtel (1888) in 3/8 meter with explicit r16 rests and dotted-eighth notes (0.75 quarter-beats in mm. 9–11), but the 3-measure hand-crossing octave-echo transition (mm. 12–14, which reaches E6/e\'\'\' above the C2–C6 keyboard limit) is condensed into a single measure (B4–rest–E4–E5–D#5).'
      }
    },
    description: 'Подлинная тема Бетховена в размере 3/8: шестнадцатый затакт E5–D#5, паузы r16 перед фигурациями C4–E4–A4 и E4–G#4–B4 и классическая каденция.',
    notes: [
      'E5', 'D#5',
      'E5', 'D#5', 'E5', 'B4', 'D5', 'C5',
      'A4', 'C4', 'E4', 'A4',
      'B4', 'E4', 'G#4', 'B4',
      'C5', 'E4', 'E5', 'D#5',
      'E5', 'D#5', 'E5', 'B4', 'D5', 'C5',
      'A4', 'C4', 'E4', 'A4',
      'B4', 'E4', 'C5', 'B4',
      'A4'
    ],
    beats: [
      0.25, 0.25,
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.25,
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.25,
      1
    ],
    restsAfter: {
      8: 0.25,
      12: 0.25,
      16: 0.25,
      26: 0.25,
      30: 0.25
    },
    pickupBeats: 0.5,
     defaultBpm: 72,
    measureBeats: 1.5,
    timeSignature: [3, 8],
    phraseBars: 2
  },
  {
    id: 'burgmuller-arabesque',
    title: 'Arabesque Op. 100 No. 2',
    source: 'F. Burgmüller · 25 прогрессивных этюдов (Op. 100)',
    level: 'Этюд · Беглость',
    category: 'study',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Johann Friedrich Franz Burgmüller, 25 Études faciles et progressives, Op. 100, No. 2: L\'Arabesque',
        sourceEdition: 'Collection Litolff (Braunschweig, 19th Century) / Mutopia-2013/01/12-203 (25EF-02.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BurgmullerJFF/O100/25EF-02/25EF-02.ly',
        sourceMovement: 'No. 2. L\'Arabesque — Allegro scherzando (2/4, A minor)',
        sourcePart: 'Piano right-hand part (MD), transposed one octave down for the C2–C6 training register',
        sourceMeasures: 'mm. 3–10a (1st ending, following the 2-bar LH chord introduction)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (30 notes + 6 rest spans = 36 events, 16.0 quarter-beats in 2/4 meter) against Collection Litolff / Mutopia-2013/01/12-203 (mm. 3–10a), transposed one octave down so m. 6 (A5–B5–C6–D6–E6 -> A4–B4–C5–D5–E5) fits within the C2–C6 keyboard.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Johann Friedrich Franz Burgmüller, 25 Études faciles et progressives, Op. 100, No. 2: L\'Arabesque',
        sourceEdition: 'Collection Litolff (Braunschweig, 19th Century) / Mutopia-2013/01/12-203 (25EF-02.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BurgmullerJFF/O100/25EF-02/25EF-02.ly',
        sourceMovement: 'No. 2. L\'Arabesque — Allegro scherzando (2/4, A minor)',
        sourcePart: 'Piano right-hand part (MD), transposed one octave down for the C2–C6 training register',
        sourceMeasures: 'mm. 3–9, 10b (2nd ending), mm. 11–25, 26a (1st ending)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (77 notes + 10 rest spans = 87 events, 48.0 quarter-beats in 2/4 meter) against Collection Litolff / Mutopia-2013/01/12-203 (mm. 3–26a), transposed one octave down for the C2–C6 training register.'
      }
    },
    description: 'Знаменитый этюд Бургмюллера в ля миноре (2/4): стремительные шестнадцатые фигуры с восьмыми паузами и синкопированной лигой через тактовую черту.',
    notes: [
      'A3', 'B3', 'C4', 'B3', 'A3',
      'A3', 'B3', 'C4', 'D4', 'E4',
      'D4', 'E4', 'F4', 'G4', 'A4',
      'A4', 'B4', 'C5', 'D5', 'E5',
      'E4', 'E4', 'F4',
      'D4', 'D4', 'G4', 'D4', 'E4',
      'C4', 'E4'
    ],
    beats: [
      0.25, 0.25, 0.25, 0.25, 0.5,
      0.25, 0.25, 0.25, 0.25, 0.5,
      0.25, 0.25, 0.25, 0.25, 0.5,
      0.25, 0.25, 0.25, 0.25, 0.5,
      0.5, 0.5, 0.5,
      0.5, 1.5, 0.5, 0.5, 0.5,
      0.5, 1
    ],
    restsAfter: {
      4: 0.5,
      9: 0.5,
      14: 0.5,
      19: 1,
      23: 0.5,
      28: 0.5
    },
    defaultBpm: 120,
    measureBeats: 2,
    timeSignature: [2, 4],
    phraseBars: 2
  },
  {
    id: 'mozart-nachtmusik',
    title: 'Eine kleine Nachtmusik · Тема',
    source: 'W. A. Mozart (KV 525) · Серенада № 13',
    level: 'Классика · Празднично',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 1,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Wolfgang Amadeus Mozart, Eine kleine Nachtmusik, K. 525',
        sourceEdition:
          'Neue Mozart-Ausgabe, Serie IV: Orchesterwerke, Werkgruppe 12: Kassationen, Serenaden und Divertimenti für Orchester, Band 6, ed. Karl Heinz Füssl & Ernst Fritz Schmid (Bärenreiter, BA 4544-01, 1964), p. 43 (K. 525: pp. 43–62)',
        sourceUrl: 'https://dme.mozarteum.at/DME/nma/nma_cont.php?gen=edition&l=1&p1=43&vsep=125',
        sourceMovement: 'I. Allegro (4/4, G major)',
        sourcePart: 'Violin I, melodic line, transposed one octave down for the training register',
        sourceMeasures: 'mm. 1–4',
        verifiedAt: '2026-09-29',
        notes: 'Verified event-by-event (18 notes + 6 rests = 24 events, 16.0 beats) against NMA IV/12/6 (BA 4544-01, 1964), p. 43.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Wolfgang Amadeus Mozart, Eine kleine Nachtmusik, K. 525',
        sourceEdition:
          'Neue Mozart-Ausgabe, Serie IV: Orchesterwerke, Werkgruppe 12: Kassationen, Serenaden und Divertimenti für Orchester, Band 6, ed. Karl Heinz Füssl & Ernst Fritz Schmid (Bärenreiter, BA 4544-01, 1964), p. 43 (K. 525: pp. 43–62)',
        sourceUrl: 'https://dme.mozarteum.at/DME/nma/nma_cont.php?gen=edition&l=1&p1=43&vsep=125',
        sourceMovement: 'I. Allegro (4/4, G major)',
        sourcePart: 'Violin I, melodic line, transposed one octave down for the training register',
        sourceMeasures: 'mm. 1–10',
        verifiedAt: '2026-09-29',
        notes: 'Verified event-by-event (57 notes + 8 rests = 65 events, 40.0 beats) against NMA IV/12/6 (BA 4544-01, 1964), p. 43, including m. 5 eighth note + eighth rest + dotted quarter and mm. 6–10 rhythms.'
      }
    },
    description: 'Блестящий венский классический ритм Моцарта: упругие четверти с восьмыми паузами в фанфарах и кульминация на D5.',
    notes: ['G4', 'D4', 'G4', 'D4', 'G4', 'D4', 'G4', 'B4', 'D5', 'C5', 'A4', 'C5', 'A4', 'C5', 'A4', 'F#4', 'A4', 'D4'],
    beats: [1, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 1],
    restsAfter: {
      0: 0.5,
      2: 0.5,
      8: 1,
      9: 0.5,
      11: 0.5,
      17: 1
    },
    defaultBpm: 120,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'hanon-1',
    title: 'Hanon No. 1 · пальцевый этюд',
    source: 'C. L. Hanon · The Virtuoso Pianist (Part I, No. 1)',
    level: 'Разминка',
    category: 'warmup',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Charles-Louis Hanon, The Virtuoso Pianist in 60 Exercises (Le Pianiste virtuose), Part I, Exercise No. 1',
        sourceEdition: 'G. Schirmer, Library of Musical Classics Vol. 925, ed. Theodore Baker (New York, 1900), p. 2 / Mutopia-2015/07/23-2037',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/HanonCL/virtuoso-pianist-pt1/virtuoso-pianist-pt1-lys/hanon01.ily',
        sourceMovement: 'Part I, Exercise No. 1 (2/4, C major)',
        sourcePart: 'Piano right-hand part (RH), second-octave treble-clef entry (mm. 8–11 = mm. 1–4 transposed one octave up to C4)',
        sourceMeasures: 'mm. 8–11 (or mm. 1–4 one octave higher in treble clef)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (32 sixteenth notes, 0 rests, 8.0 quarter-beats in 2/4 meter) against G. Schirmer (1900) / Mutopia-2015/07/23-2037 (hanon01.ily, mm. 8–11).'
      },
      melodyArrangement: {
        status: 'unverified',
        sourceTitle: 'Charles-Louis Hanon, The Virtuoso Pianist in 60 Exercises, Part I, Exercise No. 1 (1-octave treble-staff pedagogical condensation)',
        sourceEdition: 'G. Schirmer, Library of Musical Classics Vol. 925 (New York, 1900) / Mutopia-2015/07/23-2037',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/HanonCL/virtuoso-pianist-pt1/virtuoso-pianist-pt1-lys/hanon01.ily',
        sourceMovement: 'Part I, Exercise No. 1 (2/4, C major)',
        sourcePart: 'Piano right-hand part (1-octave ascending + descending cycle in treble clef)',
        sourceMeasures: 'mm. 8–22 + m. 30 cadence (16 measures)',
        notes:
          'Unverified pedagogical condensation: combines the 7-bar treble-clef ascending octave (mm. 8–14, C4..G5), the 8-bar descending octave (mm. 15–22, G5..B3), and a final C4(2.0) half-note cadence into a 16-measure single-staff treble exercise, omitting the bass-clef first/last octave (mm. 1–7 and mm. 23–29) of Hanon\'s 30-measure score.'
      }
    },
    description: 'Классический паттерн Ганона шестнадцатыми нотами в размере 2/4 на независимость пальцев: звенья C4–E4–F4–G4–A4–G4–F4–E4 и далее вверх по ступеням.',
    notes: [
      'C4', 'E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4',
      'D4', 'F4', 'G4', 'A4', 'B4', 'A4', 'G4', 'F4',
      'E4', 'G4', 'A4', 'B4', 'C5', 'B4', 'A4', 'G4',
      'F4', 'A4', 'B4', 'C5', 'D5', 'C5', 'B4', 'A4'
    ],
    beats: [
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
      0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25
    ],
    defaultBpm: 96,
    measureBeats: 2,
    timeSignature: [2, 4],
    phraseBars: 2
  },
  {
    id: 'czerny-599-1',
    title: 'Czerny Op. 599 No. 1 · этюд',
    source: 'C. Czerny · Practical Method for Beginners, Op. 599',
    level: 'Этюд',
    category: 'study',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Carl Czerny, Practical Method for Beginners on the Pianoforte (Erster Wiener Lehrmeister im Pianofortespiel), Op. 599, No. 1',
        sourceEdition: 'Public-domain engraving, PMLP08821 (Practical Method for Beginners, Op. 599), Exercise No. 1, p. 3',
        sourceUrl: 'https://archive.org/details/imslp-exercises-for-beginners-op599-czerny-carl',
        sourceMovement: 'Exercise No. 1 (4/4, C major)',
        sourcePart: 'Piano right-hand part (Treble staff, C5–G5 five-finger position)',
        sourceMeasures: 'mm. 1–8 (First Part)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (13 notes, 0 rests, 32.0 quarter-beats in 4/4 meter) against Czerny Op. 599 No. 1 (PMLP08821, p. 3, mm. 1–8).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Carl Czerny, Practical Method for Beginners on the Pianoforte (Erster Wiener Lehrmeister im Pianofortespiel), Op. 599, No. 1',
        sourceEdition: 'Public-domain engraving, PMLP08821 (Practical Method for Beginners, Op. 599), Exercise No. 1, p. 3',
        sourceUrl: 'https://archive.org/details/imslp-exercises-for-beginners-op599-czerny-carl',
        sourceMovement: 'Exercise No. 1 (4/4, C major)',
        sourcePart: 'Piano right-hand part (Treble staff, C5–G5 five-finger position)',
        sourceMeasures: 'mm. 1–16 (Complete Exercise No. 1, Parts 1 & 2 without repeats)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (28 notes, 0 rests, 64.0 quarter-beats in 4/4 meter) against Czerny Op. 599 No. 1 (PMLP08821, p. 3, mm. 1–16).'
      }
    },
    description: 'Подлинный первый этюд Карла Черни (Op. 599 № 1) целыми и половинными нотами в позиции C5–G5.',
    notes: ['C5', 'D5', 'E5', 'C5', 'D5', 'E5', 'C5', 'E5', 'G5', 'F5', 'E5', 'D5', 'C5'],
    beats: [4, 2, 2, 4, 2, 2, 2, 2, 2, 2, 2, 2, 4],
    defaultBpm: 100,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'beyer-101-8',
    title: 'Beyer Op. 101 No. 8 · мотив',
    source: 'F. Beyer · Vorschule im Klavierspiel, Op. 101',
    level: 'Этюд',
    category: 'study',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Ferdinand Beyer, Vorschule im Klavierspiel (Elementary Instruction Book for the Pianoforte), Op. 101, No. 8',
        sourceEdition: 'Edition Peters, Plate 8033 (Leipzig), Four-Hand Exercises, Prima, No. 8, p. 21',
        sourceUrl: 'https://archive.org/details/imslp-im-klavierspiel-op101-beyer-ferdinand',
        sourceMovement: 'No. 8 (4/4, C major)',
        sourcePart: 'Prima right-hand part (Rechte Hand, C5–G5 five-finger position)',
        sourceMeasures: 'mm. 1–8 (First Part)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (31 notes, 0 rests, 32.0 quarter-beats in 4/4 meter: m1 C5-E5-C5-E5 | m2 G5-C5-C5-C5 | m3 D5x4 | m4 E5x4 | m5 C5-E5-C5-E5 | m6 G5-C5-C5-C5 | m7 D5-D5-E5-D5 | m8 C5-E5-C5(2)) against Edition Peters Plate 8033, p. 21, Exercise No. 8 Prima right-hand part (mm. 1–8).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Ferdinand Beyer, Vorschule im Klavierspiel (Elementary Instruction Book for the Pianoforte), Op. 101, No. 8',
        sourceEdition: 'Edition Peters, Plate 8033 (Leipzig), Four-Hand Exercises, Prima, No. 8, p. 21',
        sourceUrl: 'https://archive.org/details/imslp-im-klavierspiel-op101-beyer-ferdinand',
        sourceMovement: 'No. 8 (4/4, C major)',
        sourcePart: 'Prima right-hand part (Rechte Hand, C5–G5 five-finger position)',
        sourceMeasures: 'mm. 1–16 (Complete Exercise No. 8 without repeat)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (62 notes, 0 rests, 64.0 quarter-beats in 4/4 meter: mm. 1–8 plus m9 G5-D5-D5-D5 | m10 E5-C5-C5-C5 | m11 G5-D5-D5-D5 | m12 E5-C5-E5-D5 | m13 C5-E5-C5-E5 | m14 G5-C5-C5-C5 | m15 D5-D5-E5-D5 | m16 C5-E5-C5(2)) against Edition Peters Plate 8033, p. 21, Exercise No. 8 Prima right-hand part (mm. 1–16).'
      }
    },
    description: 'Подлинный этюд Фердинанда Байера (Op. 101 № 8, партия Prima): чередование терций, скачков с G5 и репетиций четвертями в позиции C5–G5.',
    notes: [
      'C5', 'E5', 'C5', 'E5',
      'G5', 'C5', 'C5', 'C5',
      'D5', 'D5', 'D5', 'D5',
      'E5', 'E5', 'E5', 'E5',
      'C5', 'E5', 'C5', 'E5',
      'G5', 'C5', 'C5', 'C5',
      'D5', 'D5', 'E5', 'D5',
      'C5', 'E5', 'C5'
    ],
    beats: [
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 2
    ],
    defaultBpm: 96,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'satie-gymnopedie-1',
    title: 'Gymnopédie No. 1 · Тема',
    source: 'Erik Satie · Trois Gymnopédies (1888)',
    level: 'Классика · 3/4',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 2,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Erik Satie, Trois Gymnopédies, No. 1: Lent et douloureux',
        sourceEdition: 'First Edition (E. Baudoux & Cie., Paris, 1888) / Dover Publications reproduction / Mutopia-2014/12/14-37 (gymnopedie_1.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly',
        sourceMovement: 'No. 1. Lent et douloureux (3/4, D major / B minor modal)',
        sourcePart: 'Pure upper melodic voice (top), entering in m. 5 after the 4-bar accompaniment introduction',
        sourceMeasures: 'mm. 5–16',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (19 notes + 2 quarter-rests = 21 events, 36.0 quarter-beats in 3/4 meter) against 1888 First Edition / Mutopia-2014/12/14-37 (mm. 5–16): preserves the pure upper melody without mixing bass accompaniment notes (D4/G4), starting with an explicit beat-1 quarter rest in m. 5, sustaining the 4-bar tied F#4 (12.0 beats) across mm. 9–12, and entering after a beat-1 quarter rest in m. 13.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Erik Satie, Trois Gymnopédies, No. 1: Lent et douloureux',
        sourceEdition: 'First Edition (E. Baudoux & Cie., Paris, 1888) / Dover Publications reproduction / Mutopia-2014/12/14-37 (gymnopedie_1.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly',
        sourceMovement: 'No. 1. Lent et douloureux (3/4, D major / B minor modal)',
        sourcePart: 'Pure upper melodic voice (top), complete first section through the 1st ending (mm. 5–39)',
        sourceMeasures: 'mm. 5–39 (1st ending)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (59 notes + 2 quarter-rests = 61 events, 105.0 quarter-beats in 3/4 meter) against 1888 First Edition / Mutopia-2014/12/14-37 (mm. 5–39): includes the 12-beat tied F#4 (mm. 9–12), 9-beat tied E4 (mm. 19–21), 5-beat tied D5 + 1-beat D5 figures (mm. 25–26, 30–31), and the upper melody notes C5(3) and D5(3) of the cadential chords in mm. 38–39.'
      }
    },
    description: 'Чистая верхняя мелодическая линия Эрика Сати (такты 5–16) в размере 3/4: вступление со второй доли после четвертной паузы и четырёхтактовая залигованная нота F#4.',
    notes: [
      'F#5', 'A5',
      'G5', 'F#5', 'C#5',
      'B4', 'C#5', 'D5',
      'A4',
      'F#4',
      'F#5', 'A5',
      'G5', 'F#5', 'C#5',
      'B4', 'C#5', 'D5',
      'A4'
    ],
    beats: [
      1, 1,
      1, 1, 1,
      1, 1, 1,
      3,
      12,
      1, 1,
      1, 1, 1,
      1, 1, 1,
      3
    ],
    restsAfter: {
      [-1]: 1,
      9: 1
    },
    defaultBpm: 66,
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'pachelbel-canon-d',
    title: 'Canon in D · Главная тема',
    source: 'Johann Pachelbel · Canon per 3 Violini e Basso (P. 37)',
    level: 'Классика · 4/4',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 2,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Johann Pachelbel, Canon and Gigue in D major for 3 Violins and Basso Continuo, P. 37 (T. 337)',
        sourceEdition: 'Staatsbibliothek zu Berlin, Mus.ms. 16481/8 / Mutopia-2015/09/02-2047 (violin_common.ily)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/PachelbelJ/Canon_per_3_Violini_e_Basso/Canon_per_3_Violini_e_Basso-lys/violin_common.ily',
        sourceMovement: 'Canon (4/4, D major)',
        sourcePart: 'Violin I part, entering in m. 3 after the 2-bar ground-bass introduction',
        sourceMeasures: 'mm. 3–6 (first two ground-bass cycles of Violin I)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (16 quarter notes, 0 rests, 16.0 quarter-beats in 4/4 meter) against Pachelbel\'s Violin I part in Mus.ms. 16481/8 / Mutopia-2015/09/02-2047 (violin_common.ily, mm. 3–6).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Johann Pachelbel, Canon and Gigue in D major for 3 Violins and Basso Continuo, P. 37 (T. 337)',
        sourceEdition: 'Staatsbibliothek zu Berlin, Mus.ms. 16481/8 / Mutopia-2015/09/02-2047 (violin_common.ily)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/PachelbelJ/Canon_per_3_Violini_e_Basso/Canon_per_3_Violini_e_Basso-lys/violin_common.ily',
        sourceMovement: 'Canon (4/4, D major)',
        sourcePart: 'Violin I part, entering in m. 3 after the 2-bar ground-bass introduction',
        sourceMeasures: 'mm. 3–10 (quarter-note variations mm. 3–6 and eighth-note variations mm. 7–10)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (48 notes, 0 rests, 32.0 quarter-beats in 4/4 meter) against Pachelbel\'s Violin I part in Mus.ms. 16481/8 / Mutopia-2015/09/02-2047 (violin_common.ily, mm. 3–10), including the dotted-eighth + sixteenth figure D5(0.75)–C#5(0.25) at the end of m. 10.'
      }
    },
    description: 'Подлинная партия первой скрипки из Канона ре мажор Иоганна Пахельбеля (такты 3–6): плавное секвенционное движение четвертными нотами по ступеням канона.',
    notes: [
      'F#5', 'E5', 'D5', 'C#5',
      'B4', 'A4', 'B4', 'C#5',
      'D5', 'C#5', 'B4', 'A4',
      'G4', 'F#4', 'G4', 'E4'
    ],
    beats: [
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1
    ],
    defaultBpm: 72,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'tchaikovsky-swan-lake',
    title: 'Лебединое озеро · Тема',
    source: 'П. И. Чайковский · Op. 20, Акт II № 10 (P. Jurgenson 1895, Plate 4432; repr. Broude Bros. 1951, Plate B.B. 59)',
    level: 'Классика · Выразительно',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Pyotr Ilyich Tchaikovsky, Swan Lake (Лебединое озеро), Op. 20, Act II, No. 10: Scène (Moderato)',
        sourceEdition: 'P. Jurgenson, Moscow, 1895, Full Orchestral Score, Plate 4432; reprinted New York: Broude Brothers, 1951, Plate B.B. 59, pp. 223–224',
        sourceUrl: 'https://archive.org/details/imslp-lake-ballet-op20-tchaikovsky-pyotr',
        sourceMovement: 'Act II, No. 10: Scène (Moderato, 4/4, original B minor transposed -2 semitones to A minor)',
        sourcePart: 'Oboe I solo (Staff 3: Oboi, p espress.), transposed -2 semitones from B minor to A minor',
        sourceMeasures: 'mm. 2–5 (opening 4-measure phrase of the Oboe I solo following the 1-measure harp/string introduction)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (19 notes, 0 rests, 16.0 quarter-beats in 4/4 meter) against P. Jurgenson, Moscow, 1895, Plate 4432 (reprinted New York: Broude Brothers, 1951, Plate B.B. 59), pp. 223–224, including the tied half+eighth A4(2.5) and three-eighth lead-back D5–C5–B4 in m. 5.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Pyotr Ilyich Tchaikovsky, Swan Lake (Лебединое озеро), Op. 20, Act II, No. 10: Scène (Moderato)',
        sourceEdition: 'P. Jurgenson, Moscow, 1895, Full Orchestral Score, Plate 4432; reprinted New York: Broude Brothers, 1951, Plate B.B. 59, pp. 223–226',
        sourceUrl: 'https://archive.org/details/imslp-lake-ballet-op20-tchaikovsky-pyotr',
        sourceMovement: 'Act II, No. 10: Scène (Moderato, 4/4, original B minor transposed -2 semitones to A minor)',
        sourcePart: 'Oboe I solo (Staff 3: Oboi), complete solo statement through the tonic resolution at Rehearsal Mark [1], transposed -2 semitones from B minor to A minor',
        sourceMeasures: 'mm. 2–19 (18 measures: A-period mm. 2–9, B-period mm. 10–18, and tonic resolution on beat 1 of m. 19 at Rehearsal Mark [1])',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (82 notes + 1 rest = 83 events, 72.0 quarter-beats across 18 measures in 4/4 meter) against P. Jurgenson, Moscow, 1895, Plate 4432 (reprinted New York: Broude Brothers, 1951, Plate B.B. 59), pp. 223–226, correcting the m. 9 beat-4 pickup to A4(1), the sequential B-section pitches in mm. 10–18 (including the Neapolitan Bb-major inflection A#5–D#5–D5–F5–A#5 in m. 17), and the m. 19 downbeat resolution A5(1) + REST(3).'
      }
    },
    description: 'Главная тема гобоя из балета «Лебединое озеро» (Акт II, № 10, такты 2–5 в ля миноре): певучая половинная нота, восходящий ход восьмыми и пунктирный ритм.',
    notes: [
      'E5', 'A4', 'B4', 'C5', 'D5',
      'E5', 'C5', 'E5', 'C5',
      'E5', 'A4', 'C5', 'A4', 'F4', 'C5',
      'A4', 'D5', 'C5', 'B4'
    ],
    beats: [
      2, 0.5, 0.5, 0.5, 0.5,
      1.5, 0.5, 1.5, 0.5,
      1.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      2.5, 0.5, 0.5, 0.5
    ],
    defaultBpm: 84,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'grieg-morning-mood',
    title: 'Утро (Morning Mood · Пер Гюнт)',
    source: 'Edvard Grieg · Op. 23 / Op. 46 No. 1 (PDMX CC0)',
    level: 'Классика · 6/8',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 4,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Edvard Grieg, Peer Gynt Suite No. 1, Op. 46, No. 1: Morgenstemning (Morning Mood)',
        sourceEdition: 'G. Schirmer Library of Musical Classics Vol. 205 (ed. Louis Oesterle, Plate 14300, 1899), p. 3 / Edition Peters Nr. 2433 (Full Score, 1888), p. 3',
        sourceUrl: 'https://archive.org/details/31761045200615/page/n6/mode/2up',
        sourceMovement: 'I. Morgenstimmung (Allegretto pastorale, 6/8, E major)',
        sourcePart: 'Flute 1 / Piano right-hand upper voice (without unmeasured grace notes, transposed 1 octave down to B4–C#5)',
        sourceMeasures: 'mm. 1–4',
        verifiedAt: '2026-09-29',
        notes: 'Verified event-by-event (24 notes + 1 rest = 25 events, 12.0 quarter-beats) against G. Schirmer Plate 14300 p. 3 and Edition Peters Nr. 2433 p. 3, including m. 2 sixteenth-note figure and m. 4 quarter note + eighth rest.'
      },
      melodyArrangement: {
        status: 'unverified',
        sourceTitle: 'Edvard Grieg, Peer Gynt Suite No. 1, Op. 46, No. 1: Morgenstemning (simplified pedagogical arrangement)',
        sourceEdition: 'Pedagogical E-major / B-major condensation (mm. 1–4 verified against G. Schirmer Plate 14300 p. 3; mm. 5–16 simplified without G# major B#4/F##4 modulation)',
        sourceUrl: 'https://archive.org/details/31761045200615/page/n6/mode/2up',
        sourceMovement: 'I. Morgenstimmung (Allegretto pastorale, 6/8)',
        sourcePart: 'Simplified single-line piano arrangement',
        sourceMeasures: 'mm. 1–16 (pedagogical condensation of Grieg mm. 1–21)',
        notes:
          'Intentionally retained as unverified (Milestone 3B.5B-2 Option B): in Grieg\'s authoritative score (G. Schirmer Plate 14300, p. 3), mm. 8–16 modulate to G# major and B major using B# and F## across a 21-measure opening section, which cannot be represented without enharmonic respelling in the 12-pitch NoteWithOctave system under keySignatureFifths = 4; this 16-bar pedagogical arrangement substitutes a diatonic B-major phrase in mm. 9–12 and tonic return in mm. 13–16.'
      }
    },
    description: 'Светлая пасторальная тема рассвета в размере 6/8: переливающиеся группы восьмых и шестнадцатых по пентатонике ми мажора.',
    notes: [
      'B4', 'G#4', 'F#4', 'E4', 'F#4', 'G#4',
      'B4', 'G#4', 'F#4', 'E4', 'F#4', 'G#4', 'F#4', 'G#4',
      'B4', 'G#4', 'B4', 'C#5', 'G#4', 'C#5',
      'B4', 'G#4', 'F#4', 'E4'
    ],
    beats: [
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 1
    ],
    restsAfter: {
      23: 0.5
    },
    measureBeats: 3,
    timeSignature: [6, 8],
    phraseBars: 2
  },
  {
    id: 'vivaldi-spring',
    title: 'Весна (Времена года · Тема)',
    source: 'Antonio Vivaldi · Op. 8 No. 1, RV 269 (Le Cène 1725 / Mutopia)',
    level: 'Классика · Барокко',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Antonio Vivaldi, Il cimento dell\'armonia e dell\'inventione, Op. 8, Concerto No. 1 in E major ("La Primavera"), RV 269',
        sourceEdition: 'Michel-Charles Le Cène, Amsterdam (1725) / Performers\' Facsimiles / Mutopia-2010/02/08-301 (spring1.ly & spring1a.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/VivaldiA/O8/spring/spring-lys/spring1a.ly',
        sourceMovement: 'I. Allegro (4/4, original E major transposed -4 semitones to C major)',
        sourcePart: 'Violino Principale / Violino Primo unison opening ritornello (Section A), transposed -4 semitones from E major to C major',
        sourceMeasures: 'pickup + mm. 1–3a (first Forte phrase of the opening ritornello before the Piano echo pickup)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (25 notes, 0 rests, 12.0 quarter-beats: 0.5-beat eighth pickup + mm. 1–2 + 3.5-beat m. 3a) against Le Cène (1725) / Mutopia-2010/02/08-301 (spring1a.ly), restoring Vivaldi\'s original eighth/sixteenth/dotted-quarter notation and the descending triad D5–B4–G4 in m. 3.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Antonio Vivaldi, Il cimento dell\'armonia e dell\'inventione, Op. 8, Concerto No. 1 in E major ("La Primavera"), RV 269',
        sourceEdition: 'Michel-Charles Le Cène, Amsterdam (1725) / Performers\' Facsimiles / Mutopia-2010/02/08-301 (spring1.ly & spring1a.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/VivaldiA/O8/spring/spring-lys/spring1a.ly',
        sourceMovement: 'I. Allegro (4/4, original E major transposed -4 semitones to C major)',
        sourcePart: 'Violino Principale / Violino Primo unison opening ritornello (Section A), transposed -4 semitones from E major to C major',
        sourceMeasures: 'pickup + mm. 1–13 (complete Opening Ritornello A through the cadence at Rehearsal Mark B)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (98 notes + 3 rests = 101 events, 52.5 quarter-beats: 0.5-beat pickup + 13 full 4/4 measures) against Le Cène (1725) / Mutopia-2010/02/08-301 (spring1a.ly), including the eighth-note rests in mm. 6 and 10, the Piano repeat of the second phrase in mm. 10b–13, and the final quarter rest in m. 13.'
      }
    },
    description: 'Жизнерадостная тема ритурнеля концерта «Весна» Вивальди (RV 269, I. Allegro, в до мажоре): восьмой затакт C5, упругие восьмые с шестнадцатыми и четверти с точкой на G5.',
    notes: [
      'C5',
      'E5', 'E5', 'E5', 'D5', 'C5', 'G5', 'G5', 'F5',
      'E5', 'E5', 'E5', 'D5', 'C5', 'G5', 'G5', 'F5',
      'E5', 'F5', 'G5', 'F5', 'E5', 'D5', 'B4', 'G4'
    ],
    beats: [
      0.5,
      0.5, 0.5, 0.5, 0.25, 0.25, 1.5, 0.25, 0.25,
      0.5, 0.5, 0.5, 0.25, 0.25, 1.5, 0.25, 0.25,
      0.5, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5
    ],
    defaultBpm: 100,
    pickupBeats: 0.5,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'dvorak-new-world-largo',
    title: 'Из Нового Света · Largo',
    source: 'Antonín Dvořák · Симфония № 9, Op. 95 (N. Simrock 1894, Plate 10140 / Mutopia)',
    level: 'Классика · Пунктир',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Antonín Dvořák, Symphony No. 9 in E minor ("From the New World"), Op. 95 (B. 178)',
        sourceEdition: 'N. Simrock GmbH, Berlin, 1894, First Edition Orchestral Parts, Plate 10140 (IMSLP #41074–41083), checked against Simrock Miniature Score Plate 11892 (1908) / Mutopia-2011/10/03-1793 (woods.notesL.ily)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/DvorakA/O95/Sym9/Sym9-lys/woods.notesL.ily',
        sourceMovement: 'II. Largo (4/4, original concert D-flat major transposed -1 semitone to C major)',
        sourcePart: 'Oboe 1, 2 / English Horn orchestral part (Corno inglese solo, oboeIImL in woods.notesL.ily), transposed from written A-flat major / sounding D-flat major to C major',
        sourceMeasures: 'mm. 7–10 (complete 4-measure opening period of the English Horn solo following the 6-measure chordal introduction)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (22 notes, 0 rests, 16.0 quarter-beats across 4 measures in 4/4 meter) against N. Simrock First Edition Orchestral Parts, Plate 10140 (Oboe 1, 2 / English Horn part) / Mutopia-2011/10/03-1793 (woods.notesL.ily, mm. 7–10), restoring Dvořák\'s original dotted-eighth + sixteenth rhythm (0.75 + 0.25) and two-eighth figure D4(0.5)–E4(0.5) at the start of m. 10.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Antonín Dvořák, Symphony No. 9 in E minor ("From the New World"), Op. 95 (B. 178)',
        sourceEdition: 'N. Simrock GmbH, Berlin, 1894, First Edition Orchestral Parts, Plate 10140 (IMSLP #41074–41083), checked against Simrock Miniature Score Plate 11892 (1908) / Mutopia-2011/10/03-1793 (woods.notesL.ily)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/DvorakA/O95/Sym9/Sym9-lys/woods.notesL.ily',
        sourceMovement: 'II. Largo (4/4, original concert D-flat major transposed -1 semitone to C major)',
        sourcePart: 'Oboe 1, 2 / English Horn orchestral part (Corno inglese solo, oboeIImL in woods.notesL.ily), transposed from written A-flat major / sounding D-flat major to C major',
        sourceMeasures: 'mm. 7–18 (complete 12-measure opening English Horn solo)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (66 notes, 0 rests, 48.0 quarter-beats across 12 measures in 4/4 meter) against N. Simrock First Edition Orchestral Parts, Plate 10140 (Oboe 1, 2 / English Horn part) / Mutopia-2011/10/03-1793 (woods.notesL.ily, mm. 7–18), including the eighth-note pair E4(0.5)–D4(0.5) in m. 15, the ascending figure C4(0.75)–D4(0.25)–E4(1) in m. 17, and the cadence D4(0.75)–C4(0.25)–D4(0.5)–A3(0.5)–C4(2) in m. 18.'
      }
    },
    description: 'Проникновенное соло английского рожка из Largo Симфонии № 9 Дворжака (такты 7–10 в до мажоре): подлинный пунктирный ритм (восьмая с точкой + шестнадцатая) и широкая кантилена.',
    notes: [
      'E4', 'G4', 'G4', 'E4', 'D4', 'C4',
      'D4', 'E4', 'G4', 'E4', 'D4',
      'E4', 'G4', 'G4', 'E4', 'D4', 'C4',
      'D4', 'E4', 'D4', 'C4', 'C4'
    ],
    beats: [
      0.75, 0.25, 1, 0.75, 0.25, 1,
      0.75, 0.25, 0.75, 0.25, 2,
      0.75, 0.25, 1, 0.75, 0.25, 1,
      0.5, 0.5, 0.75, 0.25, 2
    ],
    defaultBpm: 56,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'brahms-wiegenlied',
    title: 'Колыбельная (Wiegenlied Op. 49)',
    source: 'Johannes Brahms · Op. 49 No. 4 (N. Simrock 1868 / Mutopia)',
    level: 'Классика · 3/4',
    category: 'classical',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Johannes Brahms, Fünf Lieder für eine Singstimme mit Begleitung des Pianoforte, Op. 49, No. 4: Wiegenlied ("Guten Abend, gut\' Nacht")',
        sourceEdition: 'N. Simrock, Berlin (1868) / Indiana University Variations bgn9130 / Mutopia-2007/11/04-1037 (Wiegenlied.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BrahmsJ/O49/Wiegenlied/Wiegenlied-lys/Wiegenlied.ly',
        sourceMovement: 'No. 4: Wiegenlied (Zart bewegt, 3/4, original E-flat major transposed -3 semitones to C major)',
        sourcePart: 'Vocal melody (Singstimme), transposed -3 semitones from E-flat major to C major',
        sourceMeasures: 'm. 2 beat 3 pickup + mm. 3–10a (opening 8-measure vocal period)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (27 notes + 3 quarter rests = 30 events, 24.0 quarter-beats in 3/4 meter) against N. Simrock / Mutopia-2007/11/04-1037 (Wiegenlied.ly, m. 2b–10a), restoring the explicit beat-2 quarter rests in mm. 4, 8, and 10.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Johannes Brahms, Fünf Lieder für eine Singstimme mit Begleitung des Pianoforte, Op. 49, No. 4: Wiegenlied ("Guten Abend, gut\' Nacht")',
        sourceEdition: 'N. Simrock, Berlin (1868) / Indiana University Variations bgn9130 / Mutopia-2007/11/04-1037 (Wiegenlied.ly)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/BrahmsJ/O49/Wiegenlied/Wiegenlied-lys/Wiegenlied.ly',
        sourceMovement: 'No. 4: Wiegenlied (Zart bewegt, 3/4, original E-flat major transposed -3 semitones to C major)',
        sourcePart: 'Vocal melody (Singstimme, without unmeasured grace notes in mm. 14 and 17), transposed -3 semitones from E-flat major to C major',
        sourceMeasures: 'm. 2 beat 3 pickup + mm. 3–18 (complete 16-measure vocal strophe)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (51 notes + 3 quarter rests = 54 events, 48.0 quarter-beats in 3/4 meter) against N. Simrock / Mutopia-2007/11/04-1037 (Wiegenlied.ly, m. 2b–18), restoring the explicit beat-2 quarter rests in mm. 4, 8, and 10 and main-note durations in mm. 11–18.'
      }
    },
    description: 'Знаменитая колыбельная Брамса Op. 49 № 4 в трёхдольном размере (в до мажоре) с восьмыми затактами и дыханием на четвертных паузах вторых долей.',
    notes: [
      'E4', 'E4',
      'G4', 'E4', 'E4',
      'G4', 'E4', 'G4',
      'C5', 'B4', 'A4',
      'A4', 'G4', 'D4', 'E4',
      'F4', 'D4', 'D4', 'E4',
      'F4', 'D4', 'F4',
      'B4', 'A4', 'G4', 'B4',
      'C5'
    ],
    beats: [
      0.5, 0.5,
      1.5, 0.5, 1,
      1, 0.5, 0.5,
      1, 1.5, 0.5,
      1, 1, 0.5, 0.5,
      1, 1, 0.5, 0.5,
      1, 0.5, 0.5,
      0.5, 0.5, 1, 1,
      1
    ],
    restsAfter: {
      5: 1,
      19: 1,
      26: 1
    },
    defaultBpm: 76,
    pickupBeats: 1,
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'korobeiniki-tetris',
    title: 'Коробейники (Tetris Theme)',
    source: 'Русская народная песня XIX в. «Коробейники» (стихи Н. А. Некрасова, 1861)',
    level: 'Мелодия · Драйв',
    category: 'melody',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle:
          'Korobeiniki («Коробейники» / «Ой, полна, полна коробушка», 19th-century Russian folk song on Nikolai Nekrasov\'s 1861 poem)',
        sourceEdition:
          'Public-domain Russian folk dance-song score (Wikimedia Commons File:Korobeiniki.svg / File:Korobeiniki_Music.png, transposed to A minor in 4/4 meter)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Korobeiniki.svg',
        sourceMovement: 'Fast folk-dance variant, Part A (4/4 equivalent of 8 bars of 2/4, A minor)',
        sourcePart: 'Upper melody line (Part A, transposed -3 semitones from C minor 2/4 in File:Korobeiniki.svg to A minor 4/4)',
        sourceMeasures: 'mm. 1–4 in 4/4 (corresponding to mm. 1–8 in 2/4 of File:Korobeiniki.svg)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (19 notes, 0 rests, 16.0 quarter-beats across 4 measures in 4/4 meter) against the public-domain instrumental folk-dance melody of "Korobeiniki" (File:Korobeiniki.svg, transposed from C minor 2/4 to A minor 4/4, with the final A4 sustained as a 2-beat half note at the end of m. 4 as in File:Korobeiniki_Music.png). Verified against the public-domain folk score, not the copyrighted 1989 Game Boy arrangement.'
      },
      melodyArrangement: {
        status: 'unverified',
        sourceTitle:
          'Korobeiniki («Коробейники», Russian folk song mm. 1–8) + modern Tetris Type-A half-note bridge adaptation (mm. 9–16)',
        sourceEdition:
          'Hybrid adaptation: mm. 1–8 follow the public-domain Russian folk melody (File:Korobeiniki.svg); mm. 9–16 are a modern chiptune/keyboard bridge adaptation',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Korobeiniki.svg',
        sourceMovement: 'Fast folk-dance melody + half-note bridge (4/4, A minor)',
        sourcePart: 'Single-line keyboard melody arrangement',
        sourceMeasures: 'mm. 1–8 (folk melody Parts A & B) + mm. 9–16 (modern half-note bridge adaptation)',
        notes:
          'Intentionally retained as unverified (deliberate adaptation): while mm. 1–8 (36 notes) match Parts A and B of the public-domain Russian folk dance-song "Korobeiniki" (File:Korobeiniki.svg, transposed to A minor), mm. 9–16 (16 notes: E4–C4 | D4–B3 | C4–A3 | G#3–B3 | E4–C4 | D4–B3 | C4–E4–A4 | G#4) append the modern 1989 Game Boy Tetris Type-A bridge composed by Hirokazu Tanaka, which is absent from 19th-century Russian folk sources and cannot be marked verified against a copyrighted modern arrangement.'
      }
    },
    description: 'Народная танцевальная мелодия «Коробейники» (часть A в ля миноре): чередование четвертных и парных восьмых нот с пунктирным ритмом в третьем такте.',
    notes: ['E5', 'B4', 'C5', 'D5', 'C5', 'B4', 'A4', 'A4', 'C5', 'E5', 'D5', 'C5', 'B4', 'C5', 'D5', 'E5', 'C5', 'A4', 'A4'],
    beats: [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1.5, 0.5, 1, 1, 1, 1, 2],
    defaultBpm: 132,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'leontovych-shchedryk',
    title: 'Щедрик (Carol of the Bells)',
    source: 'М. Д. Леонтович · «Щедрик» (1916, украинская щедровка в обработке для хора)',
    level: 'Мелодия · 3/4 остинато',
    category: 'melody',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Mykola Leontovych, Shchedryk («Щедрик», Ukrainian New Year carol for mixed chorus SATB, 1916)',
        sourceEdition:
          'First Ukrainian choral edition (Kyiv, 1918/1921; IMSLP #304704 / #818766 / Wikimedia Commons Щедрик.pdf), pp. 1–2',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/25/%D0%A9%D0%B5%D0%B4%D1%80%D0%B8%D0%BA.pdf',
        sourceMovement: 'Shchedryk (3/4, original G minor transposed +2 semitones to A minor)',
        sourcePart:
          'Soprano ostinato line («Щед-рик, щед-рик, щед-рі-воч-ка, при-ле-ті-ла лас-ті-воч-ка»), transposed +2 semitones from G minor to A minor',
        sourceMeasures: 'mm. 1–4',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (16 notes, 0 rests, 12.0 quarter-beats across 4 measures in 3/4 meter) against Mykola Leontovych\'s 1916 SATB choral score (Щедрик.pdf, mm. 1–4, transposed +2 semitones from G minor to A minor), removing the unauthentic m. 3–4 third-shift (E5–D5–E5–C5) interpolated from Peter Wilhousky\'s 1936 Carol of the Bells arrangement.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Mykola Leontovych, Shchedryk («Щедрик», Ukrainian New Year carol for mixed chorus SATB, 1916)',
        sourceEdition:
          'First Ukrainian choral edition (Kyiv, 1918/1921; IMSLP #304704 / #818766 / Wikimedia Commons Щедрик.pdf), pp. 1–2',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/25/%D0%A9%D0%B5%D0%B4%D1%80%D0%B8%D0%BA.pdf',
        sourceMovement: 'Shchedryk (3/4, original G minor transposed +2 semitones to A minor)',
        sourcePart:
          'Principal moving choral voice across the climax and return (Soprano in mm. 17–24; Alto moving scale under tied Soprano E5 pedal in mm. 25–28; Soprano in mm. 29–32), transposed +2 semitones from G minor to A minor',
        sourceMeasures: 'mm. 17–32 (16 contiguous measures of Leontovych\'s choral score)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (71 notes, 0 rests, 48.0 quarter-beats across 16 contiguous measures in 3/4 meter) against Mykola Leontovych\'s 1916 SATB score (Щедрик.pdf, mm. 17–32, transposed +2 semitones from G minor to A minor): mm. 17–20 state the 4-bar Soprano ostinato C5–B4–C5–A4; mm. 21–24 present the authentic Soprano forte climax (E5–E5–E5–D5–C5 | C5–C5–C5–B4–A4 | D5–D5–D5–C5–B4 | C5–B4–C5–A4, correcting the previous Wilhousky-derived A5–G5–F5 interpolation); mm. 25–28 follow the Alto ascending melodic-minor scale E4–F#4–G#4–A4–B4–C5 | D5–E5–D5–C5 while Soprano holds a tied E5 pedal; and mm. 29–32 return to the 4-bar Soprano ostinato.'
      }
    },
    description:
      'Подлинный четырёхнотный остинатный мотив сопрано из хоровой партитуры М. Д. Леонтовича «Щедрик» (1916, такты 1–4 в ля миноре): четверть — две восьмые — четверть (C5–B4–C5–A4).',
    notes: ['C5', 'B4', 'C5', 'A4', 'C5', 'B4', 'C5', 'A4', 'C5', 'B4', 'C5', 'A4', 'C5', 'B4', 'C5', 'A4'],
    beats: [1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1],
    defaultBpm: 138,
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves (Зелёные рукава)',
    source: 'Традиционная английская баллада XVI в. (W. Chappell 1855 / Mutopia)',
    level: 'Мелодия · 3/4',
    category: 'melody',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Greensleeves (Traditional 16th-century English ballad, registered 1580)',
        sourceEdition:
          'William Chappell, Popular Music of the Olden Time, Vol. 1 (London, 1855–1859), pp. 227–233 / Mutopia-2008/01/20-1265 (GreensleevesAcc.ly, A minor, 3/4)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/Traditional/GreensleevesAcc/GreensleevesAcc.ly',
        sourceMovement: 'Moderato (3/4, A minor, 1-beat quarter pickup)',
        sourcePart: 'Melody line (first 8-measure period of Part A through the half cadence on E4)',
        sourceMeasures: 'pickup + mm. 1–8a (first 2 beats of m. 8 before the pickup to m. 9)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (19 notes, 0 rests, 24.0 quarter-beats: 1-beat pickup A4 + mm. 1–7 + 2-beat E4 in m. 8a) against Mutopia-2008/01/20-1265 (GreensleevesAcc.ly) and Mutopia-2013/03/23-109 (Greensleaves.ly), reflecting the traditional modal/harmonic pitch sequence (natural F5 in m. 2, raised G#4 in mm. 6–7).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Greensleeves (Traditional 16th-century English ballad, registered 1580)',
        sourceEdition:
          'William Chappell, Popular Music of the Olden Time, Vol. 1 (London, 1855–1859), pp. 227–233 / Mutopia-2008/01/20-1265 (GreensleevesAcc.ly, A minor, 3/4)',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/Traditional/GreensleevesAcc/GreensleevesAcc.ly',
        sourceMovement: 'Moderato (3/4, A minor, 1-beat quarter pickup)',
        sourcePart: 'Complete 32-measure verse (mm. 1–16) and refrain ("Greensleeves was all my joy", mm. 17–32)',
        sourceMeasures: 'pickup + mm. 1–32',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (72 notes, 0 rests, 97.0 quarter-beats: 1-beat pickup A4 + 32 full 3/4 measures) against Mutopia-2008/01/20-1265 (GreensleevesAcc.ly), restoring the two-measure tonic cadences A4(3) | A4(3) in mm. 15–16 and mm. 31–32 so the refrain ("Greensleeves was all my joy", G5(3)) enters on m. 17 rather than m. 16.'
      }
    },
    description: 'Старинная ренессансная мелодия в размере 3/4: затакт A4, сочетание половинных, четвертей с точкой и восьмых.',
    notes: [
      'A4',
      'C5', 'D5',
      'E5', 'F5', 'E5',
      'D5', 'B4',
      'G4', 'A4', 'B4',
      'C5', 'A4',
      'A4', 'G#4', 'A4',
      'B4', 'G#4',
      'E4'
    ],
    beats: [
      1,
      2, 1,
      1.5, 0.5, 1,
      2, 1,
      1.5, 0.5, 1,
      2, 1,
      1.5, 0.5, 1,
      2, 1,
      2
    ],
    defaultBpm: 88,
    pickupBeats: 1,
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'bella-ciao',
    title: 'Bella Ciao · Тема',
    source: 'Итальянская народная песня «Bella Ciao» (партитура в ля миноре)',
    level: 'Мелодия · Ритмично',
    category: 'melody',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Bella Ciao (Traditional Italian folk / resistance song, "Una mattina mi son svegliato")',
        sourceEdition:
          'Public-domain LilyPond score on Wikimedia Commons (File:BellaCiao Accordion.png, StropheEins, transposed +7 semitones from D minor to A minor)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:BellaCiao_Accordion.png',
        sourceMovement: 'Allegretto (4/4, original D minor transposed +7 semitones to A minor, 1.5-beat three-eighth pickup)',
        sourcePart: 'Right-hand vocal melody line (RH)',
        sourceMeasures: 'pickup (1.5 beats: E4–A4–B4) + mm. 1–4a (first 2.5 beats of m. 4)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (22 notes, 0 rests, 16.0 quarter-beats: 1.5-beat three-eighth pickup E4–A4–B4 + mm. 1–3 + 2.5-beat "ciao, ciao, ciao" in m. 4a) against File:BellaCiao Accordion.png (transposed +7 semitones from D minor to A minor), correcting pickupBeats from 2 to 1.5 so that every stressed downbeat (C5 in mm. 1–3 and E5 in m. 4) aligns with the barline.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Bella Ciao (Traditional Italian folk / resistance song, "Una mattina mi son svegliato")',
        sourceEdition:
          'Public-domain LilyPond score on Wikimedia Commons (File:BellaCiao Accordion.png, StropheEins, transposed +7 semitones from D minor to A minor)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:BellaCiao_Accordion.png',
        sourceMovement: 'Allegretto (4/4, original D minor transposed +7 semitones to A minor, 1.5-beat three-eighth pickup)',
        sourcePart: 'Right-hand vocal melody line (RH, complete Strophe 1)',
        sourceMeasures: 'pickup (1.5 beats: E4–A4–B4) + mm. 1–8 (complete 8-measure strophe)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (40 notes, 0 rests, 33.5 quarter-beats: 1.5-beat pickup E4–A4–B4 + 8 full 4/4 measures) against File:BellaCiao Accordion.png (StropheEins, transposed +7 semitones from D minor to A minor), with pickupBeats = 1.5, syncopated eighth + dotted-quarter tied figures C5(0.5)–A4(2.0), F5(0.5)–F5(2.0), F5(0.5)–E5(2.0), m. 7 quarter-note cadence B4–E5–C5–B4, and m. 8 whole-note tonic A4(4).'
      }
    },
    description:
      'Знаменитая итальянская песня в размере 4/4 (ля минор): трёхнотный восьмой затакт E4–A4–B4 («U-na mat-»), синкопированные вершины на C5 и F5 и энергичный припев.',
    notes: [
      'E4', 'A4', 'B4',
      'C5', 'A4', 'E4', 'A4', 'B4',
      'C5', 'A4', 'E4', 'A4', 'B4',
      'C5', 'B4', 'A4', 'C5', 'B4', 'A4',
      'E5', 'E5', 'E5'
    ],
    beats: [
      0.5, 0.5, 0.5,
      0.5, 2, 0.5, 0.5, 0.5,
      0.5, 2, 0.5, 0.5, 0.5,
      1, 0.5, 0.5, 1, 0.5, 0.5,
      1, 1, 0.5
    ],
    defaultBpm: 116,
    pickupBeats: 1.5,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'sakura-traditional',
    title: 'Sakura Sakura (Сакура)',
    source: 'Японская традиционная мелодия для кото · «箏曲集» (文部省音楽取調掛, 1888, NDL pid/857651)',
    level: 'Мелодия · Пентатоника',
    category: 'melody',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Sakura Sakura (「櫻」 / さくらさくら, Traditional Japanese Edo-period urban / koto melody)',
        sourceEdition:
          'Sōkyoku-shū 『箏曲集』 (Collection of Japanese Koto Music), compiled by Ongaku Torishirabegakari 文部省音楽取調掛 (Tokyo Academy of Music 東京音楽学校, ed. Shūji Izawa, Tokyo: Editorial Bureau of the Ministry of Education 文部省編集局, October 1888), National Diet Library Digital Collections info:ndljp/pid/857651, DOI 10.11501/857651, frame 6 (lyrics 歌詞) & frames 22–23 (koto notation 楽譜 for 「櫻」 in Hirajōshi tuning: 三=B3, 四=C4, 五=E4, 六=F4, 七=A4, 八=B4, 九=C5)',
        sourceUrl: 'https://dl.ndl.go.jp/pid/857651/1/22',
        sourceMovement: 'Andante (4/4, A In-sen / Miyako-bushi pentatonic mode: E–F–A–B–C)',
        sourcePart: 'Single-line koto / vocal melody (opening 6 measures: "Sakura, sakura, yayoi no sora wa / miwatasu kagiri")',
        sourceMeasures: 'mm. 1–6 (NDL pid/857651, frame 22 lower-right)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (22 notes, 0 rests, 24.0 quarter-beats across 6 measures in 4/4 meter) against the 1888 文部省音楽取調掛 Sōkyoku-shū 『箏曲集』 koto notation for 「櫻」 (NDL info:ndljp/pid/857651, DOI 10.11501/857651, frame 6 lyrics & frames 22–23 score) in Hirajōshi / In-sen tuning (pitch classes B3, C4, E4, F4, A4, B4, C5 only).'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Sakura Sakura (「櫻」 / さくらさくら, Traditional Japanese Edo-period urban / koto melody)',
        sourceEdition:
          'Sōkyoku-shū 『箏曲集』 (Collection of Japanese Koto Music), compiled by Ongaku Torishirabegakari 文部省音楽取調掛 (Tokyo Academy of Music 東京音楽学校, ed. Shūji Izawa, Tokyo: Editorial Bureau of the Ministry of Education 文部省編集局, October 1888), National Diet Library Digital Collections info:ndljp/pid/857651, DOI 10.11501/857651, frame 6 (lyrics 歌詞) & frames 22–23 (koto notation 楽譜 for 「櫻」 in Hirajōshi tuning: 三=B3, 四=C4, 五=E4, 六=F4, 七=A4, 八=B4, 九=C5)',
        sourceUrl: 'https://dl.ndl.go.jp/pid/857651/1/22',
        sourceMovement: 'Andante (4/4, A In-sen / Miyako-bushi pentatonic mode: E–F–A–B–C)',
        sourcePart: 'Complete 14-measure traditional koto / vocal stanza ("Sakura, sakura... iza ya, iza ya, mini yukan")',
        sourceMeasures: 'mm. 1–14 (NDL pid/857651, frames 22–23)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (50 notes, 0 rests, 56.0 quarter-beats across 14 measures in 4/4 meter) against the 1888 文部省音楽取調掛 Sōkyoku-shū 『箏曲集』 koto notation for 「櫻」 (NDL info:ndljp/pid/857651, DOI 10.11501/857651, frame 6 lyrics & frames 22–23 score), replacing the non-pentatonic D4 in m. 13 with the authentic Hirajōshi koto phrase 五 〇 六 〇 | 八 七 六 五 (E4(2)–F4(2) | B4(0.5)–A4(0.5)–F4(1)–E4(2) on "mi ni yu-ka-n") so 100% of pitches belong to the 5-note In-sen pentatonic scale {B3, C4, E4, F4, A4, B4, C5}.'
      }
    },
    description:
      'Традиционная японская мелодия «Сакура» (Сборник музыки для кото «箏曲集», 1888, NDL pid/857651) в пентатонике Ин-сэн (B3–C4–E4–F4–A4–B4–C5).',
    notes: [
      'A4', 'A4', 'B4',
      'A4', 'A4', 'B4',
      'A4', 'B4', 'C5', 'B4',
      'A4', 'B4', 'A4', 'F4',
      'E4', 'C4', 'E4', 'F4',
      'E4', 'E4', 'C4', 'B3'
    ],
    beats: [
      1, 1, 2,
      1, 1, 2,
      1, 1, 1, 1,
      1, 0.5, 0.5, 2,
      1, 1, 1, 1,
      1, 0.5, 0.5, 2
    ],
    defaultBpm: 72,
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'kocka-leze-dirou',
    title: 'Kočka leze dírou',
    source: 'Чешская народная песня (современная традиционная транскрипция C мажор · File:Kočka-leze-dírou.svg)',
    level: 'Этюд · Гамма + репетиции',
    category: 'study',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Kočka leze dírou (Traditional Czech folk song, common C-major melody "Kočka leze dírou, pes oknem")',
        sourceEdition:
          'Modern CC0 LilyPond transcription of the common Czech traditional C-major melody by Petr Kadlec (Wikimedia Commons File:Kočka-leze-dírou.svg, 2023; cross-checked against Czech school songbook Já, písnička I, Music Cheb)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ko%C4%8Dka-leze-d%C3%ADrou.svg',
        sourceMovement: 'Allegretto (2/4, C major)',
        sourcePart: 'Vocal / right-hand melody line (Stanza 1 with unfolded 1st and 2nd volta endings)',
        sourceMeasures: 'mm. 1–14 in 2/4 (mm. 1–6 + 4-bar repeat with 1st ending G4(2) in m. 10 and 2nd ending C4(2) in m. 14)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (30 notes, 0 rests, 28.0 quarter-beats across 14 measures in 2/4 meter) against the modern CC0 LilyPond transcription of the common Czech traditional C-major melody (Wikimedia Commons File:Kočka-leze-dírou.svg, 2023; Já, písnička I), aligning timeSignature and measureBeats from 4/4 to 2/4 so every barline matches the score.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Kočka leze dírou (Traditional Czech folk song, common C-major melody "Kočka leze dírou, pes oknem")',
        sourceEdition:
          'Modern CC0 LilyPond transcription of the common Czech traditional C-major melody by Petr Kadlec (Wikimedia Commons File:Kočka-leze-dírou.svg, 2023; cross-checked against Czech school songbook Já, písnička I, Music Cheb)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ko%C4%8Dka-leze-d%C3%ADrou.svg',
        sourceMovement: 'Allegretto (2/4, C major)',
        sourcePart: 'Vocal / right-hand melody line (Stanzas 1 & 2, each with unfolded 1st and 2nd volta endings)',
        sourceMeasures: 'mm. 1–28 in 2/4 (two complete 14-measure stanzas)',
        verifiedAt: '2026-09-29',
        notes:
          'Verified event-by-event (60 notes, 0 rests, 56.0 quarter-beats across 28 measures in 2/4 meter) against the modern CC0 LilyPond transcription of the common Czech traditional C-major melody (Wikimedia Commons File:Kočka-leze-dírou.svg, 2023; Já, písnička I, Stanza 1 "Kočka leze dírou..." + Stanza 2 "Nebude-li pršet, nezmoknem...").'
      }
    },
    description:
      'Традиционная чешская народная песня в размере 2/4 (до мажор): гаммообразный взлёт восьмыми C4–F4, чёткие репетиции и каденции первой и второй вольты.',
    notes: [
      'C4', 'D4', 'E4', 'F4',
      'G4', 'G4',
      'A4', 'A4',
      'G4',
      'A4', 'A4',
      'G4',
      'F4', 'F4', 'F4', 'F4',
      'E4', 'E4',
      'D4', 'D4',
      'G4',
      'F4', 'F4', 'F4', 'F4',
      'E4', 'E4',
      'D4', 'D4',
      'C4'
    ],
    beats: [
      0.5, 0.5, 0.5, 0.5,
      1, 1,
      1, 1,
      2,
      1, 1,
      2,
      0.5, 0.5, 0.5, 0.5,
      1, 1,
      1, 1,
      2,
      0.5, 0.5, 0.5, 0.5,
      1, 1,
      1, 1,
      2
    ],
    defaultBpm: 104,
    measureBeats: 2,
    timeSignature: [2, 4],
    phraseBars: 2
  },
  {
    id: 'joplin-entertainer',
    title: 'The Entertainer · Регтайм',
    source: 'Scott Joplin (MuseTrainer)',
    level: 'Этюд · Синкопы',
    category: 'study',
    variant: 'excerpt',
    fullVariant: 'melodyArrangement',
    keySignatureFifths: 0,
    verification: {
      excerpt: {
        status: 'verified',
        sourceTitle: 'Scott Joplin, The Entertainer: A Rag Time Two Step',
        sourceEdition: 'John Stark & Son, St. Louis, 1902 (First Edition) / Mutopia-2016/11/25-263',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.ly',
        sourceMovement: 'Section A (Not fast, 2/4, C major)',
        sourcePart: 'Piano right-hand upper melody line (single-note reduction of RH chords)',
        sourceMeasures: 'm. 4 pickup (last 2 sixteenth notes) + mm. 5–8',
        verifiedAt: '2026-09-29',
        notes: 'Verified event-by-event (18 notes + 1 rest = 19 events, 8.5 quarter-beats) against 1902 John Stark & Son first edition: two-sixteenth pickup (D4, D#4, pickupBeats = 0.5) leading to E4 on the downbeat of m. 5, 1.5-beat tied C5 across mm. 5–6, and 1.5-beat C5 + 0.5-beat rest in m. 8.'
      },
      melodyArrangement: {
        status: 'verified',
        sourceTitle: 'Scott Joplin, The Entertainer: A Rag Time Two Step',
        sourceEdition: 'John Stark & Son, St. Louis, 1902 (First Edition) / Mutopia-2016/11/25-263',
        sourceUrl: 'https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.ly',
        sourceMovement: 'Section A (Not fast, 2/4, C major)',
        sourcePart: 'Piano right-hand upper melody line (single-note reduction of RH chords)',
        sourceMeasures: 'm. 4 pickup (last 2 sixteenth notes) + mm. 5–20 (complete 16-bar Section A)',
        verifiedAt: '2026-09-29',
        notes: 'Verified event-by-event (77 notes + 1 rest = 78 events, 32.5 quarter-beats) against 1902 John Stark & Son first edition: pickupBeats = 0.5 (D4, D#4), E4 on downbeats of mm. 5, 9, 13, 1.5-beat tied C5 in mm. 5–6 and 13–14, 1.75-beat tied C5 in mm. 9–10, 1.5-beat D5 in m. 12, and 1.5-beat C5 + 0.5-beat rest in m. 20.'
      }
    },
    description: 'Классический регтайм Скотта Джоплина в размере 2/4: двухнотный шестнадцатый затакт (D4–D#4), сильная доля E4, синкопированные скачки на C5 через тактовую черту и регтаймовая каденция.',
    notes: [
      'D4', 'D#4',
      'E4', 'C5', 'E4', 'C5', 'E4', 'C5',
      'C5', 'D5', 'D#5',
      'E5', 'C5', 'D5', 'E5', 'B4', 'D5',
      'C5'
    ],
    beats: [
      0.25, 0.25,
      0.25, 0.5, 0.25, 0.5, 0.25, 1.5,
      0.25, 0.25, 0.25,
      0.25, 0.25, 0.25, 0.5, 0.25, 0.5,
      1.5
    ],
    restsAfter: {
      17: 0.5
    },
    pickupBeats: 0.5,
    measureBeats: 2,
    timeSignature: [2, 4],
    phraseBars: 2
  }
];

export const DEFAULT_BPM_BY_SONG_ID: Record<string, number> = {
  'five-note-c': 84,
  'ode-joy': 104,
  'mary-lamb': 100,
  'twinkle': 96,
  'bach-minuet-g': 108,
  'beethoven-fur-elise': 72,
  'burgmuller-arabesque': 120,
  'mozart-nachtmusik': 120,
  'hanon-1': 96,
  'czerny-599-1': 100,
  'beyer-101-8': 96,
  'satie-gymnopedie-1': 66,
  'pachelbel-canon-d': 72,
  'tchaikovsky-swan-lake': 84,
  'grieg-morning-mood': 96,
  'vivaldi-spring': 108,
  'dvorak-new-world-largo': 64,
  'brahms-wiegenlied': 76,
  'korobeiniki-tetris': 132,
  'leontovych-shchedryk': 138,
  'greensleeves': 88,
  'bella-ciao': 116,
  'sakura-traditional': 72,
  'kocka-leze-dirou': 104,
  'joplin-entertainer': 92
};

export function getEffectiveSongBpm(
  song: SongDef,
  tempoMode: 'wait' | 'slow' | 'normal' = 'wait',
  forDemo = false
): number | null {
  const nativeBpm = song.defaultBpm || DEFAULT_BPM_BY_SONG_ID[song.id] || 92;
  if (tempoMode === 'wait') {
    return forDemo ? nativeBpm : null;
  }
  if (tempoMode === 'slow') {
    return Math.max(48, Math.round(nativeBpm * 0.72));
  }
  return nativeBpm;
}

export function hasFullVersion(song: SongDef): boolean {
  const full = song.fullNotes && song.fullBeats
    ? { notes: song.fullNotes, beats: song.fullBeats }
    : FULL_REPERTOIRE_DATA[song.id];
  return Boolean(full && full.notes.length > song.notes.length);
}

export function getSongVerification(
  song: SongDef,
  lengthMode: RepertoireLengthMode = 'excerpt'
): RepertoireVerificationRecord {
  if (lengthMode === 'full') {
    return song.verification.melodyArrangement;
  }
  return song.verification.excerpt;
}

export function getSongVersion(song: SongDef, lengthMode: RepertoireLengthMode = 'excerpt'): SongDef {
  if (lengthMode !== 'full') {
    return {
      ...song,
      activeVerification: song.verification.excerpt
    };
  }
  const full = song.fullNotes && song.fullBeats
    ? {
        notes: song.fullNotes,
        beats: song.fullBeats,
        pickupBeats: song.pickupBeats,
        restsAfter: song.fullRestsAfter,
        events: song.fullEvents,
        rawXml: song.fullRawXml ?? song.rawXml,
        cursorStepByNote: song.fullCursorStepByNote ?? song.cursorStepByNote
      }
    : FULL_REPERTOIRE_DATA[song.id];
  if (!full || full.notes.length === 0) {
    return {
      ...song,
      activeVerification: song.verification.excerpt
    };
  }
  return {
    ...song,
    variant: song.fullVariant ?? 'melodyArrangement',
    activeVerification: song.verification.melodyArrangement,
    events: (full as any).events ?? undefined,
    notes: full.notes,
    beats: full.beats,
    pickupBeats: full.pickupBeats !== undefined ? full.pickupBeats : song.pickupBeats,
    rawXml: (full as any).rawXml ?? undefined,
    cursorStepByNote: (full as any).cursorStepByNote ?? undefined,
    restsAfter: full.restsAfter !== undefined ? full.restsAfter : undefined
  };
}

/**
 * Converts a SongDef's legacy `notes[]`/`beats[]`/`restsAfter?` or explicit `events?`
 * into an ordered monophonic `MelodyEvent[]` sequence without losing rests.
 */
export function songToRawMelodyEvents(song: Pick<SongDef, 'events' | 'notes' | 'beats' | 'restsAfter'>): MelodyEvent[] {
  if (song.events && song.events.length > 0) {
    return song.events.map((ev) => ({ ...ev }));
  }

  const events: MelodyEvent[] = [];
  const leadingRest = song.restsAfter?.[-1];
  if (leadingRest && leadingRest > 0) {
    events.push({ type: 'rest', beats: leadingRest });
  }

  for (let i = 0; i < song.notes.length; i++) {
    const pitch = song.notes[i];
    const beats = song.beats[i] ?? 1;
    events.push({
      type: 'note',
      pitch,
      beats
    });
    const restBeats = song.restsAfter?.[i];
    if (restBeats && restBeats > 0) {
      events.push({
        type: 'rest',
        beats: restBeats
      });
    }
  }

  return events;
}

/**
 * Pure canonical normalization function from SongDef into timeline-positioned
 * monophonic events (notes + rests) with exact beat, measure, and beatInMeasure coordinates.
 */
export function normalizeSongToEvents(song: SongDef): NormalizedMelodyEvent[] {
  const rawEvents = songToRawMelodyEvents(song);
  const beatsPerMeasure = song.measureBeats || 4;
  const pickupBeats = song.pickupBeats && song.pickupBeats > 0 ? song.pickupBeats : 0;

  const normalized: NormalizedMelodyEvent[] = [];
  let currentBeat = 0;
  let noteIndex = 0;

  for (const ev of rawEvents) {
    const durationBeats = Number(ev.beats.toFixed(4));
    const startBeat = Number(currentBeat.toFixed(4));

    let measure: number;
    let beatInMeasure: number;

    if (pickupBeats > 0) {
      if (startBeat < pickupBeats - 1e-4) {
        measure = 1;
        beatInMeasure = Number(startBeat.toFixed(4));
      } else {
        const afterPickup = Math.max(0, startBeat - pickupBeats);
        measure = 2 + Math.floor((afterPickup + 1e-4) / beatsPerMeasure);
        const offsetInMeasure = afterPickup - (measure - 2) * beatsPerMeasure;
        beatInMeasure = Number(Math.max(0, offsetInMeasure).toFixed(4));
      }
    } else {
      measure = 1 + Math.floor((startBeat + 1e-4) / beatsPerMeasure);
      const offsetInMeasure = startBeat - (measure - 1) * beatsPerMeasure;
      beatInMeasure = Number(Math.max(0, offsetInMeasure).toFixed(4));
    }

    if (ev.type === 'note') {
      normalized.push({
        type: 'note',
        pitch: ev.pitch,
        startBeat,
        durationBeats,
        measure,
        beatInMeasure,
        noteIndex: noteIndex++
      });
    } else {
      normalized.push({
        type: 'rest',
        startBeat,
        durationBeats,
        measure,
        beatInMeasure
      });
    }

    currentBeat = Number((currentBeat + durationBeats).toFixed(4));
  }

  return normalized;
}

export function getSongTotalTimelineBeats(song: SongDef): number {
  const events = normalizeSongToEvents(song);
  if (events.length === 0) return 0;
  const last = events[events.length - 1];
  return Number((last.startBeat + last.durationBeats).toFixed(4));
}

export function getSongMeasureCount(song: SongDef): number {
  const beatsPerMeasure = song.measureBeats || 4;
  const totalBeats = getSongTotalTimelineBeats(song);
  if (song.pickupBeats && song.pickupBeats > 0) {
    if (totalBeats <= song.pickupBeats + 0.001) return 1;
    return 1 + Math.ceil((totalBeats - song.pickupBeats - 0.001) / beatsPerMeasure);
  }
  return Math.max(1, Math.ceil((totalBeats - 0.001) / beatsPerMeasure));
}

export function getMeasureForNoteIndex(song: SongDef, noteIndex: number): number {
  const events = normalizeSongToEvents(song);
  const noteEvent = events.find((ev) => ev.type === 'note' && ev.noteIndex === noteIndex);
  if (noteEvent) return noteEvent.measure;
  if (noteIndex <= 0) return 1;
  return getSongMeasureCount(song);
}

export function getMeasureNoteRange(song: SongDef, measureNumber: number): { start: number; end: number; notes: string[] } {
  const beatsPerMeasure = song.measureBeats || 4;
  const totalMeasures = getSongMeasureCount(song);
  const m = Math.max(1, Math.min(totalMeasures, measureNumber));

  let startBeat: number;
  let endBeat: number;
  if (song.pickupBeats && song.pickupBeats > 0) {
    if (m === 1) {
      startBeat = 0;
      endBeat = song.pickupBeats;
    } else {
      startBeat = song.pickupBeats + (m - 2) * beatsPerMeasure;
      endBeat = song.pickupBeats + (m - 1) * beatsPerMeasure;
    }
  } else {
    startBeat = (m - 1) * beatsPerMeasure;
    endBeat = m * beatsPerMeasure;
  }

  const noteEvents = normalizeSongToEvents(song).filter((ev) => ev.type === 'note' && ev.noteIndex !== undefined);
  let start = -1;
  let end = song.notes.length;

  for (const ev of noteEvents) {
    const idx = ev.noteIndex!;
    const evEnd = ev.startBeat + ev.durationBeats;
    if (start === -1 && evEnd > startBeat + 0.001 && ev.startBeat >= startBeat - 0.001) {
      start = idx;
    } else if (start === -1 && ev.startBeat < startBeat - 0.001 && evEnd > startBeat + 0.001) {
      start = idx;
    }
    if (ev.startBeat >= endBeat - 0.001) {
      end = idx;
      break;
    }
  }
  if (start === -1) start = 0;
  if (end < start) end = start;

  return {
    start,
    end,
    notes: song.notes.slice(start, end)
  };
}

export function getSongDurationMs(song: SongDef, bpm?: number): number {
  const effectiveBpm = bpm ?? song.defaultBpm ?? DEFAULT_BPM_BY_SONG_ID[song.id] ?? 80;
  const beatMs = 60000 / effectiveBpm;
  const totalBeats = getSongTotalTimelineBeats(song);
  return Math.round(totalBeats * beatMs);
}

/**
 * Computes deterministic, non-overlapping envelope timing for a note of `nominalDurationMs`.
 * By default (`allowTailOverlapMs = 0`), `releaseStartMs + releaseDurationMs <= nominalDurationMs`
 * so a note never bleeds into a following rest or next note onset.
 */
export function computeNoteEnvelopeTiming(
  onsetMs: number,
  nominalDurationMs: number,
  options?: NoteEnvelopeOptions
): NoteEnvelopeTiming {
  const safeNominal = Math.max(40, nominalDurationMs);
  const allowTailOverlapMs = Math.max(0, options?.allowTailOverlapMs ?? 0);
  const legatoRatio = Math.min(0.95, Math.max(0.5, options?.legatoRatio ?? 0.84));
  const defaultReleaseMs = Math.max(15, (options?.defaultReleaseSec ?? 0.12) * 1000);

  const maxTotalSpanMs = safeNominal + allowTailOverlapMs;
  const releaseStartMs = Math.max(20, Math.min(safeNominal - 15, Math.round(safeNominal * legatoRatio)));
  const maxAllowedReleaseMs = Math.max(15, Math.round(maxTotalSpanMs - releaseStartMs));
  const releaseDurationMs = Math.min(Math.round(defaultReleaseMs), maxAllowedReleaseMs);

  return {
    onsetMs: Math.round(onsetMs),
    nominalDurationMs: Math.round(safeNominal),
    releaseStartMs,
    releaseDurationMs,
    nextOnsetMs: Math.round(onsetMs + safeNominal)
  };
}

/**
 * Builds a deterministic playback timeline schedule from a SongDef and BPM,
 * preserving rests as silent spans and guaranteeing non-overlapping note envelopes
 * unless `allowTailOverlapMs > 0` is explicitly passed.
 */
export function buildSongPlaybackSchedule(
  song: SongDef,
  bpm?: number,
  envelopeOptions?: NoteEnvelopeOptions
): ScheduledPlaybackItem[] {
  const effectiveBpm = bpm ?? song.defaultBpm ?? DEFAULT_BPM_BY_SONG_ID[song.id] ?? 92;
  const beatMs = 60000 / Math.max(24, effectiveBpm);
  const events = normalizeSongToEvents(song);

  return events.map((ev) => {
    const onsetMs = ev.startBeat * beatMs;
    const nominalDurationMs = Math.max(40, ev.durationBeats * beatMs);
    if (ev.type === 'rest') {
      return {
        type: 'rest',
        measure: ev.measure,
        beatInMeasure: ev.beatInMeasure,
        startBeat: ev.startBeat,
        durationBeats: ev.durationBeats,
        onsetMs: Math.round(onsetMs),
        nominalDurationMs: Math.round(nominalDurationMs),
        releaseStartMs: 0,
        releaseDurationMs: 0,
        nextOnsetMs: Math.round(onsetMs + nominalDurationMs)
      };
    }

    const env = computeNoteEnvelopeTiming(onsetMs, nominalDurationMs, envelopeOptions);
    return {
      type: 'note',
      pitch: ev.pitch,
      noteIndex: ev.noteIndex,
      measure: ev.measure,
      beatInMeasure: ev.beatInMeasure,
      startBeat: ev.startBeat,
      durationBeats: ev.durationBeats,
      ...env
    };
  });
}

export const TEMPO_MODES = {
  wait: { label: 'Wait', bpm: null },
  slow: { label: 'Slow · 72%', bpm: 60 },
  normal: { label: 'Normal · 100%', bpm: 90 }
} as const;

export const DYNAMIC_MODES = {
  off: { label: 'Выкл', short: '—', min: 0, max: 127 },
  p: { label: 'p · тихо', short: 'p', min: 18, max: 56 },
  mf: { label: 'mf · средне', short: 'mf', min: 48, max: 92 },
  f: { label: 'f · громко', short: 'f', min: 82, max: 127 }
} as const;

export const ARTICULATION_MODES = {
  off: { label: 'Выкл', short: '—', minRatio: 0, maxRatio: Infinity },
  legato: { label: 'Legato', short: 'legato', minRatio: 0.72, maxRatio: 1.25 },
  detached: { label: 'Detached', short: 'detached', minRatio: 0.25, maxRatio: 0.62 }
} as const;
