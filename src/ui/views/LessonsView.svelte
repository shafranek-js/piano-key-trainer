<script lang="ts">
  import { LESSONS, type LessonDef } from '../../core/lessons/lessonsData';
  import type { LessonProgressRecord } from '../../storage/db';

  let {
    lessonProgressMap = new Map<string, LessonProgressRecord>(),
    onStartLesson
  } = $props();

  function isUnlocked(index: number): boolean {
    if (index === 0) return true;
    const prev = LESSONS[index - 1];
    const prevProg = lessonProgressMap.get(prev.id);
    return !!prevProg?.completed;
  }
</script>

<div class="page-heading">
  <div>
    <h2>Guided Lessons</h2>
    <p>Короткие мини-уроки ведут от географии клавиатуры к чёрным клавишам, октавам, нотному стану, слуху и позициям рук.</p>
  </div>
</div>

<section class="card">
  <h2>Маршрут обучения <span class="pill">10 уроков</span></h2>
  <div class="lesson-grid">
    {#each LESSONS as lesson, idx (lesson.id)}
      {@const prog = lessonProgressMap.get(lesson.id)}
      {@const unlocked = isUnlocked(idx)}
      {@const completed = !!prog?.completed}
      {@const currentStep = prog?.currentStep ?? 0}
      {@const pct = completed ? 100 : Math.round((currentStep / Math.max(lesson.steps.length - 1, 1)) * 100)}

      <article class="lesson-card {completed ? 'done' : ''} {!unlocked ? 'locked' : ''}">
        <small>{lesson.tag}</small>
        <h3>{lesson.title}</h3>
        <p>{lesson.summary}</p>
        <div class="lesson-meta">
          <span class="lesson-badge">{!unlocked ? '🔒 Закрыт' : completed ? '✓ Пройден' : prog?.startedAt ? 'В процессе' : 'Доступен'}</span>
          <span>{pct}%</span>
        </div>
        <button
          type="button"
          class="btn {completed ? '' : 'primary'}"
          disabled={!unlocked}
          onclick={() => onStartLesson?.(lesson.id)}
        >
          {!unlocked ? 'Сначала предыдущий урок' : completed ? 'Пройти ещё раз' : prog?.startedAt ? 'Продолжить урок' : 'Начать урок'}
        </button>
      </article>
    {/each}
  </div>

  <div class="lesson-panel" style="margin-top: 16px;">
    <h3>Как это работает</h3>
    <p>Каждый урок — это короткая цепочка: объяснение $\rightarrow$ одна маленькая проверка $\rightarrow$ следующий шаг. Выполнение уроков сохраняется отдельно и не ломает интервальные повторения FSRS.</p>
  </div>
</section>
