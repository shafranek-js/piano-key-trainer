<script lang="ts">
  import { NATURAL_NOTES, ALL_NOTES, SHORT_NAMES } from '../../core/fsrs/constants';
  import { retrievability, isMastered } from '../../core/fsrs/fsrs6';
  import type { Card, NoteName, UserSettings } from '../../core/fsrs/types';

  let {
    cardsMap = new Map<string, Card>(),
    settings = {} as UserSettings,
    reviewLogLength = 0,
    level = 'white' as 'white' | 'all',
    onExport,
    onImport,
    onReset
  } = $props();

  const notes = $derived(level === 'white' ? NATURAL_NOTES : ALL_NOTES);

  function getCard(skill: string, note: string): Card | undefined {
    return cardsMap.get(`${skill}:${note}`);
  }

  function formatMemory(c?: Card) {
    if (!c || c.reps === 0) return { r: '—', s: '—' };
    const r = retrievability(c);
    const s = c.stability ?? 0;
    return {
      r: r == null ? '—' : `${Math.round(r * 100)}%`,
      s: s < 1 ? `${Math.round(s * 24)}ч` : `${Math.round(s)}д`
    };
  }

  function noteProgressPct(note: NoteName): number {
    const f = getCard('find', note);
    const i = getCard('identify', note);
    const cards = [f, i].filter((c): c is Card => !!c && c.reps > 0);
    if (!cards.length) return 0;
    const s = Math.min(...cards.map(c => c.stability || 0));
    return Math.min(100, Math.max(0, Math.round((Math.log10(s + 1) / Math.log10(31)) * 100)));
  }

  let fileInputEl: HTMLInputElement;
</script>

<div class="page-heading">
  <div>
    <h2>Прогресс и память</h2>
    <p>Долговременное состояние памяти по каждой ноте и отдельным навыкам.</p>
  </div>
</div>

<section class="card">
  <h2>Память по нотам <span class="pill">D / S / R</span></h2>
  <div class="memory-grid">
    {#each notes as note (note)}
      {@const f = getCard('find', note)}
      {@const i = getCard('identify', note)}
      {@const n = getCard('notationToKey', note)}
      {@const a = getCard('soundToKey', note)}
      {@const fm = formatMemory(f)}
      {@const im = formatMemory(i)}
      {@const nm = formatMemory(n)}
      {@const am = formatMemory(a)}
      {@const pct = noteProgressPct(note)}

      <div class="memory-note">
        <div class="head">
          <b>{SHORT_NAMES[note]}</b>
          <span class="status">
            {#if (f?.reps || 0) + (i?.reps || 0) === 0}
              новая
            {:else if f && isMastered(f) && i && isMastered(i)}
              закреплена
            {:else}
              изучается
            {/if}
          </span>
        </div>
        <div class="memory-row"><span>Найти</span><span>R {fm.r} · S {fm.s}</span></div>
        <div class="memory-row"><span>Назвать</span><span>R {im.r} · S {im.s}</span></div>
        {#if n}
          <div class="memory-row"><span>Ноты</span><span>R {nm.r} · S {nm.s}</span></div>
        {/if}
        {#if a}
          <div class="memory-row"><span>Слух</span><span>R {am.r} · S {am.s}</span></div>
        {/if}
        <div class="meter"><i style="width:{pct}%"></i></div>
      </div>
    {/each}
  </div>

  <div class="footer-row" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
    <div>
      <div class="tiny">FSRS-6 · retention {Math.round((settings.desiredRetention || 0.9) * 100)}% · журнал: {reviewLogLength} событий.</div>
      <div class="tiny audio-credit">Piano samples: Salamander Grand Piano (Yamaha C5), Alexander Holm · CC BY 3.0.</div>
    </div>
    <div class="footer-actions" style="display: flex; gap: 8px;">
      <button type="button" class="btn" onclick={() => onExport?.()}>Экспорт</button>
      <button type="button" class="btn" onclick={() => fileInputEl?.click()}>Импорт</button>
      <button type="button" class="btn warn" onclick={() => onReset?.()}>Сброс</button>
      <input
        type="file"
        accept="application/json,.json"
        style="display:none"
        bind:this={fileInputEl}
        onchange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) onImport?.(file);
        }}
      />
    </div>
  </div>
</section>
