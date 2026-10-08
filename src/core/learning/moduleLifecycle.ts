/**
 * Canonical lifecycle rules for the post-graduation advanced modules.
 * At most one advanced module may be active at a time. The learner-facing
 * module and the input-routing module must always refer to the same id.
 */

export type AdvancedModuleId =
  | 'bassGrandStaff'
  | 'intervals'
  | 'triads'
  | 'inversions'
  | 'harmony'
  | 'chordRhythm'
  | 'twoHand';

export const ADVANCED_MODULE_IDS: readonly AdvancedModuleId[] = [
  'bassGrandStaff',
  'intervals',
  'triads',
  'inversions',
  'harmony',
  'chordRhythm',
  'twoHand'
];

/**
 * Clears every advanced module state except the requested one.
 * Pure: returns a new record and never mutates the input.
 */
export function resetAdvancedModuleStates<T extends Record<AdvancedModuleId, unknown | null>>(
  previous: T,
  keep: AdvancedModuleId | null
): T {
  const next: Record<string, unknown | null> = { ...previous };
  for (const id of ADVANCED_MODULE_IDS) {
    next[id] = id === keep ? previous[id] : null;
  }
  return next as T;
}

/** True when exactly one advanced module state is non-null. */
export function hasSingleActiveModule(states: Readonly<Record<AdvancedModuleId, unknown | null>>): boolean {
  return ADVANCED_MODULE_IDS.filter(id => states[id] != null).length <= 1;
}


