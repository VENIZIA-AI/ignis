import { RoleStatuses } from '@/common';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraRoleColumns = () => {
  return {
    identifier: text('identifier').unique().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    priority: integer('priority').notNull(),
    status: text('status').notNull().default(RoleStatuses.ACTIVATED),
  };
};
