import { describe, expect, test } from 'bun:test';
import type { IExtraOptions } from '@/base/repositories/common';
import type { TSoftDeletableTableSchema, TTableInsert, TTableObject } from '@/connectors';
import { SoftDeletableRepository } from '@/connectors';

/** The consumer shape: intersect the soft-deletable schema, then feed it to the barrel row types. */
type TArchivableTableSchema = TSoftDeletableTableSchema & {
  status: unknown;
};

interface IArchivableExtraOptions extends IExtraOptions {
  shouldIncludeArchived?: boolean;
}

const buildArchivableRepositoryShape = () => {
  class ArchivedRepository<
    EntitySchema extends TArchivableTableSchema = TArchivableTableSchema,
    DataObject extends TTableObject<EntitySchema> & { status: string } =
      TTableObject<EntitySchema> & {
        status: string;
      },
    PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
    ExtraOptions extends IArchivableExtraOptions = IArchivableExtraOptions,
  > extends SoftDeletableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}

  return ArchivedRepository;
};

/**
 * `@/connectors` re-exports the Postgres tier, so the `TSoftDeletableTableSchema` it serves must
 * carry the same brand as the `TTableObject` / `TTableInsert` beside it. Re-exporting the neutral
 * `Table`-branded schema instead leaves them uncomposable and fails with TS2344. `bun test` cannot
 * see any of this - `bun run typecheck` is the gate.
 */
describe('root barrel composability', () => {
  test('a downstream schema intersection still composes with the barrel row types', () => {
    const repository = buildArchivableRepositoryShape();

    expect(typeof repository).toBe('function');
  });
});
