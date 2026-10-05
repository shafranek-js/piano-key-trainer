import {
  DEFAULT_BPM_BY_SONG_ID,
  REPERTOIRE,
  getSongMeasureCount,
  getSongVersion,
  normalizeSongToEvents,
  type RepertoireVariant,
  type RepertoireVerificationStatus,
  type SongDef
} from './repertoireData';
import { parseMusicXmlToSongDef, songToMusicXml } from './musicXmlGenerator';

export interface RepertoireAuditEntry {
  id: string;
  songId: string;
  title: string;
  composer: string;
  variant: 'excerpt' | 'melodyArrangement';
  verificationStatus: RepertoireVerificationStatus;
  referenceSource: string;
  sourceEdition?: string;
  sourceUrl?: string;
  sourceMovement?: string;
  sourcePart?: string;
  sourceMeasures: string;
  issues: string[];
}

export interface SongStructureValidationResult {
  valid: boolean;
  songId: string;
  variant: RepertoireVariant;
  errors: string[];
}

const VALID_PITCH_NAMES = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
]);

const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11
};

export function isValidPlayablePitch(noteId: string): boolean {
  const m = /^([A-G]#?)(\d)$/.exec((noteId || '').trim());
  if (!m) return false;
  const [, pitchName, octStr] = m;
  if (!VALID_PITCH_NAMES.has(pitchName)) return false;
  const octave = Number(octStr);
  if (!Number.isInteger(octave) || octave < 2 || octave > 6) return false;
  const midi = (octave + 1) * 12 + (SEMITONES[pitchName] ?? 0);
  // Keyboard range C2 (36) .. C6 (84)
  return midi >= 36 && midi <= 84;
}

/**
 * Validates all structural, musical-metadata, timeline, and round-trip invariants for a SongDef.
 */
export function validateSongStructure(song: SongDef): SongStructureValidationResult {
  const errors: string[] = [];

  if (!song.id || typeof song.id !== 'string') {
    errors.push('Missing song.id');
  }
  if (!song.variant) {
    errors.push('Missing song.variant');
  }
  if (song.notes.length === 0) {
    errors.push('Song has no notes');
  }
  if (song.notes.length !== song.beats.length) {
    errors.push(`notes.length (${song.notes.length}) !== beats.length (${song.beats.length})`);
  }

  // Validate time signature & measureBeats consistency
  const timeSig = song.timeSignature ?? [song.measureBeats || 4, 4];
  const [timeTop, timeBottom] = timeSig;
  if (!Number.isInteger(timeTop) || timeTop < 1 || ![2, 4, 8, 16].includes(timeBottom)) {
    errors.push(`Invalid timeSignature [${timeTop}, ${timeBottom}]`);
  } else {
    const expectedMeasureBeats = (timeTop * 4) / timeBottom;
    if (Math.abs((song.measureBeats || 0) - expectedMeasureBeats) > 1e-3) {
      errors.push(
        `measureBeats (${song.measureBeats}) does not match timeSignature ${timeTop}/${timeBottom} (${expectedMeasureBeats} quarter-beats)`
      );
    }
  }

  // Validate key signature
  const fifths = song.keySignatureFifths ?? 0;
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) {
    errors.push(`Invalid keySignatureFifths: ${fifths}`);
  }

  // Validate tempo
  const tempo = song.defaultBpm ?? DEFAULT_BPM_BY_SONG_ID[song.id] ?? 96;
  if (!Number.isFinite(tempo) || tempo < 24 || tempo > 240) {
    errors.push(`Invalid tempo BPM: ${tempo}`);
  }

  // Validate normalized events, pitches, durations, rests, and monotonic non-overlapping timeline
  const events = normalizeSongToEvents(song);
  if (events.length === 0) {
    errors.push('normalizeSongToEvents returned empty array');
  }

  let expectedNextStartBeat = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!Number.isFinite(ev.durationBeats) || ev.durationBeats <= 0) {
      errors.push(`Event #${i} (${ev.type}) has non-positive durationBeats: ${ev.durationBeats}`);
    }
    if (Math.abs(ev.startBeat - expectedNextStartBeat) > 1e-3) {
      errors.push(
        `Timeline discontinuity or overlap at event #${i}: startBeat=${ev.startBeat}, expected=${expectedNextStartBeat}`
      );
    }
    if (ev.type === 'note') {
      if (!ev.pitch || !isValidPlayablePitch(ev.pitch)) {
        errors.push(`Invalid or out-of-range pitch "${ev.pitch}" at event #${i}`);
      }
    }
    expectedNextStartBeat = Number((ev.startBeat + ev.durationBeats).toFixed(4));
  }

  // Validate measure timeline alignment across all interior measures
  const totalMeasures = getSongMeasureCount(song);
  const pickup = song.pickupBeats && song.pickupBeats > 0 ? song.pickupBeats : 0;
  for (let m = 1; m < totalMeasures; m++) {
    const mStart = m === 1 ? 0 : pickup > 0 ? pickup + (m - 2) * song.measureBeats : (m - 1) * song.measureBeats;
    const mEnd = m === 1 && pickup > 0 ? pickup : pickup > 0 ? pickup + (m - 1) * song.measureBeats : m * song.measureBeats;
    const expectedSpan = Number((mEnd - mStart).toFixed(4));

    let covered = 0;
    for (const ev of events) {
      const evStart = ev.startBeat;
      const evEnd = ev.startBeat + ev.durationBeats;
      const overlapStart = Math.max(mStart, evStart);
      const overlapEnd = Math.min(mEnd, evEnd);
      if (overlapEnd > overlapStart) {
        covered += overlapEnd - overlapStart;
      }
    }
    if (Math.abs(covered - expectedSpan) > 1e-3) {
      errors.push(`Measure ${m} coverage (${covered.toFixed(3)}) !== expected (${expectedSpan.toFixed(3)})`);
    }
  }

  // Validate MusicXML generation, parsing, and lossless normalized event round-trip
  try {
    const xml = songToMusicXml({
      ...song,
      defaultBpm: tempo
    });
    if (!xml.includes('<score-partwise version="4.0">')) {
      errors.push('Generated MusicXML is missing <score-partwise version="4.0">');
    }
    if (/<direction\b[^>]*>(?![\s\S]*?<direction-type>)/i.test(xml)) {
      errors.push('Generated MusicXML contains <direction> without <direction-type>, which aborts OSMD Measure 1 parsing');
    }
    if (pickup > 0 && !xml.includes('<measure number="1" implicit="yes">')) {
      errors.push('Generated MusicXML for pickup piece is missing <measure number="1" implicit="yes">');
    }

    const parsed = parseMusicXmlToSongDef(xml, song.title);
    if ((parsed.keySignatureFifths ?? 0) !== fifths) {
      errors.push(
        `Key signature round-trip mismatch: expected ${fifths}, got ${parsed.keySignatureFifths ?? 0}`
      );
    }
    if (
      !parsed.timeSignature ||
      parsed.timeSignature[0] !== timeTop ||
      parsed.timeSignature[1] !== timeBottom
    ) {
      errors.push(
        `Time signature round-trip mismatch: expected ${timeTop}/${timeBottom}, got ${parsed.timeSignature?.join('/')}`
      );
    }
    if ((parsed.defaultBpm ?? 0) !== Math.round(tempo)) {
      errors.push(
        `Tempo round-trip mismatch: expected ${Math.round(tempo)}, got ${parsed.defaultBpm}`
      );
    }
    if (pickup > 0 && Math.abs((parsed.pickupBeats ?? 0) - pickup) > 1e-3) {
      errors.push(
        `Pickup beats round-trip mismatch: expected ${pickup}, got ${parsed.pickupBeats ?? 0}`
      );
    }

    const roundTripEvents = normalizeSongToEvents(parsed);
    if (roundTripEvents.length !== events.length) {
      errors.push(
        `Round-trip event count mismatch: expected ${events.length}, got ${roundTripEvents.length}`
      );
    } else {
      for (let i = 0; i < events.length; i++) {
        const orig = events[i];
        const rt = roundTripEvents[i];
        if (
          orig.type !== rt.type ||
          orig.pitch !== rt.pitch ||
          Math.abs(orig.startBeat - rt.startBeat) > 1e-3 ||
          Math.abs(orig.durationBeats - rt.durationBeats) > 1e-3 ||
          orig.measure !== rt.measure ||
          Math.abs(orig.beatInMeasure - rt.beatInMeasure) > 1e-3
        ) {
          errors.push(
            `Round-trip mismatch at event #${i}: expected ${JSON.stringify(orig)}, got ${JSON.stringify(rt)}`
          );
          break;
        }
      }
    }
  } catch (err) {
    errors.push(`MusicXML generation/parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    songId: song.id,
    variant: song.variant,
    errors
  };
}

/**
 * Machine-readable variant-level audit registry covering all 50 repertoire variants
 * (`25 × excerpt` + `25 × melodyArrangement`).
 * Only variants verified event-by-event against an authoritative reference edition in Milestone 3B.5A
 * are marked `verified`; all other variants are explicitly tracked as `unverified`
 * for note-by-note verification in Milestone 3B.5B.
 */
export const REPERTOIRE_AUDIT_REGISTRY: readonly RepertoireAuditEntry[] = REPERTOIRE.flatMap((song) => {
  const variants: Array<'excerpt' | 'melodyArrangement'> = ['excerpt', 'melodyArrangement'];
  return variants.map((variant) => {
    const rec = song.verification[variant];
    const verificationStatus: RepertoireVerificationStatus = rec?.status ?? 'unverified';
    const issues: string[] = [];

    if (verificationStatus !== 'verified') {
      if (rec?.notes) {
        issues.push(rec.notes);
      } else {
        issues.push(
          `Pending Milestone 3B.5B event-by-event score verification of ${variant} against an authoritative reference edition.`
        );
      }
    }

    return {
      id: `${song.id}:${variant}`,
      songId: song.id,
      title: song.title,
      composer: song.source,
      variant,
      verificationStatus,
      referenceSource: rec?.sourceTitle ?? song.source,
      sourceEdition: rec?.sourceEdition,
      sourceUrl: rec?.sourceUrl,
      sourceMovement: rec?.sourceMovement,
      sourcePart: rec?.sourcePart,
      sourceMeasures: rec?.sourceMeasures ?? variant,
      issues
    };
  });
});

export function validateEntireRepertoireLibrary(): SongStructureValidationResult[] {
  const results: SongStructureValidationResult[] = [];
  for (const song of REPERTOIRE) {
    results.push(validateSongStructure(getSongVersion(song, 'excerpt')));
    results.push(validateSongStructure(getSongVersion(song, 'full')));
  }
  return results;
}

export interface VerifiedVariantAuditSummary {
  id: string;
  songId: string;
  variant: 'excerpt' | 'melodyArrangement';
  verificationStatus: RepertoireVerificationStatus;
  eventCount: number;
  noteCount: number;
  restCount: number;
  totalBeats: number;
  measureCount: number;
  firstMeasureEvents: string[];
  measureSummaries: string[];
  compactFingerprint: string[];
  sourceTitle: string;
  sourceEdition: string;
  sourceUrl: string;
  sourceMovement: string;
  sourcePart: string;
  sourceMeasures: string;
}

export function getRepertoireVerificationCounts(): {
  total: number;
  verified: number;
  unverified: number;
  needsCorrection: number;
} {
  return {
    total: REPERTOIRE_AUDIT_REGISTRY.length,
    verified: REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'verified').length,
    unverified: REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'unverified').length,
    needsCorrection: REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'needsCorrection').length
  };
}

/**
 * Generates a deterministic, machine-readable audit summary directly from the production
 * `REPERTOIRE` / `normalizeSongToEvents` pipeline and `REPERTOIRE_AUDIT_REGISTRY` metadata,
 * preventing any drift between production musical data and human-readable audit reports.
 */
export function getVariantAuditSummary(
  songId: string,
  variant: 'excerpt' | 'melodyArrangement'
): VerifiedVariantAuditSummary {
  const baseSong = REPERTOIRE.find((s) => s.id === songId);
  if (!baseSong) {
    throw new Error(`Unknown repertoire songId: ${songId}`);
  }
  const versionMode = variant === 'melodyArrangement' ? 'full' : 'excerpt';
  const song = getSongVersion(baseSong, versionMode);
  const events = normalizeSongToEvents(song);
  const auditEntry = REPERTOIRE_AUDIT_REGISTRY.find(
    (e) => e.songId === songId && e.variant === variant
  );
  if (!auditEntry) {
    throw new Error(`Missing REPERTOIRE_AUDIT_REGISTRY entry for ${songId}:${variant}`);
  }

  const compactEvent = (ev: (typeof events)[number]): string =>
    ev.type === 'rest'
      ? `m${ev.measure}@${ev.beatInMeasure}:REST(${ev.durationBeats})`
      : `m${ev.measure}@${ev.beatInMeasure}:${ev.pitch}(${ev.durationBeats})`;

  const compactFingerprint = events.map(compactEvent);
  const firstMeasureEvents = events.filter((ev) => ev.measure === 1).map(compactEvent);

  const measureCount = getSongMeasureCount(song);
  const byMeasure = new Map<number, string[]>();
  for (const ev of events) {
    const token = ev.type === 'rest' ? `REST(${ev.durationBeats})` : `${ev.pitch}(${ev.durationBeats})`;
    const list = byMeasure.get(ev.measure) ?? [];
    list.push(token);
    byMeasure.set(ev.measure, list);
  }
  const measureSummaries: string[] = [];
  for (let m = 1; m <= measureCount; m++) {
    const tokens = byMeasure.get(m);
    if (tokens && tokens.length > 0) {
      measureSummaries.push(`m${m}: ${tokens.join(' ')}`);
    } else {
      measureSummaries.push(`m${m}: (tied hold)`);
    }
  }

  const noteCount = events.filter((ev) => ev.type === 'note').length;
  const restCount = events.filter((ev) => ev.type === 'rest').length;
  const lastEvent = events[events.length - 1];
  const totalBeats = lastEvent ? Number((lastEvent.startBeat + lastEvent.durationBeats).toFixed(4)) : 0;

  return {
    id: auditEntry.id,
    songId,
    variant,
    verificationStatus: auditEntry.verificationStatus,
    eventCount: events.length,
    noteCount,
    restCount,
    totalBeats,
    measureCount,
    firstMeasureEvents,
    measureSummaries,
    compactFingerprint,
    sourceTitle: auditEntry.referenceSource,
    sourceEdition: auditEntry.sourceEdition ?? '',
    sourceUrl: auditEntry.sourceUrl ?? '',
    sourceMovement: auditEntry.sourceMovement ?? '',
    sourcePart: auditEntry.sourcePart ?? '',
    sourceMeasures: auditEntry.sourceMeasures
  };
}

export function getAllVerifiedVariantAuditSummaries(): VerifiedVariantAuditSummary[] {
  return REPERTOIRE_AUDIT_REGISTRY.filter((e) => e.verificationStatus === 'verified').map((e) =>
    getVariantAuditSummary(e.songId, e.variant)
  );
}

