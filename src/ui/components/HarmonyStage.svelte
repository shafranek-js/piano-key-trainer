<script lang="ts">
  import HarmonyProgression from './HarmonyProgression.svelte';
  import {
    HARMONY_CHORDS,
    HARMONY_ROOT_SEQUENCE,
    HARMONY_SMOOTH_SEQUENCE,
    HARMONY_TRANSFER_TRIALS,
    HARMONY_REQUIRED_ACCURACY,
    getCurrentHarmonyChord,
    getCurrentHarmonyProgression,
    getCurrentHarmonyQuestion,
    getCurrentHarmonyAssessmentTrial,
    getCurrentHarmonyRemediationTrial,
    getHarmonyAssessmentLength,
    type HarmonyAction,
    type HarmonyCurriculumState,
    type HarmonyReviewTask
  } from '../../core/learning/harmony';
  import type { TrialInputMethod } from '../../core/learning/types';

  let {
    state = null as HarmonyCurriculumState | null,
    midiHeldKeyIds = [],
    selectedKeyIds = [],
    reviewTask = null as HarmonyReviewTask | null,
    reviewStepIndex = 0,
    reviewHadWrong = false,
    reviewCompleted = false,
    reviewFeedback = '',
    reviewFeedbackTone = '',
    onAction,
    onComplete,
    onReviewAnswer,
    onReviewToggleKey,
    onReviewSubmitChord,
    onReviewNext
  }: {
    state?: HarmonyCurriculumState | null;
    midiHeldKeyIds?: readonly string[];
    selectedKeyIds?: readonly string[];
    reviewTask?: HarmonyReviewTask | null;
    reviewStepIndex?: number;
    reviewHadWrong?: boolean;
    reviewCompleted?: boolean;
    reviewFeedback?: string;
    reviewFeedbackTone?: string;
    onAction?: (action: HarmonyAction) => void;
    onComplete?: () => void;
    onReviewAnswer?: (answer: string) => void;
    onReviewToggleKey?: (keyId: string) => void;
    onReviewSubmitChord?: (keyIds: readonly string[], inputMethod: TrialInputMethod) => void;
    onReviewNext?: () => void;
  } = $props();

  const moduleQuestion = $derived(state ? getCurrentHarmonyQuestion(state) : null);
  const progression = $derived(state ? getCurrentHarmonyProgression(state) : null);
  const currentChord = $derived(state ? getCurrentHarmonyChord(state) : null);
  const assessment = $derived(state?.progress['advanced-harmony:transfer']?.transferAssessment ?? null);
  const currentAssessmentTrial = $derived(state?.step === 'transferAssessment' ? getCurrentHarmonyAssessmentTrial(state) : null);
  const currentRemediationTrial = $derived(state?.step === 'transferRemediation' ? getCurrentHarmonyRemediationTrial(state) : null);
  const totalAssessmentTrials = $derived(assessment ? getHarmonyAssessmentLength(assessment) : HARMONY_TRANSFER_TRIALS);
  const isReviewSequence = $derived(reviewTask?.kind === 'progression');
  const reviewChord = $derived(reviewTask?.progression?.[reviewStepIndex] ? HARMONY_CHORDS[reviewTask.progression[reviewStepIndex]] : null);

  function submitModuleChord() { onAction?.({ type: 'submitChord' }); }
  function submitReviewChord() { onReviewSubmitChord?.(selectedKeyIds, 'screen'); }
</script>

{#if reviewTask}
  <section class="harmony-stage" data-testid="harmony-review-stage" data-review-card-id={`${reviewTask.skill}:${reviewTask.note}`} data-review-skill={reviewTask.skill} data-review-note={reviewTask.note} data-review-step={reviewStepIndex}>
    <div class="stage-eyebrow">DAILY PRACTICE · ГАРМОНИЯ</div>
    <h2>{reviewTask.skill === 'harmonyProgressionPlay' ? 'Плановое повторение последовательности' : 'Плановое повторение гармонии'}</h2>
    <p class="stage-instruction" data-testid={reviewTask.kind === 'semantic' ? 'harmony-semantic-prompt' : undefined}>{reviewTask.prompt}</p>
    {#if reviewTask.kind === 'semantic'}
      <div class="answer-grid" data-testid="harmony-semantic-options">
        {#each reviewTask.choices as choice, index (choice)}
          <button type="button" class="answer-choice" onclick={() => onReviewAnswer?.(choice)}>
            <kbd>{index + 1}</kbd><strong>{choice}</strong>
          </button>
        {/each}
      </div>
    {:else if reviewTask.progression}
      <HarmonyProgression chords={reviewTask.progression} currentIndex={reviewStepIndex} showFunctions={false} />
      {#if reviewChord}
        <div class="active-chord">
          <span>Текущий аккорд</span><strong>{reviewChord.symbol}</strong>
        </div>
        <p class="input-contract"><strong>Сыграйте все 3 ноты одновременно.</strong><br>Экранное пианино: выберите 3 клавиши и нажмите «Проверить аккорд»; после правильного аккорда выбор сбрасывается. MIDI: удерживайте три клавиши вместе, затем отпустите все ноты перед следующим аккордом.</p>
        {#if selectedKeyIds.length > 0}<div class="input-count">Выбрано: {selectedKeyIds.length} из 3 нот</div>{/if}
        {#if selectedKeyIds.length > 0}<button type="button" class="btn" onclick={() => onReviewToggleKey?.(selectedKeyIds[selectedKeyIds.length - 1])}>Убрать последнюю ноту</button>{/if}
        {#if midiHeldKeyIds.length > 0}<div class="input-count">MIDI: {midiHeldKeyIds.length} из 3 нот{midiHeldKeyIds.length > 3 ? ' — отпустите все клавиши, затем сыграйте ровно три ноты' : ''}</div>{/if}
        <button type="button" class="btn primary" data-testid="harmony-review-submit-chord" disabled={selectedKeyIds.length !== 3} onclick={submitReviewChord}>Проверить аккорд</button>
      {/if}
    {/if}
    {#if reviewFeedback}<div class="feedback {reviewFeedbackTone}" data-testid="harmony-feedback" role="status">{reviewFeedback}</div>{/if}
    {#if reviewHadWrong}<p class="review-note">{isReviewSequence ? 'Любая ошибка внутри цепочки считается одной первой ошибкой этой карточки. Исправление не создаёт дополнительную FSRS-запись.' : 'Первая попытка карточки уже сохранена. Исправление не создаёт дополнительную FSRS-запись.'}</p>{/if}
    {#if reviewCompleted}<button type="button" class="btn primary" data-testid="harmony-review-next" onclick={() => onReviewNext?.()}>Следующее задание</button>{/if}
  </section>
{:else if state}
  <section class="harmony-stage" data-testid="harmony-module-stage" data-harmony-step={state.step} data-sequence-index={state.sequenceIndex} data-quiz-index={state.quizIndex}>
    <div class="stage-eyebrow">ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ГАРМОНИЯ И СОПРОВОЖДЕНИЕ</div>

    {#if state.step === 'orientation'}
      <h2>Что такое гармоническая последовательность?</h2>
      <p class="stage-instruction">Аккорды часто играются не по отдельности, а цепочкой. Такая цепочка создаёт гармонию песни.</p>
      <HarmonyProgression chords={HARMONY_ROOT_SEQUENCE} currentIndex={-1} completed={true} />
      <div class="roman-map">
        <span><b>C</b><small>I · мажор</small></span>
        <span><b>G</b><small>V · мажор</small></span>
        <span><b>Am</b><small>vi · минор</small></span>
        <span><b>F</b><small>IV · мажор</small></span>
      </div>
      <p class="theory-note">Римская цифра показывает место аккорда в тональности. Заглавные цифры обозначают мажорные аккорды, маленькие — минорные.</p>
      <button type="button" class="btn primary" data-testid="harmony-continue" onclick={() => onAction?.({ type: 'advanceStage' })}>Понятно · продолжить</button>
    {:else if state.step === 'functionIdentify' || state.step === 'inversionChoice' || state.step === 'nextChord'}
      <h2>{state.step === 'functionIdentify' ? 'Функции четырёх аккордов' : state.step === 'inversionChoice' ? 'Выберите более плавный переход' : 'Какой аккорд идёт дальше?'}</h2>
      {#if moduleQuestion}
        <p class="stage-instruction" data-testid="harmony-semantic-prompt">{moduleQuestion.prompt}</p>
        <div class="answer-grid" data-testid="harmony-semantic-options">
          {#each moduleQuestion.choices as choice, index (choice)}
            <button type="button" class="answer-choice" onclick={() => onAction?.({ type: 'selectAnswer', answer: choice })}>
              <kbd>{index + 1}</kbd><strong>{choice}</strong>
            </button>
          {/each}
        </div>
        {#if state.step === 'functionIdentify'}<p class="theory-note">В C major: I = C · V = G · vi = Am · IV = F</p>{/if}
      {/if}
    {:else if state.step === 'rootProgression' || state.step === 'guidedSequence' || state.step === 'independentSequence' || state.step === 'memorySequence' || state.step === 'transferAssessment' || state.step === 'transferRemediation'}
      {@const isAssessment = state.step === 'transferAssessment'}
      {@const isRemediation = state.step === 'transferRemediation'}
      {@const isMemory = state.step === 'memorySequence'}
      {@const isIndependent = state.step === 'independentSequence' || isMemory || isAssessment || isRemediation}
      {@const chord = currentChord}
      {#if isAssessment && assessment}
        <div class="assessment-meter">{assessment.blockKind === 'retry' ? 'Повторная проверка' : 'Проверка навыка'} · {Math.min(assessment.trialsCompleted + 1, totalAssessmentTrials)} из {totalAssessmentTrials}</div>
      {:else if isRemediation && assessment}
        <div class="assessment-meter">Закрепление слабых мест · {Math.min(assessment.remediationIndex + 1, assessment.remediationTrialIndexes.length)} из {assessment.remediationTrialIndexes.length}</div>
      {/if}
      <h2>{isMemory ? 'Вспомните ноты по символам' : isAssessment ? 'Перенос навыка' : isRemediation ? 'Закрепите трудные места' : state.step === 'rootProgression' ? 'Сначала сыграйте аккорды в основном положении' : isIndependent ? 'Сыграйте последовательность самостоятельно' : 'Сыграйте последовательность с подсказкой'}</h2>
      {#if moduleQuestion}
        <p class="stage-instruction" data-testid="harmony-semantic-prompt">{moduleQuestion.prompt}</p>
      {:else if isAssessment && currentAssessmentTrial?.kind === 'progression'}
        <p class="stage-instruction" data-testid="harmony-progression-prompt">{currentAssessmentTrial.prompt}</p>
      {:else if isRemediation && currentRemediationTrial?.kind === 'progression'}
        <p class="stage-instruction" data-testid="harmony-progression-prompt">{currentRemediationTrial.prompt}</p>
      {:else}
        <p class="stage-instruction">Один аккорд за раз. Каждый следующий становится активным только после правильного ответа.</p>
      {/if}
      {#if (isAssessment || isRemediation) && moduleQuestion}
        <div class="answer-grid" data-testid="harmony-transfer-choices" data-semantic-options="true" aria-label="Варианты ответа">
          {#each moduleQuestion.choices as choice, index (choice)}
            <button type="button" class="answer-choice" data-testid="harmony-transfer-answer" onclick={() => onAction?.({ type: 'selectAnswer', answer: choice })}>
              <kbd>{index + 1}</kbd><strong>{choice}</strong>
            </button>
          {/each}
        </div>
      {/if}
      {#if progression}
        <HarmonyProgression chords={progression} currentIndex={state.sequenceIndex} showFunctions={!isMemory && !isIndependent} showBass={state.step === 'guidedSequence'} />
      {/if}
      {#if chord}
        <div class="active-chord">
          <span>{isAssessment || isRemediation ? 'Текущий аккорд' : `Аккорд ${state.sequenceIndex + 1} из ${progression?.length ?? 4}`}</span>
          <strong>{chord.symbol}</strong>
          {#if !isIndependent}<small>{chord.functionId} · бас {chord.bassKeyId}</small>{/if}
        </div>
        {#if state.step === 'rootProgression' || state.step === 'guidedSequence'}
          <div class="voicing-hint">Ноты: {chord.keyIds.join(' · ')}</div>
        {/if}
        <p class="input-contract"><strong>Сыграйте все 3 ноты одновременно.</strong><br>Экранное пианино: выберите 3 клавиши и нажмите «Проверить аккорд»; после правильного аккорда выбор сбрасывается. MIDI: удерживайте три клавиши вместе, затем отпустите все ноты перед следующим аккордом.</p>
        {#if selectedKeyIds.length > 0}<div class="input-count">Экранное пианино: {selectedKeyIds.length} из 3 нот выбрано</div>{/if}
        {#if midiHeldKeyIds.length > 0}<div class="input-count">MIDI: {midiHeldKeyIds.length} из 3 нот удерживается{midiHeldKeyIds.length > 3 ? ' — отпустите все клавиши, затем сыграйте ровно три ноты' : ''}</div>{/if}
        <button type="button" class="btn primary" data-testid="harmony-submit-chord" disabled={selectedKeyIds.length !== 3} onclick={submitModuleChord}>Проверить аккорд</button>
      {/if}
    {:else if state.step === 'smoothModel'}
      <h2>Плавный переход: C → G/B → Am</h2>
      <HarmonyProgression chords={HARMONY_SMOOTH_SEQUENCE.slice(0, 3)} currentIndex={-1} completed={true} showBass={true} />
      <div class="bass-walk"><span>C</span><b>→</b><span>B</span><b>→</b><span>A</span></div>
      <p class="theory-note">Обращение оставляет тот же аккорд G major, но ставит другую ноту в бас. Так переход может стать плавнее.</p>
      <button type="button" class="btn primary" onclick={() => onAction?.({ type: 'advanceStage' })}>Продолжить</button>
    {:else if state.step === 'smoothComparison'}
      <h2>Сравните два варианта</h2>
      <div class="comparison-row"><div><span>Основное положение</span><HarmonyProgression chords={['C', 'G', 'Am']} currentIndex={-1} completed={true} showBass={true} /></div><div><span>С G/B в басу</span><HarmonyProgression chords={['C', 'G/B', 'Am']} currentIndex={-1} completed={true} showBass={true} /></div></div>
      <p class="theory-note">G и G/B — один и тот же мажорный аккорд G. Меняется порядок нот: в G/B нота B стоит в басу.</p>
      <button type="button" class="btn primary" onclick={() => onAction?.({ type: 'advanceStage' })}>Продолжить</button>
    {:else if state.step === 'transferResult' && assessment}
      {@const total = getHarmonyAssessmentLength(assessment)}
      {@const pct = total ? Math.round(assessment.correctFirstAttempts / total * 100) : 0}
      <h2>Проверка завершена</h2>
      <div class="result-card">
        <strong>Точность: {pct}%</strong>
        <span>Нужно: {Math.round(HARMONY_REQUIRED_ACCURACY * 100)}%</span>
        <span>{assessment.correctFirstAttempts} из {total} с первой попытки</span>
        {#if assessment.phase !== 'passed'}<p>Закрепите задания, которые вызвали трудности: функции аккордов, выбор следующего аккорда и игра цепочки.</p>{/if}
      </div>
      <button type="button" class="btn primary" data-testid={assessment.phase === 'passed' ? 'harmony-finish-assessment' : 'harmony-start-remediation'} onclick={() => onAction?.({ type: 'advanceStage' })}>{assessment.phase === 'passed' ? 'Завершить модуль' : 'Закрепить слабые места'}</button>
    {:else if state.step === 'moduleComplete'}
      <h2>Гармония и сопровождение освоены!</h2>
      <p class="stage-instruction">Теперь вы можете узнавать I–V–vi–IV, выбирать G/B для плавного басового перехода и сыграть цепочку C → G/B → Am → F.</p>
      <div class="completion-metrics"><span>Функции аккордов · освоены</span><span>Последовательности · освоены</span><span>Плавные переходы · освоены</span></div>
      <button type="button" class="btn primary" data-testid="harmony-module-complete" onclick={() => onComplete?.()}>Вернуться к программе</button>
    {/if}

    {#if state.feedbackText}<div class="feedback {state.feedbackTone}" data-testid="harmony-feedback" role="status">{state.feedbackText}</div>{/if}
  </section>
{/if}

<style>
  .harmony-stage { width: min(100%, 900px); margin: 18px auto; padding: 24px; box-sizing: border-box; border: 1px solid #26364d; border-radius: 18px; background: linear-gradient(155deg, rgba(15,23,42,.96), rgba(10,16,31,.97)); color: #e2e8f0; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.2); }
  .stage-eyebrow { margin-bottom: 8px; color: #7dd3fc; font-size: .72rem; font-weight: 800; letter-spacing: .08em; }
  .harmony-stage h2 { margin: 8px 0 10px; font-size: clamp(1.15rem, 2.4vw, 1.55rem); }
  .stage-instruction { max-width: 700px; margin: 0 auto 16px; color: #cbd5e1; line-height: 1.55; }
  .roman-map, .answer-grid, .completion-metrics { display: flex; justify-content: center; align-items: stretch; gap: 10px; flex-wrap: wrap; margin: 18px auto; }
  .roman-map span, .completion-metrics span { display: flex; flex-direction: column; gap: 4px; min-width: 78px; padding: 10px 13px; border: 1px solid #334155; border-radius: 12px; background: rgba(15,23,42,.8); }
  .roman-map b { font-size: 1.05rem; color: #f8fafc; }
  .roman-map small { color: #94a3b8; }
  .theory-note { max-width: 670px; margin: 16px auto; color: #aebdd0; line-height: 1.55; }
  .answer-choice { display: inline-flex; align-items: center; gap: 12px; min-width: 116px; padding: 12px 15px; border: 1px solid #475569; border-radius: 12px; background: #111c30; color: #f8fafc; cursor: pointer; }
  .answer-choice:hover { border-color: #38bdf8; background: #172840; }
  .answer-choice kbd { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: #26374f; color: #bae6fd; }
  .input-contract { margin: 16px auto 8px; max-width: 680px; line-height: 1.55; color: #bdcadb; }
  .input-count { margin: 6px auto; color: #7dd3fc; font-size: .85rem; }
  .active-chord { display: flex; flex-direction: column; gap: 4px; width: fit-content; min-width: 155px; margin: 15px auto 8px; padding: 10px 20px; border-radius: 12px; border: 1px solid #38bdf8; background: rgba(14,116,144,.15); }
  .active-chord span, .active-chord small { color: #94a3b8; font-size: .78rem; }
  .active-chord strong { font-size: 1.3rem; color: #f8fafc; }
  .voicing-hint { margin: 8px auto; color: #fde68a; font-size: .9rem; }
  .bass-walk { display: flex; justify-content: center; align-items: center; gap: 22px; margin: 16px 0; color: #7dd3fc; font-size: 1.3rem; font-weight: 800; }
  .comparison-row { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; margin: 18px 0; }
  .comparison-row > div { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid #334155; border-radius: 14px; }
  .comparison-row > div > span { color: #aebdd0; font-size: .86rem; font-weight: 700; }
  .assessment-meter { color: #facc15; font-weight: 750; margin: 6px 0 10px; }
  .result-card { display: flex; flex-direction: column; gap: 8px; width: min(100%, 430px); margin: 18px auto; padding: 18px; border: 1px solid #475569; border-radius: 14px; background: rgba(15,23,42,.85); }
  .result-card strong { font-size: 1.3rem; color: #f8fafc; }
  .result-card p { margin: 4px 0 0; color: #bdcadb; }
  .review-note { margin: 8px auto; color: #fde68a; font-size: .82rem; }
  .feedback { margin: 14px auto 0; max-width: 700px; padding: 10px 14px; border-radius: 10px; line-height: 1.45; }
  .feedback.good { color: #bbf7d0; background: rgba(22,101,52,.2); }
  .feedback.bad { color: #fecdd3; background: rgba(159,18,57,.2); }
  .feedback.warn { color: #fde68a; background: rgba(146,64,14,.2); }
  @media (max-width: 720px) { .harmony-stage { padding: 17px 13px; } .comparison-row { grid-template-columns: 1fr; } .answer-grid { gap: 7px; } .answer-choice { min-width: 84px; padding: 9px; } }
</style>
