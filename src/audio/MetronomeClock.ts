import { AudioEngine } from './AudioEngine';

export type BeatCallback = (beat: number, isAccent: boolean, time: number) => void;

export class MetronomeClock {
  private bpm = 60;
  private beatsPerBar = 4;
  private isRunning = false;
  private currentBeat = 0;
  private nextBeatTime = 0;
  private timerId: number | null = null;
  private lookaheadMs = 25.0; // How frequently to call scheduling function (in milliseconds)
  private scheduleAheadSec = 0.1; // How far ahead to schedule audio (sec)
  private onBeatCallback: BeatCallback | null = null;

  constructor(bpm = 60, beatsPerBar = 4) {
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
  }

  public setBpm(bpm: number): void {
    this.bpm = Math.max(30, Math.min(240, bpm));
  }

  public setBeatsPerBar(beats: number): void {
    this.beatsPerBar = Math.max(1, beats);
  }

  public onBeat(cb: BeatCallback): void {
    this.onBeatCallback = cb;
  }

  public start(): void {
    if (this.isRunning) return;
    const engine = AudioEngine.getInstance();
    const ctx = engine.getContext();
    const now = ctx ? ctx.currentTime : 0;

    this.isRunning = true;
    this.currentBeat = 0;
    this.nextBeatTime = now + 0.05;

    this.scheduler();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId != null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private nextNote(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextBeatTime += secondsPerBeat;
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
  }

  private scheduleNote(beatNumber: number, time: number): void {
    const isAccent = beatNumber === 0;
    const engine = AudioEngine.getInstance();
    engine.playMetronomeClick(isAccent);
    this.onBeatCallback?.(beatNumber, isAccent, time);
  }

  private scheduler(): void {
    if (!this.isRunning) return;

    const engine = AudioEngine.getInstance();
    const ctx = engine.getContext();
    const currentTime = ctx ? ctx.currentTime : 0;

    while (this.nextBeatTime < currentTime + this.scheduleAheadSec) {
      this.scheduleNote(this.currentBeat, this.nextBeatTime);
      this.nextNote();
    }

    this.timerId = window.setTimeout(() => this.scheduler(), this.lookaheadMs);
  }
}
