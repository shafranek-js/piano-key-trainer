<script lang="ts">
  import {
    TRIAD_DEFINITIONS,
    describeTriadStep,
    canUseDontKnowInTriadStep,
    TRIAD_TRANSFER_MIN_TRIALS,
    type TriadCurriculumState,
    type TriadQuality
  } from '../../core/learning';

  let {
    state,
    midiActiveKeyIds = [] as string[],
    onDontKnow,
    onAdvanceStage,
    onSelectAnswer,
    onSubmitChord,
    onCompleteModule
  }: {
    state: TriadCurriculumState;
    midiActiveKeyIds?: string[];
    onDontKnow?: () => void;
    onAdvanceStage?: () => void;
    onSelectAnswer?: (quality: TriadQuality) => void;
    onSubmitChord?: () => void;
    onCompleteModule?: () => void;
  } = $props();

  const stepDesc = $derived(describeTriadStep(state.step, state));
  const showDontKnow = $derived(canUseDontKnowInTriadStep(state));
  const isGuidedBuild = $derived(state.activeSkill === 'triadBuild' && state.step.endsWith('Guided'));
  const guidedMidiNoteCount = $derived(
    Math.min(2, new Set(midiActiveKeyIds.filter(keyId => !state.structuralGuideKeyIds.includes(keyId))).size)
  );

  const QUALITY_OPTIONS: { id: TriadQuality; label: string; numberKey: string }[] = [
    { id: 'major', label: 'Мажорное', numberKey: '1' },
    { id: 'minor', label: 'Минорное', numberKey: '2' }
  ];

  const eyebrowText = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ТРЕЗВУЧИЯ · ВВЕДЕНИЕ';
    }
    if (stepDesc.kind === 'contrast') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ТРЕЗВУЧИЯ · СРАВНЕНИЕ МАЖОР ↔ МИНОР';
    }
    if (stepDesc.kind === 'transfer') {
      return `ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ТРЕЗВУЧИЯ · ПЕРЕНОС (${state.transferTrialsCompleted + 1}/${TRIAD_TRANSFER_MIN_TRIALS})`;
    }
    if (stepDesc.kind === 'complete') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ТРЕЗВУЧИЯ · ЗАВЕРШЕНО';
    }

    const qualityName = stepDesc.quality === 'minor' ? 'МИНОР' : 'МАЖОР';

    if (stepDesc.kind === 'build') {
      switch (stepDesc.subStage) {
        case 'model':
          return `ПОСТРОЕНИЕ · ${qualityName} · ПОКАЗ`;
        case 'guided':
          return `ПОСТРОЕНИЕ · ${qualityName} · С ПОДСКАЗКОЙ`;
        case 'qualify':
          return `ПОСТРОЕНИЕ · ${qualityName} · САМОСТОЯТЕЛЬНО`;
        case 'localMix':
          return `ПОСТРОЕНИЕ · ${qualityName} · ПРАКТИКА`;
        case 'delayedCheck':
        default:
          return `ПОСТРОЕНИЕ · ${qualityName} · ПРОВЕРКА ПО ПАМЯТИ`;
      }
    }

    // Identify
    switch (stepDesc.subStage) {
      case 'model':
        return `РАСПОЗНАВАНИЕ · ${qualityName} · ПОКАЗ`;
      case 'qualify':
        return `РАСПОЗНАВАНИЕ · ${qualityName} · САМОСТОЯТЕЛЬНО`;
      case 'delayedCheck':
      default:
        return `РАСПОЗНАВАНИЕ · ${qualityName} · ПРОВЕРКА ПО ПАМЯТИ`;
    }
  });

  const bodyInstruction = $derived.by(() => {
    if (stepDesc.kind === 'orientation') {
      return 'Трезвучие — это базовый аккорд из трёх звуков: <strong>основного тона (1)</strong>, <strong>терции (3)</strong> и <strong>квинты (5)</strong>. На клавиатуре они берутся через клавишу в основном положении.';
    }
    if (stepDesc.kind === 'contrast') {
      return 'Между мажором и минором меняется только <strong>терцовый тон — всего на один полутон</strong>:<br>• Мажор: <strong>C4 – E4 – G4</strong> (большая терция + квинта, светлое звучание)<br>• Минор: <strong>C4 – Eb4 – G4</strong> (малая терция + квинта, задумчивое звучание). Квинта C–G остаётся неизменной!';
    }
    if (stepDesc.kind === 'transfer') {
      if (state.activeSkill === 'triadBuild') {
        const qualityName = state.quality === 'minor' ? 'минорное' : 'мажорное';
        return `Сыграйте <strong>${qualityName} трезвучие</strong> целиком: <strong>${state.targetTriadKeyIds.join(' + ')}</strong>. Выберите все 3 клавиши на экранном пианино или сыграйте их одновременно на MIDI-клавиатуре.`;
      } else {
        return 'Определите окраску подсвеченного трезвучия: <strong>Мажор</strong> или <strong>Минор</strong>. Нажмите кнопку или цифры <strong>1–2</strong>.';
      }
    }
    if (stepDesc.kind === 'complete') {
      return 'Поздравляем! Вы освоили мажорные и минорные трезвучия в основном положении. Теперь аккорды воспринимаются как осмысленная структура 1–3–5, готовая к гармонической практике.';
    }

    const def = TRIAD_DEFINITIONS[stepDesc.quality || 'major'];

    if (stepDesc.kind === 'build') {
      switch (stepDesc.subStage) {
        case 'model':
          return `<strong>${def.nameRu} от ${state.rootKeyId}</strong> состоит из основного тона, ${stepDesc.quality === 'minor' ? 'малой терции' : 'большой терции'} (+${def.rootToThird} полутона) и чистой квинты (+${def.rootToFifth} полутонов). На клавиатуре подсвечены все три клавиши: сыграйте их или нажмите «Продолжить».`;
        case 'guided':
          return `<strong>${def.nameRu} от ${state.rootKeyId}</strong><br><br>${state.rootKeyId} уже дана как опорная нота.<br>Добавьте ещё две ноты: терцию (+${def.rootToThird} полутона) и квинту (+${def.rootToFifth} полутонов).<br><strong class="triad-build-notation">${state.rootKeyId} + ? + ?</strong><br>На MIDI сыграйте две недостающие ноты одновременно.`;
        case 'qualify':
          return `Постройте <strong>${def.nameRu}</strong> целиком: <strong>${state.targetTriadKeyIds.join(' + ')}</strong>. Выберите все 3 клавиши и нажмите «Проверить аккорд» или сыграйте их одновременно на MIDI.`;
        case 'localMix':
          return `Постройте <strong>${def.nameRu}</strong> целиком: <strong>${state.targetTriadKeyIds.join(' + ')}</strong>. Выберите все 3 клавиши или сыграйте их одновременно на MIDI. Закрепляем форму на разных клавишах.`;
        case 'delayedCheck':
        default:
          return `Финальная проверка: сыграйте <strong>${def.nameRu}</strong> целиком по памяти: <strong>${state.targetTriadKeyIds.join(' + ')}</strong>. Нужны все 3 клавиши одновременно.`;
      }
    }

    // Identify
    switch (stepDesc.subStage) {
      case 'model':
        return `Перед вами <strong>${def.nameRu}</strong>. Обратите внимание на расстояние между нижними клавишами и послушайте характерное звучание.`;
      case 'qualify':
      case 'delayedCheck':
      default:
      return 'Посмотрите на три подсвеченные ноты и определите тип трезвучия. Выберите ответ: <strong>Мажорное</strong> или <strong>Минорное</strong>. Используйте кнопку или клавишу <strong>1 / 2</strong>.';
    }
  });
</script>

<div
  class="task-stage-card curriculum-active-task-stage interval-stage triad-stage"
  aria-label="Модуль трезвучий"
  data-testid="triad-stage"
  data-triad-step={state.step}
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
    </div>

    <div class="first-run-interactive-zone">
      {#if stepDesc.kind === 'orientation'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin: 12px 0;">
          <div class="interval-badge-card" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 12px 18px; text-align: center;">
            <div style="font-size: 0.85rem; color: #7dd3fc; font-weight: 600;">МАЖОРНОЕ ТРЕЗВУЧИЕ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">Root + M3 (4) + P5 (7)</div>
            <div style="font-size: 0.85rem; color: #bae6fd;">Светлый, устойчивый характер</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 12px 18px; text-align: center;">
            <div style="font-size: 0.85rem; color: #fde047; font-weight: 600;">МИНОРНОЕ ТРЕЗВУЧИЕ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">Root + m3 (3) + P5 (7)</div>
            <div style="font-size: 0.85rem; color: #fef08a;">Мягкий, задумчивый характер</div>
          </div>
        </div>
      {:else if stepDesc.kind === 'contrast'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin: 12px 0;">
          <div class="interval-badge-card" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 14px 20px; text-align: center;">
            <div style="font-size: 0.85rem; color: #7dd3fc; font-weight: 600;">C MAJOR (ДО МАЖОР)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">C – E – G</div>
            <div style="font-size: 0.9rem; color: #bae6fd;">Большая терция: C → E (4 пт)</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 14px 20px; text-align: center;">
            <div style="font-size: 0.85rem; color: #fde047; font-weight: 600;">C MINOR (ДО МИНОР)</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">C – E♭ – G</div>
            <div style="font-size: 0.9rem; color: #fef08a;">Малая терция: C → E♭ (3 пт)</div>
          </div>
        </div>
      {:else if state.activeSkill === 'triadIdentify'}
        <!-- Answer options for triad identify -->
        <div class="triad-answer-buttons" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; max-width: 580px; margin: 14px auto 6px auto;">
          {#each QUALITY_OPTIONS as opt (opt.id)}
            <button
              type="button"
              class="btn outline triad-answer-btn"
              data-quality-id={opt.id}
              onclick={() => onSelectAnswer?.(opt.id)}
              style="display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 12px 16px; text-align: left; font-size: 1rem;"
            >
              <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.9rem;">
                {opt.numberKey}
              </span>
              <span>{opt.label}</span>
            </button>
          {/each}
        </div>
      {:else if state.activeSkill === 'triadBuild' && stepDesc.kind !== 'complete'}
        <!-- Selection counter & explicit check chord button -->
        <div class="triad-selection-bar" style="max-width: 480px; margin: 10px auto 4px auto;">
          <div class="triad-selection-count">
            {isGuidedBuild ? 'Добавлено нот' : 'Выбрано клавиш'}: <strong data-testid="triad-selection-count">{state.selectedKeyIds.length}</strong> из <strong>{isGuidedBuild ? 2 : 3}</strong>
            {#if state.selectedKeyIds.length > 0}
              <span style="margin-left: 8px; font-size: 0.85rem; color: #94a3b8;">({state.selectedKeyIds.join(', ')})</span>
            {/if}
          </div>
          {#if isGuidedBuild && guidedMidiNoteCount > 0 && guidedMidiNoteCount < 2}
            <div class="triad-midi-input-progress" data-testid="triad-midi-progress" aria-live="polite">
              Сыграно нот: {guidedMidiNoteCount} из 2
            </div>
          {/if}
          <button
            type="button"
            class="triad-check-btn"
            data-action="triad-submit-chord"
            disabled={state.selectedKeyIds.length !== (isGuidedBuild ? 2 : 3)}
            onclick={() => onSubmitChord?.()}
          >
            Проверить аккорд
          </button>
        </div>
      {:else if stepDesc.kind === 'complete'}
        <div class="graduation-checklist-card" aria-label="Освоенные трезвучия">
          <div class="graduation-subtitle">В этом модуле вы освоили:</div>
          <ul class="graduation-items">
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Мажорное трезвучие</strong> — формула root + M3 (4 полутона) + P5 (7 полутонов)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Минорное трезвучие</strong> — формула root + m3 (3 полутона) + P5 (7 полутонов)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Контраст мажор ↔ минор</strong> — сдвиг только терцового тона на 1 полутон</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Построение аккордов</strong> в основном положении на экране и по MIDI</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Распознавание окраски</strong> аккорда на белых и хроматических основных тонах</span></li>
          </ul>
        </div>
      {/if}

      {#if stepDesc.kind === 'transfer'}
        <div class="first-run-progress-pills" style="margin-top: 10px; justify-content: center; gap: 8px;">
          <span class="first-run-status-chip">
            Задание {state.transferTrialsCompleted + 1} из {TRIAD_TRANSFER_MIN_TRIALS}
          </span>
          <span class="first-run-status-chip">
            Точность: {state.transferTrialsCompleted > 0 ? Math.round((state.transferCorrectFirstAttempts / state.transferTrialsCompleted) * 100) : 100}%
          </span>
          <span class="first-run-status-chip" style="color: var(--accent-light, #38bdf8);">
            {state.activeSkill === 'triadBuild' ? 'Построение' : 'Распознавание'}
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
            data-action="triad-dont-know"
            onclick={() => onDontKnow?.()}
          >
            Не знаю
          </button>
        {/if}
        {#if stepDesc.kind === 'orientation' || stepDesc.kind === 'contrast' || stepDesc.subStage === 'model'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="triad-advance"
            onclick={() => onAdvanceStage?.()}
          >
            Продолжить →
          </button>
        {:else if stepDesc.kind === 'complete'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="triad-complete-return"
            onclick={() => onCompleteModule?.()}
          >
            Вернуться к ежедневной тренировке ✓
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
