<script lang="ts">
  import type { UserSettings } from '../../core/fsrs/types';

  let {
    isOpen = false,
    settings = {} as UserSettings,
    midiConnected = false,
    onClose,
    onSettingsChange,
    onConnectMidi,
    onExportData,
    onImportData
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
          value={settings.mode || 'smart'} 
          onchange={(e) => onSettingsChange?.({ mode: (e.target as HTMLSelectElement).value })}
        >
          <option value="smart">Умная тренировка · FSRS</option>
          <option value="find">Свободно · найди ноту</option>
          <option value="identify">Свободно · назови ноту</option>
          <option value="pattern">Свободно · ориентиры 2 + 3</option>
          <option value="notationToKey">Свободно · нота на стане → клавиша</option>
          <option value="soundToKey">Свободно · звук → клавиша</option>
          <option value="earIntervals">Слух · интервалы от C4</option>
          <option value="earTriads">Слух · мажор или минор</option>
          <option value="earEcho">Слух · мелодическое эхо (диктант)</option>
        </select>
      </div>

      <div class="field">
        <label for="levelSelect">Материал</label>
        <select 
          id="levelSelect" 
          value={settings.level || 'white'}
          onchange={(e) => onSettingsChange?.({ level: (e.target as HTMLSelectElement).value as 'white' | 'all' })}
        >
          <option value="white">Белые клавиши · C D E F G A B</option>
          <option value="all">Все клавиши · + ♯ / ♭</option>
        </select>
      </div>

      <div class="field">
        <label for="clefSelect">Нотный стан</label>
        <select 
          id="clefSelect" 
          value={settings.notationClef || 'treble'}
          onchange={(e) => onSettingsChange?.({ notationClef: (e.target as HTMLSelectElement).value as any })}
        >
          <option value="treble">Скрипичный ключ · C4–B4</option>
          <option value="bass">Басовый ключ · C3–C4</option>
          <option value="grand">Двойной стан · Grand Staff</option>
        </select>
      </div>

      <div class="field">
        <label for="retentionSelect">Цель памяти</label>
        <select 
          id="retentionSelect" 
          value={Number(settings.desiredRetention || 0.9).toFixed(2)}
          onchange={(e) => onSettingsChange?.({ desiredRetention: parseFloat((e.target as HTMLSelectElement).value) })}
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
          onchange={(e) => onSettingsChange?.({ sessionPreset: (e.target as HTMLSelectElement).value as any })}
        >
          <option value="quick">Быстрая · 3 мин</option>
          <option value="normal">Обычная · 8 мин</option>
          <option value="due">Все повторы · без новых</option>
          <option value="cold">Cold Test · 20 заданий</option>
        </select>
      </div>

      <div class="field">
        <label for="newPitchClassesSelect">Новые ноты за сессию</label>
        <select 
          id="newPitchClassesSelect" 
          value={String(settings.newPitchClassesPerSession ?? 2)}
          onchange={(e) => onSettingsChange?.({ newPitchClassesPerSession: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="2">2 ноты · размеренно</option>
          <option value="3">3 ноты · оптимально</option>
          <option value="4">4 ноты · интенсивно</option>
          <option value="12">Все сразу · без лимита</option>
        </select>
      </div>

      <div class="field">
        <label for="delaySelect">Пауза после ответа</label>
        <select 
          id="delaySelect" 
          value={String(settings.autoAdvanceDelaySeconds ?? 3.0)}
          onchange={(e) => onSettingsChange?.({ autoAdvanceDelaySeconds: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value="1.5">1.5 сек · быстро</option>
          <option value="2">2 сек · бодро</option>
          <option value="3">3 сек · стандарт (для чтения пояснений)</option>
          <option value="4">4 сек · спокойно</option>
          <option value="0">Вручную (кнопка / Пробел)</option>
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

      <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(148,163,184,0.14); display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Резервная копия</span>
        <div style="display: flex; gap: 8px;">
          <button 
            type="button" 
            class="btn" 
            style="flex: 1; font-size: 12px; padding: 8px 6px; white-space: nowrap;"
            onclick={() => onExportData?.()}
          >
            💾 Экспорт JSON
          </button>
          <label 
            class="btn" 
            style="flex: 1; font-size: 12px; padding: 8px 6px; text-align: center; cursor: pointer; white-space: nowrap;"
          >
            📂 Импорт JSON
            <input 
              type="file" 
              accept=".json" 
              style="display: none;" 
              onchange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) onImportData?.(file);
              }}
            />
          </label>
        </div>
      </div>
    </section>
  </div>
</div>
