import {
  PIANO_SAMPLE_BASE,
  PIANO_SAMPLE_ROOTS,
  MIDI_MIN,
  MIDI_MAX,
  midiFromKeyId,
  type PianoSampleRoot
} from './types';
import { clamp } from '../core/fsrs/math';

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  timerId?: number;
}

export type AudioStatusCallback = (status: 'loading' | 'ready' | 'error', message: string) => void;

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rawBuffers = new Map<number, ArrayBuffer>();
  private buffers = new Map<number, AudioBuffer>();
  private activeVoices = new Map<string, ActiveVoice>();
  private isReady = false;
  private isWarmedUp = false;
  private loadPromise: Promise<boolean> | null = null;
  private onStatusChange: AudioStatusCallback | null = null;
  private noteOffTimers = new Set<number>();

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private constructor() {}

  public setStatusCallback(cb: AudioStatusCallback) {
    this.onStatusChange = cb;
    if (this.isReady) {
      cb('ready', 'Акустическое пианино готово (Yamaha C5)');
    }
  }

  public isSamplesReady(): boolean {
    return this.isReady;
  }

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.onStatusChange?.('error', 'Web Audio API не поддерживается данным браузером');
      return null;
    }
    if (!this.ctx) {
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private warmUpAudioGraph(ctx: AudioContext): void {
    if (this.isWarmedUp || !this.masterGain) return;
    try {
      const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(this.masterGain);
      source.start(0);
      this.isWarmedUp = true;
    } catch {
      // Ignore if context is not yet running
    }
  }

  public async ensureContext(): Promise<AudioContext | null> {
    const ctx = this.getOrCreateContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn('AudioContext resume failed', e);
      }
    }
    if (ctx.state === 'running') {
      this.warmUpAudioGraph(ctx);
    }
    return ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Preloads and decodes all piano samples immediately in the background.
   * Crucially, this does NOT await ctx.resume(), because in modern browsers
   * ctx.resume() hangs until a user gesture, whereas ctx.decodeAudioData()
   * works immediately even while the AudioContext is in 'suspended' state.
   */
  public async preloadSamples(): Promise<boolean> {
    if (this.isReady) return true;
    if (this.loadPromise) return this.loadPromise;

    this.onStatusChange?.('loading', 'Загружаю акустическое пианино…');

    this.loadPromise = (async () => {
      try {
        const ctx = this.getOrCreateContext();
        if (!ctx) throw new Error('Cannot initialize AudioContext');

        const results = await Promise.all(
          PIANO_SAMPLE_ROOTS.map(async (root) => {
            if (this.buffers.has(root.midi)) return true;

            let arrayBuffer = this.rawBuffers.get(root.midi);
            if (!arrayBuffer) {
              const url = PIANO_SAMPLE_BASE + root.name;
              const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
              if (!res.ok) throw new Error(`${root.name} HTTP ${res.status}`);
              arrayBuffer = await res.arrayBuffer();
              this.rawBuffers.set(root.midi, arrayBuffer);
            }

            const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
            this.buffers.set(root.midi, audioBuffer);
            return true;
          })
        );

        this.isReady = results.every(Boolean);
        this.onStatusChange?.('ready', 'Акустическое пианино готово (Yamaha C5)');
        return true;
      } catch (e) {
        this.isReady = false;
        this.onStatusChange?.('error', 'Не удалось загрузить piano samples');
        console.error('Failed to load piano samples', e);
        return false;
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Called when the user selects a melody or starts playback.
   * Ensures all samples are decoded in RAM, resumes the AudioContext,
   * and warms up the hardware output stream before the first note is played.
   */
  public async prepareForPlayback(noteKeyIds?: readonly string[]): Promise<boolean> {
    const ctx = this.getOrCreateContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const loaded = await this.preloadSamples();
    if (!loaded) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore if called outside user gesture
      }
    }

    this.warmUpAudioGraph(ctx);

    if (noteKeyIds && noteKeyIds.length > 0) {
      for (const keyId of noteKeyIds) {
        const midi = midiFromKeyId(keyId);
        if (midi != null) {
          const root = this.nearestRoot(midi);
          this.buffers.get(root.midi);
        }
      }
    }

    return true;
  }

  private nearestRoot(midi: number): PianoSampleRoot {
    return PIANO_SAMPLE_ROOTS.reduce(
      (best, x) => (Math.abs(x.midi - midi) < Math.abs(best.midi - midi) ? x : best),
      PIANO_SAMPLE_ROOTS[0]
    );
  }

  private triggerNoteSync(
    ctx: AudioContext,
    midi: number,
    velocity: number,
    voiceKey: string | null,
    durationMs?: number
  ): void {
    if (!this.masterGain) return;
    const root = this.nearestRoot(midi);
    const buffer = this.buffers.get(root.midi);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (midi - root.midi) / 12);

    const v = clamp(Number(velocity) || 96, 1, 127) / 127;
    const targetGain = 0.14 + 0.72 * Math.pow(v, 1.35);
    gain.gain.setValueAtTime(targetGain, ctx.currentTime);

    source.connect(gain);
    gain.connect(this.masterGain);

    const key = voiceKey || `midi:${midi}`;
    const old = this.activeVoices.get(key);
    if (old) {
      if (old.timerId !== undefined) {
        window.clearTimeout(old.timerId);
        this.noteOffTimers.delete(old.timerId);
      }
      this.releaseVoice(key, 0.035);
    }

    const effectiveDurationMs =
      durationMs !== undefined && durationMs > 0
        ? Math.max(75, durationMs * 0.88)
        : voiceKey === null
          ? 1400
          : undefined;

    let timerId: number | undefined;
    if (effectiveDurationMs !== undefined) {
      timerId = window.setTimeout(() => {
        if (timerId !== undefined) this.noteOffTimers.delete(timerId);
        if (this.activeVoices.get(key)?.source === source) {
          this.releaseVoice(key, 0.14);
        }
      }, effectiveDurationMs);
      this.noteOffTimers.add(timerId);
    }

    this.activeVoices.set(key, { source, gain, timerId });
    source.onended = () => {
      const current = this.activeVoices.get(key);
      if (current?.source === source) {
        if (current.timerId !== undefined) {
          window.clearTimeout(current.timerId);
          this.noteOffTimers.delete(current.timerId);
        }
        this.activeVoices.delete(key);
      }
    };

    source.start(0);
  }

  /**
   * Triggers a piano note synchronously on the hot path when samples are preloaded.
   * Avoids async/await microtask delays on key presses and scheduled demo notes.
   */
  public playPianoMidi(
    midi: number,
    velocity = 96,
    voiceKey: string | null = null,
    durationMs?: number
  ): Promise<void> {
    if (!Number.isFinite(midi) || midi < MIDI_MIN || midi > MIDI_MAX) {
      return Promise.resolve();
    }

    const ctx = this.getOrCreateContext();
    if (!ctx || !this.masterGain) return Promise.resolve();

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    this.warmUpAudioGraph(ctx);

    if (this.isReady) {
      this.triggerNoteSync(ctx, midi, velocity, voiceKey, durationMs);
      return Promise.resolve();
    }

    return this.preloadSamples().then((ok) => {
      if (!ok) return;
      this.triggerNoteSync(ctx, midi, velocity, voiceKey, durationMs);
    });
  }

  public releaseVoice(voiceKey: string, releaseSec = 0.14): void {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice || !this.ctx) return;

    if (voice.timerId !== undefined) {
      window.clearTimeout(voice.timerId);
      this.noteOffTimers.delete(voice.timerId);
    }

    const t = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + releaseSec);
      voice.source.stop(t + releaseSec + 0.03);
    } catch {
      // Ignored if already stopped
    }
    this.activeVoices.delete(voiceKey);
  }

  public stopAllVoices(): void {
    this.noteOffTimers.forEach((id) => window.clearTimeout(id));
    this.noteOffTimers.clear();
    for (const key of Array.from(this.activeVoices.keys())) {
      this.releaseVoice(key, 0.06);
    }
  }

  public playPianoByKeyId(keyId: string, velocity = 96, durationMs?: number): Promise<void> {
    const midi = midiFromKeyId(keyId);
    if (midi != null) {
      return this.playPianoMidi(midi, velocity, null, durationMs);
    }
    return Promise.resolve();
  }

  public playMetronomeClick(accent = false): void {
    const ctx = this.getOrCreateContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = accent ? 1550 : 1250;

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.12 : 0.085, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }
}
