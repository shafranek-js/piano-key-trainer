import { DISPLAY_NAMES } from '../fsrs/constants';
import {
  submitQuestionAttempt,
  type QuestionRoundState,
  type SubmitQuestionAttemptResult
} from '../fsrs/reviewLog';
import type {
  Card,
  NoteName,
  ReviewLogEvent,
  Skill,
  UserSettings
} from '../fsrs/types';
import {
  canUseInputForSkill,
  type InputChannel
} from '../input/inputPolicy';
import {
  appendUniqueContext,
  createInitialLearningProgress,
  markFsrsActivated,
  markMixReady,
  recordGuidedAttempt,
  recordIndependentAttempt,
  recordModelCompleted
} from './progress';
import { createTrialContext } from './trialPolicy';
import {
  HINT_LEVEL,
  type HintLevel,
  type LearningProgressRecord,
  type TrialContext,
  type TrialInputMethod
} from './types';
import {
  ALL_WHITE_CURRICULUM_NOTES,
  type ActiveKeyboardOctave,
  type WhiteKeyNote
} from './whiteKeys';
import {
  isWhiteKeyCurriculumCompleted,
  type ProgressCollectionInput
} from './curriculumFlow';

export type BlackKeyNote = 'C#' | 'D#' | 'F#' | 'G#' | 'A#';

export const BLACK_KEY_ACQUISITION_ORDER: readonly BlackKeyNote[] = [
  'C#',
  'D#',
  'F#',
  'G#',
  'A#'
] as const;

export const TWO_BLACK_GROUP_BLACK_NOTES: readonly BlackKeyNote[] = [
  'C#',
  'D#'
] as const;

export const THREE_BLACK_GROUP_BLACK_NOTES: readonly BlackKeyNote[] = [
  'F#',
  'G#',
  'A#'
] as const;

export type BlackKeyIdentifyStageId =
  | 'twoBlackIdentify'
  | 'threeBlackIdentify'
  | 'allBlackIdentify';

export type Milestone3dStep =
  // Phase 4 — Black Keys (2-black group: C#, D#; 3-black group: F#, G#, A#)
  | 'csModel'
  | 'csGuided'
  | 'csQualify'
  | 'csLocalMix'
  | 'csDelayedCheck'
  | 'dsModel'
  | 'dsGuided'
  | 'dsQualify'
  | 'dsLocalMix'
  | 'dsDelayedCheck'
  | 'twoBlackIdentify'
  | 'fsModel'
  | 'fsGuided'
  | 'fsQualify'
  | 'fsLocalMix'
  | 'fsDelayedCheck'
  | 'gsModel'
  | 'gsGuided'
  | 'gsQualify'
  | 'gsLocalMix'
  | 'gsDelayedCheck'
  | 'asModel'
  | 'asGuided'
  | 'asQualify'
  | 'asLocalMix'
  | 'asDelayedCheck'
  | 'threeBlackIdentify'
  | 'allBlackMix'
  | 'allBlackIdentify'
  | 'phase4Complete'
  // Phase 5 — Staff Notation per-note (Treble C4–B4 with exact octave 4)
  | 'notationCModel'
  | 'notationCQualify'
  | 'notationCLocalMix'
  | 'notationCDelayedCheck'
  | 'notationFModel'
  | 'notationFQualify'
  | 'notationFLocalMix'
  | 'notationFDelayedCheck'
  | 'notationGModel'
  | 'notationGQualify'
  | 'notationGLocalMix'
  | 'notationGDelayedCheck'
  | 'notationDModel'
  | 'notationDQualify'
  | 'notationDLocalMix'
  | 'notationDDelayedCheck'
  | 'notationEModel'
  | 'notationEQualify'
  | 'notationELocalMix'
  | 'notationEDelayedCheck'
  | 'notationAModel'
  | 'notationAQualify'
  | 'notationALocalMix'
  | 'notationADelayedCheck'
  | 'notationBModel'
  | 'notationBQualify'
  | 'notationBLocalMix'
  | 'notationBDelayedCheck'
  | 'phase5Complete'
  // Phase 6 — Relative Ear / Sound per-note (C4 -> target in octave 4)
  | 'earCModel'
  | 'earCQualify'
  | 'earCLocalMix'
  | 'earCDelayedCheck'
  | 'earDModel'
  | 'earDQualify'
  | 'earDLocalMix'
  | 'earDDelayedCheck'
  | 'earEModel'
  | 'earEQualify'
  | 'earELocalMix'
  | 'earEDelayedCheck'
  | 'earFModel'
  | 'earFQualify'
  | 'earFLocalMix'
  | 'earFDelayedCheck'
  | 'earGModel'
  | 'earGQualify'
  | 'earGLocalMix'
  | 'earGDelayedCheck'
  | 'earAModel'
  | 'earAQualify'
  | 'earALocalMix'
  | 'earADelayedCheck'
  | 'earBModel'
  | 'earBQualify'
  | 'earBLocalMix'
  | 'earBDelayedCheck'
  | 'phase6Complete';

export const MILESTONE_3D_STEPS: readonly Milestone3dStep[] = [
  'csModel',
  'csGuided',
  'csQualify',
  'csLocalMix',
  'csDelayedCheck',
  'dsModel',
  'dsGuided',
  'dsQualify',
  'dsLocalMix',
  'dsDelayedCheck',
  'twoBlackIdentify',
  'fsModel',
  'fsGuided',
  'fsQualify',
  'fsLocalMix',
  'fsDelayedCheck',
  'gsModel',
  'gsGuided',
  'gsQualify',
  'gsLocalMix',
  'gsDelayedCheck',
  'asModel',
  'asGuided',
  'asQualify',
  'asLocalMix',
  'asDelayedCheck',
  'threeBlackIdentify',
  'allBlackMix',
  'allBlackIdentify',
  'phase4Complete',
  'notationCModel',
  'notationCQualify',
  'notationCLocalMix',
  'notationCDelayedCheck',
  'notationFModel',
  'notationFQualify',
  'notationFLocalMix',
  'notationFDelayedCheck',
  'notationGModel',
  'notationGQualify',
  'notationGLocalMix',
  'notationGDelayedCheck',
  'notationDModel',
  'notationDQualify',
  'notationDLocalMix',
  'notationDDelayedCheck',
  'notationEModel',
  'notationEQualify',
  'notationELocalMix',
  'notationEDelayedCheck',
  'notationAModel',
  'notationAQualify',
  'notationALocalMix',
  'notationADelayedCheck',
  'notationBModel',
  'notationBQualify',
  'notationBLocalMix',
  'notationBDelayedCheck',
  'phase5Complete',
  'earCModel',
  'earCQualify',
  'earCLocalMix',
  'earCDelayedCheck',
  'earDModel',
  'earDQualify',
  'earDLocalMix',
  'earDDelayedCheck',
  'earEModel',
  'earEQualify',
  'earELocalMix',
  'earEDelayedCheck',
  'earFModel',
  'earFQualify',
  'earFLocalMix',
  'earFDelayedCheck',
  'earGModel',
  'earGQualify',
  'earGLocalMix',
  'earGDelayedCheck',
  'earAModel',
  'earAQualify',
  'earALocalMix',
  'earADelayedCheck',
  'earBModel',
  'earBQualify',
  'earBLocalMix',
  'earBDelayedCheck',
  'phase6Complete'
] as const;

export const MILESTONE_3D_ITEM_IDS = {
  NOTE_CS: 'curriculum-note:C#',
  NOTE_DS: 'curriculum-note:D#',
  NOTE_FS: 'curriculum-note:F#',
  NOTE_GS: 'curriculum-note:G#',
  NOTE_AS: 'curriculum-note:A#',
  MIX_CS: 'curriculum-mix:C#',
  MIX_DS: 'curriculum-mix:D#',
  MIX_FS: 'curriculum-mix:F#',
  MIX_GS: 'curriculum-mix:G#',
  MIX_AS: 'curriculum-mix:A#',
  IDENTIFY_TWO_BLACK: 'curriculum-identify:TWO_BLACK',
  IDENTIFY_THREE_BLACK: 'curriculum-identify:THREE_BLACK',
  MIX_ALL_BLACK: 'curriculum-mix:ALL_BLACK',
  IDENTIFY_ALL_BLACK: 'curriculum-identify:ALL_BLACK',
  PHASE4_COMPLETE: 'curriculum-phase4:complete',
  NOTATION_NOTE_C: 'curriculum-notation-note:C',
  NOTATION_NOTE_F: 'curriculum-notation-note:F',
  NOTATION_NOTE_G: 'curriculum-notation-note:G',
  NOTATION_NOTE_D: 'curriculum-notation-note:D',
  NOTATION_NOTE_E: 'curriculum-notation-note:E',
  NOTATION_NOTE_A: 'curriculum-notation-note:A',
  NOTATION_NOTE_B: 'curriculum-notation-note:B',
  NOTATION_MIX_C: 'curriculum-notation-mix:C',
  NOTATION_MIX_F: 'curriculum-notation-mix:F',
  NOTATION_MIX_G: 'curriculum-notation-mix:G',
  NOTATION_MIX_D: 'curriculum-notation-mix:D',
  NOTATION_MIX_E: 'curriculum-notation-mix:E',
  NOTATION_MIX_A: 'curriculum-notation-mix:A',
  NOTATION_MIX_B: 'curriculum-notation-mix:B',
  PHASE5_COMPLETE: 'curriculum-phase5:complete',
  EAR_NOTE_C: 'curriculum-ear-note:C',
  EAR_NOTE_D: 'curriculum-ear-note:D',
  EAR_NOTE_E: 'curriculum-ear-note:E',
  EAR_NOTE_F: 'curriculum-ear-note:F',
  EAR_NOTE_G: 'curriculum-ear-note:G',
  EAR_NOTE_A: 'curriculum-ear-note:A',
  EAR_NOTE_B: 'curriculum-ear-note:B',
  EAR_MIX_C: 'curriculum-ear-mix:C',
  EAR_MIX_D: 'curriculum-ear-mix:D',
  EAR_MIX_E: 'curriculum-ear-mix:E',
  EAR_MIX_F: 'curriculum-ear-mix:F',
  EAR_MIX_G: 'curriculum-ear-mix:G',
  EAR_MIX_A: 'curriculum-ear-mix:A',
  EAR_MIX_B: 'curriculum-ear-mix:B',
  PHASE6_COMPLETE: 'curriculum-phase6:complete'
} as const;

export const MILESTONE_3D_ALL_ITEM_IDS: readonly string[] = Object.values(
  MILESTONE_3D_ITEM_IDS
);

export interface Milestone3dConfig {
  guidedSuccessTarget: number;
  qualifySuccessTarget: number;
  localMixSuccessTarget: number;
  familyMixTarget: number;
  allBlackMixTarget: number;
  notationQualifyTarget: number;
  notationLocalMixTarget: number;
  earQualifyTarget: number;
  earLocalMixTarget: number;
}

export const DEFAULT_MILESTONE_3D_CONFIG: Milestone3dConfig = {
  guidedSuccessTarget: 2,
  qualifySuccessTarget: 2,
  localMixSuccessTarget: 3,
  familyMixTarget: 4,
  allBlackMixTarget: 5,
  notationQualifyTarget: 2,
  notationLocalMixTarget: 3,
  earQualifyTarget: 2,
  earLocalMixTarget: 3
};

export interface BlackKeyGeometrySpec {
  note: BlackKeyNote;
  sharpName: string;
  flatName: string;
  displayLabel: string;
  family: 'twoBlack' | 'threeBlack';
  blackGroupSize: 2 | 3;
  blackIndexInGroup: 0 | 1 | 2;
  adjacentWhiteNotes: readonly [WhiteKeyNote, WhiteKeyNote];
  contrastAnchor: WhiteKeyNote;
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
  allSurroundingWhiteKeyIds: readonly string[];
}

export const BLACK_KEY_GEOMETRY: Readonly<
  Record<BlackKeyNote, BlackKeyGeometrySpec>
> = {
  'C#': {
    note: 'C#',
    sharpName: 'C♯ (До-диез)',
    flatName: 'D♭ (Ре-бемоль)',
    displayLabel: 'C♯ / D♭',
    family: 'twoBlack',
    blackGroupSize: 2,
    blackIndexInGroup: 0,
    adjacentWhiteNotes: ['C', 'D'],
    contrastAnchor: 'C',
    modelTitleHtml: 'Новая чёрная клавиша: <span class="note">C♯ / D♭</span>',
    modelBody:
      'C♯ / D♭ — первая (левая) чёрная клавиша в группе из 2 чёрных: на полтона выше C (C♯) и на полтона ниже D (D♭). Нажмите любую подсвеченную C♯ на пианино.',
    modelPrompt:
      'C♯ / D♭ — левая чёрная в паре из 2 чёрных (между C и D). Нажмите любую подсвеченную C♯.',
    guidedTitleHtml:
      'Найдите <span class="note">C♯ / D♭</span> между белыми C и D.',
    guidedBody:
      'На пианино подсвечены соседние белые клавиши C и D. Нажмите первую (левую) чёрную клавишу в паре между ними.',
    guidedPrompt:
      'Нажмите левую чёрную клавишу в паре между подсвеченными C и D.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">C♯ / D♭</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 2 чёрных клавиш и нажмите левую чёрную клавишу (C♯ / D♭) в разных октавах.',
    qualifyPrompt:
      'Найдите левую чёрную клавишу в группе из 2 чёрных в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 2 чёрных · 1-я чёрная',
    diagramCaption: 'C♯ (выше C) · D♭ (ниже D)',
    remediationHint:
      'Подсказка: в паре из 2 чёрных клавиш C♯ / D♭ — первая (левая) чёрная клавиша между белыми C и D.',
    landmarkKeyIds: ['C#2', 'C#3', 'C#4', 'C#5'],
    allSurroundingWhiteKeyIds: ['C2', 'D2', 'C3', 'D3', 'C4', 'D4', 'C5', 'D5']
  },
  'D#': {
    note: 'D#',
    sharpName: 'D♯ (Ре-диез)',
    flatName: 'E♭ (Ми-бемоль)',
    displayLabel: 'D♯ / E♭',
    family: 'twoBlack',
    blackGroupSize: 2,
    blackIndexInGroup: 1,
    adjacentWhiteNotes: ['D', 'E'],
    contrastAnchor: 'E',
    modelTitleHtml: 'Новая чёрная клавиша: <span class="note">D♯ / E♭</span>',
    modelBody:
      'D♯ / E♭ — вторая (правая) чёрная клавиша в группе из 2 чёрных: на полтона выше D (D♯) и на полтона ниже E (E♭). Нажмите любую подсвеченную D♯ на пианино.',
    modelPrompt:
      'D♯ / E♭ — правая чёрная в паре из 2 чёрных (между D и E). Нажмите любую подсвеченную D♯.',
    guidedTitleHtml:
      'Найдите <span class="note">D♯ / E♭</span> между белыми D и E.',
    guidedBody:
      'На пианино подсвечены соседние белые клавиши D и E. Нажмите вторую (правую) чёрную клавишу в паре между ними.',
    guidedPrompt:
      'Нажмите правую чёрную клавишу в паре между подсвеченными D и E.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">D♯ / E♭</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 2 чёрных клавиш и нажмите правую чёрную клавишу (D♯ / E♭) в разных октавах.',
    qualifyPrompt:
      'Найдите правую чёрную клавишу в группе из 2 чёрных в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 2 чёрных · 2-я чёрная',
    diagramCaption: 'D♯ (выше D) · E♭ (ниже E)',
    remediationHint:
      'Подсказка: в паре из 2 чёрных клавиш D♯ / E♭ — вторая (правая) чёрная клавиша между белыми D и E.',
    landmarkKeyIds: ['D#2', 'D#3', 'D#4', 'D#5'],
    allSurroundingWhiteKeyIds: ['D2', 'E2', 'D3', 'E3', 'D4', 'E4', 'D5', 'E5']
  },
  'F#': {
    note: 'F#',
    sharpName: 'F♯ (Фа-диез)',
    flatName: 'G♭ (Соль-бемоль)',
    displayLabel: 'F♯ / G♭',
    family: 'threeBlack',
    blackGroupSize: 3,
    blackIndexInGroup: 0,
    adjacentWhiteNotes: ['F', 'G'],
    contrastAnchor: 'F',
    modelTitleHtml: 'Новая чёрная клавиша: <span class="note">F♯ / G♭</span>',
    modelBody:
      'F♯ / G♭ — первая (левая) чёрная клавиша в группе из 3 чёрных: на полтона выше F (F♯) и на полтона ниже G (G♭). Нажмите любую подсвеченную F♯ на пианино.',
    modelPrompt:
      'F♯ / G♭ — левая чёрная в тройке чёрных (между F и G). Нажмите любую подсвеченную F♯.',
    guidedTitleHtml:
      'Найдите <span class="note">F♯ / G♭</span> между белыми F и G.',
    guidedBody:
      'На пианино подсвечены соседние белые клавиши F и G. Нажмите первую (левую) чёрную клавишу в группе из 3 чёрных.',
    guidedPrompt:
      'Нажмите первую (левую) чёрную клавишу в группе из 3 чёрных между F и G.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">F♯ / G♭</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите первую (левую) чёрную клавишу (F♯ / G♭) в разных октавах.',
    qualifyPrompt:
      'Найдите первую (левую) чёрную клавишу в группе из 3 чёрных в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных · 1-я чёрная',
    diagramCaption: 'F♯ (выше F) · G♭ (ниже G)',
    remediationHint:
      'Подсказка: в группе из 3 чёрных клавиш F♯ / G♭ — первая (левая) чёрная клавиша между белыми F и G.',
    landmarkKeyIds: ['F#2', 'F#3', 'F#4', 'F#5'],
    allSurroundingWhiteKeyIds: ['F2', 'G2', 'F3', 'G3', 'F4', 'G4', 'F5', 'G5']
  },
  'G#': {
    note: 'G#',
    sharpName: 'G♯ (Соль-диез)',
    flatName: 'A♭ (Ля-бемоль)',
    displayLabel: 'G♯ / A♭',
    family: 'threeBlack',
    blackGroupSize: 3,
    blackIndexInGroup: 1,
    adjacentWhiteNotes: ['G', 'A'],
    contrastAnchor: 'G',
    modelTitleHtml: 'Новая чёрная клавиша: <span class="note">G♯ / A♭</span>',
    modelBody:
      'G♯ / A♭ — средняя (вторая) чёрная клавиша в группе из 3 чёрных: на полтона выше G (G♯) и на полтона ниже A (A♭). Нажмите любую подсвеченную G♯ на пианино.',
    modelPrompt:
      'G♯ / A♭ — средняя чёрная в тройке чёрных (между G и A). Нажмите любую подсвеченную G♯.',
    guidedTitleHtml:
      'Найдите <span class="note">G♯ / A♭</span> между белыми G и A.',
    guidedBody:
      'На пианино подсвечены соседние белые клавиши G и A. Нажмите среднюю (вторую) чёрную клавишу в группе из 3 чёрных.',
    guidedPrompt:
      'Нажмите среднюю чёрную клавишу в группе из 3 чёрных между G и A.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">G♯ / A♭</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите среднюю чёрную клавишу (G♯ / A♭) в разных октавах.',
    qualifyPrompt:
      'Найдите среднюю чёрную клавишу в группе из 3 чёрных в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных · 2-я (средняя) чёрная',
    diagramCaption: 'G♯ (выше G) · A♭ (ниже A)',
    remediationHint:
      'Подсказка: в группе из 3 чёрных клавиш G♯ / A♭ — центральная (вторая) чёрная клавиша между белыми G и A.',
    landmarkKeyIds: ['G#2', 'G#3', 'G#4', 'G#5'],
    allSurroundingWhiteKeyIds: ['G2', 'A2', 'G3', 'A3', 'G4', 'A4', 'G5', 'A5']
  },
  'A#': {
    note: 'A#',
    sharpName: 'A♯ (Ля-диез)',
    flatName: 'B♭ (Си-бемоль)',
    displayLabel: 'A♯ / B♭',
    family: 'threeBlack',
    blackGroupSize: 3,
    blackIndexInGroup: 2,
    adjacentWhiteNotes: ['A', 'B'],
    contrastAnchor: 'B',
    modelTitleHtml: 'Новая чёрная клавиша: <span class="note">A♯ / B♭</span>',
    modelBody:
      'A♯ / B♭ — третья (правая) чёрная клавиша в группе из 3 чёрных: на полтона выше A (A♯) и на полтона ниже B (B♭). Нажмите любую подсвеченную A♯ на пианино.',
    modelPrompt:
      'A♯ / B♭ — правая чёрная в тройке чёрных (между A и B). Нажмите любую подсвеченную A♯.',
    guidedTitleHtml:
      'Найдите <span class="note">A♯ / B♭</span> между белыми A и B.',
    guidedBody:
      'На пианино подсвечены соседние белые клавиши A и B. Нажмите третью (правую) чёрную клавишу в группе из 3 чёрных.',
    guidedPrompt:
      'Нажмите правую чёрную клавишу в группе из 3 чёрных между A и B.',
    qualifyTitleHtml:
      'Теперь найдите <span class="note">A♯ / B♭</span> без подсказок.',
    qualifyBody:
      'Подсказки убраны: найдите группу из 3 чёрных клавиш и нажмите третью (правую) чёрную клавишу (A♯ / B♭) в разных октавах.',
    qualifyPrompt:
      'Найдите правую чёрную клавишу в группе из 3 чёрных в разных частях клавиатуры.',
    diagramGroupTitle: 'Группа из 3 чёрных · 3-я чёрная',
    diagramCaption: 'A♯ (выше A) · B♭ (ниже B)',
    remediationHint:
      'Подсказка: в группе из 3 чёрных клавиш A♯ / B♭ — третья (правая) чёрная клавиша между белыми A и B.',
    landmarkKeyIds: ['A#2', 'A#3', 'A#4', 'A#5'],
    allSurroundingWhiteKeyIds: ['A2', 'B2', 'A3', 'B3', 'A4', 'B4', 'A5', 'B5']
  }
};

export function isBlackKeyNote(note: NoteName | string): note is BlackKeyNote {
  return (BLACK_KEY_ACQUISITION_ORDER as readonly string[]).includes(note);
}

export function getBlackKeyCurriculumItemId(note: BlackKeyNote): string {
  return `curriculum-note:${note}`;
}

export function getBlackKeyMixItemId(note: BlackKeyNote): string {
  return `curriculum-mix:${note}`;
}

export function isValidBlackKeyRegionContext(regionCtx: string): boolean {
  return /^region-[CDFGA]#[2-5]$/.test(regionCtx);
}

export function getUnhintedBlackNoteContexts(
  record: LearningProgressRecord | undefined
): string[] {
  if (!record || !Array.isArray(record.contexts)) return [];
  return record.contexts.filter(
    ctx =>
      !ctx.startsWith('guided:') &&
      !ctx.startsWith('model:') &&
      !ctx.startsWith('pending:') &&
      isValidBlackKeyRegionContext(ctx)
  );
}

export function getStructuralGuideForBlackNote(
  note: BlackKeyNote,
  octave: ActiveKeyboardOctave = 4
): string[] {
  const [leftWhite, rightWhite] = BLACK_KEY_GEOMETRY[note].adjacentWhiteNotes;
  return [`${leftWhite}${octave}`, `${rightWhite}${octave}`];
}

export function getBlackKeyLocalMixPool(
  note: BlackKeyNote
): readonly NoteName[] {
  switch (note) {
    case 'C#':
      return ['C#', 'C', 'D'];
    case 'D#':
      return ['C#', 'D#', 'C', 'D', 'E'];
    case 'F#':
      return ['F#', 'F', 'G'];
    case 'G#':
      return ['F#', 'G#', 'F', 'G', 'A'];
    case 'A#':
      return ['F#', 'G#', 'A#', 'F', 'B'];
  }
}

export function buildInitialBlackLocalMixQueue(
  note: BlackKeyNote
): NoteName[] {
  switch (note) {
    case 'C#':
      return ['C#', 'C', 'C#'];
    case 'D#':
      return ['D#', 'C#', 'D', 'D#'];
    case 'F#':
      return ['F#', 'F', 'F#'];
    case 'G#':
      return ['G#', 'F#', 'G', 'G#'];
    case 'A#':
      return ['A#', 'G#', 'F#', 'A#'];
  }
}

export function buildInitialAllBlackMixQueue(): NoteName[] {
  return ['C#', 'F#', 'D#', 'G#', 'A#'];
}

export function getBlackIdentifyPoolForStage(
  stage: BlackKeyIdentifyStageId
): readonly BlackKeyNote[] {
  switch (stage) {
    case 'twoBlackIdentify':
      return ['C#', 'D#'];
    case 'threeBlackIdentify':
      return ['F#', 'G#', 'A#'];
    case 'allBlackIdentify':
      return ['C#', 'D#', 'F#', 'G#', 'A#'];
  }
}

export function buildBlackKeyContrastFeedback(
  expected: NoteName,
  pressed: NoteName
): string {
  const pressedLabel = DISPLAY_NAMES[pressed] ?? pressed;
  if (isBlackKeyNote(expected)) {
    const spec = BLACK_KEY_GEOMETRY[expected];
    if (expected === 'C#' && pressed === 'D#') {
      return 'Это D♯ / E♭ (правая в паре из 2 чёрных). C♯ / D♭ — первая (левая) чёрная клавиша между C и D.';
    }
    if (expected === 'D#' && pressed === 'C#') {
      return 'Это C♯ / D♭ (левая в паре из 2 чёрных). D♯ / E♭ — вторая (правая) чёрная клавиша между D и E.';
    }
    if (expected === 'F#' && pressed === 'G#') {
      return 'Это G♯ / A♭ (средняя в тройке чёрных). F♯ / G♭ — первая (левая) чёрная клавиша между F и G.';
    }
    if (expected === 'G#' && (pressed === 'F#' || pressed === 'A#')) {
      return `Это ${pressedLabel}. G♯ / A♭ — центральная (вторая) чёрная клавиша в группе из 3 чёрных между G и A.`;
    }
    if (expected === 'A#' && pressed === 'G#') {
      return 'Это G♯ / A♭ (средняя в тройке чёрных). A♯ / B♭ — третья (правая) чёрная клавиша между A и B.';
    }
    return `Это ${pressedLabel}. ${spec.remediationHint.replace(/^Подсказка:\s*/, '')}`;
  }
  return `Это ${pressedLabel}. Требуется ${DISPLAY_NAMES[expected] ?? expected}.`;
}

// ============================================================================
// Phase 5 (Notation) & Phase 6 (Ear) Per-Note & Presentation Unit Definitions
// ============================================================================

export type NotationUnitId = 'anchors' | 'lower' | 'upper';
export type EarUnitId = 'anchors' | 'upper';

export const NOTATION_ACQUISITION_ORDER: readonly WhiteKeyNote[] = [
  'C',
  'F',
  'G',
  'D',
  'E',
  'A',
  'B'
] as const;

export const EAR_ACQUISITION_ORDER: readonly WhiteKeyNote[] = [
  'C',
  'D',
  'E',
  'F',
  'G',
  'A',
  'B'
] as const;

export const NOTATION_UNIT_NOTES: Readonly<
  Record<NotationUnitId, readonly WhiteKeyNote[]>
> = {
  anchors: ['C', 'F', 'G'],
  lower: ['C', 'D', 'E', 'F', 'G'],
  upper: ['C', 'D', 'E', 'F', 'G', 'A', 'B']
};

export const NOTATION_UNIT_NEW_NOTES: Readonly<
  Record<NotationUnitId, readonly WhiteKeyNote[]>
> = {
  anchors: ['C', 'F', 'G'],
  lower: ['D', 'E'],
  upper: ['A', 'B']
};

export const EAR_UNIT_NOTES: Readonly<
  Record<EarUnitId, readonly WhiteKeyNote[]>
> = {
  anchors: ['C', 'D', 'E', 'F'],
  upper: ['C', 'D', 'E', 'F', 'G', 'A', 'B']
};

export const EAR_UNIT_NEW_NOTES: Readonly<
  Record<EarUnitId, readonly WhiteKeyNote[]>
> = {
  anchors: ['C', 'D', 'E', 'F'],
  upper: ['G', 'A', 'B']
};

export function getNotationNoteCurriculumItemId(note: WhiteKeyNote): string {
  return `curriculum-notation-note:${note}`;
}

export function getNotationNoteMixItemId(note: WhiteKeyNote): string {
  return `curriculum-notation-mix:${note}`;
}

export function getEarNoteCurriculumItemId(note: WhiteKeyNote): string {
  return `curriculum-ear-note:${note}`;
}

export function getEarNoteMixItemId(note: WhiteKeyNote): string {
  return `curriculum-ear-mix:${note}`;
}

export function getNotationUnitForNote(note: WhiteKeyNote): NotationUnitId {
  if (note === 'C' || note === 'F' || note === 'G') return 'anchors';
  if (note === 'D' || note === 'E') return 'lower';
  return 'upper';
}

export function getEarUnitForNote(note: WhiteKeyNote): EarUnitId {
  if (note === 'C' || note === 'D' || note === 'E' || note === 'F') {
    return 'anchors';
  }
  return 'upper';
}

/**
 * Returns only the notation notes that have ALREADY completed their own `Model` + `Qualify`
 * up to and including `note` in `NOTATION_ACQUISITION_ORDER`.
 * Never includes an unmodeled note.
 */
export function getNotationLocalMixPool(
  note: WhiteKeyNote
): readonly WhiteKeyNote[] {
  const idx = NOTATION_ACQUISITION_ORDER.indexOf(note);
  if (idx <= 0) return ['C'];
  return NOTATION_ACQUISITION_ORDER.slice(0, idx + 1);
}

export function buildInitialNotationLocalMixQueue(
  note: WhiteKeyNote
): WhiteKeyNote[] {
  switch (note) {
    case 'C':
      return ['C', 'C', 'C'];
    case 'F':
      return ['F', 'C', 'F'];
    case 'G':
      return ['G', 'F', 'C', 'G'];
    case 'D':
      return ['D', 'C', 'F', 'D'];
    case 'E':
      return ['E', 'D', 'C', 'G', 'E'];
    case 'A':
      return ['A', 'G', 'F', 'D', 'A'];
    case 'B':
      return ['B', 'A', 'G', 'E', 'C', 'B'];
  }
}

export function getNotationContrastAnchor(note: WhiteKeyNote): WhiteKeyNote {
  const idx = NOTATION_ACQUISITION_ORDER.indexOf(note);
  if (idx <= 0) return 'C';
  return NOTATION_ACQUISITION_ORDER[idx - 1];
}

/**
 * Returns only the ear notes that have ALREADY completed their own `Model` + `Qualify`
 * up to and including `note` in `EAR_ACQUISITION_ORDER`.
 * Never includes an unmodeled note.
 */
export function getEarLocalMixPool(
  note: WhiteKeyNote
): readonly WhiteKeyNote[] {
  const idx = EAR_ACQUISITION_ORDER.indexOf(note);
  if (idx <= 0) return ['C'];
  return EAR_ACQUISITION_ORDER.slice(0, idx + 1);
}

export function buildInitialEarLocalMixQueue(
  note: WhiteKeyNote
): WhiteKeyNote[] {
  switch (note) {
    case 'C':
      return ['C', 'C', 'C'];
    case 'D':
      return ['D', 'C', 'D'];
    case 'E':
      return ['E', 'D', 'C', 'E'];
    case 'F':
      return ['F', 'E', 'C', 'F'];
    case 'G':
      return ['G', 'F', 'C', 'G'];
    case 'A':
      return ['A', 'G', 'F', 'C', 'A'];
    case 'B':
      return ['B', 'A', 'G', 'C', 'B'];
  }
}

export function getEarContrastAnchor(note: WhiteKeyNote): WhiteKeyNote {
  const idx = EAR_ACQUISITION_ORDER.indexOf(note);
  if (idx <= 0) return 'C';
  return EAR_ACQUISITION_ORDER[idx - 1];
}

function normalizeProgressMap(
  input?: ProgressCollectionInput
): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of input) {
      if (item && typeof item.id === 'string') {
        map.set(item.id, item);
      }
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [key, val] of Object.entries(
    input as Record<string, LearningProgressRecord>
  )) {
    if (val && typeof val === 'object') {
      map.set(key, val);
    }
  }
  return map;
}

function normalizeCardsMap(
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): Map<string, Card> {
  if (!cards) return new Map();
  if (cards instanceof Map) return new Map(cards);
  const map = new Map<string, Card>();
  for (const c of cards as readonly Card[]) {
    if (c && typeof c.id === 'string') {
      map.set(c.id, c);
    }
  }
  return map;
}

export function hasMeaningfulLegacyBlackNoteEvidence(
  note: BlackKeyNote,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const cardsMap = normalizeCardsMap(cards);
  const findCard = cardsMap.get(`find:${note}`);
  if (
    findCard &&
    (findCard.reps > 0 ||
      (findCard.stats &&
        (findCard.stats.scheduledSuccesses > 0 ||
          findCard.stats.firstCorrect > 0)))
  ) {
    return true;
  }
  if (Array.isArray(reviewLogs)) {
    for (const ev of reviewLogs) {
      if (
        ev &&
        ev.note === note &&
        (!ev.skill || ev.skill === 'find') &&
        ev.firstCorrect === true &&
        (!ev.kind || ev.kind === 'scheduled' || ev.kind === 'new')
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isBlackNoteMixReady(
  note: BlackKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const rec = map.get(getBlackKeyCurriculumItemId(note));
  if (rec && (rec.state === 'mixReady' || rec.state === 'retention')) {
    return true;
  }
  if (rec && rec.state !== 'unseen') {
    return false;
  }
  return hasMeaningfulLegacyBlackNoteEvidence(note, cards, reviewLogs);
}

export function isBlackNoteRetentionMastered(
  note: BlackKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const rec = map.get(getBlackKeyCurriculumItemId(note));
  if (rec) {
    if (rec.contexts.includes('pending:delayedRetry')) {
      return false;
    }
    if (rec.state === 'retention') {
      return true;
    }
    if (rec.state !== 'unseen') {
      return false;
    }
  }
  const phase4Done = map.get(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE);
  if (phase4Done && phase4Done.state === 'retention') {
    return true;
  }
  return hasMeaningfulLegacyBlackNoteEvidence(note, cards, reviewLogs);
}

export function isNotationNoteRetentionMastered(
  note: WhiteKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const rec = map.get(getNotationNoteCurriculumItemId(note));
  if (rec) {
    if (rec.contexts.includes('pending:delayedRetry')) {
      return false;
    }
    if (rec.state === 'retention') {
      return true;
    }
    if (rec.state !== 'unseen') {
      return false;
    }
  }
  const phase5Done = map.get(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE);
  if (phase5Done && phase5Done.state === 'retention') {
    return true;
  }
  const cardsMap = normalizeCardsMap(cards);
  const card = cardsMap.get(`notationToKey:${note}`);
  return !!card && card.reps > 0 && card.lastGrade !== 1;
}

export function isEarNoteRetentionMastered(
  note: WhiteKeyNote,
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const rec = map.get(getEarNoteCurriculumItemId(note));
  if (rec) {
    if (rec.contexts.includes('pending:delayedRetry')) {
      return false;
    }
    if (rec.state === 'retention') {
      return true;
    }
    if (rec.state !== 'unseen') {
      return false;
    }
  }
  const phase6Done = map.get(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);
  if (phase6Done && phase6Done.state === 'retention') {
    return true;
  }
  const cardsMap = normalizeCardsMap(cards);
  const card = cardsMap.get(`soundToKey:${note}`);
  return !!card && card.reps > 0 && card.lastGrade !== 1;
}

export function isPhase4BlackKeysCompleted(
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[],
  reviewLogs?: readonly Partial<ReviewLogEvent>[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const p4 = map.get(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE);
  if (p4 && p4.state === 'retention') return true;
  return (
    BLACK_KEY_ACQUISITION_ORDER.every(n =>
      isBlackNoteRetentionMastered(n, map, cards, reviewLogs)
    ) && map.get(MILESTONE_3D_ITEM_IDS.IDENTIFY_ALL_BLACK)?.state === 'retention'
  );
}

export function isPhase5NotationCompleted(
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const p5 = map.get(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE);
  if (p5 && p5.state === 'retention') return true;
  return ALL_WHITE_CURRICULUM_NOTES.every(n =>
    isNotationNoteRetentionMastered(n, map, cards)
  );
}

export function isPhase6EarCompleted(
  learningProgress?: ProgressCollectionInput,
  cards?: ReadonlyMap<string, Card> | readonly Card[]
): boolean {
  const map = normalizeProgressMap(learningProgress);
  const p6 = map.get(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);
  if (p6 && p6.state === 'retention') return true;
  return ALL_WHITE_CURRICULUM_NOTES.every(n =>
    isEarNoteRetentionMastered(n, map, cards)
  );
}

export function isMilestone3dCompleted(input: {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
}): boolean {
  const map = normalizeProgressMap(input.learningProgress);
  const p6 = map.get(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE);
  if (p6 && p6.state === 'retention') return true;
  return false;
}

export interface Milestone3dStepDescriptor {
  step: Milestone3dStep;
  phase: 4 | 5 | 6;
  kind:
    | 'blackAcquisition'
    | 'blackIdentify'
    | 'allBlackMix'
    | 'phase4Complete'
    | 'notationModel'
    | 'notationQualify'
    | 'notationLocalMix'
    | 'notationDelayedCheck'
    | 'phase5Complete'
    | 'earModel'
    | 'earQualify'
    | 'earLocalMix'
    | 'earDelayedCheck'
    | 'phase6Complete';
  focusBlackNote: BlackKeyNote | null;
  focusWhiteNote: WhiteKeyNote | null;
  subStage: 'model' | 'guided' | 'qualify' | 'localMix' | 'delayedCheck' | null;
  identifyStage: BlackKeyIdentifyStageId | null;
  notationUnit: NotationUnitId | null;
  earUnit: EarUnitId | null;
}

const BLACK_PREFIX_MAP: Record<string, BlackKeyNote> = {
  cs: 'C#',
  ds: 'D#',
  fs: 'F#',
  gs: 'G#',
  as: 'A#'
};

export function describeMilestone3dStep(
  step: Milestone3dStep
): Milestone3dStepDescriptor {
  if (step === 'phase4Complete') {
    return {
      step,
      phase: 4,
      kind: 'phase4Complete',
      focusBlackNote: null,
      focusWhiteNote: null,
      subStage: null,
      identifyStage: null,
      notationUnit: null,
      earUnit: null
    };
  }
  if (step === 'phase5Complete') {
    return {
      step,
      phase: 5,
      kind: 'phase5Complete',
      focusBlackNote: null,
      focusWhiteNote: null,
      subStage: null,
      identifyStage: null,
      notationUnit: null,
      earUnit: null
    };
  }
  if (step === 'phase6Complete') {
    return {
      step,
      phase: 6,
      kind: 'phase6Complete',
      focusBlackNote: null,
      focusWhiteNote: null,
      subStage: null,
      identifyStage: null,
      notationUnit: null,
      earUnit: null
    };
  }
  if (step === 'allBlackMix') {
    return {
      step,
      phase: 4,
      kind: 'allBlackMix',
      focusBlackNote: null,
      focusWhiteNote: null,
      subStage: 'localMix',
      identifyStage: null,
      notationUnit: null,
      earUnit: null
    };
  }
  if (
    step === 'twoBlackIdentify' ||
    step === 'threeBlackIdentify' ||
    step === 'allBlackIdentify'
  ) {
    return {
      step,
      phase: 4,
      kind: 'blackIdentify',
      focusBlackNote: null,
      focusWhiteNote: null,
      subStage: null,
      identifyStage: step,
      notationUnit: null,
      earUnit: null
    };
  }
  if (step.startsWith('notation')) {
    const noteChar = step.slice('notation'.length, 'notation'.length + 1) as WhiteKeyNote;
    const focusWhiteNote: WhiteKeyNote = (
      ALL_WHITE_CURRICULUM_NOTES as readonly string[]
    ).includes(noteChar)
      ? noteChar
      : 'C';
    const unit = getNotationUnitForNote(focusWhiteNote);
    const suffix = step.slice('notation'.length + 1);
    const subStage =
      suffix === 'Model'
        ? 'model'
        : suffix === 'Qualify'
          ? 'qualify'
          : suffix === 'LocalMix'
            ? 'localMix'
            : 'delayedCheck';
    const kind =
      subStage === 'model'
        ? 'notationModel'
        : subStage === 'qualify'
          ? 'notationQualify'
          : subStage === 'localMix'
            ? 'notationLocalMix'
            : 'notationDelayedCheck';
    return {
      step,
      phase: 5,
      kind,
      focusBlackNote: null,
      focusWhiteNote,
      subStage,
      identifyStage: null,
      notationUnit: unit,
      earUnit: null
    };
  }
  if (step.startsWith('ear')) {
    const noteChar = step.slice('ear'.length, 'ear'.length + 1) as WhiteKeyNote;
    const focusWhiteNote: WhiteKeyNote = (
      ALL_WHITE_CURRICULUM_NOTES as readonly string[]
    ).includes(noteChar)
      ? noteChar
      : 'C';
    const unit = getEarUnitForNote(focusWhiteNote);
    const suffix = step.slice('ear'.length + 1);
    const subStage =
      suffix === 'Model'
        ? 'model'
        : suffix === 'Qualify'
          ? 'qualify'
          : suffix === 'LocalMix'
            ? 'localMix'
            : 'delayedCheck';
    const kind =
      subStage === 'model'
        ? 'earModel'
        : subStage === 'qualify'
          ? 'earQualify'
          : subStage === 'localMix'
            ? 'earLocalMix'
            : 'earDelayedCheck';
    return {
      step,
      phase: 6,
      kind,
      focusBlackNote: null,
      focusWhiteNote,
      subStage,
      identifyStage: null,
      notationUnit: null,
      earUnit: unit
    };
  }

  const prefix = step.slice(0, 2);
  const focusBlackNote = BLACK_PREFIX_MAP[prefix] ?? 'C#';
  const suffix = step.slice(2);
  const subStage =
    suffix === 'Model'
      ? 'model'
      : suffix === 'Guided'
        ? 'guided'
        : suffix === 'Qualify'
          ? 'qualify'
          : suffix === 'LocalMix'
            ? 'localMix'
            : 'delayedCheck';

  return {
    step,
    phase: 4,
    kind: 'blackAcquisition',
    focusBlackNote,
    focusWhiteNote: null,
    subStage,
    identifyStage: null,
    notationUnit: null,
    earUnit: null
  };
}

export interface Milestone3dCurriculumState {
  step: Milestone3dStep;
  config: Milestone3dConfig;
  progress: Record<string, LearningProgressRecord>;
  hintLevel: HintLevel;
  targetNote: NoteName | null;
  targetKeyId: string | null;
  identifyTargetKeyId: string | null;
  answerPool: NoteName[];
  identifyCompletedNotes: NoteName[];
  mixQueue: NoteName[];
  structuralGuideKeyIds: string[];
  modelLabelKeyIds: string[];
  awaitingCorrective: boolean;
  awaitingRemediationPress: boolean;
  isInterveningRecall: boolean;
  feedbackText: string;
  feedbackTone: '' | 'good' | 'bad' | 'warn';
}

export type Milestone3dAction =
  | {
      type: 'keyPress';
      note: NoteName;
      keyId?: string;
      inputMethod?: TrialInputMethod;
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'semanticAnswer';
      note: NoteName;
      channel?: 'pcNote' | 'answerButton';
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'dontKnow';
      at?: number;
      sessionId?: string;
    }
  | {
      type: 'advancePhase';
      at?: number;
      sessionId?: string;
    };

export function getMilestone3dStepSkill(step: Milestone3dStep): Skill | null {
  const desc = describeMilestone3dStep(step);
  if (
    desc.kind === 'phase4Complete' ||
    desc.kind === 'phase5Complete' ||
    desc.kind === 'phase6Complete'
  ) {
    return null;
  }
  if (desc.kind === 'blackIdentify') {
    return 'identify';
  }
  if (desc.phase === 5) {
    return 'notationToKey';
  }
  if (desc.phase === 6) {
    return 'soundToKey';
  }
  return 'find';
}

export function canUseInputForMilestone3dStep(
  step: Milestone3dStep,
  channel: InputChannel
): boolean {
  const skill = getMilestone3dStepSkill(step);
  if (!skill) return false;
  return canUseInputForSkill(skill, channel);
}

export function canUseDontKnowInMilestone3dStep(
  state: Milestone3dCurriculumState
): boolean {
  const desc = describeMilestone3dStep(state.step);
  if (
    desc.kind === 'phase4Complete' ||
    desc.kind === 'phase5Complete' ||
    desc.kind === 'phase6Complete' ||
    desc.subStage === 'model' ||
    desc.subStage === 'guided'
  ) {
    return false;
  }
  return !state.awaitingCorrective && !state.awaitingRemediationPress;
}

export function hydrateMilestone3dProgress(
  input: {
    learningProgress?: ProgressCollectionInput;
    cards?: ReadonlyMap<string, Card> | readonly Card[];
    reviewLogs?: readonly Partial<ReviewLogEvent>[];
    now?: number;
  } = {}
): Record<string, LearningProgressRecord> {
  const now = input.now ?? 0;
  const map = normalizeProgressMap(input.learningProgress);
  const progress: Record<string, LearningProgressRecord> = {};

  for (const [id, rec] of map.entries()) {
    progress[id] = { ...rec, contexts: [...rec.contexts] };
  }

  for (const itemId of MILESTONE_3D_ALL_ITEM_IDS) {
    if (!progress[itemId]) {
      progress[itemId] = createInitialLearningProgress(itemId, now);
    }
  }

  for (const note of BLACK_KEY_ACQUISITION_ORDER) {
    const noteId = getBlackKeyCurriculumItemId(note);
    const mixId = getBlackKeyMixItemId(note);
    const rec = progress[noteId];
    if (
      rec.state === 'unseen' &&
      hasMeaningfulLegacyBlackNoteEvidence(note, input.cards, input.reviewLogs)
    ) {
      progress[noteId] = {
        ...rec,
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: DEFAULT_MILESTONE_3D_CONFIG.guidedSuccessTarget,
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.qualifySuccessTarget,
        contexts: [`region-${note}3`, `region-${note}4`],
        mixReadyAt: now,
        firstFsrsEligibleAt: now,
        updatedAt: now
      };
      progress[mixId] = {
        ...progress[mixId],
        state: 'retention',
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.localMixSuccessTarget,
        mixReadyAt: now,
        updatedAt: now
      };
    }
  }

  const cardsMap = normalizeCardsMap(input.cards);
  for (const note of NOTATION_ACQUISITION_ORDER) {
    const noteId = getNotationNoteCurriculumItemId(note);
    const mixId = getNotationNoteMixItemId(note);
    const rec = progress[noteId];
    const card = cardsMap.get(`notationToKey:${note}`);
    if (rec.state === 'unseen' && card && card.reps > 0 && card.lastGrade !== 1) {
      progress[noteId] = {
        ...rec,
        state: 'retention',
        modelCompleted: true,
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.notationQualifyTarget,
        contexts: [`notationToKey:${note}4:1`, `notationToKey:${note}4:2`],
        mixReadyAt: now,
        firstFsrsEligibleAt: now,
        updatedAt: now
      };
      progress[mixId] = {
        ...progress[mixId],
        state: 'retention',
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.notationLocalMixTarget,
        mixReadyAt: now,
        updatedAt: now
      };
    }
  }

  for (const note of EAR_ACQUISITION_ORDER) {
    const noteId = getEarNoteCurriculumItemId(note);
    const mixId = getEarNoteMixItemId(note);
    const rec = progress[noteId];
    const card = cardsMap.get(`soundToKey:${note}`);
    if (rec.state === 'unseen' && card && card.reps > 0 && card.lastGrade !== 1) {
      progress[noteId] = {
        ...rec,
        state: 'retention',
        modelCompleted: true,
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.earQualifyTarget,
        contexts: [`soundToKey:${note}4:1`, `soundToKey:${note}4:2`],
        mixReadyAt: now,
        firstFsrsEligibleAt: now,
        updatedAt: now
      };
      progress[mixId] = {
        ...progress[mixId],
        state: 'retention',
        independentUnhintedSuccesses:
          DEFAULT_MILESTONE_3D_CONFIG.earLocalMixTarget,
        mixReadyAt: now,
        updatedAt: now
      };
    }
  }

  return progress;
}

function getBlackStepPrefix(note: BlackKeyNote): 'cs' | 'ds' | 'fs' | 'gs' | 'as' {
  switch (note) {
    case 'C#':
      return 'cs';
    case 'D#':
      return 'ds';
    case 'F#':
      return 'fs';
    case 'G#':
      return 'gs';
    case 'A#':
      return 'as';
  }
}

export function determineNextMilestone3dStep(
  progress: Record<string, LearningProgressRecord>,
  config: Milestone3dConfig = DEFAULT_MILESTONE_3D_CONFIG
): Milestone3dStep {
  // Phase 4: C#, D# -> twoBlackIdentify -> F#, G#, A# -> threeBlackIdentify -> allBlackMix -> allBlackIdentify -> phase4Complete
  const checkBlackNote = (note: BlackKeyNote): Milestone3dStep | null => {
    const prefix = getBlackStepPrefix(note);
    const noteRec = progress[getBlackKeyCurriculumItemId(note)];
    const mixRec = progress[getBlackKeyMixItemId(note)];
    if (!noteRec || !noteRec.modelCompleted) {
      return `${prefix}Model` as Milestone3dStep;
    }
    if (noteRec.guidedSuccesses < config.guidedSuccessTarget) {
      return `${prefix}Guided` as Milestone3dStep;
    }
    if (
      getUnhintedBlackNoteContexts(noteRec).length <
        config.qualifySuccessTarget ||
      noteRec.independentUnhintedSuccesses < config.qualifySuccessTarget
    ) {
      return `${prefix}Qualify` as Milestone3dStep;
    }
    const mixTarget =
      note === 'D#' || note === 'A#'
        ? config.familyMixTarget
        : config.localMixSuccessTarget;
    if (
      !mixRec ||
      (mixRec.state !== 'mixReady' && mixRec.state !== 'retention') ||
      mixRec.independentUnhintedSuccesses < mixTarget
    ) {
      return `${prefix}LocalMix` as Milestone3dStep;
    }
    if (
      noteRec.state !== 'retention' ||
      noteRec.contexts.includes('pending:delayedRetry')
    ) {
      return `${prefix}DelayedCheck` as Milestone3dStep;
    }
    return null;
  };

  const p4Done = progress[MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE];
  if (!p4Done || p4Done.state !== 'retention') {
    for (const n of ['C#', 'D#'] as const) {
      const s = checkBlackNote(n);
      if (s) return s;
    }
    const twoId = progress[MILESTONE_3D_ITEM_IDS.IDENTIFY_TWO_BLACK];
    if (!twoId || (twoId.state !== 'mixReady' && twoId.state !== 'retention')) {
      return 'twoBlackIdentify';
    }
    for (const n of ['F#', 'G#', 'A#'] as const) {
      const s = checkBlackNote(n);
      if (s) return s;
    }
    const threeId = progress[MILESTONE_3D_ITEM_IDS.IDENTIFY_THREE_BLACK];
    if (
      !threeId ||
      (threeId.state !== 'mixReady' && threeId.state !== 'retention')
    ) {
      return 'threeBlackIdentify';
    }
    const allBlackMix = progress[MILESTONE_3D_ITEM_IDS.MIX_ALL_BLACK];
    if (
      !allBlackMix ||
      (allBlackMix.state !== 'mixReady' && allBlackMix.state !== 'retention') ||
      allBlackMix.independentUnhintedSuccesses < config.allBlackMixTarget
    ) {
      return 'allBlackMix';
    }
    const allBlackId = progress[MILESTONE_3D_ITEM_IDS.IDENTIFY_ALL_BLACK];
    if (
      !allBlackId ||
      (allBlackId.state !== 'mixReady' && allBlackId.state !== 'retention')
    ) {
      return 'allBlackIdentify';
    }
    return 'phase4Complete';
  }

  // Phase 5: Staff Notation per-note (C -> F -> G -> D -> E -> A -> B)
  const p5Done = progress[MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE];
  if (!p5Done || p5Done.state !== 'retention') {
    for (const note of NOTATION_ACQUISITION_ORDER) {
      const noteRec = progress[getNotationNoteCurriculumItemId(note)];
      const mixRec = progress[getNotationNoteMixItemId(note)];
      if (!noteRec || !noteRec.modelCompleted) {
        return `notation${note}Model` as Milestone3dStep;
      }
      if (noteRec.independentUnhintedSuccesses < config.notationQualifyTarget) {
        return `notation${note}Qualify` as Milestone3dStep;
      }
      if (
        !mixRec ||
        (mixRec.state !== 'mixReady' && mixRec.state !== 'retention') ||
        mixRec.independentUnhintedSuccesses < config.notationLocalMixTarget
      ) {
        return `notation${note}LocalMix` as Milestone3dStep;
      }
      if (
        noteRec.state !== 'retention' ||
        noteRec.contexts.includes('pending:delayedRetry')
      ) {
        return `notation${note}DelayedCheck` as Milestone3dStep;
      }
    }
    return 'phase5Complete';
  }

  // Phase 6: Relative Ear per-note (C -> D -> E -> F -> G -> A -> B)
  const p6Done = progress[MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE];
  if (!p6Done || p6Done.state !== 'retention') {
    for (const note of EAR_ACQUISITION_ORDER) {
      const noteRec = progress[getEarNoteCurriculumItemId(note)];
      const mixRec = progress[getEarNoteMixItemId(note)];
      if (!noteRec || !noteRec.modelCompleted) {
        return `ear${note}Model` as Milestone3dStep;
      }
      if (noteRec.independentUnhintedSuccesses < config.earQualifyTarget) {
        return `ear${note}Qualify` as Milestone3dStep;
      }
      if (
        !mixRec ||
        (mixRec.state !== 'mixReady' && mixRec.state !== 'retention') ||
        mixRec.independentUnhintedSuccesses < config.earLocalMixTarget
      ) {
        return `ear${note}LocalMix` as Milestone3dStep;
      }
      if (
        noteRec.state !== 'retention' ||
        noteRec.contexts.includes('pending:delayedRetry')
      ) {
        return `ear${note}DelayedCheck` as Milestone3dStep;
      }
    }
    return 'phase6Complete';
  }

  return 'phase6Complete';
}

export function shouldEnterMilestone3dCurriculum(input: {
  cards?: readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
  learningProgress?: ProgressCollectionInput;
}): boolean {
  if (
    !isWhiteKeyCurriculumCompleted({
      learningProgress: input.learningProgress,
      cards: input.cards,
      reviewLogs: input.reviewLogs
    })
  ) {
    return false;
  }
  return !isMilestone3dCompleted({
    learningProgress: input.learningProgress,
    cards: input.cards,
    reviewLogs: input.reviewLogs
  });
}

export function buildMilestone3dStateForStep(
  step: Milestone3dStep,
  progress: Record<string, LearningProgressRecord>,
  config: Milestone3dConfig = DEFAULT_MILESTONE_3D_CONFIG
): Milestone3dCurriculumState {
  const desc = describeMilestone3dStep(step);

  if (desc.kind === 'blackAcquisition' && desc.focusBlackNote) {
    const note = desc.focusBlackNote;
    const spec = BLACK_KEY_GEOMETRY[note];
    const noteRec = progress[getBlackKeyCurriculumItemId(note)];

    if (desc.subStage === 'model') {
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        targetNote: note,
        targetKeyId: `${note}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [],
        structuralGuideKeyIds: [...spec.allSurroundingWhiteKeyIds],
        modelLabelKeyIds: [...spec.landmarkKeyIds],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'guided') {
      const guidedIdx = noteRec?.guidedSuccesses ?? 0;
      const oct = ([4, 3, 5, 2] as const)[guidedIdx % 4];
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        targetNote: note,
        targetKeyId: `${note}${oct}`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [],
        structuralGuideKeyIds: getStructuralGuideForBlackNote(note, oct),
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'qualify') {
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: note,
        targetKeyId: null,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [],
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'localMix') {
      const mixRec = progress[getBlackKeyMixItemId(note)];
      const doneCount = mixRec?.independentUnhintedSuccesses ?? 0;
      const baseQueue = buildInitialBlackLocalMixQueue(note);
      const remaining = baseQueue.slice(doneCount);
      const activeQueue = remaining.length > 0 ? remaining : [note];
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: activeQueue[0],
        targetKeyId: null,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: activeQueue,
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    // delayedCheck (with reload restoration for pending corrective / intervening recall)
    const awaitingCorrective = Boolean(
      noteRec?.contexts.includes('pending:corrective')
    );
    const isInterveningRecall = Boolean(
      !awaitingCorrective &&
        noteRec?.contexts.includes('pending:interveningRecall')
    );
    return {
      step,
      config,
      progress,
      hintLevel: awaitingCorrective ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
      targetNote: isInterveningRecall ? spec.contrastAnchor : note,
      targetKeyId: null,
      identifyTargetKeyId: null,
      answerPool: [],
      identifyCompletedNotes: [],
      mixQueue: [],
      structuralGuideKeyIds: awaitingCorrective
        ? getStructuralGuideForBlackNote(note, 4)
        : [],
      modelLabelKeyIds: [],
      awaitingCorrective,
      awaitingRemediationPress: false,
      isInterveningRecall,
      feedbackText: awaitingCorrective
        ? `${spec.remediationHint.replace(/^Подсказка:\s*/, 'Подсказка: ')} Нажмите ${spec.displayLabel}, чтобы закрепить ориентир.`
        : isInterveningRecall
          ? `Сначала найдите опорную клавишу ${DISPLAY_NAMES[spec.contrastAnchor]}, затем повторим проверку ${spec.displayLabel}.`
          : '',
      feedbackTone: awaitingCorrective || isInterveningRecall ? 'warn' : ''
    };
  }

  if (desc.kind === 'blackIdentify' && desc.identifyStage) {
    const pool = [...getBlackIdentifyPoolForStage(desc.identifyStage)];
    const firstTarget = pool[0];
    return {
      step,
      config,
      progress,
      hintLevel: HINT_LEVEL.NONE,
      targetNote: firstTarget,
      targetKeyId: `${firstTarget}4`,
      identifyTargetKeyId: `${firstTarget}4`,
      answerPool: pool,
      identifyCompletedNotes: [],
      mixQueue: pool,
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      feedbackText: '',
      feedbackTone: ''
    };
  }

  if (desc.kind === 'allBlackMix') {
    const queue = buildInitialAllBlackMixQueue();
    return {
      step,
      config,
      progress,
      hintLevel: HINT_LEVEL.NONE,
      targetNote: queue[0],
      targetKeyId: null,
      identifyTargetKeyId: null,
      answerPool: [],
      identifyCompletedNotes: [],
      mixQueue: queue,
      structuralGuideKeyIds: [],
      modelLabelKeyIds: [],
      awaitingCorrective: false,
      awaitingRemediationPress: false,
      isInterveningRecall: false,
      feedbackText: '',
      feedbackTone: ''
    };
  }

  if (desc.phase === 5 && desc.focusWhiteNote) {
    const note = desc.focusWhiteNote;
    const noteRec = progress[getNotationNoteCurriculumItemId(note)];
    const mixRec = progress[getNotationNoteMixItemId(note)];

    if (desc.subStage === 'model') {
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        targetNote: note,
        targetKeyId: `${note}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [note],
        structuralGuideKeyIds: [`${note}4`],
        modelLabelKeyIds: [`${note}4`],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'qualify') {
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: note,
        targetKeyId: `${note}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [note],
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'localMix') {
      const doneCount = mixRec?.independentUnhintedSuccesses ?? 0;
      const baseQueue = buildInitialNotationLocalMixQueue(note);
      const remaining = baseQueue.slice(doneCount);
      const activeQueue = remaining.length > 0 ? remaining : [note];
      const currentTarget = activeQueue[0];
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: currentTarget,
        targetKeyId: `${currentTarget}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: activeQueue,
        structuralGuideKeyIds: [],
        modelLabelKeyIds: [],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    // delayedCheck (with reload restoration for pending corrective / intervening recall)
    const awaitingCorrective = Boolean(
      noteRec?.contexts.includes('pending:corrective')
    );
    const isInterveningRecall = Boolean(
      !awaitingCorrective &&
        noteRec?.contexts.includes('pending:interveningRecall')
    );
    const activeNote = isInterveningRecall
      ? getNotationContrastAnchor(note)
      : note;
    return {
      step,
      config,
      progress,
      hintLevel: awaitingCorrective ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
      targetNote: activeNote,
      targetKeyId: `${activeNote}4`,
      identifyTargetKeyId: null,
      answerPool: [],
      identifyCompletedNotes: [],
      mixQueue: [note],
      structuralGuideKeyIds: awaitingCorrective ? [`${note}4`] : [],
      modelLabelKeyIds: awaitingCorrective ? [`${note}4`] : [],
      awaitingCorrective,
      awaitingRemediationPress: false,
      isInterveningRecall,
      feedbackText: awaitingCorrective
        ? `Подсказка: нота ${DISPLAY_NAMES[note]} находится на стане. Нажмите подсвеченную клавишу ${DISPLAY_NAMES[note]} (${note}4) для закрепления.`
        : isInterveningRecall
          ? `Сначала сыграйте опорную ноту ${DISPLAY_NAMES[activeNote]} (${activeNote}4), затем повторим проверку ${DISPLAY_NAMES[note]} (${note}4).`
          : '',
      feedbackTone: awaitingCorrective || isInterveningRecall ? 'warn' : ''
    };
  }

  if (desc.phase === 6 && desc.focusWhiteNote) {
    const note = desc.focusWhiteNote;
    const noteRec = progress[getEarNoteCurriculumItemId(note)];
    const mixRec = progress[getEarNoteMixItemId(note)];

    if (desc.subStage === 'model') {
      const guideKeys = note === 'C' ? ['C4'] : ['C4', `${note}4`];
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        targetNote: note,
        targetKeyId: `${note}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [note],
        structuralGuideKeyIds: guideKeys,
        modelLabelKeyIds: [`${note}4`],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'qualify') {
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: note,
        targetKeyId: `${note}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: [note],
        structuralGuideKeyIds: ['C4'],
        modelLabelKeyIds: ['C4'],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    if (desc.subStage === 'localMix') {
      const doneCount = mixRec?.independentUnhintedSuccesses ?? 0;
      const baseQueue = buildInitialEarLocalMixQueue(note);
      const remaining = baseQueue.slice(doneCount);
      const activeQueue = remaining.length > 0 ? remaining : [note];
      const currentTarget = activeQueue[0];
      return {
        step,
        config,
        progress,
        hintLevel: HINT_LEVEL.NONE,
        targetNote: currentTarget,
        targetKeyId: `${currentTarget}4`,
        identifyTargetKeyId: null,
        answerPool: [],
        identifyCompletedNotes: [],
        mixQueue: activeQueue,
        structuralGuideKeyIds: ['C4'],
        modelLabelKeyIds: ['C4'],
        awaitingCorrective: false,
        awaitingRemediationPress: false,
        isInterveningRecall: false,
        feedbackText: '',
        feedbackTone: ''
      };
    }

    // delayedCheck (with reload restoration for pending corrective / intervening recall)
    const awaitingCorrective = Boolean(
      noteRec?.contexts.includes('pending:corrective')
    );
    const isInterveningRecall = Boolean(
      !awaitingCorrective &&
        noteRec?.contexts.includes('pending:interveningRecall')
    );
    const activeNote = isInterveningRecall ? getEarContrastAnchor(note) : note;
    return {
      step,
      config,
      progress,
      hintLevel: awaitingCorrective ? HINT_LEVEL.VISUAL_CUE : HINT_LEVEL.NONE,
      targetNote: activeNote,
      targetKeyId: `${activeNote}4`,
      identifyTargetKeyId: null,
      answerPool: [],
      identifyCompletedNotes: [],
      mixQueue: [note],
      structuralGuideKeyIds: awaitingCorrective ? ['C4', `${note}4`] : ['C4'],
      modelLabelKeyIds: awaitingCorrective ? [`${note}4`] : ['C4'],
      awaitingCorrective,
      awaitingRemediationPress: false,
      isInterveningRecall,
      feedbackText: awaitingCorrective
        ? `Подсказка: послушайте референс C4. Нажмите подсвеченную клавишу ${DISPLAY_NAMES[note]} (${note}4) для закрепления.`
        : isInterveningRecall
          ? `Сначала сыграйте опорную ноту ${DISPLAY_NAMES[activeNote]} (${activeNote}4), затем повторим проверку ${DISPLAY_NAMES[note]} (${note}4).`
          : '',
      feedbackTone: awaitingCorrective || isInterveningRecall ? 'warn' : ''
    };
  }

  // Phase 4 / 5 / 6 completion screens
  return {
    step,
    config,
    progress,
    hintLevel: HINT_LEVEL.NONE,
    targetNote: null,
    targetKeyId: null,
    identifyTargetKeyId: null,
    answerPool: [],
    identifyCompletedNotes: [],
    mixQueue: [],
    structuralGuideKeyIds: [],
    modelLabelKeyIds: [],
    awaitingCorrective: false,
    awaitingRemediationPress: false,
    isInterveningRecall: false,
    feedbackText: '',
    feedbackTone: ''
  };
}

export interface CreateMilestone3dStateOptions {
  learningProgress?: ProgressCollectionInput;
  cards?: ReadonlyMap<string, Card> | readonly Card[];
  reviewLogs?: readonly Partial<ReviewLogEvent>[];
  now?: number;
  initialStep?: Milestone3dStep;
  config?: Partial<Milestone3dConfig>;
}

function isCreateMilestone3dOptions(
  input: ProgressCollectionInput | CreateMilestone3dStateOptions | undefined
): input is CreateMilestone3dStateOptions {
  return (
    input !== null &&
    typeof input === 'object' &&
    !(input instanceof Map) &&
    !Array.isArray(input) &&
    ('learningProgress' in input ||
      'cards' in input ||
      'reviewLogs' in input ||
      'initialStep' in input ||
      'config' in input)
  );
}

export function createMilestone3dCurriculumState(
  input: ProgressCollectionInput | CreateMilestone3dStateOptions = {},
  nowArg = 0
): Milestone3dCurriculumState {
  const isOpts = isCreateMilestone3dOptions(input);
  const now = isOpts ? (input.now ?? nowArg) : nowArg;
  const config: Milestone3dConfig = {
    ...DEFAULT_MILESTONE_3D_CONFIG,
    ...(isOpts ? input.config : undefined)
  };
  const progress = hydrateMilestone3dProgress(
    isOpts
      ? {
          learningProgress: input.learningProgress,
          cards: input.cards,
          reviewLogs: input.reviewLogs,
          now
        }
      : { learningProgress: input as ProgressCollectionInput, now }
  );

  const step: Milestone3dStep =
    (isOpts ? input.initialStep : undefined) ??
    determineNextMilestone3dStep(progress, config);

  return buildMilestone3dStateForStep(step, progress, config);
}

export interface AdvanceMilestone3dResult {
  state: Milestone3dCurriculumState;
  outcome:
    | 'ignored'
    | 'progressed'
    | 'advanced'
    | 'wrong_note'
    | 'wrong_octave'
    | 'duplicate_context'
    | 'dont_know_revealed'
    | 'corrective_completed';
  updatedProgress: LearningProgressRecord[];
  trialContext: TrialContext | null;
  fsrsDelayedCheck: {
    skill: Skill;
    note: NoteName;
    isCorrect: boolean;
    answer: NoteName | null;
    answerKeyId: string | null;
  } | null;
}

export function advanceMilestone3dProgress(
  state: Milestone3dCurriculumState,
  action: Milestone3dAction
): AdvanceMilestone3dResult {
  const now = action.at ?? 0;
  const sessionId = action.sessionId ?? 'curriculum-3d';
  const desc = describeMilestone3dStep(state.step);
  const progress = { ...state.progress };
  const updatedProgress: LearningProgressRecord[] = [];

  const makeTrialCtx = (params: {
    mode:
      | 'model'
      | 'guided'
      | 'qualify'
      | 'corrective'
      | 'mixedRetrieval'
      | 'delayedCheck';
    hintLevel: HintLevel;
    contextId: string;
    cardId?: string;
    firstAttempt?: boolean;
  }): TrialContext =>
    createTrialContext({
      mode: params.mode,
      sessionId,
      cardId: params.cardId,
      hintLevel: params.hintLevel,
      firstAttempt: params.firstAttempt ?? true,
      contextId: params.contextId
    });

  const touchRecord = (rec: LearningProgressRecord) => {
    progress[rec.id] = rec;
    const idx = updatedProgress.findIndex(r => r.id === rec.id);
    if (idx >= 0) updatedProgress[idx] = rec;
    else updatedProgress.push(rec);
  };

  // Phase completion transitions
  if (action.type === 'advancePhase') {
    if (state.step === 'phase4Complete') {
      const rec = markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            progress[MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE],
            now
          ),
          now
        ),
        now
      );
      touchRecord(rec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    if (state.step === 'phase5Complete') {
      const rec = markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            progress[MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE],
            now
          ),
          now
        ),
        now
      );
      touchRecord(rec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    if (state.step === 'phase6Complete') {
      const rec = markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            progress[MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE],
            now
          ),
          now
        ),
        now
      );
      touchRecord(rec);
      return {
        state: { ...state, progress },
        outcome: 'advanced',
        updatedProgress,
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
  }

  // Handle Don't Know
  if (action.type === 'dontKnow') {
    if (!canUseDontKnowInMilestone3dStep(state)) {
      return {
        state,
        outcome: 'ignored',
        updatedProgress: [],
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    const target = state.targetNote ?? desc.focusBlackNote ?? 'C#';
    const guideIds = isBlackKeyNote(target)
      ? getStructuralGuideForBlackNote(target, 4)
      : desc.phase === 6
        ? ['C4', `${target}4`]
        : [`${target}4`];

    // For delayedCheck in Phase 4, Phase 5, Phase 6: persist remediation state immediately!
    if (desc.subStage === 'delayedCheck') {
      let focusRecordId: string | null = null;
      if (desc.kind === 'blackAcquisition' && desc.focusBlackNote) {
        focusRecordId = getBlackKeyCurriculumItemId(desc.focusBlackNote);
      } else if (desc.phase === 5 && desc.focusWhiteNote) {
        focusRecordId = getNotationNoteCurriculumItemId(desc.focusWhiteNote);
      } else if (desc.phase === 6 && desc.focusWhiteNote) {
        focusRecordId = getEarNoteCurriculumItemId(desc.focusWhiteNote);
      }

      if (focusRecordId && progress[focusRecordId]) {
        let noteRec = progress[focusRecordId];
        noteRec = {
          ...noteRec,
          contexts: appendUniqueContext(
            appendUniqueContext(noteRec.contexts, 'pending:delayedRetry'),
            'pending:corrective'
          ),
          updatedAt: now
        };
        touchRecord(noteRec);

        const feedbackText = isBlackKeyNote(target)
          ? BLACK_KEY_GEOMETRY[target].remediationHint
          : desc.phase === 6
            ? `Подсказка: послушайте референс C4. Нажмите подсвеченную клавишу ${DISPLAY_NAMES[target]} (${target}4) для закрепления.`
            : `Подсказка: нажмите клавишу ${DISPLAY_NAMES[target]} (${target}4).`;

        return {
          state: {
            ...state,
            progress,
            hintLevel: HINT_LEVEL.VISUAL_CUE,
            awaitingCorrective: true,
            awaitingRemediationPress: true,
            structuralGuideKeyIds: guideIds,
            modelLabelKeyIds: desc.phase >= 5 ? [`${target}4`] : [],
            feedbackText,
            feedbackTone: 'warn'
          },
          outcome: 'dont_know_revealed',
          updatedProgress,
          trialContext: makeTrialCtx({
            mode: 'delayedCheck',
            hintLevel: HINT_LEVEL.VISUAL_CUE,
            contextId: `dontknow:${state.step}`,
            firstAttempt: false
          }),
          fsrsDelayedCheck: null
        };
      }
    }

    return {
      state: {
        ...state,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        awaitingRemediationPress: true,
        structuralGuideKeyIds: guideIds,
        modelLabelKeyIds: desc.phase >= 5 ? [`${target}4`] : [],
        feedbackText: isBlackKeyNote(target)
          ? BLACK_KEY_GEOMETRY[target].remediationHint
          : `Подсказка: нажмите клавишу ${DISPLAY_NAMES[target]} (${target}4).`,
        feedbackTone: 'warn'
      },
      outcome: 'dont_know_revealed',
      updatedProgress: [],
      trialContext: makeTrialCtx({
        mode: desc.subStage === 'delayedCheck' ? 'delayedCheck' : 'qualify',
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        contextId: `dontknow:${state.step}`
      }),
      fsrsDelayedCheck: null
    };
  }

  // Handle Black Key Acquisition (Phase 4)
  if (desc.kind === 'blackAcquisition' && desc.focusBlackNote) {
    if (action.type !== 'keyPress') {
      return {
        state,
        outcome: 'ignored',
        updatedProgress: [],
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }

    const focus = desc.focusBlackNote;
    const spec = BLACK_KEY_GEOMETRY[focus];
    const noteId = getBlackKeyCurriculumItemId(focus);
    const mixId = getBlackKeyMixItemId(focus);
    let noteRec = progress[noteId];
    let mixRec = progress[mixId];

    const expectedNote = state.targetNote ?? focus;
    const isCorrect = action.note === expectedNote;
    const pressedOctaveMatch = action.keyId?.match(/([2-5])$/);
    const regionCtx = pressedOctaveMatch
      ? `region-${expectedNote}${pressedOctaveMatch[1]}`
      : `region-${expectedNote}4`;

    // 1. Model (H3)
    if (desc.subStage === 'model') {
      const ctx = makeTrialCtx({
        mode: 'model',
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        contextId: `model:${regionCtx}`
      });
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildBlackKeyContrastFeedback(focus, action.note),
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      noteRec = recordModelCompleted(noteRec, now, `model:${regionCtx}`);
      touchRecord(noteRec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 2. Guided (H2)
    if (desc.subStage === 'guided') {
      const ctx = makeTrialCtx({
        mode: 'guided',
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        contextId: `guided:${regionCtx}`
      });
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildBlackKeyContrastFeedback(focus, action.note),
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      noteRec = recordGuidedAttempt(noteRec, {
        correct: true,
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        contextId: `guided:${regionCtx}`,
        at: now
      });
      touchRecord(noteRec);
      if (noteRec.guidedSuccesses >= state.config.guidedSuccessTarget) {
        const nextStep = determineNextMilestone3dStep(progress, state.config);
        return {
          state: buildMilestone3dStateForStep(nextStep, progress, state.config),
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      const nextOct = ([4, 3, 5, 2] as const)[noteRec.guidedSuccesses % 4];
      return {
        state: {
          ...state,
          progress,
          targetKeyId: `${focus}${nextOct}`,
          structuralGuideKeyIds: getStructuralGuideForBlackNote(focus, nextOct),
          feedbackText: `✓ Верно! Ещё раз найдите ${spec.displayLabel} между ${spec.adjacentWhiteNotes[0]} и ${spec.adjacentWhiteNotes[1]}.`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 3. Qualify (H0 across >= 2 distinct octaves)
    if (desc.subStage === 'qualify') {
      if (state.awaitingCorrective || state.awaitingRemediationPress) {
        const ctx = makeTrialCtx({
          mode: 'corrective',
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          contextId: `corrective:${regionCtx}`,
          firstAttempt: false
        });
        if (!isCorrect) {
          return {
            state: {
              ...state,
              feedbackText: buildBlackKeyContrastFeedback(focus, action.note),
              feedbackTone: 'bad'
            },
            outcome: 'wrong_note',
            updatedProgress: [],
            trialContext: ctx,
            fsrsDelayedCheck: null
          };
        }
        return {
          state: {
            ...state,
            hintLevel: HINT_LEVEL.NONE,
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            structuralGuideKeyIds: [],
            modelLabelKeyIds: [],
            feedbackText: `✓ Ориентир восстановлен! Теперь найдите ${spec.displayLabel} без подсказок в разных октавах.`,
            feedbackTone: 'warn'
          },
          outcome: 'corrective_completed',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      const ctx = makeTrialCtx({
        mode: 'qualify',
        hintLevel: HINT_LEVEL.NONE,
        contextId: regionCtx
      });

      if (!isCorrect) {
        // Reset unhinted qualify streak and show H2 surrounding white boundary guide
        noteRec = {
          ...noteRec,
          independentUnhintedSuccesses: 0,
          contexts: noteRec.contexts.filter(c => !isValidBlackKeyRegionContext(c)),
          updatedAt: now
        };
        touchRecord(noteRec);
        return {
          state: {
            ...state,
            progress,
            hintLevel: HINT_LEVEL.VISUAL_CUE,
            awaitingCorrective: true,
            structuralGuideKeyIds: getStructuralGuideForBlackNote(focus, 4),
            feedbackText: `${buildBlackKeyContrastFeedback(focus, action.note)} Нажмите ${spec.displayLabel} для закрепления.`,
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      const existingRegions = getUnhintedBlackNoteContexts(noteRec);
      if (existingRegions.includes(regionCtx)) {
        return {
          state: {
            ...state,
            feedbackText: `✓ Это тоже ${spec.displayLabel}, но в той же октаве. Нажмите ${spec.displayLabel} в другой октаве клавиатуры!`,
            feedbackTone: 'warn'
          },
          outcome: 'duplicate_context',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      noteRec = recordIndependentAttempt(noteRec, {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: regionCtx,
        at: now
      });
      const updatedRegions = getUnhintedBlackNoteContexts(noteRec);
      if (updatedRegions.length >= state.config.qualifySuccessTarget) {
        noteRec = markMixReady(noteRec, now);
        touchRecord(noteRec);
        const nextStep = determineNextMilestone3dStep(progress, state.config);
        return {
          state: buildMilestone3dStateForStep(nextStep, progress, state.config),
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          feedbackText: `✓ Отлично (${updatedRegions.length}/${state.config.qualifySuccessTarget})! Теперь найдите ${spec.displayLabel} в другой октаве.`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 4. Local Mix (H0)
    if (desc.subStage === 'localMix') {
      const ctx = makeTrialCtx({
        mode: 'mixedRetrieval',
        hintLevel: HINT_LEVEL.NONE,
        contextId: `mix:${focus}:${expectedNote}`
      });
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildBlackKeyContrastFeedback(expectedNote, action.note),
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      mixRec = recordIndependentAttempt(mixRec, {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `mix:${expectedNote}:${mixRec.independentUnhintedSuccesses + 1}`,
        at: now
      });
      const mixTarget =
        focus === 'D#' || focus === 'A#'
          ? state.config.familyMixTarget
          : state.config.localMixSuccessTarget;

      if (mixRec.independentUnhintedSuccesses >= mixTarget) {
        mixRec = markMixReady(mixRec, now);
        touchRecord(mixRec);
        const nextStep = determineNextMilestone3dStep(progress, state.config);
        return {
          state: buildMilestone3dStateForStep(nextStep, progress, state.config),
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      touchRecord(mixRec);
      const nextQueue = state.mixQueue.slice(1);
      const pool = getBlackKeyLocalMixPool(focus);
      const nextTarget =
        nextQueue[0] ??
        pool[mixRec.independentUnhintedSuccesses % pool.length];
      return {
        state: {
          ...state,
          progress,
          targetNote: nextTarget,
          mixQueue: nextQueue.length > 0 ? nextQueue : [nextTarget],
          feedbackText: `✓ Верно (${mixRec.independentUnhintedSuccesses}/${mixTarget})!`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 5. Delayed Check (H0 -> FSRS eligible!)
    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const ctx = makeTrialCtx({
        mode: 'corrective',
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        contextId: `delayed-corrective:${focus}`,
        firstAttempt: false
      });
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildBlackKeyContrastFeedback(focus, action.note),
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      // Enter intervening recall on contrast white anchor before retrying H0 delayedCheck
      noteRec = {
        ...noteRec,
        contexts: appendUniqueContext(
          noteRec.contexts.filter(c => c !== 'pending:corrective'),
          'pending:interveningRecall'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          hintLevel: HINT_LEVEL.NONE,
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          isInterveningRecall: true,
          targetNote: spec.contrastAnchor,
          structuralGuideKeyIds: [],
          modelLabelKeyIds: [],
          feedbackText: `✓ Ориентир закреплён. Сначала найдите опорную клавишу ${DISPLAY_NAMES[spec.contrastAnchor]}, затем повторим проверку ${spec.displayLabel}.`,
          feedbackTone: 'warn'
        },
        outcome: 'corrective_completed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    if (state.isInterveningRecall) {
      const ctx = makeTrialCtx({
        mode: 'mixedRetrieval',
        hintLevel: HINT_LEVEL.NONE,
        contextId: `intervening:${expectedNote}`
      });
      if (!isCorrect) {
        return {
          state: {
            ...state,
            feedbackText: buildBlackKeyContrastFeedback(expectedNote, action.note),
            feedbackTone: 'bad'
          },
          outcome: 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      noteRec = {
        ...noteRec,
        contexts: noteRec.contexts.filter(
          c => c !== 'pending:interveningRecall' && c !== 'pending:corrective'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          isInterveningRecall: false,
          targetNote: focus,
          hintLevel: HINT_LEVEL.NONE,
          structuralGuideKeyIds: [],
          modelLabelKeyIds: [],
          feedbackText: `✓ Отлично! Теперь повторная проверка по памяти: найдите ${spec.displayLabel} без подсказки.`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // Unhinted H0 delayedCheck -> FSRS eligible!
    const ctx = makeTrialCtx({
      mode: 'delayedCheck',
      hintLevel: HINT_LEVEL.NONE,
      cardId: `find:${focus}`,
      contextId: `delayed:${focus}`
    });

    if (!isCorrect) {
      noteRec = {
        ...noteRec,
        contexts: appendUniqueContext(
          appendUniqueContext(noteRec.contexts, 'pending:delayedRetry'),
          'pending:corrective'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          awaitingCorrective: true,
          structuralGuideKeyIds: getStructuralGuideForBlackNote(focus, 4),
          feedbackText: `${buildBlackKeyContrastFeedback(focus, action.note)} Нажмите ${spec.displayLabel}, чтобы закрепить ориентир.`,
          feedbackTone: 'bad'
        },
        outcome: 'wrong_note',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: {
          skill: 'find',
          note: focus,
          isCorrect: false,
          answer: action.note,
          answerKeyId: action.keyId ?? null
        }
      };
    }

    noteRec = {
      ...markFsrsActivated(noteRec, now),
      contexts: noteRec.contexts.filter(
        c =>
          c !== 'pending:delayedRetry' &&
          c !== 'pending:corrective' &&
          c !== 'pending:interveningRecall'
      )
    };
    touchRecord(noteRec);
    const nextStep = determineNextMilestone3dStep(progress, state.config);
    return {
      state: buildMilestone3dStateForStep(nextStep, progress, state.config),
      outcome: 'advanced',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: {
        skill: 'find',
        note: focus,
        isCorrect: true,
        answer: action.note,
        answerKeyId: action.keyId ?? null
      }
    };
  }

  // Handle Black Identify Stages
  if (desc.kind === 'blackIdentify' && desc.identifyStage) {
    if (action.type !== 'semanticAnswer') {
      return {
        state,
        outcome: 'ignored',
        updatedProgress: [],
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    const itemId =
      desc.identifyStage === 'twoBlackIdentify'
        ? MILESTONE_3D_ITEM_IDS.IDENTIFY_TWO_BLACK
        : desc.identifyStage === 'threeBlackIdentify'
          ? MILESTONE_3D_ITEM_IDS.IDENTIFY_THREE_BLACK
          : MILESTONE_3D_ITEM_IDS.IDENTIFY_ALL_BLACK;
    let idRec = progress[itemId];
    const expected = state.targetNote ?? state.answerPool[0];
    const isCorrect = action.note === expected;
    const ctx = makeTrialCtx({
      mode: 'mixedRetrieval',
      hintLevel: HINT_LEVEL.NONE,
      contextId: `identify:${expected}`
    });

    if (!isCorrect) {
      return {
        state: {
          ...state,
          feedbackText: buildBlackKeyContrastFeedback(expected, action.note),
          feedbackTone: 'bad'
        },
        outcome: 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const nextCompleted = state.identifyCompletedNotes.includes(expected)
      ? state.identifyCompletedNotes
      : [...state.identifyCompletedNotes, expected];
    idRec = recordIndependentAttempt(idRec, {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: `identify:${expected}`,
      at: now
    });

    if (nextCompleted.length >= state.answerPool.length) {
      idRec = markFsrsActivated(markMixReady(idRec, now), now);
      touchRecord(idRec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    touchRecord(idRec);
    const remaining = state.answerPool.filter(n => !nextCompleted.includes(n));
    const nextTarget = remaining[0] ?? state.answerPool[0];
    const nextOct = ([4, 3, 5, 2] as const)[nextCompleted.length % 4];
    return {
      state: {
        ...state,
        progress,
        targetNote: nextTarget,
        targetKeyId: `${nextTarget}${nextOct}`,
        identifyTargetKeyId: `${nextTarget}${nextOct}`,
        identifyCompletedNotes: nextCompleted,
        feedbackText: `✓ Верно (${nextCompleted.length}/${state.answerPool.length})!`,
        feedbackTone: 'good'
      },
      outcome: 'progressed',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Handle All-Black Mix
  if (desc.kind === 'allBlackMix') {
    if (action.type !== 'keyPress') {
      return {
        state,
        outcome: 'ignored',
        updatedProgress: [],
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    const expected = state.targetNote ?? 'C#';
    const isCorrect = action.note === expected;
    const ctx = makeTrialCtx({
      mode: 'mixedRetrieval',
      hintLevel: HINT_LEVEL.NONE,
      contextId: `allBlackMix:${expected}`
    });
    if (!isCorrect) {
      return {
        state: {
          ...state,
          feedbackText: buildBlackKeyContrastFeedback(expected, action.note),
          feedbackTone: 'bad'
        },
        outcome: 'wrong_note',
        updatedProgress: [],
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }
    let mixRec = progress[MILESTONE_3D_ITEM_IDS.MIX_ALL_BLACK];
    mixRec = recordIndependentAttempt(mixRec, {
      correct: true,
      hinted: false,
      hintLevel: HINT_LEVEL.NONE,
      contextId: `allBlack:${expected}:${mixRec.independentUnhintedSuccesses + 1}`,
      at: now
    });
    if (mixRec.independentUnhintedSuccesses >= state.config.allBlackMixTarget) {
      mixRec = markFsrsActivated(markMixReady(mixRec, now), now);
      touchRecord(mixRec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }
    touchRecord(mixRec);
    const nextQueue = state.mixQueue.slice(1);
    const nextTarget =
      nextQueue[0] ??
      BLACK_KEY_ACQUISITION_ORDER[
        mixRec.independentUnhintedSuccesses % BLACK_KEY_ACQUISITION_ORDER.length
      ];
    return {
      state: {
        ...state,
        progress,
        targetNote: nextTarget,
        mixQueue: nextQueue.length > 0 ? nextQueue : [nextTarget],
        feedbackText: `✓ Верно (${mixRec.independentUnhintedSuccesses}/${state.config.allBlackMixTarget})!`,
        feedbackTone: 'good'
      },
      outcome: 'progressed',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: null
    };
  }

  // Handle Phase 5 (Notation) & Phase 6 (Ear) per-note — Both require exact octave 4 (`${targetNote}4`)
  if ((desc.phase === 5 || desc.phase === 6) && desc.focusWhiteNote) {
    if (action.type !== 'keyPress') {
      return {
        state,
        outcome: 'ignored',
        updatedProgress: [],
        trialContext: null,
        fsrsDelayedCheck: null
      };
    }
    const skill: Skill = desc.phase === 5 ? 'notationToKey' : 'soundToKey';
    const focus = desc.focusWhiteNote;
    const noteId =
      desc.phase === 5
        ? getNotationNoteCurriculumItemId(focus)
        : getEarNoteCurriculumItemId(focus);
    const mixId =
      desc.phase === 5
        ? getNotationNoteMixItemId(focus)
        : getEarNoteMixItemId(focus);

    let noteRec = progress[noteId];
    let mixRec = progress[mixId];

    const expectedNote = (state.targetNote ?? focus) as WhiteKeyNote;
    const expectedKeyId = state.targetKeyId ?? `${expectedNote}4`;
    const isExactMatch = action.keyId
      ? action.keyId === expectedKeyId
      : action.note === expectedNote;
    const isOctaveMismatch =
      action.note === expectedNote &&
      !!action.keyId &&
      action.keyId !== expectedKeyId;

    // 1. Model (H3)
    if (desc.subStage === 'model') {
      const ctx = makeTrialCtx({
        mode: 'model',
        hintLevel: HINT_LEVEL.MODEL_VISIBLE,
        contextId: `model:${skill}:${expectedKeyId}`
      });
      if (!isExactMatch) {
        return {
          state: {
            ...state,
            feedbackText: isOctaveMismatch
              ? `Нота верная (${DISPLAY_NAMES[expectedNote]}), но нужна именно 1-я октава: ${expectedKeyId}.`
              : `Нажмите подсвеченную клавишу ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
            feedbackTone: 'bad'
          },
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      noteRec = recordModelCompleted(
        noteRec,
        now,
        `model:${skill}:${expectedKeyId}`
      );
      touchRecord(noteRec);
      const nextStep = determineNextMilestone3dStep(progress, state.config);
      return {
        state: buildMilestone3dStateForStep(nextStep, progress, state.config),
        outcome: 'advanced',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 2. Qualify (H0 on the newly modeled note only)
    if (desc.subStage === 'qualify') {
      if (state.awaitingCorrective || state.awaitingRemediationPress) {
        const ctx = makeTrialCtx({
          mode: 'corrective',
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          contextId: `corrective:${skill}:${expectedKeyId}`,
          firstAttempt: false
        });
        if (!isExactMatch) {
          return {
            state: {
              ...state,
              feedbackText: isOctaveMismatch
                ? `✗ Не та октава: нажмите подсвеченную ${expectedKeyId} (в первой октаве C4–B4).`
                : `✗ Это ${DISPLAY_NAMES[action.note]}. Нажмите подсвеченную ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
              feedbackTone: 'bad'
            },
            outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
            updatedProgress: [],
            trialContext: ctx,
            fsrsDelayedCheck: null
          };
        }
        return {
          state: {
            ...state,
            hintLevel: HINT_LEVEL.NONE,
            awaitingCorrective: false,
            awaitingRemediationPress: false,
            structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
            modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
            feedbackText: `✓ Ориентир восстановлен! Теперь найдите ${DISPLAY_NAMES[focus]} (${focus}4) без подсказки.`,
            feedbackTone: 'warn'
          },
          outcome: 'corrective_completed',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      const ctx = makeTrialCtx({
        mode: 'qualify',
        hintLevel: HINT_LEVEL.NONE,
        contextId: `qualify:${skill}:${expectedKeyId}`
      });
      if (!isExactMatch) {
        noteRec = {
          ...noteRec,
          independentUnhintedSuccesses: 0,
          contexts: noteRec.contexts.filter(c => c.startsWith('model:')),
          updatedAt: now
        };
        touchRecord(noteRec);
        return {
          state: {
            ...state,
            progress,
            hintLevel: HINT_LEVEL.VISUAL_CUE,
            awaitingCorrective: true,
            structuralGuideKeyIds:
              desc.phase === 6 ? ['C4', `${focus}4`] : [`${focus}4`],
            modelLabelKeyIds: [`${focus}4`],
            feedbackText: isOctaveMismatch
              ? `✗ Не та октава: нажата ${action.keyId}, а требуется ${expectedKeyId}. Нажмите подсвеченную ${expectedKeyId} для закрепления.`
              : `✗ Это ${DISPLAY_NAMES[action.note]}. Требуется ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}). Нажмите подсвеченную ${expectedKeyId}.`,
            feedbackTone: 'bad'
          },
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      noteRec = recordIndependentAttempt(noteRec, {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `${skill}:${expectedKeyId}:${noteRec.independentUnhintedSuccesses + 1}`,
        at: now
      });

      const qualifyTarget =
        desc.phase === 5
          ? state.config.notationQualifyTarget
          : state.config.earQualifyTarget;

      if (noteRec.independentUnhintedSuccesses >= qualifyTarget) {
        noteRec = markMixReady(noteRec, now);
        touchRecord(noteRec);
        const nextStep = determineNextMilestone3dStep(progress, state.config);
        return {
          state: buildMilestone3dStateForStep(nextStep, progress, state.config),
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          targetNote: focus,
          targetKeyId: `${focus}4`,
          structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
          modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
          feedbackText: `✓ Верно (${noteRec.independentUnhintedSuccesses}/${qualifyTarget})! Ещё раз подтвердите ${DISPLAY_NAMES[focus]} (${focus}4).`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 3. Local Mix (H0 mixing ONLY already-modeled notes up to `focus`)
    if (desc.subStage === 'localMix') {
      if (state.awaitingRemediationPress) {
        const ctx = makeTrialCtx({
          mode: 'corrective',
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          contextId: `mix-corrective:${skill}:${expectedKeyId}`,
          firstAttempt: false
        });
        if (!isExactMatch) {
          return {
            state: {
              ...state,
              feedbackText: isOctaveMismatch
                ? `✗ Не та октава: нажмите ${expectedKeyId}.`
                : `✗ Это ${DISPLAY_NAMES[action.note]}. Нажмите подсвеченную ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
              feedbackTone: 'bad'
            },
            outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
            updatedProgress: [],
            trialContext: ctx,
            fsrsDelayedCheck: null
          };
        }
        return {
          state: {
            ...state,
            hintLevel: HINT_LEVEL.NONE,
            awaitingRemediationPress: false,
            structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
            modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
            feedbackText: `✓ Ориентир восстановлен! Продолжаем упражнение без подсказок.`,
            feedbackTone: 'warn'
          },
          outcome: 'corrective_completed',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      const ctx = makeTrialCtx({
        mode: 'mixedRetrieval',
        hintLevel: HINT_LEVEL.NONE,
        contextId: `mix:${skill}:${focus}:${expectedKeyId}`
      });
      if (!isExactMatch) {
        return {
          state: {
            ...state,
            feedbackText: isOctaveMismatch
              ? `✗ Не та октава: нажата ${action.keyId}, а требуется ${expectedKeyId} (в первой октаве C4–B4).`
              : `✗ Это ${DISPLAY_NAMES[action.note]}. Требуется ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
            feedbackTone: 'bad'
          },
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      mixRec = recordIndependentAttempt(mixRec, {
        correct: true,
        hinted: false,
        hintLevel: HINT_LEVEL.NONE,
        contextId: `mix:${skill}:${expectedKeyId}:${mixRec.independentUnhintedSuccesses + 1}`,
        at: now
      });

      const mixTarget =
        desc.phase === 5
          ? state.config.notationLocalMixTarget
          : state.config.earLocalMixTarget;

      if (mixRec.independentUnhintedSuccesses >= mixTarget) {
        mixRec = markMixReady(mixRec, now);
        touchRecord(mixRec);
        const nextStep = determineNextMilestone3dStep(progress, state.config);
        return {
          state: buildMilestone3dStateForStep(nextStep, progress, state.config),
          outcome: 'advanced',
          updatedProgress,
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }

      touchRecord(mixRec);
      const nextQueue = state.mixQueue.slice(1);
      const pool =
        desc.phase === 5
          ? getNotationLocalMixPool(focus)
          : getEarLocalMixPool(focus);
      const nextNote =
        (nextQueue[0] as WhiteKeyNote | undefined) ??
        pool[mixRec.independentUnhintedSuccesses % pool.length];
      return {
        state: {
          ...state,
          progress,
          targetNote: nextNote,
          targetKeyId: `${nextNote}4`,
          mixQueue: nextQueue.length > 0 ? nextQueue : [nextNote],
          structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
          modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
          feedbackText: `✓ Верно (${mixRec.independentUnhintedSuccesses}/${mixTarget})!`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    // 4. Delayed Check (H0 -> FSRS eligible for `notationToKey:${focus}` or `soundToKey:${focus}`)
    const contrastAnchor =
      desc.phase === 5
        ? getNotationContrastAnchor(focus)
        : getEarContrastAnchor(focus);

    if (state.awaitingCorrective || state.awaitingRemediationPress) {
      const ctx = makeTrialCtx({
        mode: 'corrective',
        hintLevel: HINT_LEVEL.VISUAL_CUE,
        contextId: `delayed-corrective:${skill}:${focus}4`,
        firstAttempt: false
      });
      if (!isExactMatch) {
        return {
          state: {
            ...state,
            feedbackText: isOctaveMismatch
              ? `✗ Не та октава: нажмите подсвеченную ${expectedKeyId}.`
              : `✗ Это ${DISPLAY_NAMES[action.note]}. Нажмите подсвеченную ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
            feedbackTone: 'bad'
          },
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      // Transition from corrective (H2) -> intervening recall (H0, non-FSRS)
      noteRec = {
        ...noteRec,
        contexts: appendUniqueContext(
          noteRec.contexts.filter(c => c !== 'pending:corrective'),
          'pending:interveningRecall'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          hintLevel: HINT_LEVEL.NONE,
          awaitingCorrective: false,
          awaitingRemediationPress: false,
          isInterveningRecall: true,
          targetNote: contrastAnchor,
          targetKeyId: `${contrastAnchor}4`,
          structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
          modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
          feedbackText: `✓ Ориентир закреплён. Сначала сыграйте опорную ноту ${DISPLAY_NAMES[contrastAnchor]} (${contrastAnchor}4), затем повторим проверку ${DISPLAY_NAMES[focus]} (${focus}4).`,
          feedbackTone: 'warn'
        },
        outcome: 'corrective_completed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    if (state.isInterveningRecall) {
      const ctx = makeTrialCtx({
        mode: 'mixedRetrieval',
        hintLevel: HINT_LEVEL.NONE,
        contextId: `intervening:${skill}:${expectedKeyId}`
      });
      if (!isExactMatch) {
        return {
          state: {
            ...state,
            feedbackText: isOctaveMismatch
              ? `✗ Не та октава: нажмите ${expectedKeyId}.`
              : `✗ Это ${DISPLAY_NAMES[action.note]}. Сначала сыграйте ${DISPLAY_NAMES[expectedNote]} (${expectedKeyId}).`,
            feedbackTone: 'bad'
          },
          outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
          updatedProgress: [],
          trialContext: ctx,
          fsrsDelayedCheck: null
        };
      }
      // Completed intervening recall -> return to clean H0 delayedCheck retry for `focus`
      noteRec = {
        ...noteRec,
        contexts: noteRec.contexts.filter(
          c => c !== 'pending:interveningRecall' && c !== 'pending:corrective'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          isInterveningRecall: false,
          targetNote: focus,
          targetKeyId: `${focus}4`,
          hintLevel: HINT_LEVEL.NONE,
          structuralGuideKeyIds: desc.phase === 6 ? ['C4'] : [],
          modelLabelKeyIds: desc.phase === 6 ? ['C4'] : [],
          feedbackText: `✓ Отлично! Теперь повторная независимая проверка: сыграйте ${DISPLAY_NAMES[focus]} (${focus}4) без подсказок.`,
          feedbackTone: 'good'
        },
        outcome: 'progressed',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: null
      };
    }

    const ctx = makeTrialCtx({
      mode: 'delayedCheck',
      hintLevel: HINT_LEVEL.NONE,
      cardId: `${skill}:${focus}`,
      contextId: `delayed:${skill}:${focus}4`
    });
    if (!isExactMatch) {
      noteRec = {
        ...noteRec,
        contexts: appendUniqueContext(
          appendUniqueContext(noteRec.contexts, 'pending:delayedRetry'),
          'pending:corrective'
        ),
        updatedAt: now
      };
      touchRecord(noteRec);
      return {
        state: {
          ...state,
          progress,
          hintLevel: HINT_LEVEL.VISUAL_CUE,
          awaitingCorrective: true,
          structuralGuideKeyIds:
            desc.phase === 6 ? ['C4', `${focus}4`] : [`${focus}4`],
          modelLabelKeyIds: [`${focus}4`],
          feedbackText: isOctaveMismatch
            ? `✗ Не та октава: нажата ${action.keyId}, а требуется ${focus}4. Нажмите подсвеченную ${focus}4 для закрепления.`
            : `✗ Это ${DISPLAY_NAMES[action.note]}. Требуется ${DISPLAY_NAMES[focus]} (${focus}4). Нажмите подсвеченную ${focus}4 для закрепления.`,
          feedbackTone: 'bad'
        },
        outcome: isOctaveMismatch ? 'wrong_octave' : 'wrong_note',
        updatedProgress,
        trialContext: ctx,
        fsrsDelayedCheck: {
          skill,
          note: focus,
          isCorrect: false,
          answer: action.note,
          answerKeyId: action.keyId ?? null
        }
      };
    }

    noteRec = {
      ...markFsrsActivated(markMixReady(noteRec, now), now),
      contexts: noteRec.contexts.filter(
        c =>
          c !== 'pending:delayedRetry' &&
          c !== 'pending:corrective' &&
          c !== 'pending:interveningRecall'
      )
    };
    touchRecord(noteRec);
    const nextStep = determineNextMilestone3dStep(progress, state.config);
    return {
      state: buildMilestone3dStateForStep(nextStep, progress, state.config),
      outcome: 'advanced',
      updatedProgress,
      trialContext: ctx,
      fsrsDelayedCheck: {
        skill,
        note: focus,
        isCorrect: true,
        answer: action.note,
        answerKeyId: action.keyId ?? null
      }
    };
  }

  return {
    state,
    outcome: 'ignored',
    updatedProgress: [],
    trialContext: null,
    fsrsDelayedCheck: null
  };
}

export interface ApplyMilestone3dActionWithCardsParams {
  state: Milestone3dCurriculumState;
  action: Milestone3dAction;
  cards: Map<string, Card> | readonly Card[];
  settings: Pick<
    UserSettings,
    | 'desiredRetention'
    | 'maxIntervalDays'
    | 'relearningSeconds'
    | 'useLatencyGrading'
  >;
  reviewLog: readonly ReviewLogEvent[];
  responseMs?: number;
  reviewedAt?: number;
}

export interface ApplyMilestone3dActionWithCardsResult
  extends AdvanceMilestone3dResult {
  ignoredInput: boolean;
  mutatedCard: Card | null;
  attemptResult: SubmitQuestionAttemptResult | null;
}

export function applyMilestone3dActionWithCards(
  params: ApplyMilestone3dActionWithCardsParams
): ApplyMilestone3dActionWithCardsResult {
  const reviewedAt = params.reviewedAt ?? params.action.at ?? Date.now();
  const responseMs = params.responseMs ?? 650;

  const advanceRes = advanceMilestone3dProgress(params.state, {
    ...params.action,
    at: reviewedAt
  });

  if (advanceRes.outcome === 'ignored') {
    return {
      ...advanceRes,
      ignoredInput: true,
      mutatedCard: null,
      attemptResult: null
    };
  }

  let mutatedCard: Card | null = null;
  let attemptResult: SubmitQuestionAttemptResult | null = null;

  if (
    advanceRes.fsrsDelayedCheck &&
    advanceRes.trialContext &&
    advanceRes.trialContext.gradeableByFsrs
  ) {
    const { skill, note, isCorrect, answer, answerKeyId } =
      advanceRes.fsrsDelayedCheck;
    const cardId = `${skill}:${note}`;
    const cardRef =
      params.cards instanceof Map
        ? params.cards.get(cardId)
        : params.cards.find(c => c.id === cardId);

    if (cardRef) {
      const roundState: QuestionRoundState = {
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        isCompleted: false,
        isLocked: false
      };
      attemptResult = submitQuestionAttempt({
        state: roundState,
        card: cardRef,
        kind: cardRef.reps > 0 ? 'scheduled' : 'new',
        isCorrect,
        answer,
        answerKeyId,
        hintUsedOnFirstAttempt: false,
        responseMs,
        settings: params.settings,
        reviewLog: params.reviewLog,
        sessionId: params.action.sessionId || 'session-3d',
        reviewedAt,
        trialContext: advanceRes.trialContext
      });
      if (attemptResult.cardMutated) {
        mutatedCard = cardRef;
      }
    }
  }

  return {
    ...advanceRes,
    ignoredInput: false,
    mutatedCard,
    attemptResult
  };
}

export interface Milestone3dStepProgressInfo {
  step: Milestone3dStep;
  phase: 4 | 5 | 6;
  progressPct: number;
  headerMeta: string;
  headerTitle: string;
  stepLabel: string;
}

export function getMilestone3dStepProgress(
  state: Pick<Milestone3dCurriculumState, 'step' | 'progress'>
): Milestone3dStepProgressInfo {
  const desc = describeMilestone3dStep(state.step);
  const idx = MILESTONE_3D_STEPS.indexOf(state.step);
  const total = MILESTONE_3D_STEPS.length - 1;
  const progressPct =
    state.step === 'phase6Complete'
      ? 100
      : Math.max(8, Math.min(99, Math.round(((idx + 1) / total) * 100)));

  if (desc.phase === 4) {
    const masteredBlack = BLACK_KEY_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getBlackKeyCurriculumItemId(n)];
      return (
        rec?.state === 'retention' &&
        !rec.contexts.includes('pending:delayedRetry')
      );
    }).length;
    const headerTitle = `Чёрные клавиши · ${
      state.step === 'phase4Complete' ? 5 : Math.min(5, masteredBlack)
    } из 5`;
    let stepLabel = 'Геометрия и энгармонизм';
    if (desc.kind === 'phase4Complete') {
      stepLabel = 'Все 5 чёрных клавиш освоены';
    } else if (desc.kind === 'allBlackMix') {
      stepLabel = 'Итоговое смешивание C♯–A♯';
    } else if (desc.kind === 'blackIdentify') {
      stepLabel = 'Распознавание диезов и бемолей';
    } else if (desc.focusBlackNote) {
      stepLabel = BLACK_KEY_GEOMETRY[desc.focusBlackNote].displayLabel;
    }
    return {
      step: state.step,
      phase: 4,
      progressPct,
      headerMeta: 'ЭТАП 4 · ЧЁРНЫЕ КЛАВИШИ',
      headerTitle,
      stepLabel
    };
  }

  if (desc.phase === 5) {
    const masteredNotation = NOTATION_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getNotationNoteCurriculumItemId(n)];
      return (
        rec?.state === 'retention' &&
        !rec.contexts.includes('pending:delayedRetry')
      );
    }).length;
    const stepLabel =
      desc.kind === 'phase5Complete'
        ? 'Скрипичный стан C4–B4 освоен'
        : desc.notationUnit === 'anchors'
          ? 'Опорные линии C4 · F4 · G4'
          : desc.notationUnit === 'lower'
            ? 'Нижняя часть стана C4–G4'
            : 'Весь скрипичный стан C4–B4';
    return {
      step: state.step,
      phase: 5,
      progressPct,
      headerMeta: 'ЭТАП 5 · НОТНЫЙ СТАН',
      headerTitle: `Чтение с листа · ${
        state.step === 'phase5Complete' ? 7 : Math.min(7, masteredNotation)
      } из 7`,
      stepLabel
    };
  }

  const masteredEar = EAR_ACQUISITION_ORDER.filter(n => {
    const rec = state.progress[getEarNoteCurriculumItemId(n)];
    return (
      rec?.state === 'retention' &&
      !rec.contexts.includes('pending:delayedRetry')
    );
  }).length;
  const stepLabel =
    desc.kind === 'phase6Complete'
      ? 'Относительный слух C4–B4 освоен'
      : desc.earUnit === 'anchors'
        ? 'Ступени C4 · D4 · E4 · F4'
        : 'Все ступени C4–B4 от опоры C4';
  return {
    step: state.step,
    phase: 6,
    progressPct,
    headerMeta: 'ЭТАП 6 · ОТНОСИТЕЛЬНЫЙ СЛУХ',
    headerTitle: `Слух (C4 → цель) · ${
      state.step === 'phase6Complete' ? 7 : Math.min(7, masteredEar)
    } из 7`,
    stepLabel
  };
}

export function resolveMilestone3dKeydownAction(
  state: Milestone3dCurriculumState,
  key: string,
  code: string
): { type: 'advancePhase' | 'dontKnow' } | null {
  const isCompletionStep =
    state.step === 'phase4Complete' ||
    state.step === 'phase5Complete' ||
    state.step === 'phase6Complete';

  if (key === ' ' || code === 'Space') {
    if (isCompletionStep) {
      return { type: 'advancePhase' };
    }
    return null;
  }

  if (key === 'Enter') {
    if (isCompletionStep) {
      return { type: 'advancePhase' };
    }
    if (canUseDontKnowInMilestone3dStep(state)) {
      return { type: 'dontKnow' };
    }
  }

  return null;
}

