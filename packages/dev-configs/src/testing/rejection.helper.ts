import { expect } from 'bun:test';

export class RejectionHelper {
  /**
   * Awaits a task that must reject and returns what it rejected with; throws when the task resolves.
   *
   * bun types the async matchers (`expect(task).rejects` / `.resolves`) as `void`, so
   * `await expect(task).rejects.toThrow()` is refused by `await-thenable` - and left un-awaited the
   * assertion never runs. Awaiting the task itself needs no matcher and no cast:
   * `RejectionHelper.expectRejection({ task, message })` or
   * `expect(await RejectionHelper.rejectionOf({ task })).toBeInstanceOf(Error)`,
   * and for a resolution `expect(await task).toMatchObject(...)`.
   */
  static async rejectionOf(opts: { task: Promise<unknown> }): Promise<unknown> {
    try {
      await opts.task;
    } catch (error) {
      return error;
    }

    return expect.unreachable('Expected the task to reject, but it resolved');
  }

  /**
   * The task rejects with an Error whose message contains `message` (a string) or matches it (a
   * RegExp). The message is compared as a string on purpose: bun 1.4.2 `toMatchObject` with an
   * asymmetric matcher overwrites the matched property on the object it checks, so a later read of
   * `error.message` gets the matcher back.
   */
  static async expectRejection(opts: {
    task: Promise<unknown>;
    message: string | RegExp;
  }): Promise<void> {
    const { task, message } = opts;
    const reason = await RejectionHelper.rejectionOf({ task });

    expect(reason).toBeInstanceOf(Error);
    expect(reason instanceof Error ? reason.message : String(reason)).toMatch(message);
  }
}

/** @deprecated Use `RejectionHelper.rejectionOf({ task })`. Removed in 0.5. */
export const rejectionOf = async (task: Promise<unknown>): Promise<unknown> =>
  RejectionHelper.rejectionOf({ task });

/** @deprecated Use `RejectionHelper.expectRejection({ task, message })`. Removed in 0.5. */
export const expectRejection = async (opts: {
  task: Promise<unknown>;
  message: string | RegExp;
}): Promise<void> => RejectionHelper.expectRejection(opts);
