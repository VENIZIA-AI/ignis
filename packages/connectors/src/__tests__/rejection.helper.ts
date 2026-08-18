import type { AnyType } from '@venizia/ignis-helpers/common';
import { expect } from 'bun:test';

/**
 * bun types the async matchers as `void`, so a bare `await expect(...).rejects.toThrow()` is
 * refused by `@typescript-eslint/await-thenable` - and left un-awaited the assertion never runs.
 * The cast restores the promise the matcher actually returns.
 */
export const expectRejection = async (opts: {
  task: Promise<unknown>;
  message: string | RegExp;
}): Promise<void> => {
  const { task, message } = opts;

  await (expect(task).rejects.toThrow(message) as AnyType);
};
