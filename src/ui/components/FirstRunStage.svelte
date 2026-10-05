<script lang="ts">
  import { DISPLAY_NAMES } from '../../core/fsrs/constants';
  import type { NoteName } from '../../core/fsrs/types';
  import {
    CF_MIX_SUCCESS_TARGET,
    FIRST_RUN_CF_ITEM_IDS,
    FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET,
    canUseDontKnowInFirstRunStep,
    getFirstRunDiagramSpec,
    getUnhintedAnchorContexts,
    type FirstRunCfState
  } from '../../core/learning/firstRunCf';

  let {
    state,
    wrongAnswerNotes = [] as NoteName[],
    correctAnswerNotes = [] as NoteName[],
    onContinue,
    onAnswerClick,
    onDontKnow,
    onCompleteFirstRun
  }: {
    state: FirstRunCfState;
    wrongAnswerNotes?: NoteName[];
    correctAnswerNotes?: NoteName[];
    onContinue?: () => void;
    onAnswerClick?: (note: NoteName) => void;
    onDontKnow?: () => void;
    onCompleteFirstRun?: () => void;
  } = $props();

  const cQualifyCount = $derived(
    getUnhintedAnchorContexts(state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_C]).length
  );
  const fQualifyCount = $derived(
    getUnhintedAnchorContexts(state.progress[FIRST_RUN_CF_ITEM_IDS.ANCHOR_F]).length
  );
  const mixTotalSuccesses = $derived(state.mixCSuccesses + state.mixFSuccesses);
  const diagramSpec = $derived(getFirstRunDiagramSpec(state));

  const eyebrowText = $derived.by(() => {
    switch (state.step) {
      case 'orientation':
      case 'cModel':
      case 'cGuided':
      case 'fModel':
      case 'fGuided':
        return 'ОБУЧЕНИЕ';
      case 'cQualify':
      case 'fQualify':
        return 'ОБУЧЕНИЕ · БЕЗ ПОДСКАЗОК';
      case 'cfMix':
        return 'ОБУЧЕНИЕ · СРАВНЕНИЕ C И F';
      case 'cfIdentify':
        return 'ОБУЧЕНИЕ · РАСПОЗНАВАНИЕ';
      case 'delayedC':
      case 'delayedF':
        return state.isInterveningRecall
          ? 'ОБУЧЕНИЕ · КОНТРАСТНЫЙ ШАГ'
          : 'ОБУЧЕНИЕ · ПРОВЕРКА ПО ПАМЯТИ';
      case 'complete':
        return 'ОБУЧЕНИЕ · ГОТОВО';
    }
  });

  const titleHtml = $derived.by(() => {
    switch (state.step) {
      case 'orientation':
        return 'Клавиатура повторяется';
      case 'cModel':
        return 'Первый ориентир: <span class="note">C · До</span>';
      case 'cGuided':
        return 'Найдите <span class="note">C</span> рядом с этой группой.';
      case 'cQualify':
        return 'Теперь найдите <span class="note">C</span> в другой части клавиатуры.';
      case 'fModel':
        return 'Второй ориентир: <span class="note">F · Фа</span>';
      case 'fGuided':
        return 'Найдите <span class="note">F</span> рядом с этой группой.';
      case 'fQualify':
        return 'Теперь найдите <span class="note">F</span> в другой части клавиатуры.';
      case 'cfMix':
        return `Найдите <span class="note">${state.targetNote ?? 'C'}</span>`;
      case 'cfIdentify':
        return 'Как называется эта клавиша?';
      case 'delayedC':
      case 'delayedF':
        return `Найдите <span class="note">${state.targetNote ?? (state.step === 'delayedC' ? 'C' : 'F')}</span>.`;
      case 'complete':
        return 'Два ориентира готовы';
    }
  });

  const bodyText = $derived.by(() => {
    switch (state.step) {
      case 'orientation':
        return 'Чёрные клавиши образуют группы из 2 и 3. По ним легко находить белые клавиши.';
      case 'cModel':
        return 'Найдите группу из 2 чёрных клавиш. Белая клавиша сразу слева — это C. Нажмите любую подсвеченную C на пианино ниже.';
      case 'cGuided':
        return 'На пианино подсвечена группа из 2 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.';
      case 'cQualify':
        return 'Подсказки убраны: найдите любую группу из 2 чёрных клавиш и нажмите белую клавишу слева.';
      case 'fModel':
        return 'Найдите группу из 3 чёрных клавиш. Белая клавиша сразу слева — это F. Нажмите любую подсвеченную F на пианино ниже.';
      case 'fGuided':
        return 'На пианино подсвечена группа из 3 чёрных клавиш. Нажмите белую клавишу сразу слева от неё.';
      case 'fQualify':
        return 'Подсказки убраны: найдите любую группу из 3 чёрных клавиш и нажмите белую клавишу слева.';
      case 'cfMix':
        return 'Различайте ориентиры по группе из 2 или 3 чёрных клавиш и нажимайте нужную клавишу на пианино.';
      case 'cfIdentify':
        return 'Посмотрите на группу чёрных клавиш справа от подсвеченной клавиши и выберите её название.';
      case 'delayedC':
      case 'delayedF':
        return state.isInterveningRecall
          ? 'Сначала найдите эту опорную клавишу без подсказки, а затем повторим финальную проверку.'
          : 'Финальная проверка без подсказок: вспомните ориентир и нажмите клавишу на пианино.';
      case 'complete':
        return 'Вы умеете находить C по паре чёрных клавиш и F по тройке.';
    }
  });

  const showDontKnowButton = $derived(canUseDontKnowInFirstRunStep(state));

  const defaultHintPrompt = $derived.by(() => {
    switch (state.step) {
      case 'orientation':
        return 'Посмотрите на чередование групп из 2 и 3 чёрных клавиш и нажмите «Продолжить».';
      case 'cModel':
        return 'Нажмите любую подсвеченную клавишу C на клавиатуре пианино внизу.';
      case 'cGuided':
        return 'Ориентир: 2 чёрные клавиши → белая сразу слева.';
      case 'cQualify':
        return `Найдено в разных частях клавиатуры: ${cQualifyCount} из ${FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET}`;
      case 'fModel':
        return 'Нажмите любую подсвеченную клавишу F на клавиатуре пианино внизу.';
      case 'fGuided':
        return 'Ориентир: 3 чёрные клавиши → белая сразу слева.';
      case 'fQualify':
        return `Найдено в разных частях клавиатуры: ${fQualifyCount} из ${FIRST_RUN_CF_QUALIFY_CONTEXT_TARGET}`;
      case 'cfMix':
        return `Самостоятельные ответы с 1-й попытки: ${mixTotalSuccesses} из ${CF_MIX_SUCCESS_TARGET}`;
      case 'cfIdentify':
        return 'Выберите кнопку ответа или нажмите C / F на клавиатуре компьютера.';
      case 'delayedC':
      case 'delayedF':
        return 'Нажмите нужную клавишу на пианино внизу без подсказки.';
      case 'complete':
        return 'Оба ориентира добавлены в вашу тренировку.';
    }
  });
</script>

<section class="operation-stage first-run-stage" data-first-run-step={state.step}>
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
          {#if diagramSpec.kind === 'orientation'}
            <div class="landmark-diagram orientation-diagram" aria-label="Схема групп из 2 и 3 чёрных клавиш">
              <div class="landmark-group-box">
                <span class="landmark-bracket">Группа из 2 чёрных</span>
                <div class="mini-octave-keys">
                  <span class="mini-white"></span>
                  <span class="mini-white"></span>
                  <span class="mini-white"></span>
                  <span class="mini-black b2-1 highlight-black"></span>
                  <span class="mini-black b2-2 highlight-black"></span>
                </div>
              </div>
              <div class="landmark-group-box">
                <span class="landmark-bracket">Группа из 3 чёрных</span>
                <div class="mini-octave-keys four-whites">
                  <span class="mini-white"></span>
                  <span class="mini-white"></span>
                  <span class="mini-white"></span>
                  <span class="mini-white"></span>
                  <span class="mini-black b3-1 highlight-black"></span>
                  <span class="mini-black b3-2 highlight-black"></span>
                  <span class="mini-black b3-3 highlight-black"></span>
                </div>
              </div>
            </div>
          {:else if diagramSpec.kind === 'landmark'}
            <div
              class="landmark-diagram {diagramSpec.blackGroupSize === 2 ? 'anchor-c-diagram' : 'anchor-f-diagram'}"
              aria-label={diagramSpec.groupTitle ?? 'Схема ориентира'}
            >
              <div class="landmark-group-box">
                <span class="landmark-bracket">{diagramSpec.groupTitle}</span>
                {#if diagramSpec.blackGroupSize === 2}
                  <div class="mini-octave-keys">
                    {#if diagramSpec.highlightTargetWhite && diagramSpec.targetWhiteLabel}
                      <span class="mini-white highlight-white">
                        <strong>{diagramSpec.targetWhiteLabel}</strong>
                      </span>
                    {:else}
                      <span class="mini-white"></span>
                    {/if}
                    <span class="mini-white"></span>
                    <span class="mini-white"></span>
                    <span class="mini-black b2-1 highlight-black"></span>
                    <span class="mini-black b2-2 highlight-black"></span>
                  </div>
                {:else}
                  <div class="mini-octave-keys four-whites">
                    {#if diagramSpec.highlightTargetWhite && diagramSpec.targetWhiteLabel}
                      <span class="mini-white highlight-white">
                        <strong>{diagramSpec.targetWhiteLabel}</strong>
                      </span>
                    {:else}
                      <span class="mini-white"></span>
                    {/if}
                    <span class="mini-white"></span>
                    <span class="mini-white"></span>
                    <span class="mini-white"></span>
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
            {#if state.step === 'cfIdentify'}
              <div class="answers first-run-identify-answers" aria-label="Варианты ответа C или F">
                {#each (['C', 'F'] as NoteName[]) as n (n)}
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
          {:else if state.step === 'cfIdentify'}
            <div class="answers first-run-identify-answers" aria-label="Варианты ответа C или F">
              {#each (['C', 'F'] as NoteName[]) as n (n)}
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
          {:else if state.step === 'complete'}
            <div class="first-run-complete-badges" aria-label="Статус изученных ориентиров">
              <span class="first-run-status-chip">C · изучается</span>
              <span class="first-run-status-chip">F · изучается</span>
            </div>
          {:else if state.step === 'cQualify' || state.step === 'fQualify'}
            {@const currentCount = state.step === 'cQualify' ? cQualifyCount : fQualifyCount}
            <div class="first-run-progress-pills" aria-label="Прогресс по регионам клавиатуры">
              <span class="first-run-pill {currentCount >= 1 ? 'done' : 'active'}">
                1-я область клавиатуры {currentCount >= 1 ? '✓' : ''}
              </span>
              <span class="first-run-pill {currentCount >= 2 ? 'done' : currentCount === 1 ? 'active' : ''}">
                2-я область клавиатуры {currentCount >= 2 ? '✓' : ''}
              </span>
            </div>
          {:else if state.step === 'cfMix'}
            <div class="first-run-progress-pills" aria-label="Прогресс смешанной тренировки">
              {#each Array(CF_MIX_SUCCESS_TARGET) as _, idx (idx)}
                <span class="first-run-pill {idx < mixTotalSuccesses ? 'done' : idx === mixTotalSuccesses ? 'active' : ''}">
                  {idx < mixTotalSuccesses ? '✓' : idx + 1}
                </span>
              {/each}
            </div>
          {:else}
            <div class="first-run-progress-pills" aria-label="Финальная проверка ориентиров">
              <span class="first-run-pill {state.delayedCompletedNotes.includes('C') ? 'done' : state.step === 'delayedC' ? 'active' : ''}">
                Ориентир C {state.delayedCompletedNotes.includes('C') ? '✓' : ''}
              </span>
              <span class="first-run-pill {state.delayedCompletedNotes.includes('F') ? 'done' : state.step === 'delayedF' ? 'active' : ''}">
                Ориентир F {state.delayedCompletedNotes.includes('F') ? '✓' : ''}
              </span>
            </div>
          {/if}
        </div>

        <!-- Bottom Status & Action Bar (No countdown timer, no latency pressure) -->
        <div class="feedback-wrap no-reaction-panel first-run-feedback-bar">
          <div class="feedback {state.feedbackTone} first-run-feedback-text">
            {state.feedbackText || defaultHintPrompt}
          </div>
          <div class="feedback-actions">
            {#if state.step === 'orientation'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="first-run-continue"
                onclick={() => onContinue?.()}
              >
                Продолжить →
              </button>
            {:else if state.step === 'complete'}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                data-action="first-run-complete"
                onclick={() => onCompleteFirstRun?.()}
              >
                Продолжить тренировку
              </button>
            {:else if showDontKnowButton}
              <button
                type="button"
                class="btn feedback-action-btn"
                data-action="first-run-dont-know"
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
