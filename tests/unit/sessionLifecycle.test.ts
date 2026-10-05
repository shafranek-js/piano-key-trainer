import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/fsrs/constants';
import { submitQuestionAttempt } from '../../src/core/fsrs/reviewLog';
import type { Card, ReviewLogEvent } from '../../src/core/fsrs/types';
import {
  activatePracticeQuestion,
  activatePracticeSession,
  claimFirstAnswerCommit,
  endPracticeSession
} from '../../src/core/input/activePracticeSession';
import { createTrialContext } from '../../src/core/learning/trialPolicy';
import type { TrialInputMethod } from '../../src/core/learning/types';

function makeScheduledCard(): Card {
  return {
    id: 'find:C',
    skill: 'find',
    note: 'C',
    memoryState: 'review',
    stability: 5,
    difficulty: 4,
    dueAt: 1_800_000_000_000,
    lastReviewAt: 1_799_000_000_000,
    firstSeenAt: 1_790_000_000_000,
    reps: 4,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 4,
      firstCorrect: 4,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 4,
      scheduledSuccesses: 4,
      practiceTrials: 0
    }
  };
}

describe('practice session lifecycle input gate', () => {
  it('keeps 20 finished sessions inert and accepts only one final cross-input FSRS commit', () => {
    const card = makeScheduledCard();
    const logs: ReviewLogEvent[] = [];
    const finishedQuestions: Array<{ sessionId: string; questionId: string }> = [];
    const startReps = card.reps;
    let acceptedAnswers = 0;

    for (let index = 1; index <= 20; index++) {
      const sessionId = `stress-session-${index}`;
      activatePracticeSession(sessionId);
      const questionId = activatePracticeQuestion(sessionId)!;
      expect(claimFirstAnswerCommit(sessionId, questionId)).toBe(true);
      acceptedAnswers++;
      const result = submitQuestionAttempt({
        state: {
          firstResponseRecorded: false,
          attempts: 0,
          hintUsed: false,
          isCompleted: false,
          isLocked: false
        },
        card,
        kind: 'scheduled',
        isCorrect: true,
        answer: 'C',
        answerKeyId: 'C4',
        responseMs: 1100,
        settings: DEFAULT_SETTINGS,
        sessionId,
        reviewedAt: 1_800_000_000_000 + index,
        trialContext: createTrialContext({
          mode: 'scheduledReview',
          sessionId,
          cardId: card.id,
          firstAttempt: true,
          inputMethod: 'midi'
        })
      });
      expect(result.cardMutated).toBe(true);
      expect(result.logEvent?.sessionId).toBe(sessionId);
      logs.push(result.logEvent!);
      endPracticeSession(sessionId);
      finishedQuestions.push({ sessionId, questionId });
    }

    const finalSessionId = 'stress-session-final';
    activatePracticeSession(finalSessionId);
    const finalQuestionId = activatePracticeQuestion(finalSessionId)!;

    // Simulates delayed handlers retained from every prior navigation/session.
    for (const stale of finishedQuestions) {
      expect(claimFirstAnswerCommit(stale.sessionId, stale.questionId)).toBe(false);
    }

    const inputMethods: TrialInputMethod[] = ['pc', 'screen', 'midi'];
    const finalClaims = inputMethods.map(() =>
      claimFirstAnswerCommit(finalSessionId, finalQuestionId)
    );
    expect(finalClaims.filter(Boolean)).toHaveLength(1);
    acceptedAnswers++;

    const beforeFinalReps = card.reps;
    const finalResult = submitQuestionAttempt({
      state: {
        firstResponseRecorded: false,
        attempts: 0,
        hintUsed: false,
        isCompleted: false,
        isLocked: false
      },
      card,
      kind: 'scheduled',
      isCorrect: true,
      answer: 'C',
      answerKeyId: 'C4',
      responseMs: 900,
      settings: DEFAULT_SETTINGS,
      sessionId: finalSessionId,
      reviewedAt: 1_800_000_000_100,
      trialContext: createTrialContext({
        mode: 'scheduledReview',
        sessionId: finalSessionId,
        cardId: card.id,
        firstAttempt: true,
        inputMethod: inputMethods[0]
      })
    });
    expect(finalResult.cardMutated).toBe(true);
    logs.push(finalResult.logEvent!);
    endPracticeSession(finalSessionId);

    expect(acceptedAnswers).toBe(21);
    expect(logs.filter(event => event.sessionId === finalSessionId)).toHaveLength(1);
    expect(card.reps - beforeFinalReps).toBe(1);
    expect(card.reps - startReps).toBe(21);
    expect(claimFirstAnswerCommit(finalSessionId, finalQuestionId)).toBe(false);
  });
});
