import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { RelationalBaseRepository } from '@/relational/core/repositories/core/base';
import type { ISqliteDataSource } from '@/relational/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';

/**
 * SQLite binding of `RelationalBaseRepository`: rebinds the two engine-facing
 * defaults so a single-argument subclass resolves `connector` to an async
 * `BaseSQLiteDatabase` and needs no cast on `options.transaction.connector`.
 */
export abstract class SqliteBaseRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = ISqliteExtraOptions,
  TDataSource extends IRelationalDataSource = ISqliteDataSource,
> extends RelationalBaseRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
