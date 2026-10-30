import { describe, expect, test } from 'bun:test';
import { ReleaseWatch } from '../release-watch';

/** A run that reports the given statuses one poll at a time, then the last one for good. */
const runThrough = (statuses: Array<{ status: string; conclusion?: string }>) => {
  let poll = 0;
  return async () => statuses[Math.min(poll++, statuses.length - 1)];
};

describe('ReleaseWatch.run', () => {
  test('returns the conclusion of a run that completes', async () => {
    const conclusion = await ReleaseWatch.run({
      view: runThrough([
        { status: 'queued' },
        { status: 'in_progress' },
        { status: 'completed', conclusion: 'success' },
      ]),
      sleep: async () => {},
      onWaiting: () => {},
    });

    expect(conclusion).toBe('success');
  });

  test('keeps waiting through a run that waits for approval, however long, and reports the wait once', async () => {
    const waits: number[] = [];
    const polls = 5_000;
    const statuses = [
      { status: 'in_progress' },
      ...Array.from({ length: polls }, () => ({ status: 'waiting' })),
      { status: 'in_progress' },
      { status: 'completed', conclusion: 'success' },
    ];
    let slept = 0;

    const conclusion = await ReleaseWatch.run({
      view: runThrough(statuses),
      sleep: async (milliseconds) => {
        slept += milliseconds;
      },
      onWaiting: () => waits.push(1),
    });

    expect(conclusion).toBe('success');
    expect(waits).toHaveLength(1);
    expect(slept).toBeGreaterThan(polls * 1_000);
  });

  test('reports a second wait after the run left the first one', async () => {
    const waits: number[] = [];

    await ReleaseWatch.run({
      view: runThrough([
        { status: 'waiting' },
        { status: 'in_progress' },
        { status: 'waiting' },
        { status: 'completed', conclusion: 'success' },
      ]),
      sleep: async () => {},
      onWaiting: () => waits.push(1),
    });

    expect(waits).toHaveLength(2);
  });

  test('returns a failed conclusion as it is', async () => {
    const conclusion = await ReleaseWatch.run({
      view: runThrough([{ status: 'completed', conclusion: 'failure' }]),
      sleep: async () => {},
      onWaiting: () => {},
    });

    expect(conclusion).toBe('failure');
  });
});
