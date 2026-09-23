# Piano Key Trainer 🎹

> Adaptive desktop-first piano learning web application with **FSRS-6**, **Web MIDI**, **Web Audio (Salamander Grand Piano)**, and introductory two-hand coordination.

---

## 🌟 Key Features

* **Decoupled FSRS-6 Memory Engine:**
  * Spaced repetition with 21 parameters modeling power-law memory decay ($R(t)$).
  * Strict first-attempt semantics: secondary retries help learning without rewriting SRS history.
  * Separate memory units for distinct skills (`find`, `identify`, `patternIdentify`, `notationToKey`, `soundToKey`).
  * Adaptive speed-grading with personalized $P30$ and $P85$ latency thresholds.
* **Acoustic Sound & Web MIDI:**
  * Real acoustic recordings based on **Salamander Grand Piano (Yamaha C5)** across 4 octaves.
  * Full Web MIDI support: velocity for dynamics ($p / mf / f$), note-off duration for articulation ($legato / detached$), exact octave detection.
  * High-precision metronome on Web Audio Clock (lookahead scheduler).
* **Keyboard & UI Ergonomics:**
  * 4-octave persistent keyboard anchor (C2–C6: 29 white keys, 20 black keys) without sub-pixel hairline gaps or vertical jumping.
  * Central unified **Task Stage** for prompts, instructions, reaction timing, and staff views.
  * Vector SVG music notation with treble clef, ledger lines, 4/4 measures, and phrase grouping.
* **Guided Learning & Music:**
  * **Guided Lessons:** 10 structured mini-lessons covering keyboard geography, black key patterns, anchors C & F, octaves, staff reading, relative ear training, and hand positions (C-position fingers 1–5).
  * **Repertoire:** 4 beginner pieces with Wait Mode, Slow (60 BPM), and Normal (90 BPM) tempos.
  * **Two-Hand Coordination:** Mirror pairs, left-hand bass anchor with right-hand melody, and hand ping-pong.
* **Local-First & Offline:**
  * IndexedDB storage via **Dexie.js** with seamless migration from legacy `localStorage`.
  * Offline-first **PWA** with runtime caching of sound assets.
  * Ready for cloud synchronization via **Supabase**.

---

## 🛠 Tech Stack

* **Frontend:** [Svelte 5](https://svelte.dev/) (runes & compile-time reactivity), [Vite 6](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
* **Database & Storage:** [Dexie.js](https://dexie.org/) (IndexedDB), [Supabase](https://supabase.com/)
* **Audio & MIDI:** Web Audio API, Web MIDI API
* **Testing:** [Vitest](https://vitest.dev/)
* **PWA:** `vite-plugin-pwa` (Workbox)

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/shafranek-js/piano-key-trainer.git
cd piano-key-trainer
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in Chrome or Edge (recommended for Web MIDI support).

### 3. Run Tests
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

---

## 📄 License

MIT
