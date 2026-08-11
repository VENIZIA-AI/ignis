import type { IExtraOptions } from '@/base/repositories/common';
import type { IPostgresDataSource } from '@/connectors/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/connectors/postgres/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import { DefaultRelationalRepository } from '@/connectors/relational/repositories/core/default';

/** Postgres binding of `DefaultRelationalRepository` - the recommended base class for most Postgres repositories. */
export class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
  TDataSource extends IRelationalDataSource = IPostgresDataSource,
> extends DefaultRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
