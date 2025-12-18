import { BaseHelper, getError, TValueOrResolver } from '@venizia/ignis-helpers';
import { createSchemaFactory } from 'drizzle-zod';
import { TRelationConfig } from '../repositories';
import { IEntity, SchemaTypes, TSchemaType, TTableSchemaWithId } from './common';

// -------------------------------------------------------------------------------------------
// Base Entity with Drizzle ORM support
// Supports both:
// - Option A: Static schema/relations (power users)
// - Option B: Constructor-based schema (legacy)
// -------------------------------------------------------------------------------------------
export class BaseEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId>
  extends BaseHelper
  implements IEntity<Schema>
{
  name: string;
  schema: Schema;

  /**
   * Static schema - defined by subclass using pgTable()
   * Option A: @model() + static schema
   */
  static schema: TTableSchemaWithId;

  /**
   * Static relations factory - defined by subclass
   * Returns an array of TRelationConfig
   */
  static relations?: TValueOrResolver<Array<TRelationConfig>>;

  /**
   * Table name - can be overridden by subclass, defaults to class name
   */
  static TABLE_NAME?: string;

  /**
   * Lazy singleton for schemaFactory to avoid creating new instance per entity
   * Performance optimization: shared across all BaseEntity instances
   */
  private static _schemaFactory?: ReturnType<typeof createSchemaFactory>;
  protected static get schemaFactory(): ReturnType<typeof createSchemaFactory> {
    return (BaseEntity._schemaFactory ??= createSchemaFactory());
  }

  /**
   * Constructor supports both patterns:
   * - Option A: No args (schema from static property)
   * - Option B: Explicit opts (legacy, backward compatible)
   */
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
