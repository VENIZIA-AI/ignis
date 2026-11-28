import {
  Execution,
  ExecutionFrames,
  ExecutionModes,
  type IExecutionFrame,
  type IExecutionRunner,
} from '@/modules/execution';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

/** A runner that records what it is asked for. The real one is the server layer's. */
const buildRunner = (opts: { calls: string[]; userId: number }): IExecutionRunner => {
  const frame: IExecutionFrame = { mode: ExecutionModes.SCOPED, userId: opts.userId, values: {} };

  return {
    read: () => frame,
    capture: () => ({ values: {} }),
    run: async (options) => {
      opts.calls.push(`run ${options.mode}`);

      return options.task();
    },
    runFrame: async (options) => {
      opts.calls.push(`frame ${options.frame.mode}`);

      return options.task();
    },
  };
};

/** No application can empty the slot; a test must. */
const empty = () => {
  globalThis.ignisExecutionRunner = undefined;
};

let before: IExecutionRunner | undefined;

beforeEach(() => {
  before = globalThis.ignisExecutionRunner;
  empty();
});

afterEach(() => {
  globalThis.ignisExecutionRunner = before;
});

const failureOf = async (call: () => Promise<unknown>) => {
  const [outcome] = await Promise.allSettled([call()]);

  return outcome.status === 'rejected' ? String(outcome.reason) : undefined;
};

describe('Execution without a runner', () => {
  test('run refuses and names the fix, and current answers nothing', async () => {
    let isRun = false;
    const failure = await failureOf(() =>
      Execution.run({ mode: ExecutionModes.SCOPED, task: () => (isRun = true) }),
    );

    expect(failure).toContain('ExecutionRunner.install()');
    expect(isRun).toBe(false);
    expect(Execution.current()).toBeUndefined();
    expect(ExecutionFrames.isInstalled()).toBe(false);
  });

  test('a framework frame passes through: the task runs as it is', async () => {
    const answer = await ExecutionFrames.run({
      frame: { mode: ExecutionModes.SCOPED, values: {} },
      task: () => Execution.current() ?? 'unframed',
    });

    expect(answer).toBe('unframed');
  });
});

describe('Execution with a runner', () => {
  test('run, a framework frame and current go to the runner, and the first one installed stays', async () => {
    const calls: string[] = [];
    Execution.setRunner({ runner: buildRunner({ calls, userId: 1 }) });
    Execution.setRunner({ runner: buildRunner({ calls, userId: 2 }) });

    await Execution.run({ mode: ExecutionModes.SCOPED, task: () => undefined });
    await ExecutionFrames.run({
      frame: { mode: ExecutionModes.SYSTEM, values: {} },
      task: () => undefined,
    });

    expect(calls).toEqual(['run scoped', 'frame system']);
    expect(Execution.current()?.userId).toBe(1);
  });
});
