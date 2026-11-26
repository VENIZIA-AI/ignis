import type { TIdSchemaType, TSchemaType } from '@venizia/ignis-kernel';
import { AbstractEntity, SchemaTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TValueOrResolver } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { createSchemaFactory } from 'drizzle-zod';
import type { Table } from 'drizzle-orm';
import type { IEntity, TTableInsert, TTableObject, TTableSchemaWithId } from './common';
import { RelationalEntityUtility } from './common';

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

  /**
   * What an authorization rule names this model by: the `authorize.principal` of `@model`, else the model's name (the class
   * name, which a minified build changes: give the principal to any model a rule names). `@model` defines the principal on
   * the class; a class that is not decorated, or has no principal, answers its name, so the value is never `undefined` and
   * `Model.AUTHORIZATION_SUBJECT` needs no `!`.
   */
  static get AUTHORIZATION_SUBJECT(): string {
    return this.name;
  }

  /**
   * A subclass that declares `static readonly AUTHORIZATION_SUBJECT = '...'` is compiled by `tsc` (with
   * `useDefineForClassFields: false`, which IGNIS needs) to an assignment: this setter turns it into the class's own value,
   * as a field declaration would be under Bun.
   */
  static set AUTHORIZATION_SUBJECT(value: string) {
    Object.defineProperty(this, 'AUTHORIZATION_SUBJECT', {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  /** A carrier, deliberately widened to `Table`: a factory-built entity knows its table precisely, and a narrower static would reject that precise type. The CONTRACT stays on the instance, typed `Schema`. */
  static schema: Table;
  static relations?: TValueOrResolver<Array<TRelationConfig>>;

  constructor(opts?: { name?: string; schema?: Schema }) {
    const ctor = new.target;
    const name = opts?.name ?? ctor.TABLE_NAME ?? ctor.name;

    super({ name });

    this.schema = opts?.schema ?? (ctor.schema as Schema);
  }

  /** Maps the schema's id column's Drizzle `dataType` to 'number' (serial/integer) or 'string' (everything else, including bigint/unknown). */
  override getIdType(): TIdSchemaType {
    return RelationalEntityUtility.getIdType({ entity: this.schema }) === 'number'
      ? 'number'
      : 'string';
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
