import type { IExtraOptions } from '@/base/repositories/common';
import type { IPostgresDataSource } from '@/connectors/postgres/datasources';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/connectors/postgres/models';
import type { IDatabaseExtraOptions } from '@/connectors/postgres/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type { TDeletedAtColumn } from '@/connectors/relational/repositories/core/soft-deletable';
import { SoftDeletableRelationalRepository } from '@/connectors/relational/repositories/core/soft-deletable';

/** The `deletedAt` column bound is engine-neutral; re-exported so the historical import path keeps resolving. */
export type { TDeletedAtColumn } from '@/connectors/relational/repositories/core/soft-deletable';

/**
 * Postgres binding, declared here rather than re-exported from the neutral tier: this barrel also
 * exports the `PgTable`-branded `TTableObject` / `TTableInsert`, and re-exporting the `Table`-branded
 * neutral schema makes the two uncomposable. A consumer writing
 * `type TArchivable = TSoftDeletableTableSchema & {...}` and feeding it to `TTableObject<TArchivable>`
 * then fails with TS2344 - which is exactly how this broke a downstream application once.
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
