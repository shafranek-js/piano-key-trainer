<script lang="ts">
  import { onMount } from 'svelte';
  import { DISPLAY_NAMES } from '../../core/fsrs/constants';
  import type { NoteName } from '../../core/fsrs/types';
  import {
    getIdentifyAnswerSet,
    getIdentifyButtonLabel
  } from '../../core/input/inputPolicy';

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
    onAnswerClick = (_note: NoteName) => {},
    onDontKnow = () => {},
    onReplaySound = () => {},
    onNextQuestion
  } = $props();

  let shiftHeld = $state(false);
  const isIntervalIdentify = $derived(
    answerNotes.length === 4 && answerNotes.includes('P8')
  );
  const isTriadIdentify = $derived(
    answerNotes.length === 2 && (answerNotes.includes('major') || answerNotes.includes('minor'))
  );
  const isTriadInversionIdentify = $derived(
    answerNotes.length === 3 && (answerNotes.includes('root') || answerNotes.includes('first') || answerNotes.includes('second'))
  );

  const INTERVAL_ANSWER_OPTIONS = [
    { id: 'P8', label: 'Октава (P8 · 12 полутонов)', numberKey: '1' },
    { id: 'P5', label: 'Чистая квинта (P5 · 7 полутонов)', numberKey: '2' },
    { id: 'M3', label: 'Большая терция (M3 · 4 полутона)', numberKey: '3' },
    { id: 'm3', label: 'Малая терция (m3 · 3 полутона)', numberKey: '4' }
  ] as const;

  const TRIAD_ANSWER_OPTIONS = [
    { id: 'major', label: 'Мажорное (1)', numberKey: '1' },
    { id: 'minor', label: 'Минорное (2)', numberKey: '2' }
  ] as const;

  const INVERSION_ANSWER_OPTIONS = [
    { id: 'root', label: 'Основное (1)', numberKey: '1' },
    { id: 'first', label: '1-е обращение (2)', numberKey: '2' },
    { id: 'second', label: '2-е обращение (3)', numberKey: '3' }
  ] as const;

  const answerSet = $derived(
    isIntervalIdentify
      ? { notes: ['P8', 'P5', 'M3', 'm3'] as NoteName[], whiteNotes: [], blackNotes: [], hasWhite: false, hasBlack: false, mode: 'white-only' as const, keyboardHint: '' }
      : isTriadIdentify
      ? { notes: ['major', 'minor'] as NoteName[], whiteNotes: [], blackNotes: [], hasWhite: false, hasBlack: false, mode: 'white-only' as const, keyboardHint: 'Цифры 1 или 2 на клавиатуре' }
      : isTriadInversionIdentify
      ? { notes: ['root', 'first', 'second'] as NoteName[], whiteNotes: [], blackNotes: [], hasWhite: false, hasBlack: false, mode: 'white-only' as const, keyboardHint: 'Цифры 1, 2 или 3 на клавиатуре' }
      : getIdentifyAnswerSet({ answerPool: answerNotes })
  );

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld = false;
    };
    const onBlur = () => {
      shiftHeld = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  });
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
      <div class="below {answerSet.mode === 'mixed-chromatic' ? 'has-mixed-chromatic' : ''}">
        <section
          class="card {answerSet.mode === 'mixed-chromatic' ? 'is-mixed-chromatic' : ''} {shiftHeld && answerSet.hasBlack ? 'is-shift-held' : ''}"
          id="answersCard"
          data-answer-mode={isIntervalIdentify ? 'intervals' : answerSet.mode}
        >
          <h2>Ответ</h2>
          {#if isIntervalIdentify}
            <div class="interval-answer-buttons" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-width: 580px; margin: 14px auto 6px auto;">
              {#each INTERVAL_ANSWER_OPTIONS as opt (opt.id)}
                <button
                  type="button"
                  class="btn outline interval-answer-btn {wrongAnswerNotes.includes(opt.id as any) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(opt.id as any) ? 'correct-pulse' : ''}"
                  data-answer-note={opt.id}
                  data-interval-id={opt.id}
                  onclick={() => onAnswerClick?.(opt.id as any)}
                  style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; text-align: left; font-size: 0.95rem;"
                >
                  <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;">
                    {opt.numberKey}
                  </span>
                  <span>{opt.label}</span>
                </button>
              {/each}
            </div>
            <div class="answer-hotkeys-hint">Цифры 1–4 на клавиатуре</div>
          {:else if isTriadIdentify}
            <div class="triad-answer-buttons" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-width: 580px; margin: 14px auto 6px auto;">
              {#each TRIAD_ANSWER_OPTIONS as opt (opt.id)}
                <button
                  type="button"
                  class="btn outline triad-answer-btn {wrongAnswerNotes.includes(opt.id as any) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(opt.id as any) ? 'correct-pulse' : ''}"
                  data-answer-note={opt.id}
                  data-quality-id={opt.id}
                  onclick={() => onAnswerClick?.(opt.id as any)}
                  style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; text-align: left; font-size: 0.95rem;"
                >
                  <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;">
                    {opt.numberKey}
                  </span>
                  <span>{opt.label}</span>
                </button>
              {/each}
            </div>
            <div class="answer-hotkeys-hint">Цифры 1 или 2 на клавиатуре</div>
          {:else if isTriadInversionIdentify}
            <div class="inversion-answer-buttons" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 580px; margin: 14px auto 6px auto;">
              {#each INVERSION_ANSWER_OPTIONS as opt (opt.id)}
                <button
                  type="button"
                  class="btn outline inversion-answer-btn {wrongAnswerNotes.includes(opt.id as any) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(opt.id as any) ? 'correct-pulse' : ''}"
                  data-answer-note={opt.id}
                  data-inversion-id={opt.id}
                  onclick={() => onAnswerClick?.(opt.id as any)}
                  style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; text-align: left; font-size: 0.95rem;"
                >
                  <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;">
                    {opt.numberKey}
                  </span>
                  <span>{opt.label}</span>
                </button>
              {/each}
            </div>
            <div class="answer-hotkeys-hint">Цифры 1, 2 или 3 на клавиатуре</div>
          {:else if answerSet.mode === 'mixed-chromatic'}
            <div class="note-buttons-piano-stack">
              <div class="note-buttons accidental-row {shiftHeld ? 'shift-active' : ''}" aria-label="Чёрные клавиши (диез / бемоль)">
                {#each answerSet.blackNotes as note (note)}
                  {@const label = getIdentifyButtonLabel(note)}
                  <button
                    type="button"
                    class="answer-btn accidental-btn {note === 'F#' ? 'group-3-start' : ''} {shiftHeld ? 'shift-highlight' : ''} {wrongAnswerNotes.includes(note) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(note) ? 'correct-pulse' : ''}"
                    data-answer-note={note}
                    aria-label={DISPLAY_NAMES[note]}
                    onclick={() => onAnswerClick?.(note)}
                  >
                    <span class="note-latin">{label.shortLabel}</span>
                    <small class="note-ru">{label.displayLabel}</small>
                  </button>
                {/each}
              </div>
              <div class="note-buttons natural-row {shiftHeld ? 'shift-dimmed' : ''}" aria-label="Белые клавиши">
                {#each answerSet.whiteNotes as note (note)}
                  {@const label = getIdentifyButtonLabel(note)}
                  <button
                    type="button"
                    class="answer-btn {wrongAnswerNotes.includes(note) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(note) ? 'correct-pulse' : ''}"
                    data-answer-note={note}
                    aria-label={DISPLAY_NAMES[note]}
                    onclick={() => onAnswerClick?.(note)}
                  >
                    <span class="note-latin">{label.shortLabel}</span>
                    <small class="note-ru">{label.displayLabel}</small>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="note-buttons">
              {#each answerSet.notes as note (note)}
                {@const label = getIdentifyButtonLabel(note)}
                <button
                  type="button"
                  class="answer-btn {label.isAccidental ? 'accidental-btn' : ''} {shiftHeld && label.isAccidental ? 'shift-highlight' : ''} {wrongAnswerNotes.includes(note) ? 'wrong-pulse' : ''} {correctAnswerNotes.includes(note) ? 'correct-pulse' : ''}"
                  data-answer-note={note}
                  aria-label={DISPLAY_NAMES[note]}
                  onclick={() => onAnswerClick?.(note)}
                >
                  <span class="note-latin">{label.shortLabel}</span>
                  <small class="note-ru">{label.displayLabel}</small>
                </button>
              {/each}
            </div>
          {/if}
          <div class="answer-hotkeys-hint">{answerSet.keyboardHint}</div>
        </section>
      </div>
    {/if}
  </div>
</section>
