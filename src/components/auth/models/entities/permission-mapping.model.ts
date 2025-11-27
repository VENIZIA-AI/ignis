import { BaseNumberTzEntity, BaseStringTzEntity, TColumns } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
const extraPermissionMappingColumns: TColumns = {
  effect: text('effect'),
};

// -------------------------------------------------------------------------------------------
export class BaseNumberPermissionMapping extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
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

export class BaseStringPermissionMapping extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
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
