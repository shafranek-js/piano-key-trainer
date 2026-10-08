<script lang="ts">
  import {
    buildLearningRoadmap,
    type BuildRoadmapParams,
    type RoadmapStage,
    type RoadmapStageId
  } from '../../core/curriculum/learningRoadmap';

  let {
    phases = [],
    bassGrandStatus = 'not_started',
    intervalStatus = 'not_started',
    isIntervalAvailable = false,
    triadStatus = 'not_started',
    isTriadAvailable = false,
    inversionStatus = 'not_started',
    isInversionAvailable = false,
    harmonyStatus = 'not_started',
    isHarmonyAvailable = false,
    chordRhythmStatus = 'not_started',
    isChordRhythmAvailable = false,
    twoHandStatus = 'not_started',
    isTwoHandAvailable = false,
    onStartBassGrandModule,
    onStartIntervalModule,
    onStartTriadModule,
    onStartInversionModule,
    onStartHarmonyModule,
    onStartChordRhythmModule,
    onStartTwoHandModule
  }: BuildRoadmapParams & {
    onStartBassGrandModule?: () => void;
    onStartIntervalModule?: () => void;
    onStartTriadModule?: () => void;
    onStartInversionModule?: () => void;
    onStartHarmonyModule?: () => void;
    onStartChordRhythmModule?: () => void;
    onStartTwoHandModule?: () => void;
  } = $props();

  const stages = $derived(
    buildLearningRoadmap({
      phases,
      bassGrandStatus,
      intervalStatus,
      isIntervalAvailable,
      triadStatus,
      isTriadAvailable,
      inversionStatus,
      isInversionAvailable,
      harmonyStatus,
      isHarmonyAvailable,
      chordRhythmStatus,
      isChordRhythmAvailable,
      twoHandStatus,
      isTwoHandAvailable
    })
  );

  let selectedStageId = $state<RoadmapStageId | null>(null);

  const activeDetailStage = $derived.by(() => {
    if (selectedStageId) {
      const found = stages.find((s) => s.id === selectedStageId);
      if (found) return found;
    }
    return stages.find((s) => s.isCurrent) || stages[0];
  });

  function getStatusTheme(status: RoadmapStage['status']) {
    switch (status) {
      case 'completed':
        return {
          badgeClass: 'badge-completed',
          borderClass: 'border-completed'
        };
      case 'in_progress':
        return {
          badgeClass: 'badge-in-progress',
          borderClass: 'border-in-progress'
        };
      case 'available':
        return {
          badgeClass: 'badge-available',
          borderClass: 'border-available'
        };
      case 'locked':
        return {
          badgeClass: 'badge-locked',
          borderClass: 'border-locked'
        };
      case 'planned':
        return {
          badgeClass: 'badge-planned',
          borderClass: 'border-planned'
        };
    }
  }

  function handleStageClick(stage: RoadmapStage) {
    selectedStageId = stage.id;
  }

  function handleActionClick(stageId: RoadmapStageId) {
    if (stageId === 'bass_clef') onStartBassGrandModule?.();
    else if (stageId === 'intervals') onStartIntervalModule?.();
    else if (stageId === 'triads') onStartTriadModule?.();
    else if (stageId === 'inversions') onStartInversionModule?.();
    else if (stageId === 'harmony') onStartHarmonyModule?.();
    else if (stageId === 'chord_rhythm') onStartChordRhythmModule?.();
    else if (stageId === 'two_hand') onStartTwoHandModule?.();
  }
</script>

<div class="learning-roadmap-container" data-component="learning-roadmap">
  <div class="roadmap-topbar">
    <div class="roadmap-title-area">
      <div class="roadmap-badge-legend">
        <span class="legend-dot current-dot"></span>
        <span class="legend-text">Дорожная карта обучения</span>
      </div>
      <h3 class="roadmap-main-heading">Траектория от клавиш до ритма</h3>
      <p class="roadmap-subtitle">
        Наглядная карта всей программы: базовые фазы и последовательные модули гармонии и ритма.
      </p>
    </div>

    {#if activeDetailStage}
      <div class="active-badge-preview">
        <span class="current-label">Текущий фокус:</span>
        <span class="current-tag">
          {activeDetailStage.order}. {activeDetailStage.title}
        </span>
      </div>
    {/if}
  </div>

  <!-- Stepped Timeline Grid -->
  <div class="roadmap-timeline" role="list">
    {#each stages as stage (stage.id)}
      {@const theme = getStatusTheme(stage.status)}
      {@const isSelected = activeDetailStage?.id === stage.id}
      <div role="listitem" class="roadmap-step-wrapper">
        <button
          type="button"
          class="roadmap-step-card {theme.borderClass} {stage.isCurrent ? 'is-current' : ''} {isSelected ? 'is-selected' : ''}"
          data-stage-id={stage.id}
          data-stage-status={stage.status}
          onclick={() => handleStageClick(stage)}
        >
          <div class="step-card-header">
            <span class="step-order-pill">#{stage.order}</span>
            <span class="stage-status-badge {theme.badgeClass}">
              {stage.statusLabelRu}
            </span>
          </div>

          <div class="step-card-body">
            <h4 class="step-card-title">{stage.title}</h4>
            <div class="step-card-summary">{stage.progressSummary}</div>
          </div>

          <div class="step-card-footer">
            <span class="step-category-tag cat-{stage.category}">
              {stage.categoryLabelRu}
            </span>
          </div>
        </button>
      </div>
    {/each}
  </div>

  <!-- Interactive Detail Inspector Panel -->
  {#if activeDetailStage}
    <div class="roadmap-detail-panel" data-element="roadmap-detail-panel">
      <div class="detail-panel-left">
        <div class="detail-header-row">
          <span class="detail-order-badge">Этап {activeDetailStage.order} из {stages.length}</span>
          <span class="detail-status-pill {getStatusTheme(activeDetailStage.status).badgeClass}">
            {activeDetailStage.statusLabelRu}
          </span>
          <span class="detail-category-label">
            {activeDetailStage.categoryLabelRu}
          </span>
        </div>
        <h4 class="detail-stage-name">{activeDetailStage.title}</h4>
        <p class="detail-stage-description">{activeDetailStage.description}</p>
      </div>

      <div class="detail-panel-right">
        {#if activeDetailStage.category === 'advanced'}
          {#if activeDetailStage.status === 'completed'}
            <button
              type="button"
              class="btn outline roadmap-action-btn"
              onclick={() => handleActionClick(activeDetailStage.id)}
            >
              ✓ Повторить модуль
            </button>
          {:else if activeDetailStage.status === 'in_progress'}
            <button
              type="button"
              class="btn primary roadmap-action-btn pulse-glow"
              onclick={() => handleActionClick(activeDetailStage.id)}
            >
              Продолжить модуль →
            </button>
          {:else if activeDetailStage.status === 'available'}
            <button
              type="button"
              class="btn primary roadmap-action-btn"
              onclick={() => handleActionClick(activeDetailStage.id)}
            >
              Начать модуль →
            </button>
          {:else}
            <span class="locked-hint">
              🔒 Откроется после предыдущего шага
            </span>
          {/if}
        {:else if activeDetailStage.category === 'planned'}
          <span class="planned-hint">
            ★ Запланировано в следующем этапе курса
          </span>
        {:else}
          <span class="core-hint">
            {activeDetailStage.status === 'completed'
              ? '✓ Базовый навык освоен'
              : activeDetailStage.status === 'in_progress'
                ? 'Изучается в основной программе'
                : 'Откроется по мере освоения базы'}
          </span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .learning-roadmap-container {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    box-sizing: border-box;
  }

  .roadmap-topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
  }

  .roadmap-title-area {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .roadmap-badge-legend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }

  .legend-text {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #38bdf8;
  }

  .roadmap-main-heading {
    margin: 2px 0 0 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main, #f8fafc);
  }

  .roadmap-subtitle {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted, #94a3b8);
    max-width: 680px;
    line-height: 1.4;
  }

  .active-badge-preview {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.85rem;
  }

  .current-label {
    color: var(--text-muted, #94a3b8);
  }

  .current-tag {
    color: #38bdf8;
    font-weight: 700;
  }

  /* Responsive Timeline Grid */
  .roadmap-timeline {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 1024px) {
    .roadmap-timeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 580px) {
    .roadmap-timeline {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  }

  .roadmap-step-wrapper {
    display: flex;
    width: 100%;
  }

  .roadmap-step-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    font-family: inherit;
    color: inherit;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(30, 41, 59, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 12px;
    min-height: 106px;
    cursor: pointer;
    transition: all 0.18s ease;
    user-select: none;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }

  .roadmap-step-card:hover {
    background: rgba(30, 41, 59, 0.7);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .roadmap-step-card:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }

  .roadmap-step-card.is-selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  /* Specific status borders and glow */
  .border-in-progress.is-current {
    border-color: #38bdf8;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
    background: rgba(56, 189, 248, 0.12);
  }

  .border-completed {
    border-color: rgba(74, 222, 128, 0.25);
  }

  .border-available {
    border-color: rgba(234, 179, 8, 0.3);
  }

  .border-locked {
    border-color: rgba(148, 163, 184, 0.12);
    opacity: 0.72;
  }

  .border-planned {
    border-color: rgba(168, 85, 247, 0.3);
    border-style: dashed;
    opacity: 0.85;
  }

  .step-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
  }

  .step-order-pill {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted, #94a3b8);
  }

  .stage-status-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .badge-completed {
    background: rgba(34, 197, 94, 0.16);
    color: #86efac;
    border: 1px solid rgba(74, 222, 128, 0.35);
  }

  .badge-in-progress {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.45);
    font-weight: 700;
  }

  .badge-available {
    background: rgba(234, 179, 8, 0.16);
    color: #fde047;
    border: 1px solid rgba(234, 179, 8, 0.35);
  }

  .badge-locked {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .badge-planned {
    background: rgba(168, 85, 247, 0.14);
    color: #c084fc;
    border: 1px dashed rgba(168, 85, 247, 0.35);
  }

  .step-card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .step-card-title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text-main, #f8fafc);
    line-height: 1.25;
  }

  .step-card-summary {
    font-size: 0.76rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.3;
  }

  .step-card-footer {
    margin-top: 6px;
    display: flex;
    align-items: center;
  }

  .step-category-tag {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .cat-core {
    color: #94a3b8;
  }

  .cat-advanced {
    color: #38bdf8;
  }

  .cat-planned {
    color: #c084fc;
  }

  /* Detail Inspector Panel */
  .roadmap-detail-panel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    padding: 14px 18px;
    box-sizing: border-box;
  }

  .detail-panel-left {
    flex: 1;
    min-width: 260px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .detail-order-badge {
    font-size: 0.78rem;
    font-weight: 700;
    color: #94a3b8;
  }

  .detail-status-pill {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .detail-category-label {
    font-size: 0.78rem;
    color: #cbd5e1;
    font-weight: 600;
  }

  .detail-stage-name {
    margin: 2px 0 0 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-main, #f8fafc);
  }

  .detail-stage-description {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.45;
  }

  .detail-panel-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .roadmap-action-btn {
    white-space: nowrap;
    padding: 8px 16px;
    font-size: 0.9rem;
  }

  .pulse-glow {
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
  }

  .locked-hint,
  .planned-hint,
  .core-hint {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
  }

  .planned-hint {
    color: #c084fc;
    font-weight: 600;
  }
</style>
