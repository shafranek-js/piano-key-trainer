import type { NoteName, PitchClass, ReviewKind, Skill } from '../fsrs/types';

export type InputChannel = 'pcNote' | 'answerButton' | 'pianoKey' | 'midi';

export interface SkillInputPolicy {
  /** Whether PC keyboard note-name shortcuts (C–B, 1–7, etc.) can answer this skill. */
  pcNote: boolean;
  /** Whether on-screen note-name answer buttons can answer this skill. */
  answerButton: boolean;
  /** Whether mouse/touch clicks on the on-screen piano keyboard can answer this skill. */
  pianoKey: boolean;
  /** Whether physical MIDI note-on events can answer this skill. */
  midi: boolean;
  /** Whether an exact octave match (specific keyId) is required rather than pitch class alone. */
  requiresExactOctave: boolean;
}

export const SKILL_INPUT_POLICY: Readonly<Record<Skill, SkillInputPolicy>> = {
  identify: {
    pcNote: true,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  patternIdentify: {
    pcNote: true,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: false
  },
  find: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: false
  },
  notationToKey: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  soundToKey: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  notationBassToKey: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  intervalBuild: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  intervalIdentify: {
    pcNote: false,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  triadBuild: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  triadIdentify: {
    pcNote: false,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  triadInversionBuild: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  triadInversionIdentify: {
    pcNote: false,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  chordSymbolRead: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  harmonyFunctionIdentify: {
    pcNote: false,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  harmonyNextChord: {
    pcNote: false,
    answerButton: true,
    pianoKey: false,
    midi: false,
    requiresExactOctave: false
  },
  harmonyProgressionPlay: {
    pcNote: false,
    answerButton: false,
    pianoKey: true,
    midi: true,
    requiresExactOctave: true
  },
  chordPulse: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  },
  chordChangeTiming: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  },
  chordRhythmPattern: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  },
  twoHandBass: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  },
  twoHandTogether: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  },
  twoHandAlternating: {
    pcNote: false, answerButton: false, pianoKey: true, midi: true, requiresExactOctave: true
  }
};

export function getSkillInputPolicy(skill: Skill): SkillInputPolicy {
  return SKILL_INPUT_POLICY[skill];
}

export function canUseInputForSkill(
  skill: Skill | null | undefined,
  channel: InputChannel
): boolean {
  if (!skill) return false;
  const policy = SKILL_INPUT_POLICY[skill];
  if (!policy) return false;
  return Boolean(policy[channel]);
}

export function canUseComputerKeyboardForSkill(skill: Skill | null | undefined): boolean {
  return canUseInputForSkill(skill, 'pcNote');
}

export const PATTERN_IDENTIFY_QUESTIONS: Readonly<Record<'C' | 'F' | 'E' | 'B', string>> = {
  C: 'Какая нота находится слева от группы из 2 чёрных клавиш?',
  F: 'Какая нота находится слева от группы из 3 чёрных клавиш?',
  E: 'Какая нота находится сразу справа от группы из 2 чёрных?',
  B: 'Какая нота находится сразу справа от группы из 3 чёрных?'
};

export function getPatternIdentifyPrompt(note: NoteName): string {
  return (
    (PATTERN_IDENTIFY_QUESTIONS as Readonly<Partial<Record<NoteName, string>>>)[note] ??
    'Какая нота соответствует этому ориентиру?'
  );
}

export const SKILL_INSTRUCTIONS: Readonly<Record<Skill, string>> = {
  identify: 'Назовите подсвеченную ноту кнопкой ответа или клавишами C–B / 1–7.',
  patternIdentify:
    'Ответьте клавишами C–B / 1–7, кликните соответствующую клавишу пианино или сыграйте её по MIDI.',
  find: 'Найдите ноту на экранной клавиатуре или сыграйте её по MIDI.',
  notationToKey:
    'Прочитайте ноту и нажмите точную клавишу на экранном пианино или MIDI-клавиатуре.',
  soundToKey:
    'Определите звук и нажмите точную клавишу на экранном пианино или MIDI-клавиатуре.',
  notationBassToKey:
    'Прочитайте ноту в басовом ключе и нажмите точную клавишу в малой октаве (C3–B3).',
  intervalBuild:
    'Постройте заданный интервал вверх от опорной ноты на экранном пианино или MIDI.',
  intervalIdentify:
    'Определите интервал между двумя подсвеченными клавишами кнопкой ответа или цифрами 1–4.',
  triadBuild:
    'Постройте заданное трезвучие вверх от опорной ноты (выберите 3 клавиши и нажмите «Проверить» или сыграйте аккорд по MIDI).',
  triadIdentify:
    'Определите качество трезвучия по трём подсвеченным клавишам: Мажорное [1] или Минорное [2].',
  triadInversionBuild:
    'Постройте заданное обращение трезвучия (выберите 3 клавиши и нажмите «Проверить» или сыграйте аккорд по MIDI).',
  triadInversionIdentify:
    'Определите положение трезвучия по трём подсвеченным клавишам: Основное [1], 1-е обращение [2] или 2-е обращение [3].',
  chordSymbolRead:
    'Сыграйте аккорд по буквенному обозначению (выберите 3 клавиши и нажмите «Проверить» или сыграйте аккорд по MIDI).',
  harmonyFunctionIdentify: 'Определите функцию или аккорд кнопками ответа. Клавиши нот не используются.',
  harmonyNextChord: 'Выберите следующий аккорд или функцию кнопкой ответа.',
  harmonyProgressionPlay: 'Сыграйте три ноты текущего аккорда вместе; после отпускания всех нот появится следующий аккорд.',
  chordPulse: 'Подготовьте аккорд и сыграйте его на первую долю такта.',
  chordChangeTiming: 'Подготовьте следующий аккорд заранее и сыграйте его на следующую первую долю.',
  chordRhythmPattern: 'Подготовьте аккорд и сыграйте его на долях 1 и 3.',
  twoHandBass: 'Сыграйте бас левой рукой в указанном регистре одним нажатием.',
  twoHandTogether: 'На первую долю нажмите одновременно бас левой рукой и три ноты аккорда правой.',
  twoHandAlternating: 'На первую долю сыграйте бас левой рукой, на третью долю — аккорд правой.'
};

export function getSkillInstruction(skill: Skill, kind?: ReviewKind): string {
  const base = SKILL_INSTRUCTIONS[skill];
  if (kind === 'cold') {
    return `${base} Одна попытка без подсказок; результат не меняет расписание FSRS.`;
  }
  if (kind === 'transfer') {
    return `${base} Закрепление и перенос навыка. Это задание не влияет на расписание повторений.`;
  }
  return base;
}

export function resolveNoteFromKeyboard(
  e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>>
): { note: NoteName } | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;

  const digitMap: Record<string, NoteName> = {
    Digit1: 'C', Digit2: 'D', Digit3: 'E', Digit4: 'F', Digit5: 'G', Digit6: 'A', Digit7: 'B',
    Numpad1: 'C', Numpad2: 'D', Numpad3: 'E', Numpad4: 'F', Numpad5: 'G', Numpad6: 'A', Numpad7: 'B'
  };
  if (digitMap[e.code]) {
    const base = digitMap[e.code];
    const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
    return { note: (isSharp ? `${base}#` : base) as NoteName };
  }

  const codeToNote: Record<string, NoteName> = {
    KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyA: 'A', KeyB: 'B'
  };
  if (codeToNote[e.code]) {
    const base = codeToNote[e.code];
    const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
    return { note: (isSharp ? `${base}#` : base) as NoteName };
  }

  const keyLower = (e.key || '').toLowerCase();
  const ruToNote: Record<string, NoteName> = {
    c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A', b: 'B',
    'с': 'C', 'в': 'D', 'у': 'E', 'а': 'F', 'п': 'G', 'ф': 'A', 'и': 'B'
  };
  if (ruToNote[keyLower]) {
    const base = ruToNote[keyLower];
    const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
    return { note: (isSharp ? `${base}#` : base) as NoteName };
  }

  return null;
}

/** Resolve a PC piano-note shortcut to the exact octave-key used by piano and MIDI input. */
export function resolvePianoKeyFromKeyboard(
  e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>>,
  octave: number
): { note: NoteName; keyId: string } | null {
  if (!Number.isInteger(octave) || octave < 0 || octave > 8) return null;
  const resolved = resolveNoteFromKeyboard(e);
  if (!resolved) return null;
  return { note: resolved.note, keyId: `${resolved.note}${octave}` };
}

export const WHITE_NATURAL_NOTES: readonly NoteName[] = [
  'C', 'D', 'E', 'F', 'G', 'A', 'B'
] as const;

export const BLACK_ACCIDENTAL_NOTES: readonly NoteName[] = [
  'C#', 'D#', 'F#', 'G#', 'A#'
] as const;

export const ENHARMONIC_PITCH_MAP: Readonly<Record<string, NoteName>> = {
  C: 'C',
  'C · До': 'C',
  D: 'D',
  'D · Ре': 'D',
  E: 'E',
  'E · Ми': 'E',
  F: 'F',
  'F · Фа': 'F',
  G: 'G',
  'G · Соль': 'G',
  A: 'A',
  'A · Ля': 'A',
  B: 'B',
  'B · Си': 'B',
  'C#': 'C#',
  'C♯': 'C#',
  Db: 'C#',
  'D♭': 'C#',
  'C#/Db': 'C#',
  'C# / Db': 'C#',
  'C♯/D♭': 'C#',
  'C♯ / D♭': 'C#',
  'D#': 'D#',
  'D♯': 'D#',
  Eb: 'D#',
  'E♭': 'D#',
  'D#/Eb': 'D#',
  'D# / Eb': 'D#',
  'D♯/E♭': 'D#',
  'D♯ / E♭': 'D#',
  'F#': 'F#',
  'F♯': 'F#',
  Gb: 'F#',
  'G♭': 'F#',
  'F#/Gb': 'F#',
  'F# / Gb': 'F#',
  'F♯/G♭': 'F#',
  'F♯ / G♭': 'F#',
  'G#': 'G#',
  'G♯': 'G#',
  Ab: 'G#',
  'A♭': 'G#',
  'G#/Ab': 'G#',
  'G# / Ab': 'G#',
  'G♯/A♭': 'G#',
  'G♯ / A♭': 'G#',
  'A#': 'A#',
  'A♯': 'A#',
  Bb: 'A#',
  'B♭': 'A#',
  'A#/Bb': 'A#',
  'A# / Bb': 'A#',
  'A♯/B♭': 'A#',
  'A♯ / B♭': 'A#'
};

/**
 * Normalizes any note name, flat/sharp alias, or dual enharmonic UI label
 * (`C#/Db`, `C♯ / D♭`, `Db`, `C#4`, etc.) to the canonical `NoteName` pitch class.
 */
export function normalizeToCanonicalPitchClass(
  input: string | NoteName | null | undefined
): NoteName | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (ENHARMONIC_PITCH_MAP[trimmed]) {
    return ENHARMONIC_PITCH_MAP[trimmed];
  }
  const withoutOctave = trimmed.replace(/[0-8]$/, '').trim();
  if (ENHARMONIC_PITCH_MAP[withoutOctave]) {
    return ENHARMONIC_PITCH_MAP[withoutOctave];
  }
  const ascii = withoutOctave
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/\s+/g, '');
  if (ENHARMONIC_PITCH_MAP[ascii]) {
    return ENHARMONIC_PITCH_MAP[ascii];
  }
  const upperFirst = ascii.charAt(0).toUpperCase() + ascii.slice(1);
  if (ENHARMONIC_PITCH_MAP[upperFirst]) {
    return ENHARMONIC_PITCH_MAP[upperFirst];
  }
  return null;
}

/**
 * Evaluates whether two note representations or UI labels refer to the same
 * canonical pitch class (`C#/Db` === `Db` === `C#`).
 */
export function isCanonicalPitchMatch(
  answer: string | NoteName | null | undefined,
  target: string | NoteName | null | undefined
): boolean {
  const normA = normalizeToCanonicalPitchClass(answer);
  const normB = normalizeToCanonicalPitchClass(target);
  return normA !== null && normA === normB;
}

/**
 * Evaluates whether an answer is correct for the specified skill.
 * - For intervalIdentify: exact interval ID equality ('P5' === 'P5', 'M3' !== 'm3').
 * - For intervalBuild: exact target key ID match (rootKey + interval target).
 * - For skills requiring exact octave: exact key ID match.
 * - For standard pitch-class skills: canonical enharmonic pitch class match.
 */
export function isSemanticAnswerCorrect(
  skill: Skill | undefined | null,
  answerNote: NoteName | string,
  targetNote: NoteName | string,
  answerKeyId?: string | null,
  targetKeyId?: string | null
): boolean {
  if (
    skill === 'intervalIdentify' ||
    skill === 'triadIdentify' ||
    skill === 'triadInversionIdentify'
  ) {
    return answerNote === targetNote;
  }
  if (skill === 'intervalBuild') {
    return Boolean(answerKeyId && targetKeyId && answerKeyId === targetKeyId);
  }
  if (
    skill === 'triadBuild' ||
    skill === 'triadInversionBuild' ||
    skill === 'chordSymbolRead'
  ) {
    // Single key answers cannot answer a multi-key chord question.
    // Multi-key chord submissions are evaluated via classifyTriadAnswer / classifyTriadInversionAnswer.
    return false;
  }
  const isExactKeySkill = skill ? getSkillInputPolicy(skill).requiresExactOctave : false;
  if (isExactKeySkill) {
    return Boolean(answerKeyId && targetKeyId && answerKeyId === targetKeyId);
  }
  return isCanonicalPitchMatch(answerNote, targetNote);
}

export interface IdentifyButtonLabelSpec {
  canonical: PitchClass;
  shortLabel: string;
  displayLabel: string;
  dualAsciiLabel: string;
  isAccidental: boolean;
}

export const IDENTIFY_ANSWER_LABELS: Readonly<Record<PitchClass, IdentifyButtonLabelSpec>> = {
  C: { canonical: 'C', shortLabel: 'C', displayLabel: 'C · До', dualAsciiLabel: 'C', isAccidental: false },
  D: { canonical: 'D', shortLabel: 'D', displayLabel: 'D · Ре', dualAsciiLabel: 'D', isAccidental: false },
  E: { canonical: 'E', shortLabel: 'E', displayLabel: 'E · Ми', dualAsciiLabel: 'E', isAccidental: false },
  F: { canonical: 'F', shortLabel: 'F', displayLabel: 'F · Фа', dualAsciiLabel: 'F', isAccidental: false },
  G: { canonical: 'G', shortLabel: 'G', displayLabel: 'G · Соль', dualAsciiLabel: 'G', isAccidental: false },
  A: { canonical: 'A', shortLabel: 'A', displayLabel: 'A · Ля', dualAsciiLabel: 'A', isAccidental: false },
  B: { canonical: 'B', shortLabel: 'B', displayLabel: 'B · Си', dualAsciiLabel: 'B', isAccidental: false },
  'C#': { canonical: 'C#', shortLabel: 'C#/Db', displayLabel: 'C♯ / D♭', dualAsciiLabel: 'C#/Db', isAccidental: true },
  'D#': { canonical: 'D#', shortLabel: 'D#/Eb', displayLabel: 'D♯ / E♭', dualAsciiLabel: 'D#/Eb', isAccidental: true },
  'F#': { canonical: 'F#', shortLabel: 'F#/Gb', displayLabel: 'F♯ / G♭', dualAsciiLabel: 'F#/Gb', isAccidental: true },
  'G#': { canonical: 'G#', shortLabel: 'G#/Ab', displayLabel: 'G♯ / A♭', dualAsciiLabel: 'G#/Ab', isAccidental: true },
  'A#': { canonical: 'A#', shortLabel: 'A#/Bb', displayLabel: 'A♯ / B♭', dualAsciiLabel: 'A#/Bb', isAccidental: true }
};

export function getIdentifyButtonLabel(
  noteOrLabel: string | NoteName
): IdentifyButtonLabelSpec {
  const canonical = (normalizeToCanonicalPitchClass(noteOrLabel) as PitchClass) ?? 'C';
  return IDENTIFY_ANSWER_LABELS[canonical] ?? IDENTIFY_ANSWER_LABELS['C'];
}

export function getIdentifyKeyboardHint(
  answerNotes: readonly (NoteName | string)[]
): string {
  const canonicals = answerNotes
    .map(n => normalizeToCanonicalPitchClass(n))
    .filter((n): n is NoteName => n !== null);
  const hasWhite = canonicals.some(n => !n.includes('#'));
  const hasBlack = canonicals.some(n => n.includes('#'));

  if (hasWhite && hasBlack) {
    return 'Белые: C–B / 1–7 · Чёрные: Shift + C/D/F/G/A';
  }
  if (!hasWhite && hasBlack) {
    return 'Чёрные: Shift + C/D/F/G/A (или Shift + 1/2/4/5/6)';
  }
  return 'Белые: C–B / 1–7';
}

export interface IdentifyAnswerSetOptions {
  currentCard?: { skill?: Skill; note?: NoteName | string } | null;
  activeCards?: readonly { skill?: Skill; note?: NoteName | string }[];
  answerPool?: readonly (NoteName | string)[];
  level?: 'white' | 'all';
}

export interface IdentifyAnswerSet {
  notes: NoteName[];
  whiteNotes: NoteName[];
  blackNotes: NoteName[];
  hasWhite: boolean;
  hasBlack: boolean;
  mode: 'white-only' | 'black-only' | 'mixed-chromatic';
  keyboardHint: string;
}

/**
 * Computes the context-aware answer button set and keyboard hint for `identify` tasks.
 * - White-only identify -> compact 7 white-key buttons (`C D E F G A B`).
 * - Black-only curriculum identify -> only the active black-key buttons (`C#/Db ...`).
 * - Mixed / scheduled chromatic identify -> 7 white + 5 black (`C#/Db D#/Eb F#/Gb G#/Ab A#/Bb`).
 */
export function getIdentifyAnswerSet(
  options: IdentifyAnswerSetOptions = {}
): IdentifyAnswerSet {
  if (options.answerPool && options.answerPool.length > 0) {
    const notes: NoteName[] = [];
    for (const raw of options.answerPool) {
      const c = normalizeToCanonicalPitchClass(raw);
      if (c && !notes.includes(c)) {
        notes.push(c);
      }
    }
    const whiteNotes = notes.filter(n => !n.includes('#'));
    const blackNotes = notes.filter(n => n.includes('#'));
    const hasWhite = whiteNotes.length > 0;
    const hasBlack = blackNotes.length > 0;
    const mode =
      hasWhite && hasBlack
        ? 'mixed-chromatic'
        : hasBlack
          ? 'black-only'
          : 'white-only';
    return {
      notes,
      whiteNotes,
      blackNotes,
      hasWhite,
      hasBlack,
      mode,
      keyboardHint: getIdentifyKeyboardHint(notes)
    };
  }

  const currentNote = normalizeToCanonicalPitchClass(options.currentCard?.note);
  const currentIsBlack = currentNote !== null && currentNote.includes('#');

  const activePoolHasBlack = Array.isArray(options.activeCards)
    ? options.activeCards.some(c => {
        if (c.skill && c.skill !== 'identify' && c.skill !== 'find') return false;
        const n = normalizeToCanonicalPitchClass(c.note);
        return n !== null && n.includes('#');
      })
    : false;

  const includeBlack =
    currentIsBlack ||
    (options.level !== 'white' &&
      (activePoolHasBlack ||
        (!options.activeCards && options.level === 'all')));

  const whiteNotes = [...WHITE_NATURAL_NOTES];
  const blackNotes = includeBlack ? [...BLACK_ACCIDENTAL_NOTES] : [];
  const notes = [...whiteNotes, ...blackNotes];

  return {
    notes,
    whiteNotes,
    blackNotes,
    hasWhite: true,
    hasBlack: includeBlack,
    mode: includeBlack ? 'mixed-chromatic' : 'white-only',
    keyboardHint: getIdentifyKeyboardHint(notes)
  };
}

export function getIdentifyAnswerNotes(
  options: IdentifyAnswerSetOptions = {}
): NoteName[] {
  return getIdentifyAnswerSet(options).notes;
}

export interface SemanticNoteAnswer {
  answerNote: NoteName;
  answerKeyId: undefined;
}

/**
 * Resolves a named-note input (from PC keyboard shortcut or on-screen answer button)
 * into a canonical semantic pitch-class answer without generating or inferring an octave/keyId.
 * Supports enharmonic labels (`C#/Db`, `Db`, `C♯ / D♭`, etc.).
 * Returns null if the skill does not permit the specified input channel.
 */
export function resolveSemanticNoteAnswer(
  skill: Skill | null | undefined,
  channel: 'pcNote' | 'answerButton',
  note: NoteName | string
): SemanticNoteAnswer | null {
  if (!canUseInputForSkill(skill, channel)) return null;
  if (skill === 'intervalIdentify') {
    if (['P8', 'P5', 'M3', 'm3'].includes(note as any)) {
      return {
        answerNote: note as NoteName,
        answerKeyId: undefined
      };
    }
    return null;
  }
  if (skill === 'triadIdentify') {
    if (['major', 'minor'].includes(note as any)) {
      return {
        answerNote: note as NoteName,
        answerKeyId: undefined
      };
    }
    return null;
  }
  const canonical = normalizeToCanonicalPitchClass(note);
  if (!canonical) return null;
  return {
    answerNote: canonical,
    answerKeyId: undefined
  };
}

/**
 * Resolves a PC KeyboardEvent into a semantic pitch-class answer for the given skill,
 * without generating or inferring an octave/keyId.
 */
export function resolvePcKeyboardSemanticAnswer(
  skill: Skill | null | undefined,
  e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'> &
    Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>>
): SemanticNoteAnswer | null {
  if (skill === 'intervalIdentify') {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
    const digitIntervalMap: Record<string, NoteName> = {
      Digit1: 'P8',
      Digit2: 'P5',
      Digit3: 'M3',
      Digit4: 'm3',
      Numpad1: 'P8',
      Numpad2: 'P5',
      Numpad3: 'M3',
      Numpad4: 'm3'
    };
    const keyIntervalMap: Record<string, NoteName> = {
      '1': 'P8',
      '2': 'P5',
      '3': 'M3',
      '4': 'm3'
    };
    const match = digitIntervalMap[e.code] || keyIntervalMap[e.key];
    if (match) {
      return {
        answerNote: match,
        answerKeyId: undefined
      };
    }
    return null;
  }

  if (skill === 'triadIdentify') {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
    const digitTriadMap: Record<string, NoteName> = {
      Digit1: 'major',
      Digit2: 'minor',
      Numpad1: 'major',
      Numpad2: 'minor'
    };
    const keyTriadMap: Record<string, NoteName> = {
      '1': 'major',
      '2': 'minor'
    };
    const match = digitTriadMap[e.code] || keyTriadMap[e.key];
    if (match) {
      return {
        answerNote: match,
        answerKeyId: undefined
      };
    }
    return null;
  }

  if (!canUseInputForSkill(skill, 'pcNote')) return null;

  const resolved = resolveNoteFromKeyboard(e);
  if (!resolved) return null;
  return {
    answerNote: resolved.note,
    answerKeyId: undefined
  };
}

