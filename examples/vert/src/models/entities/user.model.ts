import { BaseEntity, extraUserColumns, generateIdColumnDefs, model } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------
/**
 * User model using static schema pattern (Option A - Power Users)
 *
 * The schema is defined as a static property on the class.
 * Relations can be added via static relations property.
 * No constructor needed - BaseEntity auto-discovers from static properties.
 *
 * Note: password and secret are configured as hidden properties
 * and will be excluded from all repository query results.
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
    ...extraUserColumns({ idType: 'string' }),
    // Hidden properties - excluded from all repository queries
    password: text('password'),
    secret: text('secret'),
  });

  // Define relations as a static method (empty for User)
  static override relations = () => [];
}
