import { describe, expect, it } from 'vitest';
import {
  FSRS_SKILLS,
  FSRS_SKILL_SET,
  SKILL_NAMES,
  SKILL_REGISTRY,
  isFsrsSkill,
  skillDisplayName
} from '../../src/core/fsrs/skills';
import { COLD_TEST_SKILLS } from '../../src/core/learning/coldTest';
import { buildColdQueue } from '../../src/core/scheduler/queue';
import { detectStorageConsistency } from '../../src/core/diagnostics/diagnosticChecks';
import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';

const SOURCE_MODULES = import.meta.glob('/src/**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function makeCard(skill: Skill, note: NoteName = 'C'): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'review',
    stability: 2,
    difficulty: 5,
    dueAt: 1_000,
    lastReviewAt: 500,
    firstSeenAt: 100,
    reps: 2,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 2,
      firstCorrect: 2,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 2,
      scheduledSuccesses: 2,
      practiceTrials: 0
    }
  };
}

async function collectSourceFiles(): Promise<Array<[string, string]>> {
  return Object.entries(SOURCE_MODULES);
}

describe('Canonical FSRS skill registry', () => {
  it('has a single registration for every skill with usable metadata', () => {
    expect(FSRS_SKILLS).toHaveLength(22);
    expect(new Set(FSRS_SKILLS).size).toBe(22);
    expect(Object.keys(SKILL_REGISTRY).sort()).toEqual([...FSRS_SKILLS].sort());
    expect(Object.keys(SKILL_NAMES).sort()).toEqual([...FSRS_SKILLS].sort());
    for (const skill of FSRS_SKILLS) {
      const registration = SKILL_REGISTRY[skill];
      expect(registration.id).toBe(skill);
      expect(registration.displayName.trim().length).toBeGreaterThan(0);
      expect(skillDisplayName(skill)).toBe(registration.displayName);
      expect(['keyboard', 'notation', 'ear', 'interval', 'triad', 'harmony', 'rhythm', 'twohand']).toContain(registration.group);
      expect(isFsrsSkill(skill)).toBe(true);
    }
    expect(isFsrsSkill('unknownSkill')).toBe(false);
    expect(isFsrsSkill(42)).toBe(false);
  });

  it('keeps the Cold Test curated at 19 families while the registry holds all 22 skills', () => {
    expect(COLD_TEST_SKILLS).toHaveLength(19);
    for (const skill of COLD_TEST_SKILLS) {
      expect(FSRS_SKILL_SET.has(skill)).toBe(true);
    }
    for (const skill of ['twoHandBass', 'twoHandTogether', 'twoHandAlternating']) {
      expect(COLD_TEST_SKILLS).not.toContain(skill);
    }
    const queue = buildColdQueue(COLD_TEST_SKILLS.map(skill => makeCard(skill, 'C')), 20);
    expect(queue).toHaveLength(20);
    for (const cardId of queue) {
      expect(isFsrsSkill(cardId.split(':')[0])).toBe(true);
    }
  });

  it('every registered skill can be a valid diagnostics card without unknown-skill warnings', () => {
    const cards = FSRS_SKILLS.map(skill => makeCard(skill, 'C'));
    const consistency = detectStorageConsistency({
      cards,
      learningProgress: new Map(),
      reviewLogs: [],
      rawPhases: [],
      normalizedPhases: [],
      now: 1_000
    });
    expect(consistency.checks.unknownSkillIds).toEqual([]);
    expect(consistency.warnings.filter(warning => warning.includes('Неизвестный skill'))).toEqual([]);
  });

  it('every skill literal produced by curriculum/UI sources exists in the registry', async () => {
    const files = await collectSourceFiles();
    const literalPattern = /skill(?:Type)?:\s*'([A-Za-z][A-Za-z0-9]*)'/g;
    const produced = new Map<string, string>();
    for (const [file, source] of files) {
      for (const match of source.matchAll(literalPattern)) {
        const skill = match[1];
        if (!FSRS_SKILL_SET.has(skill)) {
          produced.set(skill, file);
        }
      }
    }
    expect([...produced.entries()]).toEqual([]);
  });

  it('every collectable curriculum producer only emits registered skills', async () => {
    const harmony = await import('../../src/core/learning/harmony');
    const chordInversions = await import('../../src/core/learning/chordInversions');
    const triads = await import('../../src/core/learning/triads');
    const intervals = await import('../../src/core/learning/intervals');
    const chordRhythm = await import('../../src/core/learning/chordRhythm');

    const producedSkills = [
      ...harmony.harmonyCardNotes().map(item => item.skill),
      ...chordInversions.CANONICAL_INVERSION_PRACTICE_ITEMS.map(item => item.skill),
      ...triads.TRIAD_TRANSFER_CYCLE.map(item => item.skill),
      ...intervals.TRANSFER_CYCLE.map(item => item.skill),
      ...chordRhythm.chordRhythmCardNotes().map(item => item.skill)
    ];
    expect(producedSkills.length).toBeGreaterThan(0);
    for (const skill of producedSkills) {
      expect(isFsrsSkill(skill), `Produced skill ${skill} is not registered`).toBe(true);
    }
  });
});
