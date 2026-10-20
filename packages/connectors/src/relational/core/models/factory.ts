import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import { getTableName } from 'drizzle-orm';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { BaseRelationalEntity } from './base';
import type { TRelationDefinitions, TTableSchemaWithId } from './common';
import { toRelationConfigs } from './relations';

/**
 * The class `defineEntity` returns: every static and instance member of a hand-written
 * `BaseRelationalEntity<Schema>`, with the table and the relations typed precisely. Named, so a
 * consumer's declaration output can reference it.
 */
export type TDefinedEntityClass<
  Schema extends TTableSchemaWithId,
  Relations extends TRelationDefinitions,
> = typeof BaseRelationalEntity<Schema> & {
  readonly TABLE_NAME: string;
  readonly schema: Schema;
  /** Undefined when the entity declares no relations. */
  readonly relationDefinitions: Relations | undefined;
  readonly relations: TValueOrResolver<Array<TRelationConfig>>;
};

/** Builds an entity class from its table, so a model states each fact once. */
export class ModelFactory {
  /**
   * The table comes first, as a plain drizzle table (`pgTable`, `pgSchema(...).table`,
   * `sqliteTable`): relations point at TABLES, so two entities that relate to each other never
   * import each other, and the compiler keeps both row types.
   */
  static defineEntity<
    Schema extends TTableSchemaWithId,
    Relations extends TRelationDefinitions = {},
  >(opts: { table: Schema; relations?: () => Relations }): TDefinedEntityClass<Schema, Relations> {
    const { table, relations } = opts;

    // Read on first use, not here: a thunk run at definition time throws for a table declared
    // later in the file, or on the far side of a circular import.
    let definitions: Relations | undefined;
    let configs: Array<TRelationConfig> | undefined;

    const readDefinitions = (): Relations | undefined => {
      if (definitions === undefined && relations) {
        definitions = relations();
      }
      return definitions;
    };

    class DefinedEntity extends BaseRelationalEntity<Schema> {
      static override readonly TABLE_NAME: string = getTableName(table);
      static override readonly schema: Schema = table;

      static get relationDefinitions(): Relations | undefined {
        return readDefinitions();
      }

      static override readonly relations: TValueOrResolver<Array<TRelationConfig>> = () => {
        configs ??= toRelationConfigs({ relations: readDefinitions() ?? {} });
        return configs;
      };
    }

    return DefinedEntity;
  }
}
