import type { IExtraOptions } from '@/base/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import { PersistableRelationalRepository } from '@/connectors/relational/repositories/core/persistable';
import type { ISqliteDataSource } from '@/connectors/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/connectors/sqlite/repositories/common';

/**
 * SQLite binding of `PersistableRelationalRepository` - full CRUD on top of the readable surface.
 */
export class PersistableSqliteRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = ISqliteExtraOptions,
  TDataSource extends IRelationalDataSource = ISqliteDataSource,
> extends PersistableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
