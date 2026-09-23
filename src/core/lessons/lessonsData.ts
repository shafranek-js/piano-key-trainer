import type { NoteName } from '../fsrs/types';

export interface LessonStep {
  type: 'info' | 'practice' | 'exact' | 'notation' | 'ear' | 'hand' | 'complete';
  title: string;
  body: string;
  note?: NoteName;
  keyId?: string;
  hand?: 'left' | 'right';
  position?: 'leftC' | 'rightC';
  finger?: number;
}

export interface LessonDef {
  id: string;
  title: string;
  tag: string;
  summary: string;
  steps: LessonStep[];
}

export interface HandPositionDef {
  label: string;
  mapping: [string, number][]; // [keyId, finger]
}

export const HAND_POSITIONS: Record<'rightC' | 'leftC', HandPositionDef> = {
  rightC: {
    label: 'Правая рука · C position',
    mapping: [['C4', 1], ['D4', 2], ['E4', 3], ['F4', 4], ['G4', 5]]
  },
  leftC: {
    label: 'Левая рука · C position',
    mapping: [['C3', 5], ['D3', 4], ['E3', 3], ['F3', 2], ['G3', 1]]
  }
};

export const LESSONS: readonly LessonDef[] = [
  {
    id: 'two-black',
    title: 'Урок 1 · Группа из 2 чёрных',
    tag: 'Ориентиры',
    summary: 'Находим C, D и E вокруг группы из двух чёрных клавиш.',
    steps: [
      { type: 'info', title: 'Замечай форму', body: 'Сначала не ищи буквы. Посмотри на клавиатуру как на повторяющийся узор: 2 чёрных, потом 3 чёрных. Белая клавиша сразу слева от группы из 2 чёрных — это C · До.' },
      { type: 'practice', note: 'C', title: 'Найди C', body: 'Нажми C · До. Ищи белую клавишу сразу слева от группы из 2 чёрных.' },
      { type: 'practice', note: 'D', title: 'Найди D', body: 'Нажми D · Ре. Она находится между двумя чёрными клавишами этой группы.' },
      { type: 'practice', note: 'E', title: 'Найди E', body: 'Нажми E · Ми. Это белая клавиша сразу справа от группы из 2 чёрных.' },
      { type: 'complete', title: 'Готово', body: 'Теперь ты видишь полный белый блок вокруг группы из 2 чёрных: C–D–E.' }
    ]
  },
  {
    id: 'three-black',
    title: 'Урок 2 · Группа из 3 чёрных',
    tag: 'Ориентиры',
    summary: 'Осваиваем F, G, A и B вокруг группы из трёх чёрных клавиш.',
    steps: [
      { type: 'info', title: 'Вторая большая опора', body: 'Белая клавиша сразу слева от группы из 3 чёрных — это F · Фа. Дальше остальные белые клавиши читаются слева направо: F–G–A–B.' },
      { type: 'practice', note: 'F', title: 'Найди F', body: 'Нажми F · Фа. Она стоит сразу слева от группы из 3 чёрных клавиш.' },
      { type: 'practice', note: 'G', title: 'Найди G', body: 'Нажми G · Соль. Она находится между 1-й и 2-й чёрной клавишей в группе из 3.' },
      { type: 'practice', note: 'A', title: 'Найди A', body: 'Нажми A · Ля. Она находится между 2-й и 3-й чёрной клавишей в группе из 3.' },
      { type: 'practice', note: 'B', title: 'Найди B', body: 'Нажми B · Си. Это белая клавиша сразу справа от группы из 3 чёрных.' },
      { type: 'complete', title: 'Готово', body: 'Теперь у тебя есть обе главные опоры клавиатуры: C и F.' }
    ]
  },
  {
    id: 'anchors',
    title: 'Урок 3 · Якоря C и F',
    tag: 'База',
    summary: 'Учимся мгновенно находить две главные опорные ноты на всей клавиатуре.',
    steps: [
      { type: 'info', title: 'Две супер-опоры', body: 'Быстрее сначала найти C или F, а уже от них двигаться к соседям. Это проще, чем искать каждую ноту как отдельный объект.' },
      { type: 'practice', note: 'C', title: 'Найди любой C', body: 'Нажми любой C на показанной клавиатуре. Нам важна структура, а не конкретная октава.' },
      { type: 'practice', note: 'F', title: 'Найди любой F', body: 'Нажми любой F на показанной клавиатуре. Снова ориентируйся на группу из 3 чёрных клавиш.' },
      { type: 'practice', note: 'C', title: 'Ещё один C', body: 'Повтори: сначала увидь группу из 2 чёрных, потом найди белую слева.' },
      { type: 'practice', note: 'F', title: 'Ещё один F', body: 'Повтори: сначала увидь группу из 3 чёрных, потом найди белую слева.' },
      { type: 'complete', title: 'Готово', body: 'Теперь C и F должны начать ощущаться как быстрые ориентиры, а не как отдельные загадки.' }
    ]
  },
  {
    id: 'white-map',
    title: 'Урок 4 · Полная карта белых клавиш',
    tag: 'Карта',
    summary: 'Соединяем две опоры и достраиваем полную карту C–D–E–F–G–A–B.',
    steps: [
      { type: 'info', title: 'Собираем всё вместе', body: 'Теперь у нас есть две оси: C возле группы из 2 чёрных и F возле группы из 3. Остальные белые клавиши — это соседи вокруг этих точек.' },
      { type: 'practice', note: 'E', title: 'E справа от 2 чёрных', body: 'Нажми E · Ми. Это правая граница блока C–D–E.' },
      { type: 'practice', note: 'B', title: 'B справа от 3 чёрных', body: 'Нажми B · Си. Это правая граница блока F–G–A–B.' },
      { type: 'practice', note: 'D', title: 'D между двумя чёрными', body: 'Нажми D · Ре.' },
      { type: 'practice', note: 'G', title: 'G в группе из 3', body: 'Нажми G · Соль.' },
      { type: 'practice', note: 'A', title: 'A в группе из 3', body: 'Нажми A · Ля.' },
      { type: 'complete', title: 'Готово', body: 'Ты собрал базовую карту белых клавиш. Теперь практика и FSRS будут закреплять её до автоматизма.' }
    ]
  },
  {
    id: 'black-keys',
    title: 'Урок 5 · Чёрные клавиши',
    tag: '♯ / ♭',
    summary: 'Связываем пять чёрных клавиш с уже знакомыми белыми ориентирами.',
    steps: [
      { type: 'info', title: 'Чёрные клавиши — не отдельная карта', body: 'Их проще читать относительно белых. C♯ — чёрная справа от C, D♯ — справа от D; затем F♯, G♯ и A♯ внутри группы из трёх.' },
      { type: 'practice', note: 'C#', title: 'Найди C♯ / D♭', body: 'Нажми первую чёрную клавишу в группе из двух.' },
      { type: 'practice', note: 'D#', title: 'Найди D♯ / E♭', body: 'Нажми вторую чёрную клавишу в группе из двух.' },
      { type: 'practice', note: 'F#', title: 'Найди F♯ / G♭', body: 'Нажми первую чёрную клавишу в группе из трёх.' },
      { type: 'practice', note: 'G#', title: 'Найди G♯ / A♭', body: 'Нажми среднюю чёрную клавишу в группе из трёх.' },
      { type: 'practice', note: 'A#', title: 'Найди A♯ / B♭', body: 'Нажми третью чёрную клавишу в группе из трёх.' },
      { type: 'complete', title: 'Готово', body: 'Теперь все 12 pitch classes привязаны к одной и той же геометрии 2 + 3.' }
    ]
  },
  {
    id: 'octaves',
    title: 'Урок 6 · Октавы',
    tag: 'Высота',
    summary: 'Учимся различать одинаковое имя ноты в разных регистрах.',
    steps: [
      { type: 'info', title: 'Имя одинаковое, высота разная', body: 'C3, C4 и C5 — всё нота C, но это разные физические клавиши. В чтении нот и MIDI точная октава важна.' },
      { type: 'exact', note: 'C', keyId: 'C3', title: 'Найди C3', body: 'Нажми нижнюю C в диапазоне тренажёра.' },
      { type: 'exact', note: 'C', keyId: 'C4', title: 'Найди C4', body: 'Нажми middle C — центральную C4.' },
      { type: 'exact', note: 'C', keyId: 'C5', title: 'Найди C5', body: 'Нажми верхнюю C в диапазоне тренажёра.' },
      { type: 'complete', title: 'Готово', body: 'Теперь одинаковое буквенное имя не означает одну и ту же физическую клавишу.' }
    ]
  },
  {
    id: 'notation-intro',
    title: 'Урок 7 · Первые ноты на стане',
    tag: 'Нотный стан',
    summary: 'Связываем C4, E4 и G4 с визуальной записью на скрипичном ключе.',
    steps: [
      { type: 'info', title: 'Стан — это вертикальная карта высоты', body: 'Чем выше нота расположена на стане, тем выше клавиша. Начнём с трёх опор: C4, E4 и G4.' },
      { type: 'notation', note: 'C', keyId: 'C4', title: 'Middle C', body: 'Прочитай ноту на добавочной линейке под станом и нажми C4.' },
      { type: 'notation', note: 'E', keyId: 'E4', title: 'E4', body: 'Теперь нижняя линия стана: нажми E4.' },
      { type: 'notation', note: 'G', keyId: 'G4', title: 'G4', body: 'Вторая линия снизу: нажми G4.' },
      { type: 'complete', title: 'Готово', body: 'Ты уже читаешь три опорные позиции на скрипичном стане.' }
    ]
  },
  {
    id: 'ear-intro',
    title: 'Урок 8 · Слышим расстояние',
    tag: 'Слух',
    summary: 'Используем C4 как звуковой ориентир и находим D4, E4 и G4.',
    steps: [
      { type: 'info', title: 'Не угадывай абсолютную высоту', body: 'Сначала звучит знакомая C4, затем целевой звук. Слушай расстояние от опоры, а не пытайся угадывать ноту из воздуха.' },
      { type: 'ear', note: 'D', keyId: 'D4', title: 'C4 → D4', body: 'После C4 прозвучит D4. Найди точную клавишу.' },
      { type: 'ear', note: 'E', keyId: 'E4', title: 'C4 → E4', body: 'Теперь расстояние до E4.' },
      { type: 'ear', note: 'G', keyId: 'G4', title: 'C4 → G4', body: 'Теперь более далёкая опора — G4.' },
      { type: 'complete', title: 'Готово', body: 'Слуховой режим теперь связан с уже знакомой географией клавиатуры.' }
    ]
  },
  {
    id: 'right-hand-c',
    title: 'Урок 9 · Правая рука · C position',
    tag: 'Правая рука',
    summary: 'Пальцы 1–5 на C4–G4. Приложение проверяет клавишу; номер пальца — guided self-check.',
    steps: [
      { type: 'info', title: 'Нумерация пальцев', body: 'На обеих руках большой палец — 1, указательный — 2, средний — 3, безымянный — 4, мизинец — 5. Правая рука в C position: C4=1, D4=2, E4=3, F4=4, G4=5.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'C', keyId: 'C4', finger: 1, title: 'C4 · палец 1', body: 'Положи большой палец правой руки на C4 и сыграй ноту.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'D', keyId: 'D4', finger: 2, title: 'D4 · палец 2', body: 'Указательный палец правой руки — D4.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'E', keyId: 'E4', finger: 3, title: 'E4 · палец 3', body: 'Средний палец правой руки — E4.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'F', keyId: 'F4', finger: 4, title: 'F4 · палец 4', body: 'Безымянный палец правой руки — F4.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'G', keyId: 'G4', finger: 5, title: 'G4 · палец 5', body: 'Мизинец правой руки — G4.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'E', keyId: 'E4', finger: 3, title: 'Назад к E4 · палец 3', body: 'Вернись средним пальцем на E4, сохраняя руку в позиции.' },
      { type: 'hand', hand: 'right', position: 'rightC', note: 'C', keyId: 'C4', finger: 1, title: 'Вернись на C4 · палец 1', body: 'Заверши движение большим пальцем на C4.' },
      { type: 'complete', title: 'Правая C position готова', body: 'Ты прошёл базовую позицию C4–G4 пальцами 1–5.' }
    ]
  },
  {
    id: 'left-hand-c',
    title: 'Урок 10 · Левая рука · C position',
    tag: 'Левая рука',
    summary: 'Пальцы 5–1 на C3–G3. Та же позиция, но зеркальная логика левой руки.',
    steps: [
      { type: 'info', title: 'Левая рука — зеркально', body: 'В левой руке C3 играет мизинец 5, D3 — 4, E3 — 3, F3 — 2, G3 — большой палец 1.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'C', keyId: 'C3', finger: 5, title: 'C3 · палец 5', body: 'Положи мизинец левой руки на C3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'D', keyId: 'D3', finger: 4, title: 'D3 · палец 4', body: 'Безымянный палец левой руки — D3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'E', keyId: 'E3', finger: 3, title: 'E3 · палец 3', body: 'Средний палец левой руки — E3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'F', keyId: 'F3', finger: 2, title: 'F3 · палец 2', body: 'Указательный палец левой руки — F3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'G', keyId: 'G3', finger: 1, title: 'G3 · палец 1', body: 'Большой палец левой руки — G3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'E', keyId: 'E3', finger: 3, title: 'Назад к E3 · палец 3', body: 'Вернись средним пальцем на E3.' },
      { type: 'hand', hand: 'left', position: 'leftC', note: 'C', keyId: 'C3', finger: 5, title: 'Вернись на C3 · палец 5', body: 'Заверши движение мизинцем на C3.' },
      { type: 'complete', title: 'Левая C position готова', body: 'Теперь обе руки знакомы с базовой C position.' }
    ]
  }
];
