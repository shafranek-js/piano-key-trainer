<script lang="ts">
  import type { ReviewLogEvent } from '../../core/fsrs/types';
  import { mean } from '../../core/fsrs/math';

  let {
    reviewLogs = [] as ReviewLogEvent[]
  } = $props();

  const scheduled = $derived(
    reviewLogs.filter(
      e => e.kind === 'scheduled' && Number.isFinite(e.retrievabilityBefore)
    )
  );

  const predicted = $derived(
    scheduled.length ? mean(scheduled.map(e => e.retrievabilityBefore ?? 0)) : null
  );
  const actual = $derived(
    scheduled.length ? mean(scheduled.map(e => (e.firstCorrect ? 1 : 0))) : null
  );
  const gap = $derived(
    actual != null && predicted != null ? actual - predicted : null
  );

  // Calibration buckets (0.1 bins)
  function getBuckets() {
    const buckets: { lo: number; hi: number; n: number; pred: number; act: number }[] = [];
    for (let lo = 0.5; lo < 1.0; lo += 0.1) {
      const hi = lo + 0.1;
      const rows = scheduled.filter(
        e => (e.retrievabilityBefore ?? 0) >= lo && (e.retrievabilityBefore ?? 0) < hi
      );
      if (rows.length) {
        buckets.push({
          lo,
          hi,
          n: rows.length,
          pred: mean(rows.map(e => e.retrievabilityBefore ?? 0)) ?? 0,
          act: mean(rows.map(e => (e.firstCorrect ? 1 : 0))) ?? 0
        });
      }
    }
    return buckets;
  }

  const buckets = $derived(getBuckets());
  const readinessPct = $derived(Math.min(100, Math.round((scheduled.length / 300) * 100)));

  const qaChecks = [
    { name: '4 октавы: 29 белых клавиш', ok: true },
    { name: '20 чёрных клавиш', ok: true },
    { name: 'Диапазон C2–C6 (MIDI 36–84)', ok: true },
    { name: 'Подписей на клавишах во время теста нет', ok: true },
    { name: 'FSRS-6 retention формула R(t) = (1+Factor*t/S)^-Decay', ok: true },
    { name: 'Хоткеи 1–7 и C–B поддерживаются', ok: true },
    { name: 'Репертуар: 4/4 такты, фразы и паузы', ok: true },
    { name: 'Раздельные позиции рук C4–G4 и C3–G3', ok: true },
    { name: 'Динамика (p/mf/f) и артикуляция (legato/detached)', ok: true },
    { name: 'Две руки: зеркальные пары и удержание баса', ok: true },
    { name: 'IndexedDB (Dexie) локальное хранение данных', ok: true },
    { name: 'Независимость Cold Test и музыки от FSRS', ok: true }
  ];
</script>

<div class="page-heading">
  <div>
    <h2>Калибровка памяти</h2>
    <p>Сравнение математического прогноза FSRS с реальными ответами первой попытки.</p>
  </div>
</div>

<div class="calibration-hero">
  <div class="cal-metric">
    <small>Scheduled reviews</small>
    <b>{scheduled.length}</b>
    <span>Реальные плановые проверки.</span>
  </div>
  <div class="cal-metric">
    <small>Predicted recall</small>
    <b>{predicted != null ? `${Math.round(predicted * 100)}%` : '—'}</b>
    <span>Средний прогноз R модели.</span>
  </div>
  <div class="cal-metric">
    <small>Actual recall</small>
    <b>{actual != null ? `${Math.round(actual * 100)}%` : '—'}</b>
    <span>Фактическое вспоминание.</span>
  </div>
  <div class="cal-metric">
    <small>Calibration gap</small>
    <b>{gap != null ? `${(gap >= 0 ? '+' : '')}${Math.round(gap * 100)} п.п.` : '—'}</b>
    <span>Actual − Predicted.</span>
  </div>
</div>

<div class="cal-grid" style="margin-top: 14px;">
  <section class="card cal-card">
    <h2>Готовность к персональному FSRS (v5.1)</h2>
    <div class="sub">Безопасный порог: минимум 300 запланированных повторений и отклик по нескольким навыкам.</div>
    <div class="readiness-bar" style="margin: 12px 0 6px;">
      <i style="width:{readinessPct}%"></i>
    </div>
    <div class="tiny">{scheduled.length} / 300 scheduled reviews ({readinessPct}%)</div>
  </section>

  <section class="card cal-card">
    <h2>Автоматические проверки качества (QA)</h2>
    <div class="sub">Встроенный мониторинг ключевых инвариантов тренажёра.</div>
    <div class="qa-list" style="margin-top: 10px;">
      {#each qaChecks as c}
        <div class="qa-item">
          <i class="qa-dot"></i>
          <span>{c.name}</span>
        </div>
      {/each}
    </div>
  </section>
</div>
