import { generatePrincipalColumnDefs } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraUserRoleColumns = (opts?: { idType: 'string' | 'number' }) => {
  return {
    ...generatePrincipalColumnDefs({ defaultPolymorphic: 'Role', polymorphicIdType: 'number' }),
    userId: opts?.idType === 'string' ? text('user_id').notNull() : integer('user_id').notNull(),
  };
};
