import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { DefaultRelationalRepository } from '@/relational/core/repositories/core/default';
import type { ISqliteDataSource } from '@/relational/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';

/**
 * SQLite binding of `DefaultRelationalRepository` - the
 * recommended base class for most SQLite repositories.
 */
export class DefaultSqliteRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = ISqliteExtraOptions,
  TDataSource extends IRelationalDataSource = ISqliteDataSource,
> extends DefaultRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
