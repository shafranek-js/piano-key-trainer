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
- **M3L — Two-Hand Accompaniment I:** implemented (pending acceptance); left-hand bass + right-hand chords over `C → G/B → Am → F`, 4/4 at 60 BPM, guided stages through a bounded 12-trial assessment, three Daily Practice skills, `smoke:m3l`. Physical-MIDI user acceptance is not tested.

## Current checkpoint: Milestone 3L — Two-Hand Accompaniment I (pending independent acceptance)

M3L adds the first two-hand module on top of the accepted Checkpoint C baseline:

- canonical voicings: LH bass one octave below the Harmony bass (G/B → B2), RH triads unchanged;
- eight learner stages plus a deterministic 12-trial assessment (80% first-attempt threshold) and at most three remediation cycles with a terminal bound;
- M3K timing windows preserved (±140/±300 ms) plus a ±200 ms beginner hand-sync window;
- three new FSRS skills (`twoHandBass`, `twoHandTogether`, `twoHandAlternating`) in the canonical registry (22 total); the Cold Test stays curated at 19 families;
- roadmap stage #12 «Игра двумя руками» after «Ритм аккордов», diagnostics snapshot row, reload-safe `twoHandSnapshot` persistence;
- `npm run smoke:m3l` with 4 acceptance screenshots in `acceptance/m3l/`.

Daily Practice, new curriculum content beyond M3L, new rhythm patterns, MusicXML/repertoire, AudioEngine strategy, MIDI redesign, `App.svelte` decomposition, and FSRS formula retuning remain out of scope.

The learner-facing roadmap offers **12 stages** («Ритм аккордов» is #11, «Игра двумя руками» is #12).

## Next educational direction

- **After M3L acceptance:** next course milestone following the same acceptance discipline.
- Rhythm scoring beyond M3K and richer accompaniment patterns remain future work.
- In the learner-facing Learning Roadmap the titles are **#11 «Ритм аккордов»** and **#12 «Игра двумя руками»**. Stage #12 becomes available after #11, and the UI does not expose internal milestone IDs.

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
