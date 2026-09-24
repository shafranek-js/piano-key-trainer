import type { Card, NoteName, Skill } from '../fsrs/types';
import { LEARN_ORDER } from '../fsrs/constants';
import { retrievability } from '../fsrs/fsrs6';

export function rankNew(a: Card, b: Card): number {
  const ai = LEARN_ORDER.indexOf(a.note);
  const bi = LEARN_ORDER.indexOf(b.note);
  if (ai !== bi) return ai - bi;
  const order: Record<Skill, number> = {
    find: 0,
    identify: 1,
    patternIdentify: 2,
    notationToKey: 3,
    soundToKey: 4
  };
  return (order[a.skill] ?? 9) - (order[b.skill] ?? 9);
}

export function diversityPenalty(card: Card, recentCards: readonly Card[]): number {
  let p = 0;
  const last = recentCards[0];
  if (last && card.id === last.id) p += 1;
  if (last && card.note === last.note) p += 0.35;
  if (recentCards.length >= 2) {
    const lastTwo = recentCards.slice(0, 2);
    if (lastTwo.every(c => c.skill === card.skill)) p += 0.18;
  }
  return p;
}

export function chooseDue(
  cards: readonly Card[],
  now: number,
  recentCards: readonly Card[]
): Card | null {
  const due = cards
    .filter(c => c.reps > 0 && c.dueAt <= now)
    .map(c => ({
      card: c,
      r: retrievability(c, now) ?? 0,
      score: (retrievability(c, now) ?? 0) + diversityPenalty(c, recentCards)
    }));
  due.sort((a, b) => a.score - b.score || a.card.dueAt - b.card.dueAt);
  return due[0]?.card || null;
}

export function chooseNew(
  cards: readonly Card[],
  sessionIntroducedNotes: Set<NoteName>,
  maxNewPitchClasses: number,
  noteEverScheduled: (note: NoteName) => boolean,
  recentCards: readonly Card[]
): Card | null {
  const unseen = cards.filter(c => c.reps === 0).sort(rankNew);
  if (!unseen.length) return null;

  const allowed = unseen.filter(
    c => noteEverScheduled(c.note) || sessionIntroducedNotes.has(c.note)
  );

  if (allowed.length) {
    return allowed.sort(
      (a, b) =>
        rankNew(a, b) +
        diversityPenalty(a, recentCards) -
        diversityPenalty(b, recentCards)
    )[0];
  }

  // 2. If the user already finished all unseen cards for currently introduced notes,
  // check if they should unlock the next note in LEARN_ORDER:
  const allCurrentNotesReviewed = sessionIntroducedNotes.size > 0 &&
    Array.from(sessionIntroducedNotes).every(note =>
      cards.some(c => c.note === note && (c.reps > 0 || (c.stats && c.stats.trials > 0)))
    );

  if (sessionIntroducedNotes.size >= maxNewPitchClasses && !allCurrentNotesReviewed) {
    return null;
  }

  const nextNote = unseen[0].note;
  const candidates = unseen
    .filter(c => c.note === nextNote)
    .sort(
      (a, b) =>
        rankNew(a, b) +
        diversityPenalty(a, recentCards) -
        diversityPenalty(b, recentCards)
    );

  if (candidates.length) {
    sessionIntroducedNotes.add(nextNote);
    return candidates[0];
  }
  return null;
}

export function choosePractice(
  cards: readonly Card[],
  now: number,
  recentCards: readonly Card[]
): Card | null {
  if (!cards.length) return null;
  // Free practice must only pull from cards that have already been introduced or practiced!
  const learned = cards.filter(c => c.reps > 0 || (c.stats && c.stats.trials > 0));
  const pool = learned.length > 0 ? learned : cards.filter(c => c.reps > 0);
  if (!pool.length) {
    return cards.slice().sort(rankNew)[0] ?? null;
  }
  const scored = pool
    .map(c => {
      const r = retrievability(c, now) ?? 0.85;
      const trials = c.stats.trials || 0;
      const acc = trials ? c.stats.firstCorrect / trials : 0.75;
      return { card: c, score: r * 0.6 + acc * 0.25 + diversityPenalty(c, recentCards) };
    })
    .sort((a, b) => a.score - b.score);
  return scored[0]?.card ?? pool[Math.floor(Math.random() * pool.length)];
}

export function shuffleCopy<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildColdQueue(
  validCards: readonly Card[],
  targetTrials = 20
): string[] {
  let pool = validCards.filter(c => c.reps > 0);
  if (pool.length < 8) pool = validCards.slice();
  if (!pool.length) return [];

  const bySkill = {
    find: shuffleCopy(pool.filter(c => c.skill === 'find')),
    identify: shuffleCopy(pool.filter(c => c.skill === 'identify')),
    patternIdentify: shuffleCopy(pool.filter(c => c.skill === 'patternIdentify')),
    notationToKey: shuffleCopy(pool.filter(c => c.skill === 'notationToKey')),
    soundToKey: shuffleCopy(pool.filter(c => c.skill === 'soundToKey'))
  };

  const skills: Skill[] = (
    ['find', 'identify', 'patternIdentify', 'notationToKey', 'soundToKey'] as Skill[]
  ).filter(s => bySkill[s].length > 0);

  const queue: string[] = [];
  const used = new Map<string, number>();
  let guard = 0;

  while (queue.length < targetTrials && guard++ < 500) {
    const skill = skills.length ? skills[queue.length % skills.length] : null;
    let candidates = skill && bySkill[skill].length ? bySkill[skill] : pool;

    candidates = candidates.slice().sort((a, b) => {
      const uA = used.get(a.id) || 0;
      const uB = used.get(b.id) || 0;
      return uA - uB;
    });

    const lastCardId = queue[queue.length - 1];
    const pick =
      candidates.find(c => !queue.length || c.id !== lastCardId) || candidates[0];

    if (!pick) break;
    queue.push(pick.id);
    used.set(pick.id, (used.get(pick.id) || 0) + 1);
  }

  return queue;
}

export interface ConfusionPair {
  pair: string;
  noteA: NoteName;
  noteB: NoteName;
  count: number;
}

export function topConfusionPairs(
  reviewLogs: readonly { kind: string; note: NoteName; answer?: NoteName | null }[],
  minCount = 2,
  limit = 500
): ConfusionPair[] {
  const allowed = new Set(['scheduled', 'new', 'cold']);
  const events = reviewLogs
    .filter(e => allowed.has(e.kind) && e.note && e.answer && e.note !== e.answer)
    .slice(-limit);

  const pairs = new Map<string, { noteA: NoteName; noteB: NoteName; count: number }>();
  for (const e of events) {
    const a = e.note;
    const b = e.answer!;
    const sorted = [a, b].sort();
    const key = `${sorted[0]}↔${sorted[1]}`;
    const cur = pairs.get(key) || { noteA: sorted[0] as NoteName, noteB: sorted[1] as NoteName, count: 0 };
    cur.count++;
    pairs.set(key, cur);
  }

  return [...pairs.entries()]
    .map(([pair, data]) => ({ pair, ...data }))
    .filter(x => x.count >= minCount)
    .sort((a, b) => b.count - a.count);
}

export function chooseConfusionPractice(
  cards: readonly Card[],
  reviewLogs: readonly { kind: string; note: NoteName; answer?: NoteName | null }[],
  recentCards: readonly Card[],
  lastConfusionTrial = -99,
  sessionTrials = 0,
  confusionReviews = 0
): Card | null {
  if (confusionReviews >= 4 || (sessionTrials - lastConfusionTrial < 3)) return null;

  const top = topConfusionPairs(reviewLogs, 2);
  if (!top.length) return null;

  const currentNotes = new Set(cards.map(c => c.note));
  const pair = top.find(x => currentNotes.has(x.noteA) && currentNotes.has(x.noteB));
  if (!pair) return null;

  const last = recentCards[0];
  const target = last?.note === pair.noteA ? pair.noteB : pair.noteA;
  const options = cards.filter(
    c => c.note === target && (c.skill === 'find' || c.skill === 'identify')
  );
  if (!options.length) return null;

  const sorted = [...options].sort(
    (x, y) => diversityPenalty(x, recentCards) - diversityPenalty(y, recentCards)
  );
  return sorted[0] ?? null;
}
