<script lang="ts">
  let {
    isOpen = false,
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

<aside class="inspector-rail {isOpen ? 'open' : ''}">
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
      Интерфейс разделен по задачам: практика занимает центр, контекст и настройки не отвлекают во время игры.
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
</aside>
