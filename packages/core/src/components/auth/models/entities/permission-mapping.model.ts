import { TColumnDefinitions } from '@/base/models';
import { getError } from '@/helpers';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraPermissionMappingColumns = (opts?: {
  idType: 'string' | 'number';
}): TColumnDefinitions => {
  const { idType = 'number' } = opts ?? {};

  switch (idType) {
    case 'string': {
      return {
        effect: text('effect'),
        userId: text('user_id'),
        roleId: text('role_id'),
        permissionId: text('permission_id'),
      };
    }
    case 'number': {
      return {
        effect: text('effect'),
        userId: integer('user_id'),
        roleId: integer('role_id'),
        permissionId: integer('permission_id'),
      };
    }
    default: {
      throw getError({
        message: `[extraPermissionMappingColumns] Invalid idType | idType: ${idType}`,
      });
    }
  }
};

// -------------------------------------------------------------------------------------------
/* export class BaseNumberPermissionMapping extends Object {
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
} */
