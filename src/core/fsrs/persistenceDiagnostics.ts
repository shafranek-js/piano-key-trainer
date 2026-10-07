/**
 * Bounded, UI-safe diagnostics for the review persistence boundary.
 * These records never include browser/storage internals or user content.
 */
export interface PersistenceDiagnosticEntry {
  at: number;
  reviewEventId: string | null;
  questionInstanceId: string | null;
  cardId: string | null;
  commitAttempt: number;
  commitStatus: 'persisted' | 'duplicate_rejected' | 'failed' | 'retry_succeeded' | 'retry_failed';
  errorClass: string | null;
  retryCount: number;
  persistedAt: number | null;
}

/** Failed non-FSRS statistics writes (Cold Test history, lesson progress). */
export interface StorageWriteFailure {
  at: number;
  store: string;
  errorClass: string;
}
