<script lang="ts">
  import {
    TWO_HAND_VOICINGS,
    TWO_HAND_SYNC_WINDOW_MS,
    twoHandAssessmentTrial,
    twoHandPattern,
    twoHandTargetChord,
    twoHandSkillInstruction,
    type TwoHandModuleState,
    type TwoHandVoicing
  } from '../../core/learning/twoHand';

  let {
    state,
    showHints = true,
    dailyMode = false,
    midiConnected = false,
    dailyFeedback = '',
    dailyFeedbackTone = '',
    dailyCorrective = false,
    dailyCompleted = false,
    deviceLabel = '',
    rangeLabelText = '',
    rangeVerified = false,
    rangeStale = false,
    needsCalibration = false,
    arrangementNotice = '',
    simulationMode = false,
    midiInputs = [] as { id: string; name: string; state: string }[],
    selectedMidiInputId = null as string | null,
    calibration = { step: 'idle', message: '' } as { step: string; message: string; minNote?: number | null; maxNote?: number | null },
    onSelectMidiInput,
    onCalibrate,
    onCancelCalibration,
    onVerifyRange,
    onContinue,
    onStartRun,
    onCheck,
    onNext,
    onRemediation,
    onRetryAssessment,
    onComplete,
    onExit
  }: {
    state: TwoHandModuleState;
    showHints?: boolean;
    dailyMode?: boolean;
    midiConnected?: boolean;
    dailyFeedback?: string;
    dailyFeedbackTone?: string;
    dailyCorrective?: boolean;
    dailyCompleted?: boolean;
    deviceLabel?: string;
    rangeLabelText?: string;
    rangeVerified?: boolean;
    rangeStale?: boolean;
    needsCalibration?: boolean;
    arrangementNotice?: string;
    simulationMode?: boolean;
    midiInputs?: { id: string; name: string; state: string }[];
    selectedMidiInputId?: string | null;
    calibration?: { step: string; message: string; minNote?: number | null; maxNote?: number | null };
    onSelectMidiInput?: (id: string) => void;
    onCalibrate?: () => void;
    onCancelCalibration?: () => void;
    onVerifyRange?: () => void;
    onContinue: () => void;
    onStartRun: () => void;
    onCheck: () => void;
    onNext: () => void;
    onRemediation: () => void;
    onRetryAssessment: () => void;
    onComplete: () => void;
    onExit: (destination: 'curriculum' | 'practice') => void;
  } = $props();

  const chordId = $derived(twoHandTargetChord(state));
  const voicing: TwoHandVoicing = $derived(state.voicings[chordId] ?? TWO_HAND_VOICINGS[chordId]);
  const pattern = $derived(twoHandPattern(state));
  const isAssessment = $derived(state.stage === 'transferAssessment' || state.stage === 'transferResult' || state.stage === 'transferRemediation');
  const trial = $derived(isAssessment ? twoHandAssessmentTrial(state.assessment.trialIndex) : null);
  const isTimed = $derived(['simultaneous', 'alternating', 'fourBar', 'independent', 'transferAssessment', 'transferRemediation'].includes(state.stage));
  const canCheckScreen = $derived(!state.isRunning && !state.awaitingCorrective && state.selectedKeyIds.length > 0 && !dailyCompleted);

  function stageTitle(): string {
    switch (state.stage) {
      case 'handOrientation': return 'Знакомство: где чья рука';
      case 'leftHand': return 'Левая рука: бас';
      case 'rightHand': return 'Правая рука: аккорд';
      case 'simultaneous': return 'Две руки вместе';
      case 'alternating': return 'Бас на 1, аккорд на 3';
      case 'fourBar': return 'Четыре такта подряд';
      case 'independent': return 'Играем самостоятельно';
      case 'transferAssessment': return 'Проверка навыка';
      case 'transferResult': return state.assessment.phase === 'passed' ? 'Проверка пройдена' : 'Результат проверки';
      case 'transferRemediation': return 'Короткая коррекция';
      case 'moduleComplete': return 'Модуль завершён';
      default: return 'Игра двумя руками';
    }
  }

  function instruction(): string {
    if (dailyMode) return twoHandSkillInstruction(pattern === 'simultaneous' ? 'twoHandTogether' : 'twoHandAlternating');
    switch (state.stage) {
      case 'handOrientation':
        return 'Левая рука играет одну басовую ноту. Правая рука играет аккорд из трёх нот. Руки играют в разных регистрах: бас ниже, аккорд выше.';
      case 'leftHand':
        return `Сыграйте бас левой рукой: ${voicing.bassKeyId}. Двигайтесь слева направо по последовательности C → G/B → Am → F.`;
      case 'rightHand':
        return `Сыграйте аккорд правой рукой: ${voicing.symbol} — ${voicing.triadKeyIds.join('–')}. Нужны все три ноты.`;
      case 'simultaneous':
        return showHints
          ? `На первую долю нажмите одновременно ${voicing.bassKeyId} левой рукой и ${voicing.triadKeyIds.join('–')} правой.`
          : `На первую долю нажмите бас левой рукой и аккорд ${voicing.symbol} правой одновременно.`;
      case 'alternating':
      case 'fourBar':
        return showHints
          ? `На первую долю сыграйте ${voicing.bassKeyId} левой рукой. На третью долю сыграйте ${voicing.triadKeyIds.join('–')} правой.`
          : `На первую долю — бас левой рукой, на третью — аккорд ${voicing.symbol} правой.`;
      case 'independent':
        return `На первую долю — бас левой рукой, на третью — аккорд ${voicing.symbol} правой. Играйте без подсказок.`;
      case 'transferAssessment':
      case 'transferRemediation':
        if (!showHints) {
          return trial?.kind === 'simultaneous'
            ? `Задание ${state.assessment.trialsCompleted + 1} из 12: обе руки вместе на первую долю, аккорд ${voicing.symbol}.`
            : `Задание ${state.assessment.trialsCompleted + 1} из 12: бас на первую долю, аккорд ${voicing.symbol} на третью.`;
        }
        return trial?.kind === 'simultaneous'
          ? `Задание ${state.assessment.trialsCompleted + 1} из 12. На первую долю нажмите одновременно ${voicing.bassKeyId} левой рукой и ${voicing.triadKeyIds.join('–')} правой.`
          : `Задание ${state.assessment.trialsCompleted + 1} из 12. На первую долю — ${voicing.bassKeyId} левой рукой, на третью — ${voicing.triadKeyIds.join('–')} правой.`;
      default:
        return '';
    }
  }
</script>

<section class="two-hand-stage" data-testid="two-hand-stage" data-two-hand-stage={state.stage} data-two-hand-pattern={pattern} data-two-hand-chord={chordId} data-two-hand-running={state.isRunning} data-two-hand-count-in={state.countInValue ?? ''} data-two-hand-beat={state.activeBeat} data-two-hand-bar={state.chordIndex} data-two-hand-hints={showHints} data-two-hand-awaiting={state.awaitingCorrective} data-two-hand-corrected={state.remediationCorrected} data-two-hand-feedback-tone={state.feedbackTone} data-two-hand-arrangement={state.arrangementKind} data-two-hand-running-label={state.isRunning ? 'running' : 'idle'}>
  <div class="two-hand-card">
    <div class="two-hand-eyebrow">ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИГРА ДВУМЯ РУКАМИ · 4/4 · 60 BPM</div>
    {#if deviceLabel}
      <div class="two-hand-device" data-testid="two-hand-device">
        <span data-testid="two-hand-device-label">{deviceLabel}</span>
        {#if rangeLabelText}
          <span class={`two-hand-range ${rangeVerified ? 'ok' : 'warn'}`} data-testid="two-hand-range">{rangeLabelText}</span>
        {/if}
      </div>
    {/if}
    {#if rangeStale}
      <button class="btn btn-secondary tiny" data-testid="two-hand-verify-range" onclick={onVerifyRange}>Проверить диапазон</button>
    {/if}
    {#if arrangementNotice}
      <div class="two-hand-adaptation" data-testid="two-hand-adaptation">{arrangementNotice}</div>
    {/if}
    {#if simulationMode}
      <div class="two-hand-simulation" data-testid="two-hand-simulation">Экранная симуляция: результат не засчитывается как физическое исполнение двумя руками.</div>
    {/if}
    {#if calibration.step !== 'idle'}
      <div class="two-hand-calibration" data-testid="two-hand-calibration">
        <strong>{calibration.message}</strong>
        {#if calibration.step === 'complete' && calibration.minNote != null && calibration.maxNote != null}
          <span data-testid="two-hand-calibration-range">Слева: {calibration.minNote} · Справа: {calibration.maxNote}</span>
        {/if}
        <button class="btn btn-secondary tiny" data-testid="two-hand-calibration-cancel" onclick={onCancelCalibration}>Отмена калибровки</button>
      </div>
    {:else}
      <div class="two-hand-calibration-actions">
        {#if midiInputs.length > 1}
          <select data-testid="two-hand-device-select" value={selectedMidiInputId ?? ''} onchange={event => onSelectMidiInput?.(event.currentTarget.value)}>
            {#each midiInputs as input (input.id)}
              <option value={input.id}>{input.name || input.id}</option>
            {/each}
          </select>
        {/if}
        {#if !dailyMode}
          <button class="btn btn-secondary tiny" data-testid="two-hand-calibrate" onclick={onCalibrate} disabled={!midiConnected}>Калибровать диапазон</button>
        {/if}
        {#if needsCalibration}
          <span class="two-hand-calibration-hint" data-testid="two-hand-calibration-hint">Диапазон не калиброван — используется типовой для устройства.</span>
        {/if}
      </div>
    {/if}
    <h2>{stageTitle()}</h2>
    <p class="two-hand-instruction" data-testid="two-hand-instruction">{instruction()}</p>

    <div class="two-hand-parts" data-testid="two-hand-parts">
      <div class="hand-panel left" data-hand="left">
        <span class="hand-badge">ЛЕВАЯ РУКА</span>
        <strong>{showHints ? voicing.bassKeyId : '—'}</strong>
        <small>одна басовая нота</small>
      </div>
      <div class="hand-panel right" data-hand="right">
        <span class="hand-badge">ПРАВАЯ РУКА</span>
        <strong>{showHints ? voicing.triadKeyIds.join('–') : '—'}</strong>
        <small>аккорд {voicing.symbol} — три ноты</small>
      </div>
    </div>

    <div class="two-hand-chord-label">Текущий аккорд: <strong>{voicing.symbol}</strong>
      {#if state.stage === 'fourBar' || state.stage === 'independent'}
        · такт {state.chordIndex + 1} из {state.sequence.length}
      {/if}
      · {pattern === 'simultaneous' ? 'обе руки вместе' : 'бас на 1 · аккорд на 3'}
    </div>

    <div class="two-hand-beats" data-testid="two-hand-beat-indicator" aria-label="Доли такта">
      {#each [0, 1, 2, 3] as beat}
        <span class:active={state.activeBeat === beat} class:strong={beat === 0}>{beat + 1}</span>
      {/each}
    </div>

    {#if isTimed && !dailyMode && state.stage !== 'transferResult'}
      <div class="two-hand-status" data-testid="two-hand-timing-state">
        {#if state.countInValue != null}
          Отсчёт: <strong>{state.countInValue}</strong> · 4 · 3 · 2 · 1
        {:else if state.isRunning}
          Играйте: {pattern === 'simultaneous' ? 'обе руки вместе на первую долю' : 'бас на 1, аккорд на 3'}
        {:else}
          Нажмите «Начать отсчёт». Синхронизация рук — до {TWO_HAND_SYNC_WINDOW_MS} мс.
        {/if}
      </div>
      {#if state.playCue}
        <div class="two-hand-play-cue" data-testid="two-hand-play-cue" role="status">ИГРАЙТЕ!</div>
      {/if}
    {/if}

    <p class="two-hand-selection" data-testid="two-hand-selected-count">
      Выбрано клавиш на экране: <strong>{state.selectedKeyIds.length}</strong>
      {#if state.selectedKeyIds.length > 0}<small>({state.selectedKeyIds.join(', ')})</small>{/if}
    </p>

    {#if state.feedbackText}<div class={`two-hand-feedback ${state.feedbackTone}`} data-testid="two-hand-feedback" role="status">{state.feedbackText}</div>{/if}
    {#if dailyFeedback}<div class={`two-hand-feedback ${dailyFeedbackTone}`} data-testid="two-hand-feedback" role="status">{dailyFeedback}</div>{/if}

    <div class="two-hand-actions">
      {#if dailyCompleted}
        <button class="btn btn-secondary" data-testid="two-hand-next-question" onclick={onNext}>Следующее задание</button>
      {:else if state.stage === 'handOrientation'}
        <button class="btn btn-primary" data-testid="two-hand-continue" onclick={onContinue}>Показать руки</button>
      {:else if state.awaitingCorrective && !isTimed}
        <span class="two-hand-corrective-hint">{dailyCorrective ? 'Исправьте ответ, чтобы продолжить.' : 'Сыграйте правильный вариант, чтобы продолжить.'}</span>
      {:else if state.stage === 'transferResult'}
        {#if state.assessment.phase === 'passed'}
          <button class="btn btn-primary" data-testid="two-hand-complete-module" onclick={onComplete}>Завершить модуль</button>
        {:else if state.assessment.phase === 'failed'}
          <button class="btn btn-primary" data-testid="two-hand-return-to-learning" onclick={onRetryAssessment}>Вернуться к учебным шагам</button>
          <button class="btn btn-secondary" data-testid="two-hand-exit-to-program" onclick={() => onExit('curriculum')}>В программу</button>
        {:else}
          <button class="btn btn-primary" data-testid="two-hand-start-remediation" onclick={onRemediation}>Повторить проблемные места</button>
        {/if}
      {:else if state.stage === 'moduleComplete'}
        <button class="btn btn-primary" data-testid="two-hand-continue-practice" onclick={() => onExit('practice')}>Продолжить тренировку</button>
        <button class="btn btn-secondary" data-testid="two-hand-exit-to-program" onclick={() => onExit('curriculum')}>В программу</button>
      {:else if isTimed}
        {#if !state.isRunning}
          <button class="btn btn-primary" data-testid="two-hand-start-run" onclick={onStartRun}>{state.awaitingCorrective ? 'Сыграть исправление' : 'Начать отсчёт'}</button>
        {/if}
        {#if state.stage === 'transferRemediation' && state.remediationCorrected && !state.awaitingCorrective}
          <button class="btn btn-secondary" data-testid="two-hand-remediation-next" onclick={onNext}>Следующее задание</button>
        {/if}
      {:else if canCheckScreen}
        <button class="btn btn-primary" data-testid="two-hand-check" onclick={onCheck}>Проверить</button>
      {/if}
    </div>

    <div class="two-hand-midi-note" data-testid="two-hand-midi-status">
      {midiConnected ? 'MIDI подключён: играйте двумя руками.' : 'MIDI не подключён: используйте экранную клавиатуру (симуляция).'}
    </div>
  </div>
</section>

<style>
  .two-hand-stage { width: min(100%, 1040px); margin: 0 auto; padding: clamp(14px, 2vh, 24px); box-sizing: border-box; }
  .two-hand-card { border: 1px solid #2b3a50; border-radius: 18px; background: linear-gradient(145deg, rgba(18,29,48,.98), rgba(10,18,33,.98)); padding: clamp(18px, 3vw, 30px); color: #e7edf7; text-align: center; }
  .two-hand-eyebrow { color: #73c9f3; font-size: .72rem; font-weight: 800; letter-spacing: .08em; }
  h2 { margin: 8px 0 10px; font-size: clamp(1.3rem, 2.6vw, 1.9rem); }
  .two-hand-instruction { max-width: 760px; margin: 8px auto; line-height: 1.55; color: #d4dceb; }
  .two-hand-parts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 640px; margin: 16px auto; }
  .hand-panel { border-radius: 14px; padding: 12px 14px; display: grid; gap: 4px; text-align: left; }
  .hand-panel.left { border: 2px solid #f4d36c; background: rgba(244, 211, 108, .10); }
  .hand-panel.right { border: 2px dashed #7dd3fc; background: rgba(125, 211, 252, .08); }
  .hand-badge { font-size: .7rem; font-weight: 800; letter-spacing: .06em; }
  .hand-panel.left .hand-badge { color: #f4d36c; }
  .hand-panel.right .hand-badge { color: #7dd3fc; }
  .hand-panel strong { font-size: 1.3rem; }
  .hand-panel small { color: #9fadc2; }
  .two-hand-chord-label { margin: 10px auto; color: #c3d0e2; }
  .two-hand-beats { display: flex; justify-content: center; gap: 10px; margin: 12px 0; }
  .two-hand-beats span { width: 38px; height: 38px; border-radius: 10px; border: 1px solid #334155; display: grid; place-items: center; color: #94a3b8; font-weight: 700; }
  .two-hand-beats span.strong { border-color: #f4d36c; color: #f4d36c; }
  .two-hand-beats span.active { background: #38bdf8; color: #06121f; border-color: #7dd3fc; }
  .two-hand-status { color: #cbd5e1; margin: 8px 0; }
.two-hand-play-cue {
  display: inline-block;
  margin: 4px 0 8px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(74, 222, 128, 0.18);
  border: 1px solid rgba(74, 222, 128, 0.5);
  color: #86efac;
  font-weight: 800;
  letter-spacing: 0.08em;
}
  .two-hand-selection { color: #9fadc2; font-size: .85rem; }
  .two-hand-selection small { margin-left: 6px; }
  .two-hand-feedback { margin: 10px auto; max-width: 720px; padding: 8px 12px; border-radius: 10px; }
  .two-hand-feedback.good { background: rgba(74, 222, 128, .12); color: #86efac; border: 1px solid rgba(74, 222, 128, .35); }
  .two-hand-feedback.bad { background: rgba(251, 113, 133, .12); color: #fda4af; border: 1px solid rgba(251, 113, 133, .35); }
  .two-hand-feedback.warn { background: rgba(250, 204, 21, .10); color: #fde68a; border: 1px solid rgba(250, 204, 21, .30); }
  .two-hand-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 14px; }
  .two-hand-corrective-hint { color: #fde68a; }
  .two-hand-midi-note { margin-top: 12px; color: #94a3b8; font-size: .8rem; }
  @media (max-width: 720px) {
    .two-hand-parts { grid-template-columns: 1fr; }
  }
</style>




