import { TColumnDefinitions } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraPermissionColumns: TColumnDefinitions = {
  code: text('code').unique(),
  name: text('name'),
  subject: text('subject'),
  pType: text('p_type'),
  action: text('action'),
  scope: text('scope'),
};

// -------------------------------------------------------------------------------------------
export class BaseNumberPermission extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign(
        {},
        extraPermissionColumns,
        { parentId: integer('parent_id') },
        opts.columns ?? {},
      ),
    });
  }
}

export class BaseStringPermission extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign(
        {},
        extraPermissionColumns,
        { parentId: text('parent_id') },
        opts.columns ?? {},
      ),
    });
  }
}
