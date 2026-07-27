import type { AnyType } from '@venizia/ignis-helpers';

/** Minimal chainable fake for `connector.insert/update/delete(...)`. Consumers only exercise the `shouldReturn: false` path, so each chain need only resolve when awaited - no `.returning()`. */
export const buildFakeConnector = (opts: { result: unknown }): AnyType => {
  const { result } = opts;

  return {
    insert: () => ({ values: () => Promise.resolve(result) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(result) }) }),
    delete: () => ({ where: () => Promise.resolve(result) }),
  };
};
