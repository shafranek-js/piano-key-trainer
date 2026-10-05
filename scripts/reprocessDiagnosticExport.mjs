import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(process.argv[2] || 'C:/Users/pavel/Downloads/piano-key-trainer-diagnostics-2026-10-02.json');
const outputDir = path.join(projectDir, 'acceptance', 'stabilization');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const now = Date.parse(source.meta.exportedAt);
if (!Number.isFinite(now)) throw new Error('Source export has an invalid exportedAt timestamp.');

const server = await createServer({
  configFile: false,
  root: projectDir,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true }
});

try {
  const [{ DEFAULT_SETTINGS }, diagnostics] = await Promise.all([
    server.ssrLoadModule('/src/core/fsrs/constants.ts'),
    server.ssrLoadModule('/src/core/diagnostics/buildDiagnosticSnapshot.ts')
  ]);

  const cards = source.fsrs.cards.map(row => ({
    id: row.cardId,
    skill: row.skillType,
    note: row.note,
    memoryState: row.state,
    stability: row.stability > 0 ? row.stability : null,
    difficulty: row.difficulty > 0 ? row.difficulty : null,
    dueAt: row.due,
    lastReviewAt: row.lastReview ?? 0,
    firstSeenAt: row.lastReview ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    lastGrade: null,
    stats: {
      trials: row.reps,
      firstCorrect: 0,
      firstWrong: row.lapses,
      hints: 0,
      recentScheduledSuccesses: 0,
      scheduledSuccesses: row.reps,
      practiceTrials: 0
    }
  }));

  const learningProgress = Object.entries(source.learningProgress.records).map(([id, row]) => ({
    id,
    itemId: id,
    state: row.state,
    updatedAt: row.updatedAt,
    contexts: row.contexts ?? [],
    modelCompleted: row.modelCompleted ?? false,
    guidedSuccesses: row.guidedSuccesses ?? 0,
    independentUnhintedSuccesses: row.independentUnhintedSuccesses ?? 0
  }));

  const gradeNames = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
  const reviewLogs = source.reviewHistory.recentEvents.map(row => {
    const card = cards.find(item => item.id === row.cardId);
    return {
      ts: row.timestamp,
      sessionId: row.sessionId,
      cardId: row.cardId,
      note: card?.note ?? row.cardId.slice(row.cardId.indexOf(':') + 1),
      skill: row.skillType,
      kind: row.taskType,
      grade: row.grade ?? null,
      gradeName: row.grade == null ? null : gradeNames[row.grade] ?? null,
      firstCorrect: row.correct && row.firstAttempt,
      answer: row.answer ?? null,
      answerKeyId: null,
      attempts: row.firstAttempt ? 1 : 2,
      hintUsed: false,
      responseMs: row.responseTimeMs,
      elapsedDays: null,
      retrievabilityBefore: null,
      stabilityBefore: null,
      stabilityAfter: null,
      difficultyBefore: null,
      difficultyAfter: null,
      scheduledDays: null,
      schedulerReason: undefined
    };
  });

  const advancedModules = source.curriculum.advancedModules;
  const advancedModulesStatus = {
    bassGrandActiveStep: advancedModules.bassGrandStaff.activeStep,
    bassGrandStatus: advancedModules.bassGrandStaff.status,
    intervalActiveStep: advancedModules.intervals.activeStep,
    intervalStatus: advancedModules.intervals.status,
    triadActiveStep: advancedModules.triads.activeStep,
    triadStatus: advancedModules.triads.status,
    inversionActiveStep: advancedModules.chordInversions.activeStep,
    inversionStatus: advancedModules.chordInversions.status
  };
  const advancedModuleAvailability = {
    bassGrandStaff: advancedModules.bassGrandStaff.available,
    intervals: advancedModules.intervals.available,
    triads: advancedModules.triads.available,
    chordInversions: advancedModules.chordInversions.available
  };

  const snapshot = diagnostics.buildDiagnosticSnapshot({
    cards,
    learningProgress,
    reviewLogs,
    settings: DEFAULT_SETTINGS,
    schedulerTraces: source.schedulerTrace.recentTraces,
    activeRemediation: source.remediation.activeStates,
    advancedModulesStatus,
    advancedModuleAvailability,
    now,
    environmentMeta: {
      appVersion: source.meta.appVersion,
      buildVersion: source.meta.buildVersion,
      schemaVersion: source.meta.schemaVersion,
      browser: 'Reprocessed from user-supplied diagnostics export; original metadata retained in source file',
      platform: source.meta.platform,
      screenSize: source.meta.screenSize,
      storageVersion: source.meta.storageVersion
    }
  });

  const sourceFractionalDueCount = source.fsrs.cards.filter(row =>
    Number.isFinite(row.due) && !Number.isInteger(row.due)
  ).length;
  const sourceNewCards = source.fsrs.cards.filter(row => row.state === 'new' && row.reps === 0);
  const markdown = [
    '# Реальная диагностика после исправлений',
    '',
    `Источник: пользовательский экспорт от ${source.meta.exportedAt}; в этом файле обработаны все ${source.fsrs.cards.length} экспортированных карточек и последние ${source.reviewHistory.recentEvents.length} ReviewLog событий.`,
    '',
    `Экспорт содержит ${sourceNewCards.length} новых карточек с sentinel dueAt = 0 и ${sourceFractionalDueCount} конечных дробных dueAt. При повторной классификации: ${snapshot.fsrs.dueCount} карточек due, ${snapshot.fsrs.overdueCount} overdue, ${snapshot.storageConsistency.checks.invalidDueDates.length} некорректных dueAt и ${snapshot.integrityChecks.newCardMarkedOverdue.length} новых карточек ошибочно отмечены overdue.`,
    '',
    `Исторические предупреждения не удалялись и не переписывались: анализ ReviewLog выявил ${snapshot.integrityChecks.duplicateReviewBurst.length} всплесков и ${snapshot.integrityChecks.staleSessionHandlerSuspected.length} подозрительных событий из более ранних сессий в доступном окне из ${source.reviewHistory.recentEvents.length} событий. Исходное summary: ${source.summary.overview} Сам экспорт ограничивает ReviewLog последними 300 событиями.`,
    '',
    'Ограничения восстановления: диагностический JSON не содержит исходные настройки пользователя и полную историю ReviewLog. Для повторного расчёта использованы настройки приложения по умолчанию; агрегаты по сессиям и журналу относятся только к экспортированному окну. Исходный JSON и локальная база обучения не изменялись.',
    '',
    diagnostics.generateDiagnosticsMarkdownSummary(snapshot),
    ''
  ].join('\n');

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'diagnostics-after-fix.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'diagnostics-after-fix.md'), markdown, 'utf8');
  process.stdout.write(JSON.stringify({
    sourcePath,
    cards: cards.length,
    sourceNewCards: sourceNewCards.length,
    sourceFractionalDueCount,
    due: snapshot.fsrs.dueCount,
    overdue: snapshot.fsrs.overdueCount,
    invalidDueDates: snapshot.storageConsistency.checks.invalidDueDates.length,
    newCardsMarkedOverdue: snapshot.integrityChecks.newCardMarkedOverdue.length,
    duplicateBursts: snapshot.integrityChecks.duplicateReviewBurst.length,
    staleSessionWarnings: snapshot.integrityChecks.staleSessionHandlerSuspected.length,
    reviewEventsProcessed: reviewLogs.length,
    outputDir
  }, null, 2) + '\n');
} finally {
  await server.close();
}
