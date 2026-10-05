import { DISPLAY_NAMES } from '../fsrs/constants';
import type { NoteName } from '../fsrs/types';

export type WhiteKeyNote = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type CurriculumAcquisitionNote = 'D' | 'E' | 'B' | 'G' | 'A';

export type WhiteKeyFamilyId = 'twoBlack' | 'threeBlack' | 'allWhite';

export type CurriculumIdentifyStageId =
  | 'cdeIdentify'
  | 'fbIdentify'
  | 'fgabIdentify'
  | 'allWhiteIdentify';

/**
 * Deterministic Milestone 3C note-acquisition order after C/F anchors:
 * D -> E (completes 2-black family C/D/E)
 * -> B (right boundary of 3-black group)
 * -> G -> A (interior of 3-black group, completing F/G/A/B and all 7 white keys).
 */
export const CURRICULUM_ACQUISITION_ORDER: readonly CurriculumAcquisitionNote[] =
  ['D', 'E', 'B', 'G', 'A'] as const;

export const ALL_WHITE_CURRICULUM_NOTES: readonly WhiteKeyNote[] = [
  'C',
  'D',
  'E',
  'F',
  'G',
  'A',
  'B'
] as const;

export const TWO_BLACK_FAMILY_NOTES: readonly WhiteKeyNote[] = [
  'C',
  'D',
  'E'
] as const;

export const THREE_BLACK_FAMILY_NOTES: readonly WhiteKeyNote[] = [
  'F',
  'G',
  'A',
  'B'
] as const;

/**
 * Complete octaves on the 4-octave keyboard (C2–C6) that have full left/right
 * black-key group geometry. Right-edge C6 is intentionally excluded because
 * C#6/D#6 are not visible on a C2–C6 keyboard.
 */
export const KEYBOARD_ACTIVE_OCTAVES = [2, 3, 4, 5] as const;
export type ActiveKeyboardOctave = (typeof KEYBOARD_ACTIVE_OCTAVES)[number];

/**
 * Configurable product-hypothesis thresholds for Milestone 3C curriculum gates.
 * Tests and runtime orchestration read from this configuration rather than
 * scattering magic numbers across UI components.
 */
export interface WhiteKeyCurriculumConfig {
  guidedSuccessTarget: number;
  qualifySuccessTarget: number;
  localMixSuccessTarget: number;
  familyMixTarget: number;
  allWhiteMixTarget: number;
  delayedRetrySpacing: number;
}

// HYPOTHESIS defaults; product hypotheses tunable via retention telemetry
export const DEFAULT_WHITE_KEY_CURRICULUM_CONFIG: WhiteKeyCurriculumConfig = {
  guidedSuccessTarget: 2,
  qualifySuccessTarget: 2,
  localMixSuccessTarget: 4,
  familyMixTarget: 5,
  allWhiteMixTarget: 7,
  delayedRetrySpacing: 1
};

export type WhiteKeyPositionKind =
  | 'left_of_two_black'
  | 'between_two_black'
  | 'right_of_two_black'
  | 'left_of_three_black'
  | 'first_inside_three_black'
  | 'second_inside_three_black'
  | 'right_of_three_black';

export interface WhiteKeyGeometrySpec {
  note: WhiteKeyNote;
  phase: 1 | 2 | 3;
  family: 'twoBlack' | 'threeBlack';
  blackGroupSize: 2 | 3;
  /** 0-based index of the white key within its mini-group (0..2 for 2-black, 0..3 for 3-black) */
  whiteIndexInGroup: 0 | 1 | 2 | 3;
  positionKind: WhiteKeyPositionKind;
  transitionLead: string | null;
  modelTitle: string;
  modelTitleHtml: string;
  modelBody: string;
  modelPrompt: string;
  guidedTitleHtml: string;
  guidedBody: string;
  guidedPrompt: string;
  qualifyTitleHtml: string;
  qualifyBody: string;
  qualifyPrompt: string;
  diagramGroupTitle: string;
  diagramCaption: string;
  remediationHint: string;
  landmarkKeyIds: readonly string[];
  allStructuralBlackKeyIds: readonly string[];
}

const ALL_TWO_BLACK_KEY_IDS = [
  'C#2',
  'D#2',
  'C#3',
  'D#3',
  'C#4',
  'D#4',
  'C#5',
  'D#5'
] as const;

const ALL_THREE_BLACK_KEY_IDS = [
  'F#2',
  'G#2',
  'A#2',
  'F#3',
  'G#3',
  'A#3',
  'F#4',
  'G#4',
  'A#4',
  'F#5',
  'G#5',
  'A#5'
] as const;

export const WHITE_KEY_GEOMETRY: Readonly<
  Record<WhiteKeyNote, WhiteKeyGeometrySpec>
> = {
  C: {
    note: 'C',
    phase: 1,
    family: 'twoBlack',
    blackGroupSize: 2,
    whiteIndexInGroup: 0,
    positionKind: 'left_of_two_black',
    transitionLead: null,
    modelTitle: 'Ориентир: <span class="note">C · До</span>',
    modelTitleHtml: 'Ориентир: <span class="note">C · До</span>',
    modelBody:
      'C находится сразу слева от группы из 2 чёрных клавиш. Нажмите любую подсвеченную C на пианино.',
    modelPrompt:
      'C находится сразу слева от группы из двух чёрных клавиш. Нажмите любую подсвеченную C на пианино.',
    guidedTitleHtml: 'Найдите <span class="note">C</span> рядом с парой чёрных.',
    guidedBody:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.',
    guidedPrompt:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.',
    qualifyTitleHtml:
      'Найдите <span class="note">C</span> в другой части клавиатуры.',
    qualifyBody:
      'Подсказки убраны: найдите любую группу из 2 чёрных клавиш и нажмите белую клавишу сразу слева.',
    qualifyPrompt:
      'Подсказки убраны: найдите любую группу из 2 чёрных клавиш и нажмите белую клавишу сразу слева.',
    diagramGroupTitle: 'Группа из 2 чёрных',
    diagramCaption: '← слева от 2 чёрных',
    remediationHint:
      'Подсказка: найдите подсвеченную пару из 2 чёрных клавиш — C находится сразу слева.',
    landmarkKeyIds: ['C2', 'C3', 'C4', 'C5'],
    allStructuralBlackKeyIds: ALL_TWO_BLACK_KEY_IDS
  },
  D: {
    note: 'D',
    phase: 2,
    family: 'twoBlack',
    blackGroupSize: 2,
    whiteIndexInGroup: 1,
    positionKind: 'between_two_black',
    transitionLead:
      'C и F освоены. Теперь заполним пространство между двумя чёрными клавишами.',
    modelTitle: 'Новая клавиша: <span class="note">D · Ре</span>',
    modelTitleHtml: 'Новая клавиша: <span class="note">D · Ре</span>',
    modelBody:
      'D находится между 2 чёрными клавишами. Нажмите любую подсвеченную D на пианино ниже.',
    modelPrompt:
      'D находится между двумя чёрными клавишами. Нажмите любую подсвеченную D на пианино ниже.',
    guidedTitleHtml: 'Найдите <span class="note">D</span> по паре чёрных клавиш.',
    guidedBody:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу прямо между ними.',
    guidedPrompt:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу прямо между ними.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">D</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите любую пару из 2 чёрных клавиш и нажмите белую клавишу между ними в разных частях клавиатуры.',
    qualifyPrompt:
      'Подсказки убраны: найдите любую пару из 2 чёрных клавиш и нажмите белую клавишу между ними в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 2 чёрных',
    diagramCaption: 'между 2 чёрными',
    remediationHint:
      'Подсказка: посмотрите на подсвеченную пару из 2 чёрных клавиш — D находится прямо между ними.',
    landmarkKeyIds: ['D2', 'D3', 'D4', 'D5'],
    allStructuralBlackKeyIds: ALL_TWO_BLACK_KEY_IDS
  },
  E: {
    note: 'E',
    phase: 2,
    family: 'twoBlack',
    blackGroupSize: 2,
    whiteIndexInGroup: 2,
    positionKind: 'right_of_two_black',
    transitionLead:
      'C и D уже знакомы. Завершим семейство вокруг двух чёрных клавиш.',
    modelTitle: 'Новая клавиша: <span class="note">E · Ми</span>',
    modelTitleHtml: 'Новая клавиша: <span class="note">E · Ми</span>',
    modelBody:
      'E находится сразу справа от группы из 2 чёрных клавиш. Нажмите любую подсвеченную E на пианино ниже.',
    modelPrompt:
      'E находится сразу справа от группы из двух чёрных клавиш. Нажмите любую подсвеченную E на пианино ниже.',
    guidedTitleHtml: 'Найдите <span class="note">E</span> по паре чёрных клавиш.',
    guidedBody:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу сразу справа от неё.',
    guidedPrompt:
      'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу сразу справа от неё.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">E</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите любую пару из 2 чёрных клавиш и нажмите белую клавишу сразу справа в разных частях клавиатуры.',
    qualifyPrompt:
      'Подсказки убраны: найдите любую пару из 2 чёрных клавиш и нажмите белую клавишу сразу справа в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 2 чёрных',
    diagramCaption: 'справа от 2 чёрных →',
    remediationHint:
      'Подсказка: посмотрите на подсвеченную пару из 2 чёрных клавиш — E находится сразу справа от неё.',
    landmarkKeyIds: ['E2', 'E3', 'E4', 'E5'],
    allStructuralBlackKeyIds: ALL_TWO_BLACK_KEY_IDS
  },
  F: {
    note: 'F',
    phase: 1,
    family: 'threeBlack',
    blackGroupSize: 3,
    whiteIndexInGroup: 0,
    positionKind: 'left_of_three_black',
    transitionLead: null,
    modelTitle: 'Ориентир: <span class="note">F · Фа</span>',
    modelTitleHtml: 'Ориентир: <span class="note">F · Фа</span>',
    modelBody:
      'F находится сразу слева от группы из 3 чёрных клавиш. Нажмите любую подсвеченную F на пианино.',
    modelPrompt:
      'F находится сразу слева от группы из трёх чёрных клавиш. Нажмите любую подсвеченную F на пианино.',
    guidedTitleHtml:
      'Найдите <span class="note">F</span> рядом с тройкой чёрных.',
    guidedBody:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.',
    guidedPrompt:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.',
    qualifyTitleHtml:
      'Найдите <span class="note">F</span> в другой части клавиатуры.',
    qualifyBody:
      'Подсказки убраны: найдите любую группу из 3 чёрных клавиш и нажмите белую клавишу сразу слева.',
    qualifyPrompt:
      'Подсказки убраны: найдите любую группу из 3 чёрных клавиш и нажмите белую клавишу сразу слева.',
    diagramGroupTitle: 'Группа из 3 чёрных',
    diagramCaption: '← слева от 3 чёрных',
    remediationHint:
      'Подсказка: найдите подсвеченную группу из 3 чёрных клавиш — F находится сразу слева.',
    landmarkKeyIds: ['F2', 'F3', 'F4', 'F5'],
    allStructuralBlackKeyIds: ALL_THREE_BLACK_KEY_IDS
  },
  B: {
    note: 'B',
    phase: 2,
    family: 'threeBlack',
    blackGroupSize: 3,
    whiteIndexInGroup: 3,
    positionKind: 'right_of_three_black',
    transitionLead:
      'Семейство двух чёрных (C, D, E) готово. Теперь найдём правую границу группы из трёх чёрных.',
    modelTitle: 'Новая клавиша: <span class="note">B · Си</span>',
    modelTitleHtml: 'Новая клавиша: <span class="note">B · Си</span>',
    modelBody:
      'B находится сразу справа от группы из 3 чёрных клавиш. Нажмите любую подсвеченную B на пианино ниже.',
    modelPrompt:
      'B находится сразу справа от группы из трёх чёрных клавиш. Нажмите любую подсвеченную B на пианино ниже.',
    guidedTitleHtml:
      'Найдите <span class="note">B</span> по тройке чёрных клавиш.',
    guidedBody:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите белую клавишу сразу справа от неё.',
    guidedPrompt:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите белую клавишу сразу справа от неё.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">B</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите любую группу из 3 чёрных клавиш и нажмите белую клавишу сразу справа в разных частях клавиатуры.',
    qualifyPrompt:
      'Подсказки убраны: найдите любую группу из 3 чёрных клавиш и нажмите белую клавишу сразу справа в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных',
    diagramCaption: 'справа от 3 чёрных →',
    remediationHint:
      'Подсказка: посмотрите на подсвеченную группу из 3 чёрных клавиш — B находится сразу справа от неё.',
    landmarkKeyIds: ['B2', 'B3', 'B4', 'B5'],
    allStructuralBlackKeyIds: ALL_THREE_BLACK_KEY_IDS
  },
  G: {
    note: 'G',
    phase: 3,
    family: 'threeBlack',
    blackGroupSize: 3,
    whiteIndexInGroup: 1,
    positionKind: 'first_inside_three_black',
    transitionLead:
      'Границы F и B вокруг трёх чёрных освоены. Теперь разберём две белые клавиши внутри группы из трёх чёрных.',
    modelTitle: 'Новая клавиша: <span class="note">G · Соль</span>',
    modelTitleHtml: 'Новая клавиша: <span class="note">G · Соль</span>',
    modelBody:
      'G — первая белая клавиша внутри группы из 3 чёрных (между 1-й и 2-й чёрными). Нажмите любую подсвеченную G на пианино.',
    modelPrompt:
      'G — первая белая клавиша внутри группы из трёх чёрных (между 1-й и 2-й чёрными). Нажмите любую подсвеченную G на пианино.',
    guidedTitleHtml:
      'Найдите <span class="note">G</span> внутри группы из трёх чёрных.',
    guidedBody:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите первую белую клавишу внутри неё (между 1-й и 2-й чёрными).',
    guidedPrompt:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите первую белую клавишу внутри неё (между 1-й и 2-й чёрными).',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">G</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите первую внутреннюю белую клавишу G в разных частях клавиатуры.',
    qualifyPrompt:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите первую внутреннюю белую клавишу G в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных',
    diagramCaption: '1-я внутри 3 чёрных',
    remediationHint:
      'Подсказка: в подсвеченной группе из 3 чёрных клавиш G — первая внутренняя белая (между 1-й и 2-й чёрными, сразу справа от F).',
    landmarkKeyIds: ['G2', 'G3', 'G4', 'G5'],
    allStructuralBlackKeyIds: ALL_THREE_BLACK_KEY_IDS
  },
  A: {
    note: 'A',
    phase: 3,
    family: 'threeBlack',
    blackGroupSize: 3,
    whiteIndexInGroup: 2,
    positionKind: 'second_inside_three_black',
    transitionLead:
      'Осталась последняя белая клавиша внутри группы из трёх чёрных — A.',
    modelTitle: 'Новая клавиша: <span class="note">A · Ля</span>',
    modelTitleHtml: 'Новая клавиша: <span class="note">A · Ля</span>',
    modelBody:
      'A — вторая белая клавиша внутри группы из 3 чёрных (между 2-й и 3-й чёрными). Нажмите любую подсвеченную A на пианино.',
    modelPrompt:
      'A — вторая белая клавиша внутри группы из трёх чёрных (между 2-й и 3-й чёрными). Нажмите любую подсвеченную A на пианино.',
    guidedTitleHtml:
      'Найдите <span class="note">A</span> внутри группы из трёх чёрных.',
    guidedBody:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите вторую белую клавишу внутри неё (между 2-й и 3-й чёрными).',
    guidedPrompt:
      'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите вторую белую клавишу внутри неё (между 2-й и 3-й чёрными).',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">A</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите вторую внутреннюю белую клавишу A в разных частях клавиатуры.',
    qualifyPrompt:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите вторую внутреннюю белую клавишу A в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных',
    diagramCaption: '2-я внутри 3 чёрных',
    remediationHint:
      'Подсказка: в подсвеченной группе из 3 чёрных клавиш A — вторая внутренняя белая (между 2-й и 3-й чёрными, сразу слева от B).',
    landmarkKeyIds: ['A2', 'A3', 'A4', 'A5'],
    allStructuralBlackKeyIds: ALL_THREE_BLACK_KEY_IDS
  }
};

/**
 * Returns the black-key structural landmark IDs for a given group size (2 or 3)
 * and octave (2..5).
 */
export function getBlackGroupKeyIdsForOctave(
  groupSize: 2 | 3,
  octave: ActiveKeyboardOctave = 4
): string[] {
  if (groupSize === 2) {
    return [`C#${octave}`, `D#${octave}`];
  }
  return [`F#${octave}`, `G#${octave}`, `A#${octave}`];
}

/**
 * Returns the H2 structural black-key guide IDs for a target white key in a specific octave.
 * Never includes or reveals the target white key itself.
 */
export function getStructuralGuideForWhiteNote(
  note: WhiteKeyNote,
  octave: ActiveKeyboardOctave = 4
): string[] {
  const spec = WHITE_KEY_GEOMETRY[note];
  return getBlackGroupKeyIdsForOctave(spec.blackGroupSize, octave);
}

/**
 * Deterministic octave rotation across the 4 complete octaves (C2–B5) so guided
 * and identify prompts naturally span multiple keyboard regions.
 */
const OCTAVE_ROTATION: readonly ActiveKeyboardOctave[] = [4, 3, 5, 2] as const;

export function getDeterministicOctaveForTrial(
  seedIndex: number
): ActiveKeyboardOctave {
  const normalized = Math.abs(Math.trunc(seedIndex)) % OCTAVE_ROTATION.length;
  return OCTAVE_ROTATION[normalized];
}

export function getDeterministicKeyIdForWhiteNote(
  note: WhiteKeyNote,
  trialIndex: number
): string {
  const offset = ALL_WHITE_CURRICULUM_NOTES.indexOf(note);
  const octave = getDeterministicOctaveForTrial(trialIndex + Math.max(0, offset));
  return `${note}${octave}`;
}

/**
 * Validates that a pressed key / region context belongs to one of the 4 complete
 * octaves (`C2–B5`) and is NOT the right-edge `C6` where right-side black keys are absent.
 */
export function isValidWhiteKeyRegionContext(regionCtx: string): boolean {
  if (!regionCtx || regionCtx === 'region-C6' || regionCtx.endsWith('6')) {
    return false;
  }
  return /^region-[A-G][2-5]$/.test(regionCtx);
}

/**
 * Returns the canonical local interleaving pool after each newly qualified white note
 * (Section 12 of Milestone 3C spec):
 * - After D: C, D (+ F landmark)
 * - After E: C, D, E (2-black family mix)
 * - After B: F, B (+ already learned C, E)
 * - After G: F, G, B
 * - After A: F, G, A, B (3-black family mix)
 */
export function getLocalMixPool(
  note: CurriculumAcquisitionNote
): readonly WhiteKeyNote[] {
  switch (note) {
    case 'D':
      return ['C', 'D', 'F'];
    case 'E':
      return ['C', 'D', 'E'];
    case 'B':
      return ['F', 'B', 'C', 'E'];
    case 'G':
      return ['F', 'G', 'B'];
    case 'A':
      return ['F', 'G', 'A', 'B'];
  }
}

/**
 * Returns the canonical family mix pool (Section 13 & 15):
 * - 'twoBlack': C / D / E
 * - 'threeBlack': F / G / A / B
 * - 'allWhite': C / D / E / F / G / A / B
 */
export function getFamilyMixPool(
  family: WhiteKeyFamilyId
): readonly WhiteKeyNote[] {
  switch (family) {
    case 'twoBlack':
      return TWO_BLACK_FAMILY_NOTES;
    case 'threeBlack':
      return THREE_BLACK_FAMILY_NOTES;
    case 'allWhite':
      return ALL_WHITE_CURRICULUM_NOTES;
  }
}

/**
 * Returns the canonical inverse identification (`identify`) pool for each mixed identify stage
 * (Section 16):
 * - 'cdeIdentify': C / D / E
 * - 'fbIdentify': F / B
 * - 'fgabIdentify': F / G / A / B
 * - 'allWhiteIdentify': C / D / E / F / G / A / B
 */
export function getIdentifyPoolForStage(
  stage: CurriculumIdentifyStageId
): readonly WhiteKeyNote[] {
  switch (stage) {
    case 'cdeIdentify':
      return ['C', 'D', 'E'];
    case 'fbIdentify':
      return ['F', 'B'];
    case 'fgabIdentify':
      return ['F', 'G', 'A', 'B'];
    case 'allWhiteIdentify':
      return ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  }
}

/**
 * Builds the deterministic initial local mix queue for a newly qualified note.
 * Ensures the newly acquired note appears multiple times and is interleaved with
 * landmarks without 3-in-a-row runs.
 */
export function buildInitialLocalMixQueue(
  note: CurriculumAcquisitionNote
): WhiteKeyNote[] {
  switch (note) {
    case 'D':
      return ['D', 'C', 'D', 'F'];
    case 'E':
      return ['E', 'C', 'D', 'E', 'D'];
    case 'B':
      return ['B', 'F', 'B', 'C'];
    case 'G':
      return ['G', 'F', 'B', 'G'];
    case 'A':
      return ['A', 'G', 'F', 'B', 'A'];
  }
}

/**
 * Builds the deterministic initial queue for the final all-white spatial `find` mix
 * (`C D E F G A B`), alternating across 2-black and 3-black families so the learner
 * cannot rely on scale-order clicking.
 */
export function buildInitialAllWhiteMixQueue(): WhiteKeyNote[] {
  return ['D', 'G', 'C', 'A', 'E', 'F', 'B'];
}

/**
 * Builds the deterministic initial queue for each mixed `identify` stage.
 */
export function buildInitialIdentifyQueue(
  stage: CurriculumIdentifyStageId
): WhiteKeyNote[] {
  switch (stage) {
    case 'cdeIdentify':
      return ['D', 'C', 'E'];
    case 'fbIdentify':
      return ['B', 'F'];
    case 'fgabIdentify':
      return ['G', 'B', 'A', 'F'];
    case 'allWhiteIdentify':
      return ['D', 'A', 'C', 'G', 'E', 'B', 'F'];
  }
}

/**
 * Schedules a missed note in a multi-note mix queue to reappear after at least one
 * intervening different note from the pool, while preventing 3 identical notes in a row.
 */
export function scheduleMissedWhiteMixNote(
  remainingQueue: readonly WhiteKeyNote[],
  missedNote: WhiteKeyNote,
  pool: readonly WhiteKeyNote[]
): WhiteKeyNote[] {
  const alternatives = pool.filter(n => n !== missedNote);
  const contrastNote: WhiteKeyNote = alternatives[0] ?? missedNote;
  const next = [...remainingQueue];

  if (next.length === 0) {
    return contrastNote !== missedNote ? [contrastNote, missedNote] : [missedNote];
  }

  if (next[0] === missedNote && contrastNote !== missedNote) {
    next.unshift(contrastNote);
  }

  if (next[1] !== missedNote) {
    next.splice(1, 0, missedNote);
  }

  const sanitized: WhiteKeyNote[] = [];
  for (const item of next) {
    const len = sanitized.length;
    if (len >= 2 && sanitized[len - 1] === item && sanitized[len - 2] === item) {
      const filler = alternatives.find(n => n !== item) ?? item;
      if (filler !== item) {
        sanitized.push(filler);
      }
    }
    sanitized.push(item);
  }
  return sanitized;
}

/**
 * Produces clear, human-readable geometric feedback when the user presses or selects
 * the wrong note during acquisition, mixed retrieval, or delayed check.
 */
export function buildWhiteKeyContrastFeedback(
  expected: WhiteKeyNote,
  pressed: NoteName
): string {
  const expectedSpec = WHITE_KEY_GEOMETRY[expected];
  const pressedLabel = DISPLAY_NAMES[pressed] ?? pressed;

  if (expected === 'D' && pressed === 'E') {
    return 'Это E (справа от пары чёрных). D находится прямо между двумя чёрными клавишами.';
  }
  if (expected === 'E' && pressed === 'D') {
    return 'Это D (между двумя чёрными). E находится сразу справа от пары чёрных клавиш.';
  }
  if (expected === 'G' && pressed === 'A') {
    return 'Это A (вторая белая внутри тройки чёрных). G — первая белая внутри группы из трёх чёрных.';
  }
  if (expected === 'A' && pressed === 'G') {
    return 'Это G (первая белая внутри тройки чёрных). A — вторая белая внутри группы из трёх чёрных.';
  }
  if (expected === 'B' && pressed === 'E') {
    return 'Это E (справа от 2 чёрных). Для B найдите группу из 3 чёрных клавиш — белая сразу справа.';
  }
  if (expected === 'E' && pressed === 'B') {
    return 'Это B (справа от 3 чёрных). Для E найдите группу из 2 чёрных клавиш — белая сразу справа.';
  }

  return `Это ${pressedLabel}. ${expectedSpec.remediationHint.replace(/^Подсказка:\s*/, '')}`;
}

/**
 * Verifies that a white-key mix sequence does not contain 3 identical notes in a row.
 */
export function isConstrainedWhiteMixSequence(
  seq: readonly WhiteKeyNote[]
): boolean {
  for (let i = 2; i < seq.length; i++) {
    if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2]) {
      return false;
    }
  }
  return true;
}

