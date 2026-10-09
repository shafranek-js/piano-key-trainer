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
    midiStartPending = false,
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
    midiStartPending?: boolean;
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
    if (midiStartPending) {
      return 'Отпустите клавиши, чтобы начать отсчёт.';
    }
    if ((state.awaitingCorrective || dailyCorrective) && !dailyMode) {
      const transportHint = midiConnected && rangeVerified
        ? 'Нажмите любую клавишу на MIDI для отсчёта или «Сыграть исправление».'
        : 'Нажмите «Сыграть исправление».';
      return `Сыграйте правильный вариант: ${pattern === 'simultaneous' ? 'обе руки вместе' : 'бас на 1, аккорд на 3'} (${voicing.symbol}). ${transportHint}`;
    }
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

<section class="two-hand-stage" data-testid="two-hand-stage" data-two-hand-stage={state.stage} data-two-hand-pattern={pattern} data-two-hand-chord={chordId} data-two-hand-running={state.isRunning} data-two-hand-count-in={state.countInValue ?? ''} data-two-hand-beat={state.activeBeat} data-two-hand-bar={state.chordIndex} data-two-hand-hints={showHints} data-two-hand-awaiting={state.awaitingCorrective} data-two-hand-corrected={state.remediationCorrected} data-two-hand-feedback-tone={state.feedbackTone} data-two-hand-arrangement={state.arrangementKind} data-two-hand-running-label={state.isRunning ? 'running' : 'idle'} data-two-hand-start-pending={midiStartPending ? 'true' : 'false'}>
  <div class="two-hand-card">
    <div class="two-hand-meta-bar">
      <div class="two-hand-eyebrow">ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИГРА ДВУМЯ РУКАМИ · 4/4 · 60 BPM</div>
      <div class="two-hand-device-wrap">
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
      </div>
    </div>

    {#if arrangementNotice}
      <div class="two-hand-adaptation" data-testid="two-hand-adaptation">{arrangementNotice}</div>
    {/if}
    {#if simulationMode}
      <div class="two-hand-simulation" data-testid="two-hand-simulation">Экранная симуляция: результат не засчитывается как физическое исполнение двумя руками.</div>
    {/if}

    <div class="two-hand-body-grid">
      <div class="two-hand-col-info">
        <h2>{stageTitle()}</h2>
        <p class="two-hand-instruction" data-testid="two-hand-instruction">{instruction()}</p>

        {#if isTimed && !dailyCompleted && state.stage !== 'transferResult'}
          <div class="two-hand-status" data-testid="two-hand-timing-state">
            {#if midiStartPending}
              <strong class="two-hand-release-hint" data-testid="two-hand-release-hint">Отпустите клавиши, чтобы начать отсчёт…</strong>
            {:else if state.countInValue != null}
              Отсчёт: <strong>{state.countInValue}</strong> · 4 · 3 · 2 · 1
            {:else if state.playCue}
              <strong class="two-hand-play-now" data-testid="two-hand-play-now">ИГРАЙТЕ СЕЙЧАС</strong>
            {:else if state.isRunning}
              Играйте: {pattern === 'simultaneous' ? 'обе руки вместе на первую долю' : 'бас на 1, аккорд на 3'}
            {:else if state.awaitingCorrective || dailyCorrective}
              <strong class="two-hand-corrective-status">Режим исправления:</strong> {midiConnected && rangeVerified ? 'нажмите любую клавишу на MIDI или «Сыграть исправление»' : 'нажмите «Сыграть исправление»'}
            {:else if midiConnected && rangeVerified}
              Нажмите любую клавишу на MIDI или «Начать отсчёт»
            {:else}
              Нажмите «Начать отсчёт». Синхронизация рук — до {TWO_HAND_SYNC_WINDOW_MS} мс.
            {/if}
          </div>
          {#if state.playCue}
            <div class="two-hand-play-cue" data-testid="two-hand-play-cue" role="status">ИГРАЙТЕ!</div>
          {/if}
        {/if}
      </div>

      <div class="two-hand-col-notes">
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

        <p class="two-hand-selection" data-testid="two-hand-selected-count">
          Выбрано клавиш на экране: <strong>{state.selectedKeyIds.length}</strong>
          {#if state.selectedKeyIds.length > 0}<small>({state.selectedKeyIds.join(', ')})</small>{/if}
        </p>
      </div>
    </div>

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
          <button class="btn btn-primary" data-testid="two-hand-start-run" onclick={onStartRun}>
            {midiStartPending ? 'Отпустите клавиши…' : (state.awaitingCorrective || dailyCorrective ? 'Сыграть исправление' : 'Начать отсчёт')}
          </button>
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
  .two-hand-stage { width: min(100%, 1060px); margin: 0 auto; padding: clamp(4px, 1vh, 12px) 14px; box-sizing: border-box; }
  .two-hand-card { border: 1px solid #2b3a50; border-radius: 16px; background: linear-gradient(145deg, rgba(18,29,48,.98), rgba(10,18,33,.98)); padding: clamp(10px, 1.8vh, 16px) clamp(14px, 2.2vw, 24px); color: #e7edf7; text-align: center; box-sizing: border-box; }
  .two-hand-meta-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .two-hand-eyebrow { color: #73c9f3; font-size: .72rem; font-weight: 800; letter-spacing: .08em; }
  .two-hand-device-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .78rem; }
  .two-hand-device { display: inline-flex; align-items: center; gap: 6px; color: #cbd5e1; font-size: .8rem; }
  .two-hand-range.ok { color: #86efac; font-weight: 700; }
  .two-hand-range.warn { color: #fde68a; font-weight: 700; }
  .two-hand-adaptation, .two-hand-simulation { font-size: .75rem; padding: 2px 8px; border-radius: 6px; background: rgba(56,189,248,.1); color: #93c5fd; margin: 2px 0; }
  .two-hand-calibration { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .two-hand-calibration-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .two-hand-calibration-hint { color: #94a3b8; font-size: .75rem; }
  .two-hand-body-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; align-items: center; text-align: left; margin: 4px 0; }
  .two-hand-col-info { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .two-hand-col-info h2 { margin: 0 0 4px; font-size: clamp(1.15rem, 1.9vw, 1.55rem); text-align: left; color: #f8fafc; line-height: 1.25; }
  .two-hand-instruction { margin: 0 0 6px; line-height: 1.42; color: #cbd5e1; font-size: clamp(.84rem, 1.15vw, .95rem); text-align: left; }
  .two-hand-col-notes { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; text-align: center; }
  .two-hand-parts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 440px; margin: 0 auto 4px; }
  .hand-panel { border-radius: 12px; padding: 8px 10px; display: grid; gap: 2px; text-align: left; }
  .hand-panel.left { border: 2px solid #f4d36c; background: rgba(244, 211, 108, .10); }
  .hand-panel.right { border: 2px dashed #7dd3fc; background: rgba(125, 211, 252, .08); }
  .hand-badge { font-size: .65rem; font-weight: 800; letter-spacing: .06em; }
  .hand-panel.left .hand-badge { color: #f4d36c; }
  .hand-panel.right .hand-badge { color: #7dd3fc; }
  .hand-panel strong { font-size: 1.18rem; }
  .hand-panel small { color: #9fadc2; font-size: .75rem; }
  .two-hand-chord-label { margin: 2px auto 4px; color: #c3d0e2; font-size: .82rem; }
  .two-hand-beats { display: flex; justify-content: center; gap: 8px; margin: 4px 0; }
  .two-hand-beats span { width: 30px; height: 30px; border-radius: 8px; border: 1px solid #334155; display: grid; place-items: center; color: #94a3b8; font-weight: 700; font-size: .85rem; }
  .two-hand-beats span.strong { border-color: #f4d36c; color: #f4d36c; }
  .two-hand-beats span.active { background: #38bdf8; color: #06121f; border-color: #7dd3fc; box-shadow: 0 0 12px rgba(56,189,248,.45); }
  .two-hand-status { color: #cbd5e1; margin: 4px 0 2px; font-size: .84rem; text-align: left; }
  .two-hand-play-cue { display: inline-block; width: fit-content; margin: 4px 0 0; padding: 3px 10px; border-radius: 999px; background: rgba(74, 222, 128, 0.18); border: 1px solid rgba(74, 222, 128, 0.5); color: #86efac; font-weight: 800; font-size: .82rem; letter-spacing: 0.08em; }
  .two-hand-release-hint { color: #ffd76e; font-size: .88rem; }
  .two-hand-play-now { color: #86efac; font-weight: 800; font-size: .88rem; letter-spacing: 0.06em; }
  .two-hand-corrective-status { color: #ffd76e; }
  .two-hand-selection { color: #9fadc2; font-size: .78rem; margin: 2px 0 0; }
  .two-hand-selection small { margin-left: 6px; }
  .two-hand-feedback { margin: 6px auto; max-width: 720px; padding: 6px 12px; border-radius: 8px; font-size: .85rem; line-height: 1.35; }
  .two-hand-feedback.good { background: rgba(74, 222, 128, .12); color: #86efac; border: 1px solid rgba(74, 222, 128, .35); }
  .two-hand-feedback.bad { background: rgba(251, 113, 133, .12); color: #fda4af; border: 1px solid rgba(251, 113, 133, .35); }
  .two-hand-feedback.warn { background: rgba(250, 204, 21, .10); color: #fde68a; border: 1px solid rgba(250, 204, 21, .30); }
  .two-hand-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
  .two-hand-corrective-hint { color: #fde68a; font-size: .88rem; }
  .two-hand-midi-note { margin-top: 6px; color: #94a3b8; font-size: .75rem; }
  @media (max-width: 768px) {
    .two-hand-body-grid { grid-template-columns: 1fr; gap: 8px; text-align: center; }
    .two-hand-col-info h2, .two-hand-instruction, .two-hand-status { text-align: center; }
    .two-hand-parts { max-width: 100%; }
  }
  @media (max-height: 820px) {
    .two-hand-stage { padding: 2px 14px; }
    .two-hand-card { padding: 8px 16px; }
    .two-hand-meta-bar { margin-bottom: 2px; }
    .two-hand-eyebrow { font-size: .68rem; }
    .two-hand-device { font-size: .74rem; }
    .two-hand-body-grid { gap: 10px; margin: 2px 0; }
    .two-hand-col-info h2 { font-size: 1.15rem; margin-bottom: 2px; }
    .two-hand-instruction { font-size: .80rem; margin-bottom: 3px; line-height: 1.35; }
    .hand-panel { padding: 4px 8px; }
    .hand-panel strong { font-size: 1.05rem; }
    .hand-panel small { font-size: .70rem; }
    .two-hand-chord-label { margin: 1px auto 2px; font-size: .76rem; }
    .two-hand-beats { margin: 2px 0; }
    .two-hand-beats span { width: 26px; height: 26px; font-size: .78rem; }
    .two-hand-status { font-size: .78rem; margin: 2px 0 1px; }
    .two-hand-feedback { margin: 3px auto; padding: 4px 10px; font-size: .80rem; }
    .two-hand-actions { margin-top: 4px; }
    .two-hand-midi-note { margin-top: 3px; font-size: .70rem; }
  }
</style>




