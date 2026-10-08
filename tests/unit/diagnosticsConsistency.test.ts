import { describe, expect, it } from 'vitest';
import { buildDiagnosticSnapshot } from '../../src/core/diagnostics/buildDiagnosticSnapshot';
import { DIAGNOSTICS_SCHEMA_VERSION } from '../../src/core/diagnostics/diagnosticTypes';
import { FSRS_SKILLS } from '../../src/core/fsrs/skills';
import { DB_SCHEMA_VERSION, BACKUP_SCHEMA_VERSION } from '../../src/core/version';
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
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import type { Card, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';

const NOW = 1_800_000_000_000;

function completedRecord(id: string): LearningProgressRecord {
  const base = createInitialLearningProgress(id, NOW - 500_000);
  const record = markFsrsActivated(markMixReady(recordModelCompleted(base, NOW - 500_000), NOW - 500_000), NOW - 500_000);
  return {
    ...record,
    state: 'retention',
    guidedSuccesses: 2,
    independentUnhintedSuccesses: 5,
    contexts: []
  };
}

function fullCompletedProgress(): Map<string, LearningProgressRecord> {
  const map = new Map<string, LearningProgressRecord>();
  const markDone = (id: string) => map.set(id, completedRecord(id));
  for (const id of Object.values(FIRST_RUN_CF_ITEM_IDS)) markDone(id);
  for (const note of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(note));
    markDone(getNoteMixCurriculumItemId(note));
  }
  for (const id of Object.values(WHITE_KEY_CURRICULUM_ITEM_IDS).filter(id =>
    !id.includes('curriculum-note:') && !id.includes('curriculum-mix:')
  )) markDone(id);
  for (const note of BLACK_KEY_ACQUISITION_ORDER) markDone(`curriculum-black:${note}`);
  for (const note of NOTATION_ACQUISITION_ORDER) markDone(`curriculum-notation:${note}`);
  for (const note of EAR_ACQUISITION_ORDER) markDone(`curriculum-ear:${note}`);
  for (const id of Object.values(MILESTONE_3D_ITEM_IDS)) markDone(id);
  markDone(BASS_GRAND_ITEM_IDS.COMPLETE);
  markDone(INTERVAL_ITEM_IDS.COMPLETE);
  markDone(TRIAD_ITEM_IDS.COMPLETE);
  markDone(INVERSION_ITEM_IDS.COMPLETE);
  markDone(HARMONY_ITEM_IDS.COMPLETE);
  markDone(CHORD_RHYTHM_ITEM_IDS.COMPLETE);
  return map;
}

function makeCard(skill: Skill): Card {
  return {
    id: `${skill}:C`,
    skill,
    note: 'C',
    memoryState: 'review',
    stability: 10,
    difficulty: 5,
    dueAt: NOW + 86_400_000,
    lastReviewAt: NOW - 86_400_000,
    firstSeenAt: NOW - 10 * 86_400_000,
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

function makeLog(
  reviewEventId: string,
  ts: number,
  responseMs: number | null,
  responseTimingSource: ReviewLogEvent['responseTimingSource'],
  cardId: string
): ReviewLogEvent {
  return {
    reviewEventId,
    ts,
    sessionId: 'session-c',
    cardId,
    note: 'C',
    skill: 'find',
    kind: 'scheduled',
    grade: 3,
    gradeName: 'Good',
    firstCorrect: true,
    answer: 'C',
    answerKeyId: 'C4',
    attempts: 1,
    hintUsed: false,
    responseMs,
    responseTimingSource,
    elapsedDays: 1,
    retrievabilityBefore: 0.9,
    stabilityBefore: 5,
    stabilityAfter: 10,
    difficultyBefore: 5,
    difficultyAfter: 5,
    scheduledDays: 10,
    gradeableByFsrs: true
  };
}

describe('Diagnostics consistency on a complete synthetic profile', () => {
  const progress = fullCompletedProgress();
  const cards = FSRS_SKILLS.map(skill => makeCard(skill));
  const logs = [
    makeLog('uuid-measured-a', NOW - 3_000, 500, 'measured', 'find:C'),
    makeLog('uuid-not-measured-b', NOW - 2_000, null, 'not_measured', 'find:C'),
    makeLog('legacy-1799999999000', NOW - 1_000, 900, 'legacy_unknown', 'find:C')
  ];
  const snapshot = buildDiagnosticSnapshot({
    cards,
    learningProgress: progress,
    reviewLogs: logs,
    settings: DEFAULT_SETTINGS,
    now: NOW
  });

  it('reports no false-positive warnings for valid curriculum cards', () => {
    const checks = snapshot.storageConsistency.checks;
    expect(checks.unknownSkillIds).toEqual([]);
    expect(checks.duplicateCards).toEqual([]);
    expect(checks.invalidDueDates).toEqual([]);
    expect(checks.invalidReviewTimestamps).toEqual([]);
    expect(checks.curriculumContradictions).toEqual([]);
    expect(snapshot.storageConsistency.warnings).toEqual([]);
  });

  it('reflects the canonical roadmap with all 11 stages completed', () => {
    expect(snapshot.roadmap.totalStages).toBe(11);
    expect(snapshot.roadmap.completedStages).toBe(11);
    expect(snapshot.roadmap.currentStageId).toBeNull();
    expect(snapshot.roadmap.stages.map(stage => stage.id)).toEqual([
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
      'chord_rhythm'
    ]);
    for (const stage of snapshot.roadmap.stages) {
      expect(stage.status).toBe('completed');
    }
  });

  it('includes M3K (chordRhythm) in the advanced module snapshot', () => {
    const chordRhythm = snapshot.curriculum.advancedModules.chordRhythm;
    expect(chordRhythm).toBeDefined();
    expect(chordRhythm.status).toBe('completed');
    expect(chordRhythm.available).toBe(true);
    expect(chordRhythm.fsrsCards?.map(card => card.cardId).sort()).toEqual([
      'chordChangeTiming:C',
      'chordPulse:C',
      'chordRhythmPattern:C'
    ]);
  });

  it('reports the real storage schema and separated metadata versions', () => {
    expect(snapshot.meta.storageSchemaVersion).toBe(DB_SCHEMA_VERSION);
    expect(snapshot.meta.backupSchemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(snapshot.meta.diagnosticsSchemaVersion).toBe(DIAGNOSTICS_SCHEMA_VERSION);
    expect(snapshot.diagnosticsSchemaVersion).toBe(3);
    expect(snapshot.persistence.storageSchemaVersion).toBe(DB_SCHEMA_VERSION);
  });

  it('describes the identity-keyed persistence architecture and latency provenance', () => {
    expect(snapshot.persistence.reviewLogStore).toBe('reviewLogEvents');
    expect(snapshot.persistence.identityField).toBe('reviewEventId');
    expect(snapshot.persistence.totalReviewEvents).toBe(3);
    expect(snapshot.persistence.eventsWithGeneratedIdentity).toBe(2);
    expect(snapshot.persistence.backfilledLegacyEvents).toBe(1);
    expect(snapshot.persistence.responseTiming).toEqual({
      measured: 1,
      notMeasured: 1,
      legacyUnknown: 1
    });
  });

  it('serializes cleanly without NaN/Infinity', () => {
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
    expect(snapshot.fsrs.cards).toHaveLength(FSRS_SKILLS.length);
  });
});
