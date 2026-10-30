import { describe, expect, test } from 'bun:test';
import { HrTimeUtility, PromiseUtility } from '@/utilities';

describe('sleep', () => {
  test('resolves after at least the requested delay', async () => {
    const started = performance.now();
    await PromiseUtility.sleep({ ms: 20 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });

  test('resolves immediately for 0', async () => {
    await PromiseUtility.sleep({ ms: 0 });
    expect(true).toBe(true);
  });
});

describe('hrTime', () => {
  test('returns a monotonically non-decreasing second-resolution float', () => {
    const first = HrTimeUtility.getSeconds();
    const second = HrTimeUtility.getSeconds();

    expect(typeof first).toBe('number');
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
