import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticSnapshot,
  generateDiagnosticsMarkdownSummary
} from '../../src/core/diagnostics/buildDiagnosticSnapshot';
import {
  computeDiversityMetrics,
  detectBottlenecks,
  detectStorageConsistency
} from '../../src/core/diagnostics/diagnosticChecks';
import {
  recordSchedulerDecision,
  getSchedulerTraces,
  clearSchedulerTraces
} from '../../src/core/diagnostics/schedulerTracker';
import type { Card, ReviewLogEvent } from '../../src/core/fsrs/types';
import { createSanitizedStabilizationProfile } from '../fixtures/stabilizationProfile';

describe('Diagnostic Data Export', () => {
  const baseCards: Card[] = [
    {
      id: 'find:C',
      note: 'C',
      skill: 'find',
      memoryState: 'review',
      dueAt: 1700000000000,
      lastReviewAt: 1699900000000,
      firstSeenAt: 1699000000000,
      reps: 5,
      lapses: 0,
      stability: 4.5,
      difficulty: 3.2,
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
    },
    {
      id: 'find:F',
      note: 'F',
      skill: 'find',
      memoryState: 'review',
      dueAt: 1699900000000, // Due and overdue
      lastReviewAt: 1699500000000,
      firstSeenAt: 1699000000000,
      reps: 8,
      lapses: 3,
      stability: 1.2,
      difficulty: 7.5,
      lastGrade: 1,
      stats: {
        trials: 8,
        firstCorrect: 4,
        firstWrong: 4,
        hints: 0,
        recentScheduledSuccesses: 1,
        scheduledSuccesses: 2,
        practiceTrials: 0
      }
    }
  ];

  const baseLogs: ReviewLogEvent[] = [
    {
      ts: 1699900000000,
      sessionId: 'session-1',
      cardId: 'find:C',
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
      responseMs: 1100,
      elapsedDays: 1,
      retrievabilityBefore: 0.9,
      stabilityBefore: 3.5,
      stabilityAfter: 4.5,
      difficultyBefore: 3.2,
      difficultyAfter: 3.2,
      scheduledDays: 3
    },
    {
      ts: 1699900050000,
      sessionId: 'session-1',
      cardId: 'find:F',
      note: 'F',
      skill: 'find',
      kind: 'confusion',
      grade: 1,
      gradeName: 'Again',
      firstCorrect: false,
      answer: 'E',
      answerKeyId: 'E4',
      attempts: 2,
      hintUsed: false,
      responseMs: 2500,
      elapsedDays: 1,
      retrievabilityBefore: 0.7,
      stabilityBefore: 2.0,
      stabilityAfter: 1.2,
      difficultyBefore: 7.0,
      difficultyAfter: 7.5,
      scheduledDays: 1
    }
  ];

  it('builds a complete valid diagnostic snapshot with all mandatory sections', () => {
    const now = 1700000050000;
    const snapshot = buildDiagnosticSnapshot({
      cards: baseCards,
      reviewLogs: baseLogs,
      now
    });

    expect(snapshot.diagnosticsSchemaVersion).toBe(2);
    expect(snapshot.schedulerTrace.schemaVersion).toBe(2);
    expect(snapshot.schedulerTrace).toMatchObject({
      recentTraces: [],
      nextRoundEvents: [],
      reviewTransitions: [],
      warnings: []
    });
    expect(snapshot.meta).toBeDefined();
    expect(snapshot.meta.appVersion).toContain('Piano Key Trainer');
    expect(snapshot.summary).toBeDefined();
    expect(snapshot.curriculum).toBeDefined();
    expect(snapshot.learningProgress).toBeDefined();
    expect(snapshot.fsrs).toBeDefined();
    expect(snapshot.dailyPractice).toBeDefined();
    expect(snapshot.reviewHistory).toBeDefined();
    expect(snapshot.schedulerTrace).toBeDefined();
    expect(snapshot.remediation).toBeDefined();
    expect(snapshot.bottlenecks).toBeDefined();
    expect(snapshot.storageConsistency).toBeDefined();

    // Verify JSON serializability
    const jsonStr = JSON.stringify(snapshot);
    expect(jsonStr.length).toBeGreaterThan(100);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.meta.schemaVersion).toBe(1);
  });

  it('correctly computes FSRS card metrics including due and overdue status', () => {
    const now = 1700000000000;
    const snapshot = buildDiagnosticSnapshot({
      cards: baseCards,
      reviewLogs: baseLogs,
      now
    });

    expect(snapshot.fsrs.totalCards).toBe(2);
    expect(snapshot.fsrs.dueCount).toBe(2); // both dueAt <= now
    expect(snapshot.fsrs.overdueCount).toBe(1); // find:F is < now - 86400000
    expect(snapshot.fsrs.bySkill['find']).toBe(2);

    const cCard = snapshot.fsrs.cards.find(c => c.cardId === 'find:C')!;
    expect(cCard.stability).toBe(4.5);
    expect(cCard.difficulty).toBe(3.2);
    expect(cCard.reps).toBe(5);
    expect(cCard.lapses).toBe(0);
    expect(cCard.isDue).toBe(true);
    expect(cCard.isOverdue).toBe(false);

    const fCard = snapshot.fsrs.cards.find(c => c.cardId === 'find:F')!;
    expect(fCard.lapses).toBe(3);
    expect(fCard.isOverdue).toBe(true);
  });

  it('computes diversity metrics and scheduler reasons for practice tasks', () => {
    const tasks = [
      { sequenceNumber: 1, cardId: 'find:C', skillType: 'find' as const, taskType: 'scheduled', note: 'C', schedulerReason: 'due' },
      { sequenceNumber: 2, cardId: 'find:F', skillType: 'find' as const, taskType: 'confusion', note: 'F', schedulerReason: 'recentError' },
      { sequenceNumber: 3, cardId: 'identify:C', skillType: 'identify' as const, taskType: 'scheduled', note: 'C', schedulerReason: 'due' },
      { sequenceNumber: 4, cardId: 'triadBuild:C', skillType: 'triadBuild' as const, taskType: 'transfer', root: 'C', schedulerReason: 'transfer' }
    ];

    const metrics = computeDiversityMetrics(tasks);
    expect(metrics.taskCount).toBe(4);
    expect(metrics.uniqueSkills).toBe(3);
    expect(metrics.maxSameSkillStreak).toBe(2);
    expect(metrics.maxSameCardStreak).toBe(1);
  });

  it('tracks scheduler decision ring buffer', () => {
    clearSchedulerTraces();
    recordSchedulerDecision({
      selected: 'find:C',
      skill: 'find',
      reason: 'due',
      candidateCount: 10
    });
    recordSchedulerDecision({
      selected: 'triadBuild:C',
      skill: 'triadBuild',
      reason: 'transfer',
      candidateCount: 5
    });

    const traces = getSchedulerTraces();
    expect(traces.length).toBe(2);
    expect(traces[0].selected).toBe('find:C');
    expect(traces[0].reason).toBe('due');
    expect(traces[1].selected).toBe('triadBuild:C');
    expect(traces[1].reason).toBe('transfer');
  });

  it('detects learning bottlenecks and stalled skills', () => {
    const repeatedFailLogs: ReviewLogEvent[] = [];
    for (let i = 0; i < 10; i++) {
      repeatedFailLogs.push({
        ts: 1699900000000 + i * 1000,
        sessionId: 'session-2',
        cardId: 'soundToKey:G',
        note: 'G',
        skill: 'soundToKey',
        kind: 'practice',
        grade: (i < 3 ? 3 : 1) as 1 | 2 | 3 | 4,
        gradeName: i < 3 ? 'Good' : 'Again',
        firstCorrect: i < 3,
        answer: 'G',
        answerKeyId: 'G4',
        attempts: 1,
        hintUsed: false,
        responseMs: 3200,
        elapsedDays: 1,
        retrievabilityBefore: 0.5,
        stabilityBefore: 1.0,
        stabilityAfter: 1.0,
        difficultyBefore: 8.0,
        difficultyAfter: 8.0,
        scheduledDays: 1
      });
    }

    const testCards: Card[] = [
      {
        id: 'soundToKey:G',
        note: 'G',
        skill: 'soundToKey',
        memoryState: 'review',
        dueAt: 1700000000000,
        lastReviewAt: 1699900000000,
        firstSeenAt: 1699000000000,
        reps: 10,
        lapses: 5,
        stability: 1.0,
        difficulty: 8.0,
        lastGrade: 1,
        stats: {
          trials: 10,
          firstCorrect: 3,
          firstWrong: 7,
          hints: 0,
          recentScheduledSuccesses: 1,
          scheduledSuccesses: 1,
          practiceTrials: 8
        }
      }
    ];

    const bottlenecks = detectBottlenecks(repeatedFailLogs, testCards);
    expect(bottlenecks.stalledSkills.length).toBe(1);
    expect(bottlenecks.stalledSkills[0].skill).toBe('soundToKey');
    expect(bottlenecks.stalledSkills[0].firstAttemptAccuracy).toBe(30); // 3/10
    expect(bottlenecks.highestLapseCards.length).toBe(1);
    expect(bottlenecks.highestLapseCards[0].lapses).toBe(5);
  });

  it('detects storage consistency issues and curriculum contradictions', () => {
    const rawPhases = [
      { id: 'anchors', title: 'Ориентиры', detail: '', open: true, done: false },
      { id: 'neighbors', title: 'Соседи', detail: '', open: true, done: true } // Contradiction: Phase 2 done while Phase 1 incomplete
    ];
    const normalizedPhases = [
      { id: 'anchors', title: 'Ориентиры', detail: '', open: true, done: true },
      { id: 'neighbors', title: 'Соседи', detail: '', open: true, done: true }
    ];

    const duplicateCards: Card[] = [
      { ...baseCards[0] },
      { ...baseCards[0] } // duplicate id
    ];

    const consistency = detectStorageConsistency({
      cards: duplicateCards,
      learningProgress: new Map(),
      reviewLogs: [],
      rawPhases,
      normalizedPhases,
      now: 1700000000000
    });

    expect(consistency.checks.duplicateCards).toContain('find:C');
    expect(consistency.checks.curriculumContradictions.length).toBeGreaterThan(0);
    expect(consistency.warnings.length).toBeGreaterThan(0);
  });

  it('generates a readable and well-structured Markdown summary', () => {
    const snapshot = buildDiagnosticSnapshot({
      cards: baseCards,
      reviewLogs: baseLogs,
      now: 1700000050000
    });

    const md = generateDiagnosticsMarkdownSummary(snapshot);
    expect(md).toContain('# Диагностический отчёт Piano Key Trainer');
    expect(md).toContain('## 1. Сводка состояния');
    expect(md).toContain('## 2. Учебный план (Curriculum State)');
    expect(md).toContain('## 3. Flashcards & FSRS метрики');
    expect(md).toContain('## 5. Daily Practice и разнообразие заданий');
    expect(md).toContain('## 6. Проверка целостности данных');
  });

  it('preserves privacy and excludes unrelated personal data', () => {
    const snapshot = buildDiagnosticSnapshot({
      cards: baseCards,
      reviewLogs: baseLogs,
      now: 1700000050000
    });

    const jsonStr = JSON.stringify(snapshot);
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('email');
    expect(jsonStr).not.toContain('token');
    expect(jsonStr).not.toContain('auth');
    expect(jsonStr).not.toContain('apiKey');
  });

  it('handles empty cards and logs gracefully without crashing', () => {
    const emptySnapshot = buildDiagnosticSnapshot({
      cards: [],
      reviewLogs: [],
      learningProgress: new Map()
    });

    expect(emptySnapshot.fsrs.totalCards).toBe(0);
    expect(emptySnapshot.fsrs.dueCount).toBe(0);
    expect(emptySnapshot.reviewHistory.recentEventsCount).toBe(0);
    expect(emptySnapshot.curriculum.corePhasesCompleted).toBe(0);

    const md = generateDiagnosticsMarkdownSummary(emptySnapshot);
    expect(md).toBeDefined();
    expect(md.length).toBeGreaterThan(50);
  });

  it('exports a sanitized stabilization profile with aligned completion, availability, and new-card lifecycle', () => {
    const profile = createSanitizedStabilizationProfile();
    const snapshot = buildDiagnosticSnapshot({
      cards: profile.cards,
      learningProgress: profile.learningProgress,
      reviewLogs: profile.reviewLogs,
      now: profile.now
    });
    const markdown = generateDiagnosticsMarkdownSummary(snapshot);

    expect(snapshot.curriculum.corePhasesCompleted).toBe(6);
    expect(snapshot.curriculum.corePhasesTotal).toBe(6);
    expect(snapshot.curriculum.advancedModules.bassGrandStaff.status).toBe('completed');
    expect(snapshot.curriculum.advancedModules.intervals.available).toBe(true);
    expect(snapshot.curriculum.advancedModules.intervals.status).toBe('in_progress');

    const eligibleNewCard = snapshot.fsrs.cards.find(card => card.cardId === 'notationToKey:G')!;
    const inactiveNewCard = snapshot.fsrs.cards.find(card => card.cardId === 'intervalBuild:P8')!;
    expect(eligibleNewCard.lifecycleClassification).toBe('newEligible');
    expect(inactiveNewCard.lifecycleClassification).toBe('newInactive');
    expect(eligibleNewCard.dueFormatted).toBeNull();
    expect(eligibleNewCard.isDue).toBe(false);
    expect(eligibleNewCard.isOverdue).toBe(false);
    expect(inactiveNewCard.isDue).toBe(false);
    expect(snapshot.fsrs.dueCount).toBe(1);
    expect(snapshot.fsrs.overdueCount).toBe(1);
    expect(snapshot.storageConsistency.checks.invalidDueDates).not.toContain('notationToKey:G');
    expect(snapshot.integrityChecks.newCardMarkedOverdue).toEqual([]);

    expect(snapshot.dailyPractice.totalSessions).toBe(12);
    expect(snapshot.dailyPractice.recentSessionsIncluded).toBe(10);
    expect(snapshot.integrityChecks.duplicateReviewBurst.length).toBeGreaterThan(0);
    expect(snapshot.integrityChecks.staleSessionHandlerSuspected.length).toBeGreaterThan(0);
    expect(snapshot.integrityChecks.curriculumNormalizationApplied.length).toBeGreaterThan(0);
    expect(snapshot.integrityChecks.moduleCompletionMismatch).toEqual([]);
    expect(snapshot.integrityChecks.availabilityMismatch).toEqual([]);

    expect(markdown).toContain(`**Сессий с ReviewLog:** ${snapshot.dailyPractice.totalSessions} всего`);
    expect(markdown).toContain(`**Недавних сессий в этом отчёте:** ${snapshot.dailyPractice.recentSessionsIncluded}`);
    expect(markdown).toContain('Raw завершение | Нормализованное завершение');
    expect(markdown).toContain(`Всплесков ReviewLog с разными сессиями: ${snapshot.integrityChecks.duplicateReviewBurst.length}`);
    expect(JSON.parse(JSON.stringify(snapshot)).dailyPractice.totalSessions).toBe(snapshot.dailyPractice.totalSessions);
  });

  it('flags supplied stale Program status/availability against the persisted advanced-module resolver', () => {
    const profile = createSanitizedStabilizationProfile();
    const snapshot = buildDiagnosticSnapshot({
      cards: profile.cards,
      learningProgress: profile.learningProgress,
      reviewLogs: profile.reviewLogs,
      now: profile.now,
      advancedModulesStatus: {
        bassGrandStatus: 'in_progress',
        intervalStatus: 'not_started'
      },
      advancedModuleAvailability: { intervals: false }
    });

    expect(snapshot.integrityChecks.moduleCompletionMismatch).toEqual([
      'bassGrandStaff: UI status in_progress, persisted domain status completed',
      'intervals: UI status not_started, persisted domain status in_progress'
    ]);
    expect(snapshot.integrityChecks.availabilityMismatch).toEqual([
      'intervals: UI availability false, resolved availability true'
    ]);
  });

  it('reports invalid timestamps without throwing while accepting new-card dueAt zero', () => {
    const invalidReview = { ...baseLogs[0], ts: Number.MAX_VALUE };
    const invalidCard = { ...baseCards[0], id: 'find:D', dueAt: Number.MAX_VALUE };
    const snapshot = buildDiagnosticSnapshot({
      cards: [invalidCard],
      reviewLogs: [invalidReview],
      now: 1700000000000
    });

    expect(snapshot.storageConsistency.checks.invalidDueDates).toContain('find:D');
    expect(snapshot.storageConsistency.checks.invalidReviewTimestamps).toHaveLength(1);
    expect(snapshot.reviewHistory.recentEventsCount).toBe(0);
  });
});
