import type { IExtraOptions } from '@/base/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import { DefaultRelationalRepository } from '@/connectors/relational/repositories/core/default';
import type { ISqliteDataSource } from '@/connectors/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/connectors/sqlite/repositories/common';

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
