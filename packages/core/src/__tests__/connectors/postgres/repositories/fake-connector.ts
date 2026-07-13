import type { AnyType } from '@venizia/ignis-helpers';

/**
 * Minimal chainable fake standing in for `connector.insert/update/delete(...)`. Only the
 * `shouldReturn: false` path is exercised by its consumers, so each chain need only resolve
 * when awaited - no `.returning()` is ever called on it.
 */
export const buildFakeConnector = (opts: { result: unknown }): AnyType => {
  const { result } = opts;

  return {
    insert: () => ({ values: () => Promise.resolve(result) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(result) }) }),
    delete: () => ({ where: () => Promise.resolve(result) }),
  };
};
