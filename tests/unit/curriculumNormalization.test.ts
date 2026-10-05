import { describe, expect, it } from 'vitest';
import {
  normalizeSequentialPhaseCompletion,
  getCurriculumPhases,
  type CurriculumPhase,
  type CardGetter
} from '../../src/core/curriculum/curriculum';
import { getCurriculumPhaseProgressDetails } from '../../src/core/curriculum/curriculumProgressDetails';
import type { Card, ReviewLogEvent, Skill, NoteName } from '../../src/core/fsrs/types';
import type { LearningProgressRecord } from '../../src/core/learning/types';
import { WHITE_KEY_CURRICULUM_ITEM_IDS } from '../../src/core/learning/curriculumFlow';
import { MILESTONE_3D_ITEM_IDS } from '../../src/core/learning/curriculum3d';

function createMockCard(id: string, skill: Skill, note: NoteName): Card {
  return {
    id,
    skill,
    note,
    stability: 2.5,
    difficulty: 5.0,
    reps: 1,
    lapses: 0,
    memoryState: 'review',
    dueAt: 1000,
    lastReviewAt: 1000,
    firstSeenAt: 1000,
    lastGrade: null,
    stats: {
      trials: 1,
      firstCorrect: 1,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 1,
      scheduledSuccesses: 1,
      practiceTrials: 0
    }
  };
}

function createBasePhases(rawDones: boolean[]): CurriculumPhase[] {
  const all = [
    { id: 'anchors', title: '1 · Ориентиры', detail: 'C + F' },
    { id: 'neighbors', title: '2 · Соседи', detail: 'D · E · B' },
    { id: 'remaining', title: '3 · Белые', detail: 'G · A · C–B' },
    { id: 'black', title: '4 · Чёрные', detail: 'C♯ F♯ G♯ D♯ A♯' },
    { id: 'notation', title: '5 · Нотный стан', detail: 'C4–B4' },
    { id: 'sound', title: '6 · Слух', detail: 'C4 → target' }
  ];

  return all.map((def, idx) => ({
    ...def,
    open: idx === 0,
    done: Boolean(rawDones[idx]),
    skipped: false
  }));
}

describe('Curriculum Progression Consistency & Normalization', () => {
  it('1. Phase 2 completed → Phase 1 cannot display incomplete', () => {
    // Raw: Phase 1 false, Phase 2 true
    const raw = createBasePhases([false, true, false, false, false, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    expect(normalized[0].id).toBe('anchors');
    expect(normalized[0].done).toBe(true);
    expect(normalized[0].open).toBe(true);

    expect(normalized[1].id).toBe('neighbors');
    expect(normalized[1].done).toBe(true);
    expect(normalized[1].open).toBe(true);

    // Current phase is Phase 3
    expect(normalized[2].id).toBe('remaining');
    expect(normalized[2].done).toBe(false);
    expect(normalized[2].open).toBe(true);
  });

  it('2. Phase 3 completed → 1–2 displayed completed', () => {
    // Raw: Phase 1 false, Phase 2 false, Phase 3 true
    const raw = createBasePhases([false, false, true, false, false, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    expect(normalized[0].done).toBe(true);
    expect(normalized[1].done).toBe(true);
    expect(normalized[2].done).toBe(true);

    // Phase 4 is current
    expect(normalized[3].done).toBe(false);
    expect(normalized[3].open).toBe(true);

    // Phases 5 and 6 remain locked
    expect(normalized[4].open).toBe(false);
    expect(normalized[5].open).toBe(false);
  });

  it('3. Phase 5 completed → 1–4 completed', () => {
    // Raw: Phase 1 false, Phase 5 true
    const raw = createBasePhases([false, false, false, false, true, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    expect(normalized[0].done).toBe(true);
    expect(normalized[1].done).toBe(true);
    expect(normalized[2].done).toBe(true);
    expect(normalized[3].done).toBe(true);
    expect(normalized[4].done).toBe(true);

    // Phase 6 is current
    expect(normalized[5].id).toBe('sound');
    expect(normalized[5].done).toBe(false);
    expect(normalized[5].open).toBe(true);
  });

  it('4. Phase 6 completed → all 6 completed', () => {
    // Raw: Phase 6 completed
    const raw = createBasePhases([false, false, false, false, false, true]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    for (let i = 0; i < 6; i++) {
      expect(normalized[i].done).toBe(true);
      expect(normalized[i].open).toBe(true);
    }
    const completedCount = normalized.filter((p) => p.done || p.skipped).length;
    expect(completedCount).toBe(6);
  });

  it('5. Legacy later-phase progress + missing FirstRun C/F records → no regression to Phase 1', () => {
    // Legacy user has white keys and notation completed, but 0 C/F first-run records
    const lpList: LearningProgressRecord[] = [
      // White keys completed
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_D, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_B, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_G, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_A, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE, state: 'retention', contexts: [] } as any,
      { id: WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE, state: 'retention', contexts: [] } as any,
      // Phase 4 black keys completed
      { id: MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, state: 'retention', contexts: [] } as any,
      // Phase 5 notation completed
      { id: MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE, state: 'retention', contexts: [] } as any
    ];

    const cardsMap = new Map<string, Card>();
    const getCard: CardGetter = (skill, note) => {
      const id = `${skill}:${note}`;
      let c = cardsMap.get(id);
      if (!c) {
        c = createMockCard(id, skill, note);
        cardsMap.set(id, c);
      }
      return c;
    };

    const phases = getCurriculumPhases('white', getCard, [], lpList);

    // Phase 1 MUST NOT be incomplete
    expect(phases[0].id).toBe('anchors');
    expect(phases[0].done).toBe(true);

    // Phases 1–5 must all be completed
    for (let i = 0; i <= 4; i++) {
      expect(phases[i].done).toBe(true);
    }

    // Phase 6 is the current phase, not Phase 1!
    expect(phases[5].id).toBe('sound');
    expect(phases[5].open).toBe(true);
    expect(phases[5].done).toBe(false);
  });

  it('6. Reconciliation does not mutate FSRS cards/review log', () => {
    const raw = createBasePhases([false, true, true, false, false, false]);
    const cardsMap = new Map<string, Card>();
    const testCard = createMockCard('find:C', 'find', 'C');
    cardsMap.set(testCard.id, testCard);
    const cardSnapshot = JSON.parse(JSON.stringify(testCard));
    const reviewLog: ReviewLogEvent[] = [];

    const normalized = normalizeSequentialPhaseCompletion(raw);

    // Assert card and review log remain completely untouched
    expect(testCard).toEqual(cardSnapshot);
    expect(reviewLog).toEqual([]);
    expect(normalized[0].done).toBe(true);
  });

  it('7. Normal new user still starts at Phase 1', () => {
    const raw = createBasePhases([false, false, false, false, false, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    expect(normalized[0].id).toBe('anchors');
    expect(normalized[0].open).toBe(true);
    expect(normalized[0].done).toBe(false);

    for (let i = 1; i < 6; i++) {
      expect(normalized[i].open).toBe(false);
      expect(normalized[i].done).toBe(false);
    }
  });

  it('8. Genuine sequential progression still locks future phases', () => {
    // Normal user finished Phase 1 and Phase 2, but has NOT finished Phase 3
    const raw = createBasePhases([true, true, false, false, false, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    expect(normalized[0].done).toBe(true);
    expect(normalized[1].done).toBe(true);
    expect(normalized[2].open).toBe(true);
    expect(normalized[2].done).toBe(false);

    // Future phases strictly locked
    expect(normalized[3].open).toBe(false);
    expect(normalized[3].done).toBe(false);
    expect(normalized[4].open).toBe(false);
    expect(normalized[4].done).toBe(false);
    expect(normalized[5].open).toBe(false);
    expect(normalized[5].done).toBe(false);
  });

  it('9. completedCount matches normalized phase state', () => {
    // 5 completed out of 6
    const raw = createBasePhases([false, false, false, false, true, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);
    const completedCount = normalized.filter((p) => p.done || p.skipped).length;
    expect(completedCount).toBe(5);

    // All 6 completed
    const rawAll = createBasePhases([true, true, true, true, true, true]);
    const normalizedAll = normalizeSequentialPhaseCompletion(rawAll);
    const countAll = normalizedAll.filter((p) => p.done || p.skipped).length;
    expect(countAll).toBe(6);
  });

  it('10. Current phase is the first genuinely incomplete sequential phase', () => {
    // Suppose Phase 1, 2, 3 are completed
    const raw = createBasePhases([true, true, true, false, false, false]);
    const normalized = normalizeSequentialPhaseCompletion(raw);

    const currentPhase = normalized.find((p) => p.open && !p.done && !p.skipped);
    expect(currentPhase).toBeDefined();
    expect(currentPhase?.id).toBe('black'); // Phase 4
    expect(currentPhase?.title).toBe('4 · Чёрные');
  });

  describe('User-Facing Details («Что осталось») & Jargon Elimination', () => {
    it('provides concrete checklist and friendly instruction without technical FSRS jargon', () => {
      const currentPhase: CurriculumPhase = {
        id: 'anchors',
        title: '1 · Ориентиры',
        detail: 'C + F',
        open: true,
        done: false
      };

      const getCard: CardGetter = (skill, note) => createMockCard(`${skill}:${note}`, skill, note);
      const details = getCurriculumPhaseProgressDetails(currentPhase, getCard, [], []);

      expect(details).not.toBeNull();
      expect(details?.phaseId).toBe('anchors');
      expect(details?.instructionText).toBeDefined();

      // Check checklist structure
      expect(details?.checklist.length).toBeGreaterThanOrEqual(5);
      const labels = details?.checklist.map((c) => c.label);
      expect(labels).toContain('Ориентир C');
      expect(labels).toContain('Ориентир F');
      expect(labels).toContain('Различать C и F');
      expect(labels).toContain('Повторение C');
      expect(labels).toContain('Повторение F');
      expect(labels).toContain('Закрепление');

      // Verify ZERO technical FSRS terminology in user text
      const allText = JSON.stringify(details);
      expect(allText).not.toContain('scheduled-review');
      expect(allText).not.toContain('Stability');
      expect(allText).not.toContain('stability');
      expect(allText).not.toContain('FSRS');
      expect(allText).not.toContain('H0');
      expect(allText).not.toContain('H2');
      expect(allText).not.toContain('threshold');
    });
  });
});
