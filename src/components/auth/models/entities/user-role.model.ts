import { BaseNumberTzEntity, BaseStringTzEntity, enrichPrincipal, TColumns } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export class BaseNumberUserRole extends BaseNumberTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: enrichPrincipal(
        Object.assign({}, { userId: integer('user_id') }, opts.columns ?? {}),
        { defaultPolymorphic: 'Role', polymorphicIdType: 'number' },
      ),
    });
  }
}

export class BaseStringUserRole extends BaseStringTzEntity {
  constructor(opts: { name: string; schema?: string; columns?: TColumns }) {
    super({
      ...opts,
      columns: enrichPrincipal(Object.assign({}, { userId: text('user_id') }, opts.columns ?? {}), {
        defaultPolymorphic: 'Role',
        polymorphicIdType: 'string',
      }),
    });
  }
}
