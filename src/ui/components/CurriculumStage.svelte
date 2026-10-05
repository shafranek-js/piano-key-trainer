<script lang="ts">
  import { DISPLAY_NAMES } from '../../core/fsrs/constants';
  import type { NoteName } from '../../core/fsrs/types';
  import {
    ALL_WHITE_CURRICULUM_NOTES,
    WHITE_KEY_CURRICULUM_ITEM_IDS,
    WHITE_KEY_GEOMETRY,
    canUseDontKnowInCurriculumStep,
    describeCurriculumStep,
    getCurriculumDiagramSpec,
    getMixTargetForNote,
    getNoteCurriculumItemId,
    getNoteMixCurriculumItemId,
    getUnhintedWhiteNoteContexts,
    getWhiteKeyCurriculumStepProgress,
    type WhiteKeyCurriculumState
  } from '../../core/learning/curriculumFlow';

  let {
    state,
    wrongAnswerNotes = [] as NoteName[],
    correctAnswerNotes = [] as NoteName[],
    onAnswerClick,
    onDontKnow,
    onCompletePhase3
  }: {
    state: WhiteKeyCurriculumState;
    wrongAnswerNotes?: NoteName[];
    correctAnswerNotes?: NoteName[];
    onAnswerClick?: (note: NoteName) => void;
    onDontKnow?: () => void;
    onCompletePhase3?: () => void;
  } = $props();

  const stepDesc = $derived(describeCurriculumStep(state.step));
  const stepProgress = $derived(getWhiteKeyCurriculumStepProgress(state));
  const diagramSpec = $derived(getCurriculumDiagramSpec(state));
  const showDontKnowButton = $derived(canUseDontKnowInCurriculumStep(state));

  const focusNoteRecord = $derived(
    stepDesc.focusNote
      ? state.progress[getNoteCurriculumItemId(stepDesc.focusNote)]
      : undefined
  );
  const guidedSuccessCount = $derived(focusNoteRecord?.guidedSuccesses ?? 0);
  const qualifyRegionCount = $derived(
    getUnhintedWhiteNoteContexts(focusNoteRecord).length
  );

  const mixSuccessCount = $derived.by(() => {
    if (stepDesc.kind === 'allWhiteMix') {
      return (
        state.progress[WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE]
          ?.independentUnhintedSuccesses ?? 0
      );
    }
    if (stepDesc.focusNote) {
      return (
        state.progress[getNoteMixCurriculumItemId(stepDesc.focusNote)]
          ?.independentUnhintedSuccesses ?? 0
      );
    }
    return 0;
  });

  const mixTargetCount = $derived.by(() => {
    if (stepDesc.kind === 'allWhiteMix') {
      return state.config.allWhiteMixTarget;
    }
    if (stepDesc.focusNote) {
      return getMixTargetForNote(stepDesc.focusNote, state.config);
    }
    return state.config.localMixSuccessTarget;
  });

  const eyebrowText = $derived.by(() => {
    const badge = stepProgress.whiteKeysBadgeText.toUpperCase();
    if (stepDesc.kind === 'complete') {
      return `${badge} · ЭТАП 3 ЗАВЕРШЁН`;
    }
    if (stepDesc.kind === 'allWhiteMix') {
      return `${badge} · ИТОГОВОЕ СМЕШИВАНИЕ C–B`;
    }
    if (stepDesc.kind === 'identifyMix') {
      return `${badge} · РАСПОЗНАВАНИЕ`;
    }
    switch (stepDesc.subStage) {
      case 'model':
        return `${badge} · НОВЫЙ ОРИЕНТИР`;
      case 'guided':
        return `${badge} · ПО ОРИЕНТИРУ ЧЁРНЫХ`;
      case 'qualify':
        return `${badge} · БЕЗ ПОДСКАЗОК`;
      case 'localMix':
        return `${badge} · СРАВНЕНИЕ В СЕМЕЙСТВЕ`;
      case 'delayedCheck':
      default:
        return state.isInterveningRecall
          ? `${badge} · КОНТРАСТНЫЙ ШАГ`
          : `${badge} · ПРОВЕРКА ПО ПАМЯТИ`;
    }
  });

  const titleHtml = $derived.by(() => {
    if (stepDesc.kind === 'complete') {
      return 'Все 7 белых клавиш освоены';
    }
    if (stepDesc.kind === 'identifyMix') {
      return 'Как называется эта клавиша?';
    }
    if (stepDesc.kind === 'allWhiteMix') {
      const target = state.targetNote ?? 'C';
      return `Найдите <span class="note">${DISPLAY_NAMES[target]}</span>`;
    }
    const focus = stepDesc.focusNote ?? 'D';
    const spec = WHITE_KEY_GEOMETRY[focus];
    switch (stepDesc.subStage) {
      case 'model':
        return spec.modelTitle;
      case 'guided':
        return `Найдите <span class="note">${focus}</span> рядом с подсвеченной группой.`;
      case 'qualify':
        return `Теперь найдите <span class="note">${focus}</span> в разных частях клавиатуры.`;
      case 'localMix': {
        const target = state.targetNote ?? focus;
        return `Найдите <span class="note">${DISPLAY_NAMES[target]}</span>`;
      }
      case 'delayedCheck':
      default: {
        const target = state.targetNote ?? focus;
        return `Найдите <span class="note">${DISPLAY_NAMES[target]}</span>.`;
      }
    }
  });

  const bodyText = $derived.by(() => {
    if (stepDesc.kind === 'complete') {
      return 'Вы уверенно находите и называете все белые клавиши C, D, E, F, G, A, B по группам из 2 и 3 чёрных клавиш.';
    }
    if (stepDesc.kind === 'identifyMix') {
      if (state.step === 'cdeIdentify') {
        return 'Определите клавишу в группе из 2 чёрных (C — слева, D — между, E — справа) и выберите ответ.';
      }
      if (state.step === 'fbIdentify') {
        return 'Определите границу группы из 3 чёрных клавиш (F — слева, B — справа) и выберите ответ.';
      }
      if (state.step === 'fgabIdentify') {
        return 'Определите клавишу в семействе из 3 чёрных (F, G, A или B) и выберите её название.';
      }
      return 'Определите подсвеченную белую клавишу по её положению относительно 2 или 3 чёрных клавиш.';
    }
    if (stepDesc.kind === 'allWhiteMix') {
      return 'Различайте все 7 белых клавиш (C–B) по группам из 2 и 3 чёрных клавиш в разных октавах.';
    }
    const focus = stepDesc.focusNote ?? 'D';
    const spec = WHITE_KEY_GEOMETRY[focus];
    switch (stepDesc.subStage) {
      case 'model':
        return focus === 'D'
          ? `Ориентиры C и F готовы. Теперь заполним пространство между двумя чёрными клавишами: ${spec.modelBody}`
          : spec.modelBody;
      case 'guided':
        return spec.guidedBody;
      case 'qualify':
        return spec.qualifyBody;
      case 'localMix':
        if (focus === 'D') {
          return 'Сравнивайте C (слева от 2 чёрных), D (между 2 чёрными) и опорную F (слева от 3 чёрных).';
        }
        if (focus === 'E') {
          return 'Различайте всё семейство группы из 2 чёрных клавиш: C (слева), D (между), E (справа) в разных октавах.';
        }
        if (focus === 'B') {
          return 'Сравнивайте границы группы из 3 чёрных (F — слева, B — справа) и уже изученные клавиши C/D/E.';
        }
        if (focus === 'G') {
          return 'Различайте F (слева от 3 чёрных), G (первая внутри 3 чёрных) и B (справа от 3 чёрных).';
        }
        return 'Различайте всё семейство группы из 3 чёрных клавиш: F (слева), G (первая внутри), A (вторая внутри), B (справа).';
      case 'delayedCheck':
      default:
        return state.isInterveningRecall
          ? 'Сначала найдите эту опорную клавишу без подсказки, а затем повторим проверку по памяти.'
          : 'Финальная проверка без подсказок: вспомните геометрический ориентир и нажмите клавишу на пианино.';
    }
  });

  const defaultHintPrompt = $derived.by(() => {
    if (stepDesc.kind === 'complete') {
      return 'Все 7 белых клавиш (найти и назвать) активны в тренировке. Далее открывается Этап 4 (Чёрные клавиши).';
    }
    if (stepDesc.kind === 'identifyMix') {
      return `Распознано клавиш: ${state.identifyCompletedNotes.length} из ${state.answerPool.length}. Выберите кнопку или нажмите клавишу на клавиатуре ПК.`;
    }
    if (stepDesc.kind === 'allWhiteMix') {
      return `Итоговое смешивание всех белых клавиш: ${mixSuccessCount} из ${mixTargetCount}`;
    }
    const focus = stepDesc.focusNote ?? 'D';
    const spec = WHITE_KEY_GEOMETRY[focus];
    switch (stepDesc.subStage) {
      case 'model':
        return spec.modelPrompt;
      case 'guided':
        return `${spec.guidedPrompt} (${guidedSuccessCount} из ${state.config.guidedSuccessTarget})`;
      case 'qualify':
        return `Найдено в разных областях клавиатуры: ${qualifyRegionCount} из ${state.config.qualifySuccessTarget}`;
      case 'localMix':
        return `Самостоятельные ответы с 1-й попытки: ${mixSuccessCount} из ${mixTargetCount}`;
      case 'delayedCheck':
      default:
        return state.isInterveningRecall
          ? `Контрастный шаг перед повторной проверкой ${DISPLAY_NAMES[focus]}.`
          : `Нажмите клавишу ${DISPLAY_NAMES[focus]} на пианино внизу без подсказки.`;
    }
  });
</script>

<section
  class="operation-stage first-run-stage curriculum-3c-stage"
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

        <!-- Middle Compact Pedagogical Visual / Action Slot -->
        <div class="first-run-visual-slot">
          {#if diagramSpec.kind === 'landmark'}
            <div
              class="landmark-diagram {diagramSpec.blackGroupSize === 2 ? 'anchor-c-diagram' : 'anchor-f-diagram'}"
              aria-label={diagramSpec.groupTitle ?? 'Схема ориентира'}
            >
              <div class="landmark-group-box">
                <span class="landmark-bracket">{diagramSpec.groupTitle}</span>
                {#if diagramSpec.blackGroupSize === 2}
                  <div class="mini-octave-keys">
                    {#each [0, 1, 2] as idx (idx)}
                      {#if diagramSpec.highlightTargetWhite && diagramSpec.targetWhiteIndex === idx && diagramSpec.targetWhiteLabel}
                        <span class="mini-white highlight-white" data-mini-white-index={idx}>
                          <strong>{diagramSpec.targetWhiteLabel}</strong>
                        </span>
                      {:else}
                        <span class="mini-white" data-mini-white-index={idx}></span>
                      {/if}
                    {/each}
                    <span class="mini-black b2-1 highlight-black"></span>
                    <span class="mini-black b2-2 highlight-black"></span>
                  </div>
                {:else}
                  <div class="mini-octave-keys four-whites">
                    {#each [0, 1, 2, 3] as idx (idx)}
                      {#if diagramSpec.highlightTargetWhite && diagramSpec.targetWhiteIndex === idx && diagramSpec.targetWhiteLabel}
                        <span class="mini-white highlight-white" data-mini-white-index={idx}>
                          <strong>{diagramSpec.targetWhiteLabel}</strong>
                        </span>
                      {:else}
                        <span class="mini-white" data-mini-white-index={idx}></span>
                      {/if}
                    {/each}
                    <span class="mini-black b3-1 highlight-black"></span>
                    <span class="mini-black b3-2 highlight-black"></span>
                    <span class="mini-black b3-3 highlight-black"></span>
                  </div>
                {/if}
                {#if diagramSpec.caption}
                  <span class="landmark-arrow-caption">{diagramSpec.caption}</span>
                {/if}
              </div>
            </div>
            {#if stepDesc.kind === 'identifyMix'}
              <div class="answers first-run-identify-answers" aria-label="Варианты ответа">
                {#each state.answerPool as n (n)}
                  <button
                    type="button"
                    class="answer-btn first-run-answer-btn {wrongAnswerNotes.includes(n) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(n) ? 'correct-pulse' : ''}"
                    data-answer-note={n}
                    onclick={() => onAnswerClick?.(n)}
                  >
                    {DISPLAY_NAMES[n]}
                  </button>
                {/each}
              </div>
            {/if}
          {:else if stepDesc.kind === 'identifyMix'}
            <div class="answers first-run-identify-answers" aria-label="Варианты ответа">
              {#each state.answerPool as n (n)}
                <button
                  type="button"
                  class="answer-btn first-run-answer-btn {wrongAnswerNotes.includes(n) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(n) ? 'correct-pulse' : ''}"
                  data-answer-note={n}
                  onclick={() => onAnswerClick?.(n)}
                >
                  {DISPLAY_NAMES[n]}
                </button>
              {/each}
            </div>
          {:else if stepDesc.kind === 'complete'}
            <div class="first-run-complete-badges" aria-label="Статус изученных белых клавиш">
              {#each ALL_WHITE_CURRICULUM_NOTES as n (n)}
                <span class="first-run-status-chip">{n} · активна</span>
              {/each}
            </div>
          {:else if stepDesc.subStage === 'qualify'}
            <div class="first-run-progress-pills" aria-label="Прогресс по регионам клавиатуры">
              {#each Array(state.config.qualifySuccessTarget) as _, idx (idx)}
                <span
                  class="first-run-pill {idx < qualifyRegionCount ? 'done' : idx === qualifyRegionCount ? 'active' : ''}"
                >
                  {idx + 1}-я область клавиатуры {idx < qualifyRegionCount ? '✓' : ''}
                </span>
              {/each}
            </div>
          {:else if stepDesc.subStage === 'localMix' || stepDesc.kind === 'allWhiteMix'}
            <div class="first-run-progress-pills" aria-label="Прогресс смешанной тренировки">
              {#each Array(mixTargetCount) as _, idx (idx)}
                <span
                  class="first-run-pill {idx < mixSuccessCount ? 'done' : idx === mixSuccessCount ? 'active' : ''}"
                >
                  {idx < mixSuccessCount ? '✓' : idx + 1}
                </span>
              {/each}
            </div>
          {:else}
            <div class="first-run-progress-pills" aria-label="Прогресс белых клавиш">
              {#each ALL_WHITE_CURRICULUM_NOTES as n (n)}
                {@const rec = state.progress[getNoteCurriculumItemId(n)]}
                {@const isDone = rec?.state === 'retention' && !rec?.contexts.includes('pending:delayedRetry')}
                {@const isActive = stepDesc.focusNote === n}
                <span class="first-run-pill {isDone ? 'done' : isActive ? 'active' : ''}">
                  {n} {isDone ? '✓' : ''}
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Bottom Status & Action Bar (No countdown timer, no latency pressure) -->
        <div class="feedback-wrap no-reaction-panel first-run-feedback-bar">
          <div class="feedback {state.feedbackTone} first-run-feedback-text">
            {state.feedbackText || defaultHintPrompt}
          </div>
          <div class="feedback-actions">
            {#if stepDesc.kind === 'complete'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="curriculum-phase3-complete"
                onclick={() => onCompletePhase3?.()}
              >
                Перейти к тренировке всех белых клавиш →
              </button>
            {:else if showDontKnowButton}
              <button
                type="button"
                class="btn feedback-action-btn"
                data-action="curriculum-dont-know"
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
