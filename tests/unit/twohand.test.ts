import { describe, it, expect } from 'vitest';
import { TWO_HAND_PATTERNS, type TwoHandPatternDef } from '../../src/core/twohand/twoHandData';

describe('Two-Hand Coordination Patterns', () => {
  const noteRegex = /^[A-G](#?)\d$/;

  it('contains valid patterns with non-empty steps', () => {
    expect(TWO_HAND_PATTERNS.length).toBeGreaterThanOrEqual(5);

    for (const pattern of TWO_HAND_PATTERNS) {
      expect(pattern.id).toBeTruthy();
      expect(pattern.title).toBeTruthy();
      expect(pattern.steps.length).toBeGreaterThan(0);
    }
  });

  it('validates pair and anchor mode step notes', () => {
    const pairPatterns = TWO_HAND_PATTERNS.filter(p => p.mode === 'pair' || p.mode === 'anchor');
    for (const p of pairPatterns) {
      for (const step of p.steps) {
        const pair = step as { left: string; right: string };
        expect(noteRegex.test(pair.left), `Left note ${pair.left} in ${p.id} should be valid`).toBe(true);
        expect(noteRegex.test(pair.right), `Right note ${pair.right} in ${p.id} should be valid`).toBe(true);
      }
    }
  });

  it('validates alternate mode step hands and notes', () => {
    const altPatterns = TWO_HAND_PATTERNS.filter(p => p.mode === 'alternate');
    for (const p of altPatterns) {
      for (const step of p.steps) {
        const alt = step as { key: string; hand: 'L' | 'R' };
        expect(['L', 'R']).toContain(alt.hand);
        expect(noteRegex.test(alt.key), `Note ${alt.key} in ${p.id} should be valid`).toBe(true);
      }
    }
  });

  it('includes contrary motion pattern with symmetrical expansion', () => {
    const contrary = TWO_HAND_PATTERNS.find(p => p.id === 'contrary-motion-c');
    expect(contrary).toBeDefined();
    expect(contrary?.mode).toBe('pair');
    const firstStep = contrary?.steps[0] as { left: string; right: string };
    expect(firstStep.left).toBe('C3');
    expect(firstStep.right).toBe('C4');
  });
});
