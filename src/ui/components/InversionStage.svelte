<script lang="ts">
  import {
    CANONICAL_HARMONY_SEQUENCE,
    buildInversionTransferTrial,
    canUseDontKnowInInversionStep,
    canInputInversionChord,
    canSelectInversionAnswer,
    type InversionCurriculumState,
    type TriadInversion
  } from '../../core/learning/chordInversions';

  let {
    state,
    onDontKnow,
    onAdvanceStage,
    onSelectInversion,
    onSubmitChord,
    onPlayVoicingAudio,
    onCompleteModule,
    midiHeldKeyIds = []
  }: {
    state: InversionCurriculumState;
    onDontKnow?: () => void;
    onAdvanceStage?: () => void;
    onSelectInversion?: (inversion: TriadInversion) => void;
    onSubmitChord?: () => void;
    onPlayVoicingAudio?: (keyIds: readonly string[]) => void;
    onCompleteModule?: () => void;
    midiHeldKeyIds?: readonly string[];
  } = $props();

  const INVERSION_OPTIONS: { id: TriadInversion; label: string; numberKey: string }[] = [
    { id: 'root', label: 'Основное (1 – 3 – 5, бас 1)', numberKey: '1' },
    { id: 'first', label: '1-е обращение (3 – 5 – 1, бас 3)', numberKey: '2' },
    { id: 'second', label: '2-е обращение (5 – 1 – 3, бас 5)', numberKey: '3' }
  ];

  const showDontKnow = $derived(
    (state.step.endsWith('DelayedCheck') || state.step.endsWith('Qualify') || state.step === 'inversionTransfer') &&
    canUseDontKnowInInversionStep(state)
  );
  const showChordInput = $derived(canInputInversionChord(state));
  const showIdentifyAnswers = $derived(canSelectInversionAnswer(state));
  const showMidiChordProgress = $derived(showChordInput);

  const eyebrowText = $derived.by(() => {
    if (state.step === 'inversionOrientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ОБРАЩЕНИЯ · ВВЕДЕНИЕ';
    }
    if (state.step === 'inversionContrast') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ОБРАЩЕНИЯ · СРАВНЕНИЕ (ОСНОВНОЕ ↔ 1-Е ↔ 2-Е)';
    }
    if (state.step === 'chordSymbolOrientation') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · АККОРДОВЫЕ ОБОЗНАЧЕНИЯ · ВВЕДЕНИЕ';
    }
    if (state.step === 'harmonySequence') {
      return `ГАРМОНИЯ · ПОСЛЕДОВАТЕЛЬНОСТЬ (${state.harmonyStepIndex + 1}/4)`;
    }
    if (state.step === 'inversionTransfer') {
      return state.transferBlockKind === 'initial'
        ? 'ПЕРЕНОС · ПРОВЕРКА НАВЫКА'
        : `ПЕРЕНОС · ПОВТОРНАЯ ПРОВЕРКА (${state.transferBlockNumber - 1}-я попытка)`;
    }
    if (state.step === 'inversionTransferRemediation') {
      return `ПЕРЕНОС · ЗАКРЕПЛЕНИЕ СЛАБЫХ МЕСТ (${state.transferRemediationIndex + 1}/${state.transferRemediationTrialIndexes.length})`;
    }
    if (state.step === 'inversionTransferResult') {
      return 'ПЕРЕНОС · ИТОГ ПРОВЕРКИ';
    }
    if (state.step === 'moduleComplete') {
      return 'ДОПОЛНИТЕЛЬНЫЙ МОДУЛЬ · ОБРАЩЕНИЯ И ГАРМОНИЯ · ЗАВЕРШЕНО';
    }

    if (state.step.startsWith('firstInversion')) {
      const sub = state.step.replace('firstInversion', '');
      const subMap: Record<string, string> = {
        Model: 'ПОКАЗ',
        Guided: 'С ПОДСКАЗКОЙ',
        Qualify: 'САМОСТОЯТЕЛЬНО',
        LocalMix: 'ПРАКТИКА',
        DelayedCheck: 'ПРОВЕРКА ПО ПАМЯТИ'
      };
      return `ПОСТРОЕНИЕ · 1-Е ОБРАЩЕНИЕ · ${subMap[sub] || 'ПРАКТИКА'}`;
    }

    if (state.step.startsWith('secondInversion')) {
      const sub = state.step.replace('secondInversion', '');
      const subMap: Record<string, string> = {
        Model: 'ПОКАЗ',
        Guided: 'С ПОДСКАЗКОЙ',
        Qualify: 'САМОСТОЯТЕЛЬНО',
        LocalMix: 'ПРАКТИКА',
        DelayedCheck: 'ПРОВЕРКА ПО ПАМЯТИ'
      };
      return `ПОСТРОЕНИЕ · 2-Е ОБРАЩЕНИЕ · ${subMap[sub] || 'ПРАКТИКА'}`;
    }

    if (state.step.startsWith('inversionIdentify')) {
      const sub = state.step.replace('inversionIdentify', '');
      const subMap: Record<string, string> = {
        Model: 'ПОКАЗ',
        Qualify: 'САМОСТОЯТЕЛЬНО',
        DelayedCheck: 'ПРОВЕРКА ПО ПАМЯТИ'
      };
      return `РАСПОЗНАВАНИЕ · ОБРАЩЕНИЯ · ${subMap[sub] || 'ПРАКТИКА'}`;
    }

    if (state.step.startsWith('slashChord')) {
      const sub = state.step.replace('slashChord', '');
      const subMap: Record<string, string> = {
        Model: 'ПОКАЗ',
        Guided: 'С ПОДСКАЗКОЙ',
        Qualify: 'САМОСТОЯТЕЛЬНО',
        DelayedCheck: 'ПРОВЕРКА ПО ПАМЯТИ'
      };
      return `ПОСТРОЕНИЕ · SLASH-АККОРДЫ · ${subMap[sub] || 'ПРАКТИКА'}`;
    }

    return 'ОБРАЩЕНИЯ АККОРДОВ И ГАРМОНИЯ';
  });

  const stepTitle = $derived.by(() => {
    if (state.step === 'inversionOrientation') return 'Что такое обращения аккорда?';
    if (state.step === 'firstInversionModel') return 'Первое обращение: терция в басу (3 – 5 – 1)';
    if (state.step === 'firstInversionGuided') return 'Постройте 1-е обращение с подсказкой баса';
    if (state.step === 'firstInversionQualify') return 'Постройте 1-е обращение самостоятельно';
    if (state.step === 'firstInversionLocalMix') return `1-е обращение от ${state.rootKeyId}`;
    if (state.step === 'firstInversionDelayedCheck') return 'Проверка по памяти: 1-е обращение';
    if (state.step === 'secondInversionModel') return 'Второе обращение: квинта в басу (5 – 1 – 3)';
    if (state.step === 'secondInversionGuided') return 'Постройте 2-е обращение с подсказкой баса';
    if (state.step === 'secondInversionQualify') return 'Постройте 2-е обращение самостоятельно';
    if (state.step === 'secondInversionLocalMix') return `2-е обращение от ${state.rootKeyId}`;
    if (state.step === 'secondInversionDelayedCheck') return 'Проверка по памяти: 2-е обращение';
    if (state.step === 'inversionContrast') return 'Три положения одного аккорда';
    if (state.step === 'inversionIdentifyModel') return 'Как определять положение аккорда?';
    if (state.step === 'inversionIdentifyQualify') return 'Определите положение аккорда';
    if (state.step === 'inversionIdentifyDelayedCheck') return 'Проверка по памяти: определение обращения';
    if (state.step === 'chordSymbolOrientation') return 'Аккордовые обозначения и знак дроби (/)';
    if (state.step === 'slashChordModel') return 'Slash-аккорд: G/B';
    if (state.step === 'slashChordGuided') return 'Постройте G/B с подсказкой';
    if (state.step === 'slashChordQualify') return 'Постройте C/E самостоятельно';
    if (state.step === 'slashChordDelayedCheck') return 'Проверка по памяти: Am/C';
    if (state.step === 'harmonySequence') return 'Гармоническая цепочка: C → G/B → Am → F';
    if (state.step === 'inversionTransfer') return state.transferBlockKind === 'initial' ? 'Проверка навыка' : 'Повторная проверка';
    if (state.step === 'inversionTransferRemediation') return 'Закрепите задания, которые вызвали трудности';
    if (state.step === 'inversionTransferResult') return 'Проверка завершена';
    if (state.step === 'moduleComplete') return 'Обращения аккордов и гармония освоены!';
    return 'Обращения аккордов';
  });

  const bodyInstruction = $derived.by(() => {
    if (state.step === 'inversionOrientation') {
      return 'Один и тот же аккорд можно сыграть в разном расположении клавиш. <strong>Аккорд не меняется, меняется только нижний звук (бас)</strong>. Послушайте три формы C мажора:';
    }
    if (state.step === 'firstInversionModel') {
      return 'В первом обращении <strong>основной тон переносится на октаву вверх</strong>. Самым нижним звуком становится терция: <strong>E4 – G4 – C5</strong>.';
    }
    if (state.step === 'firstInversionGuided') {
      return `Бас-подсказка — <strong>E4</strong>; она не выбрана за вас. Сыграйте полный аккорд C мажор в 1-м обращении: <strong>E4 – G4 – C5</strong>. На экранной клавиатуре выберите все 3 ноты; по MIDI удерживайте их одновременно.`;
    }
    if (state.step === 'firstInversionQualify') {
      return 'Самостоятельно сыграйте полный аккорд первого обращения из 3 нот. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; по MIDI удерживайте все три одновременно.';
    }
    if (state.step === 'firstInversionLocalMix') {
      const q = state.quality === 'minor' ? 'минор' : 'мажор';
      return `Постройте полный аккорд из 3 нот: <strong>${state.rootKeyId} ${q} в 1-м обращении</strong>. Терция должна быть в басу. На MIDI сыграйте все три ноты одновременно.`;
    }
    if (state.step === 'firstInversionDelayedCheck') {
      return 'Проверка по памяти: постройте полный аккорд из 3 нот — C мажор в 1-м обращении, терция в басу. На MIDI сыграйте все три ноты одновременно.';
    }
    if (state.step === 'secondInversionModel') {
      return 'Во втором обращении самым нижним звуком становится <strong>квинта</strong>: <strong>G4 – C5 – E5</strong>. Порядок звуков: 5 – 1 – 3.';
    }
    if (state.step === 'secondInversionGuided') {
      return `Бас-подсказка — <strong>G4</strong>; она не выбрана за вас. Сыграйте полный аккорд C мажор во 2-м обращении: <strong>G4 – C5 – E5</strong>. На экранной клавиатуре выберите все 3 ноты; по MIDI удерживайте их одновременно.`;
    }
    if (state.step === 'secondInversionQualify') {
      return 'Самостоятельно сыграйте полный аккорд второго обращения из 3 нот. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; по MIDI удерживайте все три одновременно.';
    }
    if (state.step === 'secondInversionLocalMix') {
      const q = state.quality === 'minor' ? 'минор' : 'мажор';
      return `Постройте полный аккорд из 3 нот: <strong>${state.rootKeyId} ${q} во 2-м обращении</strong> (квинта в басу). На MIDI сыграйте все три ноты одновременно.`;
    }
    if (state.step === 'secondInversionDelayedCheck') {
      return 'Проверка по памяти: постройте полный аккорд из 3 нот — C мажор во 2-м обращении, квинта в басу. На MIDI сыграйте все три ноты одновременно.';
    }
    if (state.step === 'inversionContrast') {
      return 'Посмотрите, как движется бас одного и того же аккорда C мажор:<br>• Основное: <strong>C4</strong> – E4 – G4 (бас C)<br>• 1-е обращение: <strong>E4</strong> – G4 – C5 (бас E)<br>• 2-е обращение: <strong>G4</strong> – C5 – E5 (бас G)';
    }
    if (state.step === 'inversionIdentifyModel') {
      return 'Чтобы определить положение аккорда, найдите самую низкую ноту — <strong>бас</strong>:<br>• Бас — тоника = основное положение<br>• Бас — терция = 1-е обращение<br>• Бас — квинта = 2-е обращение<br><br>Это пример. Нажмите «Продолжить»; ответ понадобится на следующем шаге.';
    }
    if (state.step === 'inversionIdentifyQualify' || state.step === 'inversionIdentifyDelayedCheck') {
      return 'Найдите самую низкую из трёх подсвеченных нот — бас. Ответьте кнопкой или клавишами <strong>1 — основное, 2 — первое, 3 — второе обращение</strong>. Клавиши пианино и MIDI здесь не являются ответом.';
    }
    if (state.step === 'chordSymbolOrientation') {
      return 'В современной музыке аккорды записывают буквами:<br>• <strong>C</strong> = C мажор, <strong>Cm</strong> = C минор, <strong>Am</strong> = A минор<br>• <strong>Знак дроби (/):</strong> Слева пишется аккорд, справа после дроби — <strong>нота в басу</strong>!<br>• Например, <strong>G/B</strong> — это аккорд G мажор с нотой B внизу (1-е обращение).';
    }
    if (state.step === 'slashChordModel') {
      return '<strong>G/B</strong>: Аккорд G мажор (G–B–D), но самым нижним звуком должна быть <strong>B (терция)</strong>. Это первое обращение: <strong>B3 – D4 – G4</strong>.';
    }
    if (state.step === 'slashChordGuided') {
      return 'Бас-подсказка для <strong>G/B</strong> — B3; эта клавиша не выбрана за вас. Сыграйте полный аккорд из 3 нот: <strong>B3 – D4 – G4</strong>. На экранной клавиатуре выберите все 3 ноты; по MIDI удерживайте их одновременно.';
    }
    if (state.step === 'slashChordQualify') {
      return 'Самостоятельно постройте полный аккорд из 3 нот по обозначению <strong>C/E</strong> (C мажор, в басу E). На MIDI сыграйте все три ноты одновременно.';
    }
    if (state.step === 'slashChordDelayedCheck') {
      return 'Проверка по памяти: постройте полный аккорд из 3 нот по обозначению <strong>Am/C</strong> (A минор, в басу C). На MIDI сыграйте все три ноты одновременно.';
    }
    if (state.step === 'harmonySequence') {
      const cur = CANONICAL_HARMONY_SEQUENCE[state.harmonyStepIndex % CANONICAL_HARMONY_SEQUENCE.length];
      return `Сыграйте текущий аккорд: <strong style="font-size: 1.25rem; color: #38bdf8;">${cur.symbol}</strong> (${cur.explanation}). Нужно ровно 3 ноты. На экранной клавиатуре выбирайте их по очереди; по MIDI удерживайте все три одновременно.`;
    }
    if (state.step === 'inversionTransfer') {
      const blockLabel = state.transferBlockKind === 'initial' ? '16 заданий' : '8 новых заданий';
      const criterion = `Проверка состоит из ${blockLabel}. Нужно набрать не менее 80% правильных ответов с первой попытки.`;
      if (state.activeSkill === 'triadInversionIdentify') {
        return `${criterion}<br>Найдите бас — самую низкую из трёх подсвеченных нот — и ответьте кнопкой или клавишами <strong>1 — основное, 2 — первое, 3 — второе обращение</strong>. Пианино и MIDI не являются ответом.`;
      }
      if (state.symbol) {
        return `${criterion}<br>Сыграйте полный аккорд из 3 нот по обозначению: <strong style="font-size: 1.3rem; color: #38bdf8;">${state.symbol}</strong>. На экранной клавиатуре выберите все три ноты; по MIDI удерживайте их одновременно.`;
      }
      const invLabel = state.inversion === 'first' ? 'в 1-м обращении' : 'во 2-м обращении';
      const qLabel = state.quality === 'minor' ? 'минор' : 'мажор';
      return `${criterion}<br>Сыграйте полный аккорд из 3 нот: <strong>${state.rootKeyId} ${qLabel} ${invLabel}</strong>. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; по MIDI удерживайте все три одновременно.`;
    }
    if (state.step === 'inversionTransferRemediation') {
      if (state.activeSkill === 'triadInversionIdentify') {
        return 'Это короткое закрепление перед новой проверкой. Найдите бас среди трёх подсвеченных нот и выберите обращение кнопкой или клавишами 1, 2, 3.';
      }
      if (state.symbol) {
        return `Закрепите это задание: сыграйте полный аккорд из 3 нот по обозначению <strong>${state.symbol}</strong>. На экранной клавиатуре выберите все три ноты; по MIDI удерживайте их одновременно.`;
      }
      const invLabel = state.inversion === 'first' ? 'в 1-м обращении' : state.inversion === 'second' ? 'во 2-м обращении' : 'в основном положении';
      const qLabel = state.quality === 'minor' ? 'минор' : 'мажор';
      return `Закрепите это задание: сыграйте полный аккорд из 3 нот — ${state.rootKeyId} ${qLabel} ${invLabel}. На экранной клавиатуре выберите три клавиши; по MIDI удерживайте все три одновременно.`;
    }
    if (state.step === 'inversionTransferResult') {
      const accuracy = Math.round((state.transferCorrectFirstAttempts / Math.max(1, state.transferTrialsCompleted)) * 100);
      const failed = [...new Set(state.transferFailedTrialIndexes)];
      const weak = failed.map((index) => buildInversionTransferTrial(index, state.transferBlockKind));
      const labels = [...new Set(weak.map((trial) => trial.skill === 'triadInversionBuild'
        ? 'Построение обращений'
        : trial.skill === 'triadInversionIdentify'
          ? 'Распознавание баса'
          : 'Чтение аккордовых обозначений'))];
      const weakness = labels.length > 0
        ? `<br>Нужно закрепить: <strong>${labels.join(', ')}</strong>.`
        : '<br>Перед повторной проверкой разберём задания из предыдущего блока.';
      return `Заданий проверено: ${state.transferTrialsCompleted}. Точность первого ответа: <strong>${accuracy}%</strong>.<br>Для завершения модуля нужно не менее <strong>80%</strong> и все обязательные типы заданий.${weakness}`;
    }
    if (state.step === 'moduleComplete') {
      return 'Поздравляем! Вы освоили обращения трезвучий, аккордовые обозначения со знаком дроби (/) и простую гармоническую последовательность.';
    }
    return '';
  });
</script>

<div
  class="task-stage-card curriculum-active-task-stage interval-stage triad-stage inversion-stage"
  aria-label="Модуль обращений аккордов"
  data-testid="inversion-stage"
  data-inversion-step={state.step}
>
  <div class="task-stage-eyebrow first-run-eyebrow">
    <span class="first-run-phase-badge">{eyebrowText}</span>
  </div>

  <div class="task-stage-content-wrap">
    <div class="task-stage-instruction first-run-instruction">
      <h3 class="task-stage-title first-run-task-title">{stepTitle}</h3>
      <p class="first-run-task-desc">
        {@html bodyInstruction}
      </p>
    </div>

    {#if showChordInput || showIdentifyAnswers}
      <div class="inversion-input-legend" data-testid="inversion-input-legend">
        {#if showIdentifyAnswers}
          <span><i class="inversion-legend-swatch stimulus"></i>Показанный аккорд — стимул для распознавания</span>
          <span>Найдите самую низкую ноту: это бас</span>
        {:else}
          {#if state.structuralGuideKeyIds.length > 0}<span><i class="inversion-legend-swatch bass"></i>Бас-подсказка (не выбрана за вас)</span>{/if}
          <span><i class="inversion-legend-swatch selected"></i>Выбрано вами</span>
          <span><i class="inversion-legend-swatch correct"></i>Верно</span>
          <span><i class="inversion-legend-swatch wrong"></i>Ошибка</span>
        {/if}
      </div>
    {/if}

    <div class="first-run-interactive-zone">
      {#if state.step === 'inversionOrientation'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin: 12px 0;">
          <button
            type="button"
            class="btn outline"
            onclick={() => onPlayVoicingAudio?.(['C4', 'E4', 'G4'])}
            style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center; cursor: pointer;"
          >
            <div style="font-size: 0.8rem; color: #7dd3fc; font-weight: 700;">ОСНОВНОЕ ПОЛОЖЕНИЕ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">C4 – E4 – G4</div>
            <div style="font-size: 0.8rem; color: #bae6fd;">Бас: C4 (основной тон) 🔊</div>
          </button>

          <button
            type="button"
            class="btn outline"
            onclick={() => onPlayVoicingAudio?.(['E4', 'G4', 'C5'])}
            style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center; cursor: pointer;"
          >
            <div style="font-size: 0.8rem; color: #86efac; font-weight: 700;">ПЕРВОЕ ОБРАЩЕНИЕ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">E4 – G4 – C5</div>
            <div style="font-size: 0.8rem; color: #bbf7d0;">Бас: E4 (терция) 🔊</div>
          </button>

          <button
            type="button"
            class="btn outline"
            onclick={() => onPlayVoicingAudio?.(['G4', 'C5', 'E5'])}
            style="background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center; cursor: pointer;"
          >
            <div style="font-size: 0.8rem; color: #fde047; font-weight: 700;">ВТОРОЕ ОБРАЩЕНИЕ</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin: 4px 0;">G4 – C5 – E5</div>
            <div style="font-size: 0.8rem; color: #fef08a;">Бас: G4 (квинта) 🔊</div>
          </button>
        </div>
      {:else if state.step === 'inversionContrast'}
        <div class="interval-visual-demo" style="display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin: 12px 0;">
          <div class="interval-badge-card" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center;">
            <div style="font-size: 0.8rem; color: #7dd3fc; font-weight: 700;">ОСНОВНОЕ</div>
            <div style="font-size: 1.3rem; font-weight: 800; color: #f8fafc; margin: 4px 0;"><span style="color: #38bdf8; text-decoration: underline;">C4</span> – E4 – G4</div>
            <div style="font-size: 0.8rem; color: #bae6fd;">1 – 3 – 5</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center;">
            <div style="font-size: 0.8rem; color: #86efac; font-weight: 700;">1-Е ОБРАЩЕНИЕ</div>
            <div style="font-size: 1.3rem; font-weight: 800; color: #f8fafc; margin: 4px 0;"><span style="color: #4ade80; text-decoration: underline;">E4</span> – G4 – C5</div>
            <div style="font-size: 0.8rem; color: #bbf7d0;">3 – 5 – 1</div>
          </div>
          <div class="interval-badge-card" style="background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 12px 16px; text-align: center;">
            <div style="font-size: 0.8rem; color: #fde047; font-weight: 700;">2-Е ОБРАЩЕНИЕ</div>
            <div style="font-size: 1.3rem; font-weight: 800; color: #f8fafc; margin: 4px 0;"><span style="color: #facc15; text-decoration: underline;">G4</span> – C5 – E5</div>
            <div style="font-size: 0.8rem; color: #fef08a;">5 – 1 – 3</div>
          </div>
        </div>
      {:else if state.step === 'harmonySequence'}
        <!-- Horizontal Harmony Progression Bar -->
        <div class="harmony-progression-bar" style="display: flex; justify-content: center; gap: 16px; align-items: center; margin: 14px 0 10px 0; flex-wrap: wrap;" data-section="harmony-progression">
          {#each CANONICAL_HARMONY_SEQUENCE as item, idx}
            {@const isActive = state.harmonyStepIndex === idx}
            {@const isDone = state.harmonyStepIndex > idx}
            <div
              class="harmony-chord-chip"
              style="padding: 10px 20px; border-radius: 8px; text-align: center; border: 2px solid {isActive ? '#38bdf8' : isDone ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255,255,255,0.1)'}; background: {isActive ? 'rgba(56, 189, 248, 0.15)' : isDone ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.02)'};"
            >
              <div style="font-size: 1.4rem; font-weight: 800; color: {isActive ? '#38bdf8' : isDone ? '#4ade80' : '#94a3b8'};">
                {item.symbol}
              </div>
              <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 2px;">
                {isDone ? '✓ сыграно' : isActive ? '↑ текущий' : `${idx + 1}`}
              </div>
            </div>
            {#if idx < CANONICAL_HARMONY_SEQUENCE.length - 1}
              <div style="color: #64748b; font-size: 1.2rem; font-weight: bold;">→</div>
            {/if}
          {/each}
        </div>

        <!-- Selection count & submit button for harmony step -->
        <div class="triad-selection-bar" style="max-width: 480px; margin: 8px auto 4px auto;">
          <div class="triad-selection-count">
            Выбрано клавиш: <strong>{state.selectedKeyIds.length}</strong> из <strong>3</strong>
            {#if state.selectedKeyIds.length > 0}
              <span style="margin-left: 8px; font-size: 0.85rem; color: #94a3b8;">({state.selectedKeyIds.join(', ')})</span>
            {/if}
          </div>
          <button
            type="button"
            class="triad-check-btn"
            data-action="triad-submit-chord"
            disabled={state.selectedKeyIds.length !== 3}
            onclick={() => onSubmitChord?.()}
          >
            Проверить аккорд
          </button>
          {#if showMidiChordProgress}
            <div class="inversion-midi-progress" data-testid="midi-chord-progress" data-held-count={midiHeldKeyIds.length}>
              MIDI: {Math.min(midiHeldKeyIds.length, 3)} из 3 нот нажаты{midiHeldKeyIds.length > 0 && midiHeldKeyIds.length < 3 ? ' — продолжайте аккорд' : ''}
            </div>
          {/if}
        </div>
      {:else if showIdentifyAnswers}
        <!-- Inversion identify 3 buttons: Root, 1st, 2nd -->
        <div class="triad-answer-buttons" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; max-width: 680px; margin: 14px auto 6px auto;">
          {#each INVERSION_OPTIONS as opt (opt.id)}
            <button
              type="button"
              class="btn outline triad-answer-btn"
              data-inversion-id={opt.id}
              onclick={() => onSelectInversion?.(opt.id)}
              style="display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 12px 16px; text-align: left; font-size: 1rem;"
            >
              <span class="interval-key-chip" style="background: rgba(255,255,255,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.9rem;">
                {opt.numberKey}
              </span>
              <span>{opt.label}</span>
            </button>
          {/each}
        </div>
      {:else if showChordInput}
        <!-- Multi-key selection count and check button -->
        <div class="triad-selection-bar" style="max-width: 480px; margin: 10px auto 4px auto;">
          <div class="triad-selection-count">
            Выбрано клавиш: <strong>{state.selectedKeyIds.length}</strong> из <strong>3</strong>
            {#if state.selectedKeyIds.length > 0}
              <span style="margin-left: 8px; font-size: 0.85rem; color: #94a3b8;">({state.selectedKeyIds.join(', ')})</span>
            {/if}
          </div>
          <button
            type="button"
            class="triad-check-btn"
            data-action="triad-submit-chord"
            disabled={state.selectedKeyIds.length !== 3}
            onclick={() => onSubmitChord?.()}
          >
            Проверить аккорд
          </button>
          {#if showMidiChordProgress}
            <div class="inversion-midi-progress" data-testid="midi-chord-progress" data-held-count={midiHeldKeyIds.length}>
              MIDI: {Math.min(midiHeldKeyIds.length, 3)} из 3 нот нажаты{midiHeldKeyIds.length > 0 && midiHeldKeyIds.length < 3 ? ' — продолжайте аккорд' : ''}
            </div>
          {/if}
        </div>
      {:else if state.step === 'inversionTransferResult'}
        <div class="inversion-transfer-result" data-testid="inversion-transfer-result" data-block-trials={state.transferTrialsCompleted}>
          <div><strong>{state.transferBlockKind === 'initial' ? 'Первая проверка завершена' : `Повторная проверка №${state.transferBlockNumber - 1} завершена`}</strong></div>
          <div>Точность с первой попытки: <strong>{Math.round((state.transferCorrectFirstAttempts / Math.max(1, state.transferTrialsCompleted)) * 100)}%</strong></div>
          <div>Условие завершения: не менее 80% и полный охват типов заданий.</div>
        </div>
      {:else if state.step === 'inversionTransferRemediation'}
        <div class="inversion-remediation-progress" data-testid="inversion-remediation-progress">
          Закрепление слабых мест · {state.transferRemediationIndex + 1} из {state.transferRemediationTrialIndexes.length}
        </div>
      {:else if state.step === 'moduleComplete'}
        <div class="graduation-checklist-card" aria-label="Освоенные обращения и гармония">
          <div class="graduation-subtitle">В этом модуле вы освоили:</div>
          <ul class="graduation-items">
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Первое обращение</strong> (3 – 5 – 1) — терция в басу</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Второе обращение</strong> (5 – 1 – 3) — квинта в басу</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Распознавание обращений</strong> на слух и по расположению клавиш</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Аккордовые обозначения</strong> (C, Cm, Am) и аккорды с указанной нотой в басу (G/B, C/E, Am/C)</span></li>
            <li><span class="check">✓</span><span class="graduation-item-copy"><strong>Простую гармоническую последовательность</strong> (C → G/B → Am → F)</span></li>
          </ul>
        </div>
      {/if}

      {#if state.step === 'inversionTransfer'}
        <div class="first-run-progress-pills" style="margin-top: 10px; justify-content: center; gap: 8px;">
          <span class="first-run-status-chip">
            {state.transferTrialsCompleted < state.transferBlockSize
              ? `${state.transferBlockKind === 'initial' ? 'Проверка навыка' : 'Повторная проверка'} · ${state.transferTrialsCompleted + 1} из ${state.transferBlockSize}`
              : `Проверка ${state.transferBlockSize} из ${state.transferBlockSize} · исправьте ответ`}
          </span>
          <span class="first-run-status-chip">
            Точность первого ответа: {state.transferTrialsCompleted > 0 ? Math.round((state.transferCorrectFirstAttempts / state.transferTrialsCompleted) * 100) : '—'}{state.transferTrialsCompleted > 0 ? '%' : ''}
          </span>
          <span class="first-run-status-chip" style="color: var(--accent-light, #38bdf8);">
            {state.activeSkill === 'triadInversionIdentify' ? 'Определение' : state.symbol ? `Символ ${state.symbol}` : 'Построение'}
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
        {#if state.step === 'inversionOrientation' || state.step === 'inversionContrast' || state.step === 'chordSymbolOrientation' || state.step.endsWith('Model')}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="triad-advance"
            onclick={() => onAdvanceStage?.()}
          >
            Продолжить →
          </button>
        {:else if state.step === 'inversionTransferResult'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="inversion-transfer-remediate"
            onclick={() => onAdvanceStage?.()}
          >
            Закрепить слабые места →
          </button>
        {:else if state.step === 'moduleComplete'}
          <button
            type="button"
            class="btn primary feedback-action-btn next-question-inline-btn"
            data-action="inversion-complete-return"
            onclick={() => onCompleteModule?.()}
          >
            Вернуться к ежедневной тренировке ✓
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
