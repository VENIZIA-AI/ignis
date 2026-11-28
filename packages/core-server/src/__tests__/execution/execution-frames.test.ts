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

  test('a mode that is not one of the two is refused', async () => {
    for (const mode of ['System', undefined]) {
      const run: unknown = Reflect.get(Execution, 'run');
      const failure = await failureOf(async () => {
        if (typeof run === 'function') {
          await Reflect.apply(run, Execution, [{ mode, task: () => undefined }]);
        }
      });

      expect(failure).toContain('mode');
    }
  });

  test('a reason that is not a string is refused by the framework', async () => {
    const run: unknown = Reflect.get(Execution, 'run');
    const failure = await failureOf(async () => {
      if (typeof run === 'function') {
        await Reflect.apply(run, Execution, [
          { mode: ExecutionModes.SYSTEM, reason: 7, task: () => undefined },
        ]);
      }
    });

    expect(failure).toContain('reason that is not blank');
  });

  test('a framework frame that is system without a reason is refused', async () => {
    const failure = await failureOf(async () => {
      ExecutionFrames.run({
        frame: { mode: ExecutionModes.SYSTEM, values: {} },
        task: () => undefined,
      });
    });

    expect(failure).toContain('reason');
  });

  test('values are frozen deeply, and the caller keeps its own', async () => {
    const mine = { tags: ['a'] };
    const options: Parameters<typeof Execution.run<void>>[0] = {
      mode: ExecutionModes.SCOPED,
      task: () => {
        const tags: unknown = Reflect.get(Execution.current()?.values ?? {}, 'tags');

        expect(Object.isFrozen(tags)).toBe(true);
        expect(tags).not.toBe(mine.tags);
      },
    };
    Reflect.set(options, 'values', mine);
    await Execution.run(options);

    expect(Object.isFrozen(mine.tags)).toBe(false);
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
