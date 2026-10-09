<script lang="ts">
  import type { ChordRhythmModuleState, ChordRhythmStep, ChordRhythmSkill } from '../../core/learning/chordRhythm';
  import {
    CHANGE_EXERCISE_NEXT,
    changeBarChord,
    currentRhythmTrial,
    getRhythmAssessmentLength,
    isRhythmPlayNowCueActive,
    isRhythmTimingAcceptanceWindowOpen,
    isTwoBarChangeExercise,
    resolveRhythmTargetChord,
    rhythmChordOutcomeLabel,
    rhythmRunPhase,
    timingBandLabel
  } from '../../core/learning/chordRhythm';
  import { HARMONY_CHORDS, type HarmonyChordId } from '../../core/learning/harmony';

  let {
    state,
    midiConnected = false,
    midiStartPending = false,
    midiHeldKeyCount = 0,
    dailySkill = null,
    dailyChordId = 'C',
    dailyFeedback = '',
    dailyFeedbackTone = '',
    dailyCorrective = false,
    dailyCompleted = false,
    onAdvance,
    onStartRun,
    onSubmit,
    onRetry,
    onRemediation,
    onComplete,
    onExit
  }: {
    state: ChordRhythmModuleState;
    midiConnected?: boolean;
    midiStartPending?: boolean;
    midiHeldKeyCount?: number;
    dailySkill?: ChordRhythmSkill | null;
    dailyChordId?: HarmonyChordId;
    dailyFeedback?: string;
    dailyFeedbackTone?: string;
    dailyCorrective?: boolean;
    dailyCompleted?: boolean;
    onAdvance: () => void;
    onStartRun: () => void;
    onSubmit: () => void;
    onRetry: () => void;
    onRemediation: () => void;
    onComplete: () => void;
    onExit: (destination: 'curriculum' | 'practice') => void;
  } = $props();

  const stepCopy: Record<ChordRhythmStep, { title: string; eyebrow: string }> = {
    pulseOrientation: { title: 'Пульс и сильная доля', eyebrow: '1 · ОРИЕНТАЦИЯ' },
    countingPulse: { title: 'Считаем 1 · 2 · 3 · 4', eyebrow: '2 · ПУЛЬС 4/4' },
    oneChordPerBar: { title: 'Один аккорд на такт', eyebrow: '3 · ОДНА СМЕНА' },
    changeOnBeatOne: { title: 'Смена на следующую «раз»', eyebrow: '4 · СМЕНА АККОРДА' },
    fullProgression: { title: 'C → G/B → Am → F', eyebrow: '5 · ПОСЛЕДОВАТЕЛЬНОСТЬ' },
    twoStrikes: { title: 'Два удара за такт', eyebrow: '6 · ДОЛИ 1 И 3' },
    independentPlay: { title: 'Играем самостоятельно', eyebrow: '7 · БЕЗ ПОДСКАЗКИ' },
    transferAssessment: { title: 'Проверка навыка', eyebrow: 'ПЕРЕНОС НАВЫКА' },
    transferResult: { title: 'Результат проверки', eyebrow: 'ИТОГ' },
    transferRemediation: { title: 'Короткое повторение', eyebrow: 'КОРРЕКЦИЯ' },
    moduleComplete: { title: 'Ритм аккордов освоен', eyebrow: 'МОДУЛЬ ЗАВЕРШЁН' }
  };
  const headings = $derived(dailySkill
    ? { title: dailySkill === 'chordPulse' ? 'Пульс аккордов' : dailySkill === 'chordChangeTiming' ? 'Смена аккорда на сильную долю' : 'Ритмический рисунок аккорда', eyebrow: 'ЕЖЕДНЕВНАЯ ПРАКТИКА' }
    : stepCopy[state.step]);
  const isAssessment = $derived(state.step === 'transferAssessment' || state.step === 'transferRemediation');
  const showInteractiveStage = $derived(
    Boolean(dailySkill) || !['pulseOrientation', 'transferResult', 'moduleComplete'].includes(state.step)
  );
  const trial = $derived(currentRhythmTrial(state));
  const targetChordId = $derived.by((): HarmonyChordId => {
    if (dailySkill && dailySkill !== 'chordChangeTiming') return dailyChordId;
    return resolveRhythmTargetChord(state);
  });
  const targetChord = $derived(HARMONY_CHORDS[targetChordId]);
  const assessmentLength = $derived(dailySkill ? 1 : getRhythmAssessmentLength(state.assessment));
  const displayTrialNumber = $derived(dailySkill ? 1 : state.assessment.phase === 'remediation'
    ? state.assessment.remediationIndex + 1
    : Math.min(state.assessment.trialIndex + 1, assessmentLength));
  const progressPct = $derived(dailySkill ? 100 : isAssessment
    ? Math.round(state.assessment.trialsCompleted / assessmentLength * 100)
    : Math.round((['pulseOrientation', 'countingPulse', 'oneChordPerBar', 'changeOnBeatOne', 'fullProgression', 'twoStrikes', 'independentPlay'].indexOf(state.step) + 1) / 7 * 100));
  const phase = $derived(rhythmRunPhase(state));
  const acceptanceWindowOpen = $derived(isRhythmTimingAcceptanceWindowOpen(state));
  const classification = $derived(state.lastClassification);
  const changeExercise = $derived(isTwoBarChangeExercise(state));
  const twoStrikes = $derived(state.step === 'twoStrikes');
  const firstStrikeAccepted = $derived(twoStrikes && state.outcomes.length === 1 && state.isRunning);
  const strikeNumber = $derived(twoStrikes ? (state.outcomes.length >= 1 ? 2 : 1) : null);
  const releaseRequired = $derived(Boolean(firstStrikeAccepted && midiHeldKeyCount > 0));
  const playNowCue = $derived(isRhythmPlayNowCueActive(state) && !releaseRequired);
</script>

<section class="chord-rhythm-stage" data-testid="chord-rhythm-stage" data-rhythm-step={state.step} data-rhythm-phase={phase} data-timing-window={acceptanceWindowOpen ? 'open' : 'closed'} data-play-now={playNowCue ? 'visible' : 'hidden'} data-release-required={releaseRequired ? 'true' : 'false'} data-change-bar={state.barIndex}>
  <div class="rhythm-stage-card">
    <div class="rhythm-top-bar">
      <div class="rhythm-eyebrow">{dailySkill ? 'ЕЖЕДНЕВНАЯ ПРАКТИКА · РИТМ АККОРДОВ' : 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · РИТМ АККОРДОВ'}</div>
      <div class="rhythm-kicker">{headings.eyebrow}</div>
    </div>
    <div class="rhythm-stage-progress" aria-label="Прогресс этапа"><span style={`width:${progressPct}%`}></span></div>

    {#if !showInteractiveStage}
      <h2>{headings.title}</h2>
      {#if state.step === 'pulseOrientation'}
        <p class="rhythm-copy">Размер <strong>4/4</strong>. Считайте ровно: <strong>1 · 2 · 3 · 4</strong>. Первая доля — сильная: на ней начинается новый такт.</p>
        <p class="rhythm-copy secondary">Сначала послушайте четыре ровных удара. Затем будем играть один аккорд на такт в темпе 60 BPM.</p>
        <button class="btn btn-primary rhythm-primary" onclick={onAdvance}>Начать знакомство с пульсом</button>
      {:else if state.step === 'transferResult'}
        {@const passed = state.assessment.phase === 'passed'}
        <p class="rhythm-copy">{state.assessment.correctFirstAttempts} правильных первых попыток из {assessmentLength} · требуется не менее 80%.</p>
        <div class={`rhythm-result ${passed ? 'good' : 'warn'}`} data-testid="rhythm-assessment-result">
          {#if passed}
            Проверка пройдена. Три навыка ритма добавлены в ежедневную практику.
          {:else if state.assessment.phase === 'failed'}
            Проверка пока не пройдена. Вернитесь к учебным шагам или продолжите в программе.
          {:else}
            Нужна короткая коррекция по ошибкам, затем новая проверка из 8 заданий.
          {/if}
        </div>
        {#if passed}
          <button type="button" class="btn btn-primary rhythm-primary" data-testid="rhythm-complete-module" onclick={onComplete}>Завершить модуль</button>
        {:else if state.assessment.phase === 'failed'}
          <div class="rhythm-actions">
            <button type="button" class="btn btn-primary" data-testid="rhythm-return-to-learning" onclick={onRetry}>Вернуться к учебным шагам</button>
            <button type="button" class="btn btn-secondary" data-testid="rhythm-exit-to-program" onclick={() => onExit('curriculum')}>В программу</button>
          </div>
        {:else}
          <button type="button" class="btn btn-primary rhythm-primary" data-testid="rhythm-start-remediation" onclick={onRemediation}>Повторить ошибки и начать проверку из 8 заданий</button>
        {/if}
      {:else if state.step === 'moduleComplete'}
        <p class="rhythm-copy">Вы освоили пульс в размере 4/4, смену аккорда на первую долю и рисунок на долях 1 и 3.</p>
        <div class="rhythm-progression">C <span>→</span> G/B <span>→</span> Am <span>→</span> F</div>
        <div class="rhythm-result good">Навыки ритма аккордов доступны в ежедневной практике.</div>
        <div class="rhythm-actions">
          <button type="button" class="btn btn-primary" data-testid="rhythm-continue-practice" onclick={() => onExit('practice')}>Продолжить тренировку</button>
          <button type="button" class="btn btn-secondary" data-testid="rhythm-exit-to-program" onclick={() => onExit('curriculum')}>В программу</button>
        </div>
      {/if}
    {:else}
      <div class="rhythm-body-grid">
        <div class="rhythm-col-info">
          <h2>{headings.title}</h2>
          {#if dailySkill}
            <p class="rhythm-copy">{dailySkill === 'chordPulse' ? 'Сыграйте три ноты аккорда точно на первую долю такта.' : dailySkill === 'chordChangeTiming' ? 'Два такта: сначала C, затем смените на G/B точно на следующую сильную долю.' : 'Сыграйте один аккорд на долях 1 и 3.'} Задано: <strong>{targetChordId}</strong>.</p>
            {#if dailyCorrective}<p class="rhythm-copy secondary">Первая попытка уже сохранена. Исправьте ответ, чтобы продолжить.</p>{/if}
          {:else}
            {#if state.step === 'countingPulse'}
              <p class="rhythm-copy">Слушайте четыре равные доли. Первая доля каждого такта выделена сильным щелчком.</p>
            {:else if state.step === 'oneChordPerBar'}
              <p class="rhythm-copy">Подготовьте три клавиши аккорда <strong>C</strong>. Запустите отсчёт и сыграйте аккорд на первую долю такта.</p>
            {:else if state.step === 'changeOnBeatOne'}
              <p class="rhythm-copy">
                {state.barIndex === 0
                  ? 'Такт 1 из 2: сохраните пульс и сыграйте C на первую долю.'
                  : 'Такт 2 из 2: смените аккорд и сыграйте G/B точно на следующую сильную долю.'}
              </p>
              <p class="rhythm-copy secondary">Цель: сохранить пульс и поменять аккорд точно на следующую сильную долю.</p>
            {:else if state.step === 'fullProgression'}
              <p class="rhythm-copy">Играйте по одному аккорду на такт. Новый аккорд вступает на первую долю: <strong>{targetChordId}</strong>. Перед каждым тактом запускайте отсчёт.</p>
            {:else if state.step === 'twoStrikes'}
              <p class="rhythm-copy">
                {#if midiConnected}
                  Сыграйте аккорд C два раза: на доле 1 и ещё раз на доле 3. После первого удара отпустите клавиши и снова нажмите аккорд на доле 3.
                {:else}
                  Сыграйте аккорд C два раза: на доле 1 и ещё раз на доле 3. После первого удара выберите три клавиши снова и нажмите «Сыграть аккорд» на доле 3.
                {/if}
              </p>
            {:else if state.step === 'independentPlay'}
              <p class="rhythm-copy">Без подсказки смените аккорд на сильную долю последовательности <strong>C → G/B → Am → F</strong>.</p>
            {:else if state.step === 'transferAssessment'}
              <p class="rhythm-copy">Задание {displayTrialNumber} из {assessmentLength}. Целевой аккорд: <strong>{targetChordId}</strong>. Сначала отсчёт, затем играйте{ trial.beatsPerChord === 2 ? ' на долях 1 и 3' : ' на первую долю'}.</p>
            {:else if state.step === 'transferRemediation'}
              <p class="rhythm-copy">Коррекция {state.assessment.remediationIndex + 1} из {state.assessment.remediationTrialIndexes.length}. Снова сыграйте <strong>{targetChordId}</strong> точно на указанную долю.</p>
            {/if}
          {/if}

          {#if changeExercise}
            <div class="rhythm-change-plan" data-testid="rhythm-change-plan">
              Сейчас: <strong>{changeBarChord(state.barIndex)}</strong>
              {#if state.barIndex === 0}· Далее: <strong>{CHANGE_EXERCISE_NEXT}</strong>{:else}· <strong class="change-now">СМЕНА → {CHANGE_EXERCISE_NEXT}</strong>{/if}
            </div>
          {/if}

          <div class="rhythm-count-label" data-testid="rhythm-timing-state">
            {#if midiStartPending}
              Отпустите клавиши, чтобы начать отсчёт…
            {:else if phase === 'countIn'}
              Приготовьтесь: <strong>{state.countInValue}</strong> · 3 · 2 · 1
            {:else if releaseRequired}
              <strong class="rhythm-release-hint" data-testid="rhythm-release-hint">Отпустите клавиши перед вторым ударом</strong>
            {:else if playNowCue}
              <strong class="rhythm-play-now" data-testid="rhythm-play-now">{twoStrikes ? `Удар ${strikeNumber} из 2 · ` : ''}ИГРАЙТЕ СЕЙЧАС</strong>
            {:else if acceptanceWindowOpen}
              Приготовьтесь…
            {:else if phase === 'armed'}
              Приготовьтесь…
            {:else if firstStrikeAccepted}
              ✓ Первый удар · Следующий удар: доля 3
            {:else if phase === 'late'}
              Слишком поздно — время не изменится, но можно сыграть аккорд для диагностики
            {:else if phase === 'retry'}
              Исправьте аккорд в новом отсчёте
            {:else if midiConnected}
              Нажмите любую клавишу на MIDI, чтобы начать отсчёт
            {:else}
              Начните с отсчёта
            {/if}
          </div>

          {#if state.step !== 'countingPulse'}
            <div class="rhythm-input-help">
              {#if midiConnected}
                MIDI: клавиша для старта, затем аккорд <strong>{targetChordId}</strong> в окно доли.
              {:else}
                Экран: выберите 3 клавиши, отсчёт, затем «Сыграть аккорд».
              {/if}
            </div>
          {/if}
        </div>

        <div class="rhythm-col-notes">
          {#if state.step === 'fullProgression' || state.step === 'independentPlay'}
            <div class="rhythm-progression" aria-label="Последовательность аккордов">
              {#each ['C', 'G/B', 'Am', 'F'] as chord, index}
                <span class:active={index === state.sequenceIndex}>{chord}</span>{#if index < 3}<span class="arrow">→</span>{/if}
              {/each}
            </div>
          {/if}

          <div class="rhythm-target-row">
            {#if changeExercise}<span>Такт {Math.min(state.barIndex + 1, 2)} из 2</span>{:else}<span>Текущий аккорд</span>{/if}
            <strong>{targetChord.symbol}</strong>
            <span class="rhythm-bpm">4/4 · 60 BPM</span>
          </div>

          <div class="rhythm-beats" data-testid="rhythm-beat-indicator" aria-label="Доли такта">
            {#each [0, 1, 2, 3] as beat}
              <span class:active={state.activeBeat === beat} class:strong={beat === 0}>{beat + 1}</span>
            {/each}
          </div>

          {#if twoStrikes}
            <div class="rhythm-strike-progress" data-testid="rhythm-strike-progress">
              {#if state.feedbackText.includes('Оба удара')}
                ✓ Удары 2 из 2
              {:else if state.outcomes.length >= 1}
                Удар 2 из 2 · доля 3
              {:else}
                Удар 1 из 2 · доля 1
              {/if}
            </div>
          {/if}

          {#if state.step !== 'countingPulse'}
            <div class="rhythm-screen-input-row">
              <span class="rhythm-selection" data-testid="rhythm-selected-count">Выбрано клавиш: <strong>{state.selectedKeyIds.length} из 3</strong></span>
              <button
                class="btn btn-primary rhythm-play"
                data-testid="rhythm-submit-chord"
                disabled={state.selectedKeyIds.length !== 3 || phase === 'evaluated'}
                onclick={onSubmit}
              >Сыграть аккорд</button>
            </div>
          {/if}
        </div>
      </div>

      {#if state.feedbackText}
        <div class={`rhythm-feedback ${state.feedbackTone}`} data-testid="rhythm-feedback">{state.feedbackText}</div>
      {/if}
      {#if state.lastOutcome}
        <div class="rhythm-diagnostics" data-testid="rhythm-outcome-parts">
          {#if classification}
            <span data-testid="rhythm-played-label">Сыграно: <strong>{classification.detectedChordLabel ?? '—'}</strong></span>
            <span data-testid="rhythm-expected-label">Ожидалось: <strong>{classification.targetChordLabel}</strong></span>
          {/if}
          <span data-testid="rhythm-chord-result">Аккорд: <strong class:good={state.lastOutcome.chordCorrect} class:bad={!state.lastOutcome.chordCorrect}>{state.lastOutcome.chordCorrect ? '✓' : '✗'}{#if classification && !state.lastOutcome.chordCorrect} · {rhythmChordOutcomeLabel(classification.outcome)}{/if}</strong></span>
          <span data-testid="rhythm-timing-result" data-timing-accepted={state.lastOutcome.timingAccepted ? 'accepted' : 'failed'}>Время: <strong class:good={state.lastOutcome.timingAccepted} class:bad={!state.lastOutcome.timingAccepted}>{timingBandLabel(state.lastOutcome.timingBand)}</strong></span>
        </div>
      {/if}
      {#if dailyFeedback}
        <div class={`rhythm-feedback ${dailyFeedbackTone}`} data-testid="rhythm-feedback">{dailyFeedback}</div>
      {/if}

      <div class="rhythm-actions">
        {#if dailyCompleted}
          <button class="btn btn-secondary" data-testid="rhythm-next-question" onclick={onAdvance}>Следующее задание</button>
        {:else if !state.isRunning && !(state.step === 'transferRemediation' && state.feedbackTone === 'good')}
          <button class="btn btn-primary" data-testid="rhythm-start-run" onclick={onStartRun}>{dailyCorrective ? 'Исправить в новом такте' : 'Начать отсчёт'}</button>
        {/if}
        {#if state.step === 'countingPulse' && !state.isRunning && state.activeBeat === 3}
          <button class="btn btn-secondary" onclick={onAdvance}>Продолжить</button>
        {:else if !isAssessment && state.step !== 'countingPulse' && state.feedbackText && state.feedbackTone === 'good'}
          <button class="btn btn-secondary" onclick={onAdvance}>{state.step === 'independentPlay' ? 'Перейти к проверке навыка' : 'Продолжить'}</button>
        {:else if state.step === 'transferRemediation' && !state.isRunning && state.feedbackText && state.feedbackTone === 'good'}
          <button class="btn btn-secondary" onclick={onRetry}>Следующая коррекция</button>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .chord-rhythm-stage { width: min(100%, 1060px); margin: 0 auto; padding: clamp(4px, 1vh, 12px) 14px; box-sizing: border-box; }
  .rhythm-stage-card { border: 1px solid #2b3a50; border-radius: 16px; background: linear-gradient(145deg, rgba(18,29,48,.98), rgba(10,18,33,.98)); padding: clamp(10px, 1.8vh, 16px) clamp(14px, 2.2vw, 24px); color: #e7edf7; text-align: center; box-sizing: border-box; box-shadow: 0 16px 44px rgba(0,0,0,.18); }
  .rhythm-top-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .rhythm-eyebrow { color: #73c9f3; font-size: .72rem; font-weight: 800; letter-spacing: .08em; }
  .rhythm-kicker { color: #f4d36c; font-size: .75rem; font-weight: 800; letter-spacing: .04em; }
  .rhythm-stage-progress { height: 4px; border-radius: 4px; margin: 4px auto 8px; max-width: 100%; background: #202d41; overflow: hidden; }
  .rhythm-stage-progress span { display: block; height: 100%; background: linear-gradient(90deg,#42c6f3,#8b83f7); transition: width .2s ease; }
  .rhythm-body-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; align-items: center; text-align: left; margin: 4px 0; }
  .rhythm-col-info { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .rhythm-col-info h2 { margin: 0 0 4px; font-size: clamp(1.15rem, 1.9vw, 1.55rem); color: #f8fafc; line-height: 1.25; }
  .rhythm-copy { margin: 0 0 6px; line-height: 1.42; color: #cbd5e1; font-size: clamp(.84rem, 1.15vw, .95rem); }
  .rhythm-copy.secondary { color: #94a3b8; font-size: .8rem; }
  .rhythm-change-plan { margin: 2px 0 4px; color: #c3d0e2; font-size: .84rem; }
  .rhythm-change-plan strong { color: #fff; }
  .rhythm-change-plan .change-now { color: #ffd76e; letter-spacing: .04em; }
  .rhythm-count-label { min-height: 1.2em; color: #96a8c0; font-size: .82rem; margin: 4px 0 2px; }
  .rhythm-play-now { color: #7ef0b0; font-size: .95rem; letter-spacing: .04em; }
  .rhythm-release-hint { color: #ffd76e; font-size: .88rem; }
  .rhythm-input-help { color: #94a3b8; font-size: .75rem; margin-top: 2px; }
  .rhythm-col-notes { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; text-align: center; }
  .rhythm-progression { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 auto 6px; font-size: .95rem; font-weight: 750; }
  .rhythm-progression span:not(.arrow) { padding: 4px 8px; border: 1px solid #35445b; border-radius: 8px; background: #101b2d; }
  .rhythm-progression span.active { color: #fff; border-color: #52c6f3; background: rgba(56,189,248,.17); }
  .rhythm-progression .arrow { color: #7788a0; font-size: .8rem; }
  .rhythm-target-row { display: flex; justify-content: center; align-items: center; gap: 10px; margin: 2px 0 4px; color: #a9b7cc; font-size: .85rem; }
  .rhythm-target-row strong { color: #fff; font-size: 1.05rem; }
  .rhythm-bpm { border: 1px solid #35465f; border-radius: 99px; padding: 2px 7px; font-size: .72rem; }
  .rhythm-beats { display: flex; justify-content: center; gap: 8px; margin: 4px auto; }
  .rhythm-beats span { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; border: 1px solid #43546c; background: #172337; color: #c9d4e3; font-size: .92rem; font-weight: 750; }
  .rhythm-beats span.strong { border-color: #e6bf53; color: #ffe18a; }
  .rhythm-beats span.active { transform: scale(1.08); background: #46bde7; color: #061220; border-color: #9de6ff; box-shadow: 0 0 14px rgba(70,189,231,.5); }
  .rhythm-strike-progress { margin: 2px auto 0; color: #9fb2ca; font-size: .78rem; font-weight: 700; }
  .rhythm-screen-input-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  .rhythm-selection { color: #aebbd0; font-size: .8rem; }
  .rhythm-play { min-width: 140px; min-height: 34px; padding: 4px 12px; font-size: .85rem; }
  .rhythm-feedback, .rhythm-result { width: fit-content; max-width: min(100%, 640px); margin: 6px auto; border-radius: 8px; padding: 6px 12px; line-height: 1.35; font-size: .85rem; font-weight: 700; }
  .rhythm-feedback.good, .rhythm-result.good { background: rgba(34,197,94,.13); color: #91e4aa; border: 1px solid rgba(74,222,128,.25); }
  .rhythm-feedback.bad { background: rgba(248,113,113,.12); color: #ffaaaa; border: 1px solid rgba(248,113,113,.25); }
  .rhythm-feedback.warn, .rhythm-result.warn { background: rgba(245,190,70,.12); color: #ffdf8b; border: 1px solid rgba(245,190,70,.24); }
  .rhythm-diagnostics { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; margin: 4px auto; color: #bac7d8; font-size: .8rem; }
  .rhythm-diagnostics .good { color: #8fe0a6; }
  .rhythm-diagnostics .bad { color: #ffaaaa; }
  .rhythm-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
  .rhythm-primary { margin-top: 10px; }
  @media (max-width: 768px) {
    .rhythm-body-grid { grid-template-columns: 1fr; gap: 8px; text-align: center; }
    .rhythm-col-info h2, .rhythm-copy, .rhythm-count-label { text-align: center; }
  }
  @media (max-height: 820px) {
    .chord-rhythm-stage { padding: 2px 14px; }
    .rhythm-stage-card { padding: 8px 16px; }
    .rhythm-meta-bar { margin-bottom: 2px; }
    .rhythm-eyebrow { font-size: .68rem; }
    .rhythm-device { font-size: .74rem; }
    .rhythm-body-grid { gap: 10px; margin: 2px 0; }
    .rhythm-col-info h2 { font-size: 1.15rem; margin-bottom: 2px; }
    .rhythm-copy { font-size: .80rem; margin-bottom: 3px; line-height: 1.35; }
    .rhythm-change-plan { font-size: .78rem; margin: 1px 0 2px; }
    .rhythm-count-label { font-size: .78rem; margin: 2px 0 1px; }
    .rhythm-progression { margin: 0 auto 3px; font-size: .85rem; }
    .rhythm-progression span:not(.arrow) { padding: 2px 6px; }
    .rhythm-target-row { margin: 1px 0 2px; font-size: .78rem; }
    .rhythm-target-row strong { font-size: .95rem; }
    .rhythm-beats { margin: 2px auto; }
    .rhythm-beats span { width: 26px; height: 26px; font-size: .80rem; }
    .rhythm-actions { margin-top: 4px; }
    .rhythm-screen-input-row { margin-top: 2px; }
    .rhythm-feedback, .rhythm-result { margin: 3px auto; padding: 4px 10px; font-size: .78rem; }
    .rhythm-diagnostics { margin: 2px auto; gap: 4px 12px; font-size: .75rem; }
  }
</style>
