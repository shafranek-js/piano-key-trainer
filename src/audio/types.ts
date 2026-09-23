import type { NoteName } from '../core/fsrs/types';

export interface PianoSampleRoot {
  midi: number;
  name: string;
}

export const MIDI_MIN = 36; // C2
export const MIDI_MAX = 84; // C6
export const TRAINER_RANGE_LABEL = 'C2–C6';

export const PIANO_SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';

export const PIANO_SAMPLE_ROOTS: readonly PianoSampleRoot[] = [
  { midi: 36, name: 'C2.mp3' },
  { midi: 39, name: 'Ds2.mp3' },
  { midi: 42, name: 'Fs2.mp3' },
  { midi: 45, name: 'A2.mp3' },
  { midi: 48, name: 'C3.mp3' },
  { midi: 51, name: 'Ds3.mp3' },
  { midi: 54, name: 'Fs3.mp3' },
  { midi: 57, name: 'A3.mp3' },
  { midi: 60, name: 'C4.mp3' },
  { midi: 63, name: 'Ds4.mp3' },
  { midi: 66, name: 'Fs4.mp3' },
  { midi: 69, name: 'A4.mp3' },
  { midi: 72, name: 'C5.mp3' },
  { midi: 75, name: 'Ds5.mp3' },
  { midi: 78, name: 'Fs5.mp3' },
  { midi: 81, name: 'A5.mp3' },
  { midi: 84, name: 'C6.mp3' }
];

export function freqFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function keyIdFromMidi(midi: number): string {
  const noteNames: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function midiFromKeyId(keyId: string): number | null {
  const noteNames: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = /^([A-G](?:#)?)(\d)$/.exec(keyId || '');
  if (!m) return null;
  const pc = noteNames.indexOf(m[1] as NoteName);
  if (pc < 0) return null;
  return (Number(m[2]) + 1) * 12 + pc;
}

export function pitchClassFromMidi(midi: number): NoteName {
  const noteNames: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return noteNames[((midi % 12) + 12) % 12];
}
