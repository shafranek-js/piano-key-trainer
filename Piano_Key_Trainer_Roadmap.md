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
- **Scheduler Integrity:** accepted baseline; active questions cannot be replaced by refresh, and persistence completes before the next scheduler decision.

## Current checkpoint: FSRS & Persistence Integrity (Checkpoint B, pending independent acceptance)

Stabilization-only work on the layer that stores and schedules every exercise; no new curriculum milestone:

- FSRS-6 policy review against the pinned canonical reference (`py-fsrs` 6.3.2) with golden parity vectors; corrections apply to future reviews only and never rewrite historical card state.
- Latency provenance (`measured` / `not_measured` / `legacy_unknown`): synthetic module transitions no longer fabricate `responseMs`, and adaptive P30/P85 uses measured samples only.
- Review events get a stable `reviewEventId` identity (Dexie schema v3→v4) with a copy-style migration that preserves every legacy log; retried persistence reuses the same id.
- Failed review commits are recoverable: the scheduler is blocked until «Повторить сохранение» succeeds, with bounded diagnostics; Cold Test/lesson statistics writes are guarded.
- The legacy localStorage migrator writes in one atomic transaction and only marks completion after verification.

M3L, two-hand accompaniment, new rhythm patterns/BPM, MusicXML/repertoire, AudioEngine strategy, MIDI redesign, `App.svelte` decomposition, and Supabase cleanup remain out of scope.

The learner-facing roadmap has **11/11 stages complete** («Ритм аккордов» is #11). M3L is **not started**.

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
```
