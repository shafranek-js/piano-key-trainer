import { describe, expect, it } from 'vitest';
import {
  buildLearningRoadmap,
  ROADMAP_DEFINITIONS,
  type RoadmapStageId
} from '../../src/core/curriculum/learningRoadmap';
import type { CurriculumPhase } from '../../src/core/curriculum/curriculum';

function createMockPhases(completedIds: string[] = []): CurriculumPhase[] {
  const allIds = ['anchors', 'neighbors', 'remaining', 'black', 'notation', 'sound'];
  return allIds.map((id, index) => ({
    id,
    title: `Phase ${index + 1}`,
    detail: `Detail ${index + 1}`,
    open: true,
    done: completedIds.includes(id),
    skipped: false
  }));
}

describe('Learning Roadmap Model', () => {
  it('defines exactly 12 stages in the specified educational sequence', () => {
    const expectedSequence: RoadmapStageId[] = [
      'keys',
      'white_notes',
      'black_notes',
      'sheet_reading',
      'ear_training',
      'bass_clef',
      'intervals',
      'triads',
      'inversions',
      'harmony',
      'chord_rhythm',
      'two_hand'
    ];

    expect(ROADMAP_DEFINITIONS).toHaveLength(12);
    expect(ROADMAP_DEFINITIONS.map((s) => s.id)).toEqual(expectedSequence);

    // Verify ordering sequence 1..12
    ROADMAP_DEFINITIONS.forEach((def, index) => {
      expect(def.order).toBe(index + 1);
    });
  });

  it('preserves the 6-phase curriculum invariant with no Phase 7', () => {
    const phases = createMockPhases();
    expect(phases).toHaveLength(6);

    const roadmap = buildLearningRoadmap({ phases });
    const coreStages = roadmap.filter((s) => s.category === 'core');
    const advancedStages = roadmap.filter((s) => s.category === 'advanced');
    const plannedStages = roadmap.filter((s) => s.category === 'planned');

    // 5 core learning areas covering the 6 phases (anchors, neighbors+remaining, black, notation, sound)
    expect(coreStages).toHaveLength(5);
    // 7 standalone advanced modules, with Harmony locked until Inversions and Chord Rhythm after Harmony
    expect(advancedStages).toHaveLength(7);
    expect(plannedStages).toHaveLength(0);
  });

  it('correctly maps a fresh beginner state', () => {
    const phases = createMockPhases([]);
    const roadmap = buildLearningRoadmap({ phases });

    expect(roadmap[0].id).toBe('keys');
    expect(roadmap[0].status).toBe('in_progress');
    expect(roadmap[0].isCurrent).toBe(true);
    expect(roadmap[0].statusLabelRu).toBe('● Сейчас изучается');

    // white_notes through inversions should be locked
    for (let i = 1; i <= 8; i++) {
      expect(roadmap[i].status).toBe('locked');
      expect(roadmap[i].isCurrent).toBe(false);
      expect(roadmap[i].statusLabelRu).toBe('🔒 Ещё не открыто');
    }

    // Harmony is shown as planned until its prerequisite module is complete.
    expect(roadmap[9].id).toBe('harmony');
    expect(roadmap[9].status).toBe('planned');
    expect(roadmap[9].statusLabelRu).toBe('Запланировано');

    // Chord Rhythm is the 11th stage and remains planned behind Harmony.
    expect(roadmap[10].id).toBe('chord_rhythm');
    expect(roadmap[10].status).toBe('planned');
    expect(roadmap[10].statusLabelRu).toBe('Запланировано');

    // Two-Hand Accompaniment is the 12th stage and remains planned behind Chord Rhythm.
    expect(roadmap[11].id).toBe('two_hand');
    expect(roadmap[11].status).toBe('planned');
    expect(roadmap[11].statusLabelRu).toBe('Запланировано');
  });

  it('advances current stage as core phases are completed', () => {
    // 1. Anchors completed -> keys done, white_notes in progress
    let phases = createMockPhases(['anchors']);
    let roadmap = buildLearningRoadmap({ phases });
    expect(roadmap[0].status).toBe('completed');
    expect(roadmap[0].isCurrent).toBe(false);
    expect(roadmap[1].id).toBe('white_notes');
    expect(roadmap[1].status).toBe('in_progress');
    expect(roadmap[1].isCurrent).toBe(true);

    // 2. White notes completed (neighbors + remaining) -> white_notes done, black_notes in progress
    phases = createMockPhases(['anchors', 'neighbors', 'remaining']);
    roadmap = buildLearningRoadmap({ phases });
    expect(roadmap[1].status).toBe('completed');
    expect(roadmap[2].id).toBe('black_notes');
    expect(roadmap[2].status).toBe('in_progress');
    expect(roadmap[2].isCurrent).toBe(true);

    // 3. Black notes completed -> notation in progress
    phases = createMockPhases(['anchors', 'neighbors', 'remaining', 'black']);
    roadmap = buildLearningRoadmap({ phases });
    expect(roadmap[2].status).toBe('completed');
    expect(roadmap[3].id).toBe('sheet_reading');
    expect(roadmap[3].status).toBe('in_progress');
    expect(roadmap[3].isCurrent).toBe(true);

    // 4. Notation completed -> sound in progress
    phases = createMockPhases(['anchors', 'neighbors', 'remaining', 'black', 'notation']);
    roadmap = buildLearningRoadmap({ phases });
    expect(roadmap[3].status).toBe('completed');
    expect(roadmap[4].id).toBe('ear_training');
    expect(roadmap[4].status).toBe('in_progress');
    expect(roadmap[4].isCurrent).toBe(true);
  });

  it('correctly handles advanced modules availability and completion progression', () => {
    // All 6 phases completed -> core course complete!
    const allPhases = createMockPhases(['anchors', 'neighbors', 'remaining', 'black', 'notation', 'sound']);

    // Initially when core completes, bass_clef is available
    let roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'not_started',
      isIntervalAvailable: false,
      isTriadAvailable: false,
      isInversionAvailable: false
    });

    expect(roadmap[4].status).toBe('completed'); // ear_training done
    expect(roadmap[5].id).toBe('bass_clef');
    expect(roadmap[5].status).toBe('available');
    expect(roadmap[5].isCurrent).toBe(true); // first available stage becomes current

    // Start bass clef -> bass_clef in_progress
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'in_progress',
      isIntervalAvailable: false
    });
    expect(roadmap[5].status).toBe('in_progress');
    expect(roadmap[5].isCurrent).toBe(true);

    // Complete bass clef -> intervals becomes available
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'not_started',
      isIntervalAvailable: true
    });
    expect(roadmap[5].status).toBe('completed');
    expect(roadmap[6].id).toBe('intervals');
    expect(roadmap[6].status).toBe('available');
    expect(roadmap[6].isCurrent).toBe(true);

    // In intervals module
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'in_progress',
      isIntervalAvailable: true
    });
    expect(roadmap[6].status).toBe('in_progress');
    expect(roadmap[6].isCurrent).toBe(true);

    // Complete intervals -> triads available
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'not_started',
      isTriadAvailable: true
    });
    expect(roadmap[6].status).toBe('completed');
    expect(roadmap[7].id).toBe('triads');
    expect(roadmap[7].status).toBe('available');
    expect(roadmap[7].isCurrent).toBe(true);

    // Complete triads -> inversions available
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'not_started',
      isInversionAvailable: true
    });
    expect(roadmap[7].status).toBe('completed');
    expect(roadmap[8].id).toBe('inversions');
    expect(roadmap[8].status).toBe('available');
    expect(roadmap[8].isCurrent).toBe(true);

    // Studying inversions
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'in_progress',
      isInversionAvailable: true
    });
    expect(roadmap[8].status).toBe('in_progress');
    expect(roadmap[8].isCurrent).toBe(true);

    // Complete inversions -> Harmony becomes the next available stage
    roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      isInversionAvailable: true,
      isHarmonyAvailable: true
    });
    expect(roadmap[8].status).toBe('completed');
    expect(roadmap[8].isCurrent).toBe(false);
    expect(roadmap[9].id).toBe('harmony');
    expect(roadmap[9].category).toBe('advanced');
    expect(roadmap[9].status).toBe('available');
    expect(roadmap[9].isCurrent).toBe(true);
    expect(roadmap[8].title).toBe('Обращения и аккордовые обозначения');
    expect(roadmap[9].title).toBe('Гармония и сопровождение');
    expect(roadmap[9].statusLabelRu).toBe('○ Доступно');
    expect(roadmap[9].description).toContain('I–V–vi–IV');

    const completedHarmony = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      isInversionAvailable: true,
      isHarmonyAvailable: true
    });
    expect(completedHarmony[9].status).toBe('completed');
    expect(completedHarmony[9].isCurrent).toBe(true);

    // Once Harmony is completed, Chord Rhythm (stage 11) becomes available.
    const chordRhythmAvailable = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      chordRhythmStatus: 'not_started',
      isInversionAvailable: true,
      isHarmonyAvailable: true,
      isChordRhythmAvailable: true
    });
    expect(chordRhythmAvailable[10].status).toBe('available');
    expect(chordRhythmAvailable[10].isCurrent).toBe(true);

    // Studying Chord Rhythm marks stage 11 current and in progress.
    const chordRhythmInProgress = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      chordRhythmStatus: 'in_progress',
      isInversionAvailable: true,
      isHarmonyAvailable: true,
      isChordRhythmAvailable: true
    });
    expect(chordRhythmInProgress[10].status).toBe('in_progress');
    expect(chordRhythmInProgress[10].isCurrent).toBe(true);

    // Once Chord Rhythm is completed, Two-Hand Accompaniment (stage 12) becomes available.
    const twoHandAvailable = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      chordRhythmStatus: 'completed',
      twoHandStatus: 'not_started',
      isInversionAvailable: true,
      isHarmonyAvailable: true,
      isChordRhythmAvailable: true,
      isTwoHandAvailable: true
    });
    expect(twoHandAvailable[11].status).toBe('available');
    expect(twoHandAvailable[11].isCurrent).toBe(true);

    // Studying Two-Hand Accompaniment marks stage 12 current and in progress.
    const twoHandInProgress = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      chordRhythmStatus: 'completed',
      twoHandStatus: 'in_progress',
      isInversionAvailable: true,
      isHarmonyAvailable: true,
      isChordRhythmAvailable: true,
      isTwoHandAvailable: true
    });
    expect(twoHandInProgress[11].status).toBe('in_progress');
    expect(twoHandInProgress[11].isCurrent).toBe(true);
  });

  it('clears currentStageId when all 12 stages are completed', () => {
    const allPhases = createMockPhases(['anchors', 'neighbors', 'remaining', 'black', 'notation', 'sound']);
    const roadmap = buildLearningRoadmap({
      phases: allPhases,
      bassGrandStatus: 'completed',
      intervalStatus: 'completed',
      triadStatus: 'completed',
      inversionStatus: 'completed',
      harmonyStatus: 'completed',
      chordRhythmStatus: 'completed',
      twoHandStatus: 'completed',
      isIntervalAvailable: true,
      isTriadAvailable: true,
      isInversionAvailable: true,
      isHarmonyAvailable: true,
      isChordRhythmAvailable: true,
      isTwoHandAvailable: true
    });

    expect(roadmap).toHaveLength(12);
    expect(roadmap.every((stage) => stage.status === 'completed')).toBe(true);
    expect(roadmap.every((stage) => stage.isCurrent === false)).toBe(true);
  });

  it('is a pure function that does not mutate input parameters', () => {
    const phases = createMockPhases(['anchors']);
    const phasesSnapshot = JSON.parse(JSON.stringify(phases));
    const params = {
      phases,
      bassGrandStatus: 'not_started' as const,
      intervalStatus: 'not_started' as const
    };

    const roadmap1 = buildLearningRoadmap(params);
    const roadmap2 = buildLearningRoadmap(params);

    expect(roadmap1).toEqual(roadmap2);
    expect(phases).toEqual(phasesSnapshot);
  });
});
