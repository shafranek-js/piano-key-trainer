import type { Skill } from '../fsrs/types';
import type {
  SchedulerNextRoundEvent,
  SchedulerReviewTransition,
  SchedulerTraceAlternative,
  SchedulerTraceDiagnosticState,
  SchedulerTraceItem,
  SchedulerTraceWarning
} from './diagnosticTypes';

const MAX_EVENTS_DEFAULT = 250;

class SchedulerTracker {
  private traces: SchedulerTraceItem[] = [];
  private nextRoundEvents: SchedulerNextRoundEvent[] = [];
  private reviewTransitions: SchedulerReviewTransition[] = [];
  private warnings: SchedulerTraceWarning[] = [];
  private maxCount = MAX_EVENTS_DEFAULT;
  private decisionSequence = 0;
  private roundSequence = 0;
  private transitionSequence = 0;

  public setMaxCount(count: number) {
    this.maxCount = Math.max(1, count);
    this.traces = this.traces.slice(-this.maxCount);
    this.nextRoundEvents = this.nextRoundEvents.slice(-this.maxCount);
    this.reviewTransitions = this.reviewTransitions.slice(-this.maxCount);
    this.warnings = this.warnings.slice(-this.maxCount);
  }

  public recordNextRoundRequest(params: {
    sessionId: string | null;
    activity: string;
    previousActivationId: string | null;
    previousQuestionInstanceId: string | null;
    previousCardId: string | null;
    timestamp?: number;
  }): string {
    const callId = `round-${++this.roundSequence}`;
    this.nextRoundEvents.push({
      callId,
      timestamp: params.timestamp ?? Date.now(),
      sessionId: params.sessionId,
      activity: params.activity,
      previousActivationId: params.previousActivationId,
      previousQuestionInstanceId: params.previousQuestionInstanceId,
      previousCardId: params.previousCardId,
      disposition: 'requested'
    });
    this.trim();
    return callId;
  }

  public updateNextRoundRequest(
    callId: string,
    disposition: SchedulerNextRoundEvent['disposition'],
    activationId?: string
  ) {
    const event = this.nextRoundEvents.find(item => item.callId === callId);
    if (!event) return;
    event.disposition = disposition;
    if (activationId) event.activationId = activationId;
  }

  public recordDecision(params: {
    selected: string;
    skill: Skill;
    reason: string;
    candidateCount?: number;
    eligibleCandidateCount?: number;
    dueCandidateCount?: number;
    recentCardIds?: string[];
    alternatives?: SchedulerTraceAlternative[];
    timestamp?: number;
    sessionId?: string | null;
    questionInstanceId?: string | null;
    nextRoundCallId?: string | null;
    cardStateBefore?: string | null;
    dueAtBefore?: number | null;
    isDueBefore?: boolean;
  }): SchedulerTraceItem {
    const timestamp = params.timestamp ?? Date.now();
    const activationId = `activation-${++this.decisionSequence}`;
    const sessionId = params.sessionId ?? null;
    const questionInstanceId = params.questionInstanceId ?? null;
    const previousReview = [...this.reviewTransitions]
      .reverse()
      .find(item => item.sessionId === sessionId && item.persistenceStatus === 'saved' && item.timestamp <= timestamp);
    const eligibleCandidateCount = params.eligibleCandidateCount ?? params.candidateCount ?? 1;
    const item: SchedulerTraceItem = {
      timestamp,
      timeFormatted: new Date(timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      selected: params.selected,
      skill: params.skill,
      reason: params.reason,
      candidateCount: eligibleCandidateCount,
      alternatives: params.alternatives ?? [],
      activationId,
      decisionSequence: this.decisionSequence,
      sessionId,
      questionInstanceId,
      nextRoundCallId: params.nextRoundCallId ?? null,
      cardStateBefore: params.cardStateBefore ?? null,
      dueAtBefore: params.dueAtBefore ?? null,
      isDueBefore: params.isDueBefore ?? false,
      eligibleCandidateCount,
      dueCandidateCount: params.dueCandidateCount ?? 0,
      recentCardIds: [...(params.recentCardIds ?? [])],
      previousReviewTransitionId: previousReview?.transitionId ?? null
    };

    if (sessionId && questionInstanceId && item.reason === 'scheduled_due') {
      const previous = [...this.traces].reverse().find(trace =>
        trace.sessionId === sessionId &&
        trace.selected === item.selected &&
        trace.reason === 'scheduled_due' &&
        trace.questionInstanceId !== null
      );
      if (previous) {
        const reviewedBetween = this.reviewTransitions.some(transition =>
          transition.sessionId === sessionId &&
          transition.questionInstanceId === previous.questionInstanceId &&
          transition.timestamp >= previous.timestamp &&
          transition.timestamp <= timestamp
        );
        if (!reviewedBetween) {
          this.warnings.push({
            code: 'scheduledCardReselectedWithoutReview',
            timestamp,
            sessionId,
            cardId: item.selected,
            activationIds: [previous.activationId, activationId],
            questionInstanceIds: [previous.questionInstanceId!, questionInstanceId],
            message: `${item.selected} was selected again in the same session before its prior scheduled question produced a review transition.`
          });
        }
        const intervalMs = timestamp - previous.timestamp;
        if (intervalMs >= 0 && intervalMs <= 100) {
          this.warnings.push({
            code: 'duplicateTaskActivation',
            timestamp,
            sessionId,
            cardId: item.selected,
            activationIds: [previous.activationId, activationId],
            questionInstanceIds: [previous.questionInstanceId!, questionInstanceId],
            intervalMs,
            message: `${item.selected} received two scheduled task activations within ${intervalMs} ms in one session.`
          });
        }
      }
    }

    this.traces.push(item);
    if (params.nextRoundCallId) this.updateNextRoundRequest(params.nextRoundCallId, 'activated', activationId);
    this.trim();
    return item;
  }

  public recordReviewTransition(params: Omit<SchedulerReviewTransition, 'transitionId' | 'persisted' | 'persistenceStatus'>): string {
    const transitionId = `review-${++this.transitionSequence}`;
    this.reviewTransitions.push({
      ...params,
      transitionId,
      persisted: false,
      persistenceStatus: 'pending'
    });
    this.trim();
    return transitionId;
  }

  public markReviewTransitionPersisted(transitionId: string, persisted: boolean) {
    const event = this.reviewTransitions.find(item => item.transitionId === transitionId);
    if (!event) return;
    event.persisted = persisted;
    event.persistenceStatus = persisted ? 'saved' : 'failed';
  }

  public getDiagnostics(): SchedulerTraceDiagnosticState {
    return {
      schemaVersion: 2,
      recentTraces: this.traces.map(item => ({ ...item, alternatives: [...item.alternatives], recentCardIds: [...item.recentCardIds] })),
      nextRoundEvents: this.nextRoundEvents.map(item => ({ ...item })),
      reviewTransitions: this.reviewTransitions.map(item => ({ ...item })),
      warnings: this.warnings.map(item => ({ ...item, activationIds: [...item.activationIds], questionInstanceIds: [...item.questionInstanceIds] }))
    };
  }

  public getTraces(): SchedulerTraceItem[] {
    return this.getDiagnostics().recentTraces;
  }

  public clear(): void {
    this.traces = [];
    this.nextRoundEvents = [];
    this.reviewTransitions = [];
    this.warnings = [];
    this.decisionSequence = 0;
    this.roundSequence = 0;
    this.transitionSequence = 0;
  }

  private trim() {
    this.traces = this.traces.slice(-this.maxCount);
    this.nextRoundEvents = this.nextRoundEvents.slice(-this.maxCount);
    this.reviewTransitions = this.reviewTransitions.slice(-this.maxCount);
    this.warnings = this.warnings.slice(-this.maxCount);
  }
}

export const schedulerTracker = new SchedulerTracker();

export function recordNextRoundRequest(params: Parameters<typeof schedulerTracker.recordNextRoundRequest>[0]) {
  return schedulerTracker.recordNextRoundRequest(params);
}

export function updateNextRoundRequest(
  callId: string,
  disposition: SchedulerNextRoundEvent['disposition'],
  activationId?: string
) {
  schedulerTracker.updateNextRoundRequest(callId, disposition, activationId);
}

export function recordSchedulerDecision(params: Parameters<typeof schedulerTracker.recordDecision>[0]): SchedulerTraceItem {
  return schedulerTracker.recordDecision(params);
}

export function recordSchedulerReviewTransition(params: Parameters<typeof schedulerTracker.recordReviewTransition>[0]) {
  return schedulerTracker.recordReviewTransition(params);
}

export function markSchedulerReviewPersisted(transitionId: string, persisted: boolean) {
  schedulerTracker.markReviewTransitionPersisted(transitionId, persisted);
}

export function getSchedulerDiagnostics(): SchedulerTraceDiagnosticState {
  return schedulerTracker.getDiagnostics();
}

export function getSchedulerTraces(): SchedulerTraceItem[] {
  return schedulerTracker.getTraces();
}

export function clearSchedulerTraces(): void {
  schedulerTracker.clear();
}
