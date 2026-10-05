<script lang="ts">
  import {
    INTERVAL_DEFINITIONS,
    describeIntervalStep,
    canUseDontKnowInIntervalStep,
    INTERVAL_TRANSFER_MIN_TRIALS,
    type IntervalCurriculumState,
    type IntervalId
  } from '../../core/learning';

  let {
    state,
    onDontKnow,
    onAdvanceStage,
    onSelectAnswer,
    onCompleteModule
  }: {
    state: IntervalCurriculumState;
    onDontKnow?: () => void;
    onAdvanceStage?: () => void;
    onSelectAnswer?: (intervalId: IntervalId) => void;
    onCompleteModule?: () => void;
  } = $props();

  const stepDesc = $derived(describeIntervalStep(state.step, state));
  const showDontKnow = $derived(canUseDontKnowInIntervalStep(state));

  function buildInputInstruction(rootKeyId: string, intervalId: IntervalId): string {
    const def = INTERVAL_DEFINITIONS[intervalId];
    const semitoneLabel = def.semitones === 4 ? 'полутона' : 'полутонов';
    return `<strong>${def.nameRu} (${def.code}) · ${def.semitones} ${semitoneLabel}</strong><br><br>Опорная нота <strong>${rootKeyId}</strong> уже задана.<br>Найдите вторую ноту интервала: нажмите <strong>ОДНУ</strong> клавишу на ${def.semitones} ${semitoneLabel} выше.<br><strong class="interval-build-notation">${rootKeyId} → ?</strong>`;
  }

  const ANSWER_OPTIONS: { id: IntervalId; label: string; numberKey: string }[] = [
    { id: 'P8', label: 'Октава (P8 · 12 полутонов)', numberKey: '1' },
    { id: 'P5', label: 'Чистая квинта (P5 · 7 полутонов)', numberKey: '2' },
    { id: 'M3', label: 'Большая терция (M3 · 4 полутона)', numberKey: '3' },
    { id: 'm3', label: 'Малая терция (m3 · 3 полутона)', numberKey: '4' }
  ];

  const eyebrowText = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИНТЕРВАЛЫ · ВВЕДЕНИЕ';
    }
    if (stepDesc.kind === 'contrast') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИНТЕРВАЛЫ · СРАВНЕНИЕ M3 ↔ m3';
    }
    if (stepDesc.kind === 'transfer') {
      return `ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИНТЕРВАЛЫ · ПЕРЕНОС (${state.transferTrialsCompleted + 1}/${INTERVAL_TRANSFER_MIN_TRIALS})`;
    }
    if (stepDesc.kind === 'complete') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ИНТЕРВАЛЫ · ЗАВЕРШЕНО';
    }

    const intervalName = stepDesc.focusInterval
      ? INTERVAL_DEFINITIONS[stepDesc.focusInterval].nameRu
      : 'Интервал';

    if (stepDesc.kind === 'build') {
      switch (stepDesc.subStage) {
        case 'model':
          return `ПОСТРОЕНИЕ · ${intervalName.toUpperCase()} · ПОКАЗ`;
        case 'guided':
          return `ПОСТРОЕНИЕ · ${intervalName.toUpperCase()} · С ПОДСКАЗКОЙ`;
        case 'qualify':
          return `ПОСТРОЕНИЕ · ${intervalName.toUpperCase()} · САМОСТОЯТЕЛЬНО`;
        case 'localMix':
          return `ПОСТРОЕНИЕ · ${intervalName.toUpperCase()} · ПРАКТИКА`;
        case 'delayedCheck':
        default:
          return `ПОСТРОЕНИЕ · ${intervalName.toUpperCase()} · ПРОВЕРКА ПО ПАМЯТИ`;
      }
    }

    // Identify
    switch (stepDesc.subStage) {
      case 'model':
        return `РАСПОЗНАВАНИЕ · ${intervalName.toUpperCase()} · ПОКАЗ`;
      case 'qualify':
        return `РАСПОЗНАВАНИЕ · ${intervalName.toUpperCase()} · САМОСТОЯТЕЛЬНО`;
      case 'delayedCheck':
      default:
        return `РАСПОЗНАВАНИЕ · ${intervalName.toUpperCase()} · ПРОВЕРКА ПО ПАМЯТИ`;
    }
  });

  const bodyInstruction = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'Интервал — это расстояние между двумя нотами. На клавиатуре минимальный шаг между соседними клавишами называется <strong>полутоном</strong> (например, C4 → C#4). Два полутона составляют <strong>целый тон</strong> (C4 → D4).';
    }
    if (stepDesc.kind === 'contrast') {
      return 'Разница между большой и малой терцией — всего <strong>одна клавиша (один полутон)</strong>:<br>• Большая терция (M3): <strong>4 полутона</strong> (C4 → E4). Звучит светло и мажорно.<br>• Малая терция (m3): <strong>3 полутона</strong> (C4 → D#4/Eb4). Звучит задумчиво и минорно.';
    }
    if (stepDesc.kind === 'transfer') {
      if (state.activeSkill === 'intervalBuild') {
        return `${buildInputInstruction(state.rootKeyId || 'C4', state.focusInterval || 'P8')}<br>Ответьте на экранном пианино или через MIDI.`;
      } else {
        return 'Определите интервал между двумя подсвеченными клавишами. Нажмите кнопку ответа или используйте цифровые клавиши <strong>1–4</strong>.';
      }
    }
    if (stepDesc.kind === 'complete') {
      return 'Вы успешно освоили четыре фундаментальных интервала: октаву, чистую квинту, большую и малую терцию. Теперь аккорды будут восприниматься не как случайные клавиши, а как понятная структура 1–3–5.';
    }

    const def = INTERVAL_DEFINITIONS[stepDesc.focusInterval || 'P8'];

    if (stepDesc.kind === 'build') {
      switch (stepDesc.subStage) {
        case 'model':
          return `${buildInputInstruction(state.rootKeyId || 'C4', stepDesc.focusInterval || 'P8')}<br>Обе клавиши подсвечены: нажмите одну целевую клавишу ${state.targetKeyId} или «Продолжить».`;
        case 'guided':
          return buildInputInstruction(state.rootKeyId || 'C4', stepDesc.focusInterval || 'P8');
        case 'qualify':
          return buildInputInstruction(state.rootKeyId || 'C4', stepDesc.focusInterval || 'P8');
        case 'localMix':
          return buildInputInstruction(state.rootKeyId || 'C4', stepDesc.focusInterval || 'P8');
        case 'delayedCheck':
        default:
          return buildInputInstruction(state.rootKeyId || 'C4', stepDesc.focusInterval || 'P8');
      }
    }

    // Identify
    switch (stepDesc.subStage) {
      case 'model':
        return `Две подсвеченные клавиши (${state.rootKeyId} и ${state.targetKeyId}) образуют интервал <strong>${def.nameRu}</strong> (${def.semitones} полутонов). Запомните их расстояние и визуальную форму.`;
      case 'qualify':
      case 'delayedCheck':
      default:
        return 'Определите интервал между двумя подсвеченными клавишами на клавиатуре. Выберите ответ кнопкой или цифрами <strong>1–4</strong>.';
    }
  });
</script>

<div
  class="task-stage-card curriculum-active-task-stage interval-stage"
  aria-label="Модуль интервалов"
  data-testid="interval-stage"
  data-interval-step={state.step}
  data-interval-skill={state.activeSkill}
>
  <div class="task-stage-eyebrow first-run-eyebrow">
    <span class="first-run-phase-badge">{eyebrowText}</span>
  </div>

  <div class="task-stage-content-wrap">
    <div class="task-stage-instruction first-run-instruction">
      <h3 class="task-stage-title first-run-task-title">{stepDesc.title}</h3>
      <p class="first-run-task-desc">
        {@html bodyInstruction}
      </p>
      {#if state.activeSkill === 'intervalBuild' && (stepDesc.kind === 'build' || stepDesc.kind === 'transfer')}
        <div class="interval-input-hint" data-testid="interval-input-hint">
          Нажмите только верхнюю ноту интервала. Опору повторно нажимать или удерживать обе ноты одновременно не нужно.
        </div>
      {/if}
    </div>

    <div class="first-run-interactive-zone">
      {#if stepDesc.kind === 'orientation'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin: 12px 0;">
          <div class="interval-badge-card" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 12px 18px; text-align: center;">
            <div style="font-size: 0.85rem; color: var(--text-muted, #94a3b8);">1 полутон</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #38bdf8;">C4 → C#4</div>
            <div style="font-size: 0.8rem; margin-top: 4px;">соседняя клавиша</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 12px 18px; text-align: center;">
            <div style="font-size: 0.85rem; color: var(--text-muted, #94a3b8);">2 полутона (целый тон)</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #a78bfa;">C4 → D4</div>
            <div style="font-size: 0.8rem; margin-top: 4px;">шаг через одну клавишу</div>
          </div>
        </div>
      {:else if stepDesc.kind === 'contrast'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin: 12px 0;">
          <div class="interval-badge-card" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 14px 20px; text-align: center;">
            <div style="font-size: 0.85rem; color: #7dd3fc; font-weight: 600;">БОЛЬШАЯ ТЕРЦИЯ (M3)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">4 полутона</div>
            <div style="font-size: 0.9rem; color: #bae6fd;">C4 → E4 (светлое звучание)</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 14px 20px; text-align: center;">
            <div style="font-size: 0.85rem; color: #fde047; font-weight: 600;">МАЛАЯ ТЕРЦИЯ (m3)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">3 полутона</div>
            <div style="font-size: 0.9rem; color: #fef08a;">C4 → D#4/Eb4 (минорный оттенок)</div>
          </div>
        </div>
      {:else if state.activeSkill === 'intervalIdentify'}
        <!-- Answer options for interval identify -->
        <div class="interval-answer-buttons" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; max-width: 580px; margin: 14px auto 6px auto;">
          {#each ANSWER_OPTIONS as opt (opt.id)}
            <button
              type="button"
              class="btn outline interval-answer-btn"
              data-interval-id={opt.id}
              onclick={() => onSelectAnswer?.(opt.id)}
              style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; text-align: left; font-size: 0.95rem;"
            >
              <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;">
                {opt.numberKey}
              </span>
              <span>{opt.label}</span>
            </button>
          {/each}
        </div>
      {:else if stepDesc.kind === 'complete'}
        <div class="graduation-checklist-card" aria-label="Освоенные интервалы">
          <div class="graduation-subtitle">В этом модуле вы освоили:</div>
          <ul class="graduation-items">
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Октава (P8 · 12 полутонов)</strong> — то же имя ноты октавой выше</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Чистая квинта (P5 · 7 полутонов)</strong> — устойчивый остов аккорда</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Большая терция (M3 · 4 полутона)</strong> — светлая мажорная окраска</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Малая терция (m3 · 3 полутона)</strong> — мягкая минорная окраска</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Контраст M3 ↔ m3</strong> — разница в один полутон (одну клавишу)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy">Навыки <strong>построения</strong> и <strong>распознавания</strong> на белых и чёрных клавишах</span></li>
          </ul>
        </div>
      {/if}

      {#if stepDesc.kind === 'transfer'}
        <div class="first-run-progress-pills" style="margin-top: 10px; justify-content: center; gap: 8px;">
          <span class="first-run-status-chip">
            Задание {state.transferTrialsCompleted + 1} из {INTERVAL_TRANSFER_MIN_TRIALS}
          </span>
          <span class="first-run-status-chip">
            Точность: {state.transferTrialsCompleted > 0 ? Math.round((state.transferCorrectFirstAttempts / state.transferTrialsCompleted) * 100) : 100}%
          </span>
          <span class="first-run-status-chip" style="color: var(--accent-light, #38bdf8);">
            {state.activeSkill === 'intervalBuild' ? 'Построение' : 'Распознавание'}
          </span>
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
            data-action="interval-dont-know"
            onclick={() => onDontKnow?.()}
          >
            Не знаю
          </button>
        {/if}
        {#if stepDesc.kind === 'orientation' || stepDesc.kind === 'contrast' || stepDesc.subStage === 'model'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="interval-advance"
            onclick={() => onAdvanceStage?.()}
          >
            Продолжить →
          </button>
        {:else if stepDesc.kind === 'complete'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="interval-complete-return"
            onclick={() => onCompleteModule?.()}
          >
            Вернуться к ежедневной тренировке ✓
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
