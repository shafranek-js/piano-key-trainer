<script lang="ts">
  let {
    stepNumber = 1,
    totalSteps = 1,
    title = 'Мини-урок',
    body = 'Инструкция',
    canContinue = false,
    continueLabel = 'Продолжить',
    onContinue,
    onExit
  } = $props();
</script>

<section class="lesson-banner active" id="lessonBanner" aria-live="polite">
  <div>
    <div class="lesson-progress-mini">Шаг {stepNumber} / {totalSteps}</div>
    <h3>{title}</h3>
    <p>{body}</p>
  </div>
  <div class="actions">
    {#if canContinue}
      <button 
        type="button" 
        class="btn primary lesson-primary-btn" 
        onclick={() => onContinue?.()}
      >
        {continueLabel}
      </button>
    {/if}
    <button 
      type="button" 
      class="btn" 
      onclick={() => onExit?.()}
    >
      Выйти из урока
    </button>
  </div>
</section>
