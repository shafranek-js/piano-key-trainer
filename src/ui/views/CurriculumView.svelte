<script lang="ts">
  import type { CurriculumPhase } from '../../core/curriculum/curriculum';

  let {
    phases = [] as CurriculumPhase[]
  } = $props();

  const current = $derived(phases.find(p => p.open && !p.done && !p.skipped) || phases[phases.length - 1]);
</script>

<div class="page-heading">
  <div>
    <h2>Учебная программа</h2>
    <p>Пошаговое развитие от ориентиров клавиатуры до чтения нот и слуха.</p>
  </div>
</div>

<section class="card" id="curriculumCard">
  <h2>Учебная программа <span class="pill">Stability + Sessions</span></h2>
  <div class="curriculum-summary">
    {#if current?.done}
      Все этапы текущего уровня закреплены; FSRS продолжит редкие maintenance reviews.
    {:else if current}
      Текущий этап: <strong>{current.title} · {current.detail}</strong>. Для перехода дальше нужны $\ge 2$ успешных scheduled-review в разных сессиях и Stability $\ge 3$ дней для требуемых карточек.
    {/if}
  </div>

  <div class="curriculum-grid" style="margin-top: 14px;">
    {#each phases as p (p.id)}
      <div class="curr-phase {p.done ? 'done' : !p.open ? 'locked' : 'current'}">
        <small>{p.title}</small>
        <b>{p.detail}</b>
        <div class="curr-state">
          {p.skipped ? 'пропущено' : p.done ? '✓ закреплено' : p.open ? 'сейчас' : '🔒 закрыто'}
        </div>
      </div>
    {/each}
  </div>
</section>

<section class="card" style="margin-top: 14px;">
  <h2>Чтение нот <span class="pill">Скрипичный ключ</span></h2>
  <div class="help">
    <strong>Навык:</strong> нота на стане $\rightarrow$ точная клавиша и октава. В Smart FSRS открывается после закрепления географии клавиатуры. Текущий базовый диапазон: <strong>C4–B4</strong>.
  </div>
</section>

<section class="card" style="margin-top: 14px;">
  <h2>Слух $\rightarrow$ клавиша <span class="pill">Относительный слух</span></h2>
  <div class="help">
    Чтобы не требовать абсолютного слуха, сначала звучит <strong>опорная C4</strong>, затем целевая нота C4–B4. Нужно нажать точную клавишу на фортепиано.
  </div>
</section>
