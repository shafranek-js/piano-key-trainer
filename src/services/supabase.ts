import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from '../storage/db';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SyncResult {
  syncedCards: number;
  syncedLogs: number;
}

export async function syncLocalToCloud(): Promise<SyncResult | null> {
  if (!supabase) return null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // 1. Sync cards
    const localCards = await db.cards.toArray();
    if (localCards.length) {
      const cardsPayload = localCards.map(c => ({
        user_id: user.id,
        card_id: c.id,
        skill: c.skill,
        note: c.note,
        stability: c.stability,
        difficulty: c.difficulty,
        due_at: c.dueAt ? new Date(c.dueAt).toISOString() : null,
        last_review_at: c.lastReviewAt ? new Date(c.lastReviewAt).toISOString() : null,
        reps: c.reps,
        lapses: c.lapses,
        memory_state: c.memoryState,
        stats: c.stats
      }));

      await supabase.from('cards').upsert(cardsPayload, { onConflict: 'user_id,card_id' });
    }

    // 2. Sync review logs
    const localLogs = await db.reviewLogs.toArray();
    if (localLogs.length) {
      const logsPayload = localLogs.map(l => ({
        user_id: user.id,
        ts: new Date(l.ts).toISOString(),
        session_id: l.sessionId,
        card_id: l.cardId,
        skill: l.skill,
        note: l.note,
        kind: l.kind,
        grade: l.grade,
        first_correct: l.firstCorrect,
        response_ms: l.responseMs,
        retrievability_before: l.retrievabilityBefore,
        stability_before: l.stabilityBefore,
        stability_after: l.stabilityAfter,
        difficulty_before: l.difficultyBefore,
        difficulty_after: l.difficultyAfter
      }));

      await supabase.from('review_logs').upsert(logsPayload, { onConflict: 'user_id,ts' });
    }

    return {
      syncedCards: localCards.length,
      syncedLogs: localLogs.length
    };
  } catch (err) {
    console.error('Supabase synchronization error', err);
    return null;
  }
}
