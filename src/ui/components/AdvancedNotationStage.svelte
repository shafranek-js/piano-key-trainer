<script lang="ts">
  import { DISPLAY_NAMES } from '../../core/fsrs/constants';
  import Staff from './Staff.svelte';
  import {
    BASS_NOTE_ACQUISITION_ORDER,
    canUseDontKnowInBassGrandStep,
    describeBassGrandStep,
    getBassNoteCurriculumItemId,
    GRAND_STAFF_TRANSFER_TRIALS,
    type BassGrandCurriculumState
  } from '../../core/learning';

  let {
    state,
    onDontKnow,
    onAdvanceStage,
    onCompleteModule
  }: {
    state: BassGrandCurriculumState;
    onDontKnow?: () => void;
    onAdvanceStage?: () => void;
    onCompleteModule?: () => void;
  } = $props();

  const stepDesc = $derived(describeBassGrandStep(state.step));
  const showDontKnow = $derived(canUseDontKnowInBassGrandStep(state));

  const masteredBassCount = $derived(
    BASS_NOTE_ACQUISITION_ORDER.filter(n => {
      const rec = state.progress[getBassNoteCurriculumItemId(n)];
      return rec?.state === 'retention' && !rec.contexts.includes('pending:delayedRetry');
    }).length
  );

  const eyebrowText = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · БАСОВЫЙ КЛЮЧ · ЗНАКОМСТВО';
    }
    if (stepDesc.kind === 'bassFinalMix') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · БАСОВЫЙ КЛЮЧ · ЗАКРЕПЛЕНИЕ ВСЕХ 7 НОТ';
    }
    if (stepDesc.kind === 'grandOrientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · БОЛЬШАЯ СИСТЕМА · ЗНАКОМСТВО';
    }
    if (stepDesc.kind === 'grandTransfer') {
      return `ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · БОЛЬШАЯ СИСТЕМА · ПЕРЕНОС НАВЫКА (ЗАДАНИЕ ${state.grandTransferTrialsCompleted + 1} · МИНИМУМ ${GRAND_STAFF_TRANSFER_TRIALS})`;
    }
    if (stepDesc.kind === 'complete') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · БАСОВЫЙ КЛЮЧ И БОЛЬШАЯ СИСТЕМА · ЗАВЕРШЕНО';
    }

    const badge = `БАСОВЫЙ КЛЮЧ · ${Math.min(7, masteredBassCount + 1)} ИЗ 7`;
    switch (stepDesc.subStage) {
      case 'model':
        return `${badge} · МОДЕЛЬ И ОРИЕНТИР`;
      case 'qualify':
        return `${badge} · БЕЗ ПОДСКАЗОК`;
      case 'localMix':
        return `${badge} · СРАВНЕНИЕ С ИЗУЧЕННЫМИ`;
      case 'delayedCheck':
      default:
        return state.isInterveningRecall
          ? `${badge} · КОНТРАСТНЫЙ ШАГ`
          : `${badge} · ПРОВЕРКА ПО ПАМЯТИ`;
    }
  });

  const bodyInstruction = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'Правая рука обычно играет ноты верхнего нотоносца (скрипичный ключ), а левая — нижнего (басовый ключ). Две точки басового ключа окружают 4-ю линию — ориентир F (F3). Нажмите клавишу F3 на клавиатуре.';
    }
    if (stepDesc.kind === 'grandOrientation') {
      return 'Большая система объединяет скрипичный и басовый станы. Нота До первой октавы (Middle C / C4) служит мостом между ними: она пишется на первой добавочной снизу от скрипичного стана и сверху от басового. Нажмите C4.';
    }
    if (stepDesc.kind === 'complete') {
      return 'Вы успешно освоили чтение нот в басовом ключе (C3–B3) и переключение между ключами в большой системе. Теперь эти ноты и упражнения переноса включены в вашу ежедневную практику.';
    }
    if (stepDesc.kind === 'grandTransfer') {
      return `Определите, на каком стане находится нота: верхний — скрипичный ключ (1-я октава: C4–B4), нижний — басовый ключ (малая октава: C3–B3). Нажмите точную клавишу. Для завершения нужны минимум ${GRAND_STAFF_TRANSFER_TRIALS} заданий и точность первых ответов не ниже 80%; если порог не достигнут, задания продолжатся.`;
    }
    if (stepDesc.kind === 'bassFinalMix') {
      return 'Определите ноту на басовом нотоносце и нажмите точную клавишу в малой октаве (C3–B3).';
    }

    const note = stepDesc.focusBassNote || 'F';
    const targetKeyId = `${note}3`;
    switch (stepDesc.subStage) {
      case 'model':
        return `${stepDesc.hintText || ''} Нажмите подсвеченную клавишу ${DISPLAY_NAMES[note]} (${targetKeyId}) на пианино.`;
      case 'qualify':
        return `Определите ноту на басовом стане и нажмите точную клавишу в малой октаве (${note}3) без подсветки.`;
      case 'localMix':
        return `Различайте ${DISPLAY_NAMES[note]} (${note}3) и другие уже освоенные басовые ноты.`;
      case 'delayedCheck':
      default:
        return state.isInterveningRecall
          ? `Сначала найдите опорную ноту на пианино, затем повторим проверку ноты ${DISPLAY_NAMES[note]} по памяти.`
          : `Финальная проверка без подсказок: нажмите точную клавишу для ноты на басовом стане.`;
    }
  });
</script>

<div class="task-stage-card curriculum-active-task-stage advanced-notation-stage" aria-label="Модуль басового ключа">
  <div class="task-stage-eyebrow first-run-eyebrow">
    <span class="first-run-phase-badge">{eyebrowText}</span>
  </div>

  <div class="task-stage-content-wrap">
    <div class="task-stage-instruction first-run-instruction">
      <h3 class="task-stage-title first-run-task-title">{stepDesc.title}</h3>
      <p class="first-run-task-desc">
        {@html bodyInstruction}
      </p>
    </div>

    <div class="first-run-interactive-zone">
      {#if stepDesc.kind === 'orientation'}
        <div class="curriculum-3d-staff-slot" style="width: 100%; max-width: 520px; margin: 0 auto;">
          <Staff keyId="F3" clef="bass" mode="single" />
        </div>
      {:else if stepDesc.kind === 'grandOrientation'}
        <div class="curriculum-3d-staff-slot" style="width: 100%; max-width: 520px; margin: 0 auto;">
          <Staff keyId="C4" clef="grand" mode="single" />
        </div>
      {:else if stepDesc.kind === 'grandTransfer'}
        <div class="curriculum-3d-staff-slot" style="width: 100%; max-width: 520px; margin: 0 auto;">
          <Staff keyId={state.targetKeyId || 'F3'} clef="grand" mode="single" />
        </div>
        <div class="first-run-progress-pills" style="margin-top: 10px; justify-content: center; gap: 8px;">
          <span class="first-run-status-chip">
            Задание {state.grandTransferTrialsCompleted + 1} · минимум {GRAND_STAFF_TRANSFER_TRIALS}
          </span>
          <span class="first-run-status-chip">
            Первые ответы: {state.grandTransferTrialsCompleted > 0 ? Math.round((state.grandTransferCorrectFirstAttempts / state.grandTransferTrialsCompleted) * 100) : 100}%
          </span>
        </div>
      {:else if stepDesc.kind === 'complete'}
        <div class="graduation-checklist-card" aria-label="Освоенные навыки басового модуля">
          <div class="graduation-subtitle">В этом модуле вы освоили:</div>
          <ul class="graduation-items">
            <li><span class="check">✓</span><span class="graduation-item-copy">Чтение басового ключа (ноты F3, C3, E3, G3, D3, A3, B3)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy">Ориентир ключа F (4-я линия) и второго пространства (нота C)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy">Связь двух станов через Middle C (C4)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy">Переключение между скрипичным и басовым станами в большой системе</span></li>
          </ul>
        </div>
      {:else}
        <!-- Single note bass staff -->
        <div class="curriculum-3d-staff-slot" style="width: 100%; max-width: 520px; margin: 0 auto;">
          <Staff keyId={state.targetKeyId || 'F3'} clef="bass" mode="single" />
        </div>

        <div class="first-run-progress-pills" style="margin-top: 12px;" aria-label="Прогресс басовых нот">
          {#each BASS_NOTE_ACQUISITION_ORDER as n (n)}
            {@const rec = state.progress[getBassNoteCurriculumItemId(n)]}
            {@const isDone = rec?.state === 'retention' && !rec?.contexts.includes('pending:delayedRetry')}
            {@const isActive = stepDesc.focusBassNote === n}
            <span class="first-run-pill {isDone ? 'done' : isActive ? 'active' : ''}">
              {n}3 {isDone ? '✓' : ''}
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="feedback-wrap no-reaction-panel first-run-feedback-bar">
      <div class="feedback {state.feedbackTone || ''} first-run-feedback-text">
        {state.feedbackText || ''}
      </div>
      <div class="feedback-actions">
        {#if showDontKnow}
          <button
            type="button"
            class="btn outline first-run-dont-know-btn"
            data-action="bass-dont-know"
            onclick={() => onDontKnow?.()}
          >
            Не знаю
          </button>
        {/if}
        {#if stepDesc.kind === 'orientation' || stepDesc.kind === 'grandOrientation'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="bass-orientation-continue"
            onclick={() => onAdvanceStage?.()}
          >
            Продолжить →
          </button>
        {:else if stepDesc.kind === 'complete'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="bass-complete-return"
            onclick={() => onCompleteModule?.()}
          >
            Вернуться к ежедневной тренировке ✓
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
