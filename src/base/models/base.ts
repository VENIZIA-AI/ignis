import { pgSchema, pgTable } from 'drizzle-orm/pg-core';
import { BaseHelper } from '../helpers';
import { enrichId, enrichTz, enrichUserAudit } from './enrichers';
import { TColumns } from './types';

// -------------------------------------------------------------------------------------------
// Base Entity with Drizzle ORM support
// -------------------------------------------------------------------------------------------
export abstract class Entity extends BaseHelper {
  protected schema: string;
  protected name: string;
  protected columns: TColumns;

  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
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
export class BaseNumberIdEntity extends Entity {
  constructor(opts: { schema: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId(opts.columns, {
        id: { columnName: 'id', dataType: 'number' },
      }),
    });
  }
}

// -------------------------------------------------------------------------------------------
// String ID Entity
// -------------------------------------------------------------------------------------------
export class BaseStringIdEntity extends Entity {
  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichId(opts.columns, {
        id: { columnName: 'id', dataType: 'string' },
      }),
    });
  }
}

export type TBaseIdEntity = BaseNumberIdEntity['columns'] | BaseStringIdEntity['columns'];

// -------------------------------------------------------------------------------------------
// Timestamp Entities (with createdAt and modifiedAt)
// -------------------------------------------------------------------------------------------
export abstract class BaseNumberTzEntity extends BaseNumberIdEntity {
  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichTz(opts.columns, {}),
    });
  }
}

export abstract class BaseStringTzEntity extends BaseStringIdEntity {
  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichTz(opts.columns, {}),
    });
  }
}

export type TBaseTzEntity = BaseNumberTzEntity | BaseStringTzEntity;

// -------------------------------------------------------------------------------------------
// User Audit Entities (with createdBy and modifiedBy)
// -------------------------------------------------------------------------------------------
export abstract class BaseNumberUserAuditTzEntity extends BaseNumberTzEntity {
  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichUserAudit(opts.columns),
    });
  }
}

export abstract class BaseStringUserAuditTzEntity extends BaseStringTzEntity {
  constructor(opts: { schema?: string; name: string; columns?: TColumns }) {
    super({
      schema: opts.schema,
      name: opts.name,
      columns: enrichUserAudit(opts.columns),
    });
  }
}

export type TBaseUserAuditTzEntity = BaseNumberUserAuditTzEntity | BaseStringUserAuditTzEntity;
