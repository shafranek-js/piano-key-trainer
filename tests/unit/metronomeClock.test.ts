import { describe, expect, it } from 'vitest';
import { MetronomeClock, type MetronomeClockPort } from '../../src/audio/MetronomeClock';

function createFakePort() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clicks: { accent: boolean; at: number; cancelled: boolean }[] = [];

  const port: MetronomeClockPort = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: id => {
      timers.delete(id);
    },
    scheduleClick: (accent, at) => {
      const click = { accent, at, cancelled: false };
      clicks.push(click);
      return () => {
        click.cancelled = true;
      };
    }
  };

  return {
    port,
    clicks,
    pendingTimers: () => timers.size,
    advance: (ms: number) => {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of due) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    }
  };
}

describe('MetronomeClock — injectable timing', () => {
  it('emits a bounded count-in + beat sequence with accent marks', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const beats: { beat: number; countIn: boolean; isAccent: boolean }[] = [];

    const onsets = clock.startSequence({
      bpm: 60,
      beats: 4,
      countInBeats: 4,
      onBeat: beat => beats.push({ beat: beat.beat, countIn: beat.countIn, isAccent: beat.isAccent })
    });

    expect(onsets).toHaveLength(8);
    expect(clock.running).toBe(true);
    fake.advance(9_000);
    expect(beats).toHaveLength(8);
    expect(beats.slice(0, 4).every(beat => beat.countIn)).toBe(true);
    expect(beats.slice(4).every(beat => !beat.countIn)).toBe(true);
    expect(beats.filter(beat => beat.isAccent)).toHaveLength(2);
    expect(clock.running).toBe(false);
  });

  it('stays stopped for an empty sequence', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const onsets = clock.startSequence({ bpm: 60, beats: 0, countInBeats: 0, onBeat: () => {} });
    expect(onsets).toEqual([]);
    expect(clock.running).toBe(false);
  });

  it('cancels pending timers and already scheduled clicks on stop', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const beats: number[] = [];

    clock.startSequence({ bpm: 60, beats: 4, countInBeats: 0, onBeat: beat => beats.push(beat.index) });
    expect(fake.pendingTimers()).toBe(4);
    expect(fake.clicks).toHaveLength(4);

    clock.stop();
    expect(clock.running).toBe(false);
    expect(fake.pendingTimers()).toBe(0);
    expect(fake.clicks.every(click => click.cancelled)).toBe(true);

    fake.advance(10_000);
    expect(beats).toEqual([]);
  });

  it('ignores stale callbacks after a new sequence starts', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const first: number[] = [];
    const second: number[] = [];

    clock.startSequence({ bpm: 60, beats: 4, countInBeats: 0, onBeat: beat => first.push(beat.index) });
    fake.advance(50);
    clock.startSequence({ bpm: 60, beats: 2, countInBeats: 0, onBeat: beat => second.push(beat.index) });
    fake.advance(5_000);

    expect(first).toEqual([]);
    expect(second).toEqual([0, 1]);
    expect(fake.clicks.filter(click => !click.cancelled)).toHaveLength(2);
  });
});
