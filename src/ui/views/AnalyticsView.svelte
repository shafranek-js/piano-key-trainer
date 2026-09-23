<script lang="ts">
  import type { ReviewLogEvent } from '../../core/fsrs/types';
  import { SKILL_NAMES } from '../../core/fsrs/constants';
  import { quantile, mean } from '../../core/fsrs/math';

  let {
    reviewLogs = [] as ReviewLogEvent[]
  } = $props();

  const scheduledEvents = $derived(reviewLogs.filter(e => e.kind === 'scheduled'));
  const cleanEvents = $derived(reviewLogs.filter(e => e.firstCorrect && !e.hintUsed && Number.isFinite(e.responseMs)));
  const medianReaction = $derived(cleanEvents.length ? quantile(cleanEvents.map(e => e.responseMs), 0.5) : null);
  const errorCount = $derived(reviewLogs.filter(e => e.firstCorrect === false).length);

  function formatTime(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${Math.round(ms)} мс`;
    return `${(ms / 1000).toFixed(1)} с`;
  }
</script>

<div class="page-heading">
  <div>
    <h2>Долгосрочная аналитика</h2>
    <p>Динамика памяти, скорости и путаниц. История только анализируется — расписание FSRS не меняется.</p>
  </div>
</div>

<div class="analytics-hero">
  <div class="analytics-metric">
    <small>Scheduled reviews</small>
    <b>{scheduledEvents.length}</b>
    <span>Реальные плановые проверки.</span>
  </div>
  <div class="analytics-metric">
    <small>Median reaction</small>
    <b>{formatTime(medianReaction)}</b>
    <span>Чистые правильные ответы.</span>
  </div>
  <div class="analytics-metric">
    <small>Ошибок 1-й попытки</small>
    <b>{errorCount}</b>
    <span>Материал для матрицы путаниц.</span>
  </div>
  <div class="analytics-metric">
    <small>Всего событий</small>
    <b>{reviewLogs.length}</b>
    <span>Журнал практики в базе данных.</span>
  </div>
</div>

<div class="analytics-grid" style="margin-top: 14px;">
  <section class="card analytics-card">
    <h2>Retention по навыкам</h2>
    <div class="analytics-sub">Фактический recall и медианное время отклика по отдельным модальностям.</div>
    <div class="analytics-table">
      <div class="analytics-row header">
        <span>Навык</span>
        <span>Проверок</span>
        <span>Recall</span>
      </div>
      {#each ['find', 'identify', 'patternIdentify', 'notationToKey', 'soundToKey'] as skill}
        {@const ev = scheduledEvents.filter(e => e.skill === skill)}
        {@const recall = ev.length ? mean(ev.map(e => e.firstCorrect ? 1 : 0)) : null}
        <div class="analytics-row">
          <b>{SKILL_NAMES[skill as keyof typeof SKILL_NAMES] || skill}</b>
          <span>{ev.length}</span>
          <span>{recall != null ? `${Math.round(recall * 100)}%` : '—'}</span>
        </div>
      {/each}
    </div>
  </section>
</div>
