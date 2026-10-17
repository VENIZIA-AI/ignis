import { expect } from 'bun:test';

/**
 * Awaits a task that must reject and returns what it rejected with; throws when the task resolves.
 *
 * bun types the async matchers (`expect(task).rejects` / `.resolves`) as `void`, so
 * `await expect(task).rejects.toThrow()` is refused by `await-thenable` - and left un-awaited the
 * assertion never runs. Awaiting the task itself needs no matcher and no cast:
 * `expectRejection({ task, message })` or `expect(await rejectionOf(task)).toBeInstanceOf(Error)`,
 * and for a resolution `expect(await task).toMatchObject(...)`.
 */
export const rejectionOf = async (task: Promise<unknown>): Promise<unknown> => {
  try {
    await task;
  } catch (error) {
    return error;
  }

  return expect.unreachable('Expected the task to reject, but it resolved');
};

/**
 * The task rejects with an Error whose message contains `message` (a string) or matches it (a
 * RegExp). The message is compared as a string on purpose: bun 1.4.2 `toMatchObject` with an
 * asymmetric matcher overwrites the matched property on the object it checks, so a later read of
 * `error.message` gets the matcher back.
 */
export const expectRejection = async (opts: {
  task: Promise<unknown>;
  message: string | RegExp;
}): Promise<void> => {
  const { task, message } = opts;
  const reason = await rejectionOf(task);

  expect(reason).toBeInstanceOf(Error);
  expect(reason instanceof Error ? reason.message : String(reason)).toMatch(message);
};
