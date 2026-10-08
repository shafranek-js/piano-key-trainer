<script lang="ts">
  import type { CurriculumPhase } from '../../core/curriculum/curriculum';
  import type { PhaseProgressDetails } from '../../core/curriculum/curriculumProgressDetails';
  import LearningRoadmap from '../components/LearningRoadmap.svelte';

  let {
    phases = [] as CurriculumPhase[],
    currentPhaseDetails = null as PhaseProgressDetails | null,
    onContinueCurrentPhase,
    bassGrandStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    onStartBassGrandModule,
    intervalStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isIntervalAvailable = false,
    onStartIntervalModule,
    triadStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isTriadAvailable = false,
    onStartTriadModule,
    inversionStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isInversionAvailable = false,
    onStartInversionModule,
    harmonyStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isHarmonyAvailable = false,
    onStartHarmonyModule,
    chordRhythmStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isChordRhythmAvailable = false,
    onStartChordRhythmModule,
    twoHandStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    isTwoHandAvailable = false,
    onStartTwoHandModule
  }: {
    phases?: CurriculumPhase[];
    currentPhaseDetails?: PhaseProgressDetails | null;
    onContinueCurrentPhase?: (phaseId: string) => void;
    bassGrandStatus?: 'not_started' | 'in_progress' | 'completed';
    onStartBassGrandModule?: () => void;
    intervalStatus?: 'not_started' | 'in_progress' | 'completed';
    isIntervalAvailable?: boolean;
    onStartIntervalModule?: () => void;
    triadStatus?: 'not_started' | 'in_progress' | 'completed';
    isTriadAvailable?: boolean;
    onStartTriadModule?: () => void;
    inversionStatus?: 'not_started' | 'in_progress' | 'completed';
    isInversionAvailable?: boolean;
    onStartInversionModule?: () => void;
    harmonyStatus?: 'not_started' | 'in_progress' | 'completed';
    isHarmonyAvailable?: boolean;
    onStartHarmonyModule?: () => void;
    chordRhythmStatus?: 'not_started' | 'in_progress' | 'completed';
    isChordRhythmAvailable?: boolean;
    onStartChordRhythmModule?: () => void;
    twoHandStatus?: 'not_started' | 'in_progress' | 'completed';
    isTwoHandAvailable?: boolean;
    onStartTwoHandModule?: () => void;
  } = $props();

  const completedCount = $derived(phases.filter(p => p.done || p.skipped).length);
  const isAllDone = $derived(phases.length > 0 && phases.every(p => p.done || p.skipped));
  const current = $derived(phases.find(p => p.open && !p.done && !p.skipped) || phases[phases.length - 1]);
</script>

<div class="page-heading">
  <div>
    <h2>Учебная программа</h2>
    <p>Пошаговое развитие от ориентиров клавиатуры до чтения нот и слуха.</p>
  </div>
</div>

<section class="card learning-roadmap-section" style="margin-bottom: 14px;" data-section="learning-roadmap">
  <LearningRoadmap
    {phases}
    {bassGrandStatus}
    {intervalStatus}
    {isIntervalAvailable}
    {triadStatus}
    {isTriadAvailable}
    {inversionStatus}
    {isInversionAvailable}
    {harmonyStatus}
    {isHarmonyAvailable}
    {chordRhythmStatus}
    {isChordRhythmAvailable}
    {twoHandStatus}
    {isTwoHandAvailable}
    {onStartBassGrandModule}
    {onStartIntervalModule}
    {onStartTriadModule}
    {onStartInversionModule}
    {onStartHarmonyModule}
    {onStartChordRhythmModule}
    {onStartTwoHandModule}
  />
</section>

<section class="card" id="curriculumCard">
  <h2>Учебная программа <span class="pill">{isAllDone ? '6 / 6 фаз завершено' : `${completedCount} / ${phases.length} фаз`}</span></h2>
  <div class="curriculum-summary">
    {#if isAllDone}
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom: 6px;">
        <span class="pill" style="background:rgba(34,197,94,0.18); color:#86efac; border:1px solid rgba(74,222,128,0.4); font-weight:700;">
          ✓ 6 / 6 фаз завершено
        </span>
        <span class="pill" style="background:rgba(56,189,248,0.18); color:#38bdf8; border:1px solid rgba(56,189,248,0.4); font-weight:700;">
          Ежедневное закрепление
        </span>
      </div>
      <div>Все 6 фаз основного курса успешно освоены. Приложение поддерживает ориентиры, ноты и слух регулярными тренировками и переносом навыка.</div>
    {:else if currentPhaseDetails}
      <div class="current-phase-block" data-element="current-phase-block">
        <div class="current-phase-header">
          <div class="current-phase-badge-row">
            <span class="pill current-pill">● Сейчас</span>
            <span class="phase-title-tag">Этап {currentPhaseDetails.phaseTitle} · {currentPhaseDetails.phaseDetail}</span>
          </div>
          <p class="current-phase-instruction">{currentPhaseDetails.instructionText}</p>
        </div>

        <!-- Блок «До завершения этапа» -->
        <div class="what-remains-block" data-element="what-remains-block">
          <h4 class="what-remains-heading">До завершения этапа</h4>
          <div class="what-remains-list">
            {#each currentPhaseDetails.checklist as item}
              <div class="what-remains-row">
                <span class="what-remains-label">{item.label}</span>
                <span class="what-remains-status {item.isMet ? 'status-met' : 'status-pending'}">
                  {item.statusText}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- CTA действие -->
        <div class="current-phase-cta-row">
          <button
            type="button"
            class="btn primary current-phase-cta-btn"
            disabled={currentPhaseDetails.ctaDisabled}
            onclick={() => onContinueCurrentPhase?.(currentPhaseDetails.phaseId)}
          >
            {currentPhaseDetails.ctaLabel}
          </button>
          {#if currentPhaseDetails.ctaHint}
            <span class="cta-hint">{currentPhaseDetails.ctaHint}</span>
          {/if}
        </div>
      </div>
    {:else if current}
      <div>Текущий этап: <strong>{current.title} · {current.detail}</strong>. Закрепите этот навык в тренировках.</div>
    {/if}
  </div>

  <div class="curriculum-grid" style="margin-top: 14px;">
    {#each phases as p (p.id)}
      <div class="curr-phase {p.done ? 'done' : !p.open ? 'locked' : 'current'}">
        <small>{p.title}</small>
        <b>{p.detail}</b>
        <div class="curr-state">
          {p.skipped ? 'пропущено' : p.done ? '✓ Пройдено' : p.open ? '● Сейчас' : '🔒 Ещё не открыто'}
        </div>
      </div>
    {/each}
  </div>
</section>

{#if isAllDone}
  <section class="card advanced-modules-section" style="margin-top: 14px;" data-section="advanced-modules">
    <h2>Дополнительные модули <span class="pill">После 6 фаз</span></h2>
    <div class="advanced-module-card" style="border: 1px solid var(--border, rgba(255,255,255,0.12)); border-radius: 8px; padding: 16px; margin-top: 10px; background: rgba(255,255,255,0.02);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700;">Басовый ключ и большая система</h3>
          <p style="margin: 0; color: var(--text-muted, #94a3b8); font-size: 0.95rem;">
            Чтение нижнего нотоносца (C3–B3) и переключение между двумя ключами.
          </p>
        </div>
        <div>
          {#if bassGrandStatus === 'completed'}
            <span class="pill" style="background: rgba(34,197,94,0.18); color: #86efac; border: 1px solid rgba(74,222,128,0.4); font-weight: 700;">
              ✓ Завершён
            </span>
          {:else if bassGrandStatus === 'in_progress'}
            <span class="pill" style="background: rgba(234,179,8,0.18); color: #fde047; border: 1px solid rgba(234,179,8,0.4); font-weight: 700;">
              В процессе
            </span>
          {:else}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); font-weight: 700;">
              Не начат
            </span>
          {/if}
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center;">
        {#if bassGrandStatus === 'completed'}
          <button
            type="button"
            class="btn outline"
            data-action="start-bass-module"
            onclick={() => onStartBassGrandModule?.()}
          >
            ✓ Завершено (повторить)
          </button>
        {:else if bassGrandStatus === 'in_progress'}
          <button
            type="button"
            class="btn primary"
            data-action="start-bass-module"
            onclick={() => onStartBassGrandModule?.()}
          >
            Продолжить →
          </button>
        {:else}
          <button
            type="button"
            class="btn primary"
            data-action="start-bass-module"
            onclick={() => onStartBassGrandModule?.()}
          >
            Начать модуль →
          </button>
        {/if}
      </div>
    </div>

    <!-- Milestone 3G: Interval Foundations Advanced Module -->
    <div class="advanced-module-card" style="border: 1px solid var(--border, rgba(255,255,255,0.12)); border-radius: 8px; padding: 16px; margin-top: 12px; background: rgba(255,255,255,0.02);" data-module="intervals">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700;">Интервалы</h3>
          <p style="margin: 0; color: var(--text-muted, #94a3b8); font-size: 0.95rem;">
            Октава, квинта, большая и малая терция · фундамент трезвучий (1–3–5).
          </p>
        </div>
        <div>
          {#if !isIntervalAvailable}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); font-weight: 600;">
              🔒 После басового ключа
            </span>
          {:else if intervalStatus === 'completed'}
            <span class="pill" style="background: rgba(34,197,94,0.18); color: #86efac; border: 1px solid rgba(74,222,128,0.4); font-weight: 700;">
              ✓ Завершён
            </span>
          {:else if intervalStatus === 'in_progress'}
            <span class="pill" style="background: rgba(234,179,8,0.18); color: #fde047; border: 1px solid rgba(234,179,8,0.4); font-weight: 700;">
              В процессе
            </span>
          {:else}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); font-weight: 700;">
              Не начат
            </span>
          {/if}
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center;">
        {#if !isIntervalAvailable}
          <button
            type="button"
            class="btn outline"
            disabled
            style="opacity: 0.55; cursor: not-allowed;"
          >
            🔒 Недоступно
          </button>
        {:else if intervalStatus === 'completed'}
          <button
            type="button"
            class="btn outline"
            data-action="start-interval-module"
            onclick={() => onStartIntervalModule?.()}
          >
            ✓ Завершено (повторить)
          </button>
        {:else if intervalStatus === 'in_progress'}
          <button
            type="button"
            class="btn primary"
            data-action="start-interval-module"
            onclick={() => onStartIntervalModule?.()}
          >
            Продолжить →
          </button>
        {:else}
          <button
            type="button"
            class="btn primary"
            data-action="start-interval-module"
            onclick={() => onStartIntervalModule?.()}
          >
            Начать модуль →
          </button>
        {/if}
      </div>
    </div>

    <!-- Milestone 3H: Major / Minor Triads Advanced Module -->
    <div class="advanced-module-card" style="border: 1px solid var(--border, rgba(255,255,255,0.12)); border-radius: 8px; padding: 16px; margin-top: 12px; background: rgba(255,255,255,0.02);" data-module="triads">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700;">Мажорные и минорные трезвучия</h3>
          <p style="margin: 0; color: var(--text-muted, #94a3b8); font-size: 0.95rem;">
            Формула 1–3–5, сдвиг терции на полутон, построение и распознавание аккордов.
          </p>
        </div>
        <div>
          {#if !isTriadAvailable}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); font-weight: 600;">
              🔒 После интервалов
            </span>
          {:else if triadStatus === 'completed'}
            <span class="pill" style="background: rgba(34,197,94,0.18); color: #86efac; border: 1px solid rgba(74,222,128,0.4); font-weight: 700;">
              ✓ Завершён
            </span>
          {:else if triadStatus === 'in_progress'}
            <span class="pill" style="background: rgba(234,179,8,0.18); color: #fde047; border: 1px solid rgba(234,179,8,0.4); font-weight: 700;">
              В процессе
            </span>
          {:else}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); font-weight: 700;">
              Не начат
            </span>
          {/if}
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center;">
        {#if !isTriadAvailable}
          <button
            type="button"
            class="btn outline"
            disabled
            style="opacity: 0.55; cursor: not-allowed;"
          >
            🔒 Недоступно
          </button>
        {:else if triadStatus === 'completed'}
          <button
            type="button"
            class="btn outline"
            data-action="start-triad-module"
            onclick={() => onStartTriadModule?.()}
          >
            ✓ Завершено (повторить)
          </button>
        {:else if triadStatus === 'in_progress'}
          <button
            type="button"
            class="btn primary"
            data-action="start-triad-module"
            onclick={() => onStartTriadModule?.()}
          >
            Продолжить →
          </button>
        {:else}
          <button
            type="button"
            class="btn primary"
            data-action="start-triad-module"
            onclick={() => onStartTriadModule?.()}
          >
            Начать модуль →
          </button>
        {/if}
      </div>
    </div>

    <!-- Milestone 3I: Chord Inversions & Harmony Advanced Module -->
    <div class="advanced-module-card" style="border: 1px solid var(--border, rgba(255,255,255,0.12)); border-radius: 8px; padding: 16px; margin-top: 12px; background: rgba(255,255,255,0.02);" data-module="inversions">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700;">Обращения аккордов и гармония</h3>
          <p style="margin: 0; color: var(--text-muted, #94a3b8); font-size: 0.95rem;">
            1-е и 2-е обращения, чтение обозначений с нотой баса (G/B, C/E) и первая простая гармоническая последовательность.
          </p>
        </div>
        <div>
          {#if !isInversionAvailable}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); font-weight: 600;">
              🔒 После трезвучий
            </span>
          {:else if inversionStatus === 'completed'}
            <span class="pill" style="background: rgba(34,197,94,0.18); color: #86efac; border: 1px solid rgba(74,222,128,0.4); font-weight: 700;">
              ✓ Завершён
            </span>
          {:else if inversionStatus === 'in_progress'}
            <span class="pill" style="background: rgba(234,179,8,0.18); color: #fde047; border: 1px solid rgba(234,179,8,0.4); font-weight: 700;">
              В процессе
            </span>
          {:else}
            <span class="pill" style="background: rgba(148,163,184,0.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); font-weight: 700;">
              Не начат
            </span>
          {/if}
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center;">
        {#if !isInversionAvailable}
          <button
            type="button"
            class="btn outline"
            disabled
            style="opacity: 0.55; cursor: not-allowed;"
          >
            🔒 Недоступно
          </button>
        {:else if inversionStatus === 'completed'}
          <button
            type="button"
            class="btn outline"
            data-action="start-inversion-module"
            onclick={() => onStartInversionModule?.()}
          >
            ✓ Завершено (повторить)
          </button>
        {:else if inversionStatus === 'in_progress'}
          <button
            type="button"
            class="btn primary"
            data-action="start-inversion-module"
            onclick={() => onStartInversionModule?.()}
          >
            Продолжить →
          </button>
        {:else}
          <button
            type="button"
            class="btn primary"
            data-action="start-inversion-module"
            onclick={() => onStartInversionModule?.()}
          >
            Начать модуль →
          </button>
        {/if}
      </div>
    </div>
  </section>
{/if}

<section class="card" style="margin-top: 14px;">
  <h2>Чтение нот <span class="pill">Скрипичный ключ</span></h2>
  <div class="help">
    <strong>Навык:</strong> нота на стане → точная клавиша и октава. В ежедневной практике открывается после закрепления географии клавиатуры. Текущий базовый диапазон: <strong>C4–B4</strong>.
  </div>
</section>

<section class="card" style="margin-top: 14px;">
  <h2>Слух → клавиша <span class="pill">Относительный слух</span></h2>
  <div class="help">
    Чтобы не требовать абсолютного слуха, сначала звучит <strong>опорная C4</strong>, затем целевая нота C4–B4. Нужно нажать точную клавишу на фортепиано.
  </div>
</section>

<style>
  .current-phase-block {
    margin-top: 12px;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 10px;
    padding: 16px;
  }

  .current-phase-badge-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .current-pill {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.45);
    font-weight: 700;
  }

  .phase-title-tag {
    font-weight: 700;
    color: var(--text-main, #f8fafc);
  }

  .current-phase-instruction {
    margin: 6px 0 14px 0;
    color: var(--text-muted, #94a3b8);
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .what-remains-block {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 14px;
  }

  .what-remains-heading {
    margin: 0 0 10px 0;
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #38bdf8;
  }

  .what-remains-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .what-remains-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .what-remains-row:last-child {
    border-bottom: none;
  }

  .what-remains-label {
    color: var(--text-main, #e2e8f0);
  }

  .status-met {
    color: #4ade80;
    font-weight: 600;
  }

  .status-pending {
    color: #fbbf24;
    font-weight: 600;
  }

  .current-phase-cta-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .cta-hint {
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
  }
</style>
