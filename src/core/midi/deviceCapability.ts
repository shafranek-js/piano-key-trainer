/**
 * M3L Rev2 — MIDI device capability model.
 * Single subsystem: this module extends the existing MidiController data flow with a typed,
 * serializable capability profile. It never infers key count from observed playing and never
 * treats the virtual C2–C6 piano as the device range.
 */

export type CapabilitySource = 'known-profile' | 'user-config' | 'calibration' | 'fallback';

export interface MidiDeviceDescriptor {
  id: string;
  name: string;
  manufacturer: string;
  portName: string;
}

export interface MidiDeviceCapability {
  deviceId: string;
  name: string;
  manufacturer: string;
  portName: string;
  physicalKeyCount: number | null;
  minNote: number | null;
  maxNote: number | null;
  source: CapabilitySource;
  calibrated: boolean;
  needsRevalidation: boolean;
  octaveShift: number;
}

export interface KnownDeviceProfile {
  id: string;
  label: string;
  physicalKeyCount: number;
  match: (name: string, manufacturer: string) => boolean;
}

export const KNOWN_DEVICE_PROFILES: readonly KnownDeviceProfile[] = [
  {
    id: 'arturia-microlab-mk3',
    label: 'Arturia MicroLab mk3',
    physicalKeyCount: 25,
    match: (name, manufacturer) => {
      const haystack = `${name} ${manufacturer}`.toLowerCase();
      return haystack.includes('microlab') && haystack.includes('arturia');
    }
  },
  {
    id: 'arturia-minilab',
    label: 'Arturia MiniLab',
    physicalKeyCount: 25,
    match: (name, manufacturer) => {
      const haystack = `${name} ${manufacturer}`.toLowerCase();
      return haystack.includes('minilab') && !haystack.includes('microlab');
    }
  }
];

export function findKnownDeviceProfile(name: string, manufacturer = ''): KnownDeviceProfile | null {
  return KNOWN_DEVICE_PROFILES.find(profile => profile.match(name, manufacturer)) ?? null;
}

/** Typical transmitted range for a key count when the exact range is not yet calibrated. */
export function defaultRangeForKeyCount(count: number): { minNote: number; maxNote: number } | null {
  if (!Number.isFinite(count) || count < 13 || count > 88) return null;
  const start = count >= 88 ? 21 : count <= 25 ? 48 : 36;
  return { minNote: start, maxNote: start + count - 1 };
}

export function rangeLabel(minNote: number | null, maxNote: number | null): string | null {
  if (minNote == null || maxNote == null) return null;
  return `${noteName(minNote)}–${noteName(maxNote)}`;
}

export function noteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const clamped = Math.max(0, Math.min(127, Math.floor(midi)));
  return `${names[clamped % 12]}${Math.floor(clamped / 12) - 1}`;
}

export function capabilityFromDescriptor(device: MidiDeviceDescriptor): MidiDeviceCapability {
  const profile = findKnownDeviceProfile(device.name, device.manufacturer);
  const base: MidiDeviceCapability = {
    deviceId: device.id,
    name: device.name || profile?.label || 'MIDI-устройство',
    manufacturer: device.manufacturer || '',
    portName: device.portName || device.name || 'MIDI input',
    physicalKeyCount: profile?.physicalKeyCount ?? null,
    minNote: null,
    maxNote: null,
    source: profile ? 'known-profile' : 'fallback',
    calibrated: false,
    needsRevalidation: false,
    octaveShift: 0
  };
  if (profile) {
    const range = defaultRangeForKeyCount(profile.physicalKeyCount);
    return {
      ...base,
      minNote: range?.minNote ?? null,
      maxNote: range?.maxNote ?? null
    };
  }
  return base;
}

export function applyCalibration(
  capability: MidiDeviceCapability,
  calibration: { minNote: number; maxNote: number; physicalKeyCount?: number | null }
): MidiDeviceCapability {
  const minNote = Math.min(calibration.minNote, calibration.maxNote);
  const maxNote = Math.max(calibration.minNote, calibration.maxNote);
  const observedSpan = maxNote - minNote;
  const declaredCount = calibration.physicalKeyCount ?? capability.physicalKeyCount;
  const countMismatch = declaredCount != null && declaredCount - 1 !== observedSpan;
  return {
    ...capability,
    physicalKeyCount: declaredCount ?? capability.physicalKeyCount,
    minNote,
    maxNote,
    source: 'calibration',
    calibrated: true,
    needsRevalidation: countMismatch,
    octaveShift: 0
  };
}

export function applyUserConfig(
  capability: MidiDeviceCapability,
  config: { physicalKeyCount: number; minNote?: number | null; maxNote?: number | null }
): MidiDeviceCapability {
  const range = config.minNote != null && config.maxNote != null
    ? { minNote: Math.min(config.minNote, config.maxNote), maxNote: Math.max(config.minNote, config.maxNote) }
    : defaultRangeForKeyCount(config.physicalKeyCount);
  return {
    ...capability,
    physicalKeyCount: config.physicalKeyCount,
    minNote: range?.minNote ?? null,
    maxNote: range?.maxNote ?? null,
    source: 'user-config',
    calibrated: false,
    needsRevalidation: false,
    octaveShift: 0
  };
}

export function markRangeStale(capability: MidiDeviceCapability): MidiDeviceCapability {
  if (!capability.calibrated || capability.needsRevalidation) return capability;
  return { ...capability, needsRevalidation: true };
}

export interface ObservedNoteResult {
  capability: MidiDeviceCapability;
  staleTriggered: boolean;
}

/**
 * Any transmitted note outside the calibrated range (including octave-shift changes of ±12)
 * marks the calibration as requiring explicit reconfirmation before range-dependent exercises.
 */
export function observeTransmittedNote(capability: MidiDeviceCapability, note: number): ObservedNoteResult {
  if (!capability.calibrated || capability.minNote == null || capability.maxNote == null) {
    return { capability, staleTriggered: false };
  }
  if (note >= capability.minNote && note <= capability.maxNote) {
    return { capability, staleTriggered: false };
  }
  return { capability: markRangeStale(capability), staleTriggered: true };
}

export type CalibrationStep = 'idle' | 'awaiting-left' | 'awaiting-right' | 'complete';

export type CalibrationMode = 'calibrate' | 'verify';

export interface CalibrationState {
  step: CalibrationStep;
  mode: CalibrationMode;
  deviceId: string | null;
  deviceName: string;
  minNote: number | null;
  maxNote: number | null;
  expectedMinNote: number | null;
  expectedMaxNote: number | null;
  rejectedNote: number | null;
  message: string;
}

export function idleCalibration(): CalibrationState {
  return { step: 'idle', mode: 'calibrate', deviceId: null, deviceName: '', minNote: null, maxNote: null, expectedMinNote: null, expectedMaxNote: null, rejectedNote: null, message: '' };
}

export function startCalibration(device: MidiDeviceDescriptor): CalibrationState {
  return {
    step: 'awaiting-left',
    mode: 'calibrate',
    deviceId: device.id,
    deviceName: device.name,
    minNote: null,
    maxNote: null,
    expectedMinNote: null,
    expectedMaxNote: null,
    rejectedNote: null,
    message: 'Нажмите самую левую клавишу инструмента.'
  };
}

/**
 * Reconfirms an existing calibration by requiring the same leftmost/rightmost keys again.
 * A boolean reset is never enough: only a matching captured range clears the stale state.
 */
export function startVerification(
  device: MidiDeviceDescriptor,
  expected: { minNote: number; maxNote: number }
): CalibrationState {
  return {
    step: 'awaiting-left',
    mode: 'verify',
    deviceId: device.id,
    deviceName: device.name,
    minNote: null,
    maxNote: null,
    expectedMinNote: expected.minNote,
    expectedMaxNote: expected.maxNote,
    rejectedNote: null,
    message: 'Подтвердите диапазон: нажмите самую левую клавишу инструмента.'
  };
}

export type RangeVerificationResult = 'match' | 'mismatch' | 'incomplete';

export function verifyCapturedRange(
  expected: { minNote: number; maxNote: number },
  captured: { minNote: number | null; maxNote: number | null }
): RangeVerificationResult {
  if (captured.minNote == null || captured.maxNote == null) return 'incomplete';
  return captured.minNote === expected.minNote && captured.maxNote === expected.maxNote ? 'match' : 'mismatch';
}

/** A range may gate physical grading only when it comes from a current calibration. */
export function isRangeVerified(capability: MidiDeviceCapability | null, externallyStale = false): boolean {
  if (!capability) return false;
  return capability.source === 'calibration' &&
    capability.calibrated &&
    !capability.needsRevalidation &&
    !externallyStale &&
    capability.minNote != null &&
    capability.maxNote != null;
}

/** Port isolation helpers: an event may enter M3L only from the explicitly selected port. */
export function acceptsPortEvent(selectedPortId: string | null, eventPortId: string): boolean {
  return Boolean(selectedPortId) && selectedPortId === eventPortId;
}

export function heldNoteIdentity(portId: string, keyId: string): string {
  return `${portId}:${keyId}`;
}

export interface CalibrationNoteResult {
  state: CalibrationState;
  captured: 'left' | 'right' | 'rejected' | null;
}

/**
 * Raw MIDI capture: accepts any valid note number, including notes outside the virtual C2–C6 piano.
 */
export function calibrationRawNote(state: CalibrationState, note: number): CalibrationNoteResult {
  if (state.step !== 'awaiting-left' && state.step !== 'awaiting-right') {
    return { state, captured: null };
  }
  if (!Number.isFinite(note) || note < 0 || note > 127) {
    return { state: { ...state, rejectedNote: note, message: 'Некорректный MIDI-номер ноты. Повторите нажатие.' }, captured: 'rejected' };
  }
  if (state.step === 'awaiting-left') {
    return {
      state: { ...state, step: 'awaiting-right', minNote: note, rejectedNote: null, message: 'Теперь нажмите самую правую клавишу инструмента.' },
      captured: 'left'
    };
  }
  const minNote = state.minNote ?? note;
  const maxNote = note;
  const ordered = minNote <= maxNote;
  return {
    state: {
      ...state,
      step: 'complete',
      minNote: ordered ? minNote : maxNote,
      maxNote: ordered ? maxNote : minNote,
      rejectedNote: ordered ? null : note,
      message: ordered ? '' : 'Правая клавиша оказалась ниже левой. Попробуйте ещё раз.'
    },
    captured: 'right'
  };
}

export function calibrationCapability(
  capability: MidiDeviceCapability,
  state: CalibrationState
): MidiDeviceCapability | null {
  if (state.step !== 'complete' || state.minNote == null || state.maxNote == null) return null;
  return applyCalibration(capability, { minNote: state.minNote, maxNote: state.maxNote });
}
