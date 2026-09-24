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
  category?: 'pairs' | 'motion' | 'harmony' | 'alternate';
  mode: TwoHandMode;
  anchor?: string;
  description: string;
  steps: (TwoHandStepPair | TwoHandStepAlternate)[];
}

export const TWO_HAND_PATTERNS: readonly TwoHandPatternDef[] = [
  {
    id: 'mirror-pairs',
    title: 'Зеркальные пары C–G',
    level: 'Старт',
    category: 'pairs',
    mode: 'pair',
    description: 'Обе руки одновременно играют C–D–E–F–G в соседних октавах C3 и C4.',
    steps: [
      { left: 'C3', right: 'C4' },
      { left: 'D3', right: 'D4' },
      { left: 'E3', right: 'E4' },
      { left: 'F3', right: 'F4' },
      { left: 'G3', right: 'G4' }
    ]
  },
  {
    id: 'parallel-motion-c',
    title: 'Параллельный ход туда и обратно',
    level: 'Координация',
    category: 'motion',
    mode: 'pair',
    description: 'Обе руки синхронно поднимаются от C до G и возвращаются обратно к тонике.',
    steps: [
      { left: 'C3', right: 'C4' },
      { left: 'D3', right: 'D4' },
      { left: 'E3', right: 'E4' },
      { left: 'F3', right: 'F4' },
      { left: 'G3', right: 'G4' },
      { left: 'F3', right: 'F4' },
      { left: 'E3', right: 'E4' },
      { left: 'D3', right: 'D4' },
      { left: 'C3', right: 'C4' }
    ]
  },
  {
    id: 'contrary-motion-c',
    title: 'Расходящееся движение от центра',
    level: 'Синхронизация',
    category: 'motion',
    mode: 'pair',
    description: 'Обе руки стартуют от C и зеркально расходятся в противоположные стороны: левая вниз, правая вверх!',
    steps: [
      { left: 'C3', right: 'C4' },
      { left: 'B2', right: 'D4' },
      { left: 'A2', right: 'E4' },
      { left: 'G2', right: 'F4' },
      { left: 'A2', right: 'E4' },
      { left: 'B2', right: 'D4' },
      { left: 'C3', right: 'C4' }
    ]
  },
  {
    id: 'left-anchor',
    title: 'Басовый якорь C3',
    level: 'Координация',
    category: 'harmony',
    mode: 'anchor',
    anchor: 'C3',
    description: 'Левая рука держит басовую клавишу C3, пока правая ведёт мелодию C4–G4.',
    steps: ['C4', 'D4', 'E4', 'F4', 'G4'].map(right => ({ left: 'C3', right }))
  },
  {
    id: 'bass-fifths-melody',
    title: 'Басовая опора + Мелодический взлёт',
    level: 'Гармония',
    category: 'harmony',
    mode: 'pair',
    description: 'Левая рука ставит гармонические басы (C3, F3, G3, C3), правая поёт восходящие терции и квинты.',
    steps: [
      { left: 'C3', right: 'C4' },
      { left: 'C3', right: 'E4' },
      { left: 'C3', right: 'G4' },
      { left: 'F3', right: 'F4' },
      { left: 'F3', right: 'A4' },
      { left: 'G3', right: 'G4' },
      { left: 'G3', right: 'B4' },
      { left: 'C3', right: 'C5' }
    ]
  },
  {
    id: 'hand-pingpong',
    title: 'Пинг-понг рук',
    level: 'Чередование',
    category: 'alternate',
    mode: 'alternate',
    description: 'Левая и правая руки по очереди передают эстафету C–D–E–F–G.',
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
  },
  {
    id: 'twohand-chord-dialog',
    title: 'Диалог: Бас и Аккорд',
    level: 'Диалог рук',
    category: 'alternate',
    mode: 'alternate',
    description: 'Левая рука берёт опорный бас, а правая отвечает гармоническими созвучиями.',
    steps: [
      { key: 'C3', hand: 'L' },
      { key: 'E4', hand: 'R' },
      { key: 'G4', hand: 'R' },
      { key: 'C3', hand: 'L' },
      { key: 'F4', hand: 'R' },
      { key: 'A4', hand: 'R' },
      { key: 'G2', hand: 'L' },
      { key: 'D4', hand: 'R' },
      { key: 'B4', hand: 'R' },
      { key: 'C3', hand: 'L' },
      { key: 'C4', hand: 'R' }
    ]
  }
];

export const TWO_HAND_TEMPO = {
  wait: { label: 'Wait', bpm: null },
  slow: { label: '60 BPM', bpm: 60 }
} as const;
