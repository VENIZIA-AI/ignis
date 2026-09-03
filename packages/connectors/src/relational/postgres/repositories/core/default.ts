import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IPostgresDataSource } from '@/relational/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { DefaultRelationalRepository } from '@/relational/core/repositories/core/default';

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
