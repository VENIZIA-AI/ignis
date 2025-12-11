import { TColumnDefinitions } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraPermissionColumns = (opts?: {
  idType: 'string' | 'number';
}): TColumnDefinitions => {
  return {
    code: text('code').unique(),
    name: text('name'),
    subject: text('subject'),
    pType: text('p_type'),
    action: text('action'),
    scope: text('scope'),
    parentId: opts?.idType === 'string' ? text('parent_id') : integer('parent_id'),
  };
};

// -------------------------------------------------------------------------------------------
/* export class BaseNumberPermission extends Object {
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
} */
