import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { authenticatedRole, authUid } from '@venizia/ignis/postgres/supabase';
import { sql } from 'drizzle-orm';
import { boolean, index, pgPolicy, pgSchema, text, uuid } from 'drizzle-orm/pg-core';

/**
 * The example owns a schema of its own. `public` on a real Supabase project is where the app lives -
 * migrating an example into it risks a production table.
 */
export const ignisExample = pgSchema('ignis_example');

/**
 * A note, readable and writable only by the caller whose `sub` claim matches `owner_id`.
 *
 * Ownership is NOT enforced in application code - it is enforced by the four policies below, applied
 * to every statement the `authenticated` role issues. `owner_id` defaults to `auth.uid()`, so a create
 * never states an owner: inside a transaction carrying auth context (`withAuthContext`), the database
 * already knows who is asking.
 */
export const noteTable = ignisExample.table(
  'note',
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ownerId: uuid('owner_id')
      .notNull()
      .default(sql`auth.uid()`),
    title: text('title').notNull(),
    content: text('content'),
    isPrivate: boolean('is_private').notNull().default(true),
  },
  table => [
    index('IDX_note_owner_id').on(table.ownerId),

    // `authUid` compiles to `(select auth.uid())`, which reads `request.jwt.claims` - the setting
    // `withAuthContext` writes with `set_config(..., true)`. No auth context, no rows.
    pgPolicy('note_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${authUid} = ${table.ownerId}`,
    }),
    pgPolicy('note_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${authUid} = ${table.ownerId}`,
    }),
    pgPolicy('note_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${authUid} = ${table.ownerId}`,
      withCheck: sql`${authUid} = ${table.ownerId}`,
    }),
    pgPolicy('note_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`${authUid} = ${table.ownerId}`,
    }),
  ],
);

@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({ table: noteTable }) {}

export type TNote = TEntityObject<typeof Note>;
