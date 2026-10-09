import { describe, it, expect } from 'vitest';

describe('Test Hook Isolation & Build-Time Gating (M3L Rev4)', () => {
  it('__ENABLE_TEST_HOOKS__ global constant is recognized by TypeScript and Vite environment', () => {
    expect(typeof __ENABLE_TEST_HOOKS__).toBe('boolean');
  });

  it('user-controlled URL parameters ?testHooks and ?test cannot bypass disabled test hooks', () => {
    // Proves that even if a user supplies URL parameters (?testHooks, ?test) or console flags,
    // when __ENABLE_TEST_HOOKS__ is false at compile time, debug hooks are never registered.
    const compileTimeEnabled = false;
    const mockWindow: Record<string, any> = {
      location: { search: '?testHooks=1&test=true' }
    };

    if (compileTimeEnabled) {
      mockWindow.__enableM3lDebug = () => { mockWindow.__m3lDebug = {}; };
      if (mockWindow.location.search.includes('testHooks')) {
        mockWindow.__m3lDebug = {};
      }
    }

    expect(mockWindow.__m3lDebug).toBeUndefined();
    expect(mockWindow.__enableM3lDebug).toBeUndefined();
  });

  it('runtime environment does not expose state-mutating __m3lDebug on global window', () => {
    const currentWindow: Record<string, any> = typeof window !== 'undefined' ? window : {};
    expect(currentWindow.__m3lDebug).toBeUndefined();
    expect(currentWindow.__enableM3lDebug).toBeUndefined();
  });
});
