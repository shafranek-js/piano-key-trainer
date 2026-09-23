<script lang="ts">
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    isOpen = false,
    settings = {} as UserSettings,
    midiConnected = false,
    onClose,
    onSettingsChange,
    onConnectMidi
  } = $props();
</script>

<div 
  class="settings-drawer {isOpen ? '' : 'hidden'}" 
  id="settingsDrawer"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose?.();
  }}
>
  <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
    <div class="settings-head">
      <div>
        <h2 id="settingsTitle">Настройки тренировки</h2>
        <p>Параметры практики: режим, материал, баланс интервалов FSRS и MIDI-ввод.</p>
      </div>
      <button type="button" class="settings-close" aria-label="Закрыть" onclick={() => onClose?.()}>
        ✕
      </button>
    </div>

    <section class="toolbar" aria-label="Настройки">
      <div class="field">
        <label for="modeSelect">Режим</label>
        <select 
          id="modeSelect" 
          value={settings.sessionPreset === 'cold' ? 'smart' : 'smart'} 
          onchange={(e) => onSettingsChange?.({ mode: (e.target as HTMLSelectElement).value })}
        >
          <option value="smart">Умная тренировка · FSRS</option>
          <option value="find">Свободно · найди ноту</option>
          <option value="identify">Свободно · назови ноту</option>
          <option value="pattern">Свободно · ориентиры 2 + 3</option>
          <option value="notationToKey">Свободно · нота на стане → клавиша</option>
          <option value="soundToKey">Свободно · звук → клавиша</option>
        </select>
      </div>

      <div class="field">
        <label for="levelSelect">Материал</label>
        <select 
          id="levelSelect" 
          onchange={(e) => onSettingsChange?.({ level: (e.target as HTMLSelectElement).value })}
        >
          <option value="white">Белые клавиши · C D E F G A B</option>
          <option value="all">Все клавиши · + ♯ / ♭</option>
        </select>
      </div>

      <div class="field">
        <label for="retentionSelect">Цель памяти</label>
        <select 
          id="retentionSelect" 
          value={String(settings.desiredRetention || 0.9)}
          onchange={(e) => onSettingsChange?.({ desiredRetention: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="0.87">Экономно · 87%</option>
          <option value="0.90">Баланс · 90%</option>
          <option value="0.93">Точно · 93%</option>
        </select>
      </div>

      <div class="field">
        <label for="presetSelect">Сессия</label>
        <select 
          id="presetSelect" 
          value={settings.sessionPreset || 'normal'}
          onchange={(e) => onSettingsChange?.({ sessionPreset: (e.target as HTMLSelectElement).value })}
        >
          <option value="quick">Быстрая · 3 мин</option>
          <option value="normal">Обычная · 8 мин</option>
          <option value="due">Все повторы · без новых</option>
          <option value="cold">Cold Test · 20 заданий</option>
        </select>
      </div>

      <button 
        type="button" 
        class="btn {settings.useLatencyGrading ? 'on' : ''}" 
        aria-pressed={settings.useLatencyGrading}
        onclick={() => onSettingsChange?.({ useLatencyGrading: !settings.useLatencyGrading })}
      >
        Скорость: {settings.useLatencyGrading ? 'вкл' : 'выкл'}
      </button>

      <button 
        type="button" 
        class="btn {midiConnected ? 'on' : ''}" 
        aria-pressed={midiConnected}
        onclick={() => onConnectMidi?.()}
      >
        {midiConnected ? 'MIDI: подключено' : 'MIDI: подключить'}
      </button>
    </section>
  </div>
</div>
