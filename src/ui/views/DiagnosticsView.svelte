<script lang="ts">
  import { onMount } from 'svelte';
  import type { ColdTestRecord } from '../../storage/db';
  import type { ReviewLogEvent, Card, UserSettings } from '../../core/fsrs/types';
  import type { LearningProgressRecord } from '../../core/learning/types';
  import { NATURAL_NOTES, ALL_NOTES, SHORT_NAMES } from '../../core/fsrs/constants';
  import {
    buildDiagnosticSnapshot,
    generateDiagnosticsMarkdownSummary,
    downloadDiagnosticsFile
  } from '../../core/diagnostics/buildDiagnosticSnapshot';
  import { getSchedulerDiagnostics } from '../../core/diagnostics/schedulerTracker';
  import { latencyDiagnosticsSummary } from '../../core/fsrs/responseTiming';
  import type { PersistenceDiagnosticEntry, StorageWriteFailure } from '../../core/fsrs/persistenceDiagnostics';
  import { db, DB_SCHEMA_VERSION } from '../../storage/db';
  import { BACKUP_SCHEMA_VERSION } from '../../storage/backup';

  let {
    coldTests = [] as ColdTestRecord[],
    reviewLogs = [] as ReviewLogEvent[],
    cards = [] as Card[],
    learningProgressMap = new Map<string, LearningProgressRecord>(),
    settings = undefined as UserSettings | undefined,
    advancedModulesStatus = undefined as any,
    advancedModuleAvailability = undefined as any,
    level = 'white' as 'white' | 'all',
    persistenceDiagnostics = [] as PersistenceDiagnosticEntry[],
    storageWriteFailures = [] as StorageWriteFailure[]
  } = $props();

  const latencySummary = $derived(latencyDiagnosticsSummary(reviewLogs));
  const persistenceStatusCounts = $derived({
    persisted: persistenceDiagnostics.filter(entry => entry.commitStatus === 'persisted').length,
    duplicateRejected: persistenceDiagnostics.filter(entry => entry.commitStatus === 'duplicate_rejected').length,
    failed: persistenceDiagnostics.filter(entry => entry.commitStatus === 'failed' || entry.commitStatus === 'retry_failed').length,
    retried: persistenceDiagnostics.filter(entry => entry.commitStatus === 'retry_succeeded').length
  });

  let exportFeedback = $state<string | null>(null);
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  const notes = $derived(level === 'white' ? NATURAL_NOTES : ALL_NOTES);

  function createSnapshot() {
    return buildDiagnosticSnapshot({
      cards,
      learningProgress: learningProgressMap,
      reviewLogs,
      settings,
      environmentMeta: {
        storageSchemaVersion: db.verno || DB_SCHEMA_VERSION,
        backupSchemaVersion: BACKUP_SCHEMA_VERSION
      },
      persistenceDiagnostics,
      storageWriteFailures,
      advancedModulesStatus,
      advancedModuleAvailability,
      schedulerDiagnostics: getSchedulerDiagnostics()
    });
  }

  function moduleStatusLabel(status: string): string {
    return status === 'completed' ? 'Завершён' : status === 'in_progress' ? 'В процессе' : status === 'available' ? 'Доступен' : 'Закрыт';
  }

  // The scheduler trace is an in-memory ring buffer, so read it afresh for every export.
  const liveSnapshot = $derived.by(createSnapshot);

  function showFeedback(msg: string) {
    exportFeedback = msg;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      exportFeedback = null;
    }, 4500);
  }

  function handleDownloadJson() {
    const snapshot = createSnapshot();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `piano-key-trainer-diagnostics-${dateStr}.json`;
    const jsonStr = JSON.stringify(snapshot, null, 2);
    downloadDiagnosticsFile(filename, jsonStr, 'application/json');
    showFeedback(`✅ Отчёт сохранён: ${filename} (${(jsonStr.length / 1024).toFixed(1)} КБ)`);
  }

  function handleDownloadMarkdown() {
    const snapshot = createSnapshot();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `piano-key-trainer-diagnostics-${dateStr}.md`;
    const mdStr = generateDiagnosticsMarkdownSummary(snapshot);
    downloadDiagnosticsFile(filename, mdStr, 'text/markdown');
    showFeedback(`✅ Сводка сохранена: ${filename}`);
  }

  // Calculate confusion pairs from review logs
  function getConfusionStats() {    const matrix: Record<string, Record<string, number>> = {};
    notes.forEach(p => {
      matrix[p] = {};
      notes.forEach(a => { matrix[p][a] = 0; });
    });

    reviewLogs.forEach(e => {
      if (!e.firstCorrect && e.note && e.answer && matrix[e.note] && matrix[e.note][e.answer] !== undefined) {
        matrix[e.note][e.answer]++;
      }
    });

    return matrix;
  }

  const confusionMatrix = $derived(getConfusionStats());

  onMount(() => {
    const debugWindow = window as unknown as { __getDiagnosticsSnapshot?: () => unknown };
    debugWindow.__getDiagnosticsSnapshot = () => createSnapshot();
    return () => {
      delete debugWindow.__getDiagnosticsSnapshot;
    };
  });
</script>

<div class="page-heading">
  <div>
    <h2>Диагностика</h2>
    <p>Независимые проверки, аудит целостности программы и экспорт диагностических данных.</p>
  </div>
</div>

<section class="card diagnostic-export-card">
  <div class="diagnostic-export-header">
    <div class="diagnostic-export-badge">Snapshot</div>
    <div>
      <h2 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        Диагностические данные
        <span class="pill" style="font-size: 10.5px; padding: 2px 7px;">FSRS & Программа</span>
      </h2>
      <p class="diagnostic-export-desc">
        Экспорт полного снимка состояния обучения: прогресс учебного курса, здоровье FSRS-карточек,
        история ответов и путаниц, причины выбора заданий планировщиком и аудит целостности данных.
      </p>
    </div>
  </div>

  <div class="diagnostic-stats-strip">
    <div class="diagnostic-stat-item">
      <small>Базовый курс</small>
      <b>{liveSnapshot.curriculum.corePhasesCompleted} / {liveSnapshot.curriculum.corePhasesTotal} фаз</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>FSRS Карточки</small>
      <b>{liveSnapshot.fsrs.totalCards} · {liveSnapshot.fsrs.dueCount} due · {liveSnapshot.fsrs.overdueCount} просрочено</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Журнал ответов</small>
      <b>{liveSnapshot.reviewHistory.recentEventsCount} событий</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Целостность данных</small>
      <b class={liveSnapshot.storageConsistency.warnings.length > 0 ? 'text-warn' : 'text-ok'}>
        {liveSnapshot.storageConsistency.warnings.length > 0
          ? `${liveSnapshot.storageConsistency.warnings.length} зам.`
          : 'Ошибок нет'}
      </b>
    </div>
  </div>

  <div class="diagnostic-integrity-strip" aria-label="Проверки сессий и разнообразия">
    <div class="diagnostic-stat-item">
      <small>Сессии с журналом</small>
      <b>{liveSnapshot.dailyPractice.totalSessions} всего · {liveSnapshot.dailyPractice.recentSessionsIncluded} в отчёте</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Последние 20 заданий</small>
      <b>{liveSnapshot.dailyPractice.diversity.uniqueSkills} навыка · серия навыка {liveSnapshot.dailyPractice.diversity.maxSameSkillStreak} · карточки {liveSnapshot.dailyPractice.diversity.maxSameCardStreak}</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>История ввода</small>
      <b class={liveSnapshot.integrityChecks.duplicateReviewBurst.length || liveSnapshot.integrityChecks.staleSessionHandlerSuspected.length ? 'text-warn' : 'text-ok'}>
        {liveSnapshot.integrityChecks.duplicateReviewBurst.length} всплеска · {liveSnapshot.integrityChecks.staleSessionHandlerSuspected.length} поздних событий
      </b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Состояние модулей</small>
      <b class={liveSnapshot.integrityChecks.moduleCompletionMismatch.length || liveSnapshot.integrityChecks.availabilityMismatch.length ? 'text-warn' : 'text-ok'}>
        {liveSnapshot.integrityChecks.moduleCompletionMismatch.length} статусов · {liveSnapshot.integrityChecks.availabilityMismatch.length} доступности
      </b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Трасса планировщика</small>
      <b class={liveSnapshot.schedulerTrace.warnings.length ? 'text-warn' : 'text-ok'}>
        {liveSnapshot.schedulerTrace.recentTraces.length} активаций · {liveSnapshot.schedulerTrace.reviewTransitions.length} переходов · {liveSnapshot.schedulerTrace.warnings.length} предупреждений
      </b>
    </div>
  </div>

  <div class="diagnostic-integrity-strip" data-testid="diagnostic-persistence" aria-label="Persistence и latency диагностика">
    <div class="diagnostic-stat-item">
      <small>Latency: measured / not_measured / legacy</small>
      <b>{latencySummary.measuredSamples} · {latencySummary.excludedNotMeasured} · {latencySummary.excludedLegacyUnknown}</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>P30 / P85 · только measured</small>
      <b>
        {latencySummary.p30 != null ? `${(latencySummary.p30 / 1000).toFixed(1)} с` : '—'}
        /
        {latencySummary.p85 != null ? `${(latencySummary.p85 / 1000).toFixed(1)} с` : '—'}
      </b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Review commits</small>
      <b class={persistenceStatusCounts.failed > 0 ? 'text-warn' : 'text-ok'}>
        {persistenceStatusCounts.persisted} saved · {persistenceStatusCounts.retried} retried · {persistenceStatusCounts.duplicateRejected} duplicate · {persistenceStatusCounts.failed} failed
      </b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Ошибки записи статистики</small>
      <b class={storageWriteFailures.length > 0 ? 'text-warn' : 'text-ok'}>{storageWriteFailures.length}</b>
    </div>
  </div>

  <div class="diagnostic-integrity-strip" data-testid="diagnostic-persistence-meta" aria-label="Persistence metadata">
    <div class="diagnostic-stat-item">
      <small>IndexedDB schema</small>
      <b>v{liveSnapshot.meta.storageSchemaVersion} · {liveSnapshot.persistence.reviewLogStore}</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Review identity</small>
      <b>{liveSnapshot.persistence.identityField}</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Review events</small>
      <b>{liveSnapshot.persistence.totalReviewEvents} · legacy {liveSnapshot.persistence.backfilledLegacyEvents}</b>
    </div>
    <div class="diagnostic-stat-item">
      <small>Backup / diagnostics schema</small>
      <b>v{liveSnapshot.meta.backupSchemaVersion} · v{liveSnapshot.meta.diagnosticsSchemaVersion}</b>
    </div>
  </div>

  {#if persistenceDiagnostics.length > 0}
    <div class="diagnostic-module-list" data-testid="diagnostic-persistence-log">
      <h3>Последние коммиты отзывов</h3>
      {#each persistenceDiagnostics.slice(-5).reverse() as entry (entry.at + ':' + entry.commitAttempt)}
        <div class="diagnostic-module-row">
          <strong>{entry.commitStatus}{entry.retryCount > 0 ? ` · retry ${entry.retryCount}` : ''}</strong>
          <span>{entry.reviewEventId ?? '—'} · {entry.cardId ?? '—'} · {entry.questionInstanceId ?? '—'}</span>
          <small>attempt {entry.commitAttempt}{entry.errorClass ? ` · ${entry.errorClass}` : ''}{entry.persistedAt ? ` · saved ${new Date(entry.persistedAt).toLocaleTimeString('ru-RU')}` : ''}</small>
        </div>
      {/each}
    </div>
  {/if}

  <div class="diagnostic-module-list" data-testid="diagnostic-roadmap">
    <h3>Учебный план · {liveSnapshot.roadmap.completedStages}/{liveSnapshot.roadmap.totalStages} этапов завершено</h3>
    {#each liveSnapshot.roadmap.stages as stage (stage.id)}
      <div class="diagnostic-module-row" data-roadmap-stage={stage.id}>
        <strong>{stage.order}. {stage.title}</strong>
        <span>{stage.statusLabelRu}{stage.isCurrent ? ' · текущий' : ''}</span>
        <small>{stage.progressSummary}</small>
      </div>
    {/each}
  </div>

  <div class="diagnostic-module-list" data-testid="diagnostic-advanced-modules">
    <h3>Продвинутые модули</h3>
    {#each Object.values(liveSnapshot.curriculum.advancedModules) as module (module.id)}
      <div class="diagnostic-module-row" data-diagnostic-module={module.id}>
        <strong>{module.title}</strong>
        <span>{moduleStatusLabel(module.status)} · можно начать: {module.available ? 'да' : 'нет'}</span>
        {#if module.activeStep}<small>Шаг: {module.activeStep}</small>{/if}
        {#if module.id === 'harmony' && module.trialsCompleted != null}
          <small>Перенос: {module.transferPhase ?? 'не начат'} · блок {module.transferBlockKind ?? '—'} · {module.trialsCompleted} из {module.trialsTotal} · точность {module.accuracy == null ? '—' : `${Math.round(module.accuracy * 100)}%`}</small>
          <small>Новые карточки: {module.harmonyCards?.length ?? 0} · доступны в Daily Practice: {module.harmonyCards?.filter(card => card.eligibleForDailyPractice).length ?? 0}</small>
          {#if module.learningGates}
            <small>Гейты retention · функции: {module.learningGates.functions} · следующий аккорд: {module.learningGates.nextChord} · игра цепочки: {module.learningGates.progressionPlay}</small>
          {/if}
          {#if module.harmonyCards?.length}
            <small>Состояние карточек: {module.harmonyCards.map(card => `${card.cardId}=${card.lifecycleClassification}`).join(' · ')}</small>
          {/if}
        {/if}
        {#if module.id === 'chordRhythm'}
          <small>Оценка: {module.transferPhase ?? 'не начата'} · блок {module.transferBlockKind ?? '—'} · {module.trialsCompleted ?? 0} проб · точность {module.accuracy == null ? '—' : `${Math.round(module.accuracy * 100)}%`}</small>
          {#if module.fsrsCards?.length}
            <small>FSRS карточки: {module.fsrsCards.map(card => `${card.cardId}=${card.lifecycleClassification}`).join(' · ')}</small>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <div class="diagnostic-export-actions">
    <button
      type="button"
      class="diagnostic-btn-primary"
      onclick={handleDownloadJson}
      data-testid="download-diagnostics-json"
    >
      <span class="icon">📥</span> Скачать отчёт (JSON)
    </button>
    <button
      type="button"
      class="diagnostic-btn-secondary"
      onclick={handleDownloadMarkdown}
      data-testid="download-diagnostics-md"
    >
      <span class="icon">📄</span> Скачать сводку (Markdown)
    </button>
  </div>

  {#if exportFeedback}
    <div class="diagnostic-feedback-banner">
      {exportFeedback}
    </div>
  {/if}
</section>

<section class="card cold-history-card" style="margin-top: 14px;">
  <h2>Cold Test · история <span class="pill">20 независимых заданий</span></h2>
  {#if !coldTests.length}
    <div class="cold-history-empty">Пройдите Cold Test из меню «Сессия», чтобы зафиксировать объективный baseline точности и скорости.</div>
  {:else}
    <div class="cold-history-list">
      {#each coldTests.slice(-5).reverse() as t (t.id)}
        <div class="cold-history-row">
          <div><small>Дата</small><b>{new Date(t.ts).toLocaleDateString('ru-RU')}</b></div>
          <div><small>Точность</small><b>{t.accuracy != null ? `${Math.round(t.accuracy * 100)}%` : '—'}</b></div>
          <div><small>Медиана</small><b>{t.medianMs != null ? `${(t.medianMs / 1000).toFixed(1)} с` : '—'}</b></div>
          <div><small>P75</small><b>{t.p75Ms != null ? `${(t.p75Ms / 1000).toFixed(1)} с` : '—'}</b></div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<section class="card confusion-card" style="margin-top: 14px;">
  <h2>Карта путаниц <span class="pill">Направленные ошибки первой попытки</span></h2>
  <div class="confusion-table-wrap">
    <table class="confusion-table" aria-label="Матрица путаниц">
      <thead>
        <tr>
          <th>Промпт ↓ / Ответ →</th>
          {#each notes as n}
            <th>{SHORT_NAMES[n]}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each notes as promptNote}
          <tr>
            <th>{SHORT_NAMES[promptNote]}</th>
            {#each notes as answerNote}
              {@const count = confusionMatrix[promptNote]?.[answerNote] || 0}
              <td class={promptNote === answerNote ? 'diag' : count > 0 ? 'hot' : ''}>
                {count > 0 ? count : '·'}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .diagnostic-export-card {
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 24px rgba(2, 6, 23, 0.4);
  }

  .diagnostic-export-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .diagnostic-export-badge {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 8px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .diagnostic-export-desc {
    color: #94a3b8;
    font-size: 12.5px;
    line-height: 1.45;
    margin: 4px 0 0 0;
  }

  .diagnostic-stats-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 12px;
    padding: 10px 14px;
  }

  .diagnostic-integrity-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    padding: 0 2px;
  }

  .diagnostic-module-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px; }
  .diagnostic-module-list h3 { grid-column: 1 / -1; margin: 0; color: #cbd5e1; font-size: 13px; }
  .diagnostic-module-row { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 9px 11px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 10px; background: rgba(15, 23, 42, 0.48); }
  .diagnostic-module-row strong { color: #e2e8f0; font-size: 12px; }
  .diagnostic-module-row span, .diagnostic-module-row small { color: #94a3b8; font-size: 11px; overflow-wrap: anywhere; }

  .diagnostic-stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .diagnostic-stat-item small {
    color: #94a3b8;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .diagnostic-stat-item b {
    color: #f1f5f9;
    font-size: 13.5px;
    font-weight: 700;
  }

  .text-ok {
    color: #4ade80 !important;
  }

  .text-warn {
    color: #fbbf24 !important;
  }

  .diagnostic-export-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .diagnostic-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    border: 1px solid rgba(125, 211, 252, 0.35);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    transition: all 0.15s ease;
  }

  .diagnostic-btn-primary:hover {
    background: linear-gradient(180deg, #0369a1 0%, #075985 100%);
    box-shadow: 0 6px 16px rgba(2, 132, 199, 0.45);
    transform: translateY(-1px);
  }

  .diagnostic-btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(30, 41, 59, 0.8);
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .diagnostic-btn-secondary:hover {
    background: rgba(51, 65, 85, 0.9);
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.4);
    transform: translateY(-1px);
  }

  .diagnostic-feedback-banner {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
    border-radius: 8px;
    font-size: 12px;
    padding: 7px 12px;
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 720px) {
    .diagnostic-stats-strip,
    .diagnostic-integrity-strip {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
