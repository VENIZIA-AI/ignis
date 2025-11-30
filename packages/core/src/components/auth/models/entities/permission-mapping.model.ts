import { TColumnDefinitions } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraPermissionMappingColumns: TColumnDefinitions = {
  effect: text('effect'),
};

// -------------------------------------------------------------------------------------------
export class BaseNumberPermissionMapping extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign(
        {},
        extraPermissionMappingColumns,
        {
          userId: integer('user_id'),
          roleId: integer('role_id'),
          permissionId: integer('permission_id'),
        },
        opts.columns ?? {},
      ),
    });
  }
}

export class BaseStringPermissionMapping extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign(
        {},
        extraPermissionMappingColumns,
        {
          userId: text('user_id'),
          roleId: text('role_id'),
          permissionId: text('permission_id'),
        },
        opts.columns ?? {},
      ),
    });
  }
}
