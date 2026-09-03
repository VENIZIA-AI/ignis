import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IPostgresDataSource } from '@/relational/postgres/datasources';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/postgres/models';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TDeletedAtColumn } from '@/relational/core/repositories/core/soft-deletable';
import { SoftDeletableRelationalRepository } from '@/relational/core/repositories/core/soft-deletable';

/** The `deletedAt` column bound is engine-neutral; re-exported so the postgres path keeps resolving. */
export type { TDeletedAtColumn } from '@/relational/core/repositories/core/soft-deletable';

/**
 * Declared here rather than re-exported from the neutral tier: this barrel also exports the
 * `PgTable`-branded `TTableObject` / `TTableInsert`, and the `Table`-branded neutral schema is
 * uncomposable with them - `TTableObject<TSoftDeletableTableSchema & {...}>` fails with TS2344.
 */
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/** Postgres binding of `SoftDeletableRelationalRepository` - soft-deletes by setting `deletedAt` instead of physically removing rows. */
export class SoftDeletableRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
  TDataSource extends IRelationalDataSource = IPostgresDataSource,
> extends SoftDeletableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
