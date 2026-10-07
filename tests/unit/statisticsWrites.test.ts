import { describe, expect, it } from 'vitest';
import { guardedStatisticsWrite } from '../../src/storage/guardedWrite';
import type { StorageWriteFailure } from '../../src/core/fsrs/persistenceDiagnostics';

describe('guardedStatisticsWrite', () => {
  it('reports a failed Cold Test statistics write without throwing', async () => {
    const failures: StorageWriteFailure[] = [];
    const quotaError = new DOMException('quota exceeded', 'QuotaExceededError');

    const ok = await guardedStatisticsWrite(
      'coldTests',
      async () => { throw quotaError; },
      entry => failures.push(entry)
    );

    expect(ok).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0].store).toBe('coldTests');
    expect(failures[0].errorClass).toBe('QuotaExceededError');
  });

  it('reports a failed lesson progress write without throwing', async () => {
    const failures: StorageWriteFailure[] = [];

    const ok = await guardedStatisticsWrite(
      'lessonProgress',
      async () => { throw new Error('transaction aborted'); },
      entry => failures.push(entry)
    );

    expect(ok).toBe(false);
    expect(failures[0].store).toBe('lessonProgress');
    expect(failures[0].errorClass).toBe('Error');
  });

  it('stays silent on success and never reports a failure', async () => {
    const failures: StorageWriteFailure[] = [];
    let calls = 0;
    const ok = await guardedStatisticsWrite(
      'coldTests',
      async () => { calls += 1; },
      entry => failures.push(entry)
    );
    expect(ok).toBe(true);
    expect(calls).toBe(1);
    expect(failures).toHaveLength(0);
  });
});
