<script lang="ts">
  import type { NoteName } from '../../core/fsrs/types';

  let {
    keyId = 'C4' as string,
    mode = 'single' as 'single' | 'repertoire',
    repertoireSong = null as any,
    currentNoteIndex = 0,
    isCompleted = false
  } = $props();

  // Y-coordinate calculation for treble clef
  function staffYForKeyId(id: string): number {
    const m = /^([A-G])(4)$/.exec(id || '');
    if (!m) return 64;
    const order: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    return 112 - (order[m[1]] ?? 0) * 8;
  }

  function diatonicY(id: string): number {
    const m = /^([A-G])(#?)(\d)$/.exec(id || '');
    if (!m) return 64;
    const order: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    const idx = Number(m[3]) * 7 + order[m[1]];
    const e4 = 4 * 7 + 2;
    return 96 - (idx - e4) * 8;
  }
</script>

{#if mode === 'single'}
  {@const y = staffYForKeyId(keyId)}
  {@const stemUp = y >= 64}
  <div class="notation-wrap">
    <div class="notation-card">
      <svg class="notation-svg" viewBox="0 0 300 140" role="img" aria-label="Нота на скрипичном стане">
        <text class="clef" x="24" y="101">&#119070;</text>
        {#each [32, 48, 64, 80, 96] as lineY}
          <line class="staff" x1="92" x2="278" y1={lineY} y2={lineY} />
        {/each}
        {#if y >= 108}
          <line class="ledger" x1="119" x2="153" y1={y} y2={y} />
        {/if}
        <ellipse class="notehead" cx="135" cy={y} rx="10" ry="6.5" transform="rotate(-18 135 {y})" />
        {#if stemUp}
          <line class="stem" x1="143" y1={y} x2="143" y2={y - 44} />
        {:else}
          <line class="stem" x1="127" y1={y} x2="127" y2={y + 44} />
        {/if}
      </svg>
    </div>
    <div class="notation-caption">Скрипичный ключ · диапазон: C4–B4</div>
  </div>
{:else if repertoireSong}
  {@const measureW = 220}
  {@const left = 126}
  {@const measureCount = Math.max(1, Math.ceil(repertoireSong.notes.length / (repertoireSong.measureBeats || 4)))}
  {@const width = Math.max(820, left + measureCount * measureW + 22)}
  {@const height = 142}
  {@const curMeasure = Math.floor(currentNoteIndex / (repertoireSong.measureBeats || 4)) + 1}

  <svg class="repertoire-staff-svg phrase-staff" viewBox="0 0 {width} {height}" role="img" aria-label="Нотный стан мелодии 4/4">
    <text class="rep-clef" x="14" y="104">&#119070;</text>
    <g class="rep-time-signature">
      <text x="86" y="63">4</text>
      <text x="86" y="91">4</text>
    </g>

    <!-- Measure highlight -->
    {#if !isCompleted}
      <rect 
        class="rep-measure-highlight" 
        x={left + (curMeasure - 1) * measureW + 2} 
        y="24" 
        width={measureW - 4} 
        height="88" 
        rx="8" 
      />
    {/if}

    <!-- 5 staff lines -->
    {#each [36, 52, 68, 84, 100] as lineY}
      <line class="rep-staff-line" x1="72" x2={width - 14} y1={lineY} y2={lineY} />
    {/each}

    <!-- Bar lines -->
    {#each Array(measureCount + 1) as _, m}
      {@const x = left + m * measureW}
      <line class="rep-barline {m === 0 || m === measureCount ? 'edge' : ''}" x1={x} x2={x} y1="36" y2="100" />
    {/each}

    <!-- Notes -->
    {#each repertoireSong.notes as noteId, i}
      {@const m = Math.floor(i / (repertoireSong.measureBeats || 4))}
      {@const within = i % (repertoireSong.measureBeats || 4)}
      {@const x = left + m * measureW + 28 + (within / (repertoireSong.measureBeats || 4)) * (measureW - 52)}
      {@const y = diatonicY(noteId) + 4}
      {@const done = i < currentNoteIndex || isCompleted}
      {@const current = i === currentNoteIndex && !isCompleted}
      {@const stemUp = y > 68}
      {@const stemX = stemUp ? x + 8 : x - 8}

      <g class="rep-note {done ? 'done' : ''} {current ? 'current' : ''}">
        {#if current}
          <circle class="rep-note-halo" cx={x} cy={y} r="17" />
        {/if}
        {#if y >= 112}
          <line class="rep-ledger" x1={x - 13} x2={x + 13} y1="116" y2="116" />
        {/if}
        <ellipse class="rep-notehead" cx={x} cy={y} rx="8.5" ry="6" transform="rotate(-18 {x} {y})" fill="currentColor" />
        <line class="rep-stem" x1={stemX} x2={stemX} y1={y} y2={stemUp ? y - 32 : y + 32} />
      </g>
    {/each}
  </svg>
{/if}
