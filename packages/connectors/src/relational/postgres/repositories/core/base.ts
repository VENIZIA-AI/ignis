import type { IExtraOptions } from '@venizia/ignis-kernel';
import type { IPostgresDataSource } from '@/relational/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { RelationalBaseRepository } from '@/relational/core/repositories/core/base';

/**
 * Postgres binding of `RelationalBaseRepository`: rebinds the two engine-facing defaults so a
 * single-argument subclass resolves `connector` to a `PgDatabase` and needs no cast on
 * `options.transaction.connector`.
 */
export abstract class PostgresBaseRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
  TDataSource extends IRelationalDataSource = IPostgresDataSource,
> extends RelationalBaseRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {}
