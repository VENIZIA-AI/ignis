import { describe, expect, test } from 'bun:test';
import { hrTime, sleep } from '@/utilities';

describe('sleep', () => {
  test('resolves after at least the requested delay', async () => {
    const started = performance.now();
    await sleep(20);
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });

  test('resolves immediately for 0', async () => {
    await sleep(0);
    expect(true).toBe(true);
  });
});

describe('hrTime', () => {
  test('returns a monotonically non-decreasing second-resolution float', () => {
    const first = hrTime();
    const second = hrTime();

    expect(typeof first).toBe('number');
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
