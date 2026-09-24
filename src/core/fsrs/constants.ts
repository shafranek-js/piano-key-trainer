import type { UserSettings, NoteName, NaturalNoteName, Grade, Skill } from './types';

export const DAY_MS = 86_400_000;

// FSRS-6 default parameters, reference implementation
export const W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542
];

export const DECAY = W[20];
export const FACTOR = Math.pow(0.9, -1 / DECAY) - 1;

export const DEFAULT_SETTINGS: UserSettings = {
  desiredRetention: 0.90,
  maxIntervalDays: 120,
  relearningSeconds: 45,
  newPitchClassesPerSession: 2,
  useLatencyGrading: true,
  latencyPolicyVersion: 1,
  sessionPreset: 'normal',
  midiFirstView: true,
  repertoireTempoMode: 'wait',
  metronomeEnabled: false,
  repertoireDisplayMode: 'keys',
  repertoireDynamicsTarget: 'off',
  repertoireArticulationTarget: 'off',
  twoHandTempoMode: 'wait',
  autoAdvanceDelaySeconds: 3.0,
  level: 'white',
  mode: 'smart',
  notationClef: 'treble'
};

export const LEARN_ORDER: readonly NoteName[] = [
  'C', 'F', 'D', 'E', 'B', 'G', 'A', 'C#', 'F#', 'G#', 'D#', 'A#'
];

export const ALL_NOTES: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

export const NATURAL_NOTES: readonly NaturalNoteName[] = [
  'C', 'D', 'E', 'F', 'G', 'A', 'B'
];

export const DISPLAY_NAMES: Record<NoteName, string> = {
  C: 'C · До',
  D: 'D · Ре',
  E: 'E · Ми',
  F: 'F · Фа',
  G: 'G · Соль',
  A: 'A · Ля',
  B: 'B · Си',
  'C#': 'C♯ / D♭',
  'D#': 'D♯ / E♭',
  'F#': 'F♯ / G♭',
  'G#': 'G♯ / A♭',
  'A#': 'A♯ / B♭'
};

export const SHORT_NAMES: Record<NoteName, string> = {
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  A: 'A',
  B: 'B',
  'C#': 'C♯',
  'D#': 'D♯',
  'F#': 'F♯',
  'G#': 'G♯',
  'A#': 'A♯'
};

export const GRADE_NAMES: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy'
};

export const SKILL_NAMES: Record<Skill, string> = {
  find: 'найти',
  identify: 'назвать',
  patternIdentify: 'ориентир → назвать',
  notationToKey: 'нота → клавиша',
  soundToKey: 'звук → клавиша'
};

export const CURRICULUM_GROUPS = {
  anchors: ['C', 'F'] as NoteName[],
  neighbors: ['D', 'E', 'B'] as NoteName[],
  remaining: ['G', 'A'] as NoteName[],
  black: ['C#', 'F#', 'G#', 'D#', 'A#'] as NoteName[]
};

export const CURRICULUM_MIN_STABILITY_DAYS = 3;

export const STAFF_HINTS: Partial<Record<NoteName, string>> = {
  C: 'Middle C — на добавочной линейке под скрипичным станом (C4).',
  D: 'D4 — в пространстве прямо под нижней линией стана.',
  E: 'E4 — нижняя линия скрипичного стана.',
  F: 'F4 — первое пространство снизу.',
  G: 'G4 — вторая линия снизу.',
  A: 'A4 — второе пространство снизу.',
  B: 'B4 — средняя линия скрипичного стана.'
};

export const SOUND_HINTS: Partial<Record<NoteName, string>> = {
  C: 'После опорной C4 звучит та же клавиша C4.',
  D: 'D4 — следующая белая справа от опорной C4.',
  E: 'E4 — вторая белая справа от C4.',
  F: 'F4 — третья белая справа от C4.',
  G: 'G4 — четвёртая белая справа от C4.',
  A: 'A4 — пятая белая справа от C4.',
  B: 'B4 — шестая белая справа от C4.'
};

export const LANDMARK_HINTS: Partial<Record<NoteName, string>> = {
  C: 'C — белая сразу слева от пары из 2 чёрных.',
  D: 'D — белая между двумя чёрными клавишами.',
  E: 'E — белая сразу справа от пары из 2 чёрных.',
  F: 'F — белая сразу слева от группы из 3 чёрных.',
  G: 'G — белая между 1-й и 2-й чёрной в группе из 3.',
  A: 'A — белая между 2-й и 3-й чёрной в группе из 3.',
  B: 'B — белая сразу справа от группы из 3 чёрных.',
  'C#': 'C♯ — первая чёрная в паре из 2.',
  'D#': 'D♯ — вторая чёрная в паре из 2.',
  'F#': 'F♯ — первая чёрная в группе из 3.',
  'G#': 'G♯ — средняя чёрная в группе из 3.',
  'A#': 'A♯ — третья чёрная в группе из 3.'
};
