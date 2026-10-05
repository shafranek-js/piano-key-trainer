# Piano Key Trainer — Developer Handoff

## 1. Overview & Canonical Baseline

**Piano Key Trainer** is a desktop-first web application for beginner piano learners designed to build automatic keyboard orientation, sight-reading, relative ear recognition, and two-hand coordination through **FSRS-6 spaced repetition**, measured response latency, and structured musical exercises.

- **Current Canonical Version:** **v6.2.0**
- **Single Version Source of Truth:** [`package.json`](file:///c:/Projects/piano-key-trainer/package.json) $\rightarrow$ re-exported as `APP_VERSION` in [`src/core/version.ts`](file:///c:/Projects/piano-key-trainer/src/core/version.ts) and consumed by runtime backup export (`src/App.svelte`) and UI metadata (`src/ui/views/RepertoireView.svelte`).
- **Authoritative Implementation:** **Svelte 5 + TypeScript + Vite 6 + Dexie (IndexedDB)** under `src/` and `tests/`.
- **Historical Prototype:** `piano_key_trainer_fsrs_v6_0_1_scroll_fix.html` is retained in the repository root strictly as a historical reference artifact. All active development, testing, and builds target the Svelte/TypeScript application.

> [!NOTE]
> **Milestone Progression Status (`3B (complete) → 3B.5A (complete) → 3B.5B (COMPLETE) → 3C (COMPLETE) → 3D (COMPLETE) → 3E (COMPLETE) → 3F (COMPLETE) → 3G (COMPLETE) → 3H (COMPLETE) → 3I (FINALIZATION CHECKPOINT)`)**
>
> - **Milestone 3A — Learning State Foundation:** complete (`src/core/learning/types.ts`, `trialPolicy.ts`, `progress.ts`).
> - **Milestone 3B — First-Run C/F Guided Learning:** complete (`src/core/learning/firstRunCf.ts`, `src/ui/components/FirstRunStage.svelte`). Brand-new learners enter the 11-step C/F guided flow on the **Training** screen before any unscaffolded FSRS trials.
> - **Milestone 3B.5A — Repertoire Integrity Foundation:** complete (`src/core/repertoire/repertoireData.ts`, `musicXmlGenerator.ts`, `repertoireAudit.ts`). Provides canonical `MelodyEvent` / `normalizeSongToEvents`, explicit rests, lossless MusicXML 4.0 round-trip, rest-aware playback scheduling, variant-specific `SongVerificationMap`, and the 50-variant audit registry.
> - **Milestone 3B.5B — Complete Repertoire Musical Verification (`COMPLETE`):** All 25 built-in pieces (`50 variants`) have been audited event-by-event against authoritative public-domain / historical / internal pedagogical sources. Library total is **`46 verified` / `4 unverified` (`0 needsCorrection`, `0 unchecked`)**, where the only 4 `unverified` variants (`beethoven-fur-elise:melodyArrangement`, `hanon-1:melodyArrangement`, `grieg-morning-mood:melodyArrangement`, `korobeiniki-tetris:melodyArrangement`) are explicitly documented pedagogical or modern adaptations. Every `verified` variant is locked by an independent event-fingerprint test in `tests/unit/repertoire.test.ts`.
> - **Milestone 3C — Curriculum-Gated Activation & Interleaving (`COMPLETE`):** After completing First-Run C/F (`complete`), the learner continues inside the **Training** screen through a deterministic white-key acquisition and interleaving pipeline (`D → E → cdeIdentify → B → fbIdentify → G → A → fgabIdentify → allWhiteMix → allWhiteIdentify → phase3Complete`, implemented in `src/core/learning/whiteKeys.ts`, `src/core/learning/curriculumFlow.ts`, and `src/ui/components/CurriculumStage.svelte`). Unseen curriculum cards are strictly excluded from the normal scheduler via `isCurriculumCardActive` / `filterCurriculumActiveCards` and `resolveTrainingOrchestration`.
> - **Milestone 3D Rev2 — Per-Card Teaching/FSRS Integrity, Don't Know Persistence & Context-Aware `identify` Answer Buttons (`COMPLETE`):** After completing Phase 3 (`phase3Complete`), the learner progresses inside the **Training** screen through **Phase 4 (Black Keys: `C# → D# → twoBlackIdentify → F# → G# → A# → threeBlackIdentify → allBlackMix → allBlackIdentify → phase4Complete`)**, **Phase 5 (Staff Notation `notationToKey`: per-note `C → F → G → D → E → A → B` with `model → qualify → localMix → delayedCheck` and exact-octave `C4–B4` enforcement)**, and **Phase 6 (Relative Ear `soundToKey`: per-note `C → D → E → F → G → A → B` with `model → qualify → localMix → delayedCheck`, `C4` reference tone, and exact-octave `C4–B4` enforcement)** (`src/core/learning/curriculum3d.ts`, `src/ui/components/Curriculum3dStage.svelte`). Every `notationToKey:<note>` and `soundToKey:<note>` card requires its own independent `H0` `delayedCheck` (with full `Again → corrective → intervening recall → independent H0 retry` remediation on failure; `Don't know` immediately persists remediation with 0 FSRS mutations and restores `H2` corrective upon reload), `settings.level === 'white'` is strictly respected even after Phase 4 completion, and `identify` answer buttons use context-aware Variant 1 (`white-only` 7 buttons, `black-only` 2/3/5 buttons, or `mixed-chromatic` 2-row `5+7` piano-stack with live `Shift` highlight).
> - **Milestone 3E — Core Curriculum Consolidation & Daily Practice Orchestration (`COMPLETE`):** After completing Phase 6 (`phase6Complete`), the app transitions permanently from acquisition into daily retention practice (`ACQUISITION → DAILY RETENTION PRACTICE`). Strictly preserves the 6 canonical phases without creating a Phase 7. Features a graduation screen on first completion with a 4-skill checklist, auto-skip on startup/reload for graduated users, a pure 5-priority orchestrator (`src/core/learning/dailyPractice.ts`: `due_scheduled_review` $\rightarrow$ `weak_reinforcement` $\rightarrow$ `confusion_contrast` $\rightarrow$ `transfer` $\rightarrow$ `free_practice`), controlled interleaving ($\le 2$ same skill, $\le 2$ same pitch class, no immediate repeat, due urgency overrides cosmetic interleaving), strict FSRS invariance for transfer trials (`gradeableByFsrs = false`), session presets (`quick` 3-min, `normal` 8-min, `due` all-due exiting immediately upon clearing due cards), and derived retention mastery classification in ProgressView.
> - **Milestone 3F — Bass Clef & Grand Staff Transfer (`COMPLETE`):** Separate post-graduation Advanced Module ("Дополнительные модули") introducing Bass Clef (`notationBassToKey` for natural notes $C3–B3$) and Grand Staff transfer without creating Phase 7. Features manual enrollment in `CurriculumView`, dedicated `<AdvancedNotationStage>` teaching in Training, landmark-anchored progression ($F3 \to C3 \to E3 \to G3 \to D3 \to A3 \to B3$), exact-octave enforcement (`requiresExactOctave: true`, `wrong_octave` prompt), 12 Grand Staff transfer trials, FSRS invariance for transfer, daily practice integration for scheduled bass reviews and grand staff transfer, and separate ProgressView tracking.
> - **Milestone 3G — Interval Foundations (`COMPLETE`):** Post-graduation Advanced Module ("Интервалы" under "Дополнительные модули") introducing 4 ascending intervals (`P8`, `P5`, `M3`, `m3`) as semitone distance units preparing the foundation for Milestone 3H triads. Strictly preserves the 6 core phases, creates 8 independent FSRS cards across 2 skills (`intervalBuild` and `intervalIdentify`), enforces exact octave and provides dedicated `wrong_octave` feedback on build, maps digits `1–4` to answer buttons on identify, provides contrast step for M3 vs m3, implements transfer gate with reload persistence, and seamlessly integrates into Daily Practice.
> - **Milestone 3H — Major / Minor Triads (`COMPLETE`):** Post-graduation triad module with full three-note build, major/minor identify, constructive quality/voicing diagnostics, corrective persistence, transfer, and Daily Practice integration.
> - **Milestone 3I — Chord Inversions & Chord Symbols (`ACCEPTED`):** First/second inversion, bass reading, inversion identify, slash symbols, `C → G/B → Am → F`, and bounded transfer. Independent acceptance closed the scheduler-integrity hold; the next separate checkpoint is M3J below.


---

## 2. Architecture Map

```text
src/
├── App.svelte                         # Root application state, session lifecycle, practice runners, and view router
├── main.ts                            # Svelte 5 mount entry point
├── core/
│   ├── version.ts                     # Single version source of truth (APP_VERSION from package.json)
│   ├── fsrs/
│   │   ├── constants.ts               # FSRS-6 21 weights (W), LEARN_ORDER, CURRICULUM_GROUPS, hints, default settings
│   │   ├── fsrs6.ts                   # FSRS-6 power-law math, retrievability, recall/forget stability, applyFsrsReview()
│   │   ├── latencyGrading.ts          # Personalized P30/P85 latency stats and determineGrade()
│   │   ├── math.ts                    # Numeric helpers (clamp, quantile, median, mean)
│   │   ├── reviewLog.ts               # createSessionId(), applyReviewStats(), applyReviewAndBuildLog(), submitQuestionAttempt()
│   │   └── types.ts                   # Core TypeScript types (Card, ReviewLogEvent, Skill, ReviewKind, UserSettings, etc.)
│   ├── scheduler/
│   │   └── queue.ts                   # Queue selectors: chooseDue(), chooseNew(), choosePractice(), chooseConfusionPractice(), buildColdQueue()
│   ├── curriculum/
│   │   └── curriculum.ts              # 6-phase curriculum readiness gates (Anchors, Neighbors, Remaining white notes, Black keys, Notation, Sound), successfulScheduledSessions(), curriculumCardReady()
│   ├── input/
│   │   └── inputPolicy.ts             # Authoritative skill × input-channel matrix, PC keyboard parser, prompts & instructions
│   ├── learning/
│   │   ├── types.ts                   # TrialMode, HintLevel (H0–H3), TrialContext, AcquisitionState, LearningProgressRecord, LearningEvent
│   │   ├── trialPolicy.ts             # deriveFsrsEligibility(), deriveFsrsApplicationDecision(), isTrialFsrsEligible(), createTrialContext(), createLegacyTrialContext()
│   │   ├── progress.ts                # Pure acquisition state reducer (reduceLearningProgress), context deduplication, backup normalization
│   │   ├── firstRunCf.ts              # Milestone 3B First-Run C/F state machine, entry/resume detection, H3/H2/H0 diagram spec, and delayedCheck FSRS activation
│   │   ├── whiteKeys.ts               # Milestone 3C white-key geometric metadata (D/E/B/G/A), configurable thresholds, local/family/all-white mix & identify pools
│   │   ├── curriculumFlow.ts          # Milestone 3C curriculum state machine, H3/H2/H0 fading, MIX_READY vs RETENTION_MASTERED gates, isCurriculumCardActive, and 5-level resolveTrainingOrchestration
│   │   ├── curriculum3d.ts            # Milestone 3D Phases 4–6 state machine (Black Keys C#..A#, Staff Notation notationToKey C4–B4, Relative Ear soundToKey C4–B4)
│   │   ├── bassGrandStaff.ts          # Milestone 3F Bass Clef & Grand Staff state machine (notationBassToKey C3–B3, Grand Staff transfer)
│   │   ├── intervals.ts               # Milestone 3G Interval Foundations state machine (intervalBuild & intervalIdentify for P8, P5, M3, m3)
│   │   ├── dailyPractice.ts           # Milestone 3E/3F/3G Daily retention practice orchestrator, priority queues, transfer selection
│   │   └── index.ts                   # Learning domain barrel export
│   ├── lessons/
│   │   └── lessonsData.ts             # 12 guided interactive lessons and C-position finger mappings
│   ├── repertoire/
│   │   ├── repertoireData.ts          # 25 built-in repertoire pieces (excerpt + melodyArrangement), canonical MelodyEvent normalization, playback schedule & provenance metadata
│   │   ├── fullRepertoireData.ts      # Extended melodyArrangement note/beat/rest sequences for all 25 built-in pieces
│   │   ├── repertoireAudit.ts         # Structural validator (validateSongStructure) and 50-variant audit registry (REPERTOIRE_AUDIT_REGISTRY)
│   │   ├── repertoireLibraryUi.ts     # Repertoire Library filtering, sorting, view-mode & card-variant helpers
│   │   └── musicXmlGenerator.ts       # Lossless MusicXML 4.0 generator/parser for OSMD engraving and .musicxml/.xml/.mxl importer (via JSZip)
│   ├── ear/
│   │   └── earTrainingData.ts         # Intervals (m2–P8 from C4), major/minor triads, and 12 melodic echo phrases
│   └── twohand/
│       └── twoHandData.ts             # 7 two-hand coordination patterns (mirror pairs, motion, anchor, ping-pong, Alberti bass)
├── audio/
│   ├── AudioEngine.ts                 # Salamander Grand Piano (Yamaha C5) Web Audio sampler (C2–C6)
│   ├── MidiController.ts              # Web MIDI access, note-on/note-off events, velocity, and device management
│   ├── MetronomeClock.ts              # Web Audio lookahead metronome scheduler
│   └── types.ts                       # Audio/MIDI shared interfaces
├── storage/
│   ├── db.ts                          # Dexie IndexedDB schema v1 & v2 (PianoTrainerDB: cards, reviewLogs, coldTests, histories, settings, learningProgress)
│   └── migrator.ts                    # One-time migration from legacy localStorage keys into IndexedDB
├── services/
│   └── supabase.ts                    # Optional Supabase cloud-sync infrastructure (not active in current user workflow)
└── ui/
    ├── components/
    │   ├── TopNav.svelte              # Desktop menu bar and context/settings/next-question toolbar
    │   ├── SessionStrip.svelte        # Compact session timer, preset selector, due/new counters, and session controls
    │   ├── TaskStage.svelte           # Unified central operational area for standard practice questions & session completion
    │   ├── FirstRunStage.svelte       # Milestone 3B First-Run C/F guided operational stage (replaces TaskStage during first-run)
    │   ├── CurriculumStage.svelte     # Milestone 3C White-Key Curriculum operational stage (D/E/B/G/A acquisition, family/all-white mixes, and identify mixes)
    │   ├── Curriculum3dStage.svelte   # Milestone 3D Black Keys (Phase 4), Staff Notation (Phase 5), and Relative Ear (Phase 6) operational stage
    │   ├── AdvancedNotationStage.svelte # Milestone 3F Bass Clef & Grand Staff operational stage (notationBassToKey C3–B3, Grand Staff transfer)
    │   ├── IntervalStage.svelte       # Milestone 3G Interval Foundations operational stage (intervalBuild & intervalIdentify, contrast, transfer)
    │   ├── Keyboard.svelte            # Persistent 4-octave (C2–C6) bottom-docked piano keyboard
    │   ├── Staff.svelte               # Vector SVG staff renderer (Treble, Bass, Grand Staff) + OSMD continuous score view
    │   ├── LessonBanner.svelte        # Guided lesson step header and navigation controls
    │   ├── SongBanner.svelte          # Repertoire playback, measure loop, tempo, and OSMD/lane controls
    │   ├── TwoHandBanner.svelte       # Two-hand exercise status and controls
    │   ├── InspectorRail.svelte       # Collapsible right-hand FSRS card/memory inspector drawer
    │   ├── SettingsDrawer.svelte      # Practice settings, MIDI connection, and JSON backup export/import modal
    │   └── SessionSummaryModal.svelte # Post-session and Cold Test summary dialog
    ├── views/
    │   ├── LessonsView.svelte         # 12 guided lessons catalog and progress cards
    │   ├── RepertoireView.svelte      # 25+ repertoire catalog, variant-specific verification badge, category filter, and MusicXML/MXL file import
    │   ├── TwoHandView.svelte         # Two-hand coordination pattern catalog
    │   ├── ProgressView.svelte        # Per-skill and per-note mastery overview, Treble vs Bass breakdown, Grand Staff badge
    │   ├── AnalyticsView.svelte       # Long-term retention, latency trends, and performance history
    │   ├── CurriculumView.svelte      # 6-phase curriculum unlock status + Advanced Modules section (Bass Clef & Grand Staff enrollment)
    │   ├── DiagnosticsView.svelte     # Directional confusion matrix and Cold Test history
    │   └── CalibrationView.svelte     # Predicted R vs. actual recall calibration buckets, ECE, and Brier score
    └── styles/
        └── app.css                    # Application styling and layout invariants

tests/
└── unit/
    ├── bassGrandStaff.test.ts         # Milestone 3F Bass Clef C3–B3, exact octave, Grand Staff transfer, and clef invariant tests
    ├── curriculum3c.test.ts           # Milestone 3C D→E→B→G→A acquisition, H3/H2/H0 fading, MIX_READY vs RETENTION_MASTERED, scheduler activation gate, reload/resume, and legacy skip tests
    ├── curriculum3d.test.ts           # Milestone 3D Phase 4 Black Keys, Phase 5 Staff Notation (exact octave), Phase 6 Relative Ear, and 6-phase progressive curriculum readiness tests
    ├── dailyPractice.test.ts          # Milestone 3E/3F Priority order (due→weak→confusion→transfer→free), transfer FSRS invariance, identify integrity, and presets
    ├── firstRunCf.test.ts             # Milestone 3B First-Run C/F guided learning, H2 hint integrity, C6 landmark policy, resume, and delayedCheck FSRS tests
    ├── fsrs.test.ts                   # FSRS-6 math, ReviewLog before/after transitions, Card.stats, and session readiness tests
    ├── learning.test.ts               # Milestone 3A TrialPolicy, LearningProgress reducer, FSRS boundary, legacy adapter, Dexie v2 & backup tests
    ├── regression.test.ts             # Channel-aware input routing matrix, keyboard shortcuts, and pedagogical regression tests
    ├── repertoire.test.ts             # 50 repertoire variants, lossless MusicXML round-trip, rest playback schedule, and 46 verified event-fingerprint tests
    ├── repertoireLibraryUi.test.ts    # Repertoire Library filtering, sorting, search, category pills, and card layout tests
    ├── scheduler.test.ts              # Cold queue, scheduler ordering, due selection, and retention filters
    └── twohand.test.ts                # Two-hand coordination pattern validation and simultaneity tests
```

---

## 3. Critical Pedagogical & Data Invariants

### 3.1 First Attempt Controls FSRS; Corrective Attempts Never Re-Grade
All standard practice and Cold Test submissions pass through [`submitQuestionAttempt()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L445-L561):
- **First Attempt (`!state.firstResponseRecorded`):**
  - Sets `state.firstResponseRecorded = true` and `state.attempts = 1`.
  - Calls [`applyReviewAndBuildLog()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L196-L401) exactly once.
  - A first attempt mutates FSRS card state via [`applyFsrsReview()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/fsrs6.ts#L118-L202) only when **BOTH**:
    1. `ReviewKind` permits memory scheduling (`'new'` or `'scheduled'`), **AND**
    2. the canonical `TrialContext` passes [`deriveFsrsApplicationDecision(...)`](file:///c:/Projects/piano-key-trainer/src/core/learning/trialPolicy.ts#L83-L91).
  - Specifically:
    - `new` + `model` / `guided` / `qualify` $\rightarrow$ no FSRS (`grade: null`)
    - `new` + eligible `delayedCheck` (`H0`) $\rightarrow$ FSRS
    - `new` + hinted `delayedCheck` (`H1` / `H2` / `H3`) $\rightarrow$ no FSRS (`grade: null`)
    - `scheduled` + `scheduledReview` (`H0`) $\rightarrow$ normal FSRS grade
    - `scheduled` + `scheduledReview` (`H1` / `H2` / `H3`) $\rightarrow$ `Again` (`1`)
    - `corrective` $\rightarrow$ never FSRS (`grade: null`)
  - Emits the single authoritative `ReviewLogEvent` for the question.
- **Corrective Attempts (`state.firstResponseRecorded === true`):**
  - Increment `state.attempts` and allow the learner to complete the physical or named correction (`state.isCompleted = true`, `state.isLocked = true`) or reveal a visual hint on the 3rd failed attempt.
  - **Never** call `applyFsrsReview()`, **never** mutate `Card.stats`, and **never** emit a second `ReviewLogEvent`.

### 3.2 Non-FSRS Kinds (`practice`, `confusion`, `cold`, `lesson`)
- **`practice` and `confusion` (`freePractice`):**
  - Schedule-neutral: `applyFsrsReview()` is not called; `card.reps`, `card.stability`, `card.difficulty`, `card.lastReviewAt`, and `card.dueAt` remain untouched (`gradeableByFsrs: false`).
  - `ReviewLogEvent` records a schedule-neutral diagnostic grade (`grade: 3` / `'Good'` on unhinted first-attempt success, or `grade: 1` / `'Again'` on error or hint), `scheduledDays: null`, `elapsedDays: null`, `stabilityAfter: card.stability`, and `difficultyAfter: card.difficulty`.
  - `Card.stats` **is** updated on the first attempt (`trials`, `firstCorrect`/`firstWrong`, `hints`, `practiceTrials`), and `cardMutated: true` ensures the updated `Card.stats` snapshot is persisted to IndexedDB.
- **`cold` (Cold Test):**
  - Strictly diagnostic (20 items, 1 attempt per item, no hints).
  - Does **not** mutate FSRS fields and does **not** mutate `Card.stats` (`statsUpdated: false`, `cardMutated: false`).
  - Records `grade: null`, `gradeName: null`, `scheduledDays: null`, `elapsedDays: null`.

### 3.3 Channel-Aware Input Matrix & Exact-Octave Contract
Defined in [`src/core/input/inputPolicy.ts`](file:///c:/Projects/piano-key-trainer/src/core/input/inputPolicy.ts) (`SKILL_INPUT_POLICY`):

| Skill | PC Note Keyboard (`pcNote`) | Answer Buttons (`answerButton`) | On-Screen Piano (`pianoKey`) | MIDI (`midi`) | Exact Octave Required? |
|---|:---:|:---:|:---:|:---:|:---:|
| `identify` | **YES** | **YES** | NO | NO | No (pitch class) |
| `patternIdentify` | **YES** | NO | **YES** | **YES** | No (pitch class) |
| `find` | NO | NO | **YES** | **YES** | No (pitch class) |
| `notationToKey` | NO | NO | **YES** | **YES** | **YES** (`answerKeyId === targetKeyId`) |
| `soundToKey` | NO | NO | **YES** | **YES** | **YES** (`answerKeyId === targetKeyId`) |

- Semantic named-note channels (`pcNote` and `answerButton`) resolve to `{ answerNote, answerKeyId: null }` via [`resolveSemanticNoteAnswer()`](file:///c:/Projects/piano-key-trainer/src/core/input/inputPolicy.ts#L118-L132) and never synthesize a fake physical `keyId` such as `C4`.
- In `patternIdentify`, prompts ask which note occupies a structural landmark relative to the groups of 2 or 3 black keys without leaking the target note name in the prompt (`getPatternIdentifyPrompt()`).

### 3.4 `ReviewLogEvent` Before/After Audit Semantics
Constructed in [`applyReviewAndBuildLog()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L158-L295):
- **Single Review Timestamp:** Every review uses one `reviewedAt` timestamp shared across `applyFsrsReview(card, grade, reviewedAt, settings)`, `card.lastReviewAt`, `card.dueAt`, and `logEvent.ts`.
- **New Card First Review (`preReviewReps === 0`):**
  - `stabilityBefore: null`, `difficultyBefore: null`, `retrievabilityBefore: null`, `elapsedDays: 0`.
  - `stabilityAfter: card.stability`, `difficultyAfter: card.difficulty`, `scheduledDays: fsrsResult.intervalDays`.
- **Scheduled Review of Existing Card (`preReviewReps > 0`):**
  - `stabilityBefore`, `difficultyBefore`, and `retrievabilityBefore` reflect the card's state at `reviewedAt` immediately prior to FSRS mutation.
  - `elapsedDays = Math.max(0, (reviewedAt - preReviewLastReviewAt) / DAY_MS)`.
  - `stabilityAfter` and `difficultyAfter` reflect the new post-FSRS state.
  - `scheduledDays` equals `fsrsResult.intervalDays` (for `Again` / `relearning`, `settings.relearningSeconds / 86400`, e.g. `45 / 86400`).
- **`Don't know` Action:**
  - Treated as a first-attempt failure (`firstCorrect: false`, `hintUsed: true`, `answer: null`, `answerKeyId: null`, `grade: 1`, `gradeName: 'Again'`) using the exact same `applyReviewAndBuildLog()` transition pipeline.

### 3.5 Session Identity Semantics
- [`createSessionId(preset, startedAt)`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L27-L34) generates a unique session identifier (`session-${startedAt}-${seq}` for standard sessions; `cold-${startedAt}-${seq}` for Cold Test sessions) whenever `startLearningSession(preset)` is called.
- [`successfulScheduledSessions(cardId, reviewLog)`](file:///c:/Projects/piano-key-trainer/src/core/curriculum/curriculum.ts#L19-L35) counts distinct `sessionId` values among successful `new`/`scheduled` reviews (`firstCorrect && grade != null && grade !== 1`).
- Two successful reviews in the **same** session count as `1` session; two successful reviews across **two distinct** sessions count as `2` sessions, satisfying the multi-session requirement in [`curriculumCardReady()`](file:///c:/Projects/piano-key-trainer/src/core/curriculum/curriculum.ts#L37-L49).

### 3.6 `Card.stats` Update & Persistence Semantics
- [`applyReviewStats(card, logEvent)`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L89-L124) runs **after** [`determineGrade()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/latencyGrading.ts#L69-L97) so latency grading always inspects pre-review `card.stats` (specifically `recentScheduledSuccesses` and `trials`).
- Participates on the first attempt of `'new' | 'scheduled' | 'practice' | 'confusion'`:
  - `card.stats.trials += 1`
  - `logEvent.firstCorrect ? card.stats.firstCorrect += 1 : card.stats.firstWrong += 1`
  - `if (logEvent.hintUsed) card.stats.hints += 1`
  - `if (kind === 'practice' || kind === 'confusion') card.stats.practiceTrials += 1`
  - `if (kind === 'new' || kind === 'scheduled')`:
    - `grade !== 1`: `scheduledSuccesses += 1`, `recentScheduledSuccesses += 1`
    - `grade === 1` (`Again`): `recentScheduledSuccesses = 0` (`scheduledSuccesses` is never decremented).
- Persisted through the shared `recordCardReview()` path in `src/App.svelte`: the serialized commit appends one event to reactive state after its Dexie transaction, writes a mutated card when needed, and inserts the ReviewLog row without replacing an existing timestamp.

### 3.7 Learning Architecture Foundation (`src/core/learning/`)
Milestone 3A establishes a strict domain boundary between the **Teaching Engine** (initial acquisition & scaffolding) and the **FSRS Scheduling Engine** (long-term retention scheduling):

```text
UNSEEN → MODEL → GUIDED → QUALIFY → MIX → DELAYED CHECK → FSRS → RETENTION
```

- **`TrialMode` ([`src/core/learning/types.ts`](file:///c:/Projects/piano-key-trainer/src/core/learning/types.ts)):**
  - `'model' | 'guided' | 'qualify' | 'mixedRetrieval' | 'corrective' | 'delayedCheck' | 'scheduledReview' | 'transfer' | 'coldTest' | 'freePractice'`.
- **`HintLevel` ([`src/core/learning/types.ts`](file:///c:/Projects/piano-key-trainer/src/core/learning/types.ts)):**
  - `0` (`NONE` / `H0`): no cue
  - `1` (`VERBAL_CUE` / `H1`): verbal landmark cue
  - `2` (`VISUAL_CUE` / `H2`): black-key group visual cue
  - `3` (`MODEL_VISIBLE` / `H3`): full target/model visible
- **`TrialContext` ([`src/core/learning/types.ts`](file:///c:/Projects/piano-key-trainer/src/core/learning/types.ts)):**
  - Carries `{ mode, sessionId, cardId?, itemId?, hintLevel, firstAttempt, inputMethod, contextId?, gradeableByFsrs }` into the review pipeline and is recorded on `ReviewLogEvent` (`trialMode`, `hintLevel`, `contextId`, `gradeableByFsrs`).
- **Centralized FSRS Eligibility Boundary ([`src/core/learning/trialPolicy.ts`](file:///c:/Projects/piano-key-trainer/src/core/learning/trialPolicy.ts)):**
  - [`deriveFsrsEligibility(ctx)`](file:///c:/Projects/piano-key-trainer/src/core/learning/trialPolicy.ts#L31-L77) / [`deriveFsrsApplicationDecision(ctx, kind)`](file:///c:/Projects/piano-key-trainer/src/core/learning/trialPolicy.ts#L83-L91):
    - `scheduledReview`: eligible when `firstAttempt === true` and `cardId` exists. Hint level (`H0–H3`) does **not** make a scheduled review non-gradeable: requiring a hint (`hintUsed === true` or `hintLevel > H0`) means retrieval failed and forces `grade = 1` (`Again`).
    - `delayedCheck`: eligible **only** when `firstAttempt === true`, `hintLevel === 0` (`H0`), and `cardId` exists. A hinted `delayedCheck` (`H1/H2/H3`) is an acquisition/support event (`ineligible_hinted`) and produces **no** FSRS mutation (`grade: null`).
    - Teaching acquisition / non-memory modes (`model`, `guided`, `qualify`, `mixedRetrieval`, `corrective`, `transfer`, `coldTest`, and hinted `delayedCheck`) are **not** FSRS-gradeable (`gradeableByFsrs: false`, `grade: null`).
    - `freePractice` (`kind === 'practice' || kind === 'confusion'`) is **not** FSRS-gradeable (`gradeableByFsrs: false`), updates practice `Card.stats` only, and records a schedule-neutral diagnostic grade (`Good` / `Again`).
    - Both the `TrialContext` gate and the `ReviewKind` gate (`kind === 'scheduled' || kind === 'new'`) must pass; an incompatible `ReviewKind` returns `{ eligible: false, reason: 'ineligible_review_kind' }`.
    - [`applyReviewAndBuildLog()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/reviewLog.ts#L194-L361) canonicalizes `TrialContext.cardId` to `card.id` (while preserving any distinct pedagogical `itemId`) and canonicalizes `sessionId` across `ReviewLogEvent` and `TrialContext`.
- **`LearningProgressRecord` & Pure Reducer ([`src/core/learning/progress.ts`](file:///c:/Projects/piano-key-trainer/src/core/learning/progress.ts)):**
  - Stored separately from FSRS `Card` (`{ id, itemId, state, modelCompleted, guidedSuccesses, independentUnhintedSuccesses, contexts, currentHintLevel, introducedAt?, mixReadyAt?, firstFsrsEligibleAt?, updatedAt }`).
  - Tracks progression across `AcquisitionState`: `'unseen' → 'introduced' → 'guided' → 'qualifying' → 'mixReady' → 'retention'`.
  - Pure reducer [`reduceLearningProgress(progress, event)`](file:///c:/Projects/piano-key-trainer/src/core/learning/progress.ts#L78-L214) and helpers (`createInitialLearningProgress`, `recordModelCompleted`, `recordGuidedAttempt`, `recordIndependentAttempt`, `markMixReady`, `markFsrsActivated`, `appendUniqueContext`) manage state transitions deterministically.
- **Dexie v2 Storage (`learningProgress` table):**
  - [`PianoTrainerDB`](file:///c:/Projects/piano-key-trainer/src/storage/db.ts#L31-L57) preserves `version(1)` and adds `version(2)` with `learningProgress: 'id, itemId, state, updatedAt'`.
  - Backup export/import in [`src/App.svelte`](file:///c:/Projects/piano-key-trainer/src/App.svelte) includes `learningProgress` while remaining backward-compatible with older backups that omit `learningProgress`.
- **Temporary Legacy Adapter (`createLegacyTrialContext`):**
  - Until Milestone 3C replaces remaining legacy acquisition flows, [`createLegacyTrialContext()`](file:///c:/Projects/piano-key-trainer/src/core/learning/trialPolicy.ts#L153-L199) bridges existing `ReviewKind` values into `TrialContext` (`scheduled → scheduledReview`, `new → delayedCheck` at `H0`, `practice/confusion → freePractice`, `cold → coldTest`, `!firstAttempt → corrective`).
- **Latency Grading P30/P85 Preserved:**
  - [`determineGrade()`](file:///c:/Projects/piano-key-trainer/src/core/fsrs/latencyGrading.ts#L69-L97) keeps `P30` (`Easy = 4`), `P85` (`Good = 3`), and `> P85` (`Hard = 2`) thresholds intact, running only when a trial passes the FSRS eligibility boundary.

### 3.8 First-Run C/F Guided Learning (`src/core/learning/firstRunCf.ts`, `src/ui/components/FirstRunStage.svelte`)
Milestone 3B implements the first-run guided teaching flow directly inside the **Training** (`Тренировка`) screen:

- **Entry & Resume Rule (`evaluateFirstRunCfEntry` / `shouldEnterFirstRunCf` / `createFirstRunCfState`):**
  - **`'skip_completed'`:** if `keyboard-anchor:C` and `keyboard-anchor:F` are in `'retention'` and `keyboard-identify:C-F` is `'mixReady'` / `'retention'`, first-run is complete and bypassed.
  - **`'resume'`:** if any of the 5 first-run items (`keyboard-geometry:groups-2-3`, `keyboard-anchor:C`, `keyboard-anchor:F`, `keyboard-contrast:C-F`, `keyboard-identify:C-F`) has partial progress in `db.learningProgress`, the learner resumes at the exact derived step (`deriveFirstRunCfStepFromProgress`). Partial `cfMix` progress reconstructs `mixCSuccesses` and `mixFSuccesses` directly from persisted `C:...` / `F:...` contrast contexts.
  - **`'skip_legacy'`:** existing users with any `reviewLogs`, `cards` (`reps > 0`, `firstSeenAt > 0`, or `stats.trials > 0`), completed `lessonProgress`, or `coldTests` bypass automatic first-run onboarding.
  - **`'start'`:** brand-new users (or after `Reset all progress`) enter `orientation`.
- **11-Step C/F State Sequence:**
  ```text
  orientation → cModel → cGuided → cQualify → fModel → fGuided → fQualify → cfMix → cfIdentify → delayedC → delayedF → complete
  ```
  - No countdown timer, no auto-advance timer, and no latency grading during first-run (`getFirstRunTimingPolicy`). Progress is milestone/step-based (`Шаг X из 11`).
  - On the 4-octave `C2–C6` keyboard, `C6` has no visible `C#6 + D#6` pair to its right; therefore first-run C landmark modeling and qualifying contexts use `C2–C5` only (`FIRST_RUN_C_LANDMARK_KEY_IDS = ['C2', 'C3', 'C4', 'C5']`).
  - Keyboard shortcuts (`resolveFirstRunKeydownAction` & `canUseDontKnowInFirstRunStep`): `Enter` / `Space` advance `orientation` and `complete`; `Enter` triggers `Don't know` only in steps where the `Don't know` button is actually visible (`cQualify`, `fQualify`, `cfMix`, `cfIdentify`, `delayedC`, `delayedF`) and never in `cModel`, `cGuided`, `fModel`, or `fGuided`.
- **`H3 / H2 / H0` Hint Integrity (`getFirstRunDiagramSpec`):**
  - **`H3` (`cModel`, `fModel`):** highlights target white keys (`C2–C5` or `F2–F5`) with `C · До` / `F · Фа` labels and highlights the relevant black-key groups.
  - **`H2` (`cGuided`, `fGuided`, and remediation/corrective in `cQualify`, `fQualify`, `cfMix`, `cfIdentify`, `delayedC`, `delayedF`):** highlights **only** the relevant black-key group (`2` or `3` black keys). Target white keys remain completely neutral with **no** `C/F` label on both the full piano keyboard and the central mini-diagram.
  - **`H0` (`cQualify`, `fQualify`, `cfMix`, `cfIdentify`, `delayedC`, `delayedF`):** no structural highlighting.
- **`delayedCheck` as First FSRS Activation (`applyFirstRunCfActionWithCards`):**
  - Steps `orientation` through `cfIdentify` never mutate FSRS or `Card.stats`.
  - Only an unhinted (`H0`) first attempt in `delayedC` (`find:C`) and `delayedF` (`find:F`) invokes `submitQuestionAttempt` (`kind: 'new'`, `mode: 'delayedCheck'`, `hintLevel: 0`) and transitions `LearningProgressRecord.state` to `'retention'` via `markFsrsActivated` (guarded so missing cards never transition to `'retention'`).
  - Hinted `delayedCheck` (`Don't know` $\rightarrow$ `H2`) does not mutate FSRS and schedules a repeat unhinted `H0` `delayedCheck` after an intervening step.
- **Temporary Bridge to Legacy Training After Completion:**
  - Clicking `Продолжить тренировку` on `complete` (`completeFirstRunOnboarding()`) clears `firstRunState` and transitions into the existing Training session queue (`find:C` and `find:F` now have active FSRS state) until **Milestone 3C (Curriculum-Gated Activation & Interleaving)** replaces the remaining queue activation logic.

### 3.9 Repertoire Integrity & Musical Verification Pipeline (Milestone 3B.5A & 3B.5B — COMPLETE)
- **Canonical Event Representation (`MelodyEvent` / `NormalizedMelodyEvent`):**
  - [`normalizeSongToEvents(song)`](file:///c:/Projects/piano-key-trainer/src/core/repertoire/repertoireData.ts) converts any `SongDef` variant (`excerpt` or `melodyArrangement`) into an explicit timeline of `note` and `rest` events (`type`, `pitch`, `octave`, `startBeat`, `durationBeats`, `measure`, `beatInMeasure`, `noteIndex`), accounting for `pickupBeats`, `measureBeats`, `timeSignature`, `keySignatureFifths`, `defaultBpm`, and `restsAfter` (including `restsAfter[-1]` for measure-opening rests before the first note).
- **Lossless MusicXML Round-Trip & Rest-Aware Playback:**
  - [`songToMusicXml(song)`](file:///c:/Projects/piano-key-trainer/src/core/repertoire/musicXmlGenerator.ts) and [`parseMusicXmlToSongDef(xml)`](file:///c:/Projects/piano-key-trainer/src/core/repertoire/musicXmlGenerator.ts) preserve pitches, octaves, explicit `<rest/>` spans, cross-barline `<tie type="start|stop"/>` splits, pickup measures (`implicit="yes"`), key signatures, time signatures, and tempo.
  - [`buildSongPlaybackSchedule(song, bpm)`](file:///c:/Projects/piano-key-trainer/src/core/repertoire/repertoireData.ts) and [`computeNoteEnvelopeTiming()`](file:///c:/Projects/piano-key-trainer/src/core/repertoire/repertoireData.ts) schedule rests as true silence (`allowTailOverlapMs = 0`) so note envelopes never bleed across rests or subsequent note onsets.
- **Variant-Specific Verification (`SongVerificationMap`) & "Source Wins" Policy:**
  - Every `SongDef` carries independent `verification.excerpt` and `verification.melodyArrangement` records (`status: 'verified' | 'unverified' | 'needsCorrection'`, `sourceTitle`, `sourceEdition`, `sourceUrl`, `sourceMovement`, `sourcePart`, `sourceMeasures`, `verifiedAt`, `notes`).
  - A variant is marked `verified` **only** when its normalized event sequence matches an authoritative public-domain / historical / internal pedagogical source event-by-event (with explicit provenance if transposed for the C2–C6 keyboard) and is locked by an independent event-fingerprint test in [`tests/unit/repertoire.test.ts`](file:///c:/Projects/piano-key-trainer/tests/unit/repertoire.test.ts). Any pedagogical condensation or modern hybrid adaptation that deviates from the historical score remains honestly `unverified` with an explicit reason in `notes`.
  - **Final Library Status (50 variants across 25 pieces after Milestone 3B.5B completion):** **46 `verified`** (`five-note-c` ×2, `ode-joy` ×2, `mary-lamb` ×2, `twinkle` ×2, `bach-minuet-g` ×2, `beethoven-fur-elise` excerpt, `burgmuller-arabesque` ×2, `mozart-nachtmusik` ×2, `hanon-1` excerpt, `czerny-599-1` ×2, `beyer-101-8` ×2, `satie-gymnopedie-1` ×2, `pachelbel-canon-d` ×2, `tchaikovsky-swan-lake` ×2, `grieg-morning-mood` excerpt, `vivaldi-spring` ×2, `dvorak-new-world-largo` ×2, `brahms-wiegenlied` ×2, `korobeiniki-tetris` excerpt, `leontovych-shchedryk` ×2, `greensleeves` ×2, `bella-ciao` ×2, `sakura-traditional` ×2, `kocka-leze-dirou` ×2, `joplin-entertainer` ×2) and **4 intentionally `unverified`** (`beethoven-fur-elise:melodyArrangement`, `hanon-1:melodyArrangement`, `grieg-morning-mood:melodyArrangement`, `korobeiniki-tetris:melodyArrangement`), with **0 `needsCorrection`** and **0 unchecked variants**.

### 3.10 White-Key Curriculum-Gated Activation & Interleaving (`src/core/learning/whiteKeys.ts`, `src/core/learning/curriculumFlow.ts`, `src/ui/components/CurriculumStage.svelte`)
Milestone 3C enforces the rule: **"Curriculum decides what material exists for the learner. FSRS decides when already activated material should return."**
- **Deterministic White-Key Acquisition Order:**
  - After First-Run C/F (`complete`), `completeFirstRunOnboarding()` transitions directly into the 31-step white-key curriculum (`dModel → ... → phase3Complete`) inside the same **Training** workspace.
  - Note acquisition order (`CURRICULUM_ACQUISITION_ORDER = ['D', 'E', 'B', 'G', 'A']`):
    1. `D` (between 2 black keys) $\rightarrow$ local mix `C / D / F`
    2. `E` (right of 2 black keys) $\rightarrow$ 2-black family mix `C / D / E` $\rightarrow$ `cdeIdentify` (`C / D / E`)
    3. `B` (right boundary of 3 black keys) $\rightarrow$ local mix `F / B / C / E` $\rightarrow$ `fbIdentify` (`F / B`)
    4. `G` (1st white inside 3 black keys) $\rightarrow$ local mix `F / G / B`
    5. `A` (2nd white inside 3 black keys) $\rightarrow$ 3-black family mix `F / G / A / B` $\rightarrow$ `fgabIdentify` (`F / G / A / B`)
    6. `allWhiteMix` (`C D E F G A B` across octaves) $\rightarrow$ `allWhiteIdentify` (`C D E F G A B`) $\rightarrow$ `phase3Complete`.
- **Generic 5-Substage Note Acquisition (`model → guided → qualify → localMix → delayedCheck`):**
  - **`model` (`H3`, `TrialMode = 'model'`):** highlights all structural 2- or 3-black groups across complete octaves (`C2–B5`) and labels the target white keys (`D2–D5`, etc.; right-edge `C6` is excluded). No FSRS mutation.
  - **`guided` (`H2`, `TrialMode = 'guided'`):** highlights **only** the structural black-key group (`2` or `3` black keys) in a rotating octave (`guidedSuccessTarget = 2`). Target white key is never labeled or highlighted. No FSRS mutation.
  - **`qualify` (`H0`, `TrialMode = 'qualify'`):** requires `qualifySuccessTarget = 2` unhinted first-attempt successes across distinct keyboard regions (`region-<Note>2..5`, excluding `region-C6`). Satisfies the **`MIX_READY` (`isNoteMixReady`)** gate. No FSRS mutation.
  - **`localMix` / `familyMix` (`H0`, `TrialMode = 'mixedRetrieval'`):** interleaves the newly qualified note with landmarks (`localMixSuccessTarget = 4`, `familyMixTarget = 5`, `allWhiteMixTarget = 7`), enforcing no 3 identical notes in a row (`isConstrainedWhiteMixSequence`). No FSRS mutation.
  - **`delayedCheck` (`H0`, `TrialMode = 'delayedCheck'`):** first FSRS-eligible observation for `find:<note>`. Unhinted `H0` success grades FSRS and satisfies **`RETENTION_MASTERED` (`isNoteRetentionMastered`)** (`state = 'retention'`). Unhinted `H0` failure records FSRS `Again (1)`, sets `'pending:delayedRetry'`, runs corrective + intervening landmark recall (`delayedRetrySpacing = 1`), and keeps the note as the active focus until an unhinted `H0` retry succeeds. Hinted `delayedCheck` (`Don't know` $\rightarrow$ `H2`) never mutates FSRS and requires intervening recall + `H0` retry.
- **Canonical Scheduler Activation Gate & 5-Level Queue Priority:**
  - [`isCurriculumCardActive(card, input)`](file:///c:/Projects/piano-key-trainer/src/core/learning/curriculumFlow.ts) and [`filterCurriculumActiveCards(cards, input)`](file:///c:/Projects/piano-key-trainer/src/core/learning/curriculumFlow.ts) exclude unseen white notes, ununlocked `identify:*` cards, and unactivated Phase 4–6 cards (`C#..A#`, `notationToKey`, `soundToKey`, `patternIdentify`) until their respective curriculum items reach `'retention'`.
  - [`resolveTrainingOrchestration(params)`](file:///c:/Projects/piano-key-trainer/src/core/learning/curriculumFlow.ts) enforces the 5-level priority: `due_scheduled_review` $\rightarrow$ `active_teaching_continuation` $\rightarrow$ `controlled_mixed_retrieval` $\rightarrow$ `next_curriculum_introduction` $\rightarrow$ `free_practice`.
- **Deterministic Existing-User Skip & Reload Resume:**
  - [`evaluateCurriculumEntry(input)`](file:///c:/Projects/piano-key-trainer/src/core/learning/curriculumFlow.ts) and [`hydrateWhiteKeyProgressFromEvidence(input)`](file:///c:/Projects/piano-key-trainer/src/core/learning/curriculumFlow.ts) inspect per-note evidence so existing users with `C/D/E` history resume at `bModel` (`resume_from_legacy_partial`), while mid-curriculum reloads deterministically reconstruct the exact step and mix/identify queue from `db.learningProgress`.

### 3.11 Black Keys, Staff Notation & Relative Ear Curriculum Activation (`src/core/learning/curriculum3d.ts`, `src/ui/components/Curriculum3dStage.svelte`)
Milestone 3D Rev2 extends curriculum-gated acquisition across Phases 4, 5, and 6 directly inside the **Training** (`Тренировка`) screen while preserving strict per-card FSRS activation integrity:
- **Phase 4 — Black Keys (`C# / Db`, `D# / Eb`, `F# / Gb`, `G# / Ab`, `A# / Bb`):**
  - Enters automatically after `phase3Complete` (`completeCurriculumPhase3()`).
  - Follows the 2-black (`C# → D# → twoBlackIdentify`) and 3-black (`F# → G# → A# → threeBlackIdentify`) structural groups, followed by `allBlackMix → allBlackIdentify → phase4Complete`.
  - Each black key progresses through `model` (`H3`, dual sharp/flat labels across `C2–B5`) $\rightarrow$ `guided` (`H2`, neighboring white/black group cue) $\rightarrow$ `qualify` (`H0` across $\ge 2$ octaves) $\rightarrow$ `localMix` (`H0` interleaved with neighboring white keys) $\rightarrow$ `delayedCheck` (`H0` first FSRS-eligible observation activating `find:<blackNote>`).
  - Completing `twoBlackIdentify`, `threeBlackIdentify`, and `allBlackIdentify` activates `identify:<blackNote>`, and `phase4Complete` unlocks the existing white-anchor `patternIdentify:C`, `patternIdentify:F`, `patternIdentify:E`, and `patternIdentify:B` cards (the app does not define `patternIdentify:<blackNote>` cards).
  - **User `settings.level === 'white'` Respected:** Even after Phase 4 (`curriculum-phase4:complete`) is in `'retention'`, `isCurriculumCardActive` and `App.svelte` queue filtering strictly exclude black-key cards whenever `settings.level === 'white'`. Black-key cards participate in scheduled/practice queues only when `settings.level === 'all'` (valid settings are `'white'` and `'all'`).
- **Phase 5 — Per-Note Treble Staff Notation (`notationToKey`, `C4–B4`):**
  - Progresses per note through `CURRICULUM_NOTATION_ORDER = ['C', 'F', 'G', 'D', 'E', 'A', 'B']`:
    - `C4` (bottom ledger line) $\rightarrow$ `F4` (first space) $\rightarrow$ `G4` (second line / G-clef anchor) $\rightarrow$ `D4` (below first line) $\rightarrow$ `E4` (first line) $\rightarrow$ `A4` (second space) $\rightarrow$ `B4` (third line) $\rightarrow$ `phase5Complete`.
  - Every note has its own `curriculum-notation-note:<Note>` and `curriculum-notation-mix:<Note>` records and passes through `notation<Note>Model` (`H3`) $\rightarrow$ `notation<Note>Qualify` (`H0`, 2 unhinted exact-octave successes) $\rightarrow$ `notation<Note>LocalMix` (`H0`, 3 interleaved exact-octave successes with adjacent/landmark staff notes) $\rightarrow$ `notation<Note>DelayedCheck` (`H0`).
  - Only an independent `H0` `notation<Note>DelayedCheck` activates `notationToKey:<Note>` in FSRS (`state = 'retention'`). Unactivated `notationToKey` cards remain excluded from the scheduler.
- **Phase 6 — Per-Note Relative Ear (`soundToKey`, `C4 → target` in octave 4):**
  - Progresses per note through `CURRICULUM_EAR_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B']`:
    - `C4` (unison `1̂`) $\rightarrow$ `D4` (`2̂`) $\rightarrow$ `E4` (`3̂`) $\rightarrow$ `F4` (`4̂`) $\rightarrow$ `G4` (`5̂`) $\rightarrow$ `A4` (`6̂`) $\rightarrow$ `B4` (`7̂`) $\rightarrow$ `phase6Complete`.
  - Every note has its own `curriculum-ear-note:<Note>` and `curriculum-ear-mix:<Note>` records and passes through `ear<Note>Model` (`H3`, plays `C4 → target`) $\rightarrow$ `ear<Note>Qualify` (`H0`, 2 unhinted exact-octave successes) $\rightarrow$ `ear<Note>LocalMix` (`H0`, 3 interleaved exact-octave successes) $\rightarrow$ `ear<Note>DelayedCheck` (`H0`).
  - Only an independent `H0` `ear<Note>DelayedCheck` activates `soundToKey:<Note>` in FSRS (`state = 'retention'`).
- **Unified `delayedCheck` Failure Remediation Across Phases 4, 5, and 6:**
  - An unhinted (`H0`) wrong answer on any `delayedCheck` (`csDelayedCheck..asDelayedCheck`, `notationCDelayedCheck..notationBDelayedCheck`, `earCDelayedCheck..earBDelayedCheck`) records **at most one** FSRS `Again (1)` event (`fsrsActivation: { cardId, hintUsed: false, firstCorrect: false }`), marks `'pending:delayedRetry'` + `'pending:corrective'` in `LearningProgressRecord.contexts`, and enters corrective mode (`H2`, `gradeableByFsrs: false`).
  - Subsequent wrong clicks during corrective or intervening recall **never** emit additional FSRS reviews.
  - After the learner plays the corrective target (`'pending:interveningRecall'`), they must complete `delayedRetrySpacing = 1` unhinted intervening landmark recall before returning to a fresh independent `H0` `delayedCheck` retry (`awaitingDelayedRetry = false`). Reloading mid-remediation deterministically restores `awaitingDelayedRetry`, `delayedCheckCorrective`, or `interveningRecallRemaining` from persisted contexts.
  - **Immediate Remediation Persistence on `Don't know`:** Clicking `Don't know` on any `delayedCheck` immediately writes `'pending:delayedRetry'` and `'pending:corrective'` to the active note's `LearningProgressRecord`, emits **0** FSRS events (`fsrsDelayedCheck = null`), enters corrective mode (`H2`), and requires intervening recall (`'pending:interveningRecall'`) followed by a fresh unhinted `H0` retry. An immediate page reload restores the `H2` corrective state rather than allowing an unearned fresh `H0` retry.
- **Context-Aware `identify` Answer Buttons (`getIdentifyAnswerSet` — Variant 1):**
  - **`white-only`:** 1 row of 7 natural note buttons (`C · До` .. `B · Си`).
  - **`black-only`:** 1 row of accidental buttons (`2` in `twoBlackIdentify`, `3` in `threeBlackIdentify`, `5` in `allBlackIdentify`) with dual sharp/flat labels (`C# / Db · До♯ / Ре♭`, etc.).
  - **`mixed-chromatic` (`level === 'all'` after black-key `identify` activation):** 2-row piano-stack (`5` upper accidental buttons `C# / Db .. A# / Bb` above `7` lower natural buttons `C .. B`). Holding `Shift` highlights the upper accidental row (`shift-active`) to reinforce the `Shift + C/D/F/G/A` keyboard shortcut, while clicking any button directly submits that note without requiring `Shift`. Enharmonic equivalents (`Db` $\leftrightarrow$ `C#`, etc.) are normalized via `normalizeToCanonicalPitchClass` / `isCanonicalPitchMatch`.

### 3.12 Daily Practice Orchestration & Curriculum Consolidation (`src/core/learning/dailyPractice.ts`)
Milestone 3E establishes the post-curriculum consolidation life cycle: **"Curriculum introduces no new material after Phase 6. Scheduler manages memory retention, while Training organizes daily practice, reinforcement, and cross-skill transfer."**
- **Strict 6-Phase Scope Boundary:**
  - The core curriculum consists of exactly 6 phases (`Phase 1 C/F`, `Phase 2 D/E/B`, `Phase 3 G/A`, `Phase 4 Black Keys`, `Phase 5 Notation`, `Phase 6 Ear`). No Phase 7 is created.
  - Graduation requires `PHASE6_COMPLETE` (`curriculum-phase6:complete`) in `learningProgress`.
- **Graduation Screen & Auto-Skip:**
  - On first completing Phase 6, the learner sees the graduation modal (`isGraduationScreenActive`) with 4 checklist items (White keys, Black keys, Grand staff notation, Relative ear) and the primary action button `Начать ежедневную тренировку →`.
  - Clicking the graduation button persists `curriculum-phase6:complete` with `state: 'retention'`, clears curriculum stage state, and transitions immediately into daily practice.
  - On any subsequent app startup or reload, [`isCoreCurriculumComplete()`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts) detects completion and automatically skips the graduation screen (`evaluateCurriculumEntry` returns `skip_completed`), launching the daily retention session directly.
- **Pure 5-Priority Daily Practice Orchestrator ([`resolveDailyPracticeNext`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts)):**
  1. **`due_scheduled_review`:** Splatná FSRS opakování aktivních karet (`card.dueAt <= now`). Má absolutní přednost. Returns `priority: 'due_scheduled_review'`, `trialMode: 'scheduledReview'`, `eyebrowLabel: 'ПЛАНОВОЕ ПОВТОРЕНИЕ'`.
  2. **`weak_reinforcement`:** Karty vyžadující upevnění dle centralizovaných prahů `WEAK_CARD_THRESHOLDS` ($S < 4.0$, $\text{lapses} \ge 1$, $\text{trials} \ge 2$, úspěšnost $< 75\%$, $D \ge 6.5$) přes [`selectWeakCard`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts). Slabá karta má striktní přednost a nikdy nesmí být přeskočena transferem. Returns `priority: 'weak_reinforcement'`, `trialMode: 'mixedRetrieval'`, `eyebrowLabel: 'ЗАКРЕПЛЕНИЕ'`.
  3. **`confusion_contrast`:** Kontrastní páry z registrovaných chyb a matice záměn přes [`chooseConfusionPractice`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts). Returns `priority: 'confusion_contrast'`, `trialMode: 'mixedRetrieval'`, `eyebrowLabel: 'КОНТРАСТ'`.
  4. **`transfer`:** Přenášení dovedností do komplementárních módů přes deterministický [`selectTransferCard`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts) (0 `Math.random()`, čistá stabilní rotace). Nastupuje periodicky (každá 3. úloha po vyřešení due a slabých míst; preset `quick` limitován na max. 2 transfery). Returns `priority: 'transfer'`, `trialMode: 'transfer'`, `eyebrowLabel: 'ПЕРЕНОС НАВЫКА'`.
  5. **`free_practice`:** Udržovací procvičování nad aktivními retenčními kartami přes [`choosePractice`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts). Returns `priority: 'free_practice'`, `trialMode: 'freePractice'`, `eyebrowLabel: 'ЗАКРЕПЛЕНИЕ'`.
- **Transfer Visual Isolation ([`resolveCardVisualConfig`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts)):**
  - Transfer pro `notationToKey` je striktně zmrazen na houslový klíč a rozsah `C4–B4` (uživatelské nastavení `settings.notationClef = 'bass' | 'grand'` se ignoruje).
  - Transfer pro `soundToKey` je striktně zmrazen na rozsah `C4–B4` s referenčním tónem `C4`.
- **Controlled Interleaving Constraints ([`checkInterleavingConstraint`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts)):**
  - $\le 2$ consecutive tasks of the same skill (`maxConsecutiveSameSkill = 2`).
  - $\le 2$ consecutive tasks of the same pitch class (`maxConsecutiveSamePitchClass = 2`).
  - No immediate repetition (`avoidImmediateRepetition = true`).
  - **Urgency Override:** Due FSRS review urgency strictly overrides cosmetic interleaving constraints when due cards remain.
- **FSRS Invariance & Clean Feedback for Transfer Trials:**
  - Transfer trials run with `TrialMode = 'transfer'` and `gradeableByFsrs = false`.
  - They never mutate card stability, difficulty, reps, lapses, or due date.
  - User-facing text completely omits FSRS internal terminology and `Again` mentions.
  - Corrective feedback: `✓ Исправлено (N-я попытка). Это задание служит для переноса навыка и не меняет расписание повторений.`
- **Session Presets & Exit Conditions:**
  - `quick`: 3-minute timed daily session (max 2 transfer trials).
  - `normal`: 8-minute standard daily session.
  - `due`: All-due session. Exits immediately when all due cards are answered (`due_complete`), opening the completion modal without synthetic padding or extra questions.
- **Session Summary Integration ([`buildDailyPracticeSummary`](file:///c:/Projects/piano-key-trainer/src/core/learning/dailyPractice.ts)):**
  - In `App.svelte` and `SessionSummaryModal.svelte`: displays `Плановые повторения: X`, `1-я попытка: X%`, `Закрепление: X%` (only if reinforcement trials occurred), `Перенос навыка: X/Y` (only if transfer trials occurred), and `Ошибочные пары: ...` (only if confusion errors registered).
  - Omits irrelevant `Новых: 0` for post-curriculum graduates.
- **Derived Retention Mastery in ProgressView:**
  - `Стабильно` ($S \ge 7.0$ days, lapses $\le 1$).
  - `Освоено` ($2.5 \le S < 7.0$ days).
  - `На закреплении` ($S < 2.5$ days or lapses $\ge 1$).

### 3.13 Session Completion & Identify Visual-State Integrity (Milestone 3E Rev2 — COMPLETE)
- **Problem Statement & Root Cause:**
  - After all due cards completed (`sessionPreset === 'due'`, `due = 0`), the old question `Какая нота подсвечена на клавиатуре?` and answer buttons remained visible in Task Stage, while zero piano keys were highlighted.
  - Root cause was twofold: (1) `currentCard` was never reset to `null` on session completion in `finishLearningSession()` or `nextRound()` completion branch; (2) Task Stage lacked an `{:else if isSessionEnded}` template guard before `{:else if currentCard}`, causing Svelte to render the stale identify question over cleared `targetKeyIds = []`.
- **Architectural Solution & Lifecycle Invariants:**
  - **Centralized `activateTask({ card, kind, eyebrowLabel })`:** Computes `PracticeCardVisualConfig` first, runs defensive invariant validation, and atomically updates `targetKeyId`, `targetKeyIds`, `currentTaskEyebrow`, `currentKind`, and `currentCard`.
  - **Centralized `clearActiveTask()`:** Cleans `currentCard = null`, `targetKeyId = null`, `targetKeyIds = []`, auto-advance countdowns, feedback messages, and timers atomically upon completion or session restart.
  - **Identify Invariant (`validateIdentifyVisualInvariant`):** Whenever `currentCard.skill === 'identify'` and `!isSessionEnded`, strictly asserts `targetKeyId !== null && targetKeyIds.length === 1 && targetKeyIds[0] === targetKeyId`. When `isSessionEnded === true`, strictly asserts `card === null && targetKeyId === null && targetKeyIds.length === 0`.
  - **Enharmonic Physical Mapping:** `CANONICAL_ACCIDENTAL_MAP` / `toCanonicalNoteName` normalizes accidental cards (e.g. `Db`, `Eb`, `Gb`, `Ab`, `Bb`) to the single physical key on the keyboard (e.g. `Db` $\rightarrow$ `C#4`), ensuring chromatic identify questions highlight exactly 1 physical black key.
  - **Dedicated Session Completion Stage:** `{:else if isSessionEnded}` rendered in `App.svelte` Task Stage before `{:else if currentCard}`, presenting `.session-complete-card` („Все плановые повторения выполнены“ / „Сессия завершена“) with clean completion actions (`Показать итоги сессии` / `Начать новую сессию`) without any question prompts, answer buttons, or lingering target highlights.
- **Verification:** 200/200 tests passing (+9 tests in `dailyPractice.test.ts`), full typecheck and build verified, acceptance screenshots 16–19 captured.

### 3.14 Bass Clef & Grand Staff Transfer (Milestone 3F Rev2 — COMPLETE)
- **Scope & Core Curriculum Invariant:**
  - The core curriculum remains strictly 6 phases. No "Phase 7" is created.
  - Bass Clef & Grand Staff is designed as the first independent Advanced Module (**Дополнительные модули**) available to learners after core graduation (`isBassGrandModuleAvailable`).
- **Enrollment & Practice Workspace Integration:**
  - **Manual Enrollment:** Visible in `CurriculumView.svelte` under the dedicated "Дополнительные модули" card with dynamic actions: `[ Начать модуль → ]` (available), `[ Продолжить → ]` (in progress), and `[ ✓ Завершено (повторить) ]` (completed).
  - **Unified Teaching Stage:** Activating the module switches the main **Training** screen into `<AdvancedNotationStage>` (`src/ui/components/AdvancedNotationStage.svelte`), following the established pedagogical stage pattern.
- **Card & Skill Model:**
  - New skill `notationBassToKey` for natural notes $C3–B3$.
  - Existing `notationToKey` remains strictly treble clef $C4–B4$ and is never repurposed, aliased, or mutated by bass learning.
  - **Exact Octave Policy:** `SKILL_INPUT_POLICY.notationBassToKey` specifies `pcNote: false`, `answerButton: false`, `pianoKey: true`, `midi: true`, `requiresExactOctave: true`.
  - Playing the correct pitch class in the wrong octave (e.g. $F4$ instead of $F3$) returns a helpful non-punitive guidance message `wrong_octave` („Верная нота, но сыграна не та октава...“) and does not record a success.
- **Landmark-Anchored Acquisition Order:**
  - Notes are introduced systematically in anchor-based order:
    1. $F3$ — landmark line (4th line between the two dots of the F-clef).
    2. $C3$ — 2nd space.
    3. $E3$ — 3rd line.
    4. $G3$ — 4th space.
    5. $D3$ — 3rd space.
    6. $A3$ — 1st space / 5th line.
    7. $B3$ — 2nd line / above staff.
  - Each note follows the pedagogical pipeline: `MODEL` (H3) $\rightarrow$ `QUALIFY` (H0, streak 2) $\rightarrow$ `LOCAL MIX` (H0, streak 3) $\rightarrow$ `DELAYED CHECK` (H0 with distractor).
  - FSRS card activation occurs **only** upon successful completion of the independent `DELAYED CHECK`.
- **Delayed-Check Remediation Lifecycle & Reload Persistence:**
  - Protocol: Error or "Don't know" marks `pending:delayedRetry` and `pending:corrective`.
  - Corrective press removes `pending:corrective` and adds `pending:interveningRecall` (contrast distractor step).
  - Intervening recall press removes `pending:interveningRecall` while preserving `pending:delayedRetry` for a fresh H0 retry.
  - Successful H0 retry clears all `pending:*` contexts.
  - FSRS invariance: Exactly 1 `Again (1)` on initial wrong attempt; 0 on "Don't know"; 0 on subsequent retries after reload (`firstAttempt` is validated by absence of `pending:delayedRetry`).
  - Reloading at any stage of remediation faithfully restores state: H2 corrective prompt with highlighted target key, intervening recall prompt, or fresh unhinted H0 retry.
- **Grand Staff Transfer, Completion Gate & Pending-Trial Persistence (Rev2):**
  - After mastering all 7 bass notes ($C3–B3$), the module proceeds to Grand Staff orientation and transfer.
  - **Strict Completion Gate:** Completion requires all three criteria:
    1. At least 12 trials completed (`completedTrials >= 12`).
    2. First-attempt accuracy $\ge 80\%$ (`correctFirstAttempts / completedTrials >= 0.8`).
    3. Both clefs (treble and bass) represented in the session.
  - **Pending-Trial Persistence (Rev2):** Upon wrong answer or "Don't know" during Grand Transfer, context `pending:grandCorrective` is immediately persisted to `advanced-grand:transfer`. Upon reload, the exact same deterministic target is restored with `awaitingCorrective = true` and the target key highlighted on the keyboard. Corrective attempt after reload cannot count as a first attempt: pressing the target key removes `pending:grandCorrective`, increments `completedTrials` by 1, and leaves `correctFirstAttempts` unchanged. Repeated reload preserves the corrective state.
  - Grand Staff transfer produces NO FSRS mutations (`trialMode = 'transfer'`, `gradeableByFsrs = false`).
  - **Caption Uniformity:** Grand Staff caption in `Staff.svelte` is standardized to `Акколада (Grand Staff): басовый + скрипичный ключ`.
- **Daily Practice Integration & Grand Staff Integrity:**
  - Scheduled `notationBassToKey` reviews are strictly displayed on the bass staff.
  - Invariant: `notationBassToKey` is ALWAYS bass clef; `notationToKey` is ALWAYS treble clef. The user preference `settings.notationClef` cannot alter scheduled card semantics.
  - `activateTask` in `App.svelte` passes `isGrandStaff: decision.isGrandStaff` to `resolveCardVisualConfig`.
  - During Grand Staff transfer in Daily Practice, `<Staff clef="grand">` renders the full brace and both staves with one target note on the appropriate staff under eyebrow `ПЕРЕНОС · БОЛЬШАЯ СИСТЕМА`.
- **Progress Tracking & UI Badging:**
  - `ProgressView.svelte`: Displays a distinct "Басовый" row for `notationBassToKey` alongside "Скрипичный" (`notationToKey`) under each note card.
  - Grand Staff mastery banner: "Большая система (Grand Staff): освоено [✓ Перенос активен]".
- **Verification:**
  - **230/230 tests** passing across 12 test suites (+30 unit tests in `tests/unit/bassGrandStaff.test.ts`).
  - Strict typecheck (`tsc --noEmit`) clean (0 errors).
  - Production build successful.
  - **17 acceptance screenshots** (`m3f-01` through `m3f-17` including `17-grand-transfer-wrong-reload-corrective.png`) verified.

### 3.15 Interval Foundations (Milestone 3G Rev1 — COMPLETE)
- **Pedagogical Objective & Triad Grounding:**
  - Milestone 3G introduces 4 fundamental ascending intervals: `P8` (Octave, 12 semitones), `P5` (Perfect 5th, 7 semitones), `M3` (Major 3rd, 4 semitones), and `m3` (Minor 3rd, 3 semitones).
  - Grounding intervals as physical semitone distance and tactile keyboard shapes forms the prerequisite foundation for Milestone 3H (Major and Minor triads as $1–3–5$ structures).
- **Core Curriculum Invariant & Availability Gate:**
  - The core curriculum remains strictly 6 phases. No "Phase 7" is created.
  - The module lives under `Программа → Дополнительные модули` as "Интервалы" (`data-module="intervals"`).
  - Unlocks exclusively when both Core Curriculum (Phase 6 graduation) AND Milestone 3F (Bass Clef & Grand Staff) are completed (`isIntervalAvailable`).
- **Card & Skill Architecture:**
  - Introduces 2 dedicated skills: `intervalBuild` and `intervalIdentify`.
  - Defines exactly 8 FSRS cards: 4 build cards (`intervalBuild:P8|P5|M3|m3`) and 4 identify cards (`intervalIdentify:P8|P5|M3|m3`).
  - Unified `NoteName = PitchClass | IntervalNoteName` in `src/core/fsrs/types.ts`.
- **Pedagogical Progression & Canonical Guided Stage:**
  - Structured acquisition order: `intervalOrientation` (semitone/whole-tone units) $\rightarrow$ `P8` $\rightarrow$ `P5` $\rightarrow$ `M3` $\rightarrow$ `m3` $\rightarrow$ `contrastM3m3` (visual/tactile comparison of 4 vs 3 semitones) $\rightarrow$ `intervalIdentify` (`P8 → P5 → M3 → m3`) $\rightarrow$ `intervalTransfer` $\rightarrow$ `moduleComplete`.
  - For each build step: `MODEL` (H3, root and target visible, Continue button) $\rightarrow$ `GUIDED` (H2, root visible, target hidden, semitones span instruction, no FSRS mutation) $\rightarrow$ `QUALIFY` (H0, root visible, target hidden, independent press) $\rightarrow$ `LOCAL MIX` (multiple roots) $\rightarrow$ `DELAYED CHECK` (H0 unhinted memory check).
- **Canonical Delayed-Check Remediation Lifecycle & Reload Persistence:**
  - Stisk „Не знаю“ on delayed check: **0 FSRS mutations**, sets `pending:delayedRetry` and `pending:corrective`, enters H2 corrective prompt.
  - Wrong attempt or wrong octave on delayed check: **exactly 1 Again (1)**, sets `pending:delayedRetry` and `pending:corrective`, enters H2 corrective prompt.
  - Corrective press: clears `pending:corrective`, sets `pending:interveningRecall` (contrast step).
  - Intervening recall step: clears `pending:interveningRecall`, preserves `pending:delayedRetry`, returns learner to clean H0 delayed check retry.
  - Delayed retry success: clears all `pending:*` contexts, sets `retention` / `fsrsActivated`, with **0 additional FSRS mutations** (the card was already graded on the first attempt).
  - Reload at any stage faithfully restores state: corrective target key and prompt, intervening recall, or unhinted H0 retry.
- **Input Matrix, Exact Octave & Daily Practice Integration:**
  - `intervalBuild`: Screen piano and MIDI enabled (`pianoKey: true`, `midi: true`). Exact octave is strictly required (`requiresExactOctave: true`). Note letter keys and answer buttons are disabled.
  - Playing the correct pitch class in the wrong octave triggers a dedicated non-punitive `wrong_octave` diagnosis (`feedbackTone = 'warn'`) and highlights the required key.
  - In Daily Practice scheduled reviews, `intervalBuild` highlights ONLY the root key as a structural guide stimulus (`structuralGuideKeyIds = [rootKeyId]`), while the target key remains hidden (`targetKeyIds = []`).
  - `intervalIdentify`: Answer buttons enabled (`answerButton: true`) and mapped to number keys `1..4` (`Digit1..Digit4` / `Numpad1..Numpad4`). Screen piano clicks and MIDI are disabled. Direct interval comparison via `isSemanticAnswerCorrect()` ensures exact ID match without pitch-class normalization.
  - In Daily Practice, `#answersCard` is visible below the keyboard with a clean 4-button layout and hidden duplicate hotkey overlay.
- **Transfer Stage, 8-Combination Cycle & Corrective Persistence:**
  - Completion gate requires $\ge 12$ completed trials, $\ge 80\%$ first-attempt accuracy, both skills (`intervalBuild` and `intervalIdentify`), all 4 intervals (`P8`, `P5`, `M3`, `m3`), and chromatic roots (`F#3`, `C#4`, `D#4`).
  - First 8 trials deterministically cycle all 8 skill × interval combinations with chromatic roots.
  - Errors or "Don't know" persist `pending:intervalTransferCorrective` to `advanced-interval:transfer`.
  - Reloading preserves the exact same trial and restorative state (`awaitingCorrective = true`). A corrective response clears the flag and advances trials without inflating first-attempt accuracy. Corrective prompts guide build ("Нажмите подсвеченную клавишу...") vs identify ("Выберите правильный интервал на кнопках ниже...").
- **UI Cleanliness:**
  - Zero internal labels (`H3`, `H2`, `H0`, `FSRS`) exposed to user.
  - Standardized Russian badges: `ПОКАЗ`, `С ПОДСКАЗКОЙ`, `САМОСТОЯТЕЛЬНО`, `ПРАКТИКА`, `ПРОВЕРКА ПО ПАМЯТИ`.
- **Verification & Acceptance:**
  - **271/271 unit tests passed** across 13 test suites (+41 comprehensive tests in `tests/unit/intervals.test.ts`).
  - Strict typecheck (`tsc --noEmit`) clean (0 errors).
  - Production build clean.
  - All **22 acceptance screenshots** captured in `acceptance/m3g/` and synced to artifacts (`01-program-interval-module.png` through `22-daily-scheduled-identify-buttons.png`).

### 3.14 Major & Minor Triads Advanced Module (Milestone 3H)
Milestone 3H bridges physical interval perception into functional harmony by introducing root-position major and minor triads as $1–3–5$ structures:
- **Harmonic Foundation & Invariants:**
  - Builds upon semitone intervals mastered in Milestone 3G ($M3 = 4$, $m3 = 3$, $P5 = 7$ semitones):
    - Major triad: $\text{root} + M3 (4\text{ st}) + P5 (7\text{ st})$
    - Minor triad: $\text{root} + m3 (3\text{ st}) + P5 (7\text{ st})$
  - Core pedagogical insight: the fifth ($P5 = 7$ st) is identical in both chords; only the third shifts by 1 semitone.
  - Taught strictly in root position ($1–3–5$). Inversions are not yet taught as targets, but are constructively diagnosed.
- **Core Curriculum Invariant & Availability Gate:**
  - Core curriculum remains strictly 6 phases (Phases 1–6). No "Phase 7" exists.
  - The module lives under `Программа → Дополнительные модули` as "Мажорные и минорные трезвучия" (`data-module="triads"`).
  - Availability prerequisite: unlocks strictly after completing Milestone 3G (Intervals) via `isTriadModuleAvailable`.
  - Does NOT auto-start on load or reload; requires explicit user action via [ Начать ].
- **Card & Skill Architecture:**
  - 2 new skills: `triadBuild` and `triadIdentify`.
  - 4 FSRS memory cards: `triadBuild:major`, `triadBuild:minor`, `triadIdentify:major`, `triadIdentify:minor`.
  - Unified `NoteName = PitchClass | IntervalNoteName | TriadQuality` in `src/core/fsrs/types.ts`.
  - Pure chord utilities in `src/core/input/chordInput.ts`: `sortKeyIdsByPitch`, `toggleKeyInChordSelection`, `areChordKeyIdsEqual`, `MidiChordTracker`.
- **Input Routing & Non-Punitive Diagnostics:**
  - `triadBuild`: Screen piano multi-key selection with visual highlighting (`.white-key.selected`, `.black-key.selected`), selection counter bar (`Выбрано клавиш: N из 3`), and submit button (`data-action="triad-submit-chord"`). MIDI chord entry supported via held-note tracker (`MidiChordTracker`: evaluates when exactly 3 unique MIDI notes are simultaneously held; locks until all notes are released).
  - Strict root position required with constructive feedback:
    - `wrong_voicing`: inversion played (e.g. $E4–G4–C5$ instead of $C4–E4–G4$). Non-punitive feedback: "Вы сыграли обращение аккорда. Постройте трезвучие в основном положении: 1 – 3 – 5 (основной тон внизу)."
    - `wrong_quality`: minor played instead of major or vice versa. Feedback: "Получился [Root] минор. Для мажора терция должна быть на полутон выше." (or vice versa).
    - `wrong_octave`: correct chord pitch classes but wrong register. Feedback: "Тот же аккорд, но сыгран не в той октаве..."
    - `incomplete_chord`: fewer than 3 notes submitted.
  - `triadIdentify`: Piano keyboard displays 3 stimulus keys (`targetKeyIds`). Two answer buttons `Мажор` / `Минор` with hotkeys `1` and `2` (`Digit1/2`, `Numpad1/2`). Screen piano clicks and MIDI are disabled for answer input.
- **Milestone 3H Rev1 Fixes (Chord Grading, Diagnostics & Root Rotation):**
  - **Dedicated Daily Practice Chord Evaluator:** `handleDailyChordSubmit` in `App.svelte` delegates to `evaluateDailyChordAttempt()` in `src/core/learning/triads.ts`. Single-note match in `inputPolicy.ts` is explicitly blocked for `triadBuild`, preventing accidental false positives (e.g. C-Eb-G matching C4).
  - **Diagnostic Feedback Survival:** In Daily Practice, detailed diagnoses (`wrong_quality`, `wrong_voicing`, `wrong_octave`) survive without being overwritten by generic error text.
  - **Deterministic Root Rotation:** `CANONICAL_TRIAD_PRACTICE_ROOTS` and `resolveTriadPracticeRootKeyId()` rotate white and chromatic roots deterministically in Daily Practice across `C2–C6` for both `triadBuild` and `triadIdentify`.
  - **Transfer Persistence & Completion Gate Regressions:** Tests verify `pending:triadTransferCorrective` reload persistence, corrective response trial increment without falsely inflating first-attempt accuracy, and strict graduation gating ($\ge 12$ trials, $\ge 80\%$ accuracy, coverage of both skills, qualities, and chromatic roots).
- **Pedagogical Stages & Canonical Guided Stage:**
  - Structured acquisition order: `triadOrientation` (explaining $1–3–5$ and semitone formulas) $\rightarrow$ `majorBuild` $\rightarrow$ `minorBuild` $\rightarrow$ `contrastMajorMinor` (visual/tactile comparison of third shift) $\rightarrow$ `triadIdentify` (`major → minor`) $\rightarrow$ `triadTransfer` $\rightarrow$ `moduleComplete`.
  - Build stages follow canonical sequence: `MODEL` (H3, all 3 keys highlighted with chord playback) $\rightarrow$ `GUIDED` (H2, root visible as stimulus, target keys hidden, formula hint $4+3$ or $3+4$, 0 FSRS mutations) $\rightarrow$ `QUALIFY` (H0, 2 independent successes) $\rightarrow$ `LOCAL MIX` (interleaved roots) $\rightarrow$ `DELAYED CHECK` (H0 unhinted memory check).
- **Canonical Delayed-Check Remediation Lifecycle & Reload Persistence:**
  - "Don't know" on delayed check: **0 FSRS mutations**, persists `pending:delayedRetry` and `pending:corrective`, enters H2 corrective prompt.
  - Error or wrong voicing on delayed check: **exactly 1 Again (1)**, persists `pending:delayedRetry` and `pending:corrective`, enters H2 corrective prompt.
  - Corrective submission: clears `pending:corrective`, sets `pending:interveningRecall` (contrast step).
  - Intervening recall: clears `pending:interveningRecall`, preserves `pending:delayedRetry`, returns learner to clean H0 delayed retry.
  - Delayed retry success: clears all `pending:*` contexts, sets `retention` / `fsrsActivated`, with **0 additional FSRS mutations**.
  - Reloading at any stage faithfully restores state: corrective target keys and prompt, intervening recall, or unhinted H0 retry.
- **Transfer Stage, 8-Combination Cycle & Corrective Persistence:**
  - Completion gate requires $\ge 12$ completed trials, $\ge 80\%$ first-attempt accuracy, both skills (`triadBuild` and `triadIdentify`), both qualities (`major` and `minor`), and chromatic roots (`F#3`, `C#4`, `D#4`, etc.).
  - First 8 trials deterministically cycle all 8 skill × quality × root combinations.
  - Errors or "Don't know" persist `pending:triadTransferCorrective` to `advanced-triad:transfer`.
  - Reloading preserves the exact same trial and restorative state (`awaitingCorrective = true`).
- **Daily Practice Integration:**
  - `triadBuild`: Root key is highlighted as stimulus (`structuralGuideKeyIds`), target keys remain hidden (`targetKeyIds = []`), multi-key selection bar and submit button are active.
  - `triadIdentify`: 3 chord keys are highlighted as stimulus (`targetKeyIds`), answer buttons `Мажор` / `Минор` are active below the keyboard with hotkeys `1` / `2`.
- **UI Cleanliness:**
  - Zero internal labels (`H3`, `H2`, `H0`, `FSRS`) exposed to user.
  - Standardized Russian badges: `ПОКАЗ`, `С ПОДСКАЗКОЙ`, `САМОСТОЯТЕЛЬНО`, `ПРАКТИКА`, `ПРОВЕРКА ПО ПАМЯТИ`.
- **Verification & Acceptance:**
  - **323/323 unit tests passed** across 14 test suites (+52 comprehensive tests in `tests/unit/triads.test.ts`).
  - Strict typecheck (`tsc --noEmit`) clean (0 errors).
  - Production build clean.
  - All **28 acceptance screenshots** captured in `acceptance/m3h/` and synced to artifacts (`01-curriculum-advanced-module-locked.png` through `28-progress-triads.png`).

---

## 4. Audio, MIDI, UI & Storage Guidelines

1. **Acoustic Audio Only:** `AudioEngine.ts` uses Salamander Grand Piano (Yamaha C5) samples across `C2–C6`. Never introduce oscillator synth fallbacks.
2. **Persistent Bottom-Docked Keyboard (`C2–C6`):** `Keyboard.svelte` is a fixed visual anchor in the practice workspace. Feedback, prompts, answer buttons, or timers must never shift the piano vertically, and `:focus-visible` must never raise white keys above black keys.
3. **Separated Performance Metrics:** Pitch accuracy, rhythm timing error, MIDI velocity dynamics (`p` / `mf` / `f`), MIDI hold-duration articulation (`legato` / `detached`), and two-hand onset simultaneity are evaluated and stored independently from FSRS memory scheduling.
4. **IndexedDB & Legacy Migration:** `PianoTrainerDB` (`src/storage/db.ts`, schema v2 including `learningProgress`) is the primary store. `LegacyMigrator` (`src/storage/migrator.ts`) migrates legacy `localStorage` data once on startup. `src/services/supabase.ts` provides optional cloud-sync scaffolding when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured, but is not currently part of the active user workflow.

---

## 5. Quality Gates & Developer Workflow

Run the quality-gate commands from the repository root:

```bash
# TypeScript strict typecheck (strict: true, noUnusedLocals: true, noUnusedParameters: true)
npm run typecheck

# Svelte-aware component and TypeScript diagnostics (mandatory; tsc alone does not check App.svelte contracts)
npm run check:svelte

# Unit test suite (Vitest)
npm test

# Production bundle & PWA build
npm run build

# Full verification pipeline (typecheck + Svelte check + test + build)
npm run verify
```

## Runtime Interaction Integrity Hotfix — 2026-10-03

**Status:** accepted on 2026-10-03. The accepted archive has 120 unique files, no legacy screenshots, nested ZIPs, `dist`, `node_modules`, or `.git`; its report records 414/414 tests, clean Svelte checking, a production build, and browser smoke. Stabilization Rev2 remains the prior accepted baseline. This checkpoint fixed Triad Identify answer routing and made Svelte integration checking mandatory.

- `TriadAction` has one answer contract: UI buttons and `Digit1/2` + `Numpad1/2` resolve to `{ type: 'selectAnswer', quality }`. A correct Major answer shows success feedback and advances from `majorIdentifyQualify` to `majorIdentifyDelayedCheck`; Minor on a Major stimulus shows corrective feedback. Identify remains button/number-key input; MIDI pitches do not answer it.
- The daily Identify presentation validates triad-quality and inversion card values before using them. The action boundary audit covered FirstRun, Curriculum, Curriculum3D, Bass / Grand Staff, Intervals, Triads, and Inversions. `svelte-check` reports 0 errors and 0 warnings; the deliberate `selectQuality` action probe in `App.svelte` failed on the `TriadAction` union and was reverted.
- `npm run verify` is now the required pipeline: TypeScript typecheck, Svelte-aware check, Vitest, production build, and PWA generation. The latest run passed 21 test files / 414 tests. Vite emitted only its large-chunk-size advisory.
- `npm run smoke:runtime-integrity` uses a fresh Chrome profile and synthetic progress, then tests production Triad Identify buttons, `Digit1/2`, `Numpad1/2`, ignored MIDI input, exactly one ReviewLog for one gradeable answer, plus Interval and Inversion Identify button/keyboard regressions. Latest production run: all assertions passed; 0 runtime exceptions and 0 console errors.
- New evidence is in `RUNTIME_INTEGRITY_REPORT.md` and `acceptance/runtime-integrity/screenshots/`. The package command is `npm run package:runtime-integrity`; its ZIP allowlist excludes earlier acceptance screenshots, the local browser seed, browser profiles, `dist`, `node_modules`, and nested ZIPs.

**Acceptance boundary:** this Runtime Integrity Hotfix is accepted. The next checkpoint is Milestone 3I Finalization below; do not start full harmony/accompaniment curriculum work until that checkpoint is independently accepted.

### 3.15 Chord Inversions and Chord Symbols (Milestone 3I Accepted Baseline)

**Scope:** the accepted M3I module is the prerequisite baseline for M3J. Canonical source is `src/core/learning/chordInversions.ts`; the active UI is `src/ui/components/InversionStage.svelte`. Its `C → G/B → Am → F` exercise introduced slash-chord use; M3J now develops the separate learner-facing #10 curriculum.

- **Canonical stage order:** Orientation → First Inversion Model → Guided → Qualify → Local Mix → Delayed Check → Second Inversion Model → Guided → Qualify → Local Mix → Delayed Check → Contrast → Identify Model → Qualify → Delayed Check → Chord-Symbol Orientation → Slash Model → Guided → Qualify → Delayed Check → four-step Harmony Sequence → Transfer → Complete. Local Mix repeats until its existing threshold is met.
- **Build contract:** every build requires a complete three-note chord. Guided stages identify the bass hint as not already selected; the learner enters all three notes. Screen piano keys are selected in sequence and submitted; MIDI evaluation fires at exactly three held notes. Identify uses the highlighted chord as stimulus and semantic buttons or `1/2/3`, `Digit1/2/3`, `Numpad1/2/3`; piano keys and MIDI are not answer channels. PC piano-note shortcuts are not provided.
- **Keyboard semantics:** bass hints receive a `БАС` badge; Identify's blue keys are explained as a displayed stimulus; selected, correct, and wrong states have a compact legend. Model screens expose only the Continue action.
- **Transfer policy:** one first-attempt block is exactly 16 trials; it must reach at least 80% and full deterministic coverage. A failed block stops at its result screen. The learner practises up to four missed task types, then gets a fresh eight-trial retry block with the same accuracy and coverage requirements. Corrective answers never add first-attempt trials or accuracy. New block state is stored in the optional `transferAssessment` field; legacy failed runs at or beyond 16 open a result instead of continuing as `N/16`. Both cycles cover major/minor, first/second inversions, all three task skills, normal/slash symbols, and chromatic roots.
- **Persistence and completion:** pending corrective state restores the same transfer item after reload. Passing writes the transfer record and the module completion record in the same action; reloading derives `moduleComplete` from persisted completion. The shared `resolveAdvancedModuleStates` result remains the source for Program, Learning Roadmap, Diagnostics, and the start handler. Triads completion is the prerequisite for M3I.
- **Daily Practice:** inversion build, Identify, and slash-symbol cards activate from their corresponding M3I retention records at both white/all levels; delayed-retry records remain inactive. The slash-symbol card additionally requires chord-symbol and slash-build retention. The slash-build card resolves to a concrete supported slash chord instead of treating `slash` as an inversion. Build and slash cards require three notes and grade triad quality, pitch classes, bass/inversion, and requested voicing. Inversion Identify uses one semantic answer action. Incomplete daily chord entry is ignored before first-answer commit; MIDI held-note progress is visible, and the tracker locks evaluation until all chord notes are released.
- **Progress and terminology:** the Progress section uses learner-facing repetition/status wording and does not show M3I internal card IDs, hint codes, or FSRS terminology. At M3I acceptance, its sequence remained introductory; #10 is now handled by M3J.
- **Finalization evidence:** `M3I_FINAL_REPORT.md`, `acceptance/m3i-final/README.md`, and at most six screenshots record the interaction matrix, browser checks, persistence, and remaining limits. `npm run smoke:m3i` runs a production Chrome smoke with an isolated profile and synthetic progress. `npm run package:m3i-final` creates an explicit allowlist archive without prior acceptance images, nested archives, build output, dependency directories, or browser data.

**Acceptance boundary:** M3I is accepted. The active work below is Milestone 3J and must stop at its own independent acceptance boundary.

### 3.16 Harmony and Accompaniment I (Milestone 3J)

**Scope:** turn the four familiar chords into a beginner-level harmonic sequence. Teach why chords connect, `C = I`, `G = V`, `Am = vi`, `F = IV`, root-position `C → G → Am → F`, and the smoother bass path `C → G/B → Am → F`. Keep the module to block chords and short sequences; rhythm, tempo, pedal, two-hand scoring, seventh chords, and general-purpose voice-leading optimization are outside the scope.

- **Learning path:** Orientation → functions → root-position progression → G/B model and comparison → semantic G/B choice → next-chord recognition → Guided → Independent → Memory → 12-trial transfer → focused remediation → fresh 8-trial retry → completion. Passing threshold is 80%; each block has a fixed total and corrective responses do not improve first-attempt accuracy.
- **Input contract:** Function Identify, Next Chord, and G/B choice use answer buttons plus `1–4`, `Digit1–4`, and `Numpad1–4`. PC piano-note keys do not answer these tasks. Progression play uses screen-piano selection of three keys plus explicit submission, or MIDI with exactly three unique held notes. MIDI cannot arm the next chord until every held note is released. Screen, MIDI, and module reducer share `classifyHarmonyChord`.
- **Daily Practice and FSRS:** `harmonyFunctionIdentify`, `harmonyNextChord`, and `harmonyProgressionPlay` remain inactive until their matching learning gates reach retention. A four-chord progression is one question instance and records at most one first-attempt outcome, FSRS mutation, and ReviewLog; any wrong chord fails the first attempt, and corrective replay completes the chain without a second grade. The visible “Следующее задание” action calls the common `nextRound()` path, which waits for persisted card and ReviewLog state before making another scheduler decision.
- **Program, Progress, and Diagnostics:** learner-facing #10 is “Гармония и сопровождение”; it becomes available after #9. Diagnostics include gate states, Harmony card lifecycle and Daily Practice activation, transfer phase, and fixed block count without changing Scheduler Diagnostics v2.
- **Persistence:** the reducer snapshot restores mid-progression, failed result/remediation, retry, and completion. A new browser load clears transient key selection.
- **Rev1 stabilization:** remediation is capped at three tasks even when four or more assessment trials fail. Harmony, Bass / Grand Staff, Intervals, Triads, and Chord Inversions share a scrollable task workspace above the bottom piano dock; the Harmony production smoke checks 1920×1080, 1920×900, and 1366×768, including feedback reachability and horizontal overflow.
- **Semantic question integrity:** transfer trials use their canonical typed question prompt and choices. Questions stay visible before and after wrong answers, with corrective feedback below options; the browser smoke covers Function, Next Chord, inversion choice, assessment, remediation, retry, and a Daily Practice semantic review.
- **Verification:** `npm run verify`, `npm run smoke:m3j`, and `npm run smoke:scheduler-integrity`; the smoke uses a production preview, temporary Chrome profile, synthetic progress, screen piano, fake MIDI, assessment failure/retry, semantic question flow, Daily Practice review, scheduler-transition linkage, and dock geometry. Evidence lives only under `acceptance/m3j/`; Rev1 is `piano-key-trainer-milestone3j-rev1.zip` with `M3J_REV1_REPORT.md`. The archive self-check covers every package script's referenced file and reproducible ZIP output. From a fresh archive extraction, verify with `npm ci`, `npm run verify`, `npm run smoke:scheduler-integrity`, `npm run smoke:m3i`, and `npm run smoke:m3j`.
- **Known limits:** fake MIDI verifies the Web MIDI event path; no physical controller is attached. The initial and retry assessments use a deterministic representative task cycle rather than open-ended harmonic transfer.

**Acceptance boundary:** stop after M3J is packaged and reported. Do not begin rhythm-scored accompaniment, two-hand accompaniment, or the next harmony level before independent acceptance.
