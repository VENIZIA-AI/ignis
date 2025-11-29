import { pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { BaseHelper } from '../helpers';
import { enrichId, enrichTz, enrichUserAudit } from './enrichers';
import { TColumns } from './types';

// -------------------------------------------------------------------------------------------
// Base Entity with Drizzle ORM support
// -------------------------------------------------------------------------------------------
export abstract class Entity<ColumnDefinitions extends TColumns = TColumns> extends BaseHelper {
  schema: string;
  name: string;
  columns: ColumnDefinitions;

  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({ scope: opts.name });

    this.schema = opts.schema ?? 'public';
    this.name = opts.name;
    this.columns = opts.columns;
  }

  build() {
    if (this.schema !== 'public') {
      return pgSchema(this.schema).table(this.name, this.columns);
    }

    return pgTable(this.name, this.columns);
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
export class BaseNumberIdEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends Entity<ColumnDefinitions> {
  constructor(opts: { schema: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId<ColumnDefinitions>(opts.columns, {
        id: { columnName: 'id', dataType: 'number' },
      }),
    });
  }
}

// -------------------------------------------------------------------------------------------
// String ID Entity
// -------------------------------------------------------------------------------------------
export class BaseStringIdEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends Entity<ColumnDefinitions> {
  constructor(opts: { schema?: string; name: string; columns?: ColumnDefinitions }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId<ColumnDefinitions>(opts.columns, {
        id: { columnName: 'id', dataType: 'string' },
      }),
    });
  }
}

export type TBaseIdEntity<ColumnDefinitions extends TColumns = TColumns> =
  | BaseNumberIdEntity<ColumnDefinitions>
  | BaseStringIdEntity<ColumnDefinitions>;

// -------------------------------------------------------------------------------------------
// Timestamp Entities (with createdAt and modifiedAt)
// -------------------------------------------------------------------------------------------
export abstract class BaseNumberTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseNumberIdEntity<ColumnDefinitions> {
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
> extends BaseStringIdEntity<ColumnDefinitions> {
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
  | BaseStringTzEntity<ColumnDefinitions>;

// -------------------------------------------------------------------------------------------
// User Audit Entities (with createdBy and modifiedBy)
// -------------------------------------------------------------------------------------------
export abstract class BaseNumberUserAuditTzEntity<
  ColumnDefinitions extends TColumns = TColumns,
> extends BaseNumberTzEntity<ColumnDefinitions> {
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
> extends BaseStringTzEntity<ColumnDefinitions> {
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
  | BaseStringUserAuditTzEntity<ColumnDefinitions>;
