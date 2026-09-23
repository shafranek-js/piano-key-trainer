import {
  MIDI_MIN,
  MIDI_MAX,
  TRAINER_RANGE_LABEL,
  keyIdFromMidi,
  pitchClassFromMidi
} from './types';
import type { NoteName } from '../core/fsrs/types';

export interface MidiNoteOnEvent {
  midi: number;
  keyId: string;
  noteName: NoteName;
  velocity: number;
  channel: number;
  voiceKey: string;
  timestamp: number;
}

export interface MidiNoteOffEvent {
  midi: number;
  keyId: string;
  channel: number;
  voiceKey: string;
  timestamp: number;
  durationMs: number;
}

export type MidiStatusCallback = (status: {
  connected: boolean;
  deviceCount: number;
  deviceNames: string[];
  message: string;
}) => void;

export class MidiController {
  private static instance: MidiController | null = null;
  private midiAccess: MIDIAccess | null = null;
  private heldNotes = new Set<string>(); // keyIds currently pressed
  private activeNoteOns = new Map<string, number>(); // voiceKey -> performance.now()
  private noteOnListeners = new Set<(ev: MidiNoteOnEvent) => void>();
  private noteOffListeners = new Set<(ev: MidiNoteOffEvent) => void>();
  private statusListeners = new Set<MidiStatusCallback>();

  public static getInstance(): MidiController {
    if (!MidiController.instance) {
      MidiController.instance = new MidiController();
    }
    return MidiController.instance;
  }

  private constructor() {}

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  public getHeldNotes(): ReadonlySet<string> {
    return this.heldNotes;
  }

  public onNoteOn(cb: (ev: MidiNoteOnEvent) => void): () => void {
    this.noteOnListeners.add(cb);
    return () => this.noteOnListeners.delete(cb);
  }

  public onNoteOff(cb: (ev: MidiNoteOffEvent) => void): () => void {
    this.noteOffListeners.add(cb);
    return () => this.noteOffListeners.delete(cb);
  }

  public onStatusChange(cb: MidiStatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      this.notifyStatus(false, 0, [], 'Web MIDI недоступен в этом браузере или контексте (требуется HTTPS / localhost)');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess.onstatechange = () => this.attachInputs();
      this.attachInputs();
      return true;
    } catch (e) {
      this.notifyStatus(false, 0, [], 'Доступ к MIDI не разрешён пользователем');
      console.warn('MIDI access request rejected', e);
      return false;
    }
  }

  private attachInputs(): void {
    if (!this.midiAccess) return;

    const names: string[] = [];
    let count = 0;

    this.midiAccess.inputs.forEach(input => {
      count++;
      if (input.name) names.push(input.name);
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMidiMessage(e);
    });

    const connected = count > 0;
    const msg = connected
      ? `${names.join(', ')} · диапазон ${TRAINER_RANGE_LABEL}`
      : 'MIDI-устройство не найдено. Подключите инструмент по USB.';

    this.notifyStatus(connected, count, names, msg);
  }

  private notifyStatus(connected: boolean, count: number, names: string[], message: string): void {
    const payload = { connected, deviceCount: count, deviceNames: names, message };
    this.statusListeners.forEach(cb => cb(payload));
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const note = data[1];
    const velocity = data[2] ?? 0;
    const voiceKey = `midi:${channel}:${note}`;
    const now = performance.now();

    if (status === 0x90 && velocity > 0) {
      // Note On
      if (note < MIDI_MIN || note > MIDI_MAX) return;

      const keyId = keyIdFromMidi(note);
      const noteName = pitchClassFromMidi(note);

      this.heldNotes.add(keyId);
      this.activeNoteOns.set(voiceKey, now);

      const ev: MidiNoteOnEvent = {
        midi: note,
        keyId,
        noteName,
        velocity,
        channel,
        voiceKey,
        timestamp: now
      };

      this.noteOnListeners.forEach(cb => cb(ev));
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      // Note Off
      const keyId = keyIdFromMidi(note);
      this.heldNotes.delete(keyId);

      const onTime = this.activeNoteOns.get(voiceKey) ?? now;
      this.activeNoteOns.delete(voiceKey);
      const durationMs = Math.max(0, now - onTime);

      const ev: MidiNoteOffEvent = {
        midi: note,
        keyId,
        channel,
        voiceKey,
        timestamp: now,
        durationMs
      };

      this.noteOffListeners.forEach(cb => cb(ev));
    }
  }
}
