<script lang="ts">
  import type { ChordRhythmModuleState, ChordRhythmStep, ChordRhythmSkill } from '../../core/learning/chordRhythm';
  import { currentRhythmTrial, getRhythmAssessmentLength } from '../../core/learning/chordRhythm';
  import { HARMONY_CHORDS, type HarmonyChordId } from '../../core/learning/harmony';

  let {
    state,
    midiConnected = false,
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
  const trial = $derived(currentRhythmTrial(state));
  const targetChordId = $derived.by((): HarmonyChordId => {
    if (dailySkill) return dailyChordId;
    if (state.step === 'fullProgression' || state.step === 'independentPlay') {
      return (['C', 'G/B', 'Am', 'F'] as const)[state.sequenceIndex % 4];
    }
    if (state.step === 'transferAssessment' || state.step === 'transferRemediation') return trial.chordId;
    return 'C';
  });
  const targetChord = $derived(HARMONY_CHORDS[targetChordId]);
  const assessmentLength = $derived(dailySkill ? 1 : getRhythmAssessmentLength(state.assessment));
  const displayTrialNumber = $derived(dailySkill ? 1 : state.assessment.phase === 'remediation'
    ? state.assessment.remediationIndex + 1
    : Math.min(state.assessment.trialIndex + 1, assessmentLength));
  const progressPct = $derived(dailySkill ? 100 : isAssessment
    ? Math.round(state.assessment.trialsCompleted / assessmentLength * 100)
    : Math.round((['pulseOrientation', 'countingPulse', 'oneChordPerBar', 'changeOnBeatOne', 'fullProgression', 'twoStrikes', 'independentPlay'].indexOf(state.step) + 1) / 7 * 100));
</script>

<section class="chord-rhythm-stage" data-testid="chord-rhythm-stage" data-rhythm-step={state.step}>
  <div class="rhythm-stage-card">
    <div class="rhythm-eyebrow">{dailySkill ? 'ЕЖЕДНЕВНАЯ ПРАКТИКА · РИТМ АККОРДОВ' : 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · РИТМ АККОРДОВ'}</div>
    <div class="rhythm-stage-progress" aria-label="Прогресс этапа"><span style={`width:${progressPct}%`}></span></div>
    <div class="rhythm-kicker">{headings.eyebrow}</div>
    <h2>{headings.title}</h2>

    {#if dailySkill}
      <p class="rhythm-copy">{dailySkill === 'chordPulse' ? 'Сыграйте три ноты аккорда точно на первую долю такта.' : dailySkill === 'chordChangeTiming' ? 'Подготовьте аккорд заранее и сыграйте его на первую долю.' : 'Сыграйте один аккорд на долях 1 и 3.'} Задано: <strong>{targetChordId}</strong>.</p>
      {#if dailyCorrective}<p class="rhythm-copy secondary">Первая попытка уже сохранена. Исправьте ответ, чтобы продолжить.</p>{/if}
    {:else if state.step === 'pulseOrientation'}
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
        <button type="button" class="btn btn-primary rhythm-primary" onclick={onComplete}>Завершить модуль</button>
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
    {:else}
      {#if state.step === 'countingPulse'}
        <p class="rhythm-copy">Слушайте четыре равные доли. Первая доля каждого такта выделена сильным щелчком.</p>
      {:else if state.step === 'oneChordPerBar'}
        <p class="rhythm-copy">Подготовьте три клавиши аккорда <strong>C</strong>, затем нажмите «Сыграть аккорд» около первой доли.</p>
      {:else if state.step === 'changeOnBeatOne'}
        <p class="rhythm-copy">Аккорд меняется только на следующую сильную долю — <strong>раз</strong>. Приготовьте <strong>{targetChordId}</strong> до начала такта.</p>
      {:else if state.step === 'fullProgression'}
        <p class="rhythm-copy">Играйте по одному аккорду на такт. Новый аккорд вступает на первую долю: <strong>{targetChordId}</strong>.</p>
      {:else if state.step === 'twoStrikes'}
        <p class="rhythm-copy">Держите один аккорд и сыграйте его дважды за такт: на долях <strong>1</strong> и <strong>3</strong>.</p>
      {:else if state.step === 'independentPlay'}
        <p class="rhythm-copy">Без подсказки смените аккорд на сильную долю последовательности <strong>C → G/B → Am → F</strong>.</p>
      {:else if state.step === 'transferAssessment'}
        <p class="rhythm-copy">Задание {displayTrialNumber} из {assessmentLength}. Приготовьте аккорд <strong>{targetChordId}</strong>{trial.beatsPerChord === 2 ? ' и сыграйте на долях 1 и 3' : ' и сыграйте на первой доле'}.</p>
      {:else if state.step === 'transferRemediation'}
        <p class="rhythm-copy">Коррекция {state.assessment.remediationIndex + 1} из {state.assessment.remediationTrialIndexes.length}. Снова сыграйте <strong>{targetChordId}</strong> точно на указанную долю.</p>
      {/if}

      {#if state.step === 'fullProgression' || state.step === 'independentPlay'}
        <div class="rhythm-progression" aria-label="Последовательность аккордов">
          {#each ['C', 'G/B', 'Am', 'F'] as chord, index}
            <span class:active={index === state.sequenceIndex}>{chord}</span>{#if index < 3}<span class="arrow">→</span>{/if}
          {/each}
        </div>
      {/if}

      <div class="rhythm-target-row"><span>Текущий аккорд</span><strong>{targetChord.symbol}</strong><span class="rhythm-bpm">4/4 · 60 BPM</span></div>
      <div class="rhythm-beats" data-testid="rhythm-beat-indicator" aria-label="Доли такта">
        {#each [0, 1, 2, 3] as beat}
          <span class:active={state.activeBeat === beat} class:strong={beat === 0}>{beat + 1}</span>
        {/each}
      </div>
      <div class="rhythm-count-label">{state.countInValue !== null ? `Приготовьтесь ${state.countInValue}` : state.isRunning ? `Доля ${Math.max(1, state.activeBeat + 1)} · приготовьтесь сыграть на «раз»` : 'Начните с отсчёта'}</div>

      {#if state.step !== 'countingPulse'}
        <div class="rhythm-input-help">Выберите ровно три ноты заранее, затем нажмите «Сыграть аккорд» у нужной доли. MIDI: сыграйте три ноты вместе. {#if midiConnected}<span class="midi-ready">MIDI подключён</span>{/if}</div>
        <div class="rhythm-selection" data-testid="rhythm-selected-count">Выбрано клавиш: <strong>{state.selectedKeyIds.length} из 3</strong></div>
        <button class="btn btn-primary rhythm-play" disabled={!state.isRunning || state.selectedKeyIds.length !== 3} onclick={onSubmit}>Сыграть аккорд</button>
      {/if}

      {#if state.feedbackText}
        <div class={`rhythm-feedback ${state.feedbackTone}`} data-testid="rhythm-feedback">{state.feedbackText}</div>
      {/if}
      {#if state.lastOutcome}
        <div class="rhythm-diagnostics" data-testid="rhythm-outcome-parts">
          <span>Аккорд: <strong class:good={state.lastOutcome.chordCorrect} class:bad={!state.lastOutcome.chordCorrect}>{state.lastOutcome.chordCorrect ? 'верный' : 'неверный'}</strong></span>
          <span>Время: <strong class:good={state.lastOutcome.timingBand === 'on_time'} class:bad={state.lastOutcome.timingBand !== 'on_time'}>{state.lastOutcome.timingBand === 'on_time' ? 'Точно' : state.lastOutcome.timingBand === 'early' ? 'Рано' : state.lastOutcome.timingBand === 'late' ? 'Поздно' : 'Пропущена доля'}</strong></span>
        </div>
      {/if}
      {#if dailyFeedback}
        <div class={`rhythm-feedback ${dailyFeedbackTone}`} data-testid="rhythm-feedback">{dailyFeedback}</div>
      {/if}

      <div class="rhythm-actions">
        {#if dailyCompleted}
          <button class="btn btn-secondary" data-testid="rhythm-next-question" onclick={onAdvance}>Следующее задание</button>
        {:else if !state.isRunning && !(state.step === 'transferRemediation' && state.feedbackTone === 'good')}
          <button class="btn btn-primary" data-testid="rhythm-start-run" onclick={onStartRun}>{dailyCorrective ? 'Исправить в новом такте' : 'Приготовьтесь 4 · 3 · 2 · 1'}</button>
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
  .chord-rhythm-stage { width: min(100%, 1040px); margin: 0 auto; padding: clamp(14px, 2vh, 24px); box-sizing: border-box; }
  .rhythm-stage-card { border: 1px solid #2b3a50; border-radius: 18px; background: linear-gradient(145deg, rgba(18,29,48,.98), rgba(10,18,33,.98)); padding: clamp(20px, 3vw, 34px); color: #e7edf7; text-align: center; box-shadow: 0 18px 50px rgba(0,0,0,.18); }
  .rhythm-eyebrow { color: #73c9f3; font-size: .75rem; font-weight: 800; letter-spacing: .08em; }
  .rhythm-stage-progress { height: 5px; border-radius: 6px; margin: 14px auto 18px; max-width: 700px; background: #202d41; overflow: hidden; }
  .rhythm-stage-progress span { display: block; height: 100%; background: linear-gradient(90deg,#42c6f3,#8b83f7); transition: width .2s ease; }
  .rhythm-kicker { color: #f4d36c; font-size: .78rem; font-weight: 800; letter-spacing: .04em; }
  h2 { margin: 8px 0 10px; font-size: clamp(1.4rem, 2.8vw, 2rem); }
  .rhythm-copy { max-width: 760px; margin: 10px auto; line-height: 1.55; color: #d4dceb; }
  .rhythm-copy.secondary { color: #9fadc2; }
  .rhythm-primary { margin-top: 18px; }
  .rhythm-target-row { display: flex; justify-content: center; align-items: center; gap: 14px; margin: 14px 0 8px; color: #a9b7cc; }
  .rhythm-target-row strong { color: #fff; font-size: 1.12rem; }
  .rhythm-bpm { border: 1px solid #35465f; border-radius: 99px; padding: 3px 9px; font-size: .8rem; }
  .rhythm-progression { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 16px auto; font-size: 1.12rem; font-weight: 750; }
  .rhythm-progression span:not(.arrow) { padding: 8px 12px; border: 1px solid #35445b; border-radius: 11px; background: #101b2d; }
  .rhythm-progression span.active { color: #fff; border-color: #52c6f3; background: rgba(56,189,248,.17); box-shadow: 0 0 0 2px rgba(56,189,248,.1); }
  .rhythm-progression .arrow { color: #7788a0; }
  .rhythm-beats { display: flex; justify-content: center; gap: clamp(12px, 3vw, 26px); margin: 12px auto 4px; }
  .rhythm-beats span { width: clamp(40px, 5vw, 54px); height: clamp(40px, 5vw, 54px); display: grid; place-items: center; border-radius: 50%; border: 1px solid #43546c; background: #172337; color: #c9d4e3; font-size: 1.05rem; font-weight: 750; }
  .rhythm-beats span.strong { border-color: #e6bf53; color: #ffe18a; }
  .rhythm-beats span.active { transform: scale(1.1); background: #46bde7; color: #061220; border-color: #9de6ff; box-shadow: 0 0 20px rgba(70,189,231,.55); }
  .rhythm-count-label { min-height: 1.4em; color: #96a8c0; font-size: .85rem; }
  .rhythm-input-help { max-width: 720px; margin: 14px auto 5px; color: #b8c5d8; font-size: .92rem; line-height: 1.45; }
  .midi-ready { margin-left: 6px; color: #88e5a8; font-weight: 700; }
  .rhythm-selection { color: #aebbd0; margin: 6px auto; }
  .rhythm-diagnostics { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; margin: 9px auto; color: #bac7d8; }
  .rhythm-diagnostics .good { color: #8fe0a6; }
  .rhythm-diagnostics .bad { color: #ffaaaa; }
  .rhythm-play { min-width: 190px; margin: 4px auto 8px; }
  .rhythm-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 14px; }
  .rhythm-feedback,.rhythm-result { width: fit-content; max-width: min(100%, 600px); margin: 12px auto; border-radius: 10px; padding: 10px 15px; line-height: 1.45; font-weight: 700; }
  .rhythm-feedback.good,.rhythm-result.good { background: rgba(34,197,94,.13); color: #91e4aa; border: 1px solid rgba(74,222,128,.25); }
  .rhythm-feedback.bad { background: rgba(248,113,113,.12); color: #ffaaaa; border: 1px solid rgba(248,113,113,.25); }
  .rhythm-feedback.warn,.rhythm-result.warn { background: rgba(245,190,70,.12); color: #ffdf8b; border: 1px solid rgba(245,190,70,.24); }
  @media (max-height: 820px) { .chord-rhythm-stage { padding-top: 8px; padding-bottom: 10px; } .rhythm-stage-card { padding-top: 18px; padding-bottom: 18px; } .rhythm-stage-progress { margin: 9px auto 12px; } .rhythm-beats { margin-top: 7px; } .rhythm-progression { margin: 9px auto; } }
</style>
