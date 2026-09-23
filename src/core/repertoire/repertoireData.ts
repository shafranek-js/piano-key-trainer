export interface SongDef {
  id: string;
  title: string;
  source: string;
  level: string;
  description: string;
  notes: string[];
  beats: number[];
  measureBeats: number;
  phraseBars: number;
  restsAfter?: Record<number, number>;
}

export const REPERTOIRE: readonly SongDef[] = [
  {
    id: 'five-note-c',
    title: 'Пять нот C',
    source: 'Разминка',
    level: 'Очень легко',
    description: 'Короткий ход C–D–E–F–G и обратно. Теперь читается по тактам и фразам.',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 2],
    measureBeats: 4,
    phraseBars: 2
  },
  {
    id: 'ode-joy',
    title: 'Ode to Joy · тема',
    source: 'L. van Beethoven · public domain',
    level: 'Легко',
    description: 'Четыре такта 4/4: знакомый мотив одной рукой в среднем регистре.',
    notes: ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    measureBeats: 4,
    phraseBars: 2
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    source: 'Traditional · public domain',
    level: 'Легко',
    description: 'Четыре такта с простой четвертной паузой — первый шаг к чтению ритмической структуры.',
    notes: ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'D4', 'D4', 'D4', 'E4', 'G4', 'G4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2],
    restsAfter: { 6: 1 },
    measureBeats: 4,
    phraseBars: 2
  },
  {
    id: 'twinkle',
    title: 'Twinkle · первая фраза',
    source: 'Traditional · public domain',
    level: 'Легко +',
    description: 'Четыре такта 4/4, скачки до G/A и одна явная пауза между двумя короткими фразами.',
    notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    restsAfter: { 6: 1 },
    measureBeats: 4,
    phraseBars: 2
  }
];

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
