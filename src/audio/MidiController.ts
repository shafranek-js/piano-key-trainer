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
  portId: string;
}

export interface MidiNoteOffEvent {
  midi: number;
  keyId: string;
  channel: number;
  voiceKey: string;
  timestamp: number;
  durationMs: number;
  portId: string;
}

export type MidiStatusCallback = (status: {
  connected: boolean;
  deviceCount: number;
  deviceNames: string[];
  message: string;
  connectedPortIds?: string[];
}) => void;

export interface MidiInputDescriptor {
  id: string;
  name: string;
  manufacturer: string;
  portName: string;
  state: string;
}

export type RawNoteCallback = (portId: string, note: number, velocity: number, channel: number) => void;

export class MidiController {
  private static instance: MidiController | null = null;
  private midiAccess: MIDIAccess | null = null;
  private heldNotes = new Set<string>(); // keyIds currently pressed (union across ports)
  private heldNotesByPort = new Map<string, Set<string>>(); // portId -> keyIds
  private activeNoteOns = new Map<string, number>(); // `${portId}:${channel}:${note}` -> performance.now()
  private noteOnListeners = new Set<(ev: MidiNoteOnEvent) => void>();
  private noteOffListeners = new Set<(ev: MidiNoteOffEvent) => void>();
  private statusListeners = new Set<MidiStatusCallback>();
  private rawNoteListeners = new Set<RawNoteCallback>();
  private calibrationMode = false;
  private calibrationVoiceKeys = new Set<string>(); // voiceKeys captured during calibration, awaiting Note Off
  private extendedRange = false;
  private connectedPortIds = new Set<string>();

  public static getInstance(): MidiController {
    if (!MidiController.instance) {
      MidiController.instance = new MidiController();
    }
    return MidiController.instance;
  }

  /** Isolated instance for tests; production continues to use the singleton. */
  public static createIsolated(): MidiController {
    return new MidiController();
  }

  private constructor() {}

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  public getHeldNotes(): ReadonlySet<string> {
    return this.heldNotes;
  }

  public getHeldNotesForPort(portId: string): ReadonlySet<string> {
    return this.heldNotesByPort.get(portId) ?? new Set<string>();
  }

  /**
   * While enabled, transmitted notes outside the virtual C2–C6 piano are still delivered
   * to listeners (used by validated M3L arrangements). The visual keyboard is unchanged.
   */
  public setExtendedRange(active: boolean): void {
    this.extendedRange = active;
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

  /**
   * Raw note-on stream used for device-range calibration and stale-range detection.
   * Emits every transmitted note, including notes outside the virtual C2–C6 piano range.
   */
  public onRawNoteOn(cb: RawNoteCallback): () => void {
    this.rawNoteListeners.add(cb);
    return () => this.rawNoteListeners.delete(cb);
  }

  /** While active, raw notes are emitted and virtual-piano routing is suppressed. */
  public setCalibrationMode(active: boolean): void {
    this.calibrationMode = active;
    if (active) {
      this.calibrationVoiceKeys.clear();
    }
  }

  public isPortConnected(portId: string | null | undefined): boolean {
    if (!portId) return false;
    return this.connectedPortIds.has(portId);
  }

  public getConnectedPortIds(): ReadonlySet<string> {
    return this.connectedPortIds;
  }

  public getInputDescriptors(): MidiInputDescriptor[] {
    if (!this.midiAccess) return [];
    const descriptors: MidiInputDescriptor[] = [];
    this.midiAccess.inputs.forEach(input => {
      descriptors.push({
        id: input.id,
        name: input.name ?? '',
        manufacturer: input.manufacturer ?? '',
        portName: input.name ?? '',
        state: input.state ?? 'disconnected'
      });
    });
    return descriptors;
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
    const connectedPortIds = new Set<string>();

    this.midiAccess.inputs.forEach(input => {
      if (input.state !== 'connected') return;
      count++;
      connectedPortIds.add(input.id);
      if (input.name) names.push(input.name);
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMidiMessage(e, input.id);
    });

    this.connectedPortIds = connectedPortIds;

    // A disconnected port must not keep stale held notes that could corrupt identities.
    for (const portId of [...this.heldNotesByPort.keys()]) {
      if (!connectedPortIds.has(portId)) this.clearPortHeldNotes(portId);
    }

    const connected = count > 0;
    const msg = connected
      ? `${names.join(', ')} · диапазон ${TRAINER_RANGE_LABEL}`
      : 'MIDI-устройство не найдено. Подключите инструмент по USB.';

    this.notifyStatus(connected, count, names, msg);
  }

  private clearPortHeldNotes(portId: string): void {
    const held = this.heldNotesByPort.get(portId);
    if (held) {
      this.heldNotesByPort.delete(portId);
      for (const keyId of held) {
        let stillHeld = false;
        for (const other of this.heldNotesByPort.values()) {
          if (other.has(keyId)) { stillHeld = true; break; }
        }
        if (!stillHeld) this.heldNotes.delete(keyId);
      }
    }
    for (const key of [...this.activeNoteOns.keys()]) {
      if (key.startsWith(`${portId}:`) || key.startsWith(`midi:${portId}:`)) {
        this.activeNoteOns.delete(key);
      }
    }
    for (const key of [...this.calibrationVoiceKeys.keys()]) {
      if (key.startsWith(`${portId}:`) || key.startsWith(`midi:${portId}:`)) {
        this.calibrationVoiceKeys.delete(key);
      }
    }
  }

  private notifyStatus(connected: boolean, count: number, names: string[], message: string): void {
    const payload = {
      connected,
      deviceCount: count,
      deviceNames: names,
      message,
      connectedPortIds: [...this.connectedPortIds]
    };
    this.statusListeners.forEach(cb => cb(payload));
  }

  private handleMidiMessage(event: MIDIMessageEvent, portId: string): void {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const note = data[1];
    const velocity = data[2] ?? 0;
    const voiceKey = `midi:${portId}:${channel}:${note}`;
    const now = performance.now();

    if (status === 0x90 && velocity > 0) {
      const wasCalibration = this.calibrationMode;
      // Note On — emit the raw stream first (calibration accepts any MIDI note number).
      this.rawNoteListeners.forEach(cb => cb(portId, note, velocity, channel));
      if (wasCalibration) {
        this.calibrationVoiceKeys.add(voiceKey);
        return;
      }
      if (!this.extendedRange && (note < MIDI_MIN || note > MIDI_MAX)) return;

      const keyId = keyIdFromMidi(note);
      const noteName = pitchClassFromMidi(note);

      this.heldNotes.add(keyId);
      const portHeld = this.heldNotesByPort.get(portId) ?? new Set<string>();
      portHeld.add(keyId);
      this.heldNotesByPort.set(portId, portHeld);
      this.activeNoteOns.set(voiceKey, now);

      const ev: MidiNoteOnEvent = {
        midi: note,
        keyId,
        noteName,
        velocity,
        channel,
        voiceKey,
        timestamp: now,
        portId
      };

      this.noteOnListeners.forEach(cb => cb(ev));
      return;
    }

    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      // Note Off — calibration consumes its own releases so the last key can never
      // surface as an exercise event. Even if calibrationMode was disabled in rawNoteListener,
      // the matching release is consumed.
      const isCalibrationRelease = this.calibrationMode || this.calibrationVoiceKeys.has(voiceKey);
      if (isCalibrationRelease) {
        this.calibrationVoiceKeys.delete(voiceKey);
        this.activeNoteOns.delete(voiceKey);
        return;
      }
      const keyId = keyIdFromMidi(note);
      const portHeld = this.heldNotesByPort.get(portId);
      if (portHeld) {
        portHeld.delete(keyId);
        if (!portHeld.size) this.heldNotesByPort.delete(portId);
      }
      let stillHeld = false;
      for (const other of this.heldNotesByPort.values()) {
        if (other.has(keyId)) { stillHeld = true; break; }
      }
      if (!stillHeld) this.heldNotes.delete(keyId);

      const onTime = this.activeNoteOns.get(voiceKey) ?? now;
      this.activeNoteOns.delete(voiceKey);
      const durationMs = Math.max(0, now - onTime);

      const ev: MidiNoteOffEvent = {
        midi: note,
        keyId,
        channel,
        voiceKey,
        timestamp: now,
        durationMs,
        portId
      };

      this.noteOffListeners.forEach(cb => cb(ev));
    }
  }
}
