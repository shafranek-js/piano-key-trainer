import { AudioEngine } from '../../audio/AudioEngine';
import type { NoteName } from '../fsrs/types';

export interface IntervalDef {
  id: string;
  name: string;
  shortName: string;
  semitones: number;
  targetKeyId: string;
  targetNote: NoteName;
  description: string;
}

export const INTERVALS: readonly IntervalDef[] = [
  { id: 'm2', name: 'Малая секунда', shortName: 'м.2', semitones: 1, targetKeyId: 'C#4', targetNote: 'C#', description: '1 полутон · напряжённое, острое звучание' },
  { id: 'M2', name: 'Большая секунда', shortName: 'б.2', semitones: 2, targetKeyId: 'D4', targetNote: 'D', description: '2 полутона · целый тон, соседняя белая клавиша' },
  { id: 'm3', name: 'Малая терция', shortName: 'м.3', semitones: 3, targetKeyId: 'D#4', targetNote: 'D#', description: '3 полутона · грустное, минорное звучание' },
  { id: 'M3', name: 'Большая терция', shortName: 'б.3', semitones: 4, targetKeyId: 'E4', targetNote: 'E', description: '4 полутона · светлое, мажорное звучание' },
  { id: 'P4', name: 'Чистая кварта', shortName: 'ч.4', semitones: 5, targetKeyId: 'F4', targetNote: 'F', description: '5 полутонов · устойчивый гимнический интервал' },
  { id: 'P5', name: 'Чистая квинта', shortName: 'ч.5', semitones: 7, targetKeyId: 'G4', targetNote: 'G', description: '7 полутонов · пустое, устойчивое созвучие' },
  { id: 'P8', name: 'Чистая октава', shortName: 'ч.8', semitones: 12, targetKeyId: 'C5', targetNote: 'C', description: '12 полутонов · полное совпадение высоты на октаву выше' }
];

export interface TriadDef {
  id: 'major' | 'minor';
  name: string;
  formula: string;
  root: string;
  notes: string[]; // keyIds, e.g. ['C4', 'E4', 'G4']
  description: string;
}

export const TRIADS: Record<'major' | 'minor', TriadDef[]> = {
  major: [
    { id: 'major', name: 'Мажорное трезвучие', formula: 'б.3 + м.3', root: 'C', notes: ['C4', 'E4', 'G4'], description: 'Светлое, радостное, открытое звучание' },
    { id: 'major', name: 'Мажорное трезвучие', formula: 'б.3 + м.3', root: 'F', notes: ['F3', 'A3', 'C4'], description: 'Светлое, радостное звучание от F' },
    { id: 'major', name: 'Мажорное трезвучие', formula: 'б.3 + м.3', root: 'G', notes: ['G3', 'B3', 'D4'], description: 'Светлое, радостное звучание от G' }
  ],
  minor: [
    { id: 'minor', name: 'Минорное трезвучие', formula: 'м.3 + б.3', root: 'C', notes: ['C4', 'D#4', 'G4'], description: 'Грустное, задумчивое звучание' },
    { id: 'minor', name: 'Минорное трезвучие', formula: 'м.3 + б.3', root: 'A', notes: ['A3', 'C4', 'E4'], description: 'Классический ля-минор' },
    { id: 'minor', name: 'Минорное трезвучие', formula: 'м.3 + б.3', root: 'D', notes: ['D4', 'F4', 'A4'], description: 'Задумчивый ре-минор' }
  ]
};

export async function playIntervalSequence(targetKeyId: string, referenceKeyId = 'C4'): Promise<void> {
  const engine = AudioEngine.getInstance();
  await engine.playPianoByKeyId(referenceKeyId, 85);
  setTimeout(() => {
    engine.playPianoByKeyId(targetKeyId, 96);
  }, 550);
}

export async function playTriadSequence(triadNotes: string[], mode: 'arpeggio' | 'harmonic' = 'arpeggio'): Promise<void> {
  const engine = AudioEngine.getInstance();
  if (mode === 'harmonic') {
    // Play simultaneously
    for (const keyId of triadNotes) {
      engine.playPianoByKeyId(keyId, 88);
    }
  } else {
    // Arpeggio
    triadNotes.forEach((keyId, idx) => {
      setTimeout(() => {
        engine.playPianoByKeyId(keyId, 92);
      }, idx * 280);
    });
  }
}
