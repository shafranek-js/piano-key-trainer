<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    MIDI_MIN, 
    MIDI_MAX, 
    keyIdFromMidi, 
    pitchClassFromMidi, 
    freqFromMidi 
  } from '../../audio/types';
  import { DISPLAY_NAMES, SHORT_NAMES } from '../../core/fsrs/constants';
  import type { NoteName } from '../../core/fsrs/types';

  interface KeyData {
    id: string;
    note: NoteName;
    freq: number;
    type: 'white' | 'black';
    index: number; // index among white keys or anchor index for black key
  }

  // Pre-generate the 4-octave keyboard keys structure (29 white, 20 black)
  const whiteKeysData: KeyData[] = [];
  const blackKeysData: KeyData[] = [];

  let whiteIndex = 0;
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const note = pitchClassFromMidi(midi);
    const keyId = keyIdFromMidi(midi);
    const freq = Number(freqFromMidi(midi).toFixed(2));

    if (!note.includes('#')) {
      whiteKeysData.push({ id: keyId, note, freq, type: 'white', index: whiteIndex });
      const nextMidi = midi + 1;
      if (nextMidi <= MIDI_MAX) {
        const nextNote = pitchClassFromMidi(nextMidi);
        if (nextNote.includes('#')) {
          blackKeysData.push({
            id: keyIdFromMidi(nextMidi),
            note: nextNote,
            freq: Number(freqFromMidi(nextMidi).toFixed(2)),
            type: 'black',
            index: whiteIndex
          });
        }
      }
      whiteIndex++;
    }
  }

  const allKeys = [...whiteKeysData, ...blackKeysData];

  // Props using Svelte 5 runes
  let { 
    onKeyClick,
    targetKeyIds = [] as string[],
    correctKeyIds = [] as string[],
    wrongKeyIds = [] as string[],
    hintKeyIds = [] as string[],
    pulseCorrectKeyIds = [] as string[],
    midiActiveKeyIds = [] as string[],
    twoHandLeftTarget = null as string | null,
    twoHandRightTarget = null as string | null,
    fingerGuides = new Map<string, { finger: number; isTarget: boolean }>()
  } = $props();

  let keyboardEl = $state<HTMLElement | null>(null);
  let whiteWidth = $state(41);
  let blackWidth = $state(24);
  let totalWidth = $state(1200);

  function updateDimensions() {
    if (!keyboardEl) return;
    const available = Math.max(720, keyboardEl.parentElement?.clientWidth || 1200);
    totalWidth = available;
    const count = whiteKeysData.length; // 29
    whiteWidth = available / count;
    blackWidth = whiteWidth * 0.58;
  }

  onMount(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions, { passive: true });
    return () => window.removeEventListener('resize', updateDimensions);
  });

  function getKeyStyle(k: KeyData): string {
    if (k.type === 'white') {
      const left = k.index * whiteWidth;
      const width = whiteWidth + 0.35; // tiny overlap to prevent hairline gaps
      return `left:${left}px;width:${width}px;`;
    } else {
      const left = (k.index + 1) * whiteWidth - blackWidth / 2;
      return `left:${left}px;width:${blackWidth}px;`;
    }
  }

  function getKeyClasses(k: KeyData): string {
    const classes = ['key', k.type === 'white' ? 'white-key' : 'black-key'];
    if (targetKeyIds.includes(k.id) || targetKeyIds.includes(k.note)) classes.push('target');
    if (correctKeyIds.includes(k.id) || correctKeyIds.includes(k.note)) classes.push('correct');
    if (wrongKeyIds.includes(k.id) || wrongKeyIds.includes(k.note)) classes.push('wrong');
    if (pulseCorrectKeyIds.includes(k.id) || pulseCorrectKeyIds.includes(k.note)) classes.push('correct-pulse');
    if (hintKeyIds.includes(k.id) || hintKeyIds.includes(k.note)) classes.push('hint');
    if (midiActiveKeyIds.includes(k.id)) classes.push('midi-active');
    if (twoHandLeftTarget === k.id) classes.push('twohand-left-target');
    if (twoHandRightTarget === k.id) classes.push('twohand-right-target');
    
    const guide = fingerGuides.get(k.id);
    if (guide) {
      classes.push('hand-position-key');
      if (guide.isTarget) classes.push('hand-target-key');
    }
    return classes.join(' ');
  }
</script>

<section class="keyboard-card" aria-label="Фортепианная клавиатура">
  <div class="keyboard-scroll">
    <div 
      class="keyboard" 
      bind:this={keyboardEl}
      style="width:{totalWidth}px;--white-w:{whiteWidth}px;"
    >
      {#each allKeys as k (k.id)}
        <button
          type="button"
          class={getKeyClasses(k)}
          style={getKeyStyle(k)}
          data-id={k.id}
          data-note={k.note}
          data-type={k.type}
          aria-label="Клавиша {DISPLAY_NAMES[k.note]} · {k.id}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => onKeyClick?.(k.id, k.note)}
        >
          <span class="focus-indicator" aria-hidden="true"></span>
          {#if fingerGuides.has(k.id)}
            {@const guide = fingerGuides.get(k.id)!}
            <span class="finger-guide-badge {guide.isTarget ? 'target' : ''}" aria-label="Палец {guide.finger}">
              {guide.finger}
            </span>
          {/if}
          {#if hintKeyIds.includes(k.id) || hintKeyIds.includes(k.note)}
            <span class="hint-badge" aria-label="Подсказка: {DISPLAY_NAMES[k.note]}">
              {k.type === 'black' ? SHORT_NAMES[k.note] : DISPLAY_NAMES[k.note]}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</section>
