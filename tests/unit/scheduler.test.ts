import { describe, it, expect } from 'vitest';
import { chooseDue, chooseNew, diversityPenalty, buildColdQueue } from '../../src/core/scheduler/queue';
import { getCurriculumPhases, baseNoteReady } from '../../src/core/curriculum/curriculum';
import type { Card } from '../../src/core/fsrs/types';

function makeCard(skill: Card['skill'], note: Card['note'], reps = 0, dueAt = 0, stability = 1): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: reps === 0 ? 'new' : 'review',
    stability: reps === 0 ? null : stability,
    difficulty: reps === 0 ? null : 5,
    dueAt,
    lastReviewAt: reps === 0 ? 0 : Date.now() - 86400000,
    firstSeenAt: reps === 0 ? 0 : Date.now() - 86400000 * 5,
    reps,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: reps,
      firstCorrect: reps,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: reps,
      scheduledSuccesses: reps,
      practiceTrials: 0
    }
  };
}

describe('Scheduler and Queue Logic', () => {
  it('prioritizes overdue card over fresh cards in chooseDue', () => {
    const now = Date.now();
    const c1 = makeCard('find', 'C', 3, now - 10000, 2);
    const c2 = makeCard('find', 'D', 3, now + 50000, 5);
    const c3 = makeCard('find', 'E', 0, 0);

    const picked = chooseDue([c1, c2, c3], now, []);
    expect(picked?.id).toBe('find:C');
  });

  it('calculates diversity penalty for repeated cards and same notes', () => {
    const c1 = makeCard('find', 'C', 1);
    const c2 = makeCard('identify', 'C', 1);
    const c3 = makeCard('find', 'D', 1);

    expect(diversityPenalty(c1, [c1])).toBeGreaterThan(0.9); // identical card
    expect(diversityPenalty(c2, [c1])).toBeGreaterThan(0.3); // same note
    expect(diversityPenalty(c3, [c1])).toBe(0); // different note, different card
  });

  it('builds a cold queue with balanced skills and no adjacent identical notes', () => {
    const cards = [
      makeCard('find', 'C', 1),
      makeCard('identify', 'C', 1),
      makeCard('notationToKey', 'C', 1),
      makeCard('soundToKey', 'C', 1),
      makeCard('find', 'D', 1),
      makeCard('identify', 'D', 1),
      makeCard('find', 'E', 1),
      makeCard('identify', 'E', 1)
    ];

    const queue = buildColdQueue(cards, 10);
    expect(queue.length).toBe(10);
  });

  it('locks subsequent curriculum phases until anchors are mastered', () => {
    const cardsMap: Record<string, Card> = {};
    const getCard = (skill: Card['skill'], note: Card['note']) => {
      const id = `${skill}:${note}`;
      if (!cardsMap[id]) cardsMap[id] = makeCard(skill, note);
      return cardsMap[id];
    };

    const reviewLog = [
      {
        ts: Date.now(),
        sessionId: 's1',
        cardId: 'find:C',
        note: 'C' as const,
        skill: 'find' as const,
        kind: 'scheduled' as const,
        grade: 3 as const,
        gradeName: 'Good',
        firstCorrect: true,
        answer: 'C',
        answerKeyId: null,
        attempts: 1,
        hintUsed: false,
        responseMs: 1200,
        elapsedDays: 2,
        retrievabilityBefore: 0.9,
        stabilityBefore: 3,
        stabilityAfter: 5,
        difficultyBefore: 5,
        difficultyAfter: 5,
        scheduledDays: 5
      }
    ];

    const phases = getCurriculumPhases('white', getCard, reviewLog);
    expect(phases[0].open).toBe(true); // Anchors (C+F) are open
    expect(phases[0].done).toBe(false); // C and F are not yet mastered
    expect(phases[1].open).toBe(false); // Neighbors (D,E,B) locked until anchors done
  });

  it('detects top confusion pairs and injects contrast practice', async () => {
    const { topConfusionPairs, chooseConfusionPractice } = await import('../../src/core/scheduler/queue');
    const logs = [
      { kind: 'scheduled', note: 'C' as const, answer: 'D' as const },
      { kind: 'scheduled', note: 'C' as const, answer: 'D' as const },
      { kind: 'scheduled', note: 'E' as const, answer: 'F' as const }
    ];

    const pairs = topConfusionPairs(logs, 2);
    expect(pairs.length).toBe(1);
    expect(pairs[0].pair).toBe('C↔D');
    expect(pairs[0].count).toBe(2);

    const cards = [
      makeCard('find', 'C', 1),
      makeCard('find', 'D', 1),
      makeCard('find', 'E', 1)
    ];

    const practiceCard = chooseConfusionPractice(cards, logs, [], -99, 10, 0);
    expect(practiceCard).not.toBeNull();
    expect(['C', 'D']).toContain(practiceCard?.note);
  });

  it('includes Roadmap Direction 3 etudes (Hanon, Czerny, Beyer) with measures and phrases', async () => {
    const { REPERTOIRE } = await import('../../src/core/repertoire/repertoireData');
    const hanon = REPERTOIRE.find(s => s.id === 'hanon-1');
    const czerny = REPERTOIRE.find(s => s.id === 'czerny-599-1');
    const beyer = REPERTOIRE.find(s => s.id === 'beyer-101-8');

    expect(hanon).toBeDefined();
    expect(czerny).toBeDefined();
    expect(beyer).toBeDefined();

    expect(hanon?.measureBeats).toBe(4);
    expect(czerny?.notes.length).toBeGreaterThan(5);
  });

  it('includes Roadmap Direction 5 intervals and triads definitions', async () => {
    const { INTERVALS, TRIADS } = await import('../../src/core/ear/earTrainingData');
    expect(INTERVALS.length).toBeGreaterThanOrEqual(7);
    expect(TRIADS.major.length).toBeGreaterThan(0);
    expect(TRIADS.minor.length).toBeGreaterThan(0);

    const fifth = INTERVALS.find(i => i.id === 'P5');
    expect(fifth?.semitones).toBe(7);
    expect(fifth?.targetKeyId).toBe('G4');
  });
});
