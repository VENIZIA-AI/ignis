import {
  BaseEntity,
  createRelations,
  extraUserColumns,
  generateIdColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------
const TABLE_NAME = 'User';

// ----------------------------------------------------------------
export const userTable = pgTable(TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...extraUserColumns({ idType: 'string' }),
});

export const userRelations = createRelations({
  source: userTable,
  relations: [],
});

// ----------------------------------------------------------------
export type TUserSchema = typeof userTable;
export type TUser = TTableObject<TUserSchema>;

// ----------------------------------------------------------------
@model({ type: 'entity', skipMigrate: false })
export class User extends BaseEntity<TUserSchema> {
  static readonly TABLE_NAME = User.name;

  constructor() {
    super({ name: User.name, schema: userTable });
  }
}