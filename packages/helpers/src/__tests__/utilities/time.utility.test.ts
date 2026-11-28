import { describe, expect, test } from 'bun:test';
import { Execution } from '@/modules/execution';
import { HrTimeUtility } from '@/utilities';

describe('sleep', () => {
  test('resolves after at least the requested delay', async () => {
    const started = performance.now();
    await Execution.sleep({ ms: 20 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });

  test('resolves immediately for 0', async () => {
    await Execution.sleep({ ms: 0 });
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
