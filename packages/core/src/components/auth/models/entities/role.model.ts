import { RoleStatuses } from '@/common/statuses';
import { TConstValue } from '@venizia/ignis-helpers';
import { integer, text } from 'drizzle-orm/pg-core';

export const extraRoleColumns = () => {
  return {
    identifier: text('identifier').unique().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    priority: integer('priority').notNull(),
    status: text('status')
      .$type<TConstValue<typeof RoleStatuses>>()
      .notNull()
      .default(RoleStatuses.ACTIVATED),
  };
};
