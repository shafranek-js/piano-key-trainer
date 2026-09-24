import { FULL_REPERTOIRE_DATA } from './fullRepertoireData';

export type RepertoireLengthMode = 'excerpt' | 'full';

export interface SongDef {
  id: string;
  title: string;
  source: string;
  level: string;
  category?: 'warmup' | 'study' | 'classical' | 'melody';
  description: string;
  notes: string[];
  beats: number[];
  fullNotes?: string[];
  fullBeats?: number[];
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
    beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1, 2],
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
  },
  {
    id: 'satie-gymnopedie-1',
    title: 'Gymnopédie No. 1 · Тема',
    source: 'Erik Satie (MuseTrainer CC0)',
    level: 'Классика · 3/4',
    category: 'classical',
    description: 'Знаменитая медитативная мелодия Эрика Сати в размере 3/4 с плавным движением и долгими точками покоя.',
    notes: ['F#5', 'A5', 'G5', 'F#5', 'C#5', 'B4', 'C#5', 'D5', 'A4', 'F#4', 'F#5', 'A5', 'G5', 'F#5', 'C#5', 'D5'],
    beats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'pachelbel-canon-d',
    title: 'Canon in D · Главная тема',
    source: 'Johann Pachelbel (MuseTrainer)',
    level: 'Классика · 4/4',
    category: 'classical',
    description: 'Торжественное нисходящее движение половинными нотами, переходящее в живую четвертную вариацию.',
    notes: ['F#5', 'E5', 'D5', 'C#5', 'B4', 'A4', 'B4', 'C#5', 'D5', 'F#4', 'A4', 'G4', 'F#4', 'D4', 'F#4', 'E4'],
    beats: [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'tchaikovsky-swan-lake',
    title: 'Лебединое озеро · Тема',
    source: 'П. И. Чайковский (MuseTrainer)',
    level: 'Классика · Выразительно',
    category: 'classical',
    description: 'Главная тема из балета «Лебединое озеро»: певучая половинная нота, восходящий ход восьмыми и пунктирный ритм.',
    notes: ['E5', 'A4', 'B4', 'C5', 'D5', 'E5', 'C5', 'E5', 'C5', 'E5', 'A4', 'C5', 'A4', 'F4', 'C5', 'A4'],
    beats: [2, 0.5, 0.5, 0.5, 0.5, 1.5, 0.5, 1.5, 0.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 4],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'grieg-morning-mood',
    title: 'Утро (Morning Mood · Пер Гюнт)',
    source: 'Edvard Grieg · Op. 23 (PDMX CC0)',
    level: 'Классика · 3/4',
    category: 'classical',
    description: 'Светлая пасторальная тема рассвета: переливающиеся восьмые ноты по пентатонике с тремя диезами.',
    notes: ['B4', 'G#4', 'F#4', 'E4', 'F#4', 'G#4', 'B4', 'G#4', 'F#4', 'E4', 'F#4', 'G#4', 'B4', 'G#4', 'B4', 'C#5', 'G#4', 'C#5', 'B4', 'G#4', 'E4'],
    beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 1],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'vivaldi-spring',
    title: 'Весна (Времена года · Тема)',
    source: 'Antonio Vivaldi · RV 269 (PDMX CC0)',
    level: 'Классика · Барокко',
    category: 'classical',
    description: 'Жизнерадостная тема барочного концерта Вивальди с упругими четвертными и лёгкими восьмыми распевами.',
    notes: ['C5', 'E5', 'E5', 'E5', 'D5', 'C5', 'G5', 'G5', 'F5', 'E5', 'E5', 'E5', 'D5', 'C5', 'D5'],
    beats: [1, 1, 1, 1, 0.5, 0.5, 1.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5, 1],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'dvorak-new-world-largo',
    title: 'Из Нового Света · Largo',
    source: 'Antonín Dvořák · Симфония № 9 (PDMX CC0)',
    level: 'Классика · Пунктир',
    category: 'classical',
    description: 'Проникновенная тема Largo: идеальное упражнение на пунктирный ритм (четверть с точкой + восьмая) и кантилену.',
    notes: ['E4', 'G4', 'G4', 'E4', 'D4', 'C4', 'D4', 'E4', 'G4', 'E4', 'D4'],
    beats: [1.5, 0.5, 2, 1.5, 0.5, 2, 1, 1, 1.5, 0.5, 4],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'brahms-wiegenlied',
    title: 'Колыбельная (Wiegenlied Op. 49)',
    source: 'Johannes Brahms (OpenScore Lieder CC0)',
    level: 'Классика · 3/4',
    category: 'classical',
    description: 'Знаменитая колыбельная Брамса в трёхдольном размере с мягкими восьмыми затактами.',
    notes: ['E4', 'E4', 'G4', 'E4', 'E4', 'G4', 'G4', 'C5', 'B4', 'A4', 'A4', 'G4', 'D4', 'E4', 'F4'],
    beats: [0.5, 0.5, 1.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 1, 1, 0.5, 0.5, 1],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'korobeiniki-tetris',
    title: 'Коробейники (Tetris Theme)',
    source: 'Русская народная (PDMX CC0)',
    level: 'Мелодия · Драйв',
    category: 'melody',
    description: 'Легендарная тема «Коробейники»: чередование четвертных и парных восьмых нот под вязками.',
    notes: ['E5', 'B4', 'C5', 'D5', 'C5', 'B4', 'A4', 'A4', 'C5', 'E5', 'D5', 'C5', 'B4', 'C5', 'D5', 'E5', 'C5', 'A4', 'A4'],
    beats: [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1.5, 0.5, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'leontovych-shchedryk',
    title: 'Щедрик (Carol of the Bells)',
    source: 'Н. Д. Леонтович (PDMX CC0)',
    level: 'Мелодия · 3/4 остинато',
    category: 'melody',
    description: 'Магический четырёхнотный мотив в размере 3/4 (четверть — две восьмые — четверть) с переносом на терцию вверх.',
    notes: ['C5', 'B4', 'C5', 'A4', 'C5', 'B4', 'C5', 'A4', 'E5', 'D5', 'E5', 'C5', 'E5', 'D5', 'E5', 'C5'],
    beats: [1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves (Зелёные рукава)',
    source: 'Английская баллада XVI в. (MuseTrainer)',
    level: 'Мелодия · 3/4',
    category: 'melody',
    description: 'Старинная ренессансная мелодия в размере 3/4: сочетание половинных, четвертей с точкой и восьмых.',
    notes: ['A4', 'C5', 'D5', 'E5', 'F5', 'E5', 'D5', 'B4', 'G4', 'A4', 'B4', 'C5', 'A4', 'A4', 'G#4', 'A4'],
    beats: [1, 2, 1, 1.5, 0.5, 1, 2, 1, 1.5, 0.5, 1, 1, 1, 1.5, 0.5, 1],
    measureBeats: 3,
    timeSignature: [3, 4],
    phraseBars: 2
  },
  {
    id: 'bella-ciao',
    title: 'Bella Ciao · Тема',
    source: 'Итальянская народная (MuseTrainer)',
    level: 'Мелодия · Ритмично',
    category: 'melody',
    description: 'Энергичные восходящие группы из четырёх восьмых нот с акцентированной половинной вершиной.',
    notes: ['E4', 'A4', 'B4', 'C5', 'A4', 'E4', 'A4', 'B4', 'C5', 'A4', 'E4', 'A4', 'B4', 'C5', 'B4', 'A4', 'C5', 'B4', 'A4', 'E5'],
    beats: [0.5, 0.5, 0.5, 0.5, 2, 0.5, 0.5, 0.5, 0.5, 2, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'sakura-traditional',
    title: 'Sakura Sakura (Сакура)',
    source: 'Японская традиционная (PDMX CC0)',
    level: 'Мелодия · Пентатоника',
    category: 'melody',
    description: 'Традиционный японский звукоряд (A–B–C–E–F): созерцательные половинные и изящный распев восьмыми.',
    notes: ['A4', 'A4', 'B4', 'A4', 'A4', 'B4', 'A4', 'B4', 'C5', 'B4', 'A4', 'B4', 'A4', 'F4', 'E4'],
    beats: [1, 1, 2, 1, 1, 2, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 2, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'kocka-leze-dirou',
    title: 'Kočka leze dírou',
    source: 'Чешская народная (MelodicaTrainer CC0)',
    level: 'Этюд · Гамма + репетиции',
    category: 'study',
    description: 'Отличное упражнение из коллекции MelodicaTrainer: гаммообразный взлёт восьмыми (C4–F4) и чёткие репетиции.',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'],
    beats: [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 2, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  },
  {
    id: 'joplin-entertainer',
    title: 'The Entertainer · Регтайм',
    source: 'Scott Joplin (MuseTrainer)',
    level: 'Этюд · Хроматизм',
    category: 'study',
    description: 'Классический регтайм Скотта Джоплина: хроматические подходы (D–D#–E) и широкие скачки на октаву.',
    notes: ['D4', 'D#4', 'E4', 'C5', 'E4', 'C5', 'E4', 'C5', 'C5', 'D5', 'D#5', 'E5', 'C5', 'D5', 'E5', 'B4', 'D5', 'C5'],
    beats: [0.5, 0.5, 0.5, 1, 0.5, 1, 1, 3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 2],
    measureBeats: 4,
    timeSignature: [4, 4],
    phraseBars: 2
  }
];

export function hasFullVersion(song: SongDef): boolean {
  const full = song.fullNotes && song.fullBeats
    ? { notes: song.fullNotes, beats: song.fullBeats }
    : FULL_REPERTOIRE_DATA[song.id];
  return Boolean(full && full.notes.length > song.notes.length);
}

export function getSongVersion(song: SongDef, lengthMode: RepertoireLengthMode = 'excerpt'): SongDef {
  if (lengthMode !== 'full') return song;
  const full = song.fullNotes && song.fullBeats
    ? { notes: song.fullNotes, beats: song.fullBeats }
    : FULL_REPERTOIRE_DATA[song.id];
  if (!full || full.notes.length === 0) return song;
  return {
    ...song,
    notes: full.notes,
    beats: full.beats,
    restsAfter: undefined
  };
}

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
