import { describe, expect, test } from 'bun:test';
import type { IExtraOptions } from '@/base/repositories/common';
import type { TSoftDeletableTableSchema, TTableInsert, TTableObject } from '@/connectors';
import { SoftDeletableRepository } from '@/connectors';

/** The downstream pattern, reproduced verbatim: intersect the soft-deletable schema, then feed it to the barrel's row types. */
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
 * The root barrel must stay internally composable. `@/connectors` re-exports the Postgres tier, so
 * the `TSoftDeletableTableSchema` it serves has to be branded the same way as the `TTableObject` /
 * `TTableInsert` beside it. Re-exporting the neutral `Table`-branded schema instead leaves the two
 * uncomposable, and a consumer that intersects the schema then feeds it to `TTableObject` fails with
 * TS2344 - which is how this reached a downstream application undetected. `bun test` cannot see any
 * of this; `bun run typecheck` is the gate. Reverting the Postgres declaration to a re-export
 * produces six TS2344 errors in this file.
 */
describe('root barrel composability', () => {
  test('a downstream schema intersection still composes with the barrel row types', () => {
    const repository = buildArchivableRepositoryShape();

    expect(typeof repository).toBe('function');
  });
});
