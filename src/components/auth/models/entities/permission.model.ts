import { BaseNumberTzEntity, BaseStringTzEntity, TColumns } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraPermissionColumns: TColumns = {
  code: text('code').unique(),
  name: text('name'),
  subject: text('subject'),
  pType: text('p_type'),
  action: text('action'),
  scope: text('scope'),
};

// -------------------------------------------------------------------------------------------
export class BaseNumberPermission extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
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

export class BaseStringPermission extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
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
