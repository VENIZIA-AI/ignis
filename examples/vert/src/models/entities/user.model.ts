import {
  BaseEntity,
  extraUserColumns,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------
/**
 * User model using static schema pattern (Option A - Power Users)
 *
 * The schema is defined as a static property on the class.
 * Relations can be added via static relations property.
 * No constructor needed - BaseEntity auto-discovers from static properties.
 *
 * Features:
 * - User audit tracking: createdBy/modifiedBy automatically populated
 * - Timestamps: createdAt/modifiedAt automatically managed
 * - Hidden properties: password and secret excluded from queries
 */
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secret'],
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraUserColumns({ idType: 'string' }),

    // Authentication fields
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),

    // Hidden properties - excluded from all repository queries
    password: text('password'),
    secret: text('secret'),
  });

  // Define relations as a static method (empty for User)
  static override relations = () => [];
}
