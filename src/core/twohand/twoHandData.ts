export type TwoHandMode = 'pair' | 'anchor' | 'alternate';

export interface TwoHandStepPair {
  left: string;
  right: string;
}

export interface TwoHandStepAlternate {
  key: string;
  hand: 'L' | 'R';
}

export interface TwoHandPatternDef {
  id: string;
  title: string;
  level: string;
  mode: TwoHandMode;
  anchor?: string;
  description: string;
  steps: (TwoHandStepPair | TwoHandStepAlternate)[];
}

export const TWO_HAND_PATTERNS: readonly TwoHandPatternDef[] = [
  {
    id: 'mirror-pairs',
    title: 'Зеркальные пары',
    level: 'Старт',
    mode: 'pair',
    description: 'Обе руки одновременно играют C–D–E–F–G в соседних октавах.',
    steps: [
      { left: 'C3', right: 'C4' },
      { left: 'D3', right: 'D4' },
      { left: 'E3', right: 'E4' },
      { left: 'F3', right: 'F4' },
      { left: 'G3', right: 'G4' }
    ]
  },
  {
    id: 'left-anchor',
    title: 'Левая держит C',
    level: 'Координация',
    mode: 'anchor',
    anchor: 'C3',
    description: 'Держи C3 левой рукой, а правой последовательно сыграй C4–G4.',
    steps: ['C4', 'D4', 'E4', 'F4', 'G4'].map(right => ({ left: 'C3', right }))
  },
  {
    id: 'hand-pingpong',
    title: 'Пинг-понг рук',
    level: 'Чередование',
    mode: 'alternate',
    description: 'Левая и правая руки по очереди играют C–D–E–F–G.',
    steps: [
      { key: 'C3', hand: 'L' },
      { key: 'C4', hand: 'R' },
      { key: 'D3', hand: 'L' },
      { key: 'D4', hand: 'R' },
      { key: 'E3', hand: 'L' },
      { key: 'E4', hand: 'R' },
      { key: 'F3', hand: 'L' },
      { key: 'F4', hand: 'R' },
      { key: 'G3', hand: 'L' },
      { key: 'G4', hand: 'R' }
    ]
  }
];

export const TWO_HAND_TEMPO = {
  wait: { label: 'Wait', bpm: null },
  slow: { label: '60 BPM', bpm: 60 }
} as const;
