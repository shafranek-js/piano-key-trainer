<script lang="ts">
  import {
    HARMONY_CHORDS,
    type HarmonyChordId
  } from '../../core/learning/harmony';

  let {
    chords = [] as readonly HarmonyChordId[],
    currentIndex = -1,
    completed = false,
    showFunctions = true,
    showBass = false,
    title = ''
  }: {
    chords?: readonly HarmonyChordId[];
    currentIndex?: number;
    completed?: boolean;
    showFunctions?: boolean;
    showBass?: boolean;
    title?: string;
  } = $props();
</script>

{#if title}<h3 class="progression-heading">{title}</h3>{/if}
<div class="harmony-progression" role="list" aria-label="Гармоническая последовательность" data-testid="harmony-progression">
  {#each chords as chordId, index (index)}
    {@const chord = HARMONY_CHORDS[chordId]}
    {@const isDone = completed || (currentIndex >= 0 && index < currentIndex)}
    {@const isCurrent = !completed && currentIndex === index}
    <div class="progression-part">
      {#if index > 0}<span class="progression-arrow" aria-hidden="true">→</span>{/if}
      <div
        class="progression-chord {isDone ? 'is-done' : ''} {isCurrent ? 'is-current' : ''}"
        class:upcoming={!isDone && !isCurrent}
        role="listitem"
        aria-current={isCurrent ? 'step' : undefined}
        data-chord={chordId}
      >
        <strong>{chord.symbol}</strong>
        {#if showFunctions}<span class="chord-function">{chord.functionId}</span>{/if}
        {#if showBass}<span class="chord-bass">бас {chord.bassKeyId.replace(/[0-9]/g, '')}</span>{/if}
        {#if isDone}<span class="chord-check" aria-label="Сыграно">✓</span>{/if}
        {#if isCurrent}<span class="chord-now">СЕЙЧАС</span>{/if}
      </div>
    </div>
  {/each}
</div>
{#if currentIndex >= 0 && !completed}
  <div class="progression-position">{Math.min(currentIndex + 1, chords.length)} из {chords.length}</div>
{/if}

<style>
  .progression-heading { margin: 8px 0 12px; text-align: center; }
  .harmony-progression { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .progression-part { display: inline-flex; align-items: center; gap: 8px; }
  .progression-arrow { color: #94a3b8; font-size: 1.15rem; }
  .progression-chord { position: relative; min-width: 70px; min-height: 56px; box-sizing: border-box; padding: 8px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 1px solid #334155; border-radius: 12px; background: rgba(15, 23, 42, .84); color: #e2e8f0; }
  .progression-chord strong { font-size: 1.05rem; line-height: 1.1; }
  .progression-chord.is-done { border-color: rgba(74, 222, 128, .55); background: rgba(34, 197, 94, .12); color: #bbf7d0; }
  .progression-chord.is-current { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, .2), 0 0 18px rgba(56, 189, 248, .2); color: #fff; }
  .progression-chord.upcoming { opacity: .76; }
  .chord-function, .chord-bass { color: #94a3b8; font-size: .72rem; }
  .chord-check { position: absolute; top: 3px; right: 7px; font-size: .75rem; color: #4ade80; }
  .chord-now { color: #7dd3fc; font-size: .62rem; font-weight: 800; letter-spacing: .04em; }
  .progression-position { margin-top: 9px; color: #7dd3fc; text-align: center; font-size: .82rem; font-weight: 700; }
</style>
