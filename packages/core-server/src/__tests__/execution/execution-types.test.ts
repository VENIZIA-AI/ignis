import { Execution, ExecutionModes, ExecutionRunner } from '@/index';
import type {} from '@venizia/ignis';
import { describe, expect, test } from 'bun:test';

declare module '@venizia/ignis' {
  interface IExecutionValues {
    tenantIds?: string[];
  }
}

/** Compile checks: each expected error is a call an application must not be able to write. */
const refused = async (mode: 'scoped' | 'system') => {
  const task = () => undefined;

  // @ts-expect-error a system run needs a reason
  await Execution.run({ mode: ExecutionModes.SYSTEM, task });
  // @ts-expect-error a system run takes no values
  await Execution.run({ mode: ExecutionModes.SYSTEM, reason: 'r', values: {}, task });
  // @ts-expect-error a scoped run takes no reason
  await Execution.run({ mode: ExecutionModes.SCOPED, reason: 'r', task });
  // @ts-expect-error only a declared value key
  await Execution.run({ mode: ExecutionModes.SCOPED, values: { merchantId: 'a' }, task });
  // @ts-expect-error a declared key keeps its type
  await Execution.run({ mode: ExecutionModes.SCOPED, values: { tenantIds: 'a' }, task });
  // @ts-expect-error a mode decided at run time names no set of parameters
  await Execution.run({ mode, reason: 'r', task });
};

describe('the types of Execution.run through the framework entry point', () => {
  ExecutionRunner.install();

  test('a declared value travels with the frame', async () => {
    const tenantIds = await Execution.run({
      mode: ExecutionModes.SCOPED,
      values: { tenantIds: ['a'] },
      task: () => Execution.current()?.values.tenantIds,
    });

    expect(tenantIds).toEqual(['a']);
    expect(typeof refused).toBe('function');
  });
});
