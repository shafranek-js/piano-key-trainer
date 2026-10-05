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
- **Scheduler Integrity:** accepted baseline; active questions cannot be replaced by refresh, and persistence completes before the next scheduler decision.

## Current checkpoint: Milestone 3J — Harmony & Accompaniment I

M3J adds an introductory harmony module after M3I. It teaches why chords form a sequence, the C major functions `I–V–vi–IV`, root-position `C → G → Am → F`, and the smoother bass path `C → G/B → Am → F`. Learners compare the two G voicings, choose the taught G/B example, then play guided, independent, memory, and bounded transfer sequences.

The scope uses block chords only. It does not score rhythm, tempo, pedal, or two-hand independence and does not add seventh chords or a general inversion optimizer. An incorrect chord marks the progression's first attempt as failed; the learner completes a corrective replay without creating another FSRS outcome. Screen input selects and submits three keys; MIDI evaluates three unique held notes once and waits for full release before the next chord.

The transfer assessment has bounded blocks:

- First check: exactly 12 first attempts, at least 80% correct.
- If it fails: focused remediation and a fresh eight-trial retry; retry accuracy is calculated from the retry block only.
- Corrective answers teach the response but do not change first-attempt accuracy.
- Harmony FSRS cards remain inactive until their matching learning gate reaches retention. Scheduled progression playback is one question and can create at most one review transition and one ReviewLog.

M3J is implemented in `src/core/learning/harmony.ts` and `src/ui/components/HarmonyStage.svelte`. Program, Progress, Daily Practice, and Diagnostics surface the learner-facing state. This checkpoint is **pending independent acceptance**; implementation and smoke evidence do not change its acceptance status.

## Next educational direction

- Rhythm scoring and two-hand accompaniment remain future work and are not part of M3J.
- In the learner-facing Learning Roadmap the title is **#10 «Гармония и сопровождение»**. It becomes available after #9, and the UI does not expose internal milestone IDs.

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
```
