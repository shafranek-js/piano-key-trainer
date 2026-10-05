<script lang="ts">
  import type {
    RepertoireCategoryFilter,
    RepertoireSortMode,
    RepertoireViewMode
  } from '../repertoire/repertoireLibraryUi';

  let {
    selectedCategory = 'all' as RepertoireCategoryFilter,
    categoryCounts = { all: 0, classical: 0, melody: 0, study: 0, warmup: 0 },
    searchQuery = '',
    sortBy = 'recommended' as RepertoireSortMode,
    viewMode = 'grid' as RepertoireViewMode,
    onCategoryChange,
    onSearchChange,
    onSortChange,
    onViewModeChange
  }: {
    selectedCategory: RepertoireCategoryFilter;
    categoryCounts: Record<RepertoireCategoryFilter, number>;
    searchQuery: string;
    sortBy: RepertoireSortMode;
    viewMode: RepertoireViewMode;
    onCategoryChange: (cat: RepertoireCategoryFilter) => void;
    onSearchChange: (q: string) => void;
    onSortChange: (sort: RepertoireSortMode) => void;
    onViewModeChange: (mode: RepertoireViewMode) => void;
  } = $props();

  const categories: { id: RepertoireCategoryFilter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'classical', label: 'Классика' },
    { id: 'melody', label: 'Мелодии и фолк' },
    { id: 'study', label: 'Этюды' },
    { id: 'warmup', label: 'Разминка' }
  ];
</script>

<div class="rep-toolbar" role="region" aria-label="Фильтры и поиск по библиотеке мелодий">
  <div class="rep-filter-pills" role="group" aria-label="Категории произведений">
    {#each categories as cat (cat.id)}
      <button
        type="button"
        class="rep-filter-pill {selectedCategory === cat.id ? 'active' : ''}"
        aria-pressed={selectedCategory === cat.id}
        data-category-filter={cat.id}
        onclick={() => onCategoryChange(cat.id)}
      >
        <span class="rep-filter-label">{cat.label}</span>
        <span class="rep-filter-count">{categoryCounts[cat.id]}</span>
      </button>
    {/each}
  </div>

  <span class="rep-toolbar-sep" aria-hidden="true"></span>

  <div class="rep-search-box">
    <svg
      class="rep-search-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input
      type="search"
      class="rep-search-input"
      placeholder="Поиск по мелодиям…"
      aria-label="Поиск по мелодиям, композиторам и категориям"
      value={searchQuery}
      oninput={(e) => onSearchChange((e.currentTarget as HTMLInputElement).value)}
    />
    {#if searchQuery.trim().length > 0}
      <button
        type="button"
        class="rep-search-clear"
        aria-label="Очистить поиск"
        title="Очистить поиск"
        onclick={() => onSearchChange('')}
      >
        ✕
      </button>
    {/if}
  </div>

  <div class="rep-toolbar-right">
    <label class="rep-sort-control">
      <span class="rep-sort-label">Сортировка:</span>
      <select
        class="rep-sort-select"
        aria-label="Сортировка мелодий"
        value={sortBy}
        onchange={(e) => onSortChange((e.currentTarget as HTMLSelectElement).value as RepertoireSortMode)}
      >
        <option value="recommended">Рекомендуемые</option>
        <option value="difficulty">По сложности</option>
        <option value="title">По названию</option>
        <option value="composer">По композитору</option>
      </select>
    </label>

    <div class="rep-view-toggle" role="group" aria-label="Режим отображения библиотеки">
      <button
        type="button"
        class="rep-view-btn {viewMode === 'grid' ? 'active' : ''}"
        aria-pressed={viewMode === 'grid'}
        data-view-mode="grid"
        onclick={() => onViewModeChange('grid')}
        title="Отображение карточками (Сетка)"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1.3" />
          <rect x="9" y="1" width="6" height="6" rx="1.3" />
          <rect x="1" y="9" width="6" height="6" rx="1.3" />
          <rect x="9" y="9" width="6" height="6" rx="1.3" />
        </svg>
        <span>Сетка</span>
      </button>
      <button
        type="button"
        class="rep-view-btn {viewMode === 'compact' ? 'active' : ''}"
        aria-pressed={viewMode === 'compact'}
        data-view-mode="compact"
        onclick={() => onViewModeChange('compact')}
        title="Компактный список"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="1" y="2" width="14" height="2.6" rx="1" />
          <rect x="1" y="6.7" width="14" height="2.6" rx="1" />
          <rect x="1" y="11.4" width="14" height="2.6" rx="1" />
        </svg>
        <span>Список</span>
      </button>
    </div>
  </div>
</div>
