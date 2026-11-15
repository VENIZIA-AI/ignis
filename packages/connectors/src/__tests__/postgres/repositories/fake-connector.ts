import { DuckTypingUtility } from '@/common/internal';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';

/** The write verbs a fake chain carries, stated as a guard so it can be handed over as a connector. */
const isConnector = (value: unknown): value is TRelationalConnector =>
  DuckTypingUtility.hasMembers({
    value,
    members: { insert: 'function', update: 'function', delete: 'function' },
  });

/** Minimal chainable fake for `connector.insert/update/delete(...)`. Consumers only exercise the `shouldReturn: false` path, so each chain need only resolve when awaited - no `.returning()`. */
export const buildFakeConnector = (opts: { result: unknown }): TRelationalConnector => {
  const { result } = opts;

  const connector = {
    insert: () => ({ values: () => Promise.resolve(result) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(result) }) }),
    delete: () => ({ where: () => Promise.resolve(result) }),
  };

  if (!isConnector(connector)) {
    throw new Error('[buildFakeConnector] The fake lacks insert/update/delete');
  }

  return connector;
};
