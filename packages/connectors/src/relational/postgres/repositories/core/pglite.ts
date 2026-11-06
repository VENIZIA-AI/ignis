import type { PGlite } from '@electric-sql/pglite';
import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { IPostgresDataSource } from '@/relational/postgres/datasources';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { DefaultCRUDRepository } from './default';

/** A Postgres datasource whose client is PGlite: what `PGliteCRUDRepository` takes and what its `dataSource` is. */
export type TPGliteDataSource = IPostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite>;

/**
 * `DefaultCRUDRepository` for a repository on PGlite, so `class NoteRepository extends PGliteCRUDRepository<typeof noteTable> {}`
 * takes a PGlite datasource and types `this.dataSource.getClient()` as `PGlite`, without spelling the five generics. It is
 * the same class at runtime, so `@repository({ model, dataSource })` and dependency injection work unchanged. A `pg.Pool`
 * datasource is a type error here. As a type, it annotates a variable or a parameter.
 */
export type PGliteCRUDRepository<EntitySchema extends TTableSchemaWithId = TTableSchemaWithId> =
  DefaultCRUDRepository<
    EntitySchema,
    TTableObject<EntitySchema>,
    TTableInsert<EntitySchema>,
    IDatabaseExtraOptions,
    TPGliteDataSource
  >;

/** The class itself, typed for PGlite: `extends PGliteCRUDRepository<typeof table>`. See the type of the same name. */
export const PGliteCRUDRepository = DefaultCRUDRepository as unknown as new <
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
>(
  dataSource?: TPGliteDataSource,
  opts?: ConstructorParameters<typeof DefaultCRUDRepository>[1],
) => PGliteCRUDRepository<EntitySchema>;
