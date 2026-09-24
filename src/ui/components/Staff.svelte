<script lang="ts">
  import { onDestroy } from 'svelte';
  import { CursorType, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
  import {
    songToMusicXml,
    singleNoteToMusicXml,
    twoHandToMusicXml,
    getCursorStepForNoteIndex,
    decomposeDurationSpecs
  } from '../../core/repertoire/musicXmlGenerator';

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

  let scrollWrapperEl = $state<HTMLDivElement | null>(null);
  let osmdContainerEl = $state<HTMLDivElement | null>(null);

  let osmdInstance: OpenSheetMusicDisplay | null = null;
  let lastLoadedXml = '';
  let lastLoadedMode = '';
  let lastCursorIndex: number | null = null;
  let cachedStaveNotes: Element[] = [];
  let renderSeq = 0;

  const scoreXml = $derived.by(() => {
    if (mode === 'repertoire' && repertoireSong) {
      return songToMusicXml(repertoireSong);
    }
    if (mode === 'twohand') {
      return twoHandToMusicXml(twoHandLeft, twoHandRight);
    }
    return singleNoteToMusicXml(keyId || 'C4', clef);
  });

  function styleOsmdCursor(cursorElement: HTMLElement | null, durationMs = 160) {
    if (!cursorElement) return;
    const renderedHeight = cursorElement.getBoundingClientRect().height;
    const cursorHeight = Math.max(renderedHeight || 68, 68);
    const verticalDurationMs = durationMs === 0 ? 0 : 160;
    cursorElement.style.transition =
      durationMs <= 0
        ? 'none'
        : `left ${durationMs}ms linear, top ${verticalDurationMs}ms linear, height ${verticalDurationMs}ms linear`;
    cursorElement.style.width = '12px';
    cursorElement.style.minWidth = '12px';
    cursorElement.style.height = `${cursorHeight}px`;
    cursorElement.style.minHeight = '64px';
    cursorElement.style.borderRadius = '999px';
    cursorElement.style.backgroundColor = 'rgba(56, 189, 248, 0.35)';
    cursorElement.style.boxShadow =
      '0 0 0 1.5px rgba(56, 189, 248, 0.85), 0 0 14px rgba(56, 189, 248, 0.55)';
  }

  function scrollSheetToCursor(
    cursorElement: HTMLElement | null,
    sheet: HTMLDivElement | null,
    behavior: ScrollBehavior = 'smooth'
  ) {
    if (!cursorElement || !sheet) return;
    requestAnimationFrame(() => {
      const sheetRect = sheet.getBoundingClientRect();
      const cursorRect = cursorElement.getBoundingClientRect();
      if (sheetRect.width <= 0) return;
      const targetLeft = sheet.clientWidth * 0.46;
      const offset = cursorRect.left - sheetRect.left - targetLeft;
      sheet.scrollTo({
        left: Math.max(0, sheet.scrollLeft + offset),
        behavior
      });
    });
  }

  function highlightSvgNotes(container: HTMLElement | null, activeIdx: number, completed: boolean) {
    if (!container) return;
    const staveNotes =
      cachedStaveNotes.length > 0
        ? cachedStaveNotes
        : Array.from(container.querySelectorAll('.vf-stavenote'));
    const cursorStart =
      mode === 'repertoire' && repertoireSong
        ? getCursorStepForNoteIndex(repertoireSong, activeIdx)
        : activeIdx;
    const activeSpan =
      mode === 'repertoire' && repertoireSong
        ? decomposeDurationSpecs(repertoireSong.beats?.[activeIdx] ?? 1).length
        : 1;

    staveNotes.forEach((el, idx) => {
      el.classList.remove('osmd-vf-done', 'osmd-vf-current');
      if (mode === 'repertoire') {
        if (idx < cursorStart || completed) {
          el.classList.add('osmd-vf-done');
        } else if (idx >= cursorStart && idx < cursorStart + activeSpan && !completed) {
          el.classList.add('osmd-vf-current');
        }
      } else if (mode === 'single' && pulseGuide) {
        el.classList.add('osmd-vf-current');
      }
    });
  }

  function syncRepertoireCursor(activeIdx: number, completed: boolean) {
    if (!osmdInstance || mode !== 'repertoire') return;
    const targetStep = repertoireSong ? getCursorStepForNoteIndex(repertoireSong, activeIdx) : activeIdx;
    const cursor = osmdInstance.cursor;
    if (cursor) {
      if (completed) {
        cursor.hide();
        lastCursorIndex = null;
      } else {
        cursor.show();
        if (lastCursorIndex === null || targetStep < lastCursorIndex) {
          styleOsmdCursor(cursor.cursorElement, 0);
          cursor.reset();
          for (let i = 0; i < targetStep; i++) {
            cursor.next();
          }
          lastCursorIndex = targetStep;
          styleOsmdCursor(cursor.cursorElement, 0);
          scrollSheetToCursor(cursor.cursorElement, scrollWrapperEl, targetStep === 0 ? 'auto' : 'smooth');
        } else if (targetStep > lastCursorIndex) {
          styleOsmdCursor(cursor.cursorElement, 120);
          for (let i = lastCursorIndex; i < targetStep; i++) {
            cursor.next();
          }
          lastCursorIndex = targetStep;
          scrollSheetToCursor(cursor.cursorElement, scrollWrapperEl, 'smooth');
        } else {
          styleOsmdCursor(cursor.cursorElement, 120);
          scrollSheetToCursor(cursor.cursorElement, scrollWrapperEl, 'smooth');
        }
      }
    }
    highlightSvgNotes(osmdContainerEl, activeIdx, completed);
  }

  function lockStaffVerticalPosition(container: HTMLElement | null, currentMode: string, currentClef: string) {
    if (!container) return;
    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    container.style.transform = 'translateY(0px)';
    svg.style.transform = 'translate(0px, 0px)';

    // Find all horizontal staff-line paths (M x1 y1 L x2 y2 where y1 == y2 and width > 45)
    const paths = Array.from(svg.querySelectorAll('path'));
    let topStaffLinePath: SVGPathElement | null = null;
    let minLineY = Infinity;

    for (const p of paths) {
      if (p.closest('.vf-stavenote') || p.closest('.vf-clef') || p.closest('.vf-timesig')) continue;
      const d = p.getAttribute('d') || '';
      const m = /^M\s*([\d.-]+)\s+([\d.-]+)\s*L\s*([\d.-]+)\s+([\d.-]+)/i.exec(d.trim());
      if (!m) continue;
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      if (Math.abs(y1 - y2) < 0.5 && Math.abs(x2 - x1) > 45) {
        if (y1 < minLineY) {
          minLineY = y1;
          topStaffLinePath = p;
        }
      }
    }

    if (!topStaffLinePath) return;

    const refEl = currentMode === 'repertoire' && scrollWrapperEl ? scrollWrapperEl : container;
    const refRect = refEl.getBoundingClientRect();
    const lineRect = topStaffLinePath.getBoundingClientRect();
    if (refRect.height <= 0) return;

    const actualTopPx = lineRect.top - refRect.top;
    const isGrand = currentMode === 'twohand' || currentClef === 'grand';
    const targetTopPx =
      currentMode === 'repertoire'
        ? 38
        : isGrand
          ? 24
          : 46;

    const shiftY = Math.round((targetTopPx - actualTopPx) * 10) / 10;

    if (currentMode === 'repertoire') {
      container.style.transform = `translateY(${shiftY}px)`;
    } else {
      const actualLeftPx = lineRect.left - refRect.left;
      const targetLeftPx = Math.round((refRect.width - 136) / 2);
      const shiftX = refRect.width > 160 ? Math.round((targetLeftPx - actualLeftPx) * 10) / 10 : 0;
      svg.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
    }
  }

  async function renderScore(xml: string, currentMode: string, activeIdx: number, completed: boolean) {
    if (!osmdContainerEl || !xml) return;
    const seq = ++renderSeq;

    try {
      const isRepertoire = currentMode === 'repertoire';
      if (!osmdInstance || lastLoadedMode !== currentMode) {
        osmdContainerEl.replaceChildren();
        osmdInstance = new OpenSheetMusicDisplay(osmdContainerEl, {
          backend: 'svg',
          drawingParameters: 'compacttight',
          drawCredits: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawMetronomeMarks: false,
          drawPartNames: false,
          drawPartAbbreviations: false,
          drawMeasureNumbers: isRepertoire,
          drawTimeSignatures: isRepertoire,
          drawLyrics: false,
          drawFingerings: true,
          fingeringPosition: 'below',
          autoResize: false,
          followCursor: false,
          renderSingleHorizontalStaffline: true,
          cursorsOptions: isRepertoire
            ? [
                {
                  type: CursorType.ThinLeft,
                  color: '#38bdf8',
                  alpha: 0.85,
                  follow: false
                }
              ]
            : []
        });
        osmdInstance.FollowCursor = false;
        osmdInstance.EngravingRules.SheetMaximumWidth = 1_000_000;
        osmdInstance.EngravingRules.AutoBeamNotes = true;
        osmdInstance.EngravingRules.StaffLineWidth = 0.12;
        osmdInstance.EngravingRules.StaffLineColor = '#9ca3af';
        osmdInstance.EngravingRules.LedgerLineWidth = 0.14;
        osmdInstance.EngravingRules.LedgerLineColorDefault = '#9ca3af';
        osmdInstance.EngravingRules.SystemThinLineWidth = 0.12;
        osmdInstance.EngravingRules.PageTopMargin = 1.5;
        osmdInstance.EngravingRules.PageBottomMargin = 1.5;
        lastLoadedMode = currentMode;
      }

      if (lastLoadedXml !== xml) {
        await osmdInstance.load(xml);
        if (seq !== renderSeq) return;
        osmdInstance.Zoom = isRepertoire ? 1.05 : currentMode === 'twohand' ? 1.08 : 1.18;
        osmdInstance.render();
        lastLoadedXml = xml;
        lastCursorIndex = null;
        cachedStaveNotes = Array.from(osmdContainerEl.querySelectorAll('.vf-stavenote'));

        // Remove any empty trailing SVGs created by OSMD
        Array.from(osmdContainerEl.querySelectorAll('svg')).forEach((svg) => {
          if (svg.childElementCount === 0) svg.remove();
        });

        lockStaffVerticalPosition(osmdContainerEl, currentMode, clef);
      }

      if (isRepertoire) {
        syncRepertoireCursor(activeIdx, completed);
      } else {
        highlightSvgNotes(osmdContainerEl, 0, false);
      }
    } catch (err) {
      console.error('OSMD render error:', err);
    }
  }

  $effect(() => {
    if (!osmdContainerEl) return;

    const xml = scoreXml;
    const idx = currentNoteIndex;
    const done = isCompleted;
    const guide = pulseGuide;
    void guide;

    if (lastLoadedXml === xml && lastLoadedMode === mode && osmdInstance) {
      if (mode === 'repertoire') {
        syncRepertoireCursor(idx, done);
      } else {
        highlightSvgNotes(osmdContainerEl, 0, false);
      }
    } else {
      void renderScore(xml, mode, idx, done);
    }
  });

  onDestroy(() => {
    if (osmdInstance) {
      osmdInstance.clear();
      osmdInstance = null;
    }
  });

  function effectiveClefCaption(): string {
    if (clef === 'grand') return 'Акколада (Grand Staff): Басовый (C2–B3) + Скрипичный (C4–C6)';
    if (clef === 'bass') return 'Басовый ключ (F-ключ на 4-й линии · F3)';
    if (clef === 'treble') return 'Скрипичный ключ (G-ключ на 2-й линии · G4)';
    const m = /^([A-G])(#?)(\d)$/.exec(keyId || '');
    if (m && Number(m[3]) <= 3) return 'Басовый ключ (авто · малая/большая октава)';
    return 'Скрипичный ключ (авто · первая/вторая октава)';
  }
</script>

{#if mode === 'repertoire' && repertoireSong}
  {@const timeTop = repertoireSong.timeSignature ? repertoireSong.timeSignature[0] : (repertoireSong.measureBeats || 4)}
  {@const timeBottom = repertoireSong.timeSignature ? repertoireSong.timeSignature[1] : 4}

  <div class="osmd-repertoire-shell" aria-label="Нотный стан мелодии {timeTop}/{timeBottom}">
    {#if loopMeasure != null}
      <span class="osmd-floating-loop-pill">🔁 Цикл: такт {loopMeasure}</span>
    {/if}
    <div class="osmd-sheet-scroll custom-scrollbar" bind:this={scrollWrapperEl}>
      <div class="osmd-canvas osmd-dark" bind:this={osmdContainerEl}></div>
    </div>
  </div>
{:else if mode === 'twohand'}
  <div class="notation-wrap is-grand-staff">
    <div class="notation-card osmd-card-single is-grand">
      <div class="osmd-single-container osmd-dark" bind:this={osmdContainerEl}></div>
    </div>
    <div class="notation-caption" style="display:flex; justify-content:center; gap:20px;">
      <span style="color:#c084fc; font-weight:600;">● Левая рука: басовый ключ (нижний стан)</span>
      <span style="color:#38bdf8; font-weight:600;">● Правая рука: скрипичный ключ (верхний стан)</span>
    </div>
  </div>
{:else}
  <div class="notation-wrap {clef === 'grand' ? 'is-grand-staff' : ''}">
    <div class="notation-card osmd-card-single {clef === 'grand' ? 'is-grand' : ''}">
      <div class="osmd-single-container osmd-dark" bind:this={osmdContainerEl}></div>
    </div>
    <div class="notation-caption">{effectiveClefCaption()}</div>
  </div>
{/if}
