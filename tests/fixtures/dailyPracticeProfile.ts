import type { Card, NoteName, Skill } from '../../src/core/fsrs/types';
import {
  createInitialLearningProgress,
  markFsrsActivated,
  markMixReady,
  recordModelCompleted
} from '../../src/core/learning/progress';
import type { LearningProgressRecord } from '../../src/core/learning/types';
import {
  getNoteCurriculumItemId,
  getNoteMixCurriculumItemId,
  WHITE_KEY_CURRICULUM_ITEM_IDS
} from '../../src/core/learning/curriculumFlow';
import {
  BLACK_KEY_ACQUISITION_ORDER,
  EAR_ACQUISITION_ORDER,
  MILESTONE_3D_ITEM_IDS,
  NOTATION_ACQUISITION_ORDER
} from '../../src/core/learning/curriculum3d';
import { FIRST_RUN_CF_ITEM_IDS } from '../../src/core/learning/firstRunCf';
import { BASS_GRAND_ITEM_IDS } from '../../src/core/learning/bassGrandStaff';
import { INTERVAL_ITEM_IDS } from '../../src/core/learning/intervals';
import { TRIAD_ITEM_IDS } from '../../src/core/learning/triads';
import { INVERSION_ITEM_IDS } from '../../src/core/learning/chordInversions';
import { HARMONY_ITEM_IDS } from '../../src/core/learning/harmony';
import { CHORD_RHYTHM_ITEM_IDS } from '../../src/core/learning/chordRhythm';

export function createCompletedLearningProgress(now: number): Map<string, LearningProgressRecord> {
  const map = new Map<string, LearningProgressRecord>();
  const contextsFor = (id: string): string[] => {
    const noteMatch = id.match(/^curriculum-note:([A-G])$/);
    if (noteMatch) return [`region-${noteMatch[1]}3`, `region-${noteMatch[1]}4`];
    if (id === WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE) return ['identify:C', 'identify:D', 'identify:E'];
    if (id === WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB) return ['identify:F', 'identify:B'];
    if (id === WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB) return ['identify:F', 'identify:G', 'identify:A', 'identify:B'];
    if (id === WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE) {
      return ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(note => `identify:${note}`);
    }
    return [];
  };
  const markDone = (id: string) => {
    const base = createInitialLearningProgress(id, now - 500_000);
    const record = markFsrsActivated(markMixReady(recordModelCompleted(base, now - 500_000), now - 500_000), now - 500_000);
    map.set(id, {
      ...record,
      state: 'retention',
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 8,
      contexts: contextsFor(id)
    });
  };
  for (const id of Object.values(FIRST_RUN_CF_ITEM_IDS)) markDone(id);
  for (const note of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(note));
    markDone(getNoteMixCurriculumItemId(note));
  }
  for (const id of Object.values(WHITE_KEY_CURRICULUM_ITEM_IDS)) markDone(id);
  for (const note of BLACK_KEY_ACQUISITION_ORDER) markDone(`curriculum-black:${note}`);
  for (const note of NOTATION_ACQUISITION_ORDER) markDone(`curriculum-notation:${note}`);
  for (const note of EAR_ACQUISITION_ORDER) markDone(`curriculum-ear:${note}`);
  for (const id of Object.values(MILESTONE_3D_ITEM_IDS)) markDone(id);
  for (const id of Object.values(BASS_GRAND_ITEM_IDS)) markDone(id);
  for (const id of Object.values(INTERVAL_ITEM_IDS)) markDone(id);
  for (const id of Object.values(TRIAD_ITEM_IDS)) markDone(id);
  for (const id of Object.values(INVERSION_ITEM_IDS)) markDone(id);
  for (const id of Object.values(HARMONY_ITEM_IDS)) markDone(id);
  for (const id of Object.values(CHORD_RHYTHM_ITEM_IDS)) markDone(id);
  return map;
}

function dueCard(skill: Skill, note: NoteName, now: number, offsetMs: number): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'review',
    stability: 12,
    difficulty: 5,
    dueAt: now - 3_600_000 + offsetMs,
    lastReviewAt: now - 5 * 86_400_000,
    firstSeenAt: now - 30 * 86_400_000,
    reps: 5,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 5,
      firstCorrect: 5,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 5,
      scheduledSuccesses: 5,
      practiceTrials: 0
    }
  };
}

/**
 * Deterministic synthetic profile for the heterogeneous Daily Practice smoke:
 * all 11 learner stages completed, every FSRS skill family present and due.
 */
export function createDailyPracticeProfile(now = Date.now()) {
  const learningProgress = createCompletedLearningProgress(now);
  const rows: Array<{ skill: Skill; note: NoteName }> = [];
  const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

  for (const note of naturals) {
    rows.push({ skill: 'find', note });
    rows.push({ skill: 'identify', note });
    rows.push({ skill: 'patternIdentify', note });
    rows.push({ skill: 'notationToKey', note });
    rows.push({ skill: 'soundToKey', note });
    rows.push({ skill: 'notationBassToKey', note });
  }
  for (const interval of ['P8', 'P5', 'M3', 'm3'] as const) {
    rows.push({ skill: 'intervalBuild', note: interval });
    rows.push({ skill: 'intervalIdentify', note: interval });
  }
  for (const quality of ['major', 'minor'] as const) {
    rows.push({ skill: 'triadBuild', note: quality });
    rows.push({ skill: 'triadIdentify', note: quality });
  }
  rows.push(
    { skill: 'triadInversionBuild', note: 'first' },
    { skill: 'triadInversionBuild', note: 'second' },
    { skill: 'triadInversionIdentify', note: 'first' },
    { skill: 'triadInversionBuild', note: 'slash' },
    { skill: 'chordSymbolRead', note: 'root' },
    { skill: 'chordSymbolRead', note: 'slash' }
  );
  rows.push(
    { skill: 'harmonyFunctionIdentify', note: 'I' },
    { skill: 'harmonyFunctionIdentify', note: 'V' },
    { skill: 'harmonyFunctionIdentify', note: 'vi' },
    { skill: 'harmonyFunctionIdentify', note: 'IV' },
    { skill: 'harmonyNextChord', note: 'I-V-vi-IV' },
    { skill: 'harmonyProgressionPlay', note: 'C-G/B-Am-F' }
  );
  rows.push(
    { skill: 'chordPulse', note: 'pulse' },
    { skill: 'chordChangeTiming', note: 'change-timing' },
    { skill: 'chordRhythmPattern', note: 'rhythm-pattern' }
  );

  const seen = new Set<string>();
  const cards: Card[] = [];
  const advancedSkills = new Set<Skill>([
    'harmonyFunctionIdentify',
    'harmonyNextChord',
    'harmonyProgressionPlay',
    'chordPulse',
    'chordChangeTiming',
    'chordRhythmPattern'
  ]);
  for (const row of rows) {
    const id = `${row.skill}:${row.note}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // Advanced families are the most overdue so the deterministic scheduler surfaces them
    // first, guaranteeing heterogeneous coverage without touching production policy.
    const priority = advancedSkills.has(row.skill) ? -7 * 86_400_000 : 0;
    cards.push(dueCard(row.skill, row.note, now, priority + cards.length * 100));
  }

  return {
    now,
    cards,
    learningProgress,
    reviewLogs: []
  };
}
