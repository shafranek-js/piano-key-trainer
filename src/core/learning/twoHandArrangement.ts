/**
 * M3L Rev2 — exercise feasibility and adaptive voicings.
 *
 * The planner computes the full required note set of an exercise and validates it against one
 * unchanged physical device range. When the canonical voicings do not fit, it builds a compact,
 * musically valid alternative (chord inversions, different bass octaves) that preserves:
 * - chord identity and quality (the exact triad pitch-class set),
 * - the slash-chord bass pitch class as the lowest sounding note,
 * - independent left/right hand note identities.
 * A deliberately shorter introductory exercise is selected when full four-chord coordination
 * cannot fit; a clearly labelled simulation fallback is selected when nothing physical fits.
 */

import { keyIdFromMidi, midiFromKeyId } from '../../audio/types';
import { HARMONY_CHORDS, type HarmonyChordId } from './harmony';
import { TWO_HAND_SEQUENCE, TWO_HAND_VOICINGS, type TwoHandVoicing } from './twoHand';

export type TwoHandArrangementKind = 'original' | 'compact' | 'compact-intro' | 'simulation';

export interface TwoHandArrangement {
  kind: TwoHandArrangementKind;
  sequence: readonly HarmonyChordId[];
  voicings: Readonly<Record<string, TwoHandVoicing>>;
  minNote: number;
  maxNote: number;
  span: number;
  rangeLo: number | null;
  rangeHi: number | null;
  handSeparationOk: boolean;
  explanation: string;
}

function pitchClassOfMidi(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function voicingNotes(voicing: TwoHandVoicing): number[] {
  return [
    midiFromKeyId(voicing.bassKeyId),
    ...voicing.triadKeyIds.map(keyId => midiFromKeyId(keyId))
  ].filter((midi): midi is number => midi != null);
}

export function originalRequiredRange(): { minNote: number; maxNote: number; span: number } {
  const notes = TWO_HAND_SEQUENCE.flatMap(chordId => voicingNotes(TWO_HAND_VOICINGS[chordId]));
  const minNote = Math.min(...notes);
  const maxNote = Math.max(...notes);
  return { minNote, maxNote, span: maxNote - minNote + 1 };
}

function fitsRange(notes: number[], lo: number, hi: number): boolean {
  return notes.every(note => note >= lo && note <= hi);
}

function handSeparation(voicing: TwoHandVoicing): number {
  const bass = midiFromKeyId(voicing.bassKeyId);
  const triad = voicing.triadKeyIds.map(keyId => midiFromKeyId(keyId)).filter((midi): midi is number => midi != null);
  if (bass == null || !triad.length) return 0;
  return Math.min(...triad) - bass;
}

function arrangementBounds(voicings: Readonly<Record<string, TwoHandVoicing>>): { minNote: number; maxNote: number; handSeparationOk: boolean } {
  const notes = Object.values(voicings).flatMap(voicing => voicingNotes(voicing));
  return {
    minNote: Math.min(...notes),
    maxNote: Math.max(...notes),
    handSeparationOk: Object.values(voicings).every(voicing => handSeparation(voicing) >= 3)
  };
}

function originalArrangement(rangeLo: number | null, rangeHi: number | null): TwoHandArrangement {
  const bounds = arrangementBounds(TWO_HAND_VOICINGS);
  return {
    kind: 'original',
    sequence: [...TWO_HAND_SEQUENCE],
    voicings: TWO_HAND_VOICINGS,
    minNote: bounds.minNote,
    maxNote: bounds.maxNote,
    span: bounds.maxNote - bounds.minNote + 1,
    rangeLo,
    rangeHi,
    handSeparationOk: bounds.handSeparationOk,
    explanation: ''
  };
}

function simulationArrangement(): TwoHandArrangement {
  const arrangement = originalArrangement(null, null);
  return {
    ...arrangement,
    kind: 'simulation',
    explanation: 'Диапазон инструмента не позволяет сыграть упражнение двумя руками. Доступна экранная симуляция: она не засчитывается как физическое исполнение двумя руками.'
  };
}

interface InversionCandidate {
  bass: number;
  triad: number[];
  span: number;
  distance: number;
}

function ascendingTriad(rootMidi: number, orderedPitchClasses: number[]): number[] {
  const notes = [rootMidi];
  for (let index = 1; index < orderedPitchClasses.length; index++) {
    const step = (orderedPitchClasses[index] - orderedPitchClasses[index - 1] + 12) % 12 || 12;
    notes.push(notes[index - 1] + step);
  }
  return notes;
}

function chordCandidates(chordId: HarmonyChordId, lo: number, hi: number): InversionCandidate[] {
  const chord = HARMONY_CHORDS[chordId];
  const original = TWO_HAND_VOICINGS[chordId];
  const originalBass = midiFromKeyId(original.bassKeyId) ?? 48;
  const originalTriad = original.triadKeyIds.map(keyId => midiFromKeyId(keyId) ?? 60);
  const triadPcs = chord.keyIds.map(keyId => midiFromKeyId(keyId) ?? 60).map(midi => pitchClassOfMidi(midi));
  const bassPc = pitchClassOfMidi(originalBass);
  const candidates: InversionCandidate[] = [];
  for (let rotation = 0; rotation < triadPcs.length; rotation++) {
    const ordered = [...triadPcs.slice(rotation), ...triadPcs.slice(0, rotation)];
    for (let octave = 1; octave <= 6; octave++) {
      const rootMidi = octave * 12 + ordered[0];
      if (rootMidi < 24 || rootMidi > 96) continue;
      const triad = ascendingTriad(rootMidi, ordered);
      if (!fitsRange(triad, lo, hi)) continue;
      for (let bassMidi = 24; bassMidi <= 96; bassMidi++) {
        if (pitchClassOfMidi(bassMidi) !== bassPc || !fitsRange([bassMidi], lo, hi)) continue;
        if (Math.min(...triad) - bassMidi < 3) continue;
        const span = Math.max(...triad, bassMidi) - bassMidi + 1;
        const distance =
          Math.abs(bassMidi - originalBass) +
          triad.reduce((sum, note, index) => sum + Math.abs(note - (originalTriad[index] ?? note)), 0);
        candidates.push({ bass: bassMidi, triad, span, distance });
      }
    }
  }
  return candidates;
}

function buildVoicing(chordId: HarmonyChordId, candidate: InversionCandidate): TwoHandVoicing {
  return {
    chordId,
    symbol: HARMONY_CHORDS[chordId].symbol,
    bassKeyId: keyIdFromMidi(candidate.bass),
    triadKeyIds: [keyIdFromMidi(candidate.triad[0]), keyIdFromMidi(candidate.triad[1]), keyIdFromMidi(candidate.triad[2])]
  };
}

function compactForSequence(sequence: readonly HarmonyChordId[], lo: number, hi: number, kind: 'compact' | 'compact-intro'): TwoHandArrangement | null {
  const voicings: Record<string, TwoHandVoicing> = {};
  for (const chordId of sequence) {
    const candidates = chordCandidates(chordId, lo, hi);
    if (!candidates.length) return null;
    candidates.sort((left, right) => left.distance - right.distance || left.span - right.span);
    voicings[chordId] = buildVoicing(chordId, candidates[0]);
  }
  const bounds = arrangementBounds(voicings);
  const rangeLo = lo;
  const rangeHi = hi;
  const allNotes = Object.values(voicings).flatMap(voicing => voicingNotes(voicing));
  if (!fitsRange(allNotes, rangeLo, rangeHi)) return null;
  return {
    kind,
    sequence: [...sequence],
    voicings,
    minNote: bounds.minNote,
    maxNote: bounds.maxNote,
    span: bounds.maxNote - bounds.minNote + 1,
    rangeLo,
    rangeHi,
    handSeparationOk: bounds.handSeparationOk,
    explanation: kind === 'compact'
      ? 'Упражнение адаптировано для компактной клавиатуры. Используются другие обращения аккордов.'
      : 'Полное сопровождение не помещается на инструмент. Показано короткое вводное упражнение одной тональности.'
  };
}

export interface PlanTwoHandParams {
  rangeLo: number | null;
  rangeHi: number | null;
}

/**
 * Returns the best playable arrangement for the given (single, unchanged) physical range.
 * rangeLo/rangeHi = null means the device range is unknown; the canonical voicings are used
 * with an explicit revalidation requirement handled by the caller.
 */
export function planTwoHandArrangement(params: PlanTwoHandParams): TwoHandArrangement {
  const { rangeLo, rangeHi } = params;
  if (rangeLo == null || rangeHi == null) {
    return originalArrangement(null, null);
  }
  const originalNotes = TWO_HAND_SEQUENCE.flatMap(chordId => voicingNotes(TWO_HAND_VOICINGS[chordId]));
  if (fitsRange(originalNotes, rangeLo, rangeHi)) {
    return originalArrangement(rangeLo, rangeHi);
  }
  const compact = compactForSequence(TWO_HAND_SEQUENCE, rangeLo, rangeHi, 'compact');
  if (compact) return compact;
  const intro = compactForSequence(['C'], rangeLo, rangeHi, 'compact-intro');
  if (intro) return intro;
  return simulationArrangement();
}

export function arrangementVoicing(arrangement: TwoHandArrangement, chordId: HarmonyChordId): TwoHandVoicing {
  return arrangement.voicings[chordId] ?? TWO_HAND_VOICINGS[chordId];
}

export function arrangementFits(arrangement: TwoHandArrangement, lo: number, hi: number): boolean {
  const notes = Object.values(arrangement.voicings).flatMap(voicing => voicingNotes(voicing));
  return fitsRange(notes, lo, hi);
}

export function arrangementNotes(arrangement: TwoHandArrangement): number[] {
  return Object.values(arrangement.voicings).flatMap(voicing => voicingNotes(voicing));
}
