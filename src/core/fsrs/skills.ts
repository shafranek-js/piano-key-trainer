import type { Skill } from './types';

/**
 * Canonical single source of truth for every FSRS / Daily-Practice skill family.
 *
 * Any code that needs to validate, enumerate, or label skills must use this registry
 * (directly or through a shared derived constant) instead of a local hard-coded list.
 */
export const FSRS_SKILLS: readonly Skill[] = [
  'find',
  'identify',
  'patternIdentify',
  'notationToKey',
  'soundToKey',
  'notationBassToKey',
  'intervalBuild',
  'intervalIdentify',
  'triadBuild',
  'triadIdentify',
  'triadInversionBuild',
  'triadInversionIdentify',
  'chordSymbolRead',
  'harmonyFunctionIdentify',
  'harmonyNextChord',
  'harmonyProgressionPlay',
  'chordPulse',
  'chordChangeTiming',
  'chordRhythmPattern'
];

export type SkillGroup =
  | 'keyboard'
  | 'notation'
  | 'ear'
  | 'interval'
  | 'triad'
  | 'harmony'
  | 'rhythm';

export interface SkillRegistration {
  id: Skill;
  /** Short UI label (kept identical to the historical `SKILL_NAMES` values). */
  displayName: string;
  group: SkillGroup;
}

const REGISTRATIONS: readonly SkillRegistration[] = [
  { id: 'find', displayName: 'найти', group: 'keyboard' },
  { id: 'identify', displayName: 'назвать', group: 'keyboard' },
  { id: 'patternIdentify', displayName: 'ориентир → назвать', group: 'keyboard' },
  { id: 'notationToKey', displayName: 'нота → клавиша', group: 'notation' },
  { id: 'soundToKey', displayName: 'звук → клавиша', group: 'ear' },
  { id: 'notationBassToKey', displayName: 'басовая нота → клавиша', group: 'notation' },
  { id: 'intervalBuild', displayName: 'построить интервал', group: 'interval' },
  { id: 'intervalIdentify', displayName: 'назвать интервал', group: 'interval' },
  { id: 'triadBuild', displayName: 'построить трезвучие', group: 'triad' },
  { id: 'triadIdentify', displayName: 'назвать трезвучие', group: 'triad' },
  { id: 'triadInversionBuild', displayName: 'построить обращение', group: 'triad' },
  { id: 'triadInversionIdentify', displayName: 'назвать обращение', group: 'triad' },
  { id: 'chordSymbolRead', displayName: 'аккордовое обозначение', group: 'triad' },
  { id: 'harmonyFunctionIdentify', displayName: 'функция аккорда', group: 'harmony' },
  { id: 'harmonyNextChord', displayName: 'следующий аккорд', group: 'harmony' },
  { id: 'harmonyProgressionPlay', displayName: 'сыграть последовательность', group: 'harmony' },
  { id: 'chordPulse', displayName: 'держать пульс', group: 'rhythm' },
  { id: 'chordChangeTiming', displayName: 'сменить аккорд вовремя', group: 'rhythm' },
  { id: 'chordRhythmPattern', displayName: 'сыграть ритмический рисунок', group: 'rhythm' }
];

export const SKILL_REGISTRY: Readonly<Record<Skill, SkillRegistration>> = Object.fromEntries(
  REGISTRATIONS.map(registration => [registration.id, registration])
) as Record<Skill, SkillRegistration>;

export const SKILL_NAMES: Record<Skill, string> = Object.fromEntries(
  REGISTRATIONS.map(registration => [registration.id, registration.displayName])
) as Record<Skill, string>;

export const FSRS_SKILL_SET: ReadonlySet<string> = new Set(FSRS_SKILLS);

export function isFsrsSkill(value: unknown): value is Skill {
  return typeof value === 'string' && FSRS_SKILL_SET.has(value);
}

export function skillDisplayName(skill: Skill): string {
  return SKILL_REGISTRY[skill]?.displayName ?? skill;
}
