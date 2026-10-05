import { midiFromKeyId } from '../../audio/types';

/**
 * Pure helper to sort key IDs by ascending MIDI pitch.
 */
export function sortKeyIdsByPitch(keyIds: readonly string[]): string[] {
  return [...keyIds].sort((a, b) => {
    const ma = midiFromKeyId(a) ?? 0;
    const mb = midiFromKeyId(b) ?? 0;
    return ma - mb;
  });
}

/**
 * Toggles a key in the chord selection array.
 * If already selected, removes it.
 * If not selected and count < maxKeys, adds it.
 * If not selected and count >= maxKeys, returns current array unchanged.
 */
export function toggleKeyInChordSelection(
  currentSelected: readonly string[],
  keyId: string,
  maxKeys = 3
): string[] {
  if (currentSelected.includes(keyId)) {
    return currentSelected.filter((id) => id !== keyId);
  }
  if (currentSelected.length >= maxKeys) {
    return [...currentSelected];
  }
  return [...currentSelected, keyId];
}

/**
 * Checks whether two sets of key IDs represent the exact same physical keys.
 */
export function areChordKeyIdsEqual(
  a: readonly string[],
  b: readonly string[]
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = sortKeyIdsByPitch(a);
  const sortedB = sortKeyIdsByPitch(b);
  return sortedA.every((keyId, idx) => keyId === sortedB[idx]);
}

/**
 * State tracker for MIDI chord performance.
 * Tracks currently held notes.
 * When exactly 3 unique keys are simultaneously held, triggers evaluation callback once.
 * Locks further evaluation until all chord keys are released (or reset).
 */
export class MidiChordTracker {
  private activeNotes = new Set<string>();
  private submissionLocked = false;
  private maxNotes = 3;

  constructor(maxNotes = 3) {
    this.maxNotes = maxNotes;
  }

  /**
   * Handles MIDI Note On.
   * If held notes reach maxNotes (3) and tracker is not locked, triggers onChordEvaluated.
   */
  public handleNoteOn(
    keyId: string,
    onChordEvaluated?: (chordKeyIds: string[]) => void,
    options: { requiredNoteCount?: number; excludedFromCount?: readonly string[] } = {}
  ): boolean {
    this.activeNotes.add(keyId);

    const requiredNoteCount = options.requiredNoteCount ?? this.maxNotes;
    const excludedFromCount = new Set(options.excludedFromCount ?? []);
    const countedNotes = Array.from(this.activeNotes).filter(note => !excludedFromCount.has(note));

    if (countedNotes.length === requiredNoteCount && !this.submissionLocked) {
      this.submissionLocked = true;
      const sorted = sortKeyIdsByPitch(Array.from(this.activeNotes));
      onChordEvaluated?.(sorted);
      return true;
    }
    return false;
  }

  /**
   * Handles MIDI Note Off.
   * Releases lock once all active notes are released.
   */
  public handleNoteOff(keyId: string): void {
    this.activeNotes.delete(keyId);
    if (this.activeNotes.size === 0) {
      this.submissionLocked = false;
    }
  }

  /**
   * Returns whether submission is currently locked.
   */
  public isLocked(): boolean {
    return this.submissionLocked;
  }

  /**
   * Returns current active held keys.
   */
  public getActiveNotes(): string[] {
    return sortKeyIdsByPitch(Array.from(this.activeNotes));
  }

  /**
   * Resets active notes and submission lock (e.g. on new question or trial).
   */
  public reset(): void {
    this.activeNotes.clear();
    this.submissionLocked = false;
  }
}
