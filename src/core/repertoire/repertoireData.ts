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
    description: 'Четыре такта 4/4: знакомый мотив одной рукой в среднем регистре.',
    notes: ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
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
    description: 'Четыре такта с простой четвертной паузой — первый шаг к чтению ритмической структуры.',
    notes: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2],
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
    description: 'Четыре такта 4/4, скачки до G/A и одна явная пауза между двумя короткими фразами.',
    notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
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
    description: 'Шедевр клавирной музыки в размере 3/4. Знакомство со знаком альтерации фа-диез (F#4) и поступенным движением.',
    notes: ['D5', 'G4', 'A4', 'B4', 'C5', 'D5', 'G4', 'G4', 'G4', 'E5', 'C5', 'D5', 'E5', 'F#4', 'G4', 'D5', 'D5', 'D5', 'C5', 'B4', 'A4', 'B4', 'A4', 'G4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
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
    description: 'Знаменитейшая фортепианная тема с полутоновым ходом E4–D#4 и выразительным взлетом к C5.',
    notes: ['E4', 'D#4', 'E4', 'D#4', 'E4', 'B3', 'D4', 'C4', 'A3', 'C4', 'E4', 'A4', 'B4', 'E4', 'G#4', 'B4', 'C5'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2],
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
    description: 'Виртуозный этюд для развития гибкости и скорости пальцев правой руки в тональности ля минор (содержит соль-диез G#4).',
    notes: ['A4', 'B4', 'C5', 'B4', 'A4', 'E4', 'E4', 'E4', 'B4', 'C5', 'D5', 'C5', 'B4', 'E4', 'E4', 'E4', 'C5', 'D5', 'E5', 'D5', 'C5', 'B4', 'A4', 'G#4', 'A4', 'B4', 'A4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
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
    description: 'Энергичный фанфарный мотив в соль мажоре с широкими интервальными ходами и нотой F#4.',
    notes: ['G4', 'D4', 'G4', 'D4', 'G4', 'D4', 'G4', 'B4', 'D5', 'C5', 'A4', 'C5', 'A4', 'C5', 'A4', 'F#4', 'A4', 'D4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2],
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
  return Math.max(1, Math.ceil(song.notes.length / beatsPerMeasure));
}

export function getMeasureForNoteIndex(song: SongDef, noteIndex: number): number {
  const beatsPerMeasure = song.measureBeats || 4;
  return Math.floor(noteIndex / beatsPerMeasure) + 1;
}

export function getMeasureNoteRange(song: SongDef, measureNumber: number): { start: number; end: number; notes: string[] } {
  const beatsPerMeasure = song.measureBeats || 4;
  const totalMeasures = getSongMeasureCount(song);
  const m = Math.max(1, Math.min(totalMeasures, measureNumber));
  const start = (m - 1) * beatsPerMeasure;
  const end = Math.min(song.notes.length, m * beatsPerMeasure);
  return {
    start,
    end,
    notes: song.notes.slice(start, end)
  };
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
