<script lang="ts">
  import { NATURAL_NOTES, ALL_NOTES, SHORT_NAMES } from '../../core/fsrs/constants';
  import { retrievability } from '../../core/fsrs/fsrs6';
  import { deriveRetentionMastery } from '../../core/learning/dailyPractice';
  import { HARMONY_ITEM_IDS } from '../../core/learning/harmony';
  import type { LearningProgressRecord } from '../../core/learning/types';
  import type { Card, NoteName, Skill, UserSettings } from '../../core/fsrs/types';

  let {
    cardsMap = new Map<string, Card>(),
    settings = {} as UserSettings,
    reviewLogLength = 0,
    level = 'white' as 'white' | 'all',
    isGrandStaffComplete = false,
    learningProgressMap = new Map<string, LearningProgressRecord>(),
    harmonyStatus = 'not_started' as 'not_started' | 'in_progress' | 'completed',
    onExport,
    onImport,
    onReset
  }: {
    cardsMap?: Map<string, Card>;
    settings?: UserSettings;
    reviewLogLength?: number;
    level?: 'white' | 'all';
    isGrandStaffComplete?: boolean;
    learningProgressMap?: ReadonlyMap<string, LearningProgressRecord>;
    harmonyStatus?: 'not_started' | 'in_progress' | 'completed';
    onExport?: () => void;
    onImport?: (file: File) => void;
    onReset?: () => void;
  } = $props();

  const notes = $derived(level === 'white' ? NATURAL_NOTES : ALL_NOTES);

  const INTERVAL_PROGRESS_ITEMS: { id: 'P8' | 'P5' | 'M3' | 'm3'; name: string; semitones: number }[] = [
    { id: 'P8', name: 'Октава', semitones: 12 },
    { id: 'P5', name: 'Чистая квинта', semitones: 7 },
    { id: 'M3', name: 'Большая терция', semitones: 4 },
    { id: 'm3', name: 'Малая терция', semitones: 3 }
  ];

  const TRIAD_PROGRESS_ITEMS: { id: 'major' | 'minor'; name: string; formula: string }[] = [
    { id: 'major', name: 'Мажорное трезвучие', formula: 'root + M3 + P5' },
    { id: 'minor', name: 'Минорное трезвучие', formula: 'root + m3 + P5' }
  ];

  const HARMONY_LEARNING_ITEMS = [
    { id: HARMONY_ITEM_IDS.FUNCTIONS, title: 'Функции I · V · vi · IV' },
    { id: HARMONY_ITEM_IDS.ROOT_SEQUENCE, title: 'Последовательность C · G · Am · F' },
    { id: HARMONY_ITEM_IDS.VOICING_CHOICE, title: 'Плавный переход через G/B' },
    { id: HARMONY_ITEM_IDS.NEXT_CHORD, title: 'Распознавание следующего аккорда' },
    { id: HARMONY_ITEM_IDS.GUIDED_PLAY, title: 'Игра с подсказкой' },
    { id: HARMONY_ITEM_IDS.INDEPENDENT_PLAY, title: 'Самостоятельная игра' },
    { id: HARMONY_ITEM_IDS.MEMORY_PLAY, title: 'Игра по памяти' },
    { id: HARMONY_ITEM_IDS.TRANSFER, title: 'Перенос навыка' },
    { id: HARMONY_ITEM_IDS.COMPLETE, title: 'Модуль завершён' }
  ];

  const HARMONY_REVIEW_ITEMS: { skill: Skill; note: NoteName; title: string }[] = [
    { skill: 'harmonyFunctionIdentify', note: 'I', title: 'Определение функций' },
    { skill: 'harmonyFunctionIdentify', note: 'V', title: 'Определение функций' },
    { skill: 'harmonyFunctionIdentify', note: 'vi', title: 'Определение функций' },
    { skill: 'harmonyFunctionIdentify', note: 'IV', title: 'Определение функций' },
    { skill: 'harmonyNextChord', note: 'I-V-vi-IV', title: 'Следующий аккорд' },
    { skill: 'harmonyProgressionPlay', note: 'C-G/B-Am-F', title: 'Игра последовательности' }
  ];

  function learningLabel(id: string): string {
    const state = learningProgressMap.get(id)?.state;
    return state === 'retention' ? 'Освоено' : state && state !== 'unseen' ? 'В процессе' : 'Не начато';
  }

  function harmonyStatusLabel(): string {
    return harmonyStatus === 'completed' ? 'Модуль завершён' : harmonyStatus === 'in_progress' ? 'В процессе' : 'Доступен после модуля обращений';
  }

  const INVERSION_PROGRESS_ITEMS: {
    skill: Skill;
    note: NoteName;
    title: string;
    subtitle: string;
  }[] = [
    { skill: 'triadInversionBuild', note: 'first', title: 'Первое обращение — построение', subtitle: 'Бас: терция (3 – 5 – 1)' },
    { skill: 'triadInversionBuild', note: 'second', title: 'Второе обращение — построение', subtitle: 'Бас: квинта (5 – 1 – 3)' },
    { skill: 'triadInversionIdentify', note: 'first', title: 'Определение обращения', subtitle: 'Основное / 1-е / 2-е' },
    { skill: 'chordSymbolRead', note: 'root', title: 'Обычные аккордовые обозначения', subtitle: 'C, Cm, Am, F, G' },
    { skill: 'chordSymbolRead', note: 'slash', title: 'Slash-аккорды', subtitle: 'G/B, C/E, Am/C' }
  ];

  function getCard(skill: string, note: string): Card | undefined {
    return cardsMap.get(`${skill}:${note}`);
  }

  function formatMemory(c?: Card) {
    if (!c || c.reps === 0) return { r: '—', s: '—' };
    const r = retrievability(c);
    const s = c.stability ?? 0;
    return {
      r: r == null ? '—' : `${Math.round(r * 100)}%`,
      s: s < 1 ? `${Math.round(s * 24)}ч` : `${Math.round(s)}д`
    };
  }

  function noteProgressPct(note: NoteName): number {
    const f = getCard('find', note);
    const i = getCard('identify', note);
    const cards = [f, i].filter((c): c is Card => !!c && c.reps > 0);
    if (!cards.length) return 0;
    const s = Math.min(...cards.map(c => c.stability || 0));
    return Math.min(100, Math.max(0, Math.round((Math.log10(s + 1) / Math.log10(31)) * 100)));
  }

  let fileInputEl: HTMLInputElement;
</script>

<div class="page-heading">
  <div>
    <h2>Прогресс и память</h2>
    <p>Долговременное состояние памяти по каждой ноте и отдельным навыкам.</p>
  </div>
</div>

<section class="card">
  <h2>Память по нотам <span class="pill">D / S / R</span></h2>
  <div class="memory-grid">
    {#each notes as note (note)}
      {@const f = getCard('find', note)}
      {@const i = getCard('identify', note)}
      {@const n = getCard('notationToKey', note)}
      {@const nb = getCard('notationBassToKey', note)}
      {@const a = getCard('soundToKey', note)}
      {@const fm = formatMemory(f)}
      {@const im = formatMemory(i)}
      {@const nm = formatMemory(n)}
      {@const nbm = formatMemory(nb)}
      {@const am = formatMemory(a)}
      {@const pct = noteProgressPct(note)}
      {@const fmMastery = deriveRetentionMastery(f)}
      {@const imMastery = deriveRetentionMastery(i)}

      <div class="memory-note">
        <div class="head">
          <b>{SHORT_NAMES[note]}</b>
          <span class="status">
            {#if (f?.reps || 0) + (i?.reps || 0) === 0}
              Новая
            {:else if fmMastery === 'stable' && imMastery === 'stable'}
              Стабильно
            {:else if (fmMastery === 'mastered' || fmMastery === 'stable') && (imMastery === 'mastered' || imMastery === 'stable')}
              Освоено
            {:else}
              На закреплении
            {/if}
          </span>
        </div>
        <div class="memory-row"><span>Найти</span><span>R {fm.r} · S {fm.s}</span></div>
        <div class="memory-row"><span>Назвать</span><span>R {im.r} · S {im.s}</span></div>
        {#if n}
          <div class="memory-row"><span>Скрипичный</span><span>R {nm.r} · S {nm.s}</span></div>
        {/if}
        {#if nb}
          <div class="memory-row"><span>Басовый</span><span>R {nbm.r} · S {nbm.s}</span></div>
        {/if}
        {#if a}
          <div class="memory-row"><span>Слух</span><span>R {am.r} · S {am.s}</span></div>
        {/if}
        <div class="meter"><i style="width:{pct}%"></i></div>
      </div>
    {/each}
  </div>

  {#if isGrandStaffComplete}
    <div style="margin-top: 14px; padding: 12px 16px; border-radius: 8px; background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.3); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
      <div>
        <strong style="color: #38bdf8;">Большая система (Grand Staff):</strong> освоено
        <div class="tiny" style="color: var(--text-muted, #94a3b8);">Переключение между скрипичным и басовым ключами включено в ежедневную практику.</div>
      </div>
      <span class="pill" style="background: rgba(34,197,94,0.18); color: #86efac; border: 1px solid rgba(74,222,128,0.4); font-weight: 700;">
        ✓ Перенос активен
      </span>
    </div>
  {/if}

  <section class="card" style="margin-top: 14px;" data-section="interval-progress">
    <h2>Интервалы <span class="pill">Построение и распознавание</span></h2>
    <div class="memory-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
      {#each INTERVAL_PROGRESS_ITEMS as item (item.id)}
        {@const buildCard = getCard('intervalBuild', item.id)}
        {@const idCard = getCard('intervalIdentify', item.id)}
        {@const bm = formatMemory(buildCard)}
        {@const im = formatMemory(idCard)}
        {@const bmMastery = deriveRetentionMastery(buildCard)}
        {@const imMastery = deriveRetentionMastery(idCard)}

        <div class="memory-note" data-interval={item.id}>
          <div class="head">
            <b>{item.name} ({item.id})</b>
            <span class="status">
              {#if (buildCard?.reps || 0) + (idCard?.reps || 0) === 0}
                Не начат
              {:else if bmMastery === 'stable' && imMastery === 'stable'}
                Стабильно
              {:else if (bmMastery === 'mastered' || bmMastery === 'stable') && (imMastery === 'mastered' || imMastery === 'stable')}
                Освоено
              {:else}
                На закреплении
              {/if}
            </span>
          </div>
          <div class="tiny" style="color: var(--text-muted, #94a3b8); margin-bottom: 6px;">{item.semitones} полутонов</div>
          <div class="memory-row"><span>Построение</span><span>R {bm.r} · S {bm.s}</span></div>
          <div class="memory-row"><span>Распознавание</span><span>R {im.r} · S {im.s}</span></div>
        </div>
      {/each}
    </div>
  </section>

  <section class="card" style="margin-top: 14px;" data-section="triad-progress">
    <h2>Трезвучия <span class="pill">Построение и распознавание</span></h2>
    <div class="memory-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
      {#each TRIAD_PROGRESS_ITEMS as item (item.id)}
        {@const buildCard = getCard('triadBuild', item.id)}
        {@const idCard = getCard('triadIdentify', item.id)}
        {@const bm = formatMemory(buildCard)}
        {@const im = formatMemory(idCard)}
        {@const bmMastery = deriveRetentionMastery(buildCard)}
        {@const imMastery = deriveRetentionMastery(idCard)}

        <div class="memory-note" data-triad={item.id}>
          <div class="head">
            <b>{item.name}</b>
            <span class="status">
              {#if (buildCard?.reps || 0) + (idCard?.reps || 0) === 0}
                Не начат
              {:else if bmMastery === 'stable' && imMastery === 'stable'}
                Стабильно
              {:else if (bmMastery === 'mastered' || bmMastery === 'stable') && (imMastery === 'mastered' || imMastery === 'stable')}
                Освоено
              {:else}
                На закреплении
              {/if}
            </span>
          </div>
          <div class="tiny" style="color: var(--text-muted, #94a3b8); margin-bottom: 6px;">{item.formula}</div>
          <div class="memory-row"><span>Построение</span><span>R {bm.r} · S {bm.s}</span></div>
          <div class="memory-row"><span>Распознавание</span><span>R {im.r} · S {im.s}</span></div>
        </div>
      {/each}
    </div>
  </section>

  <section class="card" style="margin-top: 14px;" data-section="inversion-progress">
    <h2>Обращения и аккордовые обозначения <span class="pill">Гармония</span></h2>
    <div class="memory-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
      {#each INVERSION_PROGRESS_ITEMS as item (item.skill + ':' + item.note)}
        {@const card = getCard(item.skill, item.note)}
        {@const mastery = deriveRetentionMastery(card)}

        <div class="memory-note" data-inversion-card={item.skill + ':' + item.note}>
          <div class="head">
            <b>{item.title}</b>
            <span class="status">
              {#if (card?.reps || 0) === 0}
                Не начат
              {:else if mastery === 'stable'}
                Стабильно
              {:else if mastery === 'mastered'}
                Освоено
              {:else}
                На закреплении
              {/if}
            </span>
          </div>
          <div class="tiny" style="color: var(--text-muted, #94a3b8); margin-bottom: 6px;">{item.subtitle}</div>
          <div class="memory-row"><span>Ответов</span><span>{card?.reps || 0}</span></div>
        </div>
      {/each}
    </div>
  </section>

  <section class="card" style="margin-top: 14px;" data-section="harmony-progress">
    <h2>Гармония и сопровождение <span class="pill">C major · I–V–vi–IV</span></h2>
    <p class="tiny" style="color: var(--text-muted, #94a3b8);">{harmonyStatusLabel()} · block chords, без оценки ритма.</p>
    <div class="memory-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
      {#each HARMONY_LEARNING_ITEMS as item (item.id)}
        <div class="memory-note" data-harmony-item={item.id}>
          <div class="head"><b>{item.title}</b><span class="status">{learningLabel(item.id)}</span></div>
        </div>
      {/each}
    </div>
    <div class="memory-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 12px;">
      {#each HARMONY_REVIEW_ITEMS as item (item.skill + ':' + item.note)}
        {@const card = getCard(item.skill, item.note)}
        <div class="memory-note" data-harmony-card={item.skill + ':' + item.note}>
          <div class="head"><b>{item.title}{item.skill === 'harmonyFunctionIdentify' ? ` · ${item.note}` : ''}</b><span class="status">{card?.reps ? `${card.reps} повтор.` : 'Новая карточка'}</span></div>
          <div class="memory-row"><span>Состояние памяти</span><span>{card?.memoryState ?? 'new'}</span></div>
        </div>
      {/each}
    </div>
  </section>

  <div class="footer-row" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
    <div>
      <div class="tiny">Целевая устойчивость памяти: {Math.round((settings.desiredRetention || 0.9) * 100)}% · история ответов: {reviewLogLength} событий.</div>
      <div class="tiny audio-credit">Piano samples: Salamander Grand Piano (Yamaha C5), Alexander Holm · CC BY 3.0.</div>
    </div>
    <div class="footer-actions" style="display: flex; gap: 8px;">
      <button type="button" class="btn" onclick={() => onExport?.()}>Экспорт</button>
      <button type="button" class="btn" onclick={() => fileInputEl?.click()}>Импорт</button>
      <button type="button" class="btn warn" onclick={() => onReset?.()}>Сброс</button>
      <input
        type="file"
        accept="application/json,.json"
        style="display:none"
        bind:this={fileInputEl}
        onchange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) onImport?.(file);
        }}
      />
    </div>
  </div>
</section>
