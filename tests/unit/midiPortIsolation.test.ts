import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidiController, type MidiNoteOnEvent, type MidiNoteOffEvent } from '../../src/audio/MidiController';
import { acceptsPortEvent, heldNoteIdentity } from '../../src/core/midi/deviceCapability';

interface FakeInput {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  connection: string;
  type: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

function createFakeAccess(inputs: FakeInput[]) {
  return {
    inputs: new Map(inputs.map(input => [input.id, input])),
    onstatechange: null as null | (() => void)
  };
}

function makeInput(id: string, name = id): FakeInput {
  return { id, name, manufacturer: 'Test', state: 'connected', connection: 'open', type: 'input', onmidimessage: null };
}

function dispatch(input: FakeInput, bytes: number[]) {
  input.onmidimessage?.({ data: new Uint8Array(bytes) });
}

async function connectIsolated(access: ReturnType<typeof createFakeAccess>): Promise<MidiController> {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { requestMIDIAccess: async () => access }
  });
  const controller = MidiController.createIsolated();
  const connected = await controller.connect();
  expect(connected).toBe(true);
  return controller;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('M3L Rev3 port-aware MIDI events', () => {
  it('tags events with the originating port and isolates held notes per port', async () => {
    const a = makeInput('port-a', 'Arturia MicroLab mk3');
    const b = makeInput('port-b', 'Generic USB Keyboard');
    const controller = await connectIsolated(createFakeAccess([a, b]));
    const noteOns: MidiNoteOnEvent[] = [];
    controller.onNoteOn(ev => noteOns.push(ev));

    dispatch(a, [0x90, 48, 100]);
    dispatch(b, [0x90, 48, 100]);
    expect(noteOns).toHaveLength(2);
    expect(noteOns[0].portId).toBe('port-a');
    expect(noteOns[1].portId).toBe('port-b');
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual(['C3']);
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual(['C3']);
    expect([...controller.getHeldNotes()]).toEqual(['C3']);

    dispatch(a, [0x80, 48, 0]);
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual([]);
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual(['C3']);
    expect([...controller.getHeldNotes()]).toEqual(['C3']);

    dispatch(b, [0x80, 48, 0]);
    expect([...controller.getHeldNotes()]).toEqual([]);
  });

  it('consumes calibration note on/off entirely and never emits them as scored events', async () => {
    const a = makeInput('port-a');
    const b = makeInput('port-b');
    const controller = await connectIsolated(createFakeAccess([a, b]));
    const noteOns: MidiNoteOnEvent[] = [];
    const noteOffs: MidiNoteOffEvent[] = [];
    const raw: { portId: string; note: number }[] = [];
    controller.onNoteOn(ev => noteOns.push(ev));
    controller.onNoteOff(ev => noteOffs.push(ev));
    controller.onRawNoteOn((portId, note) => raw.push({ portId, note }));

    controller.setCalibrationMode(true);
    dispatch(a, [0x90, 48, 100]);
    dispatch(a, [0x80, 48, 0]);
    dispatch(b, [0x90, 96, 100]);
    expect(noteOns).toEqual([]);
    expect(noteOffs).toEqual([]);
    expect(raw).toEqual([{ portId: 'port-a', note: 48 }, { portId: 'port-b', note: 96 }]);

    controller.setCalibrationMode(false);
    dispatch(a, [0x90, 48, 100]);
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0].portId).toBe('port-a');
  });

  it('delivers out-of-virtual-range notes only while the extended range is enabled', async () => {
    const a = makeInput('port-a');
    const controller = await connectIsolated(createFakeAccess([a]));
    const noteOns: MidiNoteOnEvent[] = [];
    controller.onNoteOn(ev => noteOns.push(ev));

    dispatch(a, [0x90, 30, 100]);
    expect(noteOns).toEqual([]);

    controller.setExtendedRange(true);
    dispatch(a, [0x90, 30, 100]);
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0].portId).toBe('port-a');
    expect(noteOns[0].midi).toBe(30);

    controller.setExtendedRange(false);
    dispatch(a, [0x90, 31, 100]);
    expect(noteOns).toHaveLength(1);
  });

  it('exposes pure port-filter helpers for M3L routing', () => {
    expect(acceptsPortEvent('port-a', 'port-a')).toBe(true);
    expect(acceptsPortEvent('port-a', 'port-b')).toBe(false);
    expect(acceptsPortEvent(null, 'port-a')).toBe(false);
    expect(heldNoteIdentity('port-a', 'C3')).toBe('port-a:C3');
    expect(heldNoteIdentity('port-b', 'C3')).not.toBe(heldNoteIdentity('port-a', 'C3'));
  });

  it('does not keep stale held notes for a disconnected port', async () => {
    const a = makeInput('port-a');
    const b = makeInput('port-b');
    const access = createFakeAccess([a, b]);
    const controller = await connectIsolated(access);
    dispatch(a, [0x90, 48, 100]);
    dispatch(b, [0x90, 48, 100]);
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual(['C3']);
    b.state = 'disconnected';
    access.onstatechange?.();
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual([]);
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual(['C3']);
  });
});
