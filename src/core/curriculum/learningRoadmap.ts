import { normalizeSequentialPhaseCompletion, type CurriculumPhase } from './curriculum';

export type RoadmapStageId =
  | 'keys'
  | 'white_notes'
  | 'black_notes'
  | 'sheet_reading'
  | 'ear_training'
  | 'bass_clef'
  | 'intervals'
  | 'triads'
  | 'inversions'
  | 'harmony'
  | 'chord_rhythm'
  | 'two_hand';

export type RoadmapStageStatus =
  | 'completed'    // ✓ Пройдено
  | 'in_progress'  // ● Сейчас изучается
  | 'available'    // ○ Доступно
  | 'locked'       // 🔒 Ещё не открыто
  | 'planned';     // Запланировано

export type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface RoadmapStage {
  id: RoadmapStageId;
  order: number;
  title: string;
  category: 'core' | 'advanced' | 'planned';
  categoryLabelRu: string;
  status: RoadmapStageStatus;
  statusLabelRu: string;
  description: string;
  progressSummary: string;
  isCurrent: boolean;
}

export interface BuildRoadmapParams {
  phases?: readonly CurriculumPhase[];
  bassGrandStatus?: ModuleProgressStatus;
  intervalStatus?: ModuleProgressStatus;
  isIntervalAvailable?: boolean;
  triadStatus?: ModuleProgressStatus;
  isTriadAvailable?: boolean;
  inversionStatus?: ModuleProgressStatus;
  isInversionAvailable?: boolean;
  harmonyStatus?: ModuleProgressStatus;
  isHarmonyAvailable?: boolean;
  chordRhythmStatus?: ModuleProgressStatus;
  isChordRhythmAvailable?: boolean;
  twoHandStatus?: ModuleProgressStatus;
  isTwoHandAvailable?: boolean;
}

export const ROADMAP_DEFINITIONS: readonly {
  id: RoadmapStageId;
  order: number;
  title: string;
  category: 'core' | 'advanced' | 'planned';
  categoryLabelRu: string;
  description: string;
  defaultSummary: string;
}[] = [
  {
    id: 'keys',
    order: 1,
    title: 'Клавиши',
    category: 'core',
    categoryLabelRu: 'Основной курс',
    description: 'Ориентиры на клавиатуре: группы из двух и трёх чёрных клавиш.',
    defaultSummary: 'Ориентиры C и F'
  },
  {
    id: 'white_notes',
    order: 2,
    title: 'Белые ноты',
    category: 'core',
    categoryLabelRu: 'Основной курс',
    description: 'Расположение и названия всех белых клавиш от C до B.',
    defaultSummary: '7 нот: C · D · E · F · G · A · B'
  },
  {
    id: 'black_notes',
    order: 3,
    title: 'Чёрные ноты',
    category: 'core',
    categoryLabelRu: 'Основной курс',
    description: 'Диезы и бемоли: полутоновые сдвиги и знаки альтерации.',
    defaultSummary: '5 диезов и бемолей'
  },
  {
    id: 'sheet_reading',
    order: 4,
    title: 'Чтение нот',
    category: 'core',
    categoryLabelRu: 'Основной курс',
    description: 'Скрипичный ключ: связь нот на стане с нужными клавишами.',
    defaultSummary: 'Диапазон C4–B4'
  },
  {
    id: 'ear_training',
    order: 5,
    title: 'Слух',
    category: 'core',
    categoryLabelRu: 'Основной курс',
    description: 'Развитие слуха: узнавание нот относительно ориентиров.',
    defaultSummary: 'Слуховое узнавание'
  },
  {
    id: 'bass_clef',
    order: 6,
    title: 'Басовый ключ',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Чтение нот в басовом ключе и связь двух нотоносцев.',
    defaultSummary: 'Диапазон C3–B3'
  },
  {
    id: 'intervals',
    order: 7,
    title: 'Интервалы',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Научитесь видеть и слышать расстояние между двумя нотами.',
    defaultSummary: 'P8 · P5 · M3 · m3'
  },
  {
    id: 'triads',
    order: 8,
    title: 'Трезвучия',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Первые настоящие аккорды: мажорные и минорные трезвучия.',
    defaultSummary: 'Формула 1–3–5'
  },
  {
    id: 'inversions',
    order: 9,
    title: 'Обращения и аккордовые обозначения',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Научитесь играть один аккорд разными способами, читать обозначения C, Cm, G/B и сыграйте первую простую гармоническую последовательность.',
    defaultSummary: 'Обращения · аккордовые обозначения · первая последовательность'
  },
  {
    id: 'harmony',
    order: 10,
    title: 'Гармония и сопровождение',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Последовательности аккордов, функции I–V–vi–IV и плавные переходы в block chords.',
    defaultSummary: 'C → G/B → Am → F · 5 учебных этапов · проверка навыка'
  },
  {
    id: 'chord_rhythm',
    order: 11,
    title: 'Ритм аккордов',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Пульс в размере 4/4, смена аккорда на первую долю и простой рисунок на долях 1 и 3 в темпе 60 BPM.',
    defaultSummary: '4/4 · 60 BPM · C → G/B → Am → F'
  },
  {
    id: 'two_hand',
    order: 12,
    title: 'Игра двумя руками',
    category: 'advanced',
    categoryLabelRu: 'Дополнительный модуль',
    description: 'Левая рука играет бас, правая — аккорд: сначала по отдельности, затем вместе и по долям.',
    defaultSummary: 'Бас левой · аккорд правой · C → G/B → Am → F'
  }
];

export const ROADMAP_STATUS_LABELS: Record<RoadmapStageStatus, string> = {
  completed: '✓ Пройдено',
  in_progress: '● Сейчас изучается',
  available: '○ Доступно',
  locked: '🔒 Ещё не открыто',
  planned: 'Запланировано'
};

/**
 * Builds the user-facing learning roadmap.
 * Pure function: does not mutate input or any global state.
 */
export function buildLearningRoadmap(params: BuildRoadmapParams = {}): readonly RoadmapStage[] {
  const {
    phases = [],
    bassGrandStatus = 'not_started',
    intervalStatus = 'not_started',
    isIntervalAvailable = false,
    triadStatus = 'not_started',
    isTriadAvailable = false,
    inversionStatus = 'not_started',
    isInversionAvailable = false,
    harmonyStatus = 'not_started',
    isHarmonyAvailable = false,
    chordRhythmStatus = 'not_started',
    isChordRhythmAvailable = false,
    twoHandStatus = 'not_started',
    isTwoHandAvailable = false
  } = params;

  // Resolve core phase completion status after sequential normalization
  const normalizedPhases = normalizeSequentialPhaseCompletion(phases);
  const pAnchors = normalizedPhases.find((p) => p.id === 'anchors');
  const pNeighbors = normalizedPhases.find((p) => p.id === 'neighbors');
  const pRemaining = normalizedPhases.find((p) => p.id === 'remaining');
  const pBlack = normalizedPhases.find((p) => p.id === 'black');
  const pNotation = normalizedPhases.find((p) => p.id === 'notation');
  const pSound = normalizedPhases.find((p) => p.id === 'sound');

  const isAnchorsDone = Boolean(pAnchors?.done || pAnchors?.skipped);
  const isNeighborsDone = Boolean(pNeighbors?.done || pNeighbors?.skipped);
  const isRemainingDone = Boolean(pRemaining?.done || pRemaining?.skipped);
  const isWhiteDone = isNeighborsDone && isRemainingDone;
  const isBlackDone = Boolean(pBlack?.done || pBlack?.skipped);
  const isNotationDone = Boolean(pNotation?.done || pNotation?.skipped);
  const isSoundDone = Boolean(pSound?.done || pSound?.skipped);
  const isCoreCourseComplete = isAnchorsDone && isWhiteDone && isBlackDone && isNotationDone && isSoundDone;

  const statuses: Record<RoadmapStageId, RoadmapStageStatus> = {
    keys: 'locked',
    white_notes: 'locked',
    black_notes: 'locked',
    sheet_reading: 'locked',
    ear_training: 'locked',
    bass_clef: 'locked',
    intervals: 'locked',
    triads: 'locked',
    inversions: 'locked',
    harmony: 'planned',
    chord_rhythm: 'planned',
    two_hand: 'planned'
  };

  // 1. Keys (Anchors)
  if (isAnchorsDone) {
    statuses.keys = 'completed';
  } else {
    statuses.keys = 'in_progress';
  }

  // 2. White notes
  if (isWhiteDone) {
    statuses.white_notes = 'completed';
  } else if (isAnchorsDone) {
    statuses.white_notes = 'in_progress';
  } else {
    statuses.white_notes = 'locked';
  }

  // 3. Black notes
  if (isBlackDone) {
    statuses.black_notes = 'completed';
  } else if (isWhiteDone) {
    statuses.black_notes = 'in_progress';
  } else {
    statuses.black_notes = 'locked';
  }

  // 4. Sheet reading (Notation)
  if (isNotationDone) {
    statuses.sheet_reading = 'completed';
  } else if (isBlackDone) {
    statuses.sheet_reading = 'in_progress';
  } else {
    statuses.sheet_reading = 'locked';
  }

  // 5. Ear training (Sound)
  if (isSoundDone) {
    statuses.ear_training = 'completed';
  } else if (isNotationDone) {
    statuses.ear_training = 'in_progress';
  } else {
    statuses.ear_training = 'locked';
  }

  // 6. Bass clef
  if (bassGrandStatus === 'completed') {
    statuses.bass_clef = 'completed';
  } else if (bassGrandStatus === 'in_progress') {
    statuses.bass_clef = 'in_progress';
  } else if (isCoreCourseComplete) {
    statuses.bass_clef = 'available';
  } else {
    statuses.bass_clef = 'locked';
  }

  // 7. Intervals
  if (intervalStatus === 'completed') {
    statuses.intervals = 'completed';
  } else if (intervalStatus === 'in_progress') {
    statuses.intervals = 'in_progress';
  } else if (isIntervalAvailable) {
    statuses.intervals = 'available';
  } else {
    statuses.intervals = 'locked';
  }

  // 8. Triads
  if (triadStatus === 'completed') {
    statuses.triads = 'completed';
  } else if (triadStatus === 'in_progress') {
    statuses.triads = 'in_progress';
  } else if (isTriadAvailable) {
    statuses.triads = 'available';
  } else {
    statuses.triads = 'locked';
  }

  // 9. Inversions & chord symbols
  if (inversionStatus === 'completed') {
    statuses.inversions = 'completed';
  } else if (inversionStatus === 'in_progress') {
    statuses.inversions = 'in_progress';
  } else if (isInversionAvailable) {
    statuses.inversions = 'available';
  } else {
    statuses.inversions = 'locked';
  }

  // 10. Harmony & Accompaniment I unlocks after Inversions is completed.
  if (harmonyStatus === 'completed') {
    statuses.harmony = 'completed';
  } else if (harmonyStatus === 'in_progress') {
    statuses.harmony = 'in_progress';
  } else if (isHarmonyAvailable) {
    statuses.harmony = 'available';
  } else {
    statuses.harmony = 'planned';
  }

  if (chordRhythmStatus === 'completed') {
    statuses.chord_rhythm = 'completed';
  } else if (chordRhythmStatus === 'in_progress') {
    statuses.chord_rhythm = 'in_progress';
  } else if (isChordRhythmAvailable && statuses.harmony === 'completed') {
    statuses.chord_rhythm = 'available';
  } else {
    statuses.chord_rhythm = 'planned';
  }

  if (twoHandStatus === 'completed') {
    statuses.two_hand = 'completed';
  } else if (twoHandStatus === 'in_progress') {
    statuses.two_hand = 'in_progress';
  } else if (isTwoHandAvailable && statuses.chord_rhythm === 'completed') {
    statuses.two_hand = 'available';
  } else {
    statuses.two_hand = 'planned';
  }

  // Determine current stage
  // Order of priority:
  // 1) First stage that is 'in_progress'
  // 2) First stage that is 'available' (if none is actively in_progress)
  // 3) Otherwise the most recently completed stage stays current.
  // 4) When every one of the 11 stages is completed, no stage is current.
  let currentStageId: RoadmapStageId | null = null;
  const stageOrder: RoadmapStageId[] = [
    'keys',
    'white_notes',
    'black_notes',
    'sheet_reading',
    'ear_training',
    'bass_clef',
    'intervals',
    'triads',
    'inversions',
    'harmony',
    'chord_rhythm',
    'two_hand'
  ];

  for (const id of stageOrder) {
    if (statuses[id] === 'in_progress') {
      currentStageId = id;
      break;
    }
  }

  if (!currentStageId) {
    for (const id of stageOrder) {
      if (statuses[id] === 'available') {
        currentStageId = id;
        break;
      }
    }
  }

  if (!currentStageId) {
    for (const id of [...stageOrder].reverse()) {
      if (statuses[id] === 'completed') {
        currentStageId = id;
        break;
      }
    }
  }

  if (stageOrder.every((id) => statuses[id] === 'completed')) {
    currentStageId = null;
  }

  return ROADMAP_DEFINITIONS.map((def) => {
    const status = statuses[def.id];
    return {
      id: def.id,
      order: def.order,
      title: def.title,
      category: def.category,
      categoryLabelRu: def.categoryLabelRu,
      status,
      statusLabelRu: ROADMAP_STATUS_LABELS[status],
      description: def.description,
      progressSummary: def.defaultSummary,
      isCurrent: def.id === currentStageId
    };
  });
}

