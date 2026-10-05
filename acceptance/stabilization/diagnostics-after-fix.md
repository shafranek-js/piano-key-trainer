# Реальная диагностика после исправлений

Источник: пользовательский экспорт от 2026-10-02T21:57:37.065Z; в этом файле обработаны все 66 экспортированных карточек и последние 300 ReviewLog событий.

Экспорт содержит 24 новых карточек с sentinel dueAt = 0 и 36 конечных дробных dueAt. При повторной классификации: 0 карточек due, 0 overdue, 0 некорректных dueAt и 0 новых карточек ошибочно отмечены overdue.

Исторические предупреждения не удалялись и не переписывались: анализ ReviewLog выявил 4 всплесков и 4 подозрительных событий из более ранних сессий в доступном окне из 300 событий. Исходное summary: Курс: 6/6 базовых фаз завершено. Активных FSRS карточек: 66 (24 к повторению). Проведено 91 сессий. Обнаружено потенциальных предупреждений: 28. Сам экспорт ограничивает ReviewLog последними 300 событиями.

Ограничения восстановления: диагностический JSON не содержит исходные настройки пользователя и полную историю ReviewLog. Для повторного расчёта использованы настройки приложения по умолчанию; агрегаты по сессиям и журналу относятся только к экспортированному окну. Исходный JSON и локальная база обучения не изменялись.

# Диагностический отчёт Piano Key Trainer
*Экспортировано:* 2026-10-02T21:57:37.065Z
*Версия приложения:* Piano Key Trainer v6.2.0 (Схема: v1)
*Платформа:* Win32 | 1920x925

## 1. Сводка состояния
- **Прогресс базового курса:** 0 / 6 фаз (0%)
- **Текущая фаза:** 1 · Ориентиры
- **FSRS карточки:** 66 всего, **0** due, **0** overdue
- **Сессий с ReviewLog:** 42 всего
- **Недавних сессий в этом отчёте:** 10 (лимит 10)

### ⚠️ Предупреждения и потенциальные проблемы (13):
- Заторможенный навык: soundToKey (Навык забывался 16 раз(а) (lapses >= 3))
- Заторможенный навык: find (Навык забывался 30 раз(а) (lapses >= 3))
- Заторможенный навык: identify (Навык забывался 5 раз(а) (lapses >= 3))
- duplicateReviewBurst: Possible duplicate input processing: 13 events in <=50 ms across 13 sessions (from 2026-10-02T06:27:16.990Z).
- duplicateReviewBurst: Possible duplicate input processing: 3 events in <=50 ms across 3 sessions (from 2026-10-02T06:27:33.343Z).
- duplicateReviewBurst: Possible duplicate input processing: 4 events in <=50 ms across 4 sessions (from 2026-10-02T06:27:42.093Z).
- duplicateReviewBurst: Possible duplicate input processing: 4 events in <=50 ms across 4 sessions (from 2026-10-02T06:27:45.637Z).
- staleSessionHandlerSuspected: Session session-1790922334575-34 has 15 event(s) after session-1790921916873-8 began producing review events; stale handler suspected.
- staleSessionHandlerSuspected: Session session-1790922277672-24 has 1 event(s) after session-1790922293658-28 began producing review events; stale handler suspected.
- staleSessionHandlerSuspected: Session session-1790922293658-28 has 2 event(s) after session-1790922305557-30 began producing review events; stale handler suspected.
- staleSessionHandlerSuspected: Session session-1790922305557-30 has 2 event(s) after session-1790922323785-32 began producing review events; stale handler suspected.
- availabilityMismatch: intervals: UI availability true, resolved availability false
- excessiveSkillStreak: Same skill repeated 7 times consecutively in recent Balanced tasks

## 2. Учебный план (Curriculum State)
| Фаза | Название | Статус | Raw завершение | Нормализованное завершение | Требования | Причина нормализации |
| --- | --- | --- | --- | --- | --- | --- |
| anchors | 1 · Ориентиры | 🔄 Текущая | нет | нет | 0/3 | — |
| neighbors | 2 · Соседи | 🔒 Закрыта | нет | нет | 0/5 | — |
| remaining | 3 · Белые | 🔒 Закрыта | нет | нет | 0/3 | — |
| black | 4 · Чёрные | 🔒 Закрыта | нет | нет | 2/2 | — |
| notation | 5 · Нотный стан | 🔒 Закрыта | нет | нет | 2/2 | — |
| sound | 6 · Слух | 🔒 Закрыта | нет | нет | 2/2 | — |

### Продвинутые модули:
- **Басовый ключ и акколада (Milestone 3F)**: 🔄 В процессе; можно начать: да
- **Интервалы на клавиатуре (Milestone 3G)**: 🔒 Закрыт; можно начать: нет
- **Мажорные и минорные трезвучия (Milestone 3H)**: 🔒 Закрыт; можно начать: нет
- **Обращения аккордов и буквенные обозначения (Milestone 3I)**: 🔒 Закрыт; можно начать: нет

## 3. Flashcards & FSRS метрики
Распределение карточек по навыкам:
- **chordSymbolRead**: 1 карточек
- **find**: 12 карточек
- **identify**: 12 карточек
- **intervalBuild**: 4 карточек
- **intervalIdentify**: 4 карточек
- **notationBassToKey**: 7 карточек
- **notationToKey**: 7 карточек
- **patternIdentify**: 4 карточек
- **soundToKey**: 7 карточек
- **triadBuild**: 2 карточек
- **triadIdentify**: 2 карточек
- **triadInversionBuild**: 3 карточек
- **triadInversionIdentify**: 1 карточек

## 4. Заторы и проблемные навыки (Learning Bottlenecks)
### 🛑 Заторможенные навыки:
- **soundToKey**: попыток: 202, точность 1-й попытки: 75%, срывов (lapses): 16. Навык забывался 16 раз(а) (lapses >= 3)
- **find**: попыток: 47, точность 1-й попытки: 91%, срывов (lapses): 30. Навык забывался 30 раз(а) (lapses >= 3)
- **identify**: попыток: 51, точность 1-й попытки: 100%, срывов (lapses): 5. Навык забывался 5 раз(а) (lapses >= 3)

### Карточки с наибольшим числом срывов:
- find:C (29 срывов)
- soundToKey:G (6 срывов)
- soundToKey:F (4 срывов)
- soundToKey:A (3 срывов)
- identify:F# (2 срывов)

## 5. Daily Practice и разнообразие заданий
- **Последние задания:** 50
- **Уникальных навыков в сессии:** 2
- **Макс. серия одного навыка подряд:** 7
- **Макс. серия одной карточки подряд:** 4

## 6. Проверка целостности данных
- Дубликатов карточек: 0
- Карточек с некорректными датами: 0
- Событий с некорректным временем: 0
- Неизвестных навыков: 0
- Рассинхронизаций программы: 0
- Всплесков ReviewLog с разными сессиями: 4
- Подозрительных ответов после начала другой сессии: 4
- Новых карточек, отмеченных overdue: 0
- Расхождений завершения модулей: 0
- Расхождений доступности модулей: 1
- Предупреждений о доминировании fallback: 0
- Серий навыков длиннее двух: 1
- Применённых нормализаций программы: 0

---
*Отчёт сгенерирован автоматически локальной подсистемой диагностики Piano Key Trainer.*
