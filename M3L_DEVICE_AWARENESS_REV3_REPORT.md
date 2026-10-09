# M3L Rev3 — MIDI Port Isolation & Device Range Safety Report

## 1. Baseline and scope

- Baseline: `d5f662f` (M3L Rev2) on `stabilization/m3k-audit-remediation`. HOLD was raised by physical MIDI acceptance blockers.
- Targeted revision only: M3L pedagogy, compact voicings, metronome, assessment, FSRS and persistence contracts are unchanged.
- Out of scope unchanged: new pedagogy, FSRS retuning, AudioEngine/MIDI redesign, `App.svelte` decomposition.

## 2. Port-aware MIDI events

`MidiController` now tags every `Note On`, `Note Off` and raw-note callback with the originating input port id (`portId`), and held notes are tracked per port (`heldNotesByPort`, union preserved for existing UI via `getHeldNotes()`).

- M3L routes input only when `acceptsPortEvent(selectedMidiInputId, event.portId)`; events from any other device are ignored before calibration, held-note bookkeeping or scoring.
- Held identities are `portId:keyId` (`heldNoteIdentity`), so the same note/channel from two devices cannot collide or clear each other.
- On disconnect, that port's held notes are pruned; other ports are untouched.
- Verified by `tests/unit/midiPortIsolation.test.ts` (5 tests) using an isolated controller and two fake ports: per-port tagging, held isolation, calibration consumption, out-of-range delivery via the extended range, stale-port pruning.

## 3. Verified physical range before timed exercises

A known-device fallback range is now informational only.

- `isRangeVerified(capability, stale)` requires `source === 'calibration'`, `calibrated`, not `needsRevalidation` and not stale.
- `planTwoHandArrangement({ verified: false })` returns an explicit **simulation** arrangement (never the original voicings pretending to be playable): «Откалибруйте или подтвердите диапазон, чтобы играть физически».
- `handleTwoHandNoteInput` drops physical (`midi`) input when the range is unverified; on-screen simulation remains available and remains labelled as not counting toward physical mastery (module completion still requires a MIDI-graded assessment).
- Stale ranges (out-of-range transmitted note, e.g. after an Octave −/+ change) stop an active run without grading and block physical grading until resolved.

## 4. Safe range reconfirmation

- The boolean reset (`confirmMidiRange`) is removed.
- The «Проверить диапазон» action runs `startVerification(device, expected)`: the player must press the same leftmost/rightmost keys again; only a matching capture (`verifyCapturedRange === 'match'`) clears the stale flag and refreshes `calibratedAt`. A mismatch keeps the stale state and requires recalibration.
- Interrupted timed runs restart with a fresh count-in; no failed grade and no review log is produced.

## 5. Calibrated ranges outside the virtual piano

- `MidiController.setExtendedRange(true)` is scoped to an open two-hand exercise; validated arrangements may use any MIDI note 0–127. The visual C2–C6 keyboard is unchanged (unavailable keys are marked).
- Verified C1–C3 (24–48) voicings preserve chord identity and slash bass and are graded through real MIDI events:

| Chord | LH bass | RH triad |
| --- | --- | --- |
| C | C2 (36) | E2–G2–C3 (40,43,48) |
| G/B | B1 (35) | D2–G2–B2 (38,43,47) |
| Am | A1 (33) | E2–A2–C3 (40,45,48) |
| F | F1 (29) | F2–A2–C3 (41,45,48) |

## 6. Calibration input isolation

- While calibration is active, `MidiController` consumes calibration `Note On` **and** `Note Off` entirely (no scored events), including the last rightmost key; raw notes still reach the calibration handler.
- `handleTwoHandNoteInput` additionally refuses input while the calibration panel is open. A calibration completed during an active run produced zero attempts, zero evaluations and zero review logs in the smoke.

## 7. Production smoke (real synthetic port-originated events)

`npm run smoke:m3l` now drives per-port events (`__m3lNoteOnFrom` / `__m3lNoteOffFrom` / scheduled `midiFrom` timelines), not just UI device selection. 15 scenarios, all green twice in a row:

- P0-A/P0-B right-hand correction (MIDI + screen), four-bar continuous phrase, independent hints, 12-trial MIDI assessment, wrong-bass classification, delayed extra note, disconnect, failed-assessment recovery, remediation gating/mapping, shared metronome 4-3-2-1, device profile/calibration trace/multi-device selection, **port isolation** (foreign device ignored, calibration isolated, held identity stable), **verified-range safety** (unverified → simulation and no grading; C1–C3 sub-C2 notes graded; stale blocked until matching reconfirmation; calibration during run and device switch during run produce no grade/logs), integrity.

## 8. Verification

- `npm run verify`: typecheck clean, svelte-check 0/0, **655/655 tests in 42 files**, production build clean.
- Regression smokes: `smoke:m3k`, `smoke:cold-test`, `smoke:persistence-integrity`, `smoke:daily-practice` all green; no duplicate ReviewLogs anywhere.
- Evidence: `acceptance/m3l-rev3/evidence.json`, `acceptance/m3l-rev3/smoke-summary.json` (includes the continuous phrase trace and C1–C3 note lists), screenshots `01-m3l-rev3-device-range.png`, `02-m3l-rev3-compact-four-bars.png`, `03-m3l-rev3-assessment-midi.png`, `04-m3l-rev3-remediation-gate.png`.

## 9. Manual acceptance plan (real Arturia MicroLab mk3)

1. Connect the MicroLab and, if a second controller is available, also connect it: select the MicroLab explicitly.
2. Verify that playing the second device produces no M3L input, then play on the MicroLab and confirm grading.
3. Calibrate C2–C4 (or the physical range); confirm the exercise re-plans and all hints are playable.
4. Change Octave −/+ and confirm the stale notice, that physical grading is blocked, then reconfirm by pressing the leftmost/rightmost keys again.
5. Play the four compact bars and complete one assessment on hardware; confirm no duplicate logs.

## 10. Clean extraction

`piano-key-trainer-m3l-two-hand-accompaniment-rev3.zip` is built deterministically (double-build byte equality), contains only `acceptance/m3l-rev3`, no `node_modules`/`dist`/`.git`/profiles, and every `package.json` script reference resolves.
