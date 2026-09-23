<script lang="ts">
  let {
    isOpen = false,
    onClose,
    onToggle,
    dueCount = 0,
    newCount = 0,
    learningCount = 0,
    masteredCount = 0,
    audioStatus = 'Загрузка…',
    audioReady = false,
    midiStatus = 'Не подключено',
    midiReady = false,
    sessionMode = 'Умная FSRS',
    sessionLevel = 'Белые',
    sessionPreset = 'Обычная · 8 мин',
    currentStage = 'Ориентиры C + F',
    retentionGoal = '90%'
  } = $props();
</script>

{#if isOpen}
  <div 
    class="inspector-backdrop" 
    role="presentation" 
    onclick={() => onClose?.()}
  ></div>
{/if}

<div 
  class="inspector-hotzone" 
  tabindex="0" 
  role="button"
  aria-label="Показать контекст занятия"
  onclick={() => onToggle?.()}
  onkeydown={(e) => { if (e.key === 'Enter') onToggle?.(); }}
></div>

<aside class="inspector-rail {isOpen ? 'open' : ''}">
  <div class="inspector-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
    <h2 style="margin:0; font-size:16px;">Инспектор занятия</h2>
    <button type="button" class="settings-close" aria-label="Закрыть" onclick={() => onClose?.()}>
      ✕
    </button>
  </div>

  <section class="scheduler-strip" aria-label="Состояние интервальных повторений">
    <div class="sched-item"><span>Сейчас</span><b>{dueCount} к повторению</b></div>
    <div class="sched-item"><span>Новые</span><b>{newCount} карточек</b></div>
    <div class="sched-item"><span>В изучении</span><b>{learningCount}</b></div>
    <div class="sched-item"><span>Закреплены</span><b>{masteredCount}</b></div>
  </section>

  <section class="inspector-card">
    <h2 style="margin:0 0 8px">Контекст занятия</h2>
    <div class="quick-grid">
      <div class="quick-metric"><small>Режим</small><b>{sessionMode}</b></div>
      <div class="quick-metric"><small>Материал</small><b>{sessionLevel}</b></div>
      <div class="quick-metric"><small>Сессия</small><b>{sessionPreset}</b></div>
      <div class="quick-metric"><small>Повторить</small><b>{dueCount}</b></div>
      <div class="quick-metric"><small>Текущий этап</small><b>{currentStage}</b></div>
      <div class="quick-metric"><small>Баланс памяти</small><b>{retentionGoal}</b></div>
    </div>
    <div class="inspector-note">
      Интерфейс разделён по задачам: практика занимает центр, контекст и настройки не отвлекают во время игры.
    </div>
  </section>

  <section class="io-strip" aria-label="Звук и MIDI">
    <div class="io-item {audioReady ? 'ready' : ''}">
      <span>🎹 Звук</span>
      <b>{audioStatus}</b>
      <small>Salamander Grand Piano · Yamaha C5</small>
    </div>
    <div class="io-item {midiReady ? 'ready' : ''}">
      <span>🎛 MIDI</span>
      <b>{midiStatus}</b>
      <small>Ответы MIDI работают в Find, Pattern, Notation и Ear</small>
    </div>
  </section>

  <section class="inspector-card">
    <h2 style="margin:0 0 8px">Почему такой дизайн</h2>
    <div class="help" style="font-size:12px; line-height:1.5;">
      • Практика получает максимум места на экране.<br>
      • Настройки вынесены в отдельную панель.<br>
      • Аналитика доступна в верхнем меню.<br>
      • Боковая панель открывается кликом на кнопку «Контекст» или наведением курсора к правому краю экрана.
    </div>
  </section>
</aside>
