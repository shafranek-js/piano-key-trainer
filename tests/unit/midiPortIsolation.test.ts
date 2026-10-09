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

  it('Fix 2: consumes calibration Note On and matching Note Off even when calibration mode is disabled in raw-note callback', async () => {
    const a = makeInput('port-a');
    const controller = await connectIsolated(createFakeAccess([a]));
    const noteOns: MidiNoteOnEvent[] = [];
    const noteOffs: MidiNoteOffEvent[] = [];
    controller.onNoteOn(ev => noteOns.push(ev));
    controller.onNoteOff(ev => noteOffs.push(ev));

    // Begin calibration
    controller.setCalibrationMode(true);

    // In the raw-note callback for the rightmost key (note 96), immediately disable calibration mode
    controller.onRawNoteOn((_portId, note) => {
      if (note === 96) {
        controller.setCalibrationMode(false);
      }
    });

    // Press the rightmost key during calibration
    dispatch(a, [0x90, 96, 100]);

    // Assert zero ordinary Note On events from that key
    expect(noteOns).toEqual([]);
    // Assert no leaked held-note state
    expect([...controller.getHeldNotes()]).toEqual([]);
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual([]);

    // Release the rightmost key
    dispatch(a, [0x80, 96, 0]);

    // Assert zero ordinary Note Off events from that key
    expect(noteOffs).toEqual([]);
    expect([...controller.getHeldNotes()]).toEqual([]);

    // Confirm the next intentional Note On after calibration works normally
    dispatch(a, [0x90, 60, 100]);
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0].midi).toBe(60);
    expect(noteOns[0].portId).toBe('port-a');
    expect([...controller.getHeldNotes()]).toEqual(['C4']);

    dispatch(a, [0x80, 60, 0]);
    expect(noteOffs).toHaveLength(1);
    expect(noteOffs[0].midi).toBe(60);
    expect([...controller.getHeldNotes()]).toEqual([]);
  });

  it('Fix 1: tracks individual port connection states and clears held notes when a port disconnects while another remains connected', async () => {
    const a = makeInput('port-a', 'Port A');
    const b = makeInput('port-b', 'Port B');
    const access = createFakeAccess([a, b]);
    const controller = await connectIsolated(access);

    expect(controller.isPortConnected('port-a')).toBe(true);
    expect(controller.isPortConnected('port-b')).toBe(true);
    expect([...controller.getConnectedPortIds()]).toEqual(['port-a', 'port-b']);

    // Hold notes on both ports
    dispatch(a, [0x90, 48, 100]); // C3 on A
    dispatch(b, [0x90, 60, 100]); // C4 on B
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual(['C3']);
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual(['C4']);

    // Disconnect port A while port B remains connected
    a.state = 'disconnected';
    access.onstatechange?.();

    // Port A is disconnected, Port B remains connected
    expect(controller.isPortConnected('port-a')).toBe(false);
    expect(controller.isPortConnected('port-b')).toBe(true);
    expect([...controller.getConnectedPortIds()]).toEqual(['port-b']);

    // Port A held notes cleared, Port B held notes preserved
    expect([...controller.getHeldNotesForPort('port-a')]).toEqual([]);
    expect([...controller.getHeldNotesForPort('port-b')]).toEqual(['C4']);
    expect([...controller.getHeldNotes()]).toEqual(['C4']);

    // Port A remains in descriptors as disconnected
    const descriptors = controller.getInputDescriptors();
    const descA = descriptors.find(d => d.id === 'port-a');
    const descB = descriptors.find(d => d.id === 'port-b');
    expect(descA?.state).toBe('disconnected');
    expect(descB?.state).toBe('connected');
  });
});
