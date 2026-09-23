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
}

export type AudioStatusCallback = (status: 'loading' | 'ready' | 'error', message: string) => void;

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private activeVoices = new Map<string, ActiveVoice>();
  private isReady = false;
  private loadPromise: Promise<boolean> | null = null;
  private onStatusChange: AudioStatusCallback | null = null;

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private constructor() {}

  public setStatusCallback(cb: AudioStatusCallback) {
    this.onStatusChange = cb;
  }

  public async ensureContext(): Promise<AudioContext | null> {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.onStatusChange?.('error', 'Web Audio API не поддерживается данным браузером');
      return null;
    }
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('AudioContext resume failed', e);
      }
    }
    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public async preloadSamples(): Promise<boolean> {
    if (this.isReady) return true;
    if (this.loadPromise) return this.loadPromise;

    this.onStatusChange?.('loading', 'Загружаю акустическое пианино…');

    this.loadPromise = (async () => {
      try {
        const ctx = await this.ensureContext();
        if (!ctx) throw new Error('Cannot initialize AudioContext');

        const results = await Promise.all(
          PIANO_SAMPLE_ROOTS.map(async root => {
            const url = PIANO_SAMPLE_BASE + root.name;
            const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw new Error(`${root.name} HTTP ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
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

  private nearestRoot(midi: number): PianoSampleRoot {
    return PIANO_SAMPLE_ROOTS.reduce(
      (best, x) => (Math.abs(x.midi - midi) < Math.abs(best.midi - midi) ? x : best),
      PIANO_SAMPLE_ROOTS[0]
    );
  }

  public async playPianoMidi(
    midi: number,
    velocity = 96,
    voiceKey: string | null = null
  ): Promise<void> {
    if (!Number.isFinite(midi) || midi < MIDI_MIN || midi > MIDI_MAX) return;

    const ctx = await this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (!this.isReady) {
      const ok = await this.preloadSamples();
      if (!ok) return;
    }

    const root = this.nearestRoot(midi);
    const buffer = this.buffers.get(root.midi);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (midi - root.midi) / 12);

    const v = clamp(Number(velocity) || 96, 1, 127) / 127;
    gain.gain.value = 0.14 + 0.72 * Math.pow(v, 1.35);

    source.connect(gain);
    gain.connect(this.masterGain);

    const key = voiceKey || `oneshot:${midi}:${performance.now()}`;
    const old = this.activeVoices.get(key);
    if (old) {
      this.releaseVoice(key, 0.035);
    }

    this.activeVoices.set(key, { source, gain });
    source.onended = () => {
      if (this.activeVoices.get(key)?.source === source) {
        this.activeVoices.delete(key);
      }
    };

    source.start();
  }

  public releaseVoice(voiceKey: string, releaseSec = 0.14): void {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice || !this.ctx) return;

    const t = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + releaseSec);
      voice.source.stop(t + releaseSec + 0.03);
    } catch (e) {
      // Ignored if already stopped
    }
    this.activeVoices.delete(voiceKey);
  }

  public playPianoByKeyId(keyId: string, velocity = 96): void {
    const midi = midiFromKeyId(keyId);
    if (midi != null) {
      this.playPianoMidi(midi, velocity);
    }
  }

  public async playMetronomeClick(accent = false): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx) return;

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
