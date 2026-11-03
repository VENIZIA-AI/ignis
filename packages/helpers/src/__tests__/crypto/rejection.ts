/**
 * What an async call rejects with, read by awaiting it. `await expect(promise).rejects.toThrow()` is typed
 * as a plain value, which `await-thenable` refuses; without the `await` the assertion may run after the
 * test has ended. This awaits the promise itself, so the assertion that follows always runs in time.
 */
export class Rejection {
  /** The message of the error the promise rejected with, or `undefined` when it resolved (so a `toMatch` or `toBeString` on it fails). */
  static async messageOf(opts: { promise: Promise<unknown> }): Promise<string | undefined> {
    try {
      await opts.promise;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    return undefined;
  }
}
