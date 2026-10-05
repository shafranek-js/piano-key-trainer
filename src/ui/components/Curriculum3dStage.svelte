<script lang="ts">
  import { DISPLAY_NAMES, STAFF_HINTS, SOUND_HINTS } from '../../core/fsrs/constants';
  import { getIdentifyButtonLabel } from '../../core/input/inputPolicy';
  import type { NoteName } from '../../core/fsrs/types';
  import Staff from './Staff.svelte';
  import {
    ALL_WHITE_CURRICULUM_NOTES,
    BLACK_KEY_ACQUISITION_ORDER,
    BLACK_KEY_GEOMETRY,
    EAR_ACQUISITION_ORDER,
    NOTATION_ACQUISITION_ORDER,
    canUseDontKnowInMilestone3dStep,
    describeMilestone3dStep,
    getBlackKeyCurriculumItemId,
    getEarNoteCurriculumItemId,
    getNotationNoteCurriculumItemId,
    getUnhintedBlackNoteContexts,
    type Milestone3dCurriculumState
  } from '../../core/learning';

  let {
    state,
    wrongAnswerNotes = [] as NoteName[],
    correctAnswerNotes = [] as NoteName[],
    onAnswerClick,
    onDontKnow,
    onAdvancePhase,
    onPlaySoundPrompt
  }: {
    state: Milestone3dCurriculumState;
    wrongAnswerNotes?: NoteName[];
    correctAnswerNotes?: NoteName[];
    onAnswerClick?: (note: NoteName) => void;
    onDontKnow?: () => void;
    onAdvancePhase?: () => void;
    onPlaySoundPrompt?: () => void;
  } = $props();

  const stepDesc = $derived(describeMilestone3dStep(state.step));
  const showDontKnowButton = $derived(canUseDontKnowInMilestone3dStep(state));

  const masteredBlackCount = $derived(
    BLACK_KEY_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getBlackKeyCurriculumItemId(n)];
      return rec?.state === 'retention' && !rec.contexts.includes('pending:delayedRetry');
    }).length
  );

  const masteredNotationCount = $derived(
    NOTATION_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getNotationNoteCurriculumItemId(n)];
      return rec?.state === 'retention' && !rec.contexts.includes('pending:delayedRetry');
    }).length
  );

  const masteredEarCount = $derived(
    EAR_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getEarNoteCurriculumItemId(n)];
      return rec?.state === 'retention' && !rec.contexts.includes('pending:delayedRetry');
    }).length
  );

  const focusBlackRecord = $derived(
    stepDesc.focusBlackNote
      ? state.progress[getBlackKeyCurriculumItemId(stepDesc.focusBlackNote)]
      : undefined
  );
  const guidedSuccessCount = $derived(focusBlackRecord?.guidedSuccesses ?? 0);
  const qualifyRegionCount = $derived(
    getUnhintedBlackNoteContexts(focusBlackRecord).length
  );

  const eyebrowText = $derived.by(() => {
    if (stepDesc.phase === 4) {
      if (stepDesc.kind === 'phase4Complete') {
        return 'ЧЁРНЫЕ КЛАВИШИ · 5 ИЗ 5 · ЭТАП 4 ЗАВЕРШЁН';
      }
      const badge = `ЧЁРНЫЕ КЛАВИШИ · ${Math.min(5, masteredBlackCount + 1)} ИЗ 5`;
      if (stepDesc.kind === 'blackIdentify') {
        return `${badge} · РАСПОЗНАВАНИЕ ДИЕЗОВ И БЕМОЛЕЙ`;
      }
      if (stepDesc.kind === 'allBlackMix') {
        return 'ЧЁРНЫЕ КЛАВИШИ · 5 ИЗ 5 · ВСЕ 5 ЧЁРНЫХ КЛАВИШ';
      }
      switch (stepDesc.subStage) {
        case 'model':
          return `${badge} · ГЕОМЕТРИЯ И ЭНГАРМОНИЗМ`;
        case 'guided':
          return `${badge} · МЕЖДУ СОСЕДНИМИ БЕЛЫМИ`;
        case 'qualify':
          return `${badge} · БЕЗ ПОДСКАЗОК ПО ОКТАВАМ`;
        case 'localMix':
          return `${badge} · СРАВНЕНИЕ В ГРУППЕ`;
        case 'delayedCheck':
        default:
          return state.isInterveningRecall
            ? `${badge} · КОНТРАСТНЫЙ ШАГ`
            : `${badge} · ПРОВЕРКА ПО ПАМЯТИ`;
      }
    }

    if (stepDesc.phase === 5) {
      if (stepDesc.kind === 'phase5Complete') {
        return 'НОТНЫЙ СТАН · 7 ИЗ 7 · ЭТАП 5 ЗАВЕРШЁН';
      }
      const badge = `НОТНЫЙ СТАН · ${Math.min(7, masteredNotationCount + 1)} ИЗ 7`;
      const unitLabel =
        stepDesc.notationUnit === 'anchors'
          ? 'ОПОРНЫЕ ЛИНИИ C4 · F4 · G4'
          : stepDesc.notationUnit === 'lower'
            ? 'НИЖНЯЯ ЧАСТЬ СТАНА C4–G4'
            : 'ВЕСЬ СКРИПИЧНЫЙ СТАН C4–B4';
      return `${badge} · ${unitLabel}`;
    }

    if (stepDesc.kind === 'phase6Complete') {
      return 'КУРС ЗАВЕРШЁН · ПЕРЕХОД К ЕЖЕДНЕВНОЙ ТРЕНИРОВКЕ';
    }
    const earBadge = `СЛУХ · ${Math.min(7, masteredEarCount + 1)} ИЗ 7`;
    const earLabel =
      stepDesc.earUnit === 'anchors'
        ? 'ОПОРА C4 → СТУПЕНИ C4–F4'
        : 'ОПОРА C4 → ВСЯ ОКТАВА C4–B4';
    return `${earBadge} · ${earLabel}`;
  });

  const titleHtml = $derived.by(() => {
    if (stepDesc.kind === 'phase4Complete') {
      return 'Все 5 чёрных клавиш освоены';
    }
    if (stepDesc.kind === 'phase5Complete') {
      return 'Чтение нот C4–B4 с листа активировано';
    }
    if (stepDesc.kind === 'phase6Complete') {
      return 'Базовый курс завершён';
    }

    if (stepDesc.phase === 4) {
      if (stepDesc.kind === 'blackIdentify') {
        return 'Какая чёрная клавиша подсвечена?';
      }
      if (stepDesc.kind === 'allBlackMix') {
        const target = state.targetNote ?? 'C#';
        return `Найдите <span class="note">${DISPLAY_NAMES[target]}</span>`;
      }
      const focus = stepDesc.focusBlackNote ?? 'C#';
      const spec = BLACK_KEY_GEOMETRY[focus];
      switch (stepDesc.subStage) {
        case 'model':
          return spec.modelTitleHtml;
        case 'guided':
          return spec.guidedTitleHtml;
        case 'qualify':
          return spec.qualifyTitleHtml;
        case 'localMix':
        case 'delayedCheck':
        default: {
          const target = state.targetNote ?? focus;
          return `Найдите <span class="note">${DISPLAY_NAMES[target]}</span>`;
        }
      }
    }

    if (stepDesc.phase === 5) {
      const target = state.targetNote ?? 'C';
      if (stepDesc.subStage === 'model') {
        return `Ориентир на нотном стане: <span class="note">${DISPLAY_NAMES[target]} (${target}4)</span>`;
      }
      if (stepDesc.subStage === 'delayedCheck') {
        return state.isInterveningRecall
          ? 'Контрастный шаг перед повторной проверкой на нотном стане'
          : `Финальная проверка ноты на стане (в 1-й октаве C4–B4)`;
      }
      return 'Сыграйте ноту, показанную на нотном стане (в 1-й октаве C4–B4)';
    }

    // Phase 6 (Ear)
    const target = state.targetNote ?? 'C';
    if (stepDesc.subStage === 'model') {
      return `Слуховой ориентир от C4: <span class="note">${DISPLAY_NAMES[target]} (${target}4)</span>`;
    }
    if (stepDesc.subStage === 'delayedCheck') {
      return state.isInterveningRecall
        ? 'Контрастный шаг перед повторной проверкой на слух'
        : 'Финальная проверка ступени на слух от опоры C4';
    }
    return 'Прослушайте опору C4 → целевой звук и нажмите клавишу в 1-й октаве';
  });

  const bodyText = $derived.by(() => {
    if (stepDesc.kind === 'phase4Complete') {
      return 'Вы освоили геометрию и двойные названия (диез ♯ / бемоль ♭) всех 5 чёрных клавиш в группах из 2 и 3 чёрных.';
    }
    if (stepDesc.kind === 'phase5Complete') {
      return 'Все 7 ступеней первой октавы (C4–B4) на скрипичном стане подключены к расписанию интервальных повторений FSRS.';
    }
    if (stepDesc.kind === 'phase6Complete') {
      return 'Теперь приложение будет поддерживать эти навыки ежедневными повторениями.';
    }

    if (stepDesc.phase === 4) {
      if (stepDesc.kind === 'blackIdentify') {
        return 'Определите чёрную клавишу по её месту в группе из 2 или 3 чёрных клавиш и выберите энгармоническое имя (♯ / ♭).';
      }
      if (stepDesc.kind === 'allBlackMix') {
        return 'Различайте все 5 чёрных клавиш (C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭) в разных октавах.';
      }
      const focus = stepDesc.focusBlackNote ?? 'C#';
      const spec = BLACK_KEY_GEOMETRY[focus];
      switch (stepDesc.subStage) {
        case 'model':
          return spec.modelBody;
        case 'guided':
          return spec.guidedBody;
        case 'qualify':
          return spec.qualifyBody;
        case 'localMix':
          return `Различайте ${spec.displayLabel} и соседние клавиши её группы (${spec.adjacentWhiteNotes[0]} и ${spec.adjacentWhiteNotes[1]}).`;
        case 'delayedCheck':
        default:
          return state.isInterveningRecall
            ? 'Сначала найдите опорную белую клавишу, а затем повторим проверку чёрной клавиши по памяти.'
            : `Финальная проверка без подсказок: найдите ${spec.displayLabel} на клавиатуре.`;
      }
    }

    if (stepDesc.phase === 5) {
      const target = state.targetNote ?? 'C';
      if (stepDesc.subStage === 'model') {
        return `${STAFF_HINTS[target] ?? ''} Нажмите подсвеченную клавишу ${target}4 на пианино.`;
      }
      if (stepDesc.subStage === 'localMix') {
        return 'Различайте уже изученные ноты на скрипичном стане без подсказок.';
      }
      return 'Определите ноту по линейке или промежутку скрипичного стана и нажмите точную клавишу в 1-й октаве (C4–B4).';
    }

    const target = state.targetNote ?? 'C';
    if (stepDesc.subStage === 'model') {
      return `${SOUND_HINTS[target] ?? ''} Сравните звучание с опорной C4 и нажмите ${target}4.`;
    }
    if (stepDesc.subStage === 'localMix') {
      return 'Различайте уже изученные ступени на слух относительно опорной C4.';
    }
    return 'Сначала звучит опорная нота До первой октавы (C4), затем целевая нота. Нажмите услышанную клавишу в октаве C4–B4.';
  });

  const defaultHintPrompt = $derived.by(() => {
    if (
      stepDesc.kind === 'phase4Complete' ||
      stepDesc.kind === 'phase5Complete' ||
      stepDesc.kind === 'phase6Complete'
    ) {
      return 'Нажмите кнопку справа, чтобы перейти к следующему этапу программы.';
    }
    if (stepDesc.kind === 'blackIdentify') {
      return `Распознано: ${state.identifyCompletedNotes.length} из ${state.answerPool.length}. Чёрные: Shift + C/D/F/G/A (или Shift + 1/2/4/5/6).`;
    }
    if (stepDesc.phase === 4 && stepDesc.focusBlackNote) {
      const spec = BLACK_KEY_GEOMETRY[stepDesc.focusBlackNote];
      if (stepDesc.subStage === 'model') return spec.modelPrompt;
      if (stepDesc.subStage === 'guided') {
        return `${spec.guidedPrompt} (${guidedSuccessCount} из ${state.config.guidedSuccessTarget})`;
      }
      if (stepDesc.subStage === 'qualify') {
        return `Найдено в разных октавах: ${qualifyRegionCount} из ${state.config.qualifySuccessTarget}`;
      }
    }
    if (stepDesc.phase === 5) {
      return `Требуется точная октава (C4–B4).`;
    }
    if (stepDesc.phase === 6) {
      return `Сравните высоту целевого звука с опорой C4 и нажмите клавишу в 1-й октаве.`;
    }
    return 'Нажмите нужную клавишу на пианино внизу.';
  });
</script>

<section
  class="operation-stage first-run-stage curriculum-3c-stage curriculum-3d-stage"
  data-curriculum-step={state.step}
  data-hint-level={state.hintLevel}
>
  <div class="operation-inner">
    <div class="challenge first-run-card">
      <div class="challenge-inner">
        <div class="prompt-wrap">
          <div class="eyebrow first-run-eyebrow">{eyebrowText}</div>
          <h1 class="prompt">{@html titleHtml}</h1>
          <p class="instruction first-run-body">{bodyText}</p>
        </div>

        <div class="first-run-visual-slot">
          {#if stepDesc.phase === 4 && stepDesc.focusBlackNote && (stepDesc.subStage === 'model' || stepDesc.subStage === 'guided')}
            {@const spec = BLACK_KEY_GEOMETRY[stepDesc.focusBlackNote]}
            <div
              class="landmark-diagram {spec.blackGroupSize === 2 ? 'anchor-c-diagram' : 'anchor-f-diagram'}"
              aria-label={spec.diagramGroupTitle}
            >
              <div class="landmark-group-box">
                <span class="landmark-bracket">{spec.diagramGroupTitle}</span>
                {#if spec.blackGroupSize === 2}
                  <div class="mini-octave-keys">
                    {#each [0, 1, 2] as idx (idx)}
                      <span
                        class="mini-white {idx === spec.blackIndexInGroup || idx === spec.blackIndexInGroup + 1 ? 'highlight-white' : ''}"
                        data-mini-white-index={idx}
                      ></span>
                    {/each}
                    <span
                      class="mini-black b2-1 {spec.blackIndexInGroup === 0 ? 'highlight-black' : ''}"
                    ></span>
                    <span
                      class="mini-black b2-2 {spec.blackIndexInGroup === 1 ? 'highlight-black' : ''}"
                    ></span>
                  </div>
                {:else}
                  <div class="mini-octave-keys four-whites">
                    {#each [0, 1, 2, 3] as idx (idx)}
                      <span
                        class="mini-white {idx === spec.blackIndexInGroup || idx === spec.blackIndexInGroup + 1 ? 'highlight-white' : ''}"
                        data-mini-white-index={idx}
                      ></span>
                    {/each}
                    <span
                      class="mini-black b3-1 {spec.blackIndexInGroup === 0 ? 'highlight-black' : ''}"
                    ></span>
                    <span
                      class="mini-black b3-2 {spec.blackIndexInGroup === 1 ? 'highlight-black' : ''}"
                    ></span>
                    <span
                      class="mini-black b3-3 {spec.blackIndexInGroup === 2 ? 'highlight-black' : ''}"
                    ></span>
                  </div>
                {/if}
                <span class="landmark-arrow-caption">
                  {stepDesc.subStage === 'model'
                    ? `${spec.displayLabel} · ${spec.diagramCaption}`
                    : `Между ${spec.adjacentWhiteNotes[0]} и ${spec.adjacentWhiteNotes[1]}`}
                </span>
              </div>
            </div>
          {:else if stepDesc.kind === 'blackIdentify'}
            <div class="answers first-run-identify-answers" aria-label="Варианты ответа для чёрных клавиш">
              {#each state.answerPool as n (n)}
                {@const label = getIdentifyButtonLabel(n)}
                <button
                  type="button"
                  class="answer-btn first-run-answer-btn accidental-btn {wrongAnswerNotes.includes(n) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(n) ? 'correct-pulse' : ''}"
                  data-answer-note={n}
                  aria-label={DISPLAY_NAMES[n]}
                  onclick={() => onAnswerClick?.(n)}
                >
                  <span class="note-latin">{label.shortLabel}</span>
                  <small class="note-ru">{label.displayLabel}</small>
                </button>
              {/each}
            </div>
          {:else if stepDesc.phase === 5 && stepDesc.kind !== 'phase5Complete'}
            <div class="curriculum-3d-staff-slot" style="width: 100%; max-width: 520px; margin: 0 auto;">
              <Staff
                keyId={state.targetKeyId || 'C4'}
                clef="treble"
                mode="single"
              />
            </div>
          {:else if stepDesc.phase === 6 && stepDesc.kind !== 'phase6Complete'}
            <div class="first-run-progress-pills" style="gap: 12px; align-items: center;">
              <button
                type="button"
                class="btn primary"
                data-action="curriculum-3d-play-sound"
                onclick={() => onPlaySoundPrompt?.()}
              >
                🔊 Прослушать C4 → цель
              </button>
              {#each ALL_WHITE_CURRICULUM_NOTES as n (n)}
                <span class="first-run-pill {state.targetNote === n && stepDesc.subStage === 'model' ? 'active' : ''}">
                  {n}4
                </span>
              {/each}
            </div>
          {:else if stepDesc.kind === 'phase4Complete'}
            <div class="first-run-complete-badges" aria-label="Статус изученных чёрных клавиш">
              {#each BLACK_KEY_ACQUISITION_ORDER as n (n)}
                <span class="first-run-status-chip">{DISPLAY_NAMES[n]} · активна</span>
              {/each}
            </div>
          {:else if stepDesc.kind === 'phase5Complete'}
            <div class="first-run-complete-badges" aria-label="Статус нот">
              {#each ALL_WHITE_CURRICULUM_NOTES as n (n)}
                <span class="first-run-status-chip">{n}4 · активна</span>
              {/each}
            </div>
          {:else if stepDesc.kind === 'phase6Complete'}
            <div class="graduation-checklist-card" aria-label="Освоенные навыки">
              <div class="graduation-subtitle">Вы освоили:</div>
              <ul class="graduation-items">
                <li><span class="check">✓</span><span class="graduation-item-copy">расположение белых клавиш</span></li>
                <li><span class="check">✓</span><span class="graduation-item-copy">чёрные клавиши</span></li>
                <li><span class="check">✓</span><span class="graduation-item-copy">чтение нот</span></li>
                <li><span class="check">✓</span><span class="graduation-item-copy">относительный слух</span></li>
              </ul>
            </div>
          {:else}
            <div class="first-run-progress-pills" aria-label="Прогресс чёрных клавиш">
              {#each BLACK_KEY_ACQUISITION_ORDER as n (n)}
                {@const rec = state.progress[getBlackKeyCurriculumItemId(n)]}
                {@const isDone = rec?.state === 'retention' && !rec?.contexts.includes('pending:delayedRetry')}
                {@const isActive = stepDesc.focusBlackNote === n || state.targetNote === n}
                <span class="first-run-pill {isDone ? 'done' : isActive ? 'active' : ''}">
                  {DISPLAY_NAMES[n]} {isDone ? '✓' : ''}
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <div class="feedback-wrap no-reaction-panel first-run-feedback-bar">
          <div class="feedback {state.feedbackTone} first-run-feedback-text">
            {state.feedbackText || defaultHintPrompt}
          </div>
          <div class="feedback-actions">
            {#if stepDesc.kind === 'phase4Complete'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="curriculum-phase4-complete"
                onclick={() => onAdvancePhase?.()}
              >
                Перейти к этапу 5 (Нотный стан C4–B4) →
              </button>
            {:else if stepDesc.kind === 'phase5Complete'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="curriculum-phase5-complete"
                onclick={() => onAdvancePhase?.()}
              >
                Перейти к этапу 6 (Относительный слух) →
              </button>
            {:else if stepDesc.kind === 'phase6Complete'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="curriculum-phase6-complete"
                onclick={() => onAdvancePhase?.()}
              >
                Начать ежедневную тренировку →
              </button>
            {:else if showDontKnowButton}
              <button
                type="button"
                class="btn feedback-action-btn"
                data-action="curriculum-3d-dont-know"
                onclick={() => onDontKnow?.()}
              >
                Не знаю · показать ориентир
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
