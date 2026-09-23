# Piano Key Trainer — Developer Handoff

## Overview

**Piano Key Trainer** is a desktop-first web application for beginner piano learners. Its goal is to build automatic keyboard orientation, note reading, aural recognition, and basic motor skills using spaced repetition, measured response latency, and a progressively structured learning program.

Current working version: **v6.0.1**.

The application is currently implemented as a **standalone single HTML file** using vanilla HTML, CSS, and JavaScript. There is no framework and no backend. Progress is stored locally in `localStorage`.

---

## Core pedagogical model

This is not just a quiz that shows a note and asks for an answer.

Different abilities are treated as **different memory units**.

Examples:

- `find:E` — find E on the piano keyboard.
- `identify:E` — identify the name of a highlighted piano key.
- `notationToKey:E` — see E on the staff and press the corresponding key.
- `soundToKey:E` — hear E and locate it on the keyboard.
- `patternIdentify:E` — answer a structural keyboard question such as “Which note is immediately to the right of the group of two black keys?”

These skills are related, but they are intentionally not treated as equivalent.

Progress in one skill must not automatically imply mastery in another.

---

## Memory / SRS engine

The application uses **FSRS-6**, rather than a fixed interval ladder.

Each card stores data including:

- Difficulty
- Stability
- Retrievability
- `dueAt`
- review count
- lapses
- first-attempt statistics
- response latency

Important rules:

- Only the **first attempt** determines the SRS result.
- If the user answers incorrectly and then corrects the answer, the card still records the first attempt as a failure.
- Corrective attempts are used for learning but do not rewrite the first attempt.
- Errors trigger a short relearning step.
- Free practice is **schedule-neutral** and must not artificially increase Stability.
- Response time is measured but remains secondary to correctness.
- Speed thresholds are personalized from the user's own history.
- Cold Test results do not modify FSRS scheduling.

There is also a Calibration Dashboard that compares predicted Retrievability with actual first-attempt recall.

Personal FSRS optimization is intentionally **not enabled yet**. It should only be activated after enough meaningful scheduled reviews have accumulated.

---

## Input methods

The application supports multiple input channels, but the allowed channel depends on the learning objective.

Examples:

### Find
Prompt:

> Find E.

Accepted:

- click the correct on-screen piano key;
- press the correct MIDI key.

Computer keyboard letter `E` should **not** count, because that would bypass the physical keyboard-location skill.

### Identify
Prompt:

> Which note is highlighted?

Accepted:

- on-screen answer buttons;
- computer keyboard letters C–B;
- numeric shortcuts 1–7.

### Pattern identification
Example:

> Which note is immediately to the right of the group of two black keys?

Accepted:

- click the corresponding piano key;
- MIDI;
- computer keyboard letter C–B.

This is stored separately as `patternIdentify`.

### Notation
Staff note → physical piano key.

Accepted:

- on-screen piano;
- MIDI.

### Ear training
Sound → physical piano key.

Accepted:

- on-screen piano;
- MIDI.

---

## Web MIDI

The application supports **Web MIDI**.

MIDI is used for:

- note detection;
- exact octave detection;
- velocity;
- note-on timing;
- note-off timing;
- coordination measurements;
- dynamics;
- articulation.

MIDI is the preferred input for advanced exercises because it provides much more reliable musical data than mouse interaction.

---

## Piano audio

The application does **not** use an oscillator-based synth piano.

It uses real acoustic piano samples based on **Salamander Grand Piano / Yamaha C5**.

The goal is to keep the sound recognizably piano-like.

If the piano samples fail to load, silence is preferable to falling back to an unpleasant synthetic oscillator.

---

## UI architecture

The UI is desktop-first.

Current structural concept:

### Top
A compact desktop-style menu bar.

Main sections include:

- Training
- Lessons
- Melodies
- Two Hands
- Progress
- Analytics
- Curriculum
- Diagnostics
- Calibration
- Settings

### Center
A unified **Task Stage**.

The Task Stage is the operational area for the current exercise.

Depending on the exercise, it can contain:

- the prompt;
- instruction text;
- feedback;
- letter answer buttons;
- a music staff;
- a melody phrase;
- guided lesson content;
- ear-training controls.

### Bottom
A persistent four-octave on-screen piano keyboard.

The keyboard should behave as a stable visual anchor.

It should not move vertically because of:

- feedback appearing;
- answer buttons appearing;
- labels changing;
- timers changing;
- different prompt lengths.

---

## Piano keyboard UI principles

The on-screen keyboard currently covers roughly four octaves.

Important rules:

- no note-name labels on the keys during training;
- realistic white/black-key proportions;
- no visible gaps between adjacent white keys;
- subtle depth/shadow is acceptable;
- avoid strong perspective distortion;
- highlighted keys must remain visually obvious;
- black keys must remain visually above white keys;
- focus states must never cause a white key to jump above black keys.

A previous bug occurred because `:focus-visible` changed key `z-index`. This must not return.

---

## Task feedback UX

The current Task Stage uses a compact status strip below the task rather than a separate feedback panel.

Preferred hierarchy:

1. exercise type / small meta information;
2. main question;
3. short instruction;
4. one-line status / feedback row;
5. optional secondary actions;
6. piano keyboard.

Internal FSRS terms should not be exposed to normal users.

Do not show raw terms such as:

- Again
- Good
- Hard
- P30
- P85

Prefer normal-language feedback such as:

- Correct
- Incorrect
- Faster than usual
- Slower than usual
- Normal speed

`I don't know` is a normal secondary action, not a warning state.

---

## Structured sessions

Available session concepts include:

- quick session — approximately 3 minutes;
- normal session — approximately 8 minutes;
- all due reviews;
- Cold Test.

The scheduler prioritizes:

1. due reviews;
2. limited new material;
3. optional schedule-neutral practice.

Timed sessions should not terminate an already displayed question halfway through.

---

## Cold Test

Cold Test is a diagnostic mode.

Principles:

- one attempt;
- no hints;
- no corrective retries;
- independent from FSRS scheduling;
- does not modify Stability, Difficulty, or due date;
- stores its own history.

Useful metrics include:

- accuracy;
- median response latency;
- weak notes;
- historical trend.

---

## Confusion engine

The application records directional first-attempt mistakes.

Examples:

- D → E
- E → D
- B → C

This supports:

- confusion matrices;
- identifying frequently confused note pairs;
- contrast drills.

Contrast drills should remain schedule-neutral.

---

## Curriculum

The curriculum progressively unlocks material.

Typical progression:

1. group of two black keys;
2. C, D, E;
3. group of three black keys;
4. F, G, A, B;
5. anchors C and F;
6. full white-key map;
7. black keys;
8. octaves;
9. staff notation;
10. ear training;
11. right-hand position;
12. left-hand position.

Unlocking is based on meaningful learning evidence rather than just click counts.

Criteria include:

- successful scheduled reviews;
- reviews across different sessions;
- Stability thresholds.

Previously studied cards should never disappear merely because curriculum rules changed.

---

## Guided Lessons

There is a separate Lessons section.

Lessons are intended to build a mental model before repetitive SRS practice.

The lesson flow is generally:

1. explanation;
2. small guided interaction;
3. immediate confirmation;
4. next step.

Lesson progress is stored separately from FSRS scheduling.

Existing lesson themes include:

- group of two black keys;
- group of three black keys;
- C/F anchors;
- full white-key map;
- black keys;
- octaves;
- first notes on the staff;
- relative ear training;
- right-hand C position;
- left-hand C position.

---

## Repertoire / melodies

There is a small beginner repertoire layer.

Examples include:

- Ode to Joy;
- Mary Had a Little Lamb;
- Twinkle;
- simple five-note exercises.

Melodies support:

- Wait Mode;
- Slow tempo;
- Normal tempo;
- metronome;
- keyboard representation;
- staff representation.

### Wait Mode

The application waits for the correct pitch.

If the expected key is C4 and the user presses D4:

- D4 may sound;
- the error is recorded;
- the melody cursor does **not** advance.

Only the correct pitch advances the sequence.

---

## Staff repertoire

Melodies can also be displayed directly on the music staff.

The current note should be visually highlighted.

The application should avoid revealing the note name as text when staff reading is the intended skill.

Repertoire notation has been expanded to include:

- 4/4 meter;
- bar lines;
- short phrases;
- rests;
- current-measure highlighting;
- count-in before tempo modes.

---

## Rhythm

Rhythm is analyzed separately from pitch and FSRS.

Available tempo modes include:

- Wait;
- Slow;
- Normal.

Metrics include:

- rhythm accuracy;
- early/late timing;
- mean absolute timing error.

Rhythm mistakes must never reduce FSRS Stability.

---

## Dynamics

For MIDI input, dynamics can be evaluated from velocity.

Current target levels include:

- `p`
- `mf`
- `f`

This is stored independently from:

- pitch;
- rhythm;
- FSRS.

Mouse input can still play the exercise, but the application must not pretend that mouse clicks provide meaningful velocity information.

---

## Articulation

MIDI note-on / note-off duration can be used to evaluate articulation.

Current concepts include:

- legato;
- detached.

The duration of the physical key press is compared with the expected note duration.

Articulation scoring is independent of FSRS.

---

## Hand foundations

Guided lessons include basic hand positions.

### Right hand
C4–G4:

- fingers 1–2–3–4–5.

### Left hand
C3–G3:

- fingers 5–4–3–2–1.

The application can verify the key, but it cannot reliably verify which finger was used.

Finger numbers therefore remain a **guided self-check**, not an automatically verified metric.

---

## Two-hand introduction

A first two-hand layer already exists.

Exercise types include:

### Mirror pairs
Examples:

- C3 + C4;
- D3 + D4;
- E3 + E4.

The goal is simultaneous note-on.

### Left-hand anchor
Example:

- left hand holds C3;
- right hand plays C4–G4.

MIDI can verify whether C3 actually remains held.

### Hand ping-pong
Alternating left- and right-hand notes.

Metrics can include:

- correct pitch;
- timing;
- note-on simultaneity;
- held anchor;
- coordination error.

Mouse interaction can demonstrate the sequence, but should not be treated as objective coordination measurement.

---

## Analytics

The application has separate views for:

- Progress;
- Analytics;
- Diagnostics;
- Calibration.

Tracked information includes:

- first-attempt recall;
- reaction time;
- FSRS memory state;
- confusion pairs;
- Cold Test history;
- repertoire performance;
- rhythm;
- dynamics;
- articulation;
- session history.

Analytics should **read** learning data and must not silently alter scheduling.

---

## Calibration

The Calibration Dashboard compares FSRS predictions against actual recall.

Metrics include:

- scheduled review count;
- average predicted Retrievability;
- actual first-attempt recall;
- prediction error;
- calibration buckets;
- ECE;
- Brier score;
- skill-level calibration;
- latency calibration.

Personal FSRS tuning should remain locked until enough reliable review history exists.

A conservative readiness threshold is currently based on roughly:

- 300 scheduled reviews;
- sufficient coverage across several skills.

---

## Persistence

The application currently uses browser `localStorage`.

Stored data includes:

- FSRS cards;
- review log;
- Cold Test history;
- lesson progress;
- repertoire performance;
- analytics data;
- preferences.

Import/export to JSON is supported.

Backward compatibility of stored state should be considered during refactoring.

---

## Accessibility / interaction

Implemented or intended principles include:

- keyboard navigation of the top menu;
- visible but non-destructive focus states;
- reduced-motion support;
- touch-friendly controls;
- screen-reader semantics;
- keyboard answer shortcuts;
- MIDI-first preferences.

Informational pages may scroll vertically.

The Training view should remain as stable as possible inside the viewport.

---

## Important UX rules

These rules came from repeated iteration and should be preserved:

1. Do not try to show everything on one dashboard.
2. The piano keyboard is a stable visual anchor.
3. Feedback must not move the piano.
4. No note labels directly on keys during exercises.
5. The user must immediately understand what they are expected to answer.
6. One screen should have one dominant task.
7. Technical SRS data should remain visually secondary.
8. Informational screens must scroll normally if their content exceeds the viewport.
9. Do not use `overflow:hidden` on content pages just to force them into one screen.
10. After major UI changes, perform **real browser visual QA**, not only syntax checks.

---

## Regression history / bugs worth remembering

Several bugs were found during iterative development.

### Navigation page overlap
Cause:

A generic `[data-page]` click listener also matched page containers, so event bubbling switched the view back.

Rule:

Bind navigation events only to actual navigation controls.

### Training page remained visible under other pages
Cause:

A `display:grid !important` rule overrode the inactive-page state.

Rule:

Only the active workspace page may be visible.

### White key rose above black keys
Cause:

`:focus-visible` changed the key's `z-index`.

Rule:

Focus styling must never change piano layering.

### Hidden lesson content
Cause:

Desktop informational pages used `overflow:hidden`.

Rule:

All informational pages must support vertical scrolling when required.

### Piano movement
Cause:

Task text and feedback were part of normal document flow.

Rule:

Use a stable Task Stage and persistent keyboard region.

---

## Current technical architecture

The project began as a small standalone prototype and has grown significantly.

It is still primarily a **single HTML file with inline CSS and JavaScript**.

This means the product now has substantial technical debt.

The next developer should strongly consider modular refactoring before adding many more major features.

---

## Recommended refactoring structure

A possible future structure:

```text
/app
  state.js
  fsrs.js
  scheduler.js
  skills.js
  sessions.js

/audio
  piano.js
  midi.js
  metronome.js

/ui
  router.js
  task-stage.js
  keyboard.js
  feedback.js
  settings.js

/learning
  lessons.js
  curriculum.js
  repertoire.js
  two-hand.js

/analytics
  calibration.js
  diagnostics.js
  analytics.js
```

A framework is not mandatory.

A modular vanilla-JS architecture would already be a major improvement.

---

## Refactoring strategy

Do **not** rewrite everything from scratch while simultaneously changing behavior.

Recommended sequence:

1. freeze current behavior;
2. add browser-level regression tests;
3. extract state/storage;
4. extract FSRS and scheduling;
5. extract MIDI/audio;
6. extract piano keyboard component;
7. extract Task Stage;
8. extract lessons/repertoire;
9. extract analytics;
10. only then redesign internal APIs.

Behavior preservation is more important than architectural elegance during the first refactoring pass.

---

## High-value behavior that must not be lost

The most important parts of the application are not the visual effects.

Preserve:

- skill separation;
- first-attempt semantics;
- FSRS scheduling;
- schedule-neutral free practice;
- independent diagnostic modes;
- MIDI;
- latency measurement;
- Task Stage concept;
- persistent piano keyboard;
- distinction between knowledge answers and physical-key answers;
- separate pitch / rhythm / dynamics / articulation / coordination metrics.

If all note-related exercises are collapsed into one generic `note=C` score during a rewrite, a large part of the pedagogical design will be lost.

---

## Current roadmap status

Most of the originally planned functional roadmap is complete.

Implemented areas include:

- keyboard geography;
- spaced repetition;
- latency;
- MIDI;
- notation;
- ear training;
- curriculum;
- guided lessons;
- repertoire;
- rhythm;
- staff reading;
- measures and rests;
- hand positions;
- dynamics;
- articulation;
- two-hand introduction;
- analytics;
- calibration;
- accessibility improvements.

The major intentionally deferred feature is:

### Personal FSRS tuning

This should only be implemented when the calibration data shows that sufficient review history has accumulated.

---

## Short product pitch

> **Piano Key Trainer** is a desktop-first adaptive piano-learning web app for beginners. It combines four-octave keyboard orientation, note reading, relative ear training, Web MIDI, guided lessons, repertoire, rhythm, dynamics, articulation, and introductory two-hand coordination. Learning is scheduled with FSRS-6, with separate memory models for different skills involving the same note, strict first-attempt semantics, and personalized response-time analysis. The UI is built around a central Task Stage and a persistent piano keyboard. Functionally the product is already broad, but it grew from a single-file prototype, so the next major engineering priority should be modular refactoring while preserving the existing pedagogical and scheduling behavior.
