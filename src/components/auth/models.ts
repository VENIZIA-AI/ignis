import { BaseNumberTzEntity, BaseStringTzEntity, enrichPrincipal, TColumns } from '@/base';
import { RoleStatuses, UserStatuses, UserTypes } from '@/common';
import { integer, text, timestamp } from 'drizzle-orm/pg-core';

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
const extraRoleColumns: TColumns = {
  identifier: text('identifier').unique(),
  name: text('name'),
  description: text('description'),
  priority: integer('priority'),
  status: text('status').notNull().default(RoleStatuses.ACTIVATED),
};

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

// -------------------------------------------------------------------------------------------
const extraPermissionColumns: TColumns = {
  code: text('code').unique(),
  name: text('name'),
  subject: text('subject'),
  pType: text('p_type'),
  action: text('action'),
  scope: text('scope'),
};

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

// -------------------------------------------------------------------------------------------
const extraPermissionMappingColumns: TColumns = {
  effect: text('effect'),
};

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

// -------------------------------------------------------------------------------------------
export class BaseNumberUserRole extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: enrichPrincipal(
        Object.assign(
          {},
          extraPermissionMappingColumns,
          {
            userId: integer('user_id'),
            roleId: integer('role_id'),
            permissionId: integer('permission_id'),
          },
          opts.columns ?? {},
        ),
        {
          defaultPolymorphic: 'Role',
          polymorphicIdType: 'number',
        },
      ),
    });
  }
}

export class BaseStringUserRole extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: enrichPrincipal(
        Object.assign(
          {},
          extraPermissionMappingColumns,
          {
            userId: text('user_id'),
            roleId: text('role_id'),
            permissionId: text('permission_id'),
          },
          opts.columns ?? {},
        ),
        {
          defaultPolymorphic: 'Role',
          polymorphicIdType: 'string',
        },
      ),
    });
  }
}
