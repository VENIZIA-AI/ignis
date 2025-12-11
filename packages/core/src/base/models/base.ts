import { createSchemaFactory } from 'drizzle-zod';
import { SchemaTypes, TSchemaType, TTableSchemaWithId } from './common';
import { BaseHelper, getError } from '@venizia/ignis-helpers';

// -------------------------------------------------------------------------------------------
// Base Entity with Drizzle ORM support
// -------------------------------------------------------------------------------------------
export class BaseEntity<Schema extends TTableSchemaWithId = TTableSchemaWithId> extends BaseHelper {
  name: string;

  schema: Schema;
  schemaFactory: ReturnType<typeof createSchemaFactory>;

  constructor(opts: { name: string; schema: Schema }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.schema = opts.schema;
    this.schemaFactory = createSchemaFactory();
  }

  getSchema(opts: { type: TSchemaType }) {
    switch (opts.type) {
      case SchemaTypes.CREATE: {
        return this.schemaFactory.createInsertSchema(this.schema);
      }
      case SchemaTypes.UPDATE: {
        return this.schemaFactory.createUpdateSchema(this.schema);
      }
      case SchemaTypes.SELECT: {
        return this.schemaFactory.createSelectSchema(this.schema);
      }
      default: {
        throw getError({
          message: `[getSchema] Invalid schema type | type: ${opts.type} | valid: ${[SchemaTypes.SELECT, SchemaTypes.UPDATE, SchemaTypes.CREATE]}`,
        });
      }
    }
  }

  toObject() {
    return Object.assign({}, this);
  }

  toJSON() {
    return this.toObject();
  }
}

// -------------------------------------------------------------------------------------------
// Number ID Entity
// -------------------------------------------------------------------------------------------
/* export class BaseNumberIdEntity<Schema = any> extends Entity<Schema> {
  constructor(opts: { name: string; schema: Schema }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId<ColumnDefinitions>(opts.columns, {
        id: { columnName: 'id', dataType: 'number' },
      }),
    });
  }
} */

// -------------------------------------------------------------------------------------------
// String ID Entity
// -------------------------------------------------------------------------------------------
/* export class BaseStringIdEntity<ColumnDefinitions extends TColumns = TColumns> extends Entity<
  TIdEnricherResult<ColumnDefinitions>
> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId<ColumnDefinitions>(opts.columns, {
        id: { columnName: 'id', dataType: 'string' },
      }),
    });
  }
} */

/* export type TBaseIdEntity<ColumnDefinitions extends TColumns = TColumns> =
  | BaseNumberIdEntity<ColumnDefinitions>
  | BaseStringIdEntity<ColumnDefinitions>; */

// -------------------------------------------------------------------------------------------
// Timestamp Entities (with createdAt and modifiedAt)
// -------------------------------------------------------------------------------------------
/* export abstract class BaseNumberTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseNumberIdEntity<TTzEnricherResult<ColumnDefinitions>> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichTz<ColumnDefinitions>(opts.columns, {}),
    });
  }
}

export abstract class BaseStringTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseStringIdEntity<TTzEnricherResult<ColumnDefinitions>> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichTz<ColumnDefinitions>(opts.columns, {}),
    });
  }
}

export type TBaseTzEntity<ColumnDefinitions extends TColumns = TColumns> =
  | BaseNumberTzEntity<ColumnDefinitions>
  | BaseStringTzEntity<ColumnDefinitions>; */

// -------------------------------------------------------------------------------------------
// User Audit Entities (with createdBy and modifiedBy)
// -------------------------------------------------------------------------------------------
/* export abstract class BaseNumberUserAuditTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseNumberTzEntity<TUserAuditEnricherResult<ColumnDefinitions>> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichUserAudit<ColumnDefinitions>(opts.columns),
    });
  }
}

export abstract class BaseStringUserAuditTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseStringTzEntity<TUserAuditEnricherResult<ColumnDefinitions>> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichUserAudit<ColumnDefinitions>(opts.columns),
    });
  }
}

export type TBaseUserAuditTzEntity<ColumnDefinitions extends TColumns = TColumns> =
  | BaseNumberUserAuditTzEntity<ColumnDefinitions>
  | BaseStringUserAuditTzEntity<ColumnDefinitions>; */
