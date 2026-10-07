import type { StorageWriteFailure } from '../core/fsrs/persistenceDiagnostics';

export type StorageWriteFailureReporter = (entry: StorageWriteFailure) => void;

export function defaultErrorClassName(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error';
  return typeof error;
}

/**
 * Runs a non-FSRS statistics write (Cold Test history, lesson progress) so a failure is
 * caught, reported through the bounded diagnostics list, and never becomes an unhandled
 * rejection. It never blocks the training flow.
 */
export async function guardedStatisticsWrite(
  store: string,
  operation: () => Promise<unknown>,
  report: StorageWriteFailureReporter
): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    report({
      at: Date.now(),
      store,
      errorClass: defaultErrorClassName(error)
    });
    return false;
  }
}
