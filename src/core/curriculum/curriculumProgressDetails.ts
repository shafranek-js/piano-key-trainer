import type { ReviewLogEvent } from '../fsrs/types';
import {
  CURRICULUM_GROUPS,
  NATURAL_NOTES
} from '../fsrs/constants';
import {
  baseNoteReady,
  curriculumCardReady,
  groupReady,
  notationCurriculumReady,
  successfulScheduledSessions,
  type CardGetter,
  type CurriculumPhase
} from './curriculum';
import type { LearningProgressRecord } from '../learning/types';

export interface PhaseChecklistItem {
  label: string;
  isMet: boolean;
  statusText: string;
}

export interface PhaseProgressDetails {
  phaseId: string;
  phaseTitle: string;
  phaseDetail: string;
  instructionText: string;
  checklist: readonly PhaseChecklistItem[];
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaHint?: string;
}

function toProgressMap(
  input?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
    | Record<string, LearningProgressRecord>
): Map<string, LearningProgressRecord> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) {
    const map = new Map<string, LearningProgressRecord>();
    for (const item of input) {
      if (item && item.id) map.set(item.id, item);
    }
    return map;
  }
  const map = new Map<string, LearningProgressRecord>();
  for (const [k, v] of Object.entries(input)) {
    if (v && v.id) map.set(k, v);
  }
  return map;
}

/**
 * Computes user-facing progression details for the current active curriculum phase.
 * Pure function: eliminates all technical FSRS jargon (Stability, scheduled-review, internal thresholds)
 * and formats concrete checklist items showing "What remains" to complete the phase.
 */
export function getCurriculumPhaseProgressDetails(
  currentPhase: CurriculumPhase | undefined,
  getCard: CardGetter,
  reviewLog: readonly ReviewLogEvent[],
  learningProgress?:
    | ReadonlyMap<string, LearningProgressRecord>
    | readonly LearningProgressRecord[]
    | Record<string, LearningProgressRecord>
): PhaseProgressDetails | null {
  if (!currentPhase) return null;

  const lpMap = toProgressMap(learningProgress);

  switch (currentPhase.id) {
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

      const findCCard = getCard('find', 'C');
      const identifyCCard = getCard('identify', 'C');
      const findFCard = getCard('find', 'F');
      const identifyFCard = getCard('identify', 'F');

      const sessionsC = Math.min(
        2,
        Math.max(
          successfulScheduledSessions(findCCard?.id ?? '', reviewLog),
          successfulScheduledSessions(identifyCCard?.id ?? '', reviewLog)
        )
      );
      const sessionsF = Math.min(
        2,
        Math.max(
          successfulScheduledSessions(findFCard?.id ?? '', reviewLog),
          successfulScheduledSessions(identifyFCard?.id ?? '', reviewLog)
        )
      );

      const stabC = Math.min(findCCard?.stability ?? 0, identifyCCard?.stability ?? 0);
      const stabF = Math.min(findFCard?.stability ?? 0, identifyFCard?.stability ?? 0);
      const isStabilityMet = stabC >= 3 && stabF >= 3 && sessionsC >= 2 && sessionsF >= 2;

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Ориентир C',
          isMet: anchorC,
          statusText: anchorC ? '✓ освоен' : 'ещё не изучен'
        },
        {
          label: 'Ориентир F',
          isMet: anchorF,
          statusText: anchorF ? '✓ освоен' : 'ещё не изучен'
        },
        {
          label: 'Различать C и F',
          isMet: identifyCF,
          statusText: identifyCF ? '✓ освоено' : 'требуется урок'
        },
        {
          label: 'Повторение C',
          isMet: sessionsC >= 2,
          statusText: sessionsC >= 2 ? '✓ 2 из 2' : `${sessionsC} из 2`
        },
        {
          label: 'Повторение F',
          isMet: sessionsF >= 2,
          statusText: sessionsF >= 2 ? '✓ 2 из 2' : `${sessionsF} из 2`
        },
        {
          label: 'Закрепление',
          isMet: isStabilityMet,
          statusText: isStabilityMet
            ? '✓ навык закреплён'
            : sessionsC >= 2 && sessionsF >= 2
              ? 'вернитесь к тренировке позже'
              : 'ещё требуется практика'
        }
      ];

      const isTeachingPending = !anchorC || !anchorF || !identifyCF;
      return {
        phaseId: 'anchors',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText: isTeachingPending
          ? 'Чтобы завершить этот этап: познакомьтесь с клавишами C и F на клавиатуре и научитесь их различать.'
          : 'Чтобы завершить этот этап: закрепите C и F в нескольких тренировках. Мы сами сообщим, когда навык станет достаточно устойчивым.',
        checklist,
        ctaLabel: isTeachingPending ? 'Продолжить урок: C и F' : 'Тренировать C и F'
      };
    }

    case 'neighbors': {
      const noteD =
        lpMap.get('white-key-intro:D')?.state === 'retention' ||
        baseNoteReady('D', getCard, reviewLog);
      const noteE =
        lpMap.get('white-key-intro:E')?.state === 'retention' ||
        baseNoteReady('E', getCard, reviewLog);
      const noteB =
        lpMap.get('white-key-intro:B')?.state === 'retention' ||
        baseNoteReady('B', getCard, reviewLog);
      const cde =
        lpMap.get('white-key-identify:CDE')?.state === 'retention' || (noteD && noteE);
      const fb =
        lpMap.get('white-key-identify:FB')?.state === 'retention' || noteB;
      const neighborsReady = groupReady(CURRICULUM_GROUPS.neighbors, getCard, reviewLog);

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Нота D (между C и E)',
          isMet: noteD,
          statusText: noteD ? '✓ освоена' : 'ещё не изучена'
        },
        {
          label: 'Нота E (справа от D)',
          isMet: noteE,
          statusText: noteE ? '✓ освоена' : 'ещё не изучена'
        },
        {
          label: 'Нота B (перед C)',
          isMet: noteB,
          statusText: noteB ? '✓ освоена' : 'ещё не изучена'
        },
        {
          label: 'Различать группу C–D–E',
          isMet: cde,
          statusText: cde ? '✓ освоено' : 'требуется урок'
        },
        {
          label: 'Различать группу F–B',
          isMet: fb,
          statusText: fb ? '✓ освоено' : 'требуется урок'
        },
        {
          label: 'Закрепление соседей',
          isMet: neighborsReady,
          statusText: neighborsReady ? '✓ навык закреплён' : 'ещё требуется практика'
        }
      ];

      return {
        phaseId: 'neighbors',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText:
          'Чтобы завершить этот этап: освойте ноты D, E и B рядом с ориентирами C и F, затем закрепите их в тренировках.',
        checklist,
        ctaLabel: 'Тренировать D, E, B'
      };
    }

    case 'remaining': {
      const noteG =
        lpMap.get('white-key-intro:G')?.state === 'retention' ||
        baseNoteReady('G', getCard, reviewLog);
      const noteA =
        lpMap.get('white-key-intro:A')?.state === 'retention' ||
        baseNoteReady('A', getCard, reviewLog);
      const allWhite =
        lpMap.get('white-key-flow:phase3Complete')?.state === 'retention' ||
        (noteG && noteA);
      const remainingReady = groupReady(CURRICULUM_GROUPS.remaining, getCard, reviewLog);

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Нота G (после F)',
          isMet: noteG,
          statusText: noteG ? '✓ освоена' : 'ещё не изучена'
        },
        {
          label: 'Нота A (между G и B)',
          isMet: noteA,
          statusText: noteA ? '✓ освоена' : 'ещё не изучена'
        },
        {
          label: 'Различать все белые клавиши (C–B)',
          isMet: allWhite,
          statusText: allWhite ? '✓ освоено' : 'требуется урок'
        },
        {
          label: 'Закрепление белых клавиш',
          isMet: remainingReady,
          statusText: remainingReady ? '✓ навык закреплён' : 'ещё требуется практика'
        }
      ];

      return {
        phaseId: 'remaining',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText:
          'Чтобы завершить этот этап: добавьте ноты G и A и научитесь безошибочно находить любую белую клавишу.',
        checklist,
        ctaLabel: 'Тренировать белые клавиши'
      };
    }

    case 'black': {
      const blackReady = groupReady(CURRICULUM_GROUPS.black, getCard, reviewLog);
      const p4Done = lpMap.get('curriculum-phase4:complete')?.state === 'retention' || blackReady;

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Ориентиры: C♯ и F♯',
          isMet: p4Done,
          statusText: p4Done ? '✓ освоены' : 'ещё не изучены'
        },
        {
          label: 'Группа трёх диезов (F♯ · G♯ · A♯)',
          isMet: p4Done,
          statusText: p4Done ? '✓ освоена' : 'требуется тренировка'
        },
        {
          label: 'Все 5 чёрных клавиш',
          isMet: p4Done,
          statusText: p4Done ? '✓ освоены' : 'требуется тренировка'
        },
        {
          label: 'Закрепление чёрных клавиш',
          isMet: blackReady,
          statusText: blackReady ? '✓ навык закреплён' : 'ещё требуется практика'
        }
      ];

      return {
        phaseId: 'black',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText:
          'Чтобы завершить этот этап: освойте полутоны и диезы: находите все 5 чёрных клавиш на клавиатуре.',
        checklist,
        ctaLabel: 'Тренировать чёрные клавиши'
      };
    }

    case 'notation': {
      const notationReady = notationCurriculumReady(getCard, reviewLog);
      const p5Done = lpMap.get('curriculum-phase5:complete')?.state === 'retention' || notationReady;

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Ориентир ноты C4 на стане',
          isMet: p5Done,
          statusText: p5Done ? '✓ освоен' : 'ещё не изучен'
        },
        {
          label: 'Ноты на линиях (E4 · G4 · B4)',
          isMet: p5Done,
          statusText: p5Done ? '✓ освоены' : 'требуется тренировка'
        },
        {
          label: 'Ноты между линиями (D4 · F4 · A4)',
          isMet: p5Done,
          statusText: p5Done ? '✓ освоены' : 'требуется тренировка'
        },
        {
          label: 'Закрепление чтения нот',
          isMet: notationReady,
          statusText: notationReady ? '✓ навык закреплён' : 'ещё требуется практика'
        }
      ];

      return {
        phaseId: 'notation',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText:
          'Чтобы завершить этот этап: научитесь читать ноты скрипичного ключа и сразу находить их на клавиатуре.',
        checklist,
        ctaLabel: 'Тренировать чтение нот'
      };
    }

    case 'sound': {
      const soundReady = NATURAL_NOTES.every((note) =>
        curriculumCardReady(getCard('soundToKey', note), reviewLog)
      );
      const p6Done = lpMap.get('curriculum-phase6:complete')?.state === 'retention' || soundReady;

      const checklist: PhaseChecklistItem[] = [
        {
          label: 'Ориентир звучания C4',
          isMet: p6Done,
          statusText: p6Done ? '✓ освоен' : 'ещё не изучен'
        },
        {
          label: 'Узнавание шагов и скачков на слух',
          isMet: p6Done,
          statusText: p6Done ? '✓ освоено' : 'требуется тренировка'
        },
        {
          label: 'Определение белых нот от C4',
          isMet: p6Done,
          statusText: p6Done ? '✓ освоено' : 'требуется тренировка'
        },
        {
          label: 'Закрепление слухового навыка',
          isMet: soundReady,
          statusText: soundReady ? '✓ навык закреплён' : 'ещё требуется практика'
        }
      ];

      return {
        phaseId: 'sound',
        phaseTitle: currentPhase.title,
        phaseDetail: currentPhase.detail,
        instructionText:
          'Чтобы завершить этот этап: научитесь определять ноты на слух относительно опорного звука C4.',
        checklist,
        ctaLabel: 'Тренировать слух'
      };
    }

    default:
      return null;
  }
}
