import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TRelationDefinitions } from '@/relational/core/models/common';
import { toRelationConfigs } from '@/relational/core/models/relations';
import { pgTable } from 'drizzle-orm/pg-core';
import type {
  PgColumnBuilderBase,
  PgTableExtraConfigValue,
  PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import type { BuildColumns } from 'drizzle-orm';
import { BaseRelationalEntity } from '../../core/models/base';
import { generateIdColumnDefs } from './enrichers';
import type { TIdEnricherResult } from './enrichers';

/** A UUID v7 text primary key - what an entity gets when it says nothing about its id. */
const defaultIdColumns = () => generateIdColumnDefs({ id: { dataType: 'string' } });

export type TEntityColumns = Record<string, PgColumnBuilderBase>;

/** The table `defineEntity` builds, named so a consumer's declaration output can reference it (TS2883). */
export type TEntityTable<Name extends string, Columns extends TEntityColumns> = PgTableWithColumns<{
  name: Name;
  schema: undefined;
  columns: BuildColumns<Name, Columns, 'pg'>;
  dialect: 'pg';
}>;

/** The class `defineEntity` returns: constructible, plus the statics the framework and `TEntityObject` read. */
export interface IDefinedEntityClass<
  Name extends string,
  Columns extends TEntityColumns,
  Relations extends TRelationDefinitions,
> {
  new (): BaseRelationalEntity;
  readonly TABLE_NAME: Name;
  readonly schema: TEntityTable<Name, Columns>;
  readonly relationDefinitions: Relations;
  readonly relations: TValueOrResolver<Array<TRelationConfig>>;
}

/** Builds an entity's table and the class carrying it, so a model states each fact once. */
export class ModelFactory {
  static defineEntity<
    Name extends string,
    Columns extends TEntityColumns,
    Relations extends TRelationDefinitions = Record<string, never>,
    IdColumns extends TEntityColumns = TIdEnricherResult<Record<never, never>>,
  >(opts: {
    name: Name;
    columns: Columns;

    /** Keyed by relation name, each pointing at a SCHEMA - see {@link toRelationConfigs}. */
    relations?: () => Relations;

    /** Built by `generateIdColumnDefs`; omitted, the id is a UUID v7 text key. */
    id?: IdColumns;

    /** Indexes and constraints - drizzle's third `pgTable` argument. */
    extra?: (columns: IdColumns & Columns) => Array<PgTableExtraConfigValue>;
  }): IDefinedEntityClass<Name, IdColumns & Columns, Relations> {
    const { name, columns, relations, id, extra } = opts;

    const idColumns = id ?? defaultIdColumns();
    const tableColumns = { ...idColumns, ...columns } as IdColumns & Columns;
    const schema = extra
      ? pgTable(name, tableColumns, table => extra(table as unknown as IdColumns & Columns))
      : pgTable(name, tableColumns);

    class DefinedEntity extends BaseRelationalEntity {
      static override readonly TABLE_NAME: Name = name;
      static override readonly schema = schema;
      static readonly relationDefinitions = (relations?.() ?? {}) as Relations;

      static override readonly relations: TValueOrResolver<Array<TRelationConfig>> = () =>
        toRelationConfigs({ relations: relations?.() ?? {} });

      constructor() {
        // No `schema` here: the base reads the static, which carries the precise table type.
        super({ name });
      }
    }

    return DefinedEntity;
  }
}
