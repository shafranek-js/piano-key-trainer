<script lang="ts">
  import type { ColdTestRecord } from '../../storage/db';
  import type { ReviewLogEvent } from '../../core/fsrs/types';
  import { NATURAL_NOTES, ALL_NOTES, SHORT_NAMES } from '../../core/fsrs/constants';

  let {
    coldTests = [] as ColdTestRecord[],
    reviewLogs = [] as ReviewLogEvent[],
    level = 'white' as 'white' | 'all'
  } = $props();

  const notes = $derived(level === 'white' ? NATURAL_NOTES : ALL_NOTES);

  // Calculate confusion pairs from review logs
  function getConfusionStats() {
    const matrix: Record<string, Record<string, number>> = {};
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
</script>

<div class="page-heading">
  <div>
    <h2>Диагностика</h2>
    <p>Независимые проверки и анализ характерных ошибок. Результаты Cold Test не изменяют расписание FSRS.</p>
  </div>
</div>

<section class="card cold-history-card">
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
