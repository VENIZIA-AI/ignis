import { TColumnDefinitions } from '@/base/models';
import { RoleStatuses } from '@/common';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraRoleColumns = (): TColumnDefinitions => {
  return {
    identifier: text('identifier').unique(),
    name: text('name'),
    description: text('description'),
    priority: integer('priority'),
    status: text('status').notNull().default(RoleStatuses.ACTIVATED),
  };
};

// -------------------------------------------------------------------------------------------

