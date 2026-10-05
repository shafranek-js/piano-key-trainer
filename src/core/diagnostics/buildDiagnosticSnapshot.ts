import { DISPLAY_NAMES } from '../fsrs/constants';
import type { Card, NoteName, ReviewLogEvent, Skill } from '../fsrs/types';
import {
  classifyFsrsCard,
  isFsrsCardDue,
  isFsrsCardOverdue
} from '../fsrs/cardClassification';
import type { LearningProgressRecord } from '../learning/types';
import {
  getCurriculumPhases,
  normalizeSequentialPhaseCompletion,
  type CardGetter
} from '../curriculum/curriculum';
import { isCurriculumCardActive } from '../learning/curriculumFlow';
import { resolveAdvancedModuleStates } from '../learning/advancedModules';
import {
  HARMONY_ITEM_IDS,
  HARMONY_TRANSFER_TRIALS,
  HARMONY_RETRY_TRIALS,
  harmonyCardNotes
} from '../learning/harmony';
import { APP_VERSION } from '../version';
import {
  computeDiversityMetrics,
  detectBottlenecks,
  detectStorageConsistency,
  computePhaseDetails
} from './diagnosticChecks';
import {
  DIAGNOSTICS_SCHEMA_VERSION,
  type BuildDiagnosticSnapshotParams,
  type CurriculumDiagnosticState,
  type DailyPracticeDiagnosticState,
  type DiagnosticExport,
  type DiagnosticMeta,
  type DiagnosticSummary,
  type DiagnosticIntegrityChecks,
  type FsrsCardDiagnostic,
  type FsrsDiagnosticState,
  type LearningProgressDiagnosticState,
  type PracticeSessionDiagnostic,
  type PracticeTaskDiagnostic,
  type ReviewEventDiagnostic,
  type ReviewHistoryDiagnosticState,
  type SchedulerTraceDiagnosticState
} from './diagnosticTypes';

const RECENT_SESSION_REPORT_LIMIT = 10;

function toIsoOrNull(timestamp: number): string | null {
  if (!Number.isFinite(timestamp) || timestamp < 0) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function detectDuplicateReviewBursts(reviewLogs: readonly ReviewLogEvent[]): string[] {
  const sorted = [...reviewLogs].sort((a, b) => a.ts - b.ts);
  const bursts: string[] = [];
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].ts - sorted[start].ts <= 50) end++;
    const window = sorted.slice(start, end);
    const sessionIds = new Set(window.map(event => event.sessionId));
    if (window.length >= 3 && sessionIds.size >= 2) {
      bursts.push(`Possible duplicate input processing: ${window.length} events in <=50 ms across ${sessionIds.size} sessions (from ${new Date(sorted[start].ts).toISOString()}).`);
      start = end;
    } else start++;
  }
  return bursts;
}

function detectStaleSessionEvents(reviewLogs: readonly ReviewLogEvent[]): string[] {
  const bySession = new Map<string, ReviewLogEvent[]>();
  for (const event of reviewLogs) {
    const events = bySession.get(event.sessionId) ?? [];
    events.push(event);
    bySession.set(event.sessionId, events);
  }
  const sessions = [...bySession.entries()]
    .map(([sessionId, events]) => ({
      sessionId,
      firstEventAt: Math.min(...events.map(event => event.ts)),
      events
    }))
    .sort((a, b) => a.firstEventAt - b.firstEventAt);
  const warnings: string[] = [];
  for (let index = 0; index < sessions.length - 1; index++) {
    const current = sessions[index];
    const next = sessions[index + 1];
    const lateEvents = current.events.filter(event => event.ts > next.firstEventAt);
    if (lateEvents.length) {
      warnings.push(
        `Session ${current.sessionId} has ${lateEvents.length} event(s) after ${next.sessionId} began producing review events; stale handler suspected.`
      );
    }
  }
  return warnings;
}

function createEmptyCard(skill: Skill, note: NoteName): Card {
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
    }
  };
}

export function buildDiagnosticSnapshot(params: BuildDiagnosticSnapshotParams): DiagnosticExport {
  const now = params.now ?? Date.now();
  const cards = params.cards || [];
  const reviewLogs = params.reviewLogs || [];
  const reportReviewLogs = reviewLogs.filter(event => toIsoOrNull(event.ts) !== null);
  const settings = params.settings;

  // 1. Normalize LearningProgress to Map
  const lpMap = new Map<string, LearningProgressRecord>();
  if (params.learningProgress) {
    if (params.learningProgress instanceof Map) {
      for (const [k, v] of params.learningProgress.entries()) {
        lpMap.set(k, v);
      }
    } else if (Array.isArray(params.learningProgress)) {
      for (const r of params.learningProgress) {
        if (r && r.itemId) lpMap.set(r.itemId, r);
      }
    } else if (typeof params.learningProgress === 'object') {
      for (const [k, v] of Object.entries(params.learningProgress)) {
        if (v) lpMap.set(k, v);
      }
    }
  }

  // 2. Card Getter
  const cardLookup = new Map<string, Card>();
  for (const c of cards) {
    cardLookup.set(`${c.skill}:${c.note}`, c);
  }
  const getCard: CardGetter = (skill: Skill, note: NoteName) =>
    cardLookup.get(`${skill}:${note}`) || createEmptyCard(skill, note);

  // 3. Curriculum calculations (Raw vs Normalized)
  const level = settings?.level || 'white';
  const rawPhases = getCurriculumPhases(level, getCard, reportReviewLogs, lpMap, false);
  const normalizedPhases = normalizeSequentialPhaseCompletion(rawPhases);
  const corePhasesTotal = normalizedPhases.length;
  const corePhasesCompleted = normalizedPhases.filter(p => p.done).length;
  const isAllCoreDone = corePhasesCompleted === corePhasesTotal && corePhasesTotal > 0;
  const currentPhase = normalizedPhases.find(p => p.open && !p.done);
  const currentPhaseId = currentPhase ? currentPhase.id : isAllCoreDone ? null : (normalizedPhases[0]?.id || null);

  const phaseDetails = computePhaseDetails({
    rawPhases,
    normalizedPhases,
    getCard,
    reviewLog: reportReviewLogs,
    lpMap
  });

  const advModStatus = params.advancedModulesStatus || {};
  const harmonyAssessment = lpMap.get(HARMONY_ITEM_IDS.TRANSFER)?.transferAssessment;
  const resolvedModules = resolveAdvancedModuleStates({
    learningProgress: lpMap,
    cards,
      reviewLogs: reportReviewLogs
  });
  const harmonyCards = harmonyCardNotes().map(({ skill, note }) => {
    const card = getCard(skill, note);
    const eligibleForDailyPractice = isCurriculumCardActive(card, {
      learningProgress: lpMap,
      cards,
      reviewLogs: reportReviewLogs,
      level
    });
    return {
      cardId: card.id,
      lifecycleClassification: classifyFsrsCard(card, now, eligibleForDailyPractice),
      eligibleForDailyPractice
    };
  });
  const advancedModules: CurriculumDiagnosticState['advancedModules'] = {
    bassGrandStaff: {
      id: 'bassGrandStaff',
      title: 'Басовый ключ и акколада (Milestone 3F)',
      status: resolvedModules.bassGrandStaff.state,
      available: resolvedModules.bassGrandStaff.available,
      activeStep: advModStatus.bassGrandActiveStep
    },
    intervals: {
      id: 'intervals',
      title: 'Интервалы на клавиатуре (Milestone 3G)',
      status: resolvedModules.intervals.state,
      available: resolvedModules.intervals.available,
      activeStep: advModStatus.intervalActiveStep
    },
    triads: {
      id: 'triads',
      title: 'Мажорные и минорные трезвучия (Milestone 3H)',
      status: resolvedModules.triads.state,
      available: resolvedModules.triads.available,
      activeStep: advModStatus.triadActiveStep
    },
    chordInversions: {
      id: 'chordInversions',
      title: 'Обращения аккордов и буквенные обозначения (Milestone 3I)',
      status: resolvedModules.chordInversions.state,
      available: resolvedModules.chordInversions.available,
      activeStep: advModStatus.inversionActiveStep
    },
    harmony: {
      id: 'harmony',
      title: 'Гармония и сопровождение (Milestone 3J)',
      status: resolvedModules.harmony.state,
      available: resolvedModules.harmony.available,
      activeStep: advModStatus.harmonyActiveStep,
      trialsCompleted: harmonyAssessment?.trialsCompleted ?? 0,
      trialsTotal: harmonyAssessment?.blockKind === 'retry' ? HARMONY_RETRY_TRIALS : HARMONY_TRANSFER_TRIALS,
      accuracy: harmonyAssessment?.trialsCompleted
        ? harmonyAssessment.correctFirstAttempts / harmonyAssessment.trialsCompleted
        : null,
      transferPhase: harmonyAssessment?.phase ?? null,
      transferBlockKind: harmonyAssessment?.blockKind ?? null,
      learningGates: {
        functions: lpMap.get(HARMONY_ITEM_IDS.FUNCTIONS)?.state ?? 'unseen',
        nextChord: lpMap.get(HARMONY_ITEM_IDS.NEXT_CHORD)?.state ?? 'unseen',
        progressionPlay: lpMap.get(HARMONY_ITEM_IDS.INDEPENDENT_PLAY)?.state ?? 'unseen'
      },
      harmonyCards
    }
  };

  const curriculum: CurriculumDiagnosticState = {
    corePhasesCompleted,
    corePhasesTotal,
    isAllCoreDone,
    currentPhaseId,
    coreCourse: phaseDetails,
    advancedModules
  };

  // 4. Learning Progress Diagnostic State
  const byState: Record<string, number> = {};
  const lpRecords: LearningProgressDiagnosticState['records'] = {};
  for (const [id, r] of lpMap.entries()) {
    byState[r.state] = (byState[r.state] || 0) + 1;
    lpRecords[id] = {
      state: r.state,
      updatedAt: r.updatedAt,
      updatedAtFormatted: toIsoOrNull(r.updatedAt) ?? 'Invalid timestamp',
      contexts: r.contexts ? Array.from(r.contexts) : [],
      modelCompleted: r.modelCompleted,
      guidedSuccesses: r.guidedSuccesses,
      independentUnhintedSuccesses: r.independentUnhintedSuccesses
    };
  }
  const learningProgress: LearningProgressDiagnosticState = {
    totalRecords: lpMap.size,
    byState,
    records: lpRecords
  };

  // 5. FSRS Cards Diagnostics
  const oneDayMs = 86_400_000;
  let dueCount = 0;
  let overdueCount = 0;
  const bySkill: Record<string, number> = {};
  const cardDiagnostics: FsrsCardDiagnostic[] = [];

  for (const c of cards) {
    const eligibleForPractice = isCurriculumCardActive(c, {
      learningProgress: lpMap,
      cards,
      reviewLogs: reportReviewLogs,
      level
    });
    const lifecycleClassification = classifyFsrsCard(c, now, eligibleForPractice);
    const isDue = eligibleForPractice && isFsrsCardDue(c, now);
    const isOverdue = eligibleForPractice && isFsrsCardOverdue(c, now);
    if (isDue) dueCount++;
    if (isOverdue) overdueCount++;

    bySkill[c.skill] = (bySkill[c.skill] || 0) + 1;

    const hasValidDueAt = Number.isFinite(c.dueAt) && c.dueAt > 0;
    const hasValidLastReview = Number.isFinite(c.lastReviewAt) && c.lastReviewAt > 0;
    const scheduledDays = hasValidLastReview && hasValidDueAt
      ? Math.round((c.dueAt - c.lastReviewAt) / oneDayMs)
      : 0;
    const elapsedDays = hasValidLastReview
      ? Math.max(0, Math.floor((now - c.lastReviewAt) / oneDayMs))
      : 0;

    cardDiagnostics.push({
      cardId: c.id,
      skillType: c.skill,
      displayName: DISPLAY_NAMES[c.note] || c.note,
      note: c.note,
      state: c.memoryState || (c.reps > 0 ? 'review' : 'new'),
      lifecycleClassification,
      due: c.dueAt,
      dueFormatted: hasValidDueAt ? toIsoOrNull(c.dueAt) : null,
      lastReview: hasValidLastReview ? c.lastReviewAt : null,
      lastReviewFormatted: hasValidLastReview ? toIsoOrNull(c.lastReviewAt) : null,
      reps: c.reps || 0,
      lapses: c.lapses || 0,
      stability: Number((c.stability ?? 0).toFixed(2)),
      difficulty: Number((c.difficulty ?? 0).toFixed(2)),
      scheduledDays,
      elapsedDays,
      isDue,
      isOverdue
    });
  }

  const fsrs: FsrsDiagnosticState = {
    totalCards: cards.length,
    dueCount,
    overdueCount,
    bySkill,
    cards: cardDiagnostics
  };

  // 6. Daily Practice Tasks & Sessions Reconstruction
  // Group review logs into sessions
  const sessionMap = new Map<string, ReviewLogEvent[]>();
  for (const e of reportReviewLogs) {
    if (!e.sessionId) continue;
    let sList = sessionMap.get(e.sessionId);
    if (!sList) {
      sList = [];
      sessionMap.set(e.sessionId, sList);
    }
    sList.push(e);
  }

  const recentSessions: PracticeSessionDiagnostic[] = [];
  for (const [sid, events] of sessionMap.entries()) {
    if (!events.length) continue;
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    const startedAt = sorted[0].ts;
    const endedAt = sorted[sorted.length - 1].ts;
    const durationSeconds = Math.max(1, Math.round((endedAt - startedAt) / 1000));
    const correctCount = events.filter(ev => ev.grade !== 1).length;
    const firstAttemptCorrect = events.filter(ev => ev.firstCorrect).length;
    const firstAttemptAccuracy = Math.round((firstAttemptCorrect / events.length) * 100);

    recentSessions.push({
      sessionId: sid,
      startedAt,
      startedAtFormatted: toIsoOrNull(startedAt) ?? 'Invalid timestamp',
      endedAt,
      endedAtFormatted: toIsoOrNull(endedAt) ?? 'Invalid timestamp',
      durationSeconds,
      taskCount: events.length,
      correctCount,
      firstAttemptAccuracy
    });
  }
  recentSessions.sort((a, b) => b.startedAt - a.startedAt);

  // Recent practice tasks (last 50 events)
  const recentLogSlice = [...reportReviewLogs].sort((a, b) => a.ts - b.ts).slice(-50);
  const recentTasks: PracticeTaskDiagnostic[] = recentLogSlice.map((ev, idx) => {
    let schedulerReason = ev.schedulerReason;
    if (!schedulerReason) {
      if (ev.kind === 'transfer') schedulerReason = 'transfer';
      else if (ev.kind === 'confusion') schedulerReason = 'recent_error';
      else if (ev.kind === 'new') schedulerReason = 'newly_unlocked';
      else if (ev.kind === 'lesson') schedulerReason = 'remediation';
      else if (ev.kind === 'practice') schedulerReason = 'legacy_unclassified';
      else schedulerReason = 'scheduled_due';
    }

    return {
      sequenceNumber: idx + 1,
      cardId: ev.cardId,
      skillType: ev.skill,
      taskType: ev.kind,
      note: ev.note,
      context: ev.contextId,
      schedulerReason
    };
  });

  const diversity = computeDiversityMetrics(recentTasks.slice(-20));
  const reportedSessions = recentSessions.slice(0, RECENT_SESSION_REPORT_LIMIT);
  const dailyPractice: DailyPracticeDiagnosticState = {
    totalSessions: recentSessions.length,
    recentSessionsIncluded: reportedSessions.length,
    recentSessionLimit: RECENT_SESSION_REPORT_LIMIT,
    recentSessions: reportedSessions,
    recentTasks,
    diversity
  };

  // 7. Review History (up to 300 events)
  const reviewHistoryEvents: ReviewEventDiagnostic[] = [...reportReviewLogs].sort((a, b) => a.ts - b.ts).slice(-300).map(e => ({
    timestamp: e.ts,
    dateFormatted: toIsoOrNull(e.ts) ?? 'Invalid timestamp',
    cardId: e.cardId,
    skillType: e.skill,
    taskType: e.kind,
    context: e.contextId,
    answer: e.answer ?? undefined,
    correct: e.grade !== 1,
    grade: e.grade,
    firstAttempt: e.firstCorrect,
    responseTimeMs: e.responseMs,
    sessionId: e.sessionId,
    chordDetails: e.skill.startsWith('triad') || e.skill === 'chordSymbolRead'
      ? {
          targetNotes: [e.note],
          playedNotes: e.answer ? e.answer.split(' ') : undefined
        }
      : undefined,
    intervalDetails: e.skill.startsWith('interval')
      ? {
          targetInterval: e.note,
          root: e.contextId,
          answer: e.answer ?? undefined
        }
      : undefined
  }));

  const reviewHistory: ReviewHistoryDiagnosticState = {
    recentEventsCount: reviewHistoryEvents.length,
    recentEvents: reviewHistoryEvents
  };

  // 8. Scheduler Traces
  const schedulerTrace: SchedulerTraceDiagnosticState = params.schedulerDiagnostics
    ? {
        ...params.schedulerDiagnostics,
        recentTraces: [...params.schedulerDiagnostics.recentTraces],
        nextRoundEvents: [...params.schedulerDiagnostics.nextRoundEvents],
        reviewTransitions: [...params.schedulerDiagnostics.reviewTransitions],
        warnings: [...params.schedulerDiagnostics.warnings]
      }
    : {
        schemaVersion: 2,
        recentTraces: params.schedulerTraces ? [...params.schedulerTraces] : [],
        nextRoundEvents: [],
        reviewTransitions: [],
        warnings: []
      };

  // 9. Remediation
  const remediation = {
    activeStates: params.activeRemediation ? [...params.activeRemediation] : []
  };

  // 10. Bottlenecks
  const bottlenecks = detectBottlenecks(reportReviewLogs, cards);

  // 11. Storage Consistency Checks
  const storageConsistency = detectStorageConsistency({
    cards,
    learningProgress: lpMap,
    reviewLogs,
    rawPhases,
    normalizedPhases,
    now
  });

  const statusComparisons = [
    ['bassGrandStaff', advModStatus.bassGrandStatus, resolvedModules.bassGrandStaff.progressStatus],
    ['intervals', advModStatus.intervalStatus, resolvedModules.intervals.progressStatus],
    ['triads', advModStatus.triadStatus, resolvedModules.triads.progressStatus],
    ['chordInversions', advModStatus.inversionStatus, resolvedModules.chordInversions.progressStatus],
    ['harmony', advModStatus.harmonyStatus, resolvedModules.harmony.progressStatus]
  ] as const;
  const availabilityComparisons = [
    ['bassGrandStaff', params.advancedModuleAvailability?.bassGrandStaff, resolvedModules.bassGrandStaff.available],
    ['intervals', params.advancedModuleAvailability?.intervals, resolvedModules.intervals.available],
    ['triads', params.advancedModuleAvailability?.triads, resolvedModules.triads.available],
    ['chordInversions', params.advancedModuleAvailability?.chordInversions, resolvedModules.chordInversions.available],
    ['harmony', params.advancedModuleAvailability?.harmony, resolvedModules.harmony.available]
  ] as const;
  const normalizedChanges = phaseDetails
    ? Object.values(phaseDetails)
        .filter(phase => !phase.rawCompletion && phase.normalizedCompletion)
        .map(phase => `${phase.id}: ${phase.normalizationReason ?? 'sequential prerequisite normalization applied'}`)
    : [];
  const balancedRecentTasks = recentTasks.slice(-20);
  const recentDiversity = computeDiversityMetrics(balancedRecentTasks);
  const hasExplicitRemediation = balancedRecentTasks.some(task =>
    task.schedulerReason === 'remediation' || task.taskType === 'lesson' || task.context?.includes('pending:')
  );
  const fallbackTasks = balancedRecentTasks.filter(task => task.schedulerReason === 'fallback_emergency');
  const integrityChecks: DiagnosticIntegrityChecks = {
    duplicateReviewBurst: detectDuplicateReviewBursts(reportReviewLogs),
    staleSessionHandlerSuspected: detectStaleSessionEvents(reportReviewLogs),
    newCardMarkedOverdue: cardDiagnostics
      .filter(card => (card.lifecycleClassification === 'newEligible' || card.lifecycleClassification === 'newInactive') && card.isOverdue)
      .map(card => card.cardId),
    moduleCompletionMismatch: statusComparisons
      .filter(([, supplied, resolved]) => supplied !== undefined && supplied !== resolved)
      .map(([id, supplied, resolved]) => `${id}: UI status ${supplied}, persisted domain status ${resolved}`),
    availabilityMismatch: availabilityComparisons
      .filter(([, supplied, resolved]) => supplied !== undefined && supplied !== resolved)
      .map(([id, supplied, resolved]) => `${id}: UI availability ${supplied}, resolved availability ${resolved}`),
    fallbackDominance: settings?.sessionPreset !== 'due' && balancedRecentTasks.length >= 8 &&
      fallbackTasks.length / balancedRecentTasks.length >= 0.5
      ? [`fallback_emergency used for ${fallbackTasks.length}/${balancedRecentTasks.length} recent Balanced tasks`]
      : [],
    excessiveSkillStreak: settings?.sessionPreset !== 'due' && !hasExplicitRemediation && recentDiversity.maxSameSkillStreak > 2
      ? [`Same skill repeated ${recentDiversity.maxSameSkillStreak} times consecutively in recent Balanced tasks`]
      : [],
    curriculumNormalizationApplied: normalizedChanges,
    schedulerReselectionWithoutReview: schedulerTrace.warnings
      .filter(warning => warning.code === 'scheduledCardReselectedWithoutReview')
      .map(warning => `${warning.cardId} in ${warning.sessionId}: ${warning.message}`),
    duplicateTaskActivation: schedulerTrace.warnings
      .filter(warning => warning.code === 'duplicateTaskActivation')
      .map(warning => `${warning.cardId} in ${warning.sessionId}: ${warning.message}`)
  };

  // 12. Summary Generation
  const potentialIssues: string[] = [...storageConsistency.warnings];
  for (const s of bottlenecks.stalledSkills) {
    potentialIssues.push(`Заторможенный навык: ${s.skill} (${s.warning})`);
  }
  for (const [checkName, findings] of Object.entries(integrityChecks)) {
    for (const finding of findings) potentialIssues.push(`${checkName}: ${finding}`);
  }

  const activePhaseTitle = currentPhase ? `${currentPhase.title}` : (isAllCoreDone ? 'Все 6 базовых фаз пройдены' : 'Не начато');
  const summary: DiagnosticSummary = {
    overview: `Курс: ${corePhasesCompleted}/${corePhasesTotal} базовых фаз завершено. Сохранено FSRS карточек: ${cards.length} (${dueCount} доступно к повторению). Сессий с ReviewLog: ${dailyPractice.totalSessions}; в отчёт включено последних: ${dailyPractice.recentSessionsIncluded}. Обнаружено потенциальных предупреждений: ${potentialIssues.length}.`,
    coreCurriculumProgress: `${corePhasesCompleted} / ${corePhasesTotal} фаз (${Math.round((corePhasesCompleted / corePhasesTotal) * 100)}%)`,
    activePhase: activePhaseTitle,
    dailyPracticeSummary: `Сохранено карточек: ${cards.length}, доступно к повторению: ${dueCount}, просрочено (>1 дня): ${overdueCount}`,
    potentialIssues
  };

  // 13. Meta
  const envMeta = params.environmentMeta || {};
  const meta: DiagnosticMeta = {
    appVersion: `Piano Key Trainer v${APP_VERSION}`,
    buildVersion: envMeta.buildVersion || APP_VERSION,
    schemaVersion: envMeta.schemaVersion || 1,
    diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    browser: envMeta.browser || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js / Test'),
    platform: envMeta.platform || (typeof navigator !== 'undefined' ? navigator.platform : 'Unknown'),
    screenSize: envMeta.screenSize || (typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '1920x1080'),
    storageVersion: envMeta.storageVersion || 2
  };

  return {
    diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    meta,
    summary,
    curriculum,
    learningProgress,
    fsrs,
    dailyPractice,
    reviewHistory,
    schedulerTrace,
    remediation,
    bottlenecks,
    storageConsistency,
    integrityChecks
  };
}

export function generateDiagnosticsMarkdownSummary(snapshot: DiagnosticExport): string {
  const { meta, summary, curriculum, fsrs, dailyPractice, bottlenecks, storageConsistency, integrityChecks } = snapshot;

  const lines: string[] = [];

  lines.push(`# Диагностический отчёт Piano Key Trainer`);
  lines.push(`*Экспортировано:* ${meta.exportedAt}`);
  lines.push(`*Версия приложения:* ${meta.appVersion} (Схема: v${meta.diagnosticsSchemaVersion})`);
  lines.push(`*Платформа:* ${meta.platform} | ${meta.screenSize}`);
  lines.push('');

  lines.push(`## 1. Сводка состояния`);
  lines.push(`- **Прогресс базового курса:** ${summary.coreCurriculumProgress}`);
  lines.push(`- **Текущая фаза:** ${summary.activePhase}`);
  lines.push(`- **FSRS карточки:** ${fsrs.totalCards} всего, **${fsrs.dueCount}** due, **${fsrs.overdueCount}** overdue`);
  lines.push(`- **Сессий с ReviewLog:** ${dailyPractice.totalSessions} всего`);
  lines.push(`- **Недавних сессий в этом отчёте:** ${dailyPractice.recentSessionsIncluded} (лимит ${dailyPractice.recentSessionLimit})`);
  lines.push('');

  if (summary.potentialIssues.length > 0) {
    lines.push(`### ⚠️ Предупреждения и потенциальные проблемы (${summary.potentialIssues.length}):`);
    for (const issue of summary.potentialIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  lines.push(`## 2. Учебный план (Curriculum State)`);
  lines.push(`| Фаза | Название | Статус | Raw завершение | Нормализованное завершение | Требования | Причина нормализации |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const [id, phase] of Object.entries(curriculum.coreCourse)) {
    const statusIcon = phase.completed ? '✅ Завершена' : phase.current ? '🔄 Текущая' : phase.locked ? '🔒 Закрыта' : '⏳ Доступна';
    const reason = phase.normalizationReason ? `*${phase.normalizationReason}*` : '—';
    lines.push(`| ${id} | ${phase.title} | ${statusIcon} | ${phase.rawCompletion ? 'да' : 'нет'} | ${phase.normalizedCompletion ? 'да' : 'нет'} | ${phase.requirementsMet}/${phase.requirementsTotal} | ${reason} |`);
  }
  lines.push('');

  lines.push(`### Продвинутые модули:`);
  for (const [, mod] of Object.entries(curriculum.advancedModules)) {
    const modStatus = mod.status === 'completed'
      ? '✅ Завершён'
      : mod.status === 'in_progress'
        ? '🔄 В процессе'
        : mod.status === 'available'
          ? '🟢 Доступен'
          : '🔒 Закрыт';
    lines.push(`- **${mod.title}**: ${modStatus}; можно начать: ${mod.available ? 'да' : 'нет'}`);
  }
  lines.push('');

  lines.push(`## 3. Flashcards & FSRS метрики`);
  lines.push(`Распределение карточек по навыкам:`);
  for (const [skill, count] of Object.entries(fsrs.bySkill)) {
    lines.push(`- **${skill}**: ${count} карточек`);
  }
  lines.push('');

  lines.push(`## 4. Заторы и проблемные навыки (Learning Bottlenecks)`);
  if (bottlenecks.stalledSkills.length > 0) {
    lines.push(`### 🛑 Заторможенные навыки:`);
    for (const s of bottlenecks.stalledSkills) {
      lines.push(`- **${s.skill}**: попыток: ${s.attempts}, точность 1-й попытки: ${s.firstAttemptAccuracy}%, срывов (lapses): ${s.lapses}. ${s.warning}`);
    }
    lines.push('');
  }

  if (bottlenecks.highestLapseCards.length > 0) {
    lines.push(`### Карточки с наибольшим числом срывов:`);
    for (const c of bottlenecks.highestLapseCards.slice(0, 5)) {
      lines.push(`- ${c.skill}:${c.note} (${c.lapses} срывов)`);
    }
    lines.push('');
  }

  lines.push(`## 5. Daily Practice и разнообразие заданий`);
  lines.push(`- **Последние задания:** ${dailyPractice.recentTasks.length}`);
  lines.push(`- **Уникальных навыков в сессии:** ${dailyPractice.diversity.uniqueSkills}`);
  lines.push(`- **Макс. серия одного навыка подряд:** ${dailyPractice.diversity.maxSameSkillStreak}`);
  lines.push(`- **Макс. серия одной карточки подряд:** ${dailyPractice.diversity.maxSameCardStreak}`);
  lines.push('');

  lines.push(`## 6. Проверка целостности данных`);
  lines.push(`- Дубликатов карточек: ${storageConsistency.checks.duplicateCards.length}`);
  lines.push(`- Карточек с некорректными датами: ${storageConsistency.checks.invalidDueDates.length}`);
  lines.push(`- Событий с некорректным временем: ${storageConsistency.checks.invalidReviewTimestamps.length}`);
  lines.push(`- Неизвестных навыков: ${storageConsistency.checks.unknownSkillIds.length}`);
  lines.push(`- Рассинхронизаций программы: ${storageConsistency.checks.curriculumContradictions.length}`);
  lines.push(`- Всплесков ReviewLog с разными сессиями: ${integrityChecks.duplicateReviewBurst.length}`);
  lines.push(`- Подозрительных ответов после начала другой сессии: ${integrityChecks.staleSessionHandlerSuspected.length}`);
  lines.push(`- Новых карточек, отмеченных overdue: ${integrityChecks.newCardMarkedOverdue.length}`);
  lines.push(`- Расхождений завершения модулей: ${integrityChecks.moduleCompletionMismatch.length}`);
  lines.push(`- Расхождений доступности модулей: ${integrityChecks.availabilityMismatch.length}`);
  lines.push(`- Предупреждений о доминировании fallback: ${integrityChecks.fallbackDominance.length}`);
  lines.push(`- Серий навыков длиннее двух: ${integrityChecks.excessiveSkillStreak.length}`);
  lines.push(`- Применённых нормализаций программы: ${integrityChecks.curriculumNormalizationApplied.length}`);
  lines.push(`- Повторных выборов planned review без review transition: ${integrityChecks.schedulerReselectionWithoutReview.length}`);
  lines.push(`- Дублирующих активаций задания: ${integrityChecks.duplicateTaskActivation.length}`);
  lines.push('');

  lines.push(`---`);
  lines.push(`*Отчёт сгенерирован автоматически локальной подсистемой диагностики Piano Key Trainer.*`);

  return lines.join('\n');
}

export function downloadDiagnosticsFile(filename: string, content: string, mimeType: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
