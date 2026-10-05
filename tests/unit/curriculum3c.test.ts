import { describe, it, expect } from 'vitest';
import {
  ALL_WHITE_CURRICULUM_NOTES,
  CURRICULUM_ACQUISITION_ORDER,
  FIRST_RUN_CF_ITEM_IDS,
  HINT_LEVEL,
  THREE_BLACK_FAMILY_NOTES,
  TWO_BLACK_FAMILY_NOTES,
  WHITE_KEY_CURRICULUM_ITEM_IDS,
  WHITE_KEY_GEOMETRY,
  advanceCurriculumProgress,
  applyCurriculumActionWithCards,
  buildInitialAllWhiteMixQueue,
  buildInitialLocalMixQueue,
  canUseInputForCurriculumStep,
  createInitialLearningProgress,
  createWhiteKeyCurriculumState,
  deriveFsrsEligibility,
  describeCurriculumStep,
  evaluateCurriculumEntry,
  filterCurriculumActiveCards,
  getCurriculumDiagramSpec,
  getFamilyMixPool,
  getIdentifyPoolForStage,
  getLocalMixPool,
  getMixTargetForNote,
  isConstrainedWhiteMixSequence,
  isCurriculumCardActive,
  isNoteMixReady,
  isNoteRetentionMastered,
  isValidWhiteKeyRegionContext,
  isWhiteKeyCurriculumCompleted,
  markFsrsActivated,
  markMixReady,
  recordGuidedAttempt,
  recordIndependentAttempt,
  recordModelCompleted,
  resolveTrainingOrchestration,
  shouldEnterWhiteKeyCurriculum,
  type CurriculumAcquisitionNote,
  type LearningProgressRecord,
  type WhiteKeyCurriculumState
} from '../../src/core/learning';
import { getCurriculumPhases } from '../../src/core/curriculum/curriculum';
import { submitQuestionAttempt, type QuestionRoundState } from '../../src/core/fsrs/reviewLog';
import { ALL_NOTES } from '../../src/core/fsrs/constants';
import type { Card, NoteName, ReviewLogEvent, Skill } from '../../src/core/fsrs/types';

function makeCard(
  skill: Skill,
  note: NoteName,
  overrides: Partial<Card> = {}
): Card {
  return {
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'new',
    stability: null,
    difficulty: null,
    dueAt: 0,
    lastReviewAt: 0,
    firstSeenAt: 0,
    reps: 0,
    lapses: 0,
    lastGrade: null,
    stats: {
      trials: 0,
      firstCorrect: 0,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: 0,
      practiceTrials: 0
    },
    ...overrides
  };
}

function makeFullCardPool(): Map<string, Card> {
  const map = new Map<string, Card>();
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
      map.set(`${skill}:${note}`, makeCard(skill, note));
    }
  }
  return map;
}

function makePostCfProgress(now = 1_000): Map<string, LearningProgressRecord> {
  const cRec = markFsrsActivated(
    markMixReady(
      recordIndependentAttempt(
        recordIndependentAttempt(
          recordGuidedAttempt(
            recordModelCompleted(
              createInitialLearningProgress(
                FIRST_RUN_CF_ITEM_IDS.ANCHOR_C,
                now
              ),
              now,
              'model:region-C4'
            ),
            { correct: true, hintLevel: HINT_LEVEL.VISUAL_CUE, at: now }
          ),
          {
            correct: true,
            hinted: false,
            hintLevel: HINT_LEVEL.NONE,
            contextId: 'region-C3',
            at: now
          }
        ),
        {
          correct: true,
          hinted: false,
          hintLevel: HINT_LEVEL.NONE,
          contextId: 'region-C5',
          at: now
        }
      ),
      now
    ),
    now
  );

  const fRec = markFsrsActivated(
    markMixReady(
      recordIndependentAttempt(
        recordIndependentAttempt(
          recordGuidedAttempt(
            recordModelCompleted(
              createInitialLearningProgress(
                FIRST_RUN_CF_ITEM_IDS.ANCHOR_F,
                now
              ),
              now,
              'model:region-F4'
            ),
            { correct: true, hintLevel: HINT_LEVEL.VISUAL_CUE, at: now }
          ),
          {
            correct: true,
            hinted: false,
            hintLevel: HINT_LEVEL.NONE,
            contextId: 'region-F3',
            at: now
          }
        ),
        {
          correct: true,
          hinted: false,
          hintLevel: HINT_LEVEL.NONE,
          contextId: 'region-F5',
          at: now
        }
      ),
      now
    ),
    now
  );

  const cfIdentifyRec = markMixReady(
    createInitialLearningProgress(FIRST_RUN_CF_ITEM_IDS.IDENTIFY_CF, now),
    now
  );

  return new Map([
    [cRec.id, cRec],
    [fRec.id, fRec],
    [cfIdentifyRec.id, cfIdentifyRec]
  ]);
}

const TEST_SETTINGS = {
  desiredRetention: 0.9,
  maxIntervalDays: 120,
  relearningSeconds: 45,
  useLatencyGrading: false
};

function completeSingleNoteAcquisition(
  initialState: WhiteKeyCurriculumState,
  note: CurriculumAcquisitionNote,
  cards: Map<string, Card>,
  logs: ReviewLogEvent[],
  startNow = 10_000
): { state: WhiteKeyCurriculumState; now: number } {
  let state = initialState;
  let now = startNow;
  const cfg = state.config;

  const run = (action: Parameters<typeof advanceCurriculumProgress>[1]) => {
    const res = applyCurriculumActionWithCards({
      state,
      action: { ...action, at: now, sessionId: 'session-3c' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs,
      responseMs: 650,
      reviewedAt: now
    });
    now += 1_000;
    state = res.state;
    if (res.attemptResult?.logEvent) {
      logs.push(res.attemptResult.logEvent);
    }
    return res;
  };

  // 1. Model (H3)
  expect(describeCurriculumStep(state.step).subStage).toBe('model');
  expect(describeCurriculumStep(state.step).focusNote).toBe(note);
  run({ type: 'keyPress', note, keyId: `${note}4` });

  // 2. Guided (H2) - guidedSuccessTarget trials
  expect(describeCurriculumStep(state.step).subStage).toBe('guided');
  const guidedOctaves = ['4', '3', '5', '2'];
  for (let i = 0; i < cfg.guidedSuccessTarget; i++) {
    run({ type: 'keyPress', note, keyId: `${note}${guidedOctaves[i % 4]}` });
  }

  // 3. Qualify (H0) - qualifySuccessTarget distinct keyboard regions
  expect(describeCurriculumStep(state.step).subStage).toBe('qualify');
  const qualifyOctaves = ['3', '5', '2', '4'];
  for (let i = 0; i < cfg.qualifySuccessTarget; i++) {
    run({ type: 'keyPress', note, keyId: `${note}${qualifyOctaves[i % 4]}` });
  }

  // 4. Local / Family Mix (H0)
  expect(describeCurriculumStep(state.step).subStage).toBe('localMix');
  const mixTarget = getMixTargetForNote(note, cfg);
  for (let i = 0; i < mixTarget + 3; i++) {
    if (describeCurriculumStep(state.step).subStage !== 'localMix') break;
    const expected = state.targetNote ?? note;
    const oct = ['4', '3', '5', '2'][i % 4];
    run({ type: 'keyPress', note: expected, keyId: `${expected}${oct}` });
  }

  // 5. Delayed Check (H0 -> FSRS eligible)
  expect(describeCurriculumStep(state.step).subStage).toBe('delayedCheck');
  run({ type: 'keyPress', note, keyId: `${note}4` });

  return { state, now };
}

function completeIdentifyStage(
  initialState: WhiteKeyCurriculumState,
  cards: Map<string, Card>,
  logs: ReviewLogEvent[],
  startNow = 50_000
): { state: WhiteKeyCurriculumState; now: number } {
  let state = initialState;
  let now = startNow;
  const startStep = state.step;

  for (let guard = 0; guard < 20 && state.step === startStep; guard++) {
    const expected = state.targetNote ?? state.answerPool[0];
    const res = applyCurriculumActionWithCards({
      state,
      action: {
        type: 'semanticAnswer',
        note: expected,
        channel: 'answerButton',
        at: now,
        sessionId: 'session-3c'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs,
      responseMs: 600,
      reviewedAt: now
    });
    now += 1_000;
    state = res.state;
  }

  return { state, now };
}

describe('Milestone 3C — Curriculum-Gated Activation & Interleaving (Section 36)', () => {
  it('1. Enforces exact D → E → B → G → A note acquisition order through Phase 2 and Phase 3', () => {
    expect(CURRICULUM_ACQUISITION_ORDER).toEqual(['D', 'E', 'B', 'G', 'A']);
    expect(TWO_BLACK_FAMILY_NOTES).toEqual(['C', 'D', 'E']);
    expect(THREE_BLACK_FAMILY_NOTES).toEqual(['F', 'G', 'A', 'B']);
    expect(ALL_WHITE_CURRICULUM_NOTES).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);

    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);

    expect(
      shouldEnterWhiteKeyCurriculum({
        cards: Array.from(cards.values()),
        reviewLogs: logs,
        learningProgress: postCf
      })
    ).toBe(true);

    let state = createWhiteKeyCurriculumState({
      learningProgress: postCf,
      cards: Array.from(cards.values()),
      reviewLogs: logs,
      now: 2_000
    });
    let now = 3_000;

    // Starts at D model right after C/F onboarding
    expect(state.step).toBe('dModel');

    // D -> E -> cdeIdentify -> B -> fbIdentify -> G -> A -> fgabIdentify -> allWhiteMix -> allWhiteIdentify -> phase3Complete
    ({ state, now } = completeSingleNoteAcquisition(state, 'D', cards, logs, now));
    expect(state.step).toBe('eModel');

    ({ state, now } = completeSingleNoteAcquisition(state, 'E', cards, logs, now));
    expect(state.step).toBe('cdeIdentify');

    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('bModel');

    ({ state, now } = completeSingleNoteAcquisition(state, 'B', cards, logs, now));
    expect(state.step).toBe('fbIdentify');

    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('gModel');

    ({ state, now } = completeSingleNoteAcquisition(state, 'G', cards, logs, now));
    expect(state.step).toBe('aModel');

    ({ state, now } = completeSingleNoteAcquisition(state, 'A', cards, logs, now));
    expect(state.step).toBe('fgabIdentify');

    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('allWhiteMix');

    // Complete all-white spatial mix (7 trials across C–B)
    while (state.step === 'allWhiteMix') {
      const target = state.targetNote ?? 'C';
      const res = applyCurriculumActionWithCards({
        state,
        action: {
          type: 'keyPress',
          note: target,
          keyId: `${target}4`,
          at: now,
          sessionId: 'session-3c'
        },
        cards,
        settings: TEST_SETTINGS,
        reviewLog: logs,
        responseMs: 600,
        reviewedAt: now
      });
      now += 1_000;
      state = res.state;
    }

    expect(state.step).toBe('allWhiteIdentify');
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('phase3Complete');

    const finalRes = applyCurriculumActionWithCards({
      state,
      action: { type: 'completePhase3', at: now, sessionId: 'session-3c' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(
      isWhiteKeyCurriculumCompleted({
        learningProgress: Object.values(finalRes.state.progress),
        cards: Array.from(cards.values()),
        reviewLogs: logs
      })
    ).toBe(true);
  });

  it('2. Enforces H3 → H2 → H0 hint fading semantics on keyboard and mini-diagram', () => {
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);

    // D Model = H3: highlights 2-black groups across the 4 octaves AND labels D2..D5 + highlights targetWhiteIndex=1 in diagram
    expect(state.step).toBe('dModel');
    expect(state.hintLevel).toBe(HINT_LEVEL.MODEL_VISIBLE);
    expect(state.structuralGuideKeyIds).toEqual([
      'C#2',
      'D#2',
      'C#3',
      'D#3',
      'C#4',
      'D#4',
      'C#5',
      'D#5'
    ]);
    expect(state.modelLabelKeyIds).toEqual(['D2', 'D3', 'D4', 'D5']);
    const dModelDiagram = getCurriculumDiagramSpec(state);
    expect(dModelDiagram.kind).toBe('landmark');
    expect(dModelDiagram.blackGroupSize).toBe(2);
    expect(dModelDiagram.highlightTargetWhite).toBe(true);
    expect(dModelDiagram.targetWhiteIndex).toBe(1);
    expect(dModelDiagram.targetWhiteLabel).toBe('D · Ре');

    // Advance to D Guided = H2: highlights 2-black group ONLY; no D label on piano or mini-diagram
    state = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D4',
      at: 3_000
    }).state;
    expect(state.step).toBe('dGuided');
    expect(state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(state.structuralGuideKeyIds.length).toBe(2);
    expect(state.modelLabelKeyIds).toEqual([]);
    const dGuidedDiagram = getCurriculumDiagramSpec(state);
    expect(dGuidedDiagram.kind).toBe('landmark');
    expect(dGuidedDiagram.blackGroupSize).toBe(2);
    expect(dGuidedDiagram.highlightTargetWhite).toBe(false);
    expect(dGuidedDiagram.targetWhiteIndex).toBeNull();
    expect(dGuidedDiagram.targetWhiteLabel).toBeNull();

    // Advance to D Qualify = H0: no structural guides, no labels, no diagram
    state = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D4',
      at: 4_000
    }).state;
    state = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D3',
      at: 5_000
    }).state;
    expect(state.step).toBe('dQualify');
    expect(state.hintLevel).toBe(HINT_LEVEL.NONE);
    expect(state.structuralGuideKeyIds).toEqual([]);
    expect(state.modelLabelKeyIds).toEqual([]);
    expect(getCurriculumDiagramSpec(state).kind).toBe('none');
  });

  it('3. D local mix includes C/D (+ F landmark) and E family mix includes C/D/E', () => {
    expect(getLocalMixPool('D')).toEqual(['C', 'D', 'F']);
    expect(getLocalMixPool('E')).toEqual(['C', 'D', 'E']);
    expect(getFamilyMixPool('twoBlack')).toEqual(['C', 'D', 'E']);

    const dQueue = buildInitialLocalMixQueue('D');
    expect(dQueue).toContain('C');
    expect(dQueue).toContain('D');
    expect(isConstrainedWhiteMixSequence(dQueue)).toBe(true);

    const eQueue = buildInitialLocalMixQueue('E');
    expect(eQueue).toContain('C');
    expect(eQueue).toContain('D');
    expect(eQueue).toContain('E');
    expect(isConstrainedWhiteMixSequence(eQueue)).toBe(true);
  });

  it('4. B relates to the right boundary of the 3-black group, and G/A to interior positions of the 3-black group', () => {
    // B: right boundary of 3 black keys
    const bSpec = WHITE_KEY_GEOMETRY.B;
    expect(bSpec.blackGroupSize).toBe(3);
    expect(bSpec.whiteIndexInGroup).toBe(3);
    expect(bSpec.family).toBe('threeBlack');
    expect(bSpec.modelBody).toContain('3 чёрных');
    expect(bSpec.modelBody).toContain('справа');
    expect(getLocalMixPool('B')).toEqual(['F', 'B', 'C', 'E']);

    // G: 1st interior white key inside 3 black keys (between F# and G#)
    const gSpec = WHITE_KEY_GEOMETRY.G;
    expect(gSpec.blackGroupSize).toBe(3);
    expect(gSpec.whiteIndexInGroup).toBe(1);
    expect(gSpec.family).toBe('threeBlack');
    expect(gSpec.modelBody).toContain('1-й и 2-й');
    expect(getLocalMixPool('G')).toEqual(['F', 'G', 'B']);

    // A: 2nd interior white key inside 3 black keys (between G# and A#)
    const aSpec = WHITE_KEY_GEOMETRY.A;
    expect(aSpec.blackGroupSize).toBe(3);
    expect(aSpec.whiteIndexInGroup).toBe(2);
    expect(aSpec.family).toBe('threeBlack');
    expect(aSpec.modelBody).toContain('2-й и 3-й');
    expect(getLocalMixPool('A')).toEqual(['F', 'G', 'A', 'B']);
    expect(getFamilyMixPool('threeBlack')).toEqual(['F', 'G', 'A', 'B']);
  });

  it('5. Requires multiple keyboard regions (C2–B5) in qualify and excludes edge C6 from valid contexts', () => {
    expect(isValidWhiteKeyRegionContext('region-D2')).toBe(true);
    expect(isValidWhiteKeyRegionContext('region-D3')).toBe(true);
    expect(isValidWhiteKeyRegionContext('region-D4')).toBe(true);
    expect(isValidWhiteKeyRegionContext('region-D5')).toBe(true);
    expect(isValidWhiteKeyRegionContext('region-C6')).toBe(false);

    // None of the landmark key lists include C6
    for (const note of ALL_WHITE_CURRICULUM_NOTES) {
      expect(WHITE_KEY_GEOMETRY[note].landmarkKeyIds).not.toContain('C6');
    }

    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D4', at: 3_000 }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D4', at: 4_000 }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D3', at: 5_000 }).state;
    expect(state.step).toBe('dQualify');

    // First region D3 succeeds
    const r1 = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D3',
      at: 6_000
    });
    expect(r1.outcome).toBe('progressed');
    expect(r1.state.step).toBe('dQualify');

    // Pressing D3 again in the SAME octave does not advance to dLocalMix
    const dup = advanceCurriculumProgress(r1.state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D3',
      at: 7_000
    });
    expect(dup.outcome).toBe('duplicate_context');
    expect(dup.state.step).toBe('dQualify');

    // Pressing D5 (a second distinct region) advances to dLocalMix
    const r2 = advanceCurriculumProgress(dup.state, {
      type: 'keyPress',
      note: 'D',
      keyId: 'D5',
      at: 8_000
    });
    expect(r2.outcome).toBe('advanced');
    expect(r2.state.step).toBe('dLocalMix');
  });

  it('6. Scheduler activation gate excludes unseen curriculum cards and includes activated cards', () => {
    const cards = makeFullCardPool();
    const postCf = makePostCfProgress(1_000);

    // Right after C/F onboarding: only C and F are active; D, E, B, G, A are excluded!
    const activeAfterCf = filterCurriculumActiveCards(Array.from(cards.values()), {
      learningProgress: postCf,
      cards: Array.from(cards.values()),
      reviewLogs: []
    });
    const activeIdsAfterCf = activeAfterCf.map(c => c.id);
    expect(activeIdsAfterCf).toContain('find:C');
    expect(activeIdsAfterCf).toContain('find:F');
    expect(activeIdsAfterCf).toContain('identify:C');
    expect(activeIdsAfterCf).toContain('identify:F');
    expect(activeIdsAfterCf).not.toContain('find:D');
    expect(activeIdsAfterCf).not.toContain('find:E');
    expect(activeIdsAfterCf).not.toContain('find:B');
    expect(activeIdsAfterCf).not.toContain('find:G');
    expect(activeIdsAfterCf).not.toContain('find:A');
    expect(activeIdsAfterCf).not.toContain('identify:D');
    expect(activeIdsAfterCf).not.toContain('find:C#');

    // Complete D acquisition -> find:D becomes active, while find:E/B/G/A and identify:D remain inactive
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    const logs: ReviewLogEvent[] = [];
    ({ state } = completeSingleNoteAcquisition(state, 'D', cards, logs, 3_000));

    expect(
      isCurriculumCardActive(cards.get('find:D')!, {
        learningProgress: Object.values(state.progress),
        cards: Array.from(cards.values()),
        reviewLogs: logs
      })
    ).toBe(true);
    expect(
      isCurriculumCardActive(cards.get('identify:D')!, {
        learningProgress: Object.values(state.progress),
        cards: Array.from(cards.values()),
        reviewLogs: logs
      })
    ).toBe(false);
    expect(
      isCurriculumCardActive(cards.get('find:G')!, {
        learningProgress: Object.values(state.progress),
        cards: Array.from(cards.values()),
        reviewLogs: logs
      })
    ).toBe(false);
  });

  it('7. Qualify and mixedRetrieval trials NEVER mutate FSRS; only unhinted H0 delayedCheck mutates FSRS', () => {
    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    let now = 3_000;

    // Run through dModel -> dGuided -> dQualify -> dLocalMix up to (but not including) dDelayedCheck
    const runNonFsrs = (note: NoteName, keyId: string) => {
      const res = applyCurriculumActionWithCards({
        state,
        action: { type: 'keyPress', note, keyId, at: now, sessionId: 's1' },
        cards,
        settings: TEST_SETTINGS,
        reviewLog: logs,
        responseMs: 600,
        reviewedAt: now
      });
      now += 1_000;
      state = res.state;
      return res;
    };

    const mRes = runNonFsrs('D', 'D4'); // model
    expect(mRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(mRes.mutatedCard).toBeNull();

    const g1 = runNonFsrs('D', 'D4'); // guided 1
    const g2 = runNonFsrs('D', 'D3'); // guided 2
    expect(g1.mutatedCard).toBeNull();
    expect(g2.mutatedCard).toBeNull();

    const q1 = runNonFsrs('D', 'D3'); // qualify 1
    const q2 = runNonFsrs('D', 'D5'); // qualify 2
    expect(q1.trialContext?.mode).toBe('qualify');
    expect(deriveFsrsEligibility(q1.trialContext!).eligible).toBe(false);
    expect(q1.mutatedCard).toBeNull();
    expect(q2.mutatedCard).toBeNull();
    expect(cards.get('find:D')!.reps).toBe(0);
    expect(cards.get('find:D')!.stability).toBeNull();

    // Mix trials (dLocalMix)
    expect(state.step).toBe('dLocalMix');
    while (state.step === 'dLocalMix') {
      const target = state.targetNote ?? 'D';
      const mixRes = runNonFsrs(target, `${target}4`);
      expect(mixRes.trialContext?.mode).toBe('mixedRetrieval');
      expect(deriveFsrsEligibility(mixRes.trialContext!).eligible).toBe(false);
      expect(mixRes.mutatedCard).toBeNull();
    }

    // Still 0 FSRS reps before dDelayedCheck!
    expect(cards.get('find:D')!.reps).toBe(0);
    expect(logs.length).toBe(0);

    // Now at dDelayedCheck (H0 first attempt) -> mutates FSRS!
    expect(state.step).toBe('dDelayedCheck');
    const dcRes = runNonFsrs('D', 'D4');
    expect(dcRes.trialContext?.mode).toBe('delayedCheck');
    expect(dcRes.trialContext?.hintLevel).toBe(HINT_LEVEL.NONE);
    expect(deriveFsrsEligibility(dcRes.trialContext!)).toEqual({
      eligible: true,
      reason: 'eligible_delayed_check'
    });
    expect(dcRes.mutatedCard?.id).toBe('find:D');
    expect(cards.get('find:D')!.reps).toBe(1);
    expect(cards.get('find:D')!.stability).toBeGreaterThan(0);
    expect(state.step).toBe('eModel');
  });

  it('8. Hinted delayedCheck cannot mutate FSRS and requires intervening recall + H0 retry', () => {
    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    let now = 3_000;

    // Advance to dDelayedCheck
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'D', keyId: 'D5', at: now++ }).state;
    while (state.step === 'dLocalMix') {
      const t = state.targetNote ?? 'D';
      state = advanceCurriculumProgress(state, { type: 'keyPress', note: t, keyId: `${t}4`, at: now++ }).state;
    }
    expect(state.step).toBe('dDelayedCheck');

    // User clicks "Don't know" on dDelayedCheck -> H2 remediation activated, NO FSRS mutation
    const dkRes = applyCurriculumActionWithCards({
      state,
      action: { type: 'dontKnow', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(dkRes.mutatedCard).toBeNull();
    expect(dkRes.trialContext?.gradeableByFsrs).toBe(false);
    expect(dkRes.state.awaitingRemediationPress).toBe(true);
    expect(cards.get('find:D')!.reps).toBe(0);

    // User presses D4 with H2 remediation active -> no FSRS mutation, enters intervening recall
    const remPress = applyCurriculumActionWithCards({
      state: dkRes.state,
      action: { type: 'keyPress', note: 'D', keyId: 'D4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(remPress.mutatedCard).toBeNull();
    expect(remPress.state.step).toBe('dDelayedCheck');
    expect(remPress.state.isInterveningRecall).toBe(true);
    expect(cards.get('find:D')!.reps).toBe(0);

    // Intervening recall on contrast landmark C -> returns to unhinted H0 dDelayedCheck
    const contrastNote = remPress.state.targetNote ?? 'C';
    const intPress = applyCurriculumActionWithCards({
      state: remPress.state,
      action: {
        type: 'keyPress',
        note: contrastNote,
        keyId: `${contrastNote}4`,
        at: now++,
        sessionId: 's1'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(intPress.state.step).toBe('dDelayedCheck');
    expect(intPress.state.isInterveningRecall).toBe(false);
    expect(intPress.state.hintLevel).toBe(HINT_LEVEL.NONE);

    // Now unhinted H0 retry succeeds -> mutates FSRS and advances to eModel!
    const retryRes = applyCurriculumActionWithCards({
      state: intPress.state,
      action: { type: 'keyPress', note: 'D', keyId: 'D4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(retryRes.mutatedCard?.id).toBe('find:D');
    expect(cards.get('find:D')!.reps).toBe(1);
    expect(retryRes.state.step).toBe('eModel');
  });

  it('9. Failed H0 delayedCheck records FSRS Grade=Again (1) and blocks unlocking next concept until H0 retry succeeds', () => {
    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    let now = 3_000;

    // Advance D and E and cdeIdentify so we reach B (`bModel`), then advance B to `bDelayedCheck`
    ({ state, now } = completeSingleNoteAcquisition(state, 'D', cards, logs, now));
    ({ state, now } = completeSingleNoteAcquisition(state, 'E', cards, logs, now));
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('bModel');

    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'B', keyId: 'B4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'B', keyId: 'B4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'B', keyId: 'B3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'B', keyId: 'B3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'B', keyId: 'B5', at: now++ }).state;
    while (state.step === 'bLocalMix') {
      const t = state.targetNote ?? 'B';
      state = advanceCurriculumProgress(state, { type: 'keyPress', note: t, keyId: `${t}4`, at: now++ }).state;
    }
    expect(state.step).toBe('bDelayedCheck');

    // User presses wrong key F4 on H0 bDelayedCheck -> FSRS grades Again (1), B stays focus!
    const failRes = applyCurriculumActionWithCards({
      state,
      action: { type: 'keyPress', note: 'F', keyId: 'F4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(failRes.outcome).toBe('wrong_note');
    expect(failRes.mutatedCard?.id).toBe('find:B');
    expect(cards.get('find:B')!.lastGrade).toBe(1); // Again
    expect(cards.get('find:B')!.lapses).toBe(1);
    expect(failRes.state.step).toBe('bDelayedCheck');
    expect(failRes.state.awaitingCorrective).toBe(true);
    // B is MIX_READY, NOT RETENTION_MASTERED
    expect(isNoteMixReady('B', failRes.state.progress)).toBe(true);
    expect(isNoteRetentionMastered('B', failRes.state.progress)).toBe(false);

    // Corrective press B4 -> does NOT advance to fbIdentify/gModel! Enters short remediation (intervening recall)
    const corrRes = applyCurriculumActionWithCards({
      state: failRes.state,
      action: { type: 'keyPress', note: 'B', keyId: 'B4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(corrRes.mutatedCard).toBeNull();
    expect(corrRes.state.step).toBe('bDelayedCheck');
    expect(corrRes.state.isInterveningRecall).toBe(true);

    // Intervening recall on F4 -> returns to unhinted H0 bDelayedCheck
    const intRes = applyCurriculumActionWithCards({
      state: corrRes.state,
      action: {
        type: 'keyPress',
        note: corrRes.state.targetNote ?? 'F',
        keyId: 'F4',
        at: now++,
        sessionId: 's1'
      },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(intRes.state.step).toBe('bDelayedCheck');
    expect(intRes.state.isInterveningRecall).toBe(false);

    // Even if user reloads browser right here, B remains on bDelayedCheck!
    const reloaded = createWhiteKeyCurriculumState(Object.values(intRes.state.progress), now++);
    expect(reloaded.step).toBe('bDelayedCheck');

    // Now user succeeds on unhinted H0 bDelayedCheck -> B becomes retention-mastered and advances to fbIdentify!
    const passRes = applyCurriculumActionWithCards({
      state: intRes.state,
      action: { type: 'keyPress', note: 'B', keyId: 'B3', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    });
    expect(passRes.outcome).toBe('advanced');
    expect(passRes.state.step).toBe('fbIdentify');
    expect(isNoteRetentionMastered('B', passRes.state.progress)).toBe(true);
  });

  it('10. Reload / resume deterministically restores E guided trial 2, G local mix, and A guided', () => {
    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    let now = 3_000;

    // 1. Advance D to completion, start E model + 1 guided trial (= E guided trial 2)
    ({ state, now } = completeSingleNoteAcquisition(state, 'D', cards, logs, now));
    expect(state.step).toBe('eModel');
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'E', keyId: 'E4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'E', keyId: 'E4', at: now++ }).state;
    expect(state.step).toBe('eGuided');
    expect(state.progress[WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E].guidedSuccesses).toBe(1);

    // Simulate reload from persisted LearningProgressRecord[]
    const resumedEGuided = createWhiteKeyCurriculumState(Object.values(state.progress), now++);
    expect(resumedEGuided.step).toBe('eGuided');
    expect(resumedEGuided.progress[WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E].guidedSuccesses).toBe(1);

    // Complete 2nd guided trial on resumed state -> advances to eQualify!
    const afterSecondGuided = advanceCurriculumProgress(resumedEGuided, {
      type: 'keyPress',
      note: 'E',
      keyId: 'E3',
      at: now++
    }).state;
    expect(afterSecondGuided.step).toBe('eQualify');

    // 2. Advance to G local mix and reload mid-mix
    state = afterSecondGuided;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'E', keyId: 'E3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'E', keyId: 'E5', at: now++ }).state;
    while (state.step === 'eLocalMix') {
      const t = state.targetNote ?? 'E';
      state = advanceCurriculumProgress(state, { type: 'keyPress', note: t, keyId: `${t}4`, at: now++ }).state;
    }
    state = applyCurriculumActionWithCards({
      state,
      action: { type: 'keyPress', note: 'E', keyId: 'E4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    }).state;
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    ({ state, now } = completeSingleNoteAcquisition(state, 'B', cards, logs, now));
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('gModel');

    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G3', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G5', at: now++ }).state;
    expect(state.step).toBe('gLocalMix');

    // Complete 1 trial of gLocalMix and reload
    const firstMixTarget = state.targetNote ?? 'G';
    state = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: firstMixTarget,
      keyId: `${firstMixTarget}4`,
      at: now++
    }).state;
    expect(state.step).toBe('gLocalMix');

    const resumedGMix = createWhiteKeyCurriculumState(Object.values(state.progress), now++);
    expect(resumedGMix.step).toBe('gLocalMix');
    expect(
      resumedGMix.progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_G].independentUnhintedSuccesses
    ).toBe(1);

    // 3. Finish G and reach A guided, then reload
    state = resumedGMix;
    while (state.step === 'gLocalMix') {
      const t = state.targetNote ?? 'G';
      state = advanceCurriculumProgress(state, { type: 'keyPress', note: t, keyId: `${t}4`, at: now++ }).state;
    }
    state = applyCurriculumActionWithCards({
      state,
      action: { type: 'keyPress', note: 'G', keyId: 'G4', at: now++, sessionId: 's1' },
      cards,
      settings: TEST_SETTINGS,
      reviewLog: logs
    }).state;
    expect(state.step).toBe('aModel');
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'A', keyId: 'A4', at: now++ }).state;
    expect(state.step).toBe('aGuided');

    const resumedAGuided = createWhiteKeyCurriculumState(Object.values(state.progress), now++);
    expect(resumedAGuided.step).toBe('aGuided');
  });

  it('11. Existing user with meaningful C/D/E history skips D and E and enters at B (bModel)', () => {
    const cards = makeFullCardPool();
    for (const note of ['C', 'F', 'D', 'E'] as const) {
      cards.set(
        `find:${note}`,
        makeCard('find', note, {
          reps: 3,
          stability: 4.5,
          difficulty: 5,
          lastGrade: 3,
          stats: {
            trials: 3,
            firstCorrect: 3,
            firstWrong: 0,
            hints: 0,
            recentScheduledSuccesses: 3,
            scheduledSuccesses: 3,
            practiceTrials: 0
          }
        })
      );
    }

    const entry = evaluateCurriculumEntry({
      cards: Array.from(cards.values()),
      reviewLogs: [],
      learningProgress: []
    });

    expect(entry.shouldEnter).toBe(true);
    expect(entry.reason).toBe('resume_from_legacy_partial');
    expect(entry.initialStep).toBe('bModel');
    expect(entry.masteredWhiteNotes).toEqual(['C', 'D', 'E', 'F']);

    const state = createWhiteKeyCurriculumState({
      cards: Array.from(cards.values()),
      reviewLogs: [],
      learningProgress: [],
      now: 5_000
    });
    expect(state.step).toBe('bModel');
  });

  it('12. Identify inverse skill only unlocks after spatial acquisition of each family, and Cold Test remains schedule-neutral', () => {
    expect(getIdentifyPoolForStage('cdeIdentify')).toEqual(['C', 'D', 'E']);
    expect(getIdentifyPoolForStage('fbIdentify')).toEqual(['F', 'B']);
    expect(getIdentifyPoolForStage('fgabIdentify')).toEqual(['F', 'G', 'A', 'B']);
    expect(getIdentifyPoolForStage('allWhiteIdentify')).toEqual([
      'C',
      'D',
      'E',
      'F',
      'G',
      'A',
      'B'
    ]);

    // Input routing matrix: find steps allow pianoKey/midi, reject pcNote/answerButton;
    // identify steps allow pcNote/answerButton, reject pianoKey/midi.
    expect(canUseInputForCurriculumStep('dQualify', 'pianoKey')).toBe(true);
    expect(canUseInputForCurriculumStep('dQualify', 'midi')).toBe(true);
    expect(canUseInputForCurriculumStep('dQualify', 'pcNote')).toBe(false);
    expect(canUseInputForCurriculumStep('dQualify', 'answerButton')).toBe(false);

    expect(canUseInputForCurriculumStep('cdeIdentify', 'pcNote')).toBe(true);
    expect(canUseInputForCurriculumStep('cdeIdentify', 'answerButton')).toBe(true);
    expect(canUseInputForCurriculumStep('cdeIdentify', 'pianoKey')).toBe(false);
    expect(canUseInputForCurriculumStep('cdeIdentify', 'midi')).toBe(false);

    // Cold Test remains 100% schedule-neutral
    const coldCard = makeCard('find', 'D');
    const roundState: QuestionRoundState = {
      firstResponseRecorded: false,
      attempts: 0,
      hintUsed: false,
      isCompleted: false,
      isLocked: false
    };
    const coldRes = submitQuestionAttempt({
      state: roundState,
      card: coldCard,
      kind: 'cold',
      isCorrect: true,
      answer: 'D',
      answerKeyId: 'D4',
      responseMs: 500,
      settings: TEST_SETTINGS,
      reviewLog: [],
      sessionId: 'cold-1'
    });
    expect(coldRes.cardMutated).toBe(false);
    expect(coldCard.reps).toBe(0);
    expect(coldCard.stability).toBeNull();

    // Phase 4 Black Keys remains locked in getCurriculumPhases when learningProgress is provided
    const cards = makeFullCardPool();
    const postCf = makePostCfProgress(1_000);
    const phases = getCurriculumPhases(
      'white',
      (skill, note) => cards.get(`${skill}:${note}`)!,
      [],
      postCf
    );
    const blackPhase = phases.find(p => p.id === 'black');
    expect(blackPhase?.open).toBe(false);
    expect(blackPhase?.done).toBe(false);
  });

  it('13. Training queue orchestrator enforces 5-level priority and never leaks unseen notes', () => {
    const cards = makeFullCardPool();
    const postCf = makePostCfProgress(1_000);
    const now = 100_000;

    // Make find:C overdue
    cards.set(
      'find:C',
      makeCard('find', 'C', {
        memoryState: 'review',
        reps: 2,
        stability: 2,
        difficulty: 5,
        dueAt: now - 10_000,
        lastReviewAt: now - 90_000_000,
        lastGrade: 3
      })
    );

    const cState = createWhiteKeyCurriculumState(postCf, now);
    expect(cState.step).toBe('dModel');

    // Priority 1: due scheduled review takes precedence when not mid-remediation
    const p1 = resolveTrainingOrchestration({
      cards: Array.from(cards.values()),
      learningProgress: postCf,
      reviewLogs: [],
      curriculumState: cState,
      now
    });
    expect(p1.priority).toBe('due_scheduled_review');
    expect(p1.dueCard?.id).toBe('find:C');

    // Once find:C is no longer due, Priority 4 (`next_curriculum_introduction`) runs dModel
    cards.set(
      'find:C',
      makeCard('find', 'C', {
        memoryState: 'review',
        reps: 3,
        stability: 5,
        difficulty: 5,
        dueAt: now + 86_400_000 * 5,
        lastReviewAt: now,
        lastGrade: 3
      })
    );
    const p4 = resolveTrainingOrchestration({
      cards: Array.from(cards.values()),
      learningProgress: postCf,
      reviewLogs: [],
      curriculumState: cState,
      now
    });
    expect(p4.priority).toBe('next_curriculum_introduction');
    expect(p4.curriculumStep).toBe('dModel');
  });

  it('14. G qualify wrong -> corrective press -> H0 retry across 2 regions -> no premature A unlock, and final C-B mix covers all 7 white keys', () => {
    const cards = makeFullCardPool();
    const logs: ReviewLogEvent[] = [];
    const postCf = makePostCfProgress(1_000);
    let state = createWhiteKeyCurriculumState(postCf, 2_000);
    let now = 3_000;

    ({ state, now } = completeSingleNoteAcquisition(state, 'D', cards, logs, now));
    ({ state, now } = completeSingleNoteAcquisition(state, 'E', cards, logs, now));
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    ({ state, now } = completeSingleNoteAcquisition(state, 'B', cards, logs, now));
    ({ state, now } = completeIdentifyStage(state, cards, logs, now));
    expect(state.step).toBe('gModel');

    // G model + 2 guided -> gQualify
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G4', at: now++ }).state;
    state = advanceCurriculumProgress(state, { type: 'keyPress', note: 'G', keyId: 'G3', at: now++ }).state;
    expect(state.step).toBe('gQualify');

    // Press wrong note A4 during gQualify -> triggers corrective H2, does NOT unlock A or gLocalMix
    const wrongG = advanceCurriculumProgress(state, {
      type: 'keyPress',
      note: 'A',
      keyId: 'A4',
      at: now++
    });
    expect(wrongG.outcome).toBe('wrong_note');
    expect(wrongG.state.step).toBe('gQualify');
    expect(wrongG.state.awaitingCorrective).toBe(true);
    expect(wrongG.state.hintLevel).toBe(HINT_LEVEL.VISUAL_CUE);
    expect(wrongG.state.feedbackText).toContain('A');

    // Corrective press G4 -> clears awaitingCorrective, stays in gQualify with 0 unhinted regions
    const corrG = advanceCurriculumProgress(wrongG.state, {
      type: 'keyPress',
      note: 'G',
      keyId: 'G4',
      at: now++
    });
    expect(corrG.outcome).toBe('corrective_completed');
    expect(corrG.state.step).toBe('gQualify');
    expect(corrG.state.awaitingCorrective).toBe(false);
    expect(isNoteMixReady('G', corrG.state.progress)).toBe(false);
    expect(isCurriculumCardActive(cards.get('find:A')!, { learningProgress: corrG.state.progress })).toBe(false);

    // Now complete 2 distinct unhinted regions (G3, G5) -> advances to gLocalMix!
    const gReg1 = advanceCurriculumProgress(corrG.state, {
      type: 'keyPress',
      note: 'G',
      keyId: 'G3',
      at: now++
    });
    expect(gReg1.state.step).toBe('gQualify');
    const gReg2 = advanceCurriculumProgress(gReg1.state, {
      type: 'keyPress',
      note: 'G',
      keyId: 'G5',
      at: now++
    });
    expect(gReg2.state.step).toBe('gLocalMix');
    expect(isNoteMixReady('G', gReg2.state.progress)).toBe(true);
    expect(isNoteRetentionMastered('G', gReg2.state.progress)).toBe(false);

    // Final C-B allWhiteMix queue includes all 7 white keys and has no 3-in-a-row runs
    const allWhiteQ = buildInitialAllWhiteMixQueue();
    expect(allWhiteQ.length).toBe(7);
    for (const n of ALL_WHITE_CURRICULUM_NOTES) {
      expect(allWhiteQ).toContain(n);
    }
    expect(isConstrainedWhiteMixSequence(allWhiteQ)).toBe(true);
  });
});
