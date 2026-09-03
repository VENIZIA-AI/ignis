import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { PersistableRelationalRepository } from '@/relational/core/repositories/core/persistable';
import type { ISqliteDataSource } from '@/relational/sqlite/datasources/common';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';

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
