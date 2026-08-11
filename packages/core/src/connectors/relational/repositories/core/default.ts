import type { IExtraOptions } from '@/base/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import type { IRelationalExtraOptions } from '../common';
import { PersistableRelationalRepository } from './persistable';

/** Recommended base class for most repositories - full CRUD. Engine-neutral: an engine binds `ExtraOptions` and `TDataSource` by subclassing, the way `DefaultCRUDRepository` does for Postgres. */
export class DefaultRelationalRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
  TDataSource extends IRelationalDataSource = IRelationalDataSource,
> extends PersistableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
