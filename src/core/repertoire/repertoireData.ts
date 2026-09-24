export interface SongDef {
  id: string;
  title: string;
  source: string;
  level: string;
  category?: 'warmup' | 'study' | 'classical';
  description: string;
  notes: string[];
  beats: number[];
  measureBeats: number;
  timeSignature?: [number, number];
  phraseBars: number;
  restsAfter?: Record<number, number>;
}

export const REPERTOIRE: readonly SongDef[] = [
  {
    id: 'five-note-c',
    title: 'Пять нот C',
    source: 'Разминка',
    level: 'Очень легко',
    category: 'warmup',
    description: 'Короткий ход C–D–E–F–G и обратно. Читается по тактам и фразам.',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'ode-joy',
    title: 'Ode to Joy · тема',
    source: 'L. van Beethoven · public domain',
    level: 'Легко',
    category: 'classical',
    description: 'Четыре такта 4/4: знакомый мотив Бетховена с пунктирным ритмом и половинной нотой в каденции.',
    notes: ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    source: 'Traditional · public domain',
    level: 'Легко',
    category: 'classical',
    description: 'Классическая детская мелодия: чередование четвертных (1 счёт) и протяжных половинных нот (2 счёта).',
    notes: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4'],
    beats: [1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2],
    restsAfter: { 6: 1 },
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'twinkle',
    title: 'Twinkle · первая фраза',
    source: 'Traditional · public domain',
    level: 'Легко +',
    category: 'classical',
    description: 'Четыре такта 4/4: скачки на квинту со светлыми половинными каденциями на нотах G4 и C4.',
    notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2],
    restsAfter: { 6: 1 },
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'bach-minuet-g',
    title: 'Minuet in G major (BWV Anh. 114)',
    source: 'J. S. Bach / C. Petzold · Анна Магдалена',
    level: 'Классика · Барокко',
    category: 'classical',
    description: 'Подлинный ритм барочного менуэта в размере 3/4: четверти сочетаются с грациозными пассажами восьмых нот и знаком F#4.',
    notes: ['D5', 'G4', 'A4', 'B4', 'C5', 'D5', 'G4', 'G4', 'E5', 'C5', 'D5', 'E5', 'F#4', 'G4', 'D5', 'D5', 'C5', 'B4', 'A4', 'B4', 'A4', 'G4'],
    beats: [1, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 0.5, 1.5],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'beethoven-fur-elise',
    title: 'Für Elise (WoO 59) · Тема',
    source: 'L. van Beethoven · Багатель',
    level: 'Классика · Романтизм',
    category: 'classical',
    description: 'Подлинный ритмический рисунок шедевра Бетховена: лёгкие восьмые опевания (E4–D#4) и выразительные точки покоя.',
    notes: ['E4', 'D#4', 'E4', 'D#4', 'E4', 'B3', 'D4', 'C4', 'A3', 'C4', 'E4', 'A4', 'B4', 'E4', 'G#4', 'B4', 'C5'],
    beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1.5, 0.5, 0.5, 0.5, 2.5],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'burgmuller-arabesque',
    title: 'Arabesque Op. 100 No. 2',
    source: 'F. Burgmüller · 25 прогрессивных этюдов',
    level: 'Этюд · Беглость',
    category: 'study',
    description: 'Виртуозная фортепианная фактура: быстрые жемчужные восьмые пассажи и акцентированные опорные аккорды.',
    notes: ['A4', 'B4', 'C5', 'B4', 'A4', 'E4', 'E4', 'E4', 'B4', 'C5', 'D5', 'C5', 'B4', 'E4', 'E4', 'E4', 'C5', 'D5', 'E5', 'D5', 'C5', 'B4', 'A4', 'G#4', 'A4', 'B4', 'A4'],
    beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'mozart-nachtmusik',
    title: 'Eine kleine Nachtmusik · Тема',
    source: 'W. A. Mozart (KV 525) · Серенада № 13',
    level: 'Классика · Празднично',
    category: 'classical',
    description: 'Блестящий венский классический ритм Моцарта с пунктирными фанфарами и половинной кульминацией на D5.',
    notes: ['G4', 'D4', 'G4', 'D4', 'G4', 'D4', 'G4', 'B4', 'D5', 'C5', 'A4', 'C5', 'A4', 'C5', 'A4', 'F#4', 'A4', 'D4'],
    beats: [1.5, 0.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2, 1.5, 0.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'hanon-1',
    title: 'Hanon No. 1 · пальцевый этюд',
    source: 'C. L. Hanon · The Virtuoso Pianist',
    level: 'Разминка',
    category: 'warmup',
    description: 'Классический паттерн на независимость пальцев: звенья C–E–F–G–A–G–F–E и D–F–G–A–B–A–G–F.',
    notes: ['C4', 'E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4', 'D4', 'F4', 'G4', 'A4', 'B4', 'A4', 'G4', 'F4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'czerny-599-1',
    title: 'Czerny Op. 599 No. 1 · этюд',
    source: 'C. Czerny · First Instructor',
    level: 'Этюд',
    category: 'study',
    description: 'Плавное движение по белым клавишам в пятипальцевой позиции C4–G4.',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'beyer-101-8',
    title: 'Beyer Op. 101 No. 8 · мотив',
    source: 'F. Beyer · Vorschule im Klavierspiel',
    level: 'Этюд',
    category: 'study',
    description: 'Терцовые ходы и поступенное движение для развития беглости правой руки.',
    notes: ['C4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  }
];

export function getSongMeasureCount(song: SongDef): number {
  const beatsPerMeasure = song.measureBeats || 4;
  const totalBeats = song.beats.reduce((sum, b) => sum + b, 0);
  return Math.max(1, Math.ceil(totalBeats / beatsPerMeasure));
}

export function getMeasureForNoteIndex(song: SongDef, noteIndex: number): number {
  const beatsPerMeasure = song.measureBeats || 4;
  let acc = 0;
  for (let i = 0; i < noteIndex && i < song.beats.length; i++) {
    acc += song.beats[i];
  }
  return Math.floor(acc / beatsPerMeasure) + 1;
}

export function getMeasureNoteRange(song: SongDef, measureNumber: number): { start: number; end: number; notes: string[] } {
  const beatsPerMeasure = song.measureBeats || 4;
  const totalMeasures = getSongMeasureCount(song);
  const m = Math.max(1, Math.min(totalMeasures, measureNumber));
  const startBeat = (m - 1) * beatsPerMeasure;
  const endBeat = m * beatsPerMeasure;

  let start = -1;
  let end = song.notes.length;
  let acc = 0;

  for (let i = 0; i < song.notes.length; i++) {
    const dur = song.beats[i] || 1;
    if (start === -1 && acc >= startBeat - 0.001) {
      start = i;
    }
    acc += dur;
    if (acc >= endBeat - 0.001) {
      end = i + 1;
      break;
    }
  }
  if (start === -1) start = 0;

  return {
    start,
    end,
    notes: song.notes.slice(start, end)
  };
}

export function getSongDurationMs(song: SongDef, bpm = 80): number {
  const beatMs = 60000 / bpm;
  const totalBeats = song.beats.reduce((sum, b) => sum + b, 0);
  return Math.round(totalBeats * beatMs);
}

export const TEMPO_MODES = {
  wait: { label: 'Wait', bpm: null },
  slow: { label: 'Slow · 60', bpm: 60 },
  normal: { label: 'Normal · 90', bpm: 90 }
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
