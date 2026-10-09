# M3L Device Awareness Rev2 — MIDI Device Capability & Exercise Playability Report

## 1. Baseline and objective

- Baseline: `b0f22c3` (M3L Rev1, accepted scope + physical P0 fixes) on `stabilization/m3k-audit-remediation`.
- Objective: exercises must adapt to the capabilities and active playable range of the connected MIDI keyboard; a task must never require notes that cannot be played on the selected device. Primary device: **Arturia MicroLab mk3, 25 keys**; generic 25/37/49/61/88-key devices supported.
- Out of scope unchanged: new pedagogy beyond M3L, FSRS retuning, AudioEngine/MIDI redesign, `App.svelte` decomposition.

## 2. Device capability model (single MIDI subsystem)

`src/core/midi/deviceCapability.ts` extends the existing `MidiController` data flow (same `requestMIDIAccess`, same listeners) with a typed serializable profile:

- device name, manufacturer, port identity; physical key count; calibrated lowest/highest transmitted MIDI notes; source (`known-profile` / `user-config` / `calibration` / `fallback`); calibration status and revalidation flag.
- Known profiles: Arturia MicroLab mk3 and MiniLab (25 keys, typical C3–C5 fallback). Generic ranges: 25→C3–C5, 37→C2–C5, 49→C2–C6, 61→C2–C7, 88→A0–C8.
- Key count is never inferred from observed playing, and the virtual C2–C6 piano is never treated as the device range.
- New raw note stream in `MidiController`: `onRawNoteOn` emits every transmitted note (including outside C2–C6) and `setCalibrationMode(true)` suppresses virtual-piano routing during calibration.

## 3. Calibration workflow

1. Select the input device (explicit list when more than one is connected).
2. Press the leftmost physical key.
3. Press the rightmost physical key.
4. Raw MIDI numbers are captured and displayed; the observed span is checked against the declared/known key count.
5. A mismatch marks the range as needing revalidation instead of silently trusting it.

Calibration is persisted in user settings (`midiCalibration`), survives backup normalization, and any transmitted note outside the calibrated range (e.g., after an Octave −/+ change) marks the range stale, stops an active run without grading and asks for reconfirmation/recalibration. Unknown controllers get manual configuration (key count → typical range) or calibration; uncalibrated known devices use a labelled typical range.

## 4. Feasibility engine and adaptive voicings

`src/core/learning/twoHandArrangement.ts` computes the full required note set and validates it against **one unchanged range** for the entire progression.

- Original M3L: lowest F2 (41), highest G4 (67) → span 27; MicroLab mk3: 25 keys → original is rejected.
- Compact arrangement for C3–C5 (calibrated/typical MicroLab range), preserving chord identity, slash bass as the lowest sounding note, and independent LH/RH:

| Chord | LH bass | RH triad |
| --- | --- | --- |
| C | C3 (48) | C4–E4–G4 (60,64,67) |
| G/B | B3 (59) | D4–G4–B4 (62,67,71) |
| Am | A3 (57) | C4–E4–A4 (60,64,69) |
| F | F3 (53) | A3–C4–F4 (57,60,65) |

- Union span 24 ≤ 25 keys; every bar fits the same calibrated range; no mid-phrase octave switch is required or assumed; hand separation is checked (≥3 semitones per voicing).
- When four chords do not fit, a shorter C-major introductory exercise is selected; when nothing physical fits, a clearly labelled on-screen simulation is offered — never a silent dead end.

## 5. Physical case found during user testing (fixed)

The user calibrated a **C2–C4 (36–60)** keyboard while the exercise was already planned for the default C3–C5 range, so the open exercise kept demanding B3/D4–G4–B4 — notes above their keyboard. Fix:

- `applyTwoHandArrangement` re-plans the voicings of an open exercise while preserving stage, progress, assessment history and input-mode record.
- An App effect watches the effective arrangement: on range/device change it stops an active run without grading, re-plans and shows an explicit «Упражнение перестроено под диапазон инструмента» notice.
- C2–C4 voicings: C = C3 + E3–G3–C4; G/B = B2 + D3–G3–B3; Am = A2 + E3–A3–C4; F = F2 + F3–A3–C4 (all within 36–60, slash bass lowest, hand separation OK), verified unit + smoke.
- On-screen keys outside the active range are visually marked as unavailable.

## 6. Stable arrangement, UI and input honesty

- A continuous four-bar performance uses one stable arrangement; the arrangement kind and device capability context are stored in the exercise snapshot.
- Device changes or disconnect during a timed run stop the run safely, do not grade the incomplete attempt, and require a fresh count-in.
- UI shows `MIDI: Arturia MicroLab mk3 · 25 клавиш`, `Доступный диапазон: C3–C5` only when actually calibrated, the adaptation notice, and for simulation an explicit «не засчитывается как физическое исполнение» label.
- Input mode (`midi`/`screen`) is recorded per assessment; a synthetic-only assessment cannot complete the module, so physical two-hand mastery cannot be unlocked through on-screen clicks alone. Device changes create no duplicate ReviewLogs and never alter historical grades.

## 7. Mandatory tests (all covered)

MicroLab recognition; unknown device configuration/calibration; left/right calibration; octave-shift recalibration; original phrase rejected on one 25-key span; compact arrangement selected; chord identities + slash bass preserved; every note of every bar fits one calibrated range; no mid-phrase octave switch; 37/49/61/88 compatibility; out-of-C2–C6 raw calibration notes; multiple devices with explicit selection; disconnect/reconnect and stale profile; no false failed grade for unsupported notes; no duplicate FSRS mutation on device changes; plus the user's C2–C4 dynamic re-plan case. Unit suite: **647/647 tests in 41 files** (`tests/unit/midiDeviceAwareness.test.ts`: 15).

## 8. Production smoke and evidence

`npm run smoke:m3l` — 13 scenarios with a deterministic Arturia MicroLab mk3 fake device, calibrated range, full raw-note calibration trace, compact four-bar phrase entirely inside one 25-key range, 12-trial assessment through real MIDI, remediation gating, disconnect, multi-device selection and the C2–C4 re-plan case. Evidence: `acceptance/m3l-rev2/evidence.json`, `acceptance/m3l-rev2/smoke-summary.json`, screenshots:

- `01-m3l-rev2-device-range.png` (device + calibrated range + compact notice)
- `02-m3l-rev2-compact-four-bars.png` (continuous compact phrase)
- `03-m3l-rev2-assessment-midi.png` (assessment via MIDI)
- `04-m3l-rev2-remediation-gate.png` (remediation gating)

Regression: `smoke:m3k`, `smoke:cold-test`, `smoke:persistence-integrity`, `smoke:daily-practice`, `npm run verify` (typecheck, svelte-check 0/0, 647 tests, build) — all green.

## 9. Limits and manual acceptance

- Final acceptance requires a real run on the user's **Arturia MicroLab mk3**: verify the device label/key count, calibrate C2–C4 or the physical range, confirm hints only use available keys, play the four compact bars, complete an assessment on the hardware, then repeat with an Octave −/+ change to see the stale/recalibration flow.
- Metronome click audibility remains a physical verification (shared clock trace and scheduling covered by tests).

## 10. Clean extraction

`piano-key-trainer-m3l-two-hand-accompaniment-rev2.zip` is built deterministically (double-build byte equality), contains only `acceptance/m3l-rev2`, no `node_modules`/`dist`/`.git`/profiles, and every `package.json` script reference resolves.
