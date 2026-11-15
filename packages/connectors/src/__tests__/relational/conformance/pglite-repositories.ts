import type { TPGliteDataSource } from '@/relational/postgres/repositories';
import {
  DefaultCRUDRepository,
  SoftDeletableRepository,
  type IDatabaseExtraOptions,
  type TSoftDeletableTableSchema,
} from '@/relational/postgres/repositories';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import type {
  TTableInsert as TPostgresTableInsert,
  TTableObject as TPostgresTableObject,
} from '@/relational/postgres/models';

/** `DefaultCRUDRepository` bound to a PGlite datasource: the default binds a node-postgres `Pool`. */
export class PGliteDefaultRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
> extends DefaultCRUDRepository<
  EntitySchema,
  TTableObject<EntitySchema>,
  TTableInsert<EntitySchema>,
  IDatabaseExtraOptions,
  TPGliteDataSource
> {}

/** `SoftDeletableRepository` bound to a PGlite datasource. */
export class PGliteSoftDeletableRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
> extends SoftDeletableRepository<
  EntitySchema,
  TPostgresTableObject<EntitySchema>,
  TPostgresTableInsert<EntitySchema>,
  IDatabaseExtraOptions,
  TPGliteDataSource
> {}
