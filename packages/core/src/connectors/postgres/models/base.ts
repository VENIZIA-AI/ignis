import type { TIdSchemaType, TSchemaType } from '@/base/models';
import { AbstractEntity, SchemaTypes } from '@/base/models';
import type { TRelationConfig } from '@/connectors/postgres/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import { createSchemaFactory } from 'drizzle-zod';
import type { IEntity, TTableInsert, TTableObject, TTableSchemaWithId } from './common';
import { getIdType as _getIdType } from './common';

/** Base entity with Drizzle ORM support. Supports static schema or constructor-based schema. */
export class BaseRelationalEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends AbstractEntity
  implements IEntity<Schema>
{
  schema: Schema;

  // Phantom type carriers (no runtime value; `declare` emits nothing).
  declare readonly $inferData?: TTableObject<Schema>;
  declare readonly $inferPersist?: TTableInsert<Schema>;

  static TABLE_NAME?: string;
  static AUTHORIZATION_SUBJECT?: string;

  static schema: TTableSchemaWithId;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;

  /** Lazy singleton — shared across all BaseRelationalEntity instances. */
  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BaseRelationalEntity._schemaFactory ??= createSchemaFactory());
  }

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseRelationalEntity;
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ name });

    this.schema = opts?.schema || (ctor.schema as Schema);
  }

  /** Maps the pgTable id column's Drizzle `dataType` to 'number' (serial/integer) or 'string'
   * (everything else, including bigint/unknown). */
  override getIdType(): TIdSchemaType {
    return _getIdType({ entity: this.schema }) === 'number' ? 'number' : 'string';
  }

  getSchema<T = unknown>(opts: { type: TSchemaType }): T {
    const factory = BaseRelationalEntity.schemaFactory;

    switch (opts.type) {
      case SchemaTypes.CREATE: {
        return factory.createInsertSchema(this.schema) as T;
      }
      case SchemaTypes.UPDATE: {
        return factory.createUpdateSchema(this.schema) as T;
      }
      case SchemaTypes.SELECT: {
        return factory.createSelectSchema(this.schema) as T;
      }
      default: {
        throw getError({
          message: `[getSchema] Invalid schema type | type: ${opts.type} | valid: ${[SchemaTypes.SELECT, SchemaTypes.UPDATE, SchemaTypes.CREATE]}`,
        });
      }
    }
  }
}
