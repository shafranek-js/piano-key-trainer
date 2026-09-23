<script lang="ts">
  import { SHORT_NAMES, DISPLAY_NAMES } from '../../core/fsrs/constants';
  import type { NoteName } from '../../core/fsrs/types';

  let {
    eyebrow = 'Задание',
    promptText = '',
    instructionText = '',
    reactionTime = '0,0 с',
    reactionStatus = 'калибровка',
    reactionClass = '',
    feedbackText = '',
    feedbackClass = '',
    showSoundRepeat = false,
    showDontKnow = true,
    dontKnowDisabled = false,
    showAnswerButtons = false,
    answerNotes = [] as NoteName[],
    onAnswerClick,
    onDontKnow,
    onReplaySound
  } = $props();
</script>

<section class="operation-stage" id="operationStage">
  <div class="operation-inner">
    <section class="challenge">
      <div class="challenge-inner">
        <div class="prompt-wrap">
          <div class="eyebrow">{eyebrow}</div>
          <div class="prompt">
            <!-- Render HTML or slot for custom prompt (e.g. staff) -->
            {@html promptText}
          </div>
          <div class="instruction">{instructionText}</div>
        </div>

        <div class="feedback-wrap">
          <div class="reaction-panel {reactionClass}" aria-label="Время реакции">
            <span>⏱ Время ответа</span>
            <b>{reactionTime}</b>
            <small>{reactionStatus}</small>
          </div>

          {#if feedbackText}
            <div class="feedback {feedbackClass}" aria-live="polite">
              {feedbackText}
            </div>
          {/if}

          {#if showSoundRepeat}
            <button type="button" class="btn" onclick={() => onReplaySound?.()}>
              🔊 Повторить звук
            </button>
          {/if}

          {#if showDontKnow}
            <button
              type="button"
              class="btn warn"
              disabled={dontKnowDisabled}
              onclick={() => onDontKnow?.()}
            >
              Не знаю <small style="opacity:0.75">(Enter)</small>
            </button>
          {/if}
        </div>
      </div>
    </section>

    {#if showAnswerButtons}
      <div class="below">
        <section class="card" id="answersCard">
          <h2>Ответ</h2>
          <div class="note-buttons">
            {#each answerNotes as note (note)}
              <button
                type="button"
                class="answer-btn"
                aria-label={DISPLAY_NAMES[note]}
                onclick={() => onAnswerClick?.(note)}
              >
                {SHORT_NAMES[note]}
              </button>
            {/each}
          </div>
          <div class="answer-hotkeys-hint">Клавиатура: C–B или 1–7 · Shift + C/D/F/G/A = ♯</div>
        </section>
      </div>
    {/if}
  </div>
</section>
