import { ExecutionRunner } from '@/base/execution';
import { Execution, ExecutionModes } from '@/helpers';
import { ExecutionFrames } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

ExecutionRunner.install();

const asSystem = <Result>(task: () => Result) =>
  Execution.run({ mode: ExecutionModes.SYSTEM, reason: 'entry test', userId: 'starter', task });

describe('a listener of the framework', () => {
  test('reads a root frame: no system rights, no identity of whoever registered or emitted', async () => {
    const listener = await asSystem(() =>
      ExecutionFrames.listener({ handler: () => Execution.current() }),
    );
    const frame = await asSystem(() => listener());

    expect(frame).toEqual({ mode: ExecutionModes.SCOPED, values: {} });
  });

  test('keeps its arguments, its receiver, its return value and its synchronous throw', () => {
    const listener = ExecutionFrames.listener({
      handler: function (this: { base: number }, left: number, right: number) {
        if (left < 0) {
          throw new RangeError('negative');
        }

        return this.base + left + right;
      },
    });
    const holder = { base: 100, listener };

    expect(holder.listener(1, 2)).toBe(103);
    expect(() => holder.listener(-1, 0)).toThrow('negative');
  });

  test('names the user it runs for, read at each call', () => {
    let current: string | undefined = 'a';
    const listener = ExecutionFrames.listener({
      userId: () => current,
      handler: () => Execution.current()?.userId,
    });

    expect(listener()).toBe('a');
    current = 'b';
    expect(listener()).toBe('b');
  });
});

describe('a hand-off', () => {
  test('carries the user and the values captured when it was made, and drops system rights', async () => {
    const bound = await asSystem(() => ({ run: ExecutionFrames.handOff({ name: 'probe' }) }));
    const frame = await Execution.run({
      mode: ExecutionModes.SCOPED,
      userId: 'later',
      task: () => bound.run(() => Execution.current()),
    });

    expect(frame).toEqual({ mode: ExecutionModes.SCOPED, userId: 'starter', values: {} });
  });

  test('keeps the request only when asked to', () => {
    const request = { get: () => undefined };
    const [kept, dropped] = ExecutionFrames.run({
      frame: { mode: ExecutionModes.SCOPED, request, values: {} },
      task: () => [
        ExecutionFrames.handOff({ name: 'event', isRequestKept: true }),
        ExecutionFrames.handOff({ name: 'queue' }),
      ],
    });

    expect(kept(() => Execution.current()?.request)).toBe(request);
    expect(dropped(() => Execution.current()?.request)).toBeUndefined();
  });
});
