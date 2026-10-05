import { AudioEngine } from './AudioEngine';

export interface MetronomeBeat {
  beat: number;
  isAccent: boolean;
  expectedOnsetMs: number;
  index: number;
  countIn: boolean;
}

export type BeatCallback = (beat: MetronomeBeat) => void;

export interface MetronomeClockPort {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (id: number) => void;
  scheduleClick: (accent: boolean, atMonotonicMs: number) => void;
}

const browserClockPort: MetronomeClockPort = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: id => window.clearTimeout(id),
  scheduleClick: (accent, atMonotonicMs) => {
    const engine = AudioEngine.getInstance();
    const ctx = engine.getContext();
    const audioTime = ctx
      ? ctx.currentTime + Math.max(0, atMonotonicMs - performance.now()) / 1000
      : undefined;
    engine.playMetronomeClick(accent, audioTime);
  }
};

export class MetronomeClock {
  private isRunning = false;
  private timers = new Set<number>();
  private generation = 0;

  constructor(private readonly port: MetronomeClockPort = browserClockPort) {}

  /** Runs one bounded count-in + beat sequence on a monotonic timeline. */
  public startSequence(params: {
    bpm: number;
    beats: number;
    countInBeats?: number;
    onBeat: BeatCallback;
  }): number[] {
    this.stop();
    const generation = ++this.generation;
    const bpm = Math.max(30, Math.min(240, params.bpm));
    const countInBeats = Math.max(0, Math.floor(params.countInBeats ?? 0));
    const totalBeats = Math.max(0, Math.floor(params.beats)) + countInBeats;
    const intervalMs = 60_000 / bpm;
    const startAt = this.port.now() + 80;
    const expectedOnsets: number[] = [];
    this.isRunning = true;
    for (let index = 0; index < totalBeats; index += 1) {
      const expectedOnsetMs = startAt + index * intervalMs;
      const beat = index % 4;
      const isAccent = beat === 0;
      const countIn = index < countInBeats;
      expectedOnsets.push(expectedOnsetMs);
      this.port.scheduleClick(isAccent, expectedOnsetMs);
      const delay = Math.max(0, expectedOnsetMs - this.port.now());
      const timer = this.port.setTimeout(() => {
        this.timers.delete(timer);
        if (!this.isRunning || generation !== this.generation) return;
        params.onBeat({ beat, isAccent, expectedOnsetMs, index, countIn });
        if (index === totalBeats - 1) this.isRunning = false;
      }, delay);
      this.timers.add(timer);
    }
    return expectedOnsets;
  }

  public stop(): void {
    this.generation += 1;
    this.isRunning = false;
    for (const timer of this.timers) this.port.clearTimeout(timer);
    this.timers.clear();
  }

  public get running(): boolean { return this.isRunning; }
}
