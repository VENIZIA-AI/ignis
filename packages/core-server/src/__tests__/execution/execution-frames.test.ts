import { ExecutionRunner } from '@/base/execution';
import { Execution, ExecutionModes } from '@/helpers';
import { ExecutionFrames } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

ExecutionRunner.install();

const failureOf = async (call: () => Promise<unknown>) => {
  const [outcome] = await Promise.allSettled([call()]);

  return outcome.status === 'rejected' ? String(outcome.reason) : undefined;
};

describe('the frames of ExecutionRunner', () => {
  test('a scoped frame carries its mode, user and values, and ends with its task', async () => {
    const frame = await Execution.run({
      mode: ExecutionModes.SCOPED,
      userId: 7,
      task: () => Execution.current(),
    });

    expect(frame).toEqual({ mode: ExecutionModes.SCOPED, userId: 7, values: {} });
    expect(Execution.current()).toBeUndefined();
  });

  test('a nested frame inherits request, user and values, never the mode or the reason', async () => {
    // What the runner reads off a request: its variables.
    const request = { get: () => undefined };
    const inner = await ExecutionFrames.run({
      frame: { mode: ExecutionModes.SYSTEM, reason: 'outer', request, userId: 1, values: {} },
      task: () => Execution.run({ mode: ExecutionModes.SCOPED, task: () => Execution.current() }),
    });

    expect(inner).toEqual({ mode: ExecutionModes.SCOPED, request, userId: 1, values: {} });
  });

  test('a system frame has its reason, and may name the user', async () => {
    const frame = await Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'reaper',
      userId: 'cron',
      task: () => Execution.current(),
    });

    expect(frame).toEqual({
      mode: ExecutionModes.SYSTEM,
      reason: 'reaper',
      userId: 'cron',
      values: {},
    });
  });

  test('a blank reason refuses before the task runs', async () => {
    let isRun = false;

    for (const reason of ['', '   ']) {
      const failure = await failureOf(() =>
        Execution.run({ mode: ExecutionModes.SYSTEM, reason, task: () => (isRun = true) }),
      );

      expect(failure).toContain('reason');
    }

    expect(isRun).toBe(false);
  });

  test('a root frame inherits nothing', async () => {
    const root = await ExecutionFrames.run({
      frame: { mode: ExecutionModes.SCOPED, request: {}, userId: 1, values: {} },
      task: () =>
        Execution.run({
          mode: ExecutionModes.SCOPED,
          isRoot: true,
          task: () => Execution.current(),
        }),
    });

    expect(root).toEqual({ mode: ExecutionModes.SCOPED, values: {} });
  });

  test('a frame cannot be changed by the task that reads it', async () => {
    const frame = await Execution.run({
      mode: ExecutionModes.SCOPED,
      task: () => Execution.current(),
    });

    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame?.values)).toBe(true);
  });

  test('concurrent runs never read each other', async () => {
    const users = Array.from({ length: 200 }, (_value, index) => index);
    const seen = await Promise.all(
      users.map((userId) =>
        Execution.run({
          mode: ExecutionModes.SCOPED,
          userId,
          task: async () => {
            await Execution.sleep({ ms: userId % 5 });

            return Execution.current()?.userId;
          },
        }),
      ),
    );

    expect(seen).toEqual(users);
  });
});
