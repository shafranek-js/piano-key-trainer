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

          {#if isCompleted}
            <div class="auto-advance-wrap" style="width:100%; display:flex; flex-direction:column; gap:6px; margin-top:6px;">
              {#if autoAdvanceCountdown != null && autoAdvanceCountdown > 0}
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted);">
                  <span>Следующее задание через <b>{autoAdvanceCountdown.toFixed(1)} с</b>…</span>
                  <span style="opacity:0.8; font-size:11px;">Пробел для пропуска</span>
                </div>
                <div style="width:100%; height:4px; background:rgba(255,255,255,0.12); border-radius:999px; overflow:hidden;">
                  <div style="height:100%; background:var(--accent); width:{(autoAdvanceCountdown / (autoAdvanceTotal || 3)) * 100}%; transition:width 0.1s linear;"></div>
                </div>
              {/if}
              <button
                type="button"
                class="btn primary"
                style="margin-top:4px; width:100%; font-size:14px;"
                onclick={() => onNextQuestion?.()}
              >
                Следующее задание → <small style="opacity:0.8; font-weight:normal;">(Пробел или Enter)</small>
              </button>
            </div>
          {:else if showDontKnow}
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
