import { BaseNumberTzEntity, BaseStringTzEntity, TColumns } from '@/base';
import { UserStatuses, UserTypes } from '@/common';
import { timestamp } from 'drizzle-orm/pg-core';
import { text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraUserColumns: TColumns = {
  realm: text('realm').default(''),
  status: text('status').notNull().default(UserStatuses.UNKNOWN),
  type: text('type').notNull().default(UserTypes.SYSTEM),
  activatedAt: timestamp('activated_at', { mode: 'date', withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { mode: 'date', withTimezone: true }),
  parentId: text('parent_id'),
};

export class BaseNumberUser extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: Object.assign({}, extraUserColumns, opts.columns ?? {}),
    });
  }
}

export class BaseStringUser extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: Object.assign({}, extraUserColumns, opts.columns ?? {}),
    });
  }
}

// -------------------------------------------------------------------------------------------
