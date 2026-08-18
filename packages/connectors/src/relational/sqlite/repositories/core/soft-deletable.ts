import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TDeletedAtColumn } from '@/relational/core/repositories/core/soft-deletable';
import { SoftDeletableRelationalRepository } from '@/relational/core/repositories/core/soft-deletable';
import type { ISqliteDataSource } from '@/relational/sqlite/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/sqlite/models';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';

/**
 * The `deletedAt` column bound is engine-neutral; re-exported so the sqlite path keeps resolving.
 */
export type { TDeletedAtColumn } from '@/relational/core/repositories/core/soft-deletable';

/**
 * Declared here rather than re-exported from the neutral tier: this barrel also exports the
 * `SQLiteTable`-branded `TTableObject` / `TTableInsert`, and the `Table`-branded neutral schema is
 * uncomposable with them - `TTableObject<TSoftDeletableTableSchema & {...}>` fails with TS2344.
 */
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/**
 * SQLite binding of `SoftDeletableRelationalRepository` - soft-deletes by setting
 * `deletedAt` instead of physically removing rows. SQLite has no `timestamptz`,
 * so the column is the ISO 8601 UTC `text` the tz enricher builds.
 */
export class SoftDeletableSqliteRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = ISqliteExtraOptions,
  TDataSource extends IRelationalDataSource = ISqliteDataSource,
> extends SoftDeletableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
