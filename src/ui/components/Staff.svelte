<script lang="ts">
  import type { NoteName } from '../../core/fsrs/types';
  import { getSongMeasureCount, getMeasureForNoteIndex } from '../../core/repertoire/repertoireData';

  let {
    keyId = 'C4' as string,
    clef = 'auto' as 'auto' | 'treble' | 'bass' | 'grand',
    mode = 'single' as 'single' | 'repertoire' | 'twohand',
    repertoireSong = null as any,
    currentNoteIndex = 0,
    loopMeasure = null as number | null,
    twoHandLeft = null as string | null,
    twoHandRight = null as string | null,
    isCompleted = false,
    pulseGuide = false
  } = $props();

  const diatonicMap: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  // Determine effective clef
  function effectiveClef(): 'treble' | 'bass' | 'grand' {
    if (clef === 'grand') return 'grand';
    if (clef === 'bass') return 'bass';
    if (clef === 'treble') return 'treble';
    // auto:
    const m = /^([A-G])(#?)(\d)$/.exec(keyId || '');
    if (m && Number(m[3]) <= 3) return 'bass';
    return 'treble';
  }

  // Y for Treble single staff (viewBox 0 0 300 140, lines: 32, 48, 64, 80, 96)
  function staffYForTreble(id: string): number {
    const m = /^([A-G])(#?)(\d)$/.exec(id || '');
    if (!m) return 112;
    const note = m[1];
    const octave = Number(m[3]);
    const step = (octave - 4) * 7 + (diatonicMap[note] ?? 0);
    return 112 - step * 8;
  }

  // Y for Bass single staff (viewBox 0 0 300 140, lines: 32, 48, 64, 80, 96)
  // C3 is Space 2 (y = 72), F3 is Line 4 (y = 48), C4 is Ledger Line 1 above staff (y = 16)
  function staffYForBass(id: string): number {
    const m = /^([A-G])(#?)(\d)$/.exec(id || '');
    if (!m) return 72;
    const note = m[1];
    const octave = Number(m[3]);
    const step = (octave - 3) * 7 + (diatonicMap[note] ?? 0);
    return 72 - step * 8;
  }

  // Y for Grand Staff (viewBox 0 0 320 226)
  function staffYForGrand(id: string): number {
    const m = /^([A-G])(#?)(\d)$/.exec(id || '');
    if (!m) return 113;
    const note = m[1];
    const octave = Number(m[3]);
    const stepFromC4 = (octave - 4) * 7 + (diatonicMap[note] ?? 0);
    if (stepFromC4 === 0) return 113; // Middle C
    if (stepFromC4 > 0) {
      // Treble: D4=100, E4=92 (Line 1), G4=76, B4=60, D5=44, F5=28
      return 100 - (stepFromC4 - 1) * 8;
    } else {
      // Bass: B3=126, A3=134 (Line 5), F3=150, D3=166, C3=174, G2=198
      const bassStepFromC4 = -stepFromC4;
      return 126 + (bassStepFromC4 - 1) * 8;
    }
  }

  function diatonicY(id: string): number {
    const m = /^([A-G])(#?)(\d)$/.exec(id || '');
    if (!m) return 64;
    const idx = Number(m[3]) * 7 + (diatonicMap[m[1]] ?? 0);
    const e4 = 4 * 7 + 2;
    return 96 - (idx - e4) * 8;
  }

  interface RepertoireLayoutNote {
    noteId: string;
    i: number;
    dur: number;
    startBeat: number;
    m: number;
    within: number;
    x: number;
    y: number;
    isHalf: boolean;
    isWhole: boolean;
    isEighth: boolean;
    isDotted: boolean;
  }

  function getRepertoireLayout(song: any, left: number, measureW: number): RepertoireLayoutNote[] {
    if (!song || !song.notes) return [];
    const measureBeats = song.measureBeats || 4;
    const beats: number[] = song.beats || [];
    let acc = 0;
    return song.notes.map((noteId: string, i: number) => {
      const dur = beats[i] ?? 1;
      const startBeat = acc;
      acc += dur;
      const m = Math.floor(startBeat / measureBeats);
      const within = startBeat % measureBeats;
      const x = left + m * measureW + 28 + (within / measureBeats) * (measureW - 52);
      const y = diatonicY(noteId) + 4;
      const isWhole = dur >= 3.5;
      const isHalf = dur >= 1.75 && dur < 3.5;
      const isEighth = dur <= 0.75;
      const isDotted = Math.abs(dur - 1.5) < 0.05 || Math.abs(dur - 0.75) < 0.05 || Math.abs(dur - 2.5) < 0.05;
      return {
        noteId,
        i,
        dur,
        startBeat,
        m,
        within,
        x,
        y,
        isHalf,
        isWhole,
        isEighth,
        isDotted
      };
    });
  }
</script>

{#if mode === 'single' && effectiveClef() === 'treble'}
  {@const y = staffYForTreble(keyId)}
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
        {#if y <= 20}
          <line class="ledger" x1="119" x2="153" y1={y} y2={y} />
        {/if}
        {#if keyId.includes('#')}
          <text class="accidental" x="112" y={y + 6} font-size="20" fill="currentColor">♯</text>
        {/if}
        <ellipse class="notehead {pulseGuide ? 'pulse-guide' : ''}" cx="135" cy={y} rx="10" ry="6.5" transform="rotate(-18 135 {y})" />
        {#if stemUp}
          <line class="stem" x1="143" y1={y} x2="143" y2={y - 44} />
        {:else}
          <line class="stem" x1="127" y1={y} x2="127" y2={y + 44} />
        {/if}
      </svg>
    </div>
    <div class="notation-caption">Скрипичный ключ (правая рука) · диапазон: C4–B4</div>
  </div>
{:else if mode === 'single' && effectiveClef() === 'bass'}
  {@const y = staffYForBass(keyId)}
  {@const stemUp = y >= 64}
  <div class="notation-wrap">
    <div class="notation-card">
      <svg class="notation-svg" viewBox="0 0 300 140" role="img" aria-label="Нота на басовом стане">
        <text class="clef bass-clef-symbol" x="24" y="80">&#119074;</text>
        <circle cx="68" cy="40" r="3.2" fill="#f8fafc" />
        <circle cx="68" cy="56" r="3.2" fill="#f8fafc" />
        {#each [32, 48, 64, 80, 96] as lineY}
          <line class="staff" x1="92" x2="278" y1={lineY} y2={lineY} />
        {/each}
        {#if y <= 20}
          <line class="ledger" x1="119" x2="153" y1={y} y2={y} />
        {/if}
        {#if y >= 108}
          <line class="ledger" x1="119" x2="153" y1={y} y2={y} />
        {/if}
        {#if keyId.includes('#')}
          <text class="accidental" x="112" y={y + 6} font-size="20" fill="currentColor">♯</text>
        {/if}
        <ellipse class="notehead {pulseGuide ? 'pulse-guide' : ''}" cx="135" cy={y} rx="10" ry="6.5" transform="rotate(-18 135 {y})" />
        {#if stemUp}
          <line class="stem" x1="143" y1={y} x2="143" y2={y - 44} />
        {:else}
          <line class="stem" x1="127" y1={y} x2="127" y2={y + 44} />
        {/if}
      </svg>
    </div>
    <div class="notation-caption">Басовый ключ (левая рука) · диапазон: C3–C4</div>
  </div>
{:else if mode === 'single' && effectiveClef() === 'grand'}
  {@const y = staffYForGrand(keyId)}
  {@const stemUp = y >= 113 ? y >= 166 : y >= 60}
  <div class="notation-wrap">
    <div class="notation-card" style="max-width:440px;">
      <svg class="notation-svg" viewBox="0 0 320 226" style="height:210px;" role="img" aria-label="Двойной нотный стан (Grand Staff)">
        <line class="staff" x1="84" x2="84" y1="28" y2="198" style="stroke-width:2.5px;" />
        <path d="M84,28 C74,28 70,100 60,113 C70,126 74,198 84,198" fill="none" stroke="#94a3b8" stroke-width="2" />

        <text class="clef" x="16" y="94" style="font-size:62px;">&#119070;</text>
        {#each [28, 44, 60, 76, 92] as lineY}
          <line class="staff" x1="84" x2="300" y1={lineY} y2={lineY} />
        {/each}

        <text class="clef bass-clef-symbol" x="18" y="174" style="font-size:50px;">&#119074;</text>
        <circle cx="58" cy="140" r="2.8" fill="#f8fafc" />
        <circle cx="58" cy="156" r="2.8" fill="#f8fafc" />
        {#each [134, 150, 166, 182, 198] as lineY}
          <line class="staff" x1="84" x2="300" y1={lineY} y2={lineY} />
        {/each}

        {#if Math.abs(y - 113) < 4}
          <line class="ledger" x1="144" x2="178" y1="113" y2="113" />
        {/if}
        {#if y < 24}
          <line class="ledger" x1="144" x2="178" y1={y} y2={y} />
        {/if}
        {#if y > 200}
          <line class="ledger" x1="144" x2="178" y1={y} y2={y} />
        {/if}

        {#if keyId.includes('#')}
          <text class="accidental" x="138" y={y + 6} font-size="20" fill="currentColor">♯</text>
        {/if}
        <ellipse class="notehead {pulseGuide ? 'pulse-guide' : ''}" cx="160" cy={y} rx="9.5" ry="6" transform="rotate(-18 160 {y})" />
        {#if stemUp}
          <line class="stem" x1="168" y1={y} x2="168" y2={y - 38} />
        {:else}
          <line class="stem" x1="152" y1={y} x2="152" y2={y + 38} />
        {/if}
      </svg>
    </div>
    <div class="notation-caption">Двойной стан (Grand Staff) · Скрипичный и басовый ключи</div>
  </div>
{:else if mode === 'twohand'}
  <div class="notation-wrap">
    <div class="notation-card" style="max-width:440px;">
      <svg class="notation-svg" viewBox="0 0 320 226" style="height:210px;" role="img" aria-label="Две руки на двойном стане">
        <line class="staff" x1="84" x2="84" y1="28" y2="198" style="stroke-width:2.5px;" />
        <path d="M84,28 C74,28 70,100 60,113 C70,126 74,198 84,198" fill="none" stroke="#94a3b8" stroke-width="2" />

        <!-- Treble Clef -->
        <text class="clef" x="16" y="94" style="font-size:62px;">&#119070;</text>
        {#each [28, 44, 60, 76, 92] as lineY}
          <line class="staff" x1="84" x2="300" y1={lineY} y2={lineY} />
        {/each}

        <!-- Bass Clef -->
        <text class="clef bass-clef-symbol" x="18" y="174" style="font-size:50px;">&#119074;</text>
        <circle cx="58" cy="140" r="2.8" fill="#f8fafc" />
        <circle cx="58" cy="156" r="2.8" fill="#f8fafc" />
        {#each [134, 150, 166, 182, 198] as lineY}
          <line class="staff" x1="84" x2="300" y1={lineY} y2={lineY} />
        {/each}

        <!-- Middle C Guide line -->
        <line class="staff" x1="100" x2="280" y1="113" y2="113" stroke-dasharray="3 3" opacity="0.3" />

        <!-- Left Hand Note (Bass) -->
        {#if twoHandLeft}
          {@const yL = staffYForGrand(twoHandLeft)}
          {@const stemUpL = yL >= 166}
          {#if Math.abs(yL - 113) < 4}
            <line class="ledger" x1="124" x2="162" y1="113" y2="113" />
          {/if}
          {#if yL > 200}
            <line class="ledger" x1="124" x2="162" y1={yL} y2={yL} />
          {/if}
          {#if twoHandLeft.includes('#')}
            <text class="accidental" x="120" y={yL + 6} font-size="18" fill="#c084fc">♯</text>
          {/if}
          <ellipse class="notehead" cx="142" cy={yL} rx="9.5" ry="6" fill="#c084fc" transform="rotate(-18 142 {yL})" />
          <line class="stem" x1={stemUpL ? 150 : 134} y1={yL} x2={stemUpL ? 150 : 134} y2={stemUpL ? yL - 36 : yL + 36} stroke="#c084fc" stroke-width="2" />
          <text x="142" y={yL > 166 ? yL - 12 : yL + 22} font-size="11" font-weight="700" fill="#c084fc" text-anchor="middle">Л.Р. {twoHandLeft}</text>
        {/if}

        <!-- Right Hand Note (Treble) -->
        {#if twoHandRight}
          {@const yR = staffYForGrand(twoHandRight)}
          {@const stemUpR = yR >= 60}
          {#if Math.abs(yR - 113) < 4}
            <line class="ledger" x1="184" x2="222" y1="113" y2="113" />
          {/if}
          {#if yR < 24}
            <line class="ledger" x1="184" x2="222" y1={yR} y2={yR} />
          {/if}
          {#if twoHandRight.includes('#')}
            <text class="accidental" x="180" y={yR + 6} font-size="18" fill="#38bdf8">♯</text>
          {/if}
          <ellipse class="notehead" cx="202" cy={yR} rx="9.5" ry="6" fill="#38bdf8" transform="rotate(-18 202 {yR})" />
          <line class="stem" x1={stemUpR ? 210 : 194} y1={yR} x2={stemUpR ? 210 : 194} y2={stemUpR ? yR - 36 : yR + 36} stroke="#38bdf8" stroke-width="2" />
          <text x="202" y={yR < 60 ? yR + 22 : yR - 12} font-size="11" font-weight="700" fill="#38bdf8" text-anchor="middle">П.Р. {twoHandRight}</text>
        {/if}
      </svg>
    </div>
    <div class="notation-caption" style="display:flex; justify-content:center; gap:20px;">
      <span style="color:#c084fc; font-weight:600;">● Левая рука: басовый ключ</span>
      <span style="color:#38bdf8; font-weight:600;">● Правая рука: скрипичный ключ</span>
    </div>
  </div>
{:else if repertoireSong}
  {@const measureW = 220}
  {@const left = 126}
  {@const measureCount = getSongMeasureCount(repertoireSong)}
  {@const width = Math.max(820, left + measureCount * measureW + 22)}
  {@const height = 142}
  {@const curMeasure = getMeasureForNoteIndex(repertoireSong, currentNoteIndex)}
  {@const timeTop = repertoireSong.timeSignature ? repertoireSong.timeSignature[0] : (repertoireSong.measureBeats || 4)}
  {@const timeBottom = repertoireSong.timeSignature ? repertoireSong.timeSignature[1] : 4}
  {@const layoutNotes = getRepertoireLayout(repertoireSong, left, measureW)}

  <svg class="repertoire-staff-svg phrase-staff" viewBox="0 0 {width} {height}" role="img" aria-label="Нотный стан мелодии {timeTop}/{timeBottom}">
    <text class="rep-clef" x="14" y="104">&#119070;</text>
    <g class="rep-time-signature">
      <text x="86" y="63">{timeTop}</text>
      <text x="86" y="91">{timeBottom}</text>
    </g>

    {#if loopMeasure != null}
      <rect 
        class="rep-measure-loop-highlight" 
        x={left + (loopMeasure - 1) * measureW + 2} 
        y="22" 
        width={measureW - 4} 
        height="92" 
        rx="8" 
        fill="rgba(245, 158, 11, 0.12)"
        stroke="#f59e0b"
        stroke-width="2"
        stroke-dasharray="4 2"
      />
      <text x={left + (loopMeasure - 1) * measureW + 10} y="34" fill="#f59e0b" font-size="11" font-weight="bold">🔁 LOOP</text>
    {/if}

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

    {#each [36, 52, 68, 84, 100] as lineY}
      <line class="rep-staff-line" x1="72" x2={width - 14} y1={lineY} y2={lineY} />
    {/each}

    {#each Array(measureCount + 1) as _, m}
      {@const x = left + m * measureW}
      <line class="rep-barline {m === 0 || m === measureCount ? 'edge' : ''}" x1={x} x2={x} y1="36" y2="100" />
    {/each}

    {#each layoutNotes as note}
      {@const done = note.i < currentNoteIndex || isCompleted}
      {@const current = note.i === currentNoteIndex && !isCompleted}
      {@const stemUp = note.y > 68}
      {@const stemX = stemUp ? note.x + 8 : note.x - 8}
      {@const isSharp = note.noteId.includes('#')}

      <g class="rep-note {done ? 'done' : ''} {current ? 'current' : ''}">
        {#if current}
          <circle class="rep-note-halo" cx={note.x} cy={note.y} r="17" />
        {/if}
        {#if note.y >= 112}
          <line class="rep-ledger" x1={note.x - 13} x2={note.x + 13} y1="116" y2="116" />
        {/if}
        {#if isSharp}
          <text class="rep-accidental" x={note.x - 13} y={note.y + 5} font-size="16" fill="currentColor">♯</text>
        {/if}

        <!-- Notehead: hollow for half / whole notes, solid filled for quarter / eighth notes -->
        {#if note.isHalf || note.isWhole}
          <ellipse 
            class="rep-notehead rep-hollow" 
            cx={note.x} 
            cy={note.y} 
            rx="8.5" 
            ry="6" 
            transform="rotate(-18 {note.x} {note.y})" 
            fill="#090e1a" 
            stroke="currentColor" 
            stroke-width="2.3" 
          />
        {:else}
          <ellipse 
            class="rep-notehead" 
            cx={note.x} 
            cy={note.y} 
            rx="8.5" 
            ry="6" 
            transform="rotate(-18 {note.x} {note.y})" 
            fill="currentColor" 
          />
        {/if}

        <!-- Dotted note dot -->
        {#if note.isDotted}
          <circle class="rep-dot" cx={note.x + 13} cy={note.y} r="2.4" fill="currentColor" />
        {/if}

        <!-- Stem & flag (whole notes have no stems) -->
        {#if !note.isWhole}
          <line class="rep-stem" x1={stemX} x2={stemX} y1={note.y} y2={stemUp ? note.y - 32 : note.y + 32} />

          <!-- Eighth note flag -->
          {#if note.isEighth}
            {#if stemUp}
              <path 
                class="rep-flag" 
                d="M {stemX} {note.y - 32} C {stemX + 8} {note.y - 25} {stemX + 10} {note.y - 14} {stemX + 2} {note.y - 8}" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="2" 
                stroke-linecap="round" 
              />
            {:else}
              <path 
                class="rep-flag" 
                d="M {stemX} {note.y + 32} C {stemX + 8} {note.y + 25} {stemX + 10} {note.y + 14} {stemX + 2} {note.y + 8}" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="2" 
                stroke-linecap="round" 
              />
            {/if}
          {/if}
        {/if}
      </g>
    {/each}
  </svg>
{/if}
