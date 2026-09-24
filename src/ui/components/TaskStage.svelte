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
    showReactionPanel = true,
    feedbackText = '',
    feedbackClass = '',
    showSoundRepeat = false,
    showDontKnow = true,
    dontKnowDisabled = false,
    showAnswerButtons = false,
    answerNotes = [] as NoteName[],
    wrongAnswerNotes = [] as NoteName[],
    correctAnswerNotes = [] as NoteName[],
    isCompleted = false,
    autoAdvanceCountdown = null as number | null,
    autoAdvanceTotal = 3.0,
    onAnswerClick,
    onDontKnow,
    onReplaySound,
    onNextQuestion
  } = $props();
</script>

<section class="operation-stage" id="operationStage">
  <div class="operation-inner">
    <section class="challenge">
      <div class="challenge-inner">
        <div class="prompt-wrap">
          <div class="eyebrow">{eyebrow}</div>
          {#if promptText}
            <div class="prompt">
              {@html promptText}
            </div>
          {/if}
          <div class="instruction" title={instructionText}>{instructionText}</div>
        </div>

        <div class="feedback-wrap {showReactionPanel ? '' : 'no-reaction-panel'}">
          {#if showReactionPanel}
            <div class="reaction-panel {reactionClass}" id="reactionPanel" aria-label="Время реакции">
              <span>⏱ Время ответа</span>
              <b>{reactionTime}</b>
              <small id="reactionStatus">{reactionStatus}</small>
            </div>
          {/if}

          <div class="feedback {feedbackClass}" aria-live="polite" title={feedbackText}>
            {feedbackText}
          </div>

          <div class="feedback-actions">
            {#if showSoundRepeat}
              <button
                type="button"
                class="btn feedback-action-btn"
                id="replaySoundBtn"
                onclick={() => onReplaySound?.()}
              >
                🔊 Повторить звук
              </button>
            {/if}

            {#if isCompleted}
              <button
                type="button"
                class="btn primary feedback-action-btn next-question-inline-btn"
                onclick={() => onNextQuestion?.()}
              >
                <span>Следующее →</span>
                {#if autoAdvanceCountdown != null && autoAdvanceCountdown > 0}
                  <small class="inline-countdown">({autoAdvanceCountdown.toFixed(1)} с)</small>
                {:else}
                  <small style="opacity:0.85; font-weight:normal;">(Пробел)</small>
                {/if}
              </button>
            {:else if showDontKnow}
              <button
                type="button"
                class="btn warn feedback-action-btn"
                id="dontKnowBtn"
                disabled={dontKnowDisabled}
                onclick={() => onDontKnow?.()}
              >
                Не знаю <small style="opacity:0.75">(Enter)</small>
              </button>
            {/if}
          </div>
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
                class="answer-btn {wrongAnswerNotes.includes(note) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(note) ? 'correct-pulse' : ''}"
                aria-label={DISPLAY_NAMES[note]}
                onclick={() => onAnswerClick?.(note)}
              >
                <span class="note-latin">{SHORT_NAMES[note]}</span>
                <small class="note-ru">{DISPLAY_NAMES[note]}</small>
              </button>
            {/each}
          </div>
          <div class="answer-hotkeys-hint">Клавиатура: буквы C–B или цифры 1–7 · Shift + C/D/F/G/A = ♯</div>
        </section>
      </div>
    {/if}
  </div>
</section>
