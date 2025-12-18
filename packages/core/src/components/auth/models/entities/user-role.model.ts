import { generatePrincipalColumnDefs, TColumnDefinitions } from '@/base/models';
import { integer, text } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------------------------
export const extraUserRoleColumns = (opts?: {
  idType: 'string' | 'number';
}): TColumnDefinitions => {
  return {
    ...generatePrincipalColumnDefs({ defaultPolymorphic: 'Role', polymorphicIdType: 'number' }),
    userId: opts?.idType === 'string' ? text('user_id') : integer('user_id'),
  };
};
