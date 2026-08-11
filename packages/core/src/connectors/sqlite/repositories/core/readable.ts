import type { IExtraOptions } from '@/base/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import { ReadableRelationalRepository } from '@/connectors/relational/repositories/core/readable';
import type { ISqliteDataSource } from '@/connectors/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/connectors/sqlite/repositories/common';

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
