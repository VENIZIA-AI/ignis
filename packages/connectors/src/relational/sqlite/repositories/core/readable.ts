import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { ReadableRelationalRepository } from '@/relational/core/repositories/core/readable';
import type { ISqliteDataSource } from '@/relational/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';

/** SQLite binding of `ReadableRelationalRepository` - read-only, write operations throw. */
export class ReadableSqliteRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = ISqliteExtraOptions,
  TDataSource extends IRelationalDataSource = ISqliteDataSource,
> extends ReadableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
