import {
  CURRICULUM_GROUPS,
  NATURAL_NOTES
} from '../fsrs/constants';
import type { Card, ReviewLogEvent } from '../fsrs/types';
import { isInvalidFsrsDueTimestamp } from '../fsrs/cardClassification';
import type { LearningProgressRecord } from '../learning/types';
import {
  baseNoteReady,
  curriculumCardReady,
  groupReady,
  type CardGetter,
  type CurriculumPhase
} from '../curriculum/curriculum';
import {
  isPhase4BlackKeysCompleted,
  isPhase5NotationCompleted,
  isPhase6EarCompleted
} from '../learning/curriculum3d';
import { isWhiteKeyCurriculumCompleted, WHITE_KEY_CURRICULUM_ITEM_IDS } from '../learning/curriculumFlow';
import type {
  DiversityMetrics,
  LearningBottlenecksDiagnosticState,
  PhaseDiagnosticDetail,
  PhaseRequirementCheck,
  PracticeTaskDiagnostic,
  StalledSkillCandidate,
  StorageConsistencyDiagnosticState
} from './diagnosticTypes';

const KNOWN_SKILLS = new Set<string>([
  'find',
  'identify',
  'patternIdentify',
  'notationToKey',
  'soundToKey',
  'notationBassToKey',
  'intervalBuild',
  'intervalIdentify',
  'triadBuild',
  'triadIdentify',
  'triadInversionBuild',
  'triadInversionIdentify',
  'chordSymbolRead'
]);

export function computeDiversityMetrics(tasks: readonly PracticeTaskDiagnostic[]): DiversityMetrics {
  if (!tasks.length) {
    return {
      taskCount: 0,
      uniqueSkills: 0,
      uniqueTaskTypes: 0,
      uniqueRoots: 0,
      uniqueNotes: 0,
      maxSameSkillStreak: 0,
      maxSameCardStreak: 0
    };
  }

  const skills = new Set<string>();
  const taskTypes = new Set<string>();
  const roots = new Set<string>();
  const notes = new Set<string>();

  let maxSameSkillStreak = 0;
  let currentSkillStreak = 0;
  let lastSkill: string | null = null;

  let maxSameCardStreak = 0;
  let currentCardStreak = 0;
  let lastCard: string | null = null;

  for (const t of tasks) {
    if (t.skillType) skills.add(t.skillType);
    if (t.taskType) taskTypes.add(t.taskType);
    if (t.root) roots.add(t.root);
    if (t.note) notes.add(t.note);

    if (t.skillType === lastSkill) {
      currentSkillStreak++;
    } else {
      currentSkillStreak = 1;
      lastSkill = t.skillType;
    }
    if (currentSkillStreak > maxSameSkillStreak) {
      maxSameSkillStreak = currentSkillStreak;
    }

    if (t.cardId === lastCard) {
      currentCardStreak++;
    } else {
      currentCardStreak = 1;
      lastCard = t.cardId;
    }
    if (currentCardStreak > maxSameCardStreak) {
      maxSameCardStreak = currentCardStreak;
    }
  }

  return {
    taskCount: tasks.length,
    uniqueSkills: skills.size,
    uniqueTaskTypes: taskTypes.size,
    uniqueRoots: roots.size,
    uniqueNotes: notes.size,
    maxSameSkillStreak,
    maxSameCardStreak
  };
}

export function detectBottlenecks(
  reviewLogs: readonly ReviewLogEvent[],
  cards: readonly Card[]
): LearningBottlenecksDiagnosticState {
  const skillStats = new Map<
    string,
    { attempts: number; correct: number; firstCorrect: number; timesMs: number[] }
  >();

  for (const e of reviewLogs) {
    let stat = skillStats.get(e.skill);
    if (!stat) {
      stat = { attempts: 0, correct: 0, firstCorrect: 0, timesMs: [] };
      skillStats.set(e.skill, stat);
    }
    stat.attempts++;
    if (e.grade !== 1) stat.correct++;
    if (e.firstCorrect) stat.firstCorrect++;
    if (typeof e.responseMs === 'number' && Number.isFinite(e.responseMs) && e.responseMs > 0) stat.timesMs.push(e.responseMs);
  }

  // Count lapses by skill from cards
  const skillLapses = new Map<string, number>();
  for (const c of cards) {
    skillLapses.set(c.skill, (skillLapses.get(c.skill) || 0) + (c.lapses || 0));
  }

  const weakestSkills: Array<{ skill: string; attempts: number; accuracy: number }> = [];
  const mostFailedSkills: Array<{ skill: string; failureCount: number }> = [];
  const longestResponseTimeSkills: Array<{ skill: string; medianMs: number }> = [];
  const stalledSkills: StalledSkillCandidate[] = [];

  for (const [skill, stat] of skillStats.entries()) {
    const acc = stat.attempts > 0 ? Math.round((stat.firstCorrect / stat.attempts) * 100) : 0;
    const fails = stat.attempts - stat.firstCorrect;
    const lapses = skillLapses.get(skill) || 0;

    weakestSkills.push({ skill, attempts: stat.attempts, accuracy: acc });
    if (fails > 0) {
      mostFailedSkills.push({ skill, failureCount: fails });
    }

    if (stat.timesMs.length > 0) {
      const sorted = [...stat.timesMs].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      longestResponseTimeSkills.push({ skill, medianMs: Math.round(median) });
    }

    // Stalled skill detection:
    // >= 8 attempts and accuracy < 70%, OR >= 3 lapses
    if ((stat.attempts >= 8 && acc < 70) || lapses >= 3) {
      stalledSkills.push({
        skill,
        attempts: stat.attempts,
        accuracy: Math.round((stat.correct / stat.attempts) * 100),
        firstAttemptAccuracy: acc,
        lapses,
        warning:
          acc < 60
            ? 'Низкая точность с 1-й попытки (<60%) при регулярных тренировках'
            : lapses >= 3
              ? `Навык забывался ${lapses} раз(а) (lapses >= 3)`
              : 'Точность ниже целевого порога 70%'
      });
    }
  }

  weakestSkills.sort((a, b) => a.accuracy - b.accuracy);
  mostFailedSkills.sort((a, b) => b.failureCount - a.failureCount);
  longestResponseTimeSkills.sort((a, b) => b.medianMs - a.medianMs);

  const highestLapseCards: Array<{ cardId: string; skill: string; note: string; lapses: number }> =
    cards
      .filter(c => c.lapses > 0)
      .map(c => ({
        cardId: c.id,
        skill: c.skill,
        note: c.note,
        lapses: c.lapses
      }))
      .sort((a, b) => b.lapses - a.lapses)
      .slice(0, 10);

  return {
    weakestSkills: weakestSkills.slice(0, 5),
    mostFailedSkills: mostFailedSkills.slice(0, 5),
    highestLapseCards,
    longestResponseTimeSkills: longestResponseTimeSkills.slice(0, 5),
    stalledSkills
  };
}

export function detectStorageConsistency(params: {
  cards: readonly Card[];
  learningProgress: Map<string, LearningProgressRecord>;
  reviewLogs: readonly ReviewLogEvent[];
  rawPhases: readonly CurriculumPhase[];
  normalizedPhases: readonly CurriculumPhase[];
  now: number;
}): StorageConsistencyDiagnosticState {
  const { cards, learningProgress, reviewLogs, rawPhases, now } = params;
  const warnings: string[] = [];

  const orphanCards: string[] = [];
  const missingProgressRecords: string[] = [];
  const unknownSkillIds: string[] = [];
  const duplicateCards: string[] = [];
  const invalidDueDates: string[] = [];
  const invalidReviewTimestamps: string[] = [];
  const futureTimestamps: string[] = [];
  const curriculumContradictions: string[] = [];

  const seenCardIds = new Set<string>();
  for (const c of cards) {
    if (seenCardIds.has(c.id)) {
      duplicateCards.push(c.id);
      warnings.push(`Дубликат карточки обнаружен: ${c.id}`);
    }
    seenCardIds.add(c.id);

    if (!KNOWN_SKILLS.has(c.skill)) {
      unknownSkillIds.push(`${c.id} (${c.skill})`);
      warnings.push(`Неизвестный skill в карточке: ${c.id} (${c.skill})`);
    }

    if (isInvalidFsrsDueTimestamp(c)) {
      invalidDueDates.push(c.id);
      warnings.push(`Некорректная дата dueAt у карточки: ${c.id}`);
    }

    if (
      Number.isFinite(c.dueAt) &&
      new Date(c.dueAt).getTime() === c.dueAt &&
      c.dueAt > now + 10 * 365 * 86400000
    ) {
      futureTimestamps.push(`${c.id} dueAt: ${new Date(c.dueAt).toISOString()}`);
      warnings.push(`Дата dueAt подозрительно далеко в будущем: ${c.id}`);
    }
  }

  // Check review log future timestamps (> now + 60s)
  for (const r of reviewLogs) {
    if (!Number.isFinite(r.ts) || r.ts < 0 || new Date(r.ts).getTime() !== r.ts) {
      invalidReviewTimestamps.push(`${r.sessionId}/${r.cardId}: ${r.ts}`);
      warnings.push(`Событие reviewLog имеет некорректный timestamp: ${r.sessionId}/${r.cardId}`);
      continue;
    }
    if (r.ts > now + 60_000) {
      futureTimestamps.push(`ReviewLogEvent at ${new Date(r.ts).toISOString()}`);
      warnings.push(`Событие reviewLog имеет timestamp в будущем`);
      break;
    }
  }

  // Check curriculum contradictions
  // E.g. raw phase N is completed, but raw phase < N is incomplete
  let highestCompletedIdx = -1;
  rawPhases.forEach((p, idx) => {
    if (p.done) highestCompletedIdx = Math.max(highestCompletedIdx, idx);
  });

  if (highestCompletedIdx > 0) {
    for (let i = 0; i < highestCompletedIdx; i++) {
      if (!rawPhases[i].done && !rawPhases[i].skipped) {
        const msg = `Рассинхронизация: фаза ${i + 1} (${rawPhases[i].title}) не завершена в raw-состоянии, но более поздняя фаза ${highestCompletedIdx + 1} (${rawPhases[highestCompletedIdx].title}) завершена. Автоматически нормализовано.`;
        curriculumContradictions.push(msg);
        warnings.push(msg);
      }
    }
  }

  // Missing progress records for active cards
  if (learningProgress.size > 0) {
    const hasPhase3 = learningProgress.has(WHITE_KEY_CURRICULUM_ITEM_IDS.PHASE3_COMPLETE);
    const hasWhiteKeys = learningProgress.has(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_D);
    if (hasPhase3 && !hasWhiteKeys) {
      missingProgressRecords.push('whiteKeys individual progress records missing despite Phase 3 complete');
    }
  }

  return {
    warnings,
    checks: {
      orphanCards,
      missingProgressRecords,
      unknownSkillIds,
      duplicateCards,
      invalidDueDates,
      invalidReviewTimestamps,
      futureTimestamps,
      curriculumContradictions
    }
  };
}

export function computePhaseDetails(params: {
  rawPhases: readonly CurriculumPhase[];
  normalizedPhases: readonly CurriculumPhase[];
  getCard: CardGetter;
  reviewLog: readonly ReviewLogEvent[];
  lpMap: Map<string, LearningProgressRecord>;
}): Record<string, PhaseDiagnosticDetail> {
  const { rawPhases, normalizedPhases, getCard, reviewLog, lpMap } = params;
  const result: Record<string, PhaseDiagnosticDetail> = {};

  const lpList = Array.from(lpMap.values());

  normalizedPhases.forEach((phase, idx) => {
    const raw = rawPhases[idx] || phase;
    const requirements: PhaseRequirementCheck[] = [];

    let reconciliationReason: string | undefined;
    if (!raw.done && phase.done) {
      reconciliationReason = 'Нормализовано инвариантом последовательности (завершена более поздняя обязательная фаза)';
    }

    switch (phase.id) {
      case 'anchors': {
        const anchorC =
          lpMap.get('keyboard-anchor:C')?.state === 'retention' ||
          curriculumCardReady(getCard('find', 'C'), reviewLog);
        const anchorF =
          lpMap.get('keyboard-anchor:F')?.state === 'retention' ||
          curriculumCardReady(getCard('find', 'F'), reviewLog);
        const identifyCF =
          ['mixReady', 'retention'].includes(lpMap.get('keyboard-identify:C-F')?.state ?? '') ||
          baseNoteReady('C', getCard, reviewLog);

        requirements.push(
          { label: 'Ориентир C', isMet: anchorC, statusText: anchorC ? 'Освоен' : 'Не изучен' },
          { label: 'Ориентир F', isMet: anchorF, statusText: anchorF ? 'Освоен' : 'Не изучен' },
          { label: 'Различение C и F', isMet: identifyCF, statusText: identifyCF ? 'Освоено' : 'Не пройдено' }
        );
        break;
      }

      case 'neighbors': {
        const d = lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_D)?.state === 'retention' || baseNoteReady('D', getCard, reviewLog);
        const e = lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_E)?.state === 'retention' || baseNoteReady('E', getCard, reviewLog);
        const b = lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_B)?.state === 'retention' || baseNoteReady('B', getCard, reviewLog);
        const cde = ['mixReady', 'retention'].includes(lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE)?.state ?? '') || (d && e);
        const fb = ['mixReady', 'retention'].includes(lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB)?.state ?? '') || b;

        requirements.push(
          { label: 'Клавиша D (сосед C)', isMet: d, statusText: d ? 'Освоена' : 'Не изучена' },
          { label: 'Клавиша E (сосед D/F)', isMet: e, statusText: e ? 'Освоена' : 'Не изучена' },
          { label: 'Клавиша B (сосед C/A)', isMet: b, statusText: b ? 'Освоена' : 'Не изучена' },
          { label: 'Группа C–D–E', isMet: cde, statusText: cde ? 'Освоена' : 'Не закреплена' },
          { label: 'Группа F–B', isMet: fb, statusText: fb ? 'Освоена' : 'Не закреплена' }
        );
        break;
      }

      case 'remaining': {
        const g = lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_G)?.state === 'retention' || baseNoteReady('G', getCard, reviewLog);
        const a = lpMap.get(WHITE_KEY_CURRICULUM_ITEM_IDS.NOTE_A)?.state === 'retention' || baseNoteReady('A', getCard, reviewLog);
        const allWhite = lpList.length > 0
          ? isWhiteKeyCurriculumCompleted({ learningProgress: lpList, reviewLogs: reviewLog })
          : groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog);

        requirements.push(
          { label: 'Клавиша G', isMet: g, statusText: g ? 'Освоена' : 'Не изучена' },
          { label: 'Клавиша A', isMet: a, statusText: a ? 'Освоена' : 'Не изучена' },
          { label: 'Все 7 белых клавиш', isMet: allWhite, statusText: allWhite ? 'Закреплены' : 'Требуется практика' }
        );
        break;
      }

      case 'black': {
        const blackDone = isPhase4BlackKeysCompleted(lpList, undefined, reviewLog) || groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
        requirements.push(
          { label: 'Группа 2 чёрных (C♯, D♯)', isMet: blackDone, statusText: blackDone ? 'Освоена' : 'Не изучена' },
          { label: 'Группа 3 чёрных (F♯, G♯, A♯)', isMet: blackDone, statusText: blackDone ? 'Освоена' : 'Не изучена' }
        );
        break;
      }

      case 'notation': {
        const notationDone = isPhase5NotationCompleted(lpList) || NATURAL_NOTES.every(n => curriculumCardReady(getCard('notationToKey', n), reviewLog));
        requirements.push(
          { label: 'Чтение C4–B4 на нотном стане', isMet: notationDone, statusText: notationDone ? 'Освоено' : 'Не пройдено' },
          { label: 'Точный перенос ноты на клавиатуру', isMet: notationDone, statusText: notationDone ? 'Освоен' : 'Не закреплён' }
        );
        break;
      }

      case 'sound': {
        const earDone = isPhase6EarCompleted(lpList) || NATURAL_NOTES.every(n => curriculumCardReady(getCard('soundToKey', n), reviewLog));
        requirements.push(
          { label: 'Опорный тон C4 на слух', isMet: earDone, statusText: earDone ? 'Освоен' : 'Не изучен' },
          { label: 'Слуховое распознавание 7 ступеней', isMet: earDone, statusText: earDone ? 'Освоено' : 'Не завершено' }
        );
        break;
      }
    }

    const metCount = requirements.filter(r => r.isMet).length;
    result[phase.id] = {
      id: phase.id,
      title: phase.title,
      detail: phase.detail,
      available: phase.open,
      started: phase.done || phase.open,
      completed: phase.done,
      current: phase.open && !phase.done,
      locked: !phase.open,
      prerequisites: idx > 0 ? [normalizedPhases[idx - 1].id] : [],
      rawCompletion: raw.done,
      normalizedCompletion: phase.done,
      normalizationReason: reconciliationReason,
      reconciliationReason,
      requirements,
      requirementsMet: metCount,
      requirementsTotal: requirements.length
    };
  });

  return result;
}
