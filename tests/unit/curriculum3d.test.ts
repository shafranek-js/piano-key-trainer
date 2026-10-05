import { describe, expect, it } from 'vitest';
import {
  ALL_NOTES,
  DEFAULT_SETTINGS,
  NATURAL_NOTES
} from '../../src/core/fsrs/constants';
import type { Card, NoteName, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';
import { getCurriculumPhases } from '../../src/core/curriculum/curriculum';
import {
  BLACK_ACCIDENTAL_NOTES,
  WHITE_NATURAL_NOTES,
  getIdentifyAnswerNotes,
  getIdentifyAnswerSet,
  getIdentifyButtonLabel,
  isCanonicalPitchMatch,
  normalizeToCanonicalPitchClass,
  resolvePcKeyboardSemanticAnswer,
  resolveSemanticNoteAnswer
} from '../../src/core/input/inputPolicy';
import {
  ALL_WHITE_CURRICULUM_NOTES,
  BLACK_KEY_ACQUISITION_ORDER,
  BLACK_KEY_GEOMETRY,
  EAR_ACQUISITION_ORDER,
  FIRST_RUN_CF_ITEM_IDS,
  HINT_LEVEL,
  MILESTONE_3D_ITEM_IDS,
  NOTATION_ACQUISITION_ORDER,
  WHITE_KEY_CURRICULUM_ITEM_IDS,
  applyMilestone3dActionWithCards,
  createInitialLearningProgress,
  createMilestone3dCurriculumState,
  describeMilestone3dStep,
  filterCurriculumActiveCards,
  getEarLocalMixPool,
  getMilestone3dStepSkill,
  getNotationLocalMixPool,
  getNoteCurriculumItemId,
  getNoteMixCurriculumItemId,
  isBlackNoteRetentionMastered,
  isCurriculumCardActive,
  isPhase4BlackKeysCompleted,
  markFsrsActivated,
  markMixReady,
  recordModelCompleted,
  shouldEnterMilestone3dCurriculum,
  type BlackKeyNote,
  type LearningProgressRecord,
  type Milestone3dCurriculumState
} from '../../src/core/learning';

function makeCard(skill: Skill, note: NoteName, reps = 0): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: reps > 0 ? 'review' : 'new',
    stability: reps > 0 ? 3.5 : null,
    difficulty: reps > 0 ? 5.0 : null,
    dueAt: reps > 0 ? 2000 : 0,
    lastReviewAt: reps > 0 ? 1000 : 0,
    firstSeenAt: reps > 0 ? 1000 : 0,
    reps,
    lapses: 0,
    lastGrade: reps > 0 ? 3 : null,
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

function makeAllFreshCards(): Card[] {
  const cards: Card[] = [];
  const skills: Skill[] = [
    'find',
    'identify',
    'patternIdentify',
    'notationToKey',
    'soundToKey'
  ];
  for (const skill of skills) {
    for (const note of ALL_NOTES) {
      if (skill === 'patternIdentify' && !['C', 'F', 'E', 'B'].includes(note)) {
        continue;
      }
      if (
        (skill === 'notationToKey' || skill === 'soundToKey') &&
        !NATURAL_NOTES.includes(note as any)
      ) {
        continue;
      }
      cards.push(makeCard(skill, note, 0));
    }
  }
  return cards;
}

function makePhase3CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = new Map<string, LearningProgressRecord>();
  const markDone = (id: string, contexts: string[] = []) => {
    const base = createInitialLearningProgress(id, now);
    map.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts
    });
  };

  markDone(FIRST_RUN_CF_ITEM_IDS.GROUPS_2_3);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_C, ['region-C3', 'region-C4']);
  markDone(FIRST_RUN_CF_ITEM_IDS.ANCHOR_F, ['region-F3', 'region-F4']);
  markDone(FIRST_RUN_CF_ITEM_IDS.CONTRAST_CF);
  markDone(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF);

  for (const n of ['D', 'E', 'B', 'G', 'A'] as const) {
    markDone(getNoteCurriculumItemId(n), [`region-${n}3`, `region-${n}4`]);
    markDone(getNoteMixCurriculumItemId(n));
  }
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE);
  markDone(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE);

  return map;
}

function makePhase4CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = makePhase3CompletedProgress(now);
  map.set(
    MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
    markFsrsActivated(
      markMixReady(
        recordModelCompleted(
          createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, now),
          now
        ),
        now
      ),
      now
    )
  );
  return map;
}

function makePhase5CompletedProgress(now = 1000): Map<string, LearningProgressRecord> {
  const map = makePhase4CompletedProgress(now);
  map.set(
    MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE,
    markFsrsActivated(
      markMixReady(
        recordModelCompleted(
          createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE, now),
          now
        ),
        now
      ),
      now
    )
  );
  return map;
}

function completeBlackNoteAcquisition(
  initialState: Milestone3dCurriculumState,
  note: BlackKeyNote,
  cards: Card[],
  logs: ReviewLogEvent[]
): Milestone3dCurriculumState {
  let state = initialState;

  // 1. Model (H3)
  let res = applyMilestone3dActionWithCards({
    state,
    action: { type: 'keyPress', note, keyId: `${note}4` },
    cards,
    settings: DEFAULT_SETTINGS,
    reviewLog: logs
  });
  state = res.state;

  // 2. Guided (H2, 2 successes)
  for (let i = 0; i < 2; i++) {
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note, keyId: `${note}${i === 0 ? 4 : 3}` },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
  }

  // 3. Qualify (H0, 2 distinct octaves)
  for (const oct of [3, 5] as const) {
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note, keyId: `${note}${oct}` },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
  }

  // 4. LocalMix (H0)
  while (describeMilestone3dStep(state.step).subStage === 'localMix') {
    const target = state.targetNote ?? note;
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: target, keyId: `${target}4` },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
  }

  // 5. DelayedCheck (H0, FSRS-eligible)
  expect(describeMilestone3dStep(state.step).subStage).toBe('delayedCheck');
  res = applyMilestone3dActionWithCards({
    state,
    action: { type: 'keyPress', note, keyId: `${note}4` },
    cards,
    settings: DEFAULT_SETTINGS,
    reviewLog: logs
  });
  if (res.attemptResult?.logEvent) {
    logs.push(res.attemptResult.logEvent);
  }
  return res.state;
}

function completePhase5or6NoteAcquisition(
  initialState: Milestone3dCurriculumState,
  note: (typeof ALL_WHITE_CURRICULUM_NOTES)[number],
  cards: Card[],
  logs: ReviewLogEvent[]
): Milestone3dCurriculumState {
  let state = initialState;

  // 1. Model (H3)
  expect(describeMilestone3dStep(state.step).subStage).toBe('model');
  expect(state.targetNote).toBe(note);
  let res = applyMilestone3dActionWithCards({
    state,
    action: { type: 'keyPress', note, keyId: `${note}4` },
    cards,
    settings: DEFAULT_SETTINGS,
    reviewLog: logs
  });
  state = res.state;

  // 2. Qualify (H0, 2 successes)
  expect(describeMilestone3dStep(state.step).subStage).toBe('qualify');
  for (let i = 0; i < 2; i++) {
    expect(state.targetNote).toBe(note);
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note, keyId: `${note}4` },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
  }

  // 3. LocalMix (H0, 2 successes)
  expect(describeMilestone3dStep(state.step).subStage).toBe('localMix');
  while (describeMilestone3dStep(state.step).subStage === 'localMix') {
    const target = state.targetNote!;
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: target, keyId: `${target}4` },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
  }

  // 4. DelayedCheck (H0, FSRS-eligible)
  expect(describeMilestone3dStep(state.step).subStage).toBe('delayedCheck');
  expect(state.targetNote).toBe(note);
  res = applyMilestone3dActionWithCards({
    state,
    action: { type: 'keyPress', note, keyId: `${note}4` },
    cards,
    settings: DEFAULT_SETTINGS,
    reviewLog: logs
  });
  if (res.attemptResult?.logEvent) {
    logs.push(res.attemptResult.logEvent);
  }
  return res.state;
}

describe('Milestone 3D Rev1 — Per-Card Teaching/FSRS Integrity & Accidental Identify Answer Buttons', () => {
  it('1. Enters Milestone 3D automatically once Phase 3 (all white keys) is completed', () => {
    const cards = makeAllFreshCards();
    const progress = makePhase3CompletedProgress();

    expect(
      shouldEnterMilestone3dCurriculum({
        cards,
        reviewLogs: [],
        learningProgress: progress
      })
    ).toBe(true);

    const state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });
    expect(state.step).toBe('csModel');
    expect(BLACK_KEY_GEOMETRY['C#'].displayLabel).toBe('C♯ / D♭');
    expect(BLACK_KEY_GEOMETRY['D#'].displayLabel).toBe('D♯ / E♭');
    expect(BLACK_KEY_GEOMETRY['F#'].displayLabel).toBe('F♯ / G♭');
    expect(BLACK_KEY_GEOMETRY['G#'].displayLabel).toBe('G♯ / A♭');
    expect(BLACK_KEY_GEOMETRY['A#'].displayLabel).toBe('A♯ / B♭');
  });

  it('2. Enforces multi-octave qualify and FSRS isolation boundary during black-key acquisition', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });

    const csCard = cards.find(c => c.id === 'find:C#')!;
    expect(csCard.reps).toBe(0);

    // Model (H3) -> does not mutate FSRS card
    let res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(res.trialContext?.hintLevel).toBe(HINT_LEVEL.MODEL_VISIBLE);
    expect(res.trialContext?.gradeableByFsrs).toBe(false);
    expect(csCard.reps).toBe(0);
    state = res.state;
    expect(state.step).toBe('csGuided');

    // Guided (H2) -> 2 presses
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#3' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    state = res.state;
    expect(state.step).toBe('csQualify');
    expect(csCard.reps).toBe(0);

    // Qualify (H0): first press in octave 4 succeeds, duplicate press in octave 4 is rejected as duplicate_context
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(res.outcome).toBe('progressed');
    state = res.state;

    const dupRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(dupRes.outcome).toBe('duplicate_context');
    expect(dupRes.state.step).toBe('csQualify');

    // Second distinct octave (C#2) advances to csLocalMix
    res = applyMilestone3dActionWithCards({
      state: dupRes.state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#2' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(res.outcome).toBe('advanced');
    state = res.state;
    expect(state.step).toBe('csLocalMix');
    expect(csCard.reps).toBe(0);

    // Complete csLocalMix (3 items) -> still no FSRS mutation
    while (state.step === 'csLocalMix') {
      const target = state.targetNote!;
      res = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      });
      state = res.state;
    }
    expect(state.step).toBe('csDelayedCheck');
    expect(csCard.reps).toBe(0);

    // DelayedCheck (H0) -> FSRS eligible! Mutates find:C#
    res = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(res.trialContext?.mode).toBe('delayedCheck');
    expect(res.trialContext?.gradeableByFsrs).toBe(true);
    expect(csCard.reps).toBe(1);
    expect(res.state.step).toBe('dsModel');
  });

  it('3. Progresses through all of Phase 4 (C#, D#, twoBlackIdentify, F#, G#, A#, threeBlackIdentify, allBlackMix, allBlackIdentify, phase4Complete)', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });

    // C# and D#
    state = completeBlackNoteAcquisition(state, 'C#', cards, logs);
    expect(state.step).toBe('dsModel');
    state = completeBlackNoteAcquisition(state, 'D#', cards, logs);
    expect(state.step).toBe('twoBlackIdentify');

    // twoBlackIdentify (C#, D#)
    while (state.step === 'twoBlackIdentify') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'semanticAnswer', note: target, channel: 'answerButton' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('fsModel');

    // F#, G#, A#
    state = completeBlackNoteAcquisition(state, 'F#', cards, logs);
    expect(state.step).toBe('gsModel');
    state = completeBlackNoteAcquisition(state, 'G#', cards, logs);
    expect(state.step).toBe('asModel');
    state = completeBlackNoteAcquisition(state, 'A#', cards, logs);
    expect(state.step).toBe('threeBlackIdentify');

    // threeBlackIdentify (F#, G#, A#)
    while (state.step === 'threeBlackIdentify') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'semanticAnswer', note: target, channel: 'answerButton' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('allBlackMix');

    // allBlackMix (5 items)
    while (state.step === 'allBlackMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('allBlackIdentify');

    // allBlackIdentify (5 items)
    while (state.step === 'allBlackIdentify') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'semanticAnswer', note: target, channel: 'answerButton' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('phase4Complete');

    // Advance Phase 4 -> Phase 5 (notationCModel)
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'advancePhase' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    expect(state.step).toBe('notationCModel');
    expect(isPhase4BlackKeysCompleted(state.progress, cards, logs)).toBe(true);

    // Verify all 5 black find & identify cards are now curriculum-active when level='all'
    for (const n of BLACK_KEY_ACQUISITION_ORDER) {
      expect(
        isCurriculumCardActive(makeCard('find', n), {
          learningProgress: state.progress,
          cards,
          reviewLogs: logs,
          level: 'all'
        })
      ).toBe(true);
      expect(
        isCurriculumCardActive(makeCard('identify', n), {
          learningProgress: state.progress,
          cards,
          reviewLogs: logs,
          level: 'all'
        })
      ).toBe(true);
    }
  });

  it('4. notationCDelayedCheck activates ONLY notationToKey:C and does NOT activate notationToKey:F or notationToKey:G', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });
    expect(state.step).toBe('notationCModel');

    // Before notationCDelayedCheck, notationToKey:C, F, G are all inactive
    for (const n of ['C', 'F', 'G'] as const) {
      expect(
        isCurriculumCardActive(makeCard('notationToKey', n), {
          learningProgress: state.progress,
          cards
        })
      ).toBe(false);
    }

    // Wrong octave C3 is rejected
    const wrongOctRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C3' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(wrongOctRes.outcome).toBe('wrong_octave');
    expect(wrongOctRes.state.step).toBe('notationCModel');

    // Complete only note C (notationCModel -> notationCQualify -> notationCLocalMix -> notationCDelayedCheck)
    state = completePhase5or6NoteAcquisition(state, 'C', cards, logs);
    expect(state.step).toBe('notationFModel');

    // ONLY notationToKey:C is active! notationToKey:F and notationToKey:G are NOT active!
    expect(
      isCurriculumCardActive(makeCard('notationToKey', 'C'), {
        learningProgress: state.progress,
        cards
      })
    ).toBe(true);
    expect(
      isCurriculumCardActive(makeCard('notationToKey', 'F'), {
        learningProgress: state.progress,
        cards
      })
    ).toBe(false);
    expect(
      isCurriculumCardActive(makeCard('notationToKey', 'G'), {
        learningProgress: state.progress,
        cards
      })
    ).toBe(false);
    expect(cards.find(c => c.id === 'notationToKey:C')!.reps).toBe(1);
    expect(cards.find(c => c.id === 'notationToKey:F')!.reps).toBe(0);
    expect(cards.find(c => c.id === 'notationToKey:G')!.reps).toBe(0);
  });

  it('5. earCDelayedCheck activates ONLY soundToKey:C and does NOT activate soundToKey:D, soundToKey:E, or soundToKey:F', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    for (const id of [
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE
    ]) {
      progress.set(
        id,
        markFsrsActivated(
          markMixReady(
            recordModelCompleted(createInitialLearningProgress(id, 1000), 1000),
            1000
          ),
          1000
        )
      );
    }

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });
    expect(state.step).toBe('earCModel');

    // Complete only note C (earCModel -> earCQualify -> earCLocalMix -> earCDelayedCheck)
    state = completePhase5or6NoteAcquisition(state, 'C', cards, logs);
    expect(state.step).toBe('earDModel');

    // ONLY soundToKey:C is active! D, E, F are NOT active!
    expect(
      isCurriculumCardActive(makeCard('soundToKey', 'C'), {
        learningProgress: state.progress,
        cards
      })
    ).toBe(true);
    for (const n of ['D', 'E', 'F', 'G', 'A', 'B'] as const) {
      expect(
        isCurriculumCardActive(makeCard('soundToKey', n), {
          learningProgress: state.progress,
          cards
        })
      ).toBe(false);
      expect(cards.find(c => c.id === `soundToKey:${n}`)!.reps).toBe(0);
    }
    expect(cards.find(c => c.id === 'soundToKey:C')!.reps).toBe(1);
  });

  it('6. Phase 5 and Phase 6 never ask an unmodeled note in qualify or localMix before its own model step', () => {
    // Verify localMix pools for Phase 5 (C -> F -> G -> D -> E -> A -> B) only contain already-modeled notes
    for (let i = 0; i < NOTATION_ACQUISITION_ORDER.length; i++) {
      const note = NOTATION_ACQUISITION_ORDER[i];
      const modeledSoFar = NOTATION_ACQUISITION_ORDER.slice(0, i + 1);
      const unmodeledLater = NOTATION_ACQUISITION_ORDER.slice(i + 1);
      const pool = getNotationLocalMixPool(note);

      expect(pool).toContain(note);
      for (const laterNote of unmodeledLater) {
        expect(pool).not.toContain(laterNote);
      }
      for (const p of pool) {
        if (i === 0) {
          // Only for the very first note C, C is contrasted with keyboard anchor F4
          expect(['C', 'F']).toContain(p);
        } else {
          expect(modeledSoFar).toContain(p);
        }
      }
    }

    // Verify localMix pools for Phase 6 (C -> D -> E -> F -> G -> A -> B) only contain already-modeled notes
    for (let i = 0; i < EAR_ACQUISITION_ORDER.length; i++) {
      const note = EAR_ACQUISITION_ORDER[i];
      const modeledSoFar = EAR_ACQUISITION_ORDER.slice(0, i + 1);
      const unmodeledLater = EAR_ACQUISITION_ORDER.slice(i + 1);
      const pool = getEarLocalMixPool(note);

      expect(pool).toContain(note);
      for (const laterNote of unmodeledLater) {
        if (i === 0 && laterNote === 'G') continue;
        expect(pool).not.toContain(laterNote);
      }
      if (i > 0) {
        for (const p of pool) {
          expect(modeledSoFar).toContain(p);
        }
      }
    }

    // Walk through all of Phase 5 and Phase 6 and verify every note's model step occurs before its qualify/localMix
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });

    const modeledNotation = new Set<string>();
    for (const n of NOTATION_ACQUISITION_ORDER) {
      expect(describeMilestone3dStep(state.step).subStage).toBe('model');
      expect(state.targetNote).toBe(n);
      modeledNotation.add(n);
      state = completePhase5or6NoteAcquisition(state, n, cards, logs);
    }
    expect(state.step).toBe('phase5Complete');
    expect(modeledNotation.size).toBe(7);

    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'advancePhase' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;

    const modeledEar = new Set<string>();
    for (const n of EAR_ACQUISITION_ORDER) {
      expect(describeMilestone3dStep(state.step).subStage).toBe('model');
      expect(state.targetNote).toBe(n);
      modeledEar.add(n);
      state = completePhase5or6NoteAcquisition(state, n, cards, logs);
    }
    expect(state.step).toBe('phase6Complete');
    expect(modeledEar.size).toBe(7);
  });

  it('7. Wrong answer on notation*DelayedCheck and ear*DelayedCheck creates only ONE FSRS Again (grade: 1), enters remediation, and preserves remediation across reload', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });

    // Advance note C to notationCDelayedCheck
    // 1. Model
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    // 2. Qualify (2x)
    for (let i = 0; i < 2; i++) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C', keyId: 'C4' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    // 3. LocalMix (2x)
    while (state.step === 'notationCLocalMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('notationCDelayedCheck');

    // Press WRONG key (D4 instead of C4) on notationCDelayedCheck
    const failRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'D', keyId: 'D4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(failRes.outcome).toBe('wrong_note');
    expect(failRes.fsrsDelayedCheck?.isCorrect).toBe(false);
    expect(failRes.attemptResult?.grade).toBe(1);
    if (failRes.attemptResult?.logEvent) {
      logs.push(failRes.attemptResult.logEvent);
    }
    expect(logs.length).toBe(1);

    state = failRes.state;
    expect(state.awaitingCorrective).toBe(true);
    expect(state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);

    // Card must NOT leak into scheduler while pending:delayedRetry is set!
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'notationToKey:C')!, {
        learningProgress: state.progress,
        cards
      })
    ).toBe(false);

    // Simulate reload mid-remediation (awaitingCorrective)
    const reloadedMidCorrective = createMilestone3dCurriculumState({
      learningProgress: state.progress,
      cards
    });
    expect(reloadedMidCorrective.step).toBe('notationCDelayedCheck');
    expect(reloadedMidCorrective.awaitingCorrective).toBe(true);

    // Repeated wrong press during awaitingCorrective does NOT create another FSRS review!
    const secondWrongRes = applyMilestone3dActionWithCards({
      state: reloadedMidCorrective,
      action: { type: 'keyPress', note: 'E', keyId: 'E4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(secondWrongRes.attemptResult).toBeNull();
    expect(secondWrongRes.fsrsDelayedCheck).toBeNull();
    expect(logs.length).toBe(1);

    // Corrective press (C4) -> transitions to intervening recall (isInterveningRecall = true), non-FSRS
    const corrRes = applyMilestone3dActionWithCards({
      state: secondWrongRes.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(corrRes.outcome).toBe('corrective_completed');
    expect(corrRes.attemptResult).toBeNull();
    expect(logs.length).toBe(1);
    expect(corrRes.state.isInterveningRecall).toBe(true);
    expect(corrRes.state.awaitingCorrective).toBe(false);

    // Simulate reload during intervening recall
    const reloadedMidIntervening = createMilestone3dCurriculumState({
      learningProgress: corrRes.state.progress,
      cards
    });
    expect(reloadedMidIntervening.step).toBe('notationCDelayedCheck');
    expect(reloadedMidIntervening.isInterveningRecall).toBe(true);

    // Complete intervening recall (F4) -> non-FSRS, prepares fresh H0 delayedCheck retry for C4
    const intervRes = applyMilestone3dActionWithCards({
      state: reloadedMidIntervening,
      action: {
        type: 'keyPress',
        note: reloadedMidIntervening.targetNote!,
        keyId: `${reloadedMidIntervening.targetNote!}4`
      },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(intervRes.outcome).toBe('progressed');
    expect(intervRes.attemptResult).toBeNull();
    expect(logs.length).toBe(1);
    expect(intervRes.state.isInterveningRecall).toBe(false);
    expect(intervRes.state.targetNote).toBe('C');

    // Fresh independent H0 retry on notationCDelayedCheck -> FSRS-eligible!
    // Canonical rule: the failed first attempt already graded Again once.
    // The H0 retry completes pedagogical remediation with 0 additional FSRS mutations.
    const retryPassRes = applyMilestone3dActionWithCards({
      state: intervRes.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(retryPassRes.outcome).toBe('advanced');
    expect(retryPassRes.fsrsDelayedCheck?.isCorrect).toBe(true);
    expect(retryPassRes.attemptResult?.logEvent ?? null).toBeNull();
    if (retryPassRes.attemptResult?.logEvent) {
      logs.push(retryPassRes.attemptResult.logEvent);
    }
    expect(logs.length).toBe(1);
    expect(retryPassRes.state.step).toBe('notationFModel');
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'notationToKey:C')!, {
        learningProgress: retryPassRes.state.progress,
        cards
      })
    ).toBe(true);
  });

  it('8. Wrong answer on ear*DelayedCheck follows the exact same Again -> corrective -> intervening -> H0 retry protocol', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();
    for (const id of [
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE
    ]) {
      progress.set(
        id,
        markFsrsActivated(
          markMixReady(
            recordModelCompleted(createInitialLearningProgress(id, 1000), 1000),
            1000
          ),
          1000
        )
      );
    }

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards
    });
    expect(state.step).toBe('earCModel');

    // Advance C to earCDelayedCheck
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    for (let i = 0; i < 2; i++) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C', keyId: 'C4' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    while (state.step === 'earCLocalMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('earCDelayedCheck');

    // Fail earCDelayedCheck
    const failRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'G', keyId: 'G4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(failRes.attemptResult?.grade).toBe(1);
    if (failRes.attemptResult?.logEvent) logs.push(failRes.attemptResult.logEvent);
    expect(logs.length).toBe(1);
    expect(failRes.state.awaitingCorrective).toBe(true);

    // Extra wrong press during corrective does NOT log another FSRS review
    const extraWrong = applyMilestone3dActionWithCards({
      state: failRes.state,
      action: { type: 'keyPress', note: 'A', keyId: 'A4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(extraWrong.attemptResult).toBeNull();
    expect(logs.length).toBe(1);

    // Corrective C4 -> Intervening recall -> Retry C4
    const corr = applyMilestone3dActionWithCards({
      state: extraWrong.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(corr.outcome).toBe('corrective_completed');
    expect(corr.state.isInterveningRecall).toBe(true);

    const interv = applyMilestone3dActionWithCards({
      state: corr.state,
      action: {
        type: 'keyPress',
        note: corr.state.targetNote!,
        keyId: `${corr.state.targetNote!}4`
      },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(interv.outcome).toBe('progressed');
    expect(interv.state.isInterveningRecall).toBe(false);

    const retryPass = applyMilestone3dActionWithCards({
      state: interv.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(retryPass.outcome).toBe('advanced');
    expect(retryPass.state.step).toBe('earDModel');
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'soundToKey:C')!, {
        learningProgress: retryPass.state.progress,
        cards
      })
    ).toBe(true);
  });

  it('9. settings.level === "white" continues to exclude black scheduler cards even after Phase 4 completion, and patternIdentify exists only for C/F/E/B', () => {
    const cards = makeAllFreshCards();
    const progress = makePhase3CompletedProgress();

    // Mark all black keys and Phase 4 complete
    for (const n of BLACK_KEY_ACQUISITION_ORDER) {
      const id = `curriculum-note:${n}`;
      progress.set(
        id,
        markFsrsActivated(
          markMixReady(
            recordModelCompleted(createInitialLearningProgress(id, 1000), 1000),
            1000
          ),
          1000
        )
      );
    }
    progress.set(
      MILESTONE_3D_ITEM_IDS.IDENTIFY_ALL_BLACK,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.IDENTIFY_ALL_BLACK, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );

    expect(isPhase4BlackKeysCompleted(progress, cards)).toBe(true);

    // When level === 'white', black cards MUST be excluded!
    const whiteFiltered = filterCurriculumActiveCards(cards, {
      learningProgress: progress,
      cards,
      level: 'white'
    });
    expect(whiteFiltered.some(c => BLACK_ACCIDENTAL_NOTES.includes(c.note))).toBe(false);

    // When level === 'all', black find & identify cards ARE included
    const allFiltered = filterCurriculumActiveCards(cards, {
      learningProgress: progress,
      cards,
      level: 'all'
    });
    expect(allFiltered.some(c => c.skill === 'find' && c.note === 'C#')).toBe(true);
    expect(allFiltered.some(c => c.skill === 'identify' && c.note === 'F#')).toBe(true);

    // patternIdentify cards exist ONLY for C, F, E, B
    const patternCards = cards.filter(c => c.skill === 'patternIdentify');
    expect(patternCards.map(c => c.note).sort()).toEqual(['B', 'C', 'E', 'F']);
  });

  it('10. Context-aware identify answer buttons: white-only (7), black-only (2/3/5), mixed-chromatic (12), canonical enharmonic normalization, and Shift keyboard shortcuts', () => {
    // 1) White-only identify renders only 7 natural buttons (C D E F G A B)
    const whiteOnlyNotes = getIdentifyAnswerNotes({
      currentCard: makeCard('identify', 'C'),
      activeCards: WHITE_NATURAL_NOTES.map(n => makeCard('identify', n, 1)),
      level: 'white'
    });
    expect(whiteOnlyNotes).toEqual(WHITE_NATURAL_NOTES);
    const whiteSet = getIdentifyAnswerSet({ answerPool: whiteOnlyNotes });
    expect(whiteSet.mode).toBe('white-only');
    expect(whiteSet.notes).toHaveLength(7);
    expect(whiteSet.keyboardHint).toBe('Белые: C–B / 1–7');

    // 2) Black-key teaching identify (twoBlackIdentify, threeBlackIdentify, allBlackIdentify) renders accidental buttons
    const twoBlackSet = getIdentifyAnswerSet({ answerPool: ['C#', 'D#'] });
    expect(twoBlackSet.mode).toBe('black-only');
    expect(twoBlackSet.notes).toEqual(['C#', 'D#']);
    expect(getIdentifyButtonLabel('C#').shortLabel).toBe('C#/Db');
    expect(getIdentifyButtonLabel('D#').shortLabel).toBe('D#/Eb');
    expect(twoBlackSet.keyboardHint).toContain('Shift + C/D/F/G/A');

    // 3) Mixed chromatic identify renders 12 answers (7 white + 5 black) when level='all' and black identify cards are active
    const mixedNotes = getIdentifyAnswerNotes({
      currentCard: makeCard('identify', 'F#'),
      activeCards: [
        ...WHITE_NATURAL_NOTES.map(n => makeCard('identify', n, 1)),
        ...BLACK_ACCIDENTAL_NOTES.map(n => makeCard('identify', n, 1))
      ],
      level: 'all'
    });
    expect(mixedNotes).toHaveLength(12);
    const mixedSet = getIdentifyAnswerSet({ answerPool: mixedNotes });
    expect(mixedSet.mode).toBe('mixed-chromatic');
    expect(mixedSet.whiteNotes).toEqual(WHITE_NATURAL_NOTES);
    expect(mixedSet.blackNotes).toEqual(BLACK_ACCIDENTAL_NOTES);
    expect(mixedSet.keyboardHint).toBe(
      'Белые: C–B / 1–7 · Чёрные: Shift + C/D/F/G/A'
    );

    // 4) Clicking an accidental button / enharmonic alias evaluates against canonical pitch class ('C#')
    expect(normalizeToCanonicalPitchClass('C#')).toBe('C#');
    expect(normalizeToCanonicalPitchClass('C#/Db')).toBe('C#');
    expect(normalizeToCanonicalPitchClass('Db')).toBe('C#');
    expect(normalizeToCanonicalPitchClass('C♯ / D♭')).toBe('C#');
    expect(normalizeToCanonicalPitchClass('Gb')).toBe('F#');
    expect(normalizeToCanonicalPitchClass('Bb')).toBe('A#');
    expect(isCanonicalPitchMatch('C#/Db', 'C#')).toBe(true);
    expect(isCanonicalPitchMatch('Db', 'C#')).toBe(true);
    expect(resolveSemanticNoteAnswer('identify', 'answerButton', 'C#')).toEqual({
      answerNote: 'C#',
      answerKeyId: undefined
    });

    // 5) Shift + C/D/F/G/A and Shift + 1/2/4/5/6 continue to work on PC keyboard
    for (const [code, key, expected] of [
      ['KeyC', 'C', 'C#'],
      ['KeyD', 'D', 'D#'],
      ['KeyF', 'F', 'F#'],
      ['KeyG', 'G', 'G#'],
      ['KeyA', 'A', 'A#'],
      ['Digit1', '!', 'C#'],
      ['Digit2', '@', 'D#'],
      ['Digit4', '$', 'F#'],
      ['Digit5', '%', 'G#'],
      ['Digit6', '^', 'A#']
    ] as const) {
      expect(
        resolvePcKeyboardSemanticAnswer('identify', {
          code,
          key,
          shiftKey: true
        })
      ).toEqual({
        answerNote: expected,
        answerKeyId: undefined
      });
    }
  });

  it('11. getCurriculumPhases reflects progressive unlocking from Phase 3 -> Phase 4 -> Phase 5 -> Phase 6', () => {
    const cards = makeAllFreshCards();
    const cardsMap = new Map(cards.map(c => [c.id, c]));
    const getCard = (skill: Skill, note: NoteName) =>
      cardsMap.get(`${skill}:${note}`) || makeCard(skill, note);

    const progress = makePhase3CompletedProgress();

    // After Phase 3 is done: Phase 4 (Чёрные) opens, Phase 5 & 6 wait for Phase 4
    let phases = getCurriculumPhases('white', getCard, [], progress);
    expect(phases[0].done).toBe(true);
    expect(phases[1].done).toBe(true);
    expect(phases[2].done).toBe(true);
    expect(phases[3].open).toBe(true);
    expect(phases[3].done).toBe(false);
    expect(phases[4].open).toBe(false);

    // Mark Phase 4 complete -> Phase 5 (Нотный стан) opens
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE4_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );
    phases = getCurriculumPhases('white', getCard, [], progress);
    expect(phases[3].done).toBe(true);
    expect(phases[4].open).toBe(true);
    expect(phases[4].done).toBe(false);

    // Mark Phase 5 complete -> Phase 6 (Слух) opens
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE5_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );
    phases = getCurriculumPhases('white', getCard, [], progress);
    expect(phases[4].done).toBe(true);
    expect(phases[5].open).toBe(true);
    expect(phases[5].done).toBe(false);

    // Mark Phase 6 complete -> all 6 phases done!
    progress.set(
      MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE,
      markFsrsActivated(
        markMixReady(
          recordModelCompleted(
            createInitialLearningProgress(MILESTONE_3D_ITEM_IDS.PHASE6_COMPLETE, 1000),
            1000
          ),
          1000
        ),
        1000
      )
    );
    phases = getCurriculumPhases('white', getCard, [], progress);
    expect(phases.every(p => p.done)).toBe(true);
    expect(getMilestone3dStepSkill('csModel')).toBe('find');
    expect(getMilestone3dStepSkill('twoBlackIdentify')).toBe('identify');
    expect(getMilestone3dStepSkill('notationCQualify')).toBe('notationToKey');
    expect(getMilestone3dStepSkill('earCQualify')).toBe('soundToKey');
    expect(isBlackNoteRetentionMastered('C#', progress, cards)).toBe(true);
  });

  it('12. Notation delayedCheck -> Don\'t Know -> immediate reload => corrective H2, 0 FSRS events', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase4CompletedProgress();

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards,
      reviewLogs: logs
    });
    expect(state.step).toBe('notationCModel');

    // Model -> Qualify -> LocalMix -> DelayedCheck
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    for (let i = 0; i < 2; i++) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C', keyId: 'C4' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    while (state.step === 'notationCLocalMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('notationCDelayedCheck');

    // Press Don't Know on notationCDelayedCheck
    const dontKnowRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(dontKnowRes.outcome).toBe('dont_know_revealed');
    expect(dontKnowRes.attemptResult).toBeNull();
    expect(dontKnowRes.fsrsDelayedCheck).toBeNull();
    expect(logs.length).toBe(0); // 0 FSRS events!
    expect(dontKnowRes.state.awaitingCorrective).toBe(true);
    expect(dontKnowRes.state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(dontKnowRes.updatedProgress.length).toBe(1);
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:delayedRetry');
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:corrective');

    // Card must NOT leak into scheduler
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'notationToKey:C')!, {
        learningProgress: dontKnowRes.state.progress,
        cards
      })
    ).toBe(false);

    // Immediate reload right after Don't Know
    const reloaded = createMilestone3dCurriculumState({
      learningProgress: dontKnowRes.state.progress,
      cards
    });
    expect(reloaded.step).toBe('notationCDelayedCheck');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(reloaded.structuralGuideKeyIds).toContain('C4');

    // Play corrective key (C4)
    const corrRes = applyMilestone3dActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(corrRes.outcome).toBe('corrective_completed');
    expect(corrRes.attemptResult).toBeNull();
    expect(logs.length).toBe(0); // still 0 FSRS events!
    expect(corrRes.state.isInterveningRecall).toBe(true);
    expect(corrRes.state.awaitingCorrective).toBe(false);

    // Reload during intervening recall
    const reloadedIntervening = createMilestone3dCurriculumState({
      learningProgress: corrRes.state.progress,
      cards
    });
    expect(reloadedIntervening.step).toBe('notationCDelayedCheck');
    expect(reloadedIntervening.isInterveningRecall).toBe(true);
    expect(reloadedIntervening.targetNote).toBe('C'); // for first note C, only C has been modeled

    // Complete intervening recall (C4)
    const intervRes = applyMilestone3dActionWithCards({
      state: reloadedIntervening,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(intervRes.outcome).toBe('progressed');
    expect(intervRes.state.isInterveningRecall).toBe(false);
    expect(intervRes.state.targetNote).toBe('C');
    expect(intervRes.state.hintLevel).toBe(HINT_LEVEL.NONE);

    // Fresh H0 delayedCheck retry succeeds -> first FSRS observation recorded!
    const retryRes = applyMilestone3dActionWithCards({
      state: intervRes.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(retryRes.outcome).toBe('advanced');
    expect(retryRes.fsrsDelayedCheck?.isCorrect).toBe(true);
    expect(retryRes.attemptResult?.logEvent).toBeTruthy();
    if (retryRes.attemptResult?.logEvent) logs.push(retryRes.attemptResult.logEvent);
    expect(logs.length).toBe(1);
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'notationToKey:C')!, {
        learningProgress: retryRes.state.progress,
        cards
      })
    ).toBe(true);
  });

  it('13. Ear delayedCheck -> Don\'t Know -> immediate reload => corrective H2, 0 FSRS events', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase5CompletedProgress();

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards,
      reviewLogs: logs
    });
    expect(state.step).toBe('earCModel');

    // Model -> Qualify -> LocalMix -> DelayedCheck
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    for (let i = 0; i < 2; i++) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C', keyId: 'C4' },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    while (state.step === 'earCLocalMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('earCDelayedCheck');

    // Press Don't Know on earCDelayedCheck
    const dontKnowRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(dontKnowRes.outcome).toBe('dont_know_revealed');
    expect(dontKnowRes.attemptResult).toBeNull();
    expect(dontKnowRes.fsrsDelayedCheck).toBeNull();
    expect(logs.length).toBe(0);
    expect(dontKnowRes.state.awaitingCorrective).toBe(true);
    expect(dontKnowRes.state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:delayedRetry');
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:corrective');

    // Immediate reload right after Don't Know
    const reloaded = createMilestone3dCurriculumState({
      learningProgress: dontKnowRes.state.progress,
      cards
    });
    expect(reloaded.step).toBe('earCDelayedCheck');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);

    // Play corrective key (C4)
    const corrRes = applyMilestone3dActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(corrRes.outcome).toBe('corrective_completed');
    expect(corrRes.attemptResult).toBeNull();
    expect(logs.length).toBe(0);
    expect(corrRes.state.isInterveningRecall).toBe(true);

    // Reload during intervening recall
    const reloadedIntervening = createMilestone3dCurriculumState({
      learningProgress: corrRes.state.progress,
      cards
    });
    expect(reloadedIntervening.step).toBe('earCDelayedCheck');
    expect(reloadedIntervening.isInterveningRecall).toBe(true);
    expect(reloadedIntervening.targetNote).toBe('C'); // for first note C, only C has been modeled

    // Complete intervening recall (C4)
    const intervRes = applyMilestone3dActionWithCards({
      state: reloadedIntervening,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(intervRes.outcome).toBe('progressed');
    expect(intervRes.state.isInterveningRecall).toBe(false);
    expect(intervRes.state.targetNote).toBe('C');

    // Fresh H0 retry succeeds
    const retryRes = applyMilestone3dActionWithCards({
      state: intervRes.state,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(retryRes.outcome).toBe('advanced');
    expect(retryRes.fsrsDelayedCheck?.isCorrect).toBe(true);
    if (retryRes.attemptResult?.logEvent) logs.push(retryRes.attemptResult.logEvent);
    expect(logs.length).toBe(1);
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'soundToKey:C')!, {
        learningProgress: retryRes.state.progress,
        cards
      })
    ).toBe(true);
  });

  it('14. Black key delayedCheck -> Don\'t Know -> immediate reload => corrective H2, 0 FSRS events', () => {
    const cards = makeAllFreshCards();
    const logs: ReviewLogEvent[] = [];
    const progress = makePhase3CompletedProgress();

    let state = createMilestone3dCurriculumState({
      learningProgress: progress,
      cards,
      reviewLogs: logs
    });
    expect(state.step).toBe('csModel');

    // Model (H3)
    state = applyMilestone3dActionWithCards({
      state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    }).state;
    // Guided (H2, 2x)
    for (let i = 0; i < 2; i++) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C#', keyId: `${'C#'}${i === 0 ? 4 : 3}` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    // Qualify (H0, 2 distinct octaves)
    for (const oct of [3, 5] as const) {
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: 'C#', keyId: `C#${oct}` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    // LocalMix (H0)
    while (state.step === 'csLocalMix') {
      const target = state.targetNote!;
      state = applyMilestone3dActionWithCards({
        state,
        action: { type: 'keyPress', note: target, keyId: `${target}4` },
        cards,
        settings: DEFAULT_SETTINGS,
        reviewLog: logs
      }).state;
    }
    expect(state.step).toBe('csDelayedCheck');

    // Press Don't Know on csDelayedCheck
    const dontKnowRes = applyMilestone3dActionWithCards({
      state,
      action: { type: 'dontKnow' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(dontKnowRes.outcome).toBe('dont_know_revealed');
    expect(dontKnowRes.attemptResult).toBeNull();
    expect(dontKnowRes.fsrsDelayedCheck).toBeNull();
    expect(logs.length).toBe(0);
    expect(dontKnowRes.state.awaitingCorrective).toBe(true);
    expect(dontKnowRes.state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:delayedRetry');
    expect(dontKnowRes.updatedProgress[0].contexts).toContain('pending:corrective');

    // Immediate reload right after Don't Know
    const reloaded = createMilestone3dCurriculumState({
      learningProgress: dontKnowRes.state.progress,
      cards
    });
    expect(reloaded.step).toBe('csDelayedCheck');
    expect(reloaded.awaitingCorrective).toBe(true);
    expect(reloaded.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);

    // Play corrective key (C#4)
    const corrRes = applyMilestone3dActionWithCards({
      state: reloaded,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(corrRes.outcome).toBe('corrective_completed');
    expect(corrRes.attemptResult).toBeNull();
    expect(logs.length).toBe(0);
    expect(corrRes.state.isInterveningRecall).toBe(true);

    // Reload during intervening recall
    const reloadedIntervening = createMilestone3dCurriculumState({
      learningProgress: corrRes.state.progress,
      cards
    });
    expect(reloadedIntervening.step).toBe('csDelayedCheck');
    expect(reloadedIntervening.isInterveningRecall).toBe(true);
    expect(reloadedIntervening.targetNote).toBe('C'); // black contrast anchor for C# is C

    // Complete intervening recall (C4)
    const intervRes = applyMilestone3dActionWithCards({
      state: reloadedIntervening,
      action: { type: 'keyPress', note: 'C', keyId: 'C4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(intervRes.outcome).toBe('progressed');
    expect(intervRes.state.isInterveningRecall).toBe(false);
    expect(intervRes.state.targetNote).toBe('C#');

    // Fresh H0 retry succeeds
    const retryRes = applyMilestone3dActionWithCards({
      state: intervRes.state,
      action: { type: 'keyPress', note: 'C#', keyId: 'C#4' },
      cards,
      settings: DEFAULT_SETTINGS,
      reviewLog: logs
    });
    expect(retryRes.outcome).toBe('advanced');
    expect(retryRes.fsrsDelayedCheck?.isCorrect).toBe(true);
    if (retryRes.attemptResult?.logEvent) logs.push(retryRes.attemptResult.logEvent);
    expect(logs.length).toBe(1);
    expect(
      isCurriculumCardActive(cards.find(c => c.id === 'find:C#')!, {
        learningProgress: retryRes.state.progress,
        cards,
        level: 'all'
      })
    ).toBe(true);
  });
});

