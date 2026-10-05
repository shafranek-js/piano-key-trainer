# Аудит кодовой базы Piano Key Trainer

**Версия приложения:** 6.2.0 (`package.json`, `src/core/version.ts`)
**Дата аудита:** 2026-10-05
**Состояние:** working tree (последний коммит `005cd4e` — старое репертуарное изменение; 59 tracked / 264 untracked / ~40 modified)
**Метод:** статический read-only аудит пятью параллельными агентами (FSRS/хранилище, learning-домен, UI/App.svelte, тесты/релиз, audio/repertoire) + инструментальные прогоны: `tsc --noEmit`, `svelte-check`, `vitest run`, git-инспекция, `npm audit`, проверка скриптов и allowlist'ов. Runtime-репро в браузере не выполнялось.

**Легенда:** `[C]` — подтверждено кодом/инструментом; `[S]` — suspected (требует репро).

---

## 0. Резюме для оркестратора

Приложение функционально богатое (милестоуны 3A–3J + недоделанный M3K «Chord Rhythm»), но **текущее состояние не принимается**: `npm run verify` красный, новый модуль ритма может навсегда заблокировать тренировку, почти весь код не закоммичен, а документация утверждает обратное реальности.

| Приоритет | Кол-во | Суть |
|---|---|---|
| **P0** | 2 | Красный `verify` (7 ошибок svelte-check + 2 упавших теста); M3K блокирует `nextRound` без выхода из модуля |
| **P1** | 9+1 | Терминальные тупики M3K, невалидируемый импорт бэкапа/XSS, потеря snapshots при импорте, расхождение FSRS-политики retry, lifecycle модулей, битые скрипты упаковки, scope-конфликт M3K, отсутствие тестов M3K |
| **P2** | ~20 | Безопасность/целостность хранилища, sticky-ошибки сохранения, баги клавиатуры и a11y, аудио/MIDI, MusicXML, детерминизм, отсутствие CI/lint |
| **P3** | ~25 | Мёртвый код, дрейф документации, небезопасные касты, legacy-хвосты |

**Системные темы:**
1. Дублирование state-machine логики по 6+ модулям с расхождениями (delayed-check remediation, transfer-persistence, reload restore).
2. `App.svelte` — god-object на 6 446 строк.
3. Персистентность реализована 4 несовместимыми схемами.
4. Нет CI/lint/покрытия; проверки держатся только на локальном `verify`, который сейчас красный.
5. 264 untracked файла — риск потери всей работы.

---

## 1. Состояние репозитория и гейтов

| Проверка | Результат |
|---|---|
| `tsc --noEmit` | ✅ чисто |
| `npm run check:svelte` | ❌ **7 ошибок, 0 warnings** |
| `npm test` | ❌ **441 passed / 2 failed** (443) в 23 файлах |
| `npm run build` | не перепроверялся; последнее зелёное доказательство — до M3K |
| Git | 59 tracked / **264 untracked** / ~40 modified; весь FSRS/learning/M3x-код не закоммичен |
| CI / lint / format | отсутствуют (`.github` нет, ESLint/Prettier нет, coverage нет) |
| Артефакты | 6 ZIP (~10,2 МБ) + `acceptance/` ~40 МБ untracked; `.gitignore` не содержит `*.zip`, `diagnostics-*`, `acceptance/` |
| Версия 6.2.0 | согласована между `package.json`, `package-lock.json`, `version.ts`, README, handoff |
| `npm audit --omit=dev` | 0; полный — 2 moderate (dev-only, `@vitest/mocker`, GHSA-82fw-gwwq-j7x9) |

### 1.1 Ошибки `svelte-check` `[C]`

| Файл:строка | Ошибка |
|---|---|
| `src/App.svelte:147` | `getRhythmAssessmentLength` объявлен, не используется |
| `src/App.svelte:149` | `rhythmStrikeCount` объявлен, не используется |
| `src/App.svelte:157` | тип `RhythmAssessmentState` не используется |
| `src/App.svelte:483` | `rhythmInputMethod` не читается |
| `src/App.svelte:3248` | тип: `readonly number[]` из `rhythmSnapshotFor` (`as const`) не присваивается мутабельному `chordRhythmSnapshot` (`src/core/learning/types.ts:102-116`) |
| `src/App.svelte:3368` | `returnFromChordRhythmFailure` не используется (при этом должен вызываться — см. P1-1) |
| `src/ui/components/ChordRhythmStage.svelte:17` | prop `onToggleKey` не используется |

`tsc` не видит Svelte-контракты (`tsconfig.json:25` не включает компоненты), поэтому ошибка `3248` живёт только в `svelte-check`.

### 1.2 Упавшие тесты `[C]`

`tests/unit/learningRoadmap.test.ts:36` ожидает 10 этапов, `:55-57` — 5 доп. модулей; код (`src/core/curriculum/learningRoadmap.ts:14,152-160`) содержит 11 этапов / 6 модулей (`chord_rhythm`).

---

## 2. P0 — блокеры приёмки

### P0-1. Красный quality gate `[C]`
`verify = typecheck && check:svelte && test && build` падает на `check:svelte` и `test`. Любая приёмка/релиз/упаковка формально невозможны.

### P0-2. M3K Chord Rhythm блокирует приложение и не имеет выхода `[C]`
- `nextRound()` выходит сразу, пока `chordRhythmState !== null` — `src/App.svelte:1589`.
- Завершение модуля даёт `step: 'moduleComplete'`, в UI только текст без кнопки выхода — `src/ui/components/ChordRhythmStage.svelte:109-112`; нигде в коде нет `chordRhythmState = null`.
- Повторный вход возвращает на тот же `moduleComplete` (`src/core/learning/chordRhythm.ts:253-259`).
- Стартовые обработчики модулей не чистят все sibling-состояния (`App.svelte:2600-2618, 2738-2756, 2851-2876, 2980-3002, 3128-3145`): отображение и маршрутизация ввода расходятся.

**Итог:** после завершения модуля тренировка мертва до перезагрузки страницы.

---

## 3. P1 — исправить до приёмки

| ID | Файл:строка | Суть | Статус |
|---|---|---|---|
| P1-1 | `App.svelte:3368, 3409, 6005-6008`; `ChordRhythmStage.svelte:106-108`; `chordRhythm.ts:206-208, 346-354` | «Вернуться к учебным шагам» — мёртвая кнопка: `onRetry` → `startChordRhythmRun()`, который early-return на `transferResult`; `returnFromChordRhythmFailure` не вызывается. Ветка `startRemediation` (`blockKind='initial'`, `remediationUsed>=3`) уходит в `phase='result'`, где `finishRemediationItem` не может продвинуться — логический дедлок | `[C]` |
| P1-2 | `types.ts:102-116`; `App.svelte:3221-3237`; `chordRhythm.ts:251` | `pendingCorrective` и `scoredQuestionIds` не персистятся: reload в corrective-фазе засчитывает следующую попытку как новый first attempt, завышая `trialsCompleted`/`correctFirstAttempts` | `[C]` |
| P1-3 | `App.svelte:341-345, 6288-6295`; `inputPolicy.ts:167-172`; `TaskStage.svelte:103` | **Stored XSS**: карточки из бэкапа не валидируются, `patternIdentify` интерполирует `card.note` в `{@html promptText}`. Импорт доступен и из ProgressView | `[C]` |
| P1-4 | `App.svelte:330-368` vs `1988-2028` | Импорт бэкапа: `clear()` до валидации, не в транзакции, не ждёт `reviewPersistenceQueue`; нет проверки формата/версии → частичная потеря и перемешивание данных, race с in-flight commit | `[C]` |
| P1-5 | `src/core/learning/progress.ts:256-299` | `normalizeBackupLearningProgress` теряет `harmonySnapshot` и `chordRhythmSnapshot` → импорт сбрасывает позицию в модулях | `[C]` |
| P1-6 | `curriculumFlow.ts:3386-3395`; `curriculum3d.ts:2160, 2734` vs `bassGrandStaff.ts:1299`; `intervals.ts:1372,1574,1861,1976`; `triads.ts:1515,1862`; `Handoff.md:414,459,520` | Расхождение FSRS-политики delayed-check retry: bass/intervals/triads не грейдят повтор (0 мутаций), white-key/3D грейдят каждый H0-retry. Документация декларирует «0 additional mutations» | `[C]` |
| P1-7 | `curriculumFlow.ts:1747-1750`; `firstRunCf.ts:1034-1045, 2329-2357` | Восстановление remediation после reload расходится между модулями; `firstRunCf` не пишет `pending:*` вообще, проваленный anchor может остаться `mixReady` → повторный онбординг | `[C]` |
| P1-8 | `src/core/curriculum/learningRoadmap.ts:367-370` | При полностью завершённой карте `currentStageId` остаётся `harmony`: ветка `chord_rhythm === 'completed'` недостижима | `[C]` |
| P1-9 | `scripts/buildStabilizationRev1Archive.mjs:19-20`; `buildStabilizationRev2Archive.mjs:19-20,34` | Скрипты упаковки Stabilization ссылаются на несуществующие отчёты/probe-файл — ZIP из `STABILIZATION_REV2_REPORT.md:63` невоспроизводим | `[C]` |
| P1-10 | `chordRhythm.ts` (весь, 426 строк) | Модуль глубоко вшит в scheduler/dailyPractice/App (`queue.ts:27-29,170-195`, `dailyPractice.ts:205,645`, `curriculumFlow.ts:617`, `inputPolicy.ts:131-137`, `fsrs/constants.ts:146-148`), но не имеет ни unit-тестов, ни smoke | `[C]` |

### 3.1 Scope-конфликт M3K `[C]`
Код M3K (`types.ts:101`, `App.svelte:3340, 5997` `data-testid="m3k-module-stage"`) противоречит явным границам остановки: `Piano_Key_Trainer_Roadmap.md:31-36` («Rhythm scoring… remain future work»), `Piano_Key_Trainer_Developer_Handoff.md:612` («Do not begin rhythm-scored accompaniment…»), `M3J_REV1_REPORT.md:45` («No next milestone was started»), `acceptance/m3j/README.md:3`.

---

## 4. P2 — плановая стабилизация

### 4.1 FSRS и персистентность
| Файл:строка | Находка | Статус |
|---|---|---|
| `fsrs6.ts:137,151-157` | Short-term формула выбирается по `memoryState`, а не по `elapsed < 1 day` (как в эталоне py-fsrs): `relearning`-карта, вернувшаяся через ≥1 день, получает заниженный интервал, и наоборот | `[C]` алгоритмическое отклонение |
| `latencyGrading.ts:16-25` | В P30/P85 попадают non-FSRS события; для intervals/triads/bass в логи пишется фиктивная `responseMs: 1200/800` (`bassGrandStaff.ts:1413,1488`; `intervals.ts:1408,1612,1897,2014`; `triads.ts:1594,1657,1917,1977`) → Hard/Easy для этих скиллов недостижимы, пороги остальных смещены | `[C]` |
| `db.ts:57`; `reviewPersistence.ts:30-34`; `App.svelte:1999-2006` | `reviewLogs` PK = `ts`: два отзыва в одну миллисекунду бросают `ConstraintError`, событие теряется | `[C]` |
| `App.svelte:2017, 1604-1610` | `reviewPersistenceFailed` залипает навсегда (нет ни сброса в `startLearningSession`, ни retry) → transient-ошибка IndexedDB блокирует практику до reload | `[C]` |
| `App.svelte:1174, 4090` | Fire-and-forget `db.coldTests.put` / `db.lessonProgress.put` без `catch`; `lessonProgressMap` мутируется как обычный Map (не реактивно в Svelte 5) | `[C]` |
| `migrator.ts:10-22, 80` | Флаг миграции ставится после всех шагов, localStorage не чистится: при частичном сбое устаревшие данные перезаписывают новые при каждом запуске | `[C]` |
| `curriculum.ts:45`; `queue.ts:128` | `card.stats` без guard: card без `stats` из импорта/легаси роняет derived UI | `[C]` |
| `App.svelte:285-295, 338-340`; `math.ts:1-3`; `fsrs6.ts:99-105` | Нет нормализации чисел settings/cards → `clamp(NaN)=NaN`, `dueAt=NaN`, «вечно нерасписанные» карточки, `scheduledDays: NaN` в логе | `[C]` |
| `App.svelte:298-328 vs 6278-6295` | Два несовместимых формата бэкапа: второй (ProgressView) импортирует только `state.cards`, без очистки/валидации/настроек/логов | `[C]` |
| `fsrs6.ts:24, 32, 99-105` | Микродевиации от эталона: floor начальной стабильности 0.01 вместо 0.001; mean-reversion target по клампнутому `initialDifficulty(4)`; дробные интервалы | `[C]`, влияние малое |
| `queue.ts:120-123` | `choosePractice` fallback возвращает неинтердуцированную карту вопреки собственному комментарию | `[C]` |
| `queue.ts:7-8` | `rankNew` через `as any` + `LEARN_ORDER.indexOf`: интервалы/трезвучия получают −1 и сортируются перед `C` (митигируется curriculum-гейтом) | `[C]` |

### 4.2 UI / ввод (пользовательские баги)
| Файл:строка | Находка | Статус |
|---|---|---|
| `App.svelte:5030, 5263` | Блоки модулей обрабатывают клавиши до проверки `activePage !== 'practice'`: горячие клавиши меняют скрытое состояние на других страницах | `[C]` |
| `App.svelte:5253-5260` | Нет `e.repeat`: удержание Enter мгновенно помечает следующий вопрос как «Не знаю» (lapse) | `[C]` |
| `App.svelte:1156, 5030, 5194, 5254` | После `endPracticeSession` обработчики Escape/Space/Enter недостижимы; модалка итогов не имеет keydown | `[C]` |
| `App.svelte:5253`; `TaskStage.svelte:233-270` | Глобальный `preventDefault` на Enter ломает активацию сфокусированных кнопок ответа (a11y) | `[C]` |
| `App.svelte:5917-6059` vs `6060` | `isSessionEnded` затенён активными модулями; `dispatchInterval/Triad/InversionAction` без проверки активной сессии — прогресс пишется после конца сеанса | `[C]` |
| `App.svelte:476-477, 5533-5559` | `rhythmClock`/`rhythmDeadlineTimer` не останавливаются при unmount и смене страницы; `MetronomeClock.stop()` (`:76-81`) не отменяет уже запланированные клики | `[C]` |
| `App.svelte:3248-3268` | `persistChordRhythmState` присваивает состояние только после IndexedDB-записи (stale UI, гонки), в отличие от Harmony-очереди (`3153-3156`) | `[C]` |
| `App.svelte:1528-1532, 3424`; `chordRhythm.ts:368-372, 293-294` | Суточный `chordRhythmPattern` фактически с одним ударом: `pulse`/`change`/`pattern` в Daily Practice ведут себя одинаково | `[C]` |
| `dailyPractice.ts:614, 623` | `resolveCardVisualConfig` по умолчанию `Math.random` → выбор ключа Grand Staff недетерминирован вопреки докам | `[C]` |
| `dailyPractice.ts:477-484, 1095-1096` | Transfer-ротация вырождается при `len % 3 === 0` (индекс всегда один и тот же) | `[C]` |
| `App.svelte:5524-5529` | Глобальный debug-хук `window.__openSessionSummary` не удаляется | `[C]` |
| `app.css:860, 869` vs `:72` | `.white-key.hint z-index:6` выше соседних чёрных клавиш (focus-инвариант не нарушен, но геометрия рискует) | `[S]` |
| `App.svelte:1556, 1846-1884, 4039-4042, 4666-4700` | ~40 непронумерованных `setTimeout` с побочками на состояние вопроса; поздние колбэки могут мутировать следующий вопрос | `[C]`, влияние варьируется |
| `chordRhythm.ts:246-262`; `progress.ts:294` | Type-unsafe restore: `stage as ChordRhythmStep`, `phase as ...`, `(snapshot as any).sequenceIndex`, `currentHintLevel as HintLevel` без валидации | `[C]` |

### 4.3 Audio / MIDI / Repertoire
| Файл:строка | Находка | Статус |
|---|---|---|
| `AudioEngine.ts:125-151` | Падение одного сэмпла делает `isReady=false` → весь инструмент молчит (синтез-fallback запрещён by design); каждый повторный клик снова тянет все 17 файлов без backoff | `[C]` |
| `MidiController.ts:39-40, 95-113` | Отключение MIDI-устройства при зажатой ноте оставляет залипшие `heldNotes`/визуальную подсветку и latch аккордовых трекеров; нет `disconnect()` | `[C]` |
| `musicXmlGenerator.ts:899-929` | `.mxl` без лимитов размера/распаковки (zip-bomb/DoS) | `[C]` |
| `musicXmlGenerator.ts:840` | Молчаливое усечение импорта на 512 нотах без предупреждения | `[C]` |
| `musicXmlGenerator.ts:575-581` | Двойное экранирование XML-сущностей (`&amp;` → `&amp;amp;`) в титулах/композиторах | `[C]` |
| `musicXmlGenerator.ts:21-47, 158-187` | Триоли/32-е квантуются к ¼-бита: OSMD-курсор и аудио расходятся для импортированных партитур | `[C]` |
| `RepertoireView.svelte:138` | Мутация `readonly REPERTOIRE` + `custom-${Date.now()}` ID: коллизия при двух импортах в одну мс → crash keyed `{#each}`; импорт не персистится | `[C]`/`[S]` |
| `Staff.svelte:279-281` | Ошибки OSMD только в console — стан пустой без фидбека | `[C]` |
| `Staff.svelte:211-254` | Старый OSMD-инстанс не `clear()`-ится при смене режима (утечка) | `[S]` |
| `Staff.svelte:89-96` | До 3 полных перестроек мер по каждому курсору (нет мемоизации; `cursorStepByNote` не заполняется) | `[C]` |
| `MetronomeClock.ts:56-72` | `beats=0` оставляет `isRunning=true`; `stop()` не отменяет запланированные клики | `[C]` |
| `Keyboard.svelte:85-89` | Отслеживается только `window.resize`: изменение ширины родителя (rail/drawer) не пересчитывает клавиши | `[C]` |
| `SongBanner.svelte:71` | `{@html subtitle}` — сейчас только внутренние строки, латентный XSS-риск | `[C]` |
| `earTrainingData.ts:85-114` | Demo-плейбек на `setTimeout` не отменяется при выходе с экрана | `[C]` |
| `repertoireData.ts:1533-1534` | `DEFAULT_BPM_BY_SONG_ID` расходится с per-song `defaultBpm` (Vivaldi 108 vs 100, Dvořák 64 vs 56) | `[C]` |

### 4.4 Тесты и инфраструктура
| Файл | Находка | Статус |
|---|---|---|
| `tests/**` | 0 unit-тестов для `AudioEngine`, `MidiController`, `MetronomeClock` (при наличии порта для инъекции), `storage/migrator.ts`, `App.svelte`/компонентов | `[C]` |
| `tests/unit/regression.test.ts:60-87` | Тавтологичные тесты: локальный closure и повтор формулы вместо продакшн-кода | `[C]` |
| `tests/unit/scheduler.test.ts:133-186` | Тесты наличия данных repertoire/ear/lesson не относятся к scheduler (дублируют `repertoire.test.ts`) | `[C]` |
| `tests/unit/schedulerIntegrity.test.ts:61-65` | Ассерты на порядок глобальных артефактов (`'activation-1'`, `'activation-2'`) — implementation detail | `[C]` |
| `tests/unit/reviewPersistence.test.ts:60-88` | Частично дублирует FSRS-семантику first-attempt из `fsrs.test.ts:336-402` | `[C]` |
| `tsconfig.json:25` | `vite.config.ts` и `scripts/*.ts` вне проверки типов; нет `noUncheckedIndexedAccess` | `[C]` |
| repo | Нет CI (`.github`), ESLint/Prettier, coverage-конфига, lint/format-скриптов | `[C]` |
| `scripts/reprocessDiagnosticExport.mjs:7` | Личный путь `C:/Users/pavel/Downloads/...`; 7 скриптов не подключены к `package.json` | `[C]` |
| `repertoireAudit.ts:280-287` | `validateEntireRepertoireLibrary` вызывается только из тестов, не в runtime | `[C]` |

---

## 5. P3 — техдолг

### 5.1 Мёртвый код и legacy
- `isFsrsAffectingKind` (`reviewLog.ts:51`), `safeNumber` (`math.ts:5`), поля `completionAttempts`/`earlyPractice`/`correctedAt` (`types.ts:118,128,129`).
- `getHeldNotes` (`MidiController.ts:58`), вариант `'fullScore'` (`repertoireData.ts:8,27,88`), `RepertoireVerificationMetadata`, write-only `activeVerification`; `rawXml`/`fullRawXml`/`cursorStepByNote` нигде не заполняются (`musicXmlGenerator.ts:274-278`).
- `chordRhythm.ts`: actions `selectBeat/clearSelection/finishCorrective` не диспатчатся, `CHORD_RHYTHM_TIME_SIGNATURE`, `lastTimingBand`, `RhythmAssessmentTrial.index` — write-only; `chordRhythmDiagnostics` (`App.svelte:487-495`) только пишется, в `DiagnosticsView` не передаётся.
- Legacy-ID `white-key-intro:*`, `white-key-identify:*`, `white-key-flow:phase3Complete` встречаются только в `curriculumProgressDetails.ts:162-228`, никем не пишутся.
- `harmony.ts:240` — `persistSnapshot` пишет `transferAssessment` в SESSION, который никогда не читается.
- `dev`-хук `window.__openSessionSummary` (`App.svelte:5524-5529`).

### 5.2 Мелкие находки
- Remediation-лимиты и размеры блоков расходятся: chordRhythm — 3 раунда и терминальный `failed`; Harmony — 3 задачи на раунд, раундов неограниченно; inversion initial-блок 16 trials vs 12 у остальных (16 задокументировано).
- First-ever delayed-check в bass/triads отправляется как `kind:'scheduled'` при `reps===0`, white-key/first-run — как `'new'`; FSRS-матч не страдает, семантика логов/статов различается.
- `initialStability` floor 0.01 vs 0.001 эталона, target mean-reversion, дробные интервалы (см. 4.1).
- `rankNew`/`choosePractice` (см. 4.1).
- A11y: `type="button"` отсутствует в `ChordRhythmStage`; `InspectorRail` `role="button"` не обрабатывает Space; модалки без focus-trap.
- `Keyboard.svelte:16,29,40` — `KeyData.freq` считается, но не используется.
- Repo hygiene: 6 ZIP (10,2 МБ) + `acceptance/` 40 МБ untracked; `.gitignore` не покрывает `*.zip`, `diagnostics-*`, `acceptance/`, `.env.*`, `coverage/`, `*.tsbuildinfo`.

---

## 6. Дрейф документации (критично для приёмки)

| Документ:строка | Заявлено | Факт |
|---|---|---|
| `Roadmap.md:3,31-36`; `Handoff.md:612`; `M3J_REV1_REPORT.md:45` | 10 этапов; M3J последний; ритм не начат | 11 этапов; M3K в коде и частично в UI |
| `M3J_REV1_REPORT.md:28,36` | 23 файла / 443 теста passed; svelte-check 0 ошибок | 441/443; 7 ошибок |
| `RUNTIME_INTEGRITY_REPORT.md:15,43` | 414/414; 0 ошибок | 443 теста; 7 ошибок |
| `SCHEDULER_INTEGRITY_REPORT.md:55` | 22 файла / 431 тест | 23 файла / 443 |
| `STABILIZATION_REV2_REPORT.md:56,63` | 410/410; архив создаётся скриптом | скрипт невоспроизводим (P1-9) |
| `Handoff.md:125,577` | 21 файл / 414 тестов; «46 fingerprint-тестов» | 23 файла / 443; в `repertoire.test.ts` 38 `it()` |
| `README.md:53` | паттерн `alberti-bass-intro` | фактический 7-й — `twohand-chord-dialog`; «alberti» в `src` отсутствует |
| `M3J_REPORT.md:40,44` | 23 файла / 441 тест; создаёт `piano-key-trainer-milestone3j.zip` | 2 fail; скрипт пишет только `-rev1.zip`, старый ZIP — сирота |
| `README.md:63` | MetronomeClock — «Web Audio lookahead» | пре-скедулинг всей последовательности; `stop()` не отменяет клики |
| `M3I_FINAL_REPORT.md:9` | «#10 remains planned» | 11 этапов, M3K в коде |
| `acceptance/m3j/README.md:3` | ритм вне scope | M3K в коде |

**Верные заявления:** 25 пьес / 50 вариантов / 46 verified / 4 unverified / 0 needsCorrection; 12 уроков; 7 паттернов; 12 echo-фраз; соответствие категорий. Версия 6.2.0 согласована.

---

## 7. Матрица покрытия тестами

| Модуль | Тест | Статус |
|---|---|---|
| `core/learning/chordRhythm.ts` | — | ❌ нет |
| `App.svelte`, `ui/components/*` | — | ❌ нет компонентных |
| `storage/migrator.ts` | — | ❌ нет |
| `audio/AudioEngine/MidiController/MetronomeClock` | — | ❌ нет |
| `services/supabase.ts` | — | ❌ мёртвый модуль |
| `fsrs/latencyGrading.ts`, `math.ts` | `fsrs.test.ts`, `learning.test.ts`, `harmony.test.ts` | ⚠ косвенно |
| `learning/advancedModules.ts` | 1 ассерт в `bassGrandStaff.test.ts`; ветка chordRhythm не покрыта | ⚠ |
| `curriculum/learningRoadmap.ts` | `learningRoadmap.test.ts` | ⚠ устаревший/красный |
| `fsrs/*`, `reviewLog`, `reviewPersistence`, `cardClassification` | профильные тесты | ✅ |
| `bassGrandStaff`, `intervals`, `triads`, `chordInversions`, `harmony` | профильные тесты | ✅ |
| `firstRunCf`, `whiteKeys`, `curriculumFlow`, `curriculum3d`, `dailyPractice`, `progress`, `trialPolicy` | профильные тесты | ✅ |
| `storage/db.ts` | интеграционно | ⚠ |
| `repertoire*`, `musicXmlGenerator`, `repertoireAudit` | `repertoire.test.ts` и др. | ✅ |
| `lessons`, `ear`, `twohand` | наличие данных | ⚠ |

---

## 8. Что решить до работ (вопросы оркестратору)

1. **M3K**: доводить до checkpoint (docs, tests, smoke, package, report) или откатывать `chord_rhythm` из roadmap/UI? Сейчас он нарушает заявленную границу остановки.
2. **Канон delayed-check retry**: 0 дополнительных FSRS-мутаций (bass/intervals/triads + доки) или грейдить каждый H0-retry (white-key/3D)? Выбрать и унифицировать в `trialPolicy`.
3. **Доверие к backup-файлу**: считать ли импортируемый JSON недоверенным (тогда XSS/валидация — P0/P1, а не robustness)?
4. **First-Run**: переход после проваленного anchor (`firstRunCf.ts:2329-2357`) — баг или принятое поведение? Должен ли flow повторно онбордить?
5. **Стабилизационные скрипты**: восстановить недостающие отчёты или удалить скрипты и поправить отчёт?
6. **`acceptance/` (~40 МБ) и 6 ZIP**: коммит, Git-LFS или ignore?
7. **`learningRoadmap.test.ts`**: обновить до 11 этапов или скрыть `chord_rhythm` до готовности модуля?
8. **Chord-rhythm grading model**: должны ли module-оценки создавать lifetime-счётчики/`transferAssessment` (как inversion/harmony) или остаться snapshot-local?

---

## 9. Рекомендуемый порядок работ

1. **Заморозить/зафиксировать WIP.** Ветка + осмысленные коммиты (264 untracked — риск потери). Принять решение по M3K (вопрос 1). Обновить/скрыть docs и roadmap.
2. **Зелёные гейты.** Починить 7 ошибок `svelte-check` (включая типизацию snapshot: убрать `as const` в `rhythmSnapshotFor`), привести `learningRoadmap.test.ts` к согласованному контракту.
3. **Lifecycle модулей.** Централизованный `clearModuleStates()` во всех `handleStart*`, выход из `moduleComplete`, починка `returnFromChordRhythmFailure` и дедлока `startRemediation`, teardown clock/timer.
4. **Безопасность и целостность данных.** Единая версионированная схема бэкапа: валидация → нормализация → одна транзакция; ждать `reviewPersistenceQueue`; экранировать prompt (`{@html}`); нормализация `stats`/snapshots; числовая санитизация settings/cards.
5. **Персистентность M3K.** `pendingCorrective`/`scoredQuestionIds`, `loadData()` resume-ветка (по образцу Harmony `App.svelte:1079-1093`), статус `in_progress` из snapshot, сериализация всех действий через одну очередь.
6. **FSRS-канон.** Унифицировать retry-политику; ветка `elapsed < 1 day` по времени, а не `memoryState`; исключить фиктивные `responseMs` из квантилей; решить sticky `reviewPersistenceFailed`.
7. **Инфраструктура.** CI (`verify` в GitHub Actions), `chordRhythm.test.ts` + smoke, тесты audio (инъекция порта уже есть), лимиты `.mxl`; ignore для ZIP/acceptance или LFS.
8. **P2-остальное по областям.** Keyboard/input баги (`e.repeat`, `activePage`-гейт, post-session handlers, Enter-конфликт), audio failure-handling, детерминизм `resolveCardVisualConfig`/transfer-ротации, MusicXML-метаданные.

---

## 10. Приложение: подтверждённые «чистые» зоны

- FSRS-6 формулы `retrievability`, `intervalForRetention`, `recallStability`, `forgetStability`, `shortTermStability`, `initialDifficulty` численно совпадают с py-fsrs (кроме микродевиаций из 4.1).
- First-attempt инвариант: `applyFsrsReview` вызывается только из `reviewLog.ts:314`, corrective-попытки не создают второй лог (`reviewLog.ts:535-571`).
- Dexie card+log commit атомарен в одной `rw`-транзакции (`App.svelte:1994-2010`); `nextRound` ждёт `pendingReviewCommitCount`.
- Схема v1→v2 аддитивная и безопасная; секретов в репо нет; supabase использует только публичный anon key.
- Scheduler: `chooseDue` без рандома, стабильная сортировка; `Math.random` — только cold-test shuffle и выбор ear-заданий (осознанно).
- Аудио: синтезатор-фоллбэка нет by construction; 17 Salamander-рутов C2–C6, velocity clamp, очистка голосов/таймеров, корректный autoplay-путь.
- MIDI: velocity-0 note-off, фильтр диапазона, hot-plug reattach, отписки слушателей.
- Keyboard: 29 белых / 20 чёрных, корректная энгармоника, `focus-visible` не поднимает клавиши (`app.css:1105-1116`), нет двойного срабатывания pointerdown/click.
- Нижний док-клавиатура и запрет вертикального сдвига реализованы явно (`app.css:1140-1148, 2905-2952`).
- MusicXML: генерация детерминирована, XML-экранирование, pickup-такты, tie-разрывы; файловая система/XXE не задействованы (regex-парсер).
- Данные: 25 пьес / 50 вариантов / 46 verified / 4 unverified / 0 needsCorrection; 12 уроков; 7 паттернов; 12 echo-фраз — совпадают с тестами.
- Все 8 `node scripts/<file>.mjs` из `package.json` существуют и валидны; M3J-архив действительно проверяет byte-identity двух сборок.

---

## 11. Ограничения аудита

- Все находки статические; browser/IndexedDB-репро не выполнялись. Наиболее «средовые» риски (P1-4 race импорта, `ts`-коллизия, MIDI unplug, latency-коллапс, OSMD-leak) помечены `[C]`/`[S]` по коду, но не воспроизведены.
- FSRS-сравнение велось с py-fsrs `main`; при другой эталонной ревизии микродевиации могут отличаться.
- Не проверялись: реальные legacy-payload'ы, Supabase-схема/RLS, поведение в Firefox/Safari, `npm run build` после M3K.
