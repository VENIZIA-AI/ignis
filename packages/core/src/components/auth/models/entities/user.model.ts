import { UserStatuses, UserTypes } from '@/common/statuses';
import { isoTimestamp } from '@/connectors/postgres/models';
import { TConstValue } from '@venizia/ignis-helpers';
import { integer, text } from 'drizzle-orm/pg-core';

export const extraUserColumns = (opts?: { idType: 'string' | 'number' }) => {
  return {
    realm: text('realm').default(''),
    status: text('status')
      .$type<TConstValue<typeof UserStatuses>>()
      .notNull()
      .default(UserStatuses.UNKNOWN),
    type: text('type').$type<TConstValue<typeof UserTypes>>().notNull().default(UserTypes.SYSTEM),
    activatedAt: isoTimestamp('activated_at', { withTimezone: true }),
    lastLoginAt: isoTimestamp('last_login_at', { withTimezone: true }),
    parentId: opts?.idType === 'string' ? text('parent_id') : integer('parent_id'),
  };
};
