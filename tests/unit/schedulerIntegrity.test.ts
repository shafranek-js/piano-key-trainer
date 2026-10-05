import { beforeEach, describe, expect, it } from 'vitest';
import { clearSchedulerTraces, recordNextRoundRequest, recordSchedulerDecision, recordSchedulerReviewTransition, markSchedulerReviewPersisted, getSchedulerDiagnostics } from '../../src/core/diagnostics/schedulerTracker';

function activate(sessionId: string, timestamp: number, questionInstanceId: string) {
  const callId = recordNextRoundRequest({
    sessionId,
    activity: 'standard',
    previousActivationId: null,
    previousQuestionInstanceId: null,
    previousCardId: null,
    timestamp: timestamp - 1
  });
  const decision = recordSchedulerDecision({
    selected: 'soundToKey:G',
    skill: 'soundToKey',
    reason: 'scheduled_due',
    timestamp,
    sessionId,
    questionInstanceId,
    nextRoundCallId: callId,
    cardStateBefore: 'review',
    dueAtBefore: timestamp - 100,
    isDueBefore: true,
    eligibleCandidateCount: 12,
    dueCandidateCount: 1,
    recentCardIds: []
  });
  return decision;
}

describe('Daily Practice scheduler integrity trace', () => {
  beforeEach(() => clearSchedulerTraces());

  it('records enough linked context to distinguish two valid unanswered restarts', () => {
    activate('session-A', 1000, 'session-A:question-1');
    activate('session-B', 2000, 'session-B:question-1');

    const diagnostics = getSchedulerDiagnostics();
    expect(diagnostics.schemaVersion).toBe(2);
    expect(diagnostics.recentTraces).toHaveLength(2);
    expect(diagnostics.recentTraces[0]).toMatchObject({
      sessionId: 'session-A',
      questionInstanceId: 'session-A:question-1',
      cardStateBefore: 'review',
      isDueBefore: true,
      eligibleCandidateCount: 12,
      dueCandidateCount: 1,
      decisionSequence: 1
    });
    expect(diagnostics.warnings).toEqual([]);
  });

  it('warns when the sole scheduled card is activated again in one session without a review', () => {
    activate('session-same', 1000, 'session-same:question-1');
    activate('session-same', 1030, 'session-same:question-2');
    activate('session-same', 1060, 'session-same:question-3');

    const warnings = getSchedulerDiagnostics().warnings;
    expect(warnings.filter(item => item.code === 'scheduledCardReselectedWithoutReview')).toHaveLength(2);
    expect(warnings.filter(item => item.code === 'duplicateTaskActivation')).toHaveLength(2);
    expect(warnings[0].activationIds).toEqual(['activation-1', 'activation-2']);
    expect(warnings[0].questionInstanceIds).toEqual([
      'session-same:question-1',
      'session-same:question-2'
    ]);
  });

  it('links one wrong first answer to persistence and the next balanced decision', () => {
    const first = activate('session-review', 1000, 'session-review:question-1');
    const transitionId = recordSchedulerReviewTransition({
      timestamp: 1500,
      cardId: 'soundToKey:G',
      sessionId: 'session-review',
      questionInstanceId: first.questionInstanceId,
      activationId: first.activationId,
      decisionSequence: first.decisionSequence,
      grade: 1,
      correct: false,
      firstAttempt: true,
      oldDueAt: 900,
      newDueAt: 301500,
      oldState: 'review',
      newState: 'relearning',
      cardMutated: true
    });
    markSchedulerReviewPersisted(transitionId, true);

    const callId = recordNextRoundRequest({
      sessionId: 'session-review',
      activity: 'standard',
      previousActivationId: first.activationId,
      previousQuestionInstanceId: first.questionInstanceId,
      previousCardId: first.selected,
      timestamp: 2000
    });
    const next = recordSchedulerDecision({
      selected: 'find:C',
      skill: 'find',
      reason: 'balanced_rotation',
      timestamp: 2010,
      sessionId: 'session-review',
      questionInstanceId: 'session-review:question-2',
      nextRoundCallId: callId,
      eligibleCandidateCount: 11,
      dueCandidateCount: 0,
      recentCardIds: ['soundToKey:G']
    });

    const diagnostics = getSchedulerDiagnostics();
    expect(diagnostics.reviewTransitions).toHaveLength(1);
    expect(diagnostics.reviewTransitions[0]).toMatchObject({
      transitionId,
      activationId: first.activationId,
      decisionSequence: first.decisionSequence,
      grade: 1,
      correct: false,
      firstAttempt: true,
      cardMutated: true,
      persisted: true,
      persistenceStatus: 'saved'
    });
    expect(next.previousReviewTransitionId).toBe(transitionId);
    expect(next.selected).not.toBe(first.selected);
    expect(diagnostics.warnings).toEqual([]);
  });

  it('allows a legitimate later due appearance after the intervening review was persisted', () => {
    const first = activate('session-later-due', 1000, 'session-later-due:question-1');
    const transitionId = recordSchedulerReviewTransition({
      timestamp: 1500,
      cardId: 'soundToKey:G',
      sessionId: 'session-later-due',
      questionInstanceId: first.questionInstanceId,
      activationId: first.activationId,
      decisionSequence: first.decisionSequence,
      grade: 3,
      correct: true,
      firstAttempt: true,
      oldDueAt: 900,
      newDueAt: 2_000,
      oldState: 'review',
      newState: 'review',
      cardMutated: true
    });
    markSchedulerReviewPersisted(transitionId, true);

    const later = recordSchedulerDecision({
      selected: 'soundToKey:G',
      skill: 'soundToKey',
      reason: 'scheduled_due',
      timestamp: 3_000,
      sessionId: 'session-later-due',
      questionInstanceId: 'session-later-due:question-2',
      dueAtBefore: 2_500,
      isDueBefore: true
    });

    expect(later.previousReviewTransitionId).toBe(transitionId);
    expect(getSchedulerDiagnostics().warnings).toEqual([]);
  });

  it('retains ten unanswered restarts as separate sessions without false duplicate warnings', () => {
    for (let index = 0; index < 10; index++) {
      activate(`restart-${index}`, 10_000 + index * 1000, `restart-${index}:question-1`);
    }
    const diagnostics = getSchedulerDiagnostics();
    expect(diagnostics.recentTraces).toHaveLength(10);
    expect(diagnostics.nextRoundEvents.every(event => event.disposition === 'activated')).toBe(true);
    expect(diagnostics.warnings).toEqual([]);
  });
});
