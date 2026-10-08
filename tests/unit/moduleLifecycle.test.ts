import { describe, expect, it } from 'vitest';
import {
  ADVANCED_MODULE_IDS,
  hasSingleActiveModule,
  resetAdvancedModuleStates,
  type AdvancedModuleId
} from '../../src/core/learning/moduleLifecycle';

type FakeState = { id: AdvancedModuleId };

function allStates(): Record<AdvancedModuleId, FakeState | null> {
  return {
    bassGrandStaff: { id: 'bassGrandStaff' },
    intervals: { id: 'intervals' },
    triads: { id: 'triads' },
    inversions: { id: 'inversions' },
    harmony: { id: 'harmony' },
    chordRhythm: { id: 'chordRhythm' },
    twoHand: { id: 'twoHand' }
  };
}

describe('Advanced module exclusivity', () => {
  it('keeps exactly the requested module and clears every sibling', () => {
    const previous = allStates();
    const next = resetAdvancedModuleStates(previous, 'harmony');
    expect(next.harmony).toEqual({ id: 'harmony' });
    for (const id of ADVANCED_MODULE_IDS) {
      if (id !== 'harmony') expect(next[id]).toBeNull();
    }
    // Pure: the input is not mutated.
    expect(previous.chordRhythm).toEqual({ id: 'chordRhythm' });
    expect(hasSingleActiveModule(next)).toBe(true);
  });

  it('clears all modules when keep is null', () => {
    const next = resetAdvancedModuleStates(allStates(), null);
    expect(ADVANCED_MODULE_IDS.every(id => next[id] === null)).toBe(true);
    expect(hasSingleActiveModule(next)).toBe(true);
  });

  it('reports exclusivity violations', () => {
    const states = { ...allStates(), chordRhythm: { id: 'chordRhythm' as const } };
    expect(hasSingleActiveModule(states)).toBe(false);
  });
});
