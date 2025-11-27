import { BaseNumberTzEntity, BaseStringTzEntity, TColumns } from '@/base/models';
import { RoleStatuses } from '@/common';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraRoleColumns: TColumns = {
  identifier: text('identifier').unique(),
  name: text('name'),
  description: text('description'),
  priority: integer('priority'),
  status: text('status').notNull().default(RoleStatuses.ACTIVATED),
};

// -------------------------------------------------------------------------------------------
export class BaseNumberRole extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: Object.assign({}, extraRoleColumns, opts.columns ?? {}),
    });
  }
}

export class BaseStringRole extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: Object.assign({}, extraRoleColumns, opts.columns ?? {}),
    });
  }
}
