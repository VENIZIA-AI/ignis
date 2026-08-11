import type { IExtraOptions } from '@/base/repositories/common';
import type { IPostgresDataSource } from '@/connectors/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/connectors/postgres/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import { PersistableRelationalRepository } from '@/connectors/relational/repositories/core/persistable';

/** Postgres binding of `PersistableRelationalRepository` - full CRUD on top of the readable surface. */
export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
  TDataSource extends IRelationalDataSource = IPostgresDataSource,
> extends PersistableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
