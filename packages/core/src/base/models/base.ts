import { BaseHelper, getError, TValueOrResolver } from '@venizia/ignis-helpers';
import { createSchemaFactory } from 'drizzle-zod';
import { TRelationConfig } from '../repositories';
import { IEntity, SchemaTypes, TSchemaType, TTableSchemaWithId } from './common';

/** Base entity with Drizzle ORM support. Supports static schema or constructor-based schema. */
export class BaseEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends BaseHelper
  implements IEntity<Schema>
{
  name: string;
  schema: Schema;

  static TABLE_NAME?: string;
  static AUTHORIZATION_SUBJECT?: string;

  static schema: TTableSchemaWithId;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;

  /** Lazy singleton — shared across all BaseEntity instances. */
  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BaseEntity._schemaFactory ??= createSchemaFactory());
  }

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseEntity;
    // Use explicit TABLE_NAME if defined, otherwise fall back to class name
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ scope: name });

    this.name = name;
    this.schema = opts?.schema || (ctor.schema as Schema);
  }

  getSchema(opts: { type: TSchemaType }) {
    const factory = BaseEntity.schemaFactory;
    switch (opts.type) {
      case SchemaTypes.CREATE: {
        return factory.createInsertSchema(this.schema);
      }
      case SchemaTypes.UPDATE: {
        return factory.createUpdateSchema(this.schema);
      }
      case SchemaTypes.SELECT: {
        return factory.createSelectSchema(this.schema);
      }
      default: {
        throw getError({
          message: `[getSchema] Invalid schema type | type: ${opts.type} | valid: ${[SchemaTypes.SELECT, SchemaTypes.UPDATE, SchemaTypes.CREATE]}`,
        });
      }
    }
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return this.toObject();
  }
}
