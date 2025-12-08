import {
  BaseEntity,
  extraUserColumns,
  generateIdColumnDefs,
  model,
  TTableObject,
} from '@vez/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity', skipMigrate: false })
export class User extends BaseEntity<TUserSchema> {
  static readonly TABLE_NAME = User.name;

  constructor() {
    super({ name: User.name, schema: usersTable });
  }
}

// ----------------------------------------------------------------
export const usersTable = pgTable(User.TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...extraUserColumns({ idType: 'string' }),
});

export type TUserSchema = typeof usersTable;
export type TUser = TTableObject<TUserSchema>;

