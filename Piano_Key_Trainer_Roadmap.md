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
- **Scheduler Integrity:** accepted baseline; active questions cannot be replaced by refresh, and persistence completes before the next scheduler decision.

## Current checkpoint: Milestone 3K — Chord Rhythm & Pulse I (WIP stabilization, NOT accepted)

M3K already exists in the working tree as an unfinished module. Checkpoint A ("Audit Remediation & M3K Stabilization") treats it as stabilization work only:

- no new rhythm patterns, BPM values, accompaniment styles, two-hand mode, eighth notes, or syncopation;
- quality gates restored to green (typecheck, Svelte check, tests, production build);
- advanced modules have a single explicit exit lifecycle, one module active at a time, and input routing that always matches the visible module;
- corrective/assessment state survives reload, bounded assessment never loops, and a failed retry is terminal with working return-to-learning and Program actions;
- backup import is treated as untrusted input (versioned schema, validation, atomic transaction), and the canonical one-grade rule is enforced across curriculum modules;
- FSRS algorithm retuning, MusicXML stabilization, audio fallback redesign, and the `App.svelte` architectural rewrite remain **out of scope** for this checkpoint.

The learner-facing roadmap has **11 stages**; #11 is «Ритм аккордов». When all 11 stages are completed, no stage is marked current. M3K stays WIP until its own independent acceptance.

## Next educational direction

- Rhythm scoring and two-hand accompaniment remain future work beyond M3K stabilization.
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
```
