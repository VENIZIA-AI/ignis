import type { TIdSchemaType, TSchemaType } from '@venizia/ignis-kernel';
import { AbstractEntity, SchemaTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { createSchemaFactory } from 'drizzle-zod';
import type { Column, Table } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import type { IEntity, TTableInsert, TTableObject, TTableSchemaWithId } from './common';
import { getIdType as _getIdType } from './common';
import { AuditFields } from './common/constants';

/** Lazy singleton, shared by every entity. */
let schemaFactory: ReturnType<typeof createSchemaFactory> | undefined;
const getSchemaFactory = (): ReturnType<typeof createSchemaFactory> =>
  (schemaFactory ??= createSchemaFactory());

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

  /** A carrier, deliberately widened to `Table`: a factory-built entity knows its table precisely, and a narrower static would reject that precise type. The CONTRACT stays on the instance, typed `Schema`. */
  static schema: Table;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target as typeof BaseRelationalEntity;
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ name });

    this.schema = opts?.schema ?? (ctor.schema as Schema);
  }

  /** Maps the schema's id column's Drizzle `dataType` to 'number' (serial/integer) or 'string' (everything else, including bigint/unknown). */
  override getIdType(): TIdSchemaType {
    return _getIdType({ entity: this.schema }) === 'number' ? 'number' : 'string';
  }

  /** The audit keys whose column carries a default or `$onUpdate`; an audit column with neither is left to the client. */
  override getServerStampedKeys(): string[] {
    const columns: Record<string, Column | undefined> = getTableColumns(this.schema);

    return [...AuditFields.SCHEME_SET].filter(key => {
      const column = columns[key];
      return column !== undefined && (column.hasDefault || column.onUpdateFn !== undefined);
    });
  }

  getSchema<T = unknown>(opts: { type: TSchemaType }): T {
    const factory = getSchemaFactory();

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
