# Piano Key Trainer — Project Roadmap

**Source of truth:** `package.json` (`6.2.0`). This document tracks implementation milestones for developers. The learner-facing ten-stage Learning Roadmap is a separate UI and does not expose these milestone IDs.

## Accepted implementation baseline

- **3A — Learning State Foundation:** acquisition progress records and trial policies.
- **3B / 3B.5 — First Run and Repertoire Integrity:** guided C/F onboarding; canonical repertoire data, MusicXML, and verification.
- **3C — Curriculum-Gated Activation:** six core learning phases with controlled card activation and interleaving.
- **3D — Teaching and FSRS Integrity:** black-key, staff-reading, and relative-ear acquisition with persistence and corrective stages.
- **3E — Daily Practice Orchestration:** post-curriculum retention, prioritization, transfer, and session presets.
- **3F — Bass Clef and Grand Staff:** bass-note reading and transfer between the two staves.
- **3G — Interval Foundations:** `P8`, `P5`, `M3`, and `m3` build, identify, contrast, and transfer work.
- **3H — Major and Minor Triads:** three-note chord building, quality identification, diagnostics, and transfer.
- **3I — Chord Inversions and Chord Symbols:** accepted baseline; first and second inversion, inversion identification, slash symbols, and the introductory `C → G/B → Am → F` sequence.
- **3J — Harmony and Accompaniment I:** accepted baseline; I–V–vi–IV functions, root-position and smooth-bass progressions, bounded transfer with focused remediation, and Daily Practice integration.
- **3K — Chord Rhythm & Pulse I:** accepted baseline; 4/4 pulse, two-bar `C → G/B` change, two-strike patterns, bounded assessment/remediation, and Daily Practice integration. Physical-MIDI user acceptance passed.
- **Cold Test Progression + Displayed Item Integrity:** accepted; all 19 task families advance through the central completion contract, and the displayed `Cold Test · N/20` follows the rendered question.
- **FSRS & Persistence Integrity (Checkpoint B):** accepted; canonical FSRS-6 parity (pinned `py-fsrs` 6.3.2), latency provenance, identity-keyed review events (schema v4), recoverable persistence retry, atomic migrator.
- **Scheduler Integrity:** accepted baseline; active questions cannot be replaced by refresh, and persistence completes before the next scheduler decision.

## Current checkpoint: Daily Practice & Diagnostics Hardening (Checkpoint C, pending independent acceptance)

Stabilization-only work aligning Daily Practice, Diagnostics and storage normalization with the existing 11/11 roadmap and the Checkpoint B persistence model:

- one canonical FSRS skill registry shared by diagnostics validation, scheduler metadata and display names, with a completeness test over curriculum/UI producers;
- diagnostics schema v3: real IndexedDB storage version (from the canonical DB definition), separated `appVersion` / `buildVersion` / `diagnosticsSchemaVersion` / `backupSchemaVersion` / `storageSchemaVersion`, canonical 11-stage roadmap snapshot, M3K module snapshot, persistence/latency-provenance section, no false "unknown skill" warnings;
- heterogeneous deterministic `smoke:daily-practice`: all advanced families plus 40+ completed tasks/2 sessions, one-grade invariant, diversity and reload evidence;
- SessionStrip title priority across 1440/1280/1024 (secondary metadata may wrap or hide; the session title never becomes an ellipsis);
- storage normalization: `card.stats` guard and NaN/Infinity handling for untrusted/legacy data, with invalid `dueAt` treated as the canonical unscheduled state.

M3L, new curriculum content, rhythm patterns, MusicXML/repertoire, AudioEngine strategy, MIDI redesign, `App.svelte` decomposition, and FSRS formula retuning remain out of scope.

The learner-facing roadmap has **11/11 stages complete** («Ритм аккордов» is #11). M3L starts only after this checkpoint is accepted.

## Next educational direction

- **After this stabilization checkpoint is accepted:** M3L Two-Hand Accompaniment (a separate course milestone with its own acceptance).
- Rhythm scoring beyond M3K and two-hand accompaniment remain future work.
- In the learner-facing Learning Roadmap the title is **#11 «Ритм аккордов»**. It becomes available after #10, and the UI does not expose internal milestone IDs.

## Verification commands

```bash
npm run typecheck
npm run check:svelte
npm test
npm run build
npm run verify
npm run smoke:m3i
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
npm run smoke:cold-test
npm run smoke:persistence-integrity
npm run smoke:daily-practice
```
