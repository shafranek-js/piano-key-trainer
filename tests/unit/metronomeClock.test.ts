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

  it('provides the M3L 60 BPM count-in 4-3-2-1 with an accented first playable beat', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const trace: { index: number; beat: number; countIn: boolean; accent: boolean; countInValue: number | null }[] = [];

    const onsets = clock.startSequence({
      bpm: 60,
      beats: 4,
      countInBeats: 4,
      onBeat: beat => trace.push({
        index: beat.index,
        beat: beat.beat,
        countIn: beat.countIn,
        accent: beat.isAccent,
        countInValue: beat.countIn ? Math.max(1, 4 - beat.index) : null
      })
    });

    expect(onsets).toHaveLength(8);
    expect(onsets[1] - onsets[0]).toBe(1000);
    expect(fake.clicks).toHaveLength(8);
    expect(fake.clicks.map(click => click.accent)).toEqual([true, false, false, false, true, false, false, false]);
    expect(fake.clicks[4].at - fake.clicks[0].at).toBe(4000);

    fake.advance(10_000);
    expect(trace.slice(0, 4).map(item => item.countInValue)).toEqual([4, 3, 2, 1]);
    expect(trace.slice(0, 4).every(item => item.countIn)).toBe(true);
    expect(trace[4]).toMatchObject({ countIn: false, beat: 0, accent: true, countInValue: null });
    expect(trace.filter(item => !item.countIn)).toHaveLength(4);
  });

  it('stops cleanly so restarting the M3L run never duplicates clicks or beats', () => {
    const fake = createFakePort();
    const clock = new MetronomeClock(fake.port);
    const first: number[] = [];
    const second: number[] = [];

    clock.startSequence({ bpm: 60, beats: 4, countInBeats: 4, onBeat: beat => first.push(beat.index) });
    clock.stop();
    clock.startSequence({ bpm: 60, beats: 4, countInBeats: 4, onBeat: beat => second.push(beat.index) });
    fake.advance(12_000);

    expect(first).toEqual([]);
    expect(second).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(fake.clicks.filter(click => !click.cancelled)).toHaveLength(8);
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
