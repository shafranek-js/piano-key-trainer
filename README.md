# Piano Key Trainer 🎹 (v6.2.0)

> Adaptive desktop-first piano learning web application built with **Svelte 5**, **TypeScript**, and **Vite**, combining **FSRS-6 spaced repetition**, **Web MIDI**, **Salamander Grand Piano acoustic samples**, **OpenSheetMusicDisplay (OSMD)** engraving, ear training, and two-hand coordination.

## ✅ Current status

- Learner roadmap: **12/12 stages available** (core curriculum + advanced modules + #11 «Ритм аккордов» + #12 «Игра двумя руками»); M3L implementation is pending acceptance.
- **M3K (Chord Rhythm & Pulse I): accepted** — beginner timing tolerance, hands-free MIDI start, Rev1 timing/cue fixes, and physical-MIDI user acceptance passed.
- **Cold Test Progression + Displayed Item Integrity: accepted** — all 19 task families use the central completion contract, and the displayed `Cold Test · N/20` number follows the question actually on screen.
- **FSRS & Persistence Integrity (Checkpoint B): accepted** — canonical FSRS-6 parity vs pinned `py-fsrs` 6.3.2, latency provenance, identity-keyed `reviewLogEvents`, recoverable persistence retry, atomic migrator.
- **Daily Practice & Diagnostics Hardening (Checkpoint C): implemented** (pending acceptance) — canonical skill registry, diagnostics v3 (real storage schema, 12-stage roadmap, M3K snapshot, persistence section), heterogeneous `smoke:daily-practice`, SessionStrip title priority, `card.stats`/NaN normalization.
- **M3L (Two-Hand Accompaniment I): implemented** (pending acceptance) — left-hand bass + right-hand chords over C → G/B → Am → F at 60 BPM, guided stages through a bounded 12-trial assessment, three new Daily Practice skills, `smoke:m3l`; physical-MIDI user acceptance is **not tested** (manual plan in `M3L_TWO_HAND_ACCOMPANIMENT_REPORT.md`).

---

## 🌟 Key Features

### 1. Decoupled FSRS-6 Memory Engine & Audit Log
* **FSRS-6 Power-Law Memory Model:** 21-parameter spaced repetition engine tracking per-card **Stability ($S$)**, **Difficulty ($D$)**, and **Retrievability ($R(t)$)**.
* **5 Distinct Pedagogical Skills (Independent Memory Units):**
  * `find` — Locate a named pitch class on the piano keyboard or MIDI controller.
  * `identify` — Name the highlighted piano key using on-screen answer buttons or PC keyboard shortcuts (`C–B`, `1–7`).
  * `patternIdentify` — Identify and locate a note from its structural landmark relative to the groups of 2 and 3 black keys (via PC keyboard, on-screen piano, or MIDI).
  * `notationToKey` — Read a note on the staff (Treble, Bass, or Grand Staff) and play the **exact octave** on the piano or MIDI keyboard.
  * `soundToKey` — Hear a note relative to the `C4` reference tone and play the **exact octave** on the piano or MIDI keyboard.
* **Channel-Aware Input Invariants:** Each skill enforces its pedagogical input contract (`src/core/input/inputPolicy.ts`) so learners cannot bypass physical key-location tasks using PC letter shortcuts.
* **Strict First-Attempt Semantics:** Only the first response on a question grades FSRS (`new` / `scheduled`) and updates `Card.stats`. Subsequent corrective attempts help the learner find the right key without re-grading FSRS or emitting duplicate `ReviewLogEvent`s.
* **Schedule-Neutral Modes:** Free practice (`practice`), contrast drills (`confusion`), and the 20-item diagnostic **Cold Test** (`cold`) never distort FSRS scheduling. Cold Test is strictly diagnostic and does not mutate `Card.stats`.
* **Complete `ReviewLogEvent` Transitions & Session Identity:** Every review records pre- and post-review FSRS state (`stabilityBefore`, `stabilityAfter`, `difficultyBefore`, `difficultyAfter`, `retrievabilityBefore`, `elapsedDays`, `scheduledDays`) under a unique session identifier (`createSessionId`).
* **Personalized Speed Grading:** Optional latency-aware grading (`Hard` / `Good` / `Easy`) calibrated from the learner's own rolling $P30$ / $P85$ response-time distribution.

### 2. Curriculum Progression, Guided Lessons, Repertoire, Ear Training & Two-Hand Coordination
* **6 Curriculum Phases (`src/core/curriculum/curriculum.ts`):**
  1. `anchors` — **Anchors / Ориентиры** (`C + F`)
  2. `neighbors` — **Neighbors / Соседи** (`D · E · B`)
  3. `remaining` — **Remaining white notes / Белые** (`G · A`)
  4. `black` — **Black keys / Чёрные** (`C♯ F♯ G♯ D♯ A♯`)
  5. `notation` — **Notation / Нотный стан** (`C4–B4`)
  6. `sound` — **Sound / Слух** (`C4 → target`)
* **12 Guided Lessons (`src/core/lessons/lessonsData.ts`):**
  1. `two-black` — Group of 2 black keys (`C–D–E`)
  2. `three-black` — Group of 3 black keys (`F–G–A–B`)
  3. `anchors` — Primary landmark keys `C` and `F`
  4. `white-map` — Full white-key keyboard geography
  5. `black-keys` — Sharps and flats (`♯` / `♭`)
  6. `octaves` — Octave orientation across `C2–C6`
  7. `notation-intro` — Treble clef landmark reading
  8. `ear-intro` — Relative pitch from `C4`
  9. `right-hand-c` — Right-hand C position (`C4–G4`, fingers 1–5)
  10. `left-hand-c` — Left-hand C position (`C3–G3`, fingers 5–1)
  11. `bass-clef-intro` — Bass clef reading (`C3–C4`)
  12. `grand-staff-intro` — Grand Staff coordination (`C3–B4`)
* **25+ Repertoire Pieces & Custom MusicXML Import (`src/core/repertoire/`):**
  * **25 built-in pieces** across warmup, study, melody, and classical categories — each providing both a short educational **excerpt** (`excerpt`) and a **full arrangement** (`full`).
  * **Custom MusicXML / MXL Import:** Import `.musicxml`, `.xml`, or compressed `.mxl` scores (unpacked via `JSZip`) directly into the repertoire player.
  * **Continuous OSMD Engraving:** Single-line horizontal score rendering via **OpenSheetMusicDisplay**, measure-by-measure looping, acoustic demo playback, count-in (`4–3–2–1`), and **Wait / Slow / Normal** tempo modes.
* **Multi-Mode Ear Training (`src/core/ear/earTrainingData.ts`):**
  * **Intervals (`earIntervals`):** 7 ascending intervals from `C4` (`m2`, `M2`, `m3`, `M3`, `P4`, `P5`, `P8`).
  * **Triads (`earTriads`):** Major vs. minor triad quality recognition (arpeggiated or harmonic).
  * **Melodic Echo (`earEcho`):** 12 multi-note ear-to-hand melodic dictation phrases across easy, medium, and hard levels.
* **Two-Hand Coordination (`src/core/twohand/twoHandData.ts`):**
  * **7 structured patterns:** Mirror pairs (`mirror-pairs`), parallel motion (`parallel-motion-c`), contrary motion (`contrary-motion-c`), left-hand bass anchor (`left-anchor`), bass fifths + melody (`bass-fifths-melody`), hand ping-pong (`hand-ping-pong`), and Alberti bass introduction (`alberti-bass-intro`).

### 2.1 Post-Graduation Advanced Modules
* **Bass Clef & Grand Staff (3F):** Bass-note reading and transfer between the two staves.
* **Intervals (3G):** Four physical semitone distances (`P8`, `P5`, `M3`, `m3`) with build, identify, and transfer practice.
* **Major / Minor Triads (3H):** Full three-note chord building, quality identification, and corrective feedback.
* **Inversions & Chord Symbols (3I):** Root, first, and second inversion, slash symbols, inversion identification, and the introductory `C → G/B → Am → F` sequence.
* **Harmony & Accompaniment I (3J):** Beginner-friendly I–V–vi–IV orientation, root-position and smooth bass transitions, guided/independent/memory block-chord sequences, bounded transfer with fresh retry, and three gated Daily Practice card families. Rhythm and two-hand accompaniment are outside this module.
* **Chord Rhythm & Pulse I (3K — accepted):** 4/4 pulse at 60 BPM, a genuine two-bar chord change `C → G/B` (bar 1 C, bar 2 G/B on the next downbeat) with per-bar feedback, two-strike pattern on beats 1 and 3 across `C → G/B → Am → F`, bounded assessment (12 initial / 8 retry trials, 80% threshold), at most three focused remediation tasks, reload-safe corrective state, targeted return-to-learning, and an explicit module exit back into the normal practice lifecycle. Stabilization and Rev1 fixes are **accepted** and add no new pedagogy.

### 3. Acoustic Sound, Web MIDI & 4-Octave Keyboard Ergonomics
* **Salamander Grand Piano Audio (`src/audio/AudioEngine.ts`):** Real acoustic Yamaha C5 samples across 4 octaves (`C2–C6`), plus a Web Audio lookahead metronome (`src/audio/MetronomeClock.ts`). Never falls back to harsh synthetic oscillators.
* **Web MIDI (`src/audio/MidiController.ts`):** Full MIDI note-on/note-off handling, exact octave verification, velocity-based dynamics ($p / mf / f$), note-hold duration articulation ($legato / detached$), and two-hand onset simultaneity measurement.
* **Persistent 4-Octave Keyboard (`C2–C6`):** 29 white keys and 20 black keys docked at the bottom of the practice workspace as a stable visual anchor that never shifts vertically when prompts or feedback change.

### 4. Local-First Storage, PWA & Optional Cloud Infrastructure
* **IndexedDB via Dexie.js (`src/storage/db.ts`):** Stores `cards`, `reviewLogEvents`, `coldTests`, `repertoireHistory`, `twoHandHistory`, `lessonProgress`, and `settings` locally in `PianoTrainerDB`, with automatic one-time migration from legacy `localStorage` (`src/storage/migrator.ts`) and full JSON backup export/import. Review events carry a stable `reviewEventId` identity (schema v3+) with `ts` kept as indexed chronology, and `responseTimingSource` provenance so only real measured latencies feed adaptive grading.
* **Offline-First PWA:** Configured with `vite-plugin-pwa` and Workbox runtime caching for Salamander Grand Piano audio samples.
* **Optional Supabase Infrastructure (`src/services/supabase.ts`):** Includes optional client and upsert helper infrastructure gated by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables *(infrastructure module only; cloud synchronization is not currently active in the user-facing workflow)*.

---

## 🛠 Tech Stack

* **Framework:** [Svelte 5](https://svelte.dev/) (runes & compile-time reactivity), [TypeScript](https://www.typescriptlang.org/) (`strict: true`), [Vite 6](https://vitejs.dev/)
* **Notation & MusicXML:** [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) (`opensheetmusicdisplay`), [JSZip](https://stuk.github.io/jszip/) (`jszip`), custom SVG staff renderer
* **Persistence:** [Dexie.js](https://dexie.org/) (IndexedDB), optional [@supabase/supabase-js](https://supabase.com/) infrastructure
* **Audio & MIDI:** Web Audio API, Web MIDI API
* **Testing:** [Vitest](https://vitest.dev/)
* **PWA:** `vite-plugin-pwa` (Workbox)

---

## 🚀 Quick Start & Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in a Chromium-based browser (Chrome or Edge recommended for Web MIDI support).

### 3. TypeScript Typecheck
```bash
npm run typecheck
```

### 4. Svelte-Aware Type and Component Check
`tsc --noEmit` does not validate TypeScript action contracts inside Svelte components. Run the Svelte-aware checker as a required gate:
```bash
npm run check:svelte
```

### 5. Run Unit Tests
```bash
npm test
```

### 6. Build for Production
```bash
npm run build
```

### 7. Run Full Verification Suite (`typecheck` + `Svelte check` + `test` + `build`)
```bash
npm run verify
```

### 8. Production Runtime Interaction Smoke
With a production preview running on `127.0.0.1:4173`, run the isolated Chrome smoke for Triad, Interval, and Inversion Identify input paths:
```bash
npm run smoke:runtime-integrity
```
The smoke creates a temporary Chrome profile and synthetic curriculum progress; it does not use the learner's browser profile or a saved profile seed. It writes up to two screenshots under `acceptance/runtime-integrity/screenshots/`.

### 9. Package Runtime Integrity Checkpoint
```bash
npm run package:runtime-integrity
```
This creates `piano-key-trainer-runtime-integrity.zip` from an explicit file allowlist and checks that old acceptance screenshots, browser profile data, `dist`, `node_modules`, and nested ZIPs are absent.

### 10. Production M3I Finalization Smoke
With a production build available, run the isolated Chrome smoke for the Inversions module:
```bash
npm run smoke:m3i
```
The smoke starts a temporary Vite production preview unless `PIANO_TRAINER_APP_URL` points to an existing preview. It uses a temporary Chrome profile and synthetic IndexedDB progress. It verifies the learner-facing build, Identify, slash, and sequence interactions; MIDI parity and held-note progress; bounded transfer failure/remediation/retry and pass paths; progress after reload; and one scheduled M3I slash-build card in Daily Practice. New evidence is written only to `acceptance/m3i-final/screenshots/`.

### 11. Package the M3I Finalization Checkpoint
```bash
npm run package:m3i-final
```
This writes `piano-key-trainer-m3i-final.zip` from an explicit source, test, documentation, report, and current M3I screenshot allowlist. It excludes prior acceptance screenshots, nested ZIPs, `dist`, `node_modules`, `.git`, and temporary browser data.

### 12. Production Harmony & Accompaniment I Smoke
```bash
npm run smoke:m3j
```
This launches an isolated production preview and Chrome profile. It verifies the #10 Program entry, beginner orientation, chord progression input, bounded assessment failure/remediation/retry, model-backed semantic questions and corrective feedback, module completion and reload, the Harmony task workspace at 1920×1080, 1920×900 and 1366×768, plus one scheduled progression and semantic review through the existing FSRS and persistence lifecycle. Evidence is written only to `acceptance/m3j/`, with screenshots under `acceptance/m3j/screenshots/`.

### 13. Package the M3J Checkpoint
```bash
npm run package:m3j
```
This creates `piano-key-trainer-milestone3j-rev1.zip` with the source, tests, every project script, package-script coverage checks, accepted prerequisite reports, and six current M3J screenshots. The ZIP build verifies that every `node scripts/<file>.mjs` command in `package.json` has its script in the archive and that two builds from unchanged inputs are byte-identical. It excludes nested ZIPs, `dist`, `node_modules`, `.git`, and temporary browser data.

### 14. Production M3K Stabilization Smoke
With a production build available, run the isolated Chrome smoke for the Chord Rhythm module:
```bash
npm run smoke:m3k
```
It starts a temporary Vite production preview unless `PIANO_TRAINER_APP_URL` is set, uses a temporary Chrome profile and synthetic progress that completes stages 1–10, and verifies: the #11 Program entry, advanced-module exclusivity, a wrong first assessment attempt that survives reload as a corrective requirement with zero FSRS review logs, remediation, a failed 8-trial retry that is terminal with working «Вернуться к учебным шагам» and «В программу» actions, module completion persistence, exit back into normal practice, and zero runtime/console errors. Evidence is written to `acceptance/audit-stabilization-a/screenshots/` (up to four screenshots).

### 15. Package the Audit Stabilization Checkpoint
```bash
npm run package:audit-stabilization-a
```
This creates `piano-key-trainer-audit-stabilization-a.zip` from an explicit source, test, script, documentation, report, and current screenshot allowlist. It checks that every `node scripts/<file>.mjs` command in `package.json` has its script in the archive and that two builds from unchanged inputs are byte-identical. It excludes nested ZIPs, prior acceptance evidence, `dist`, `node_modules`, `.git`, browser profiles, and temporary data.

### 16. Production Cold Test Progression Smoke
```bash
npm run smoke:cold-test
```
Runs a production preview with an isolated Chrome profile and a synthetic profile that seeds eight Cold Test families. It verifies the 8/20 `triadBuild` F# major reproduction, the canonical display lifecycle (feedback keeps the answered item number; the next number appears only when the next question activates), a full 20/20 run, and the persisted `coldTests` record. Evidence: `acceptance/cold-test-display-fix/` (3 screenshots).

### 17. Production Persistence Integrity Smoke
```bash
npm run smoke:persistence-integrity
```
Injects a synthetic persistence failure into the production preview and verifies: two reviews sharing one millisecond persist with distinct `reviewEventId`s; the scheduler does not advance while a commit is failed; «Повторить сохранение» reuses the same event id, persists exactly one event/card transition, and resumes the scheduler; reload keeps the persisted state consistent. Evidence: `acceptance/fsrs-persistence-integrity/` (up to 2 screenshots + machine-readable `persistence-evidence.json`).

### 18. Production Heterogeneous Daily Practice Smoke
```bash
npm run smoke:daily-practice
```
Runs a production preview with an isolated Chrome profile and a deterministic synthetic profile (all 11 core/advanced learner stages completed, every skill family due). Phase 1 covers all six advanced families (Harmony + M3K); the long run completes 70 tasks across 17 skills with the canonical one-grade invariant (wrong first attempt = exactly one ReviewLog/FSRS mutation; corrective success = none), no duplicate question activation and no scheduler advance before persistence. It also asserts the SessionStrip title is not truncated at 1440/1024 and exports a clean diagnostics snapshot (schema v3, storage schema v4, 12-stage roadmap with 11 completed and `two_hand` available, `unknownSkillIds = []`). Evidence: `acceptance/checkpoint-c/` (3 screenshots + `evidence.json`).

---

## 📄 License

MIT
