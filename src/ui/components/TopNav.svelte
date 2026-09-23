<script lang="ts">
  let {
    activePage = 'practice',
    onPageChange,
    onToggleSettings,
    onToggleContext,
    onNextQuestion,
    nextButtonDisabled = false,
    nextButtonText = 'Следующее задание'
  } = $props();

  const pages = [
    { id: 'practice', label: 'Тренировка' },
    { id: 'lessons', label: 'Уроки' },
    { id: 'repertoire', label: 'Мелодии' },
    { id: 'twohand', label: 'Две руки' },
    { id: 'progress', label: 'Прогресс' },
    { id: 'analytics', label: 'Аналитика' },
    { id: 'curriculum', label: 'Программа' },
    { id: 'diagnostics', label: 'Диагностика' },
    { id: 'calibration', label: 'Калибровка' }
  ];

  let menubarEl = $state<HTMLElement | null>(null);

  function handleKeydown(e: KeyboardEvent) {
    if (!menubarEl) return;
    const items = [...menubarEl.querySelectorAll<HTMLButtonElement>('.top-nav-btn')];
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;

    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;

    if (next != null) {
      e.preventDefault();
      items[next].focus();
    }
  }
</script>

<div class="top-nav" role="menubar" tabindex="0" aria-label="Главное меню" bind:this={menubarEl} onkeydown={handleKeydown}>
  {#each pages as p (p.id)}
    <button
      type="button"
      class="top-nav-btn {activePage === p.id ? 'active' : ''}"
      role="menuitem"
      aria-current={activePage === p.id ? 'page' : 'false'}
      onclick={() => onPageChange?.(p.id)}
    >
      {p.label}
    </button>
  {/each}
</div>

<div class="hero-toolbar">
  <div class="hero-action-group">
    <button
      type="button"
      class="hero-chip ghost context-toggle"
      aria-label="Показать контекст занятия"
      onclick={() => onToggleContext?.()}
    >
      <strong>Контекст</strong>
    </button>
    <button
      type="button"
      class="hero-chip ghost"
      aria-label="Настройки"
      onclick={() => onToggleSettings?.()}
    >
      <strong>Настройки</strong>
    </button>
    <button
      type="button"
      class="hero-chip primary"
      disabled={nextButtonDisabled}
      onclick={() => onNextQuestion?.()}
    >
      <strong>{nextButtonText}</strong>
    </button>
  </div>
</div>
