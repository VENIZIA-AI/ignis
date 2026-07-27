import { model } from '@venizia/ignis';
import { generateTzColumnDefs } from '@venizia/ignis/postgres';
import { BasePostgresEntity } from '@venizia/ignis/postgres';
import { authenticatedRole, authUid } from '@venizia/ignis/postgres/supabase';
import { sql } from 'drizzle-orm';
import { boolean, index, pgPolicy, pgSchema, text, uuid } from 'drizzle-orm/pg-core';

/**
 * The example owns a schema of its own. `public` on a Supabase project is where the real app lives -
 * migrating an example into it is how you drop someone's production table by accident.
 */
export const ignisExample = pgSchema('ignis_example');

/**
 * Note - owned by a real `auth.users` row, and readable only by that owner.
 *
 * The ownership rule is NOT enforced in application code. It is enforced by the four policies below,
 * which the database applies to every statement issued under the `authenticated` role. IGNIS's job is
 * only to establish WHO is asking - `withAuthContext` does that, per transaction - and then to issue
 * an ordinary query and let Postgres decide what it is allowed to touch.
 *
 * `ownerId` defaults to `auth.uid()`, so an INSERT never has to be told who the owner is: under a
 * transaction carrying auth context, the database already knows.
 */
@model({ type: 'entity' })
export class Note extends BasePostgresEntity<typeof Note.schema> {
  static override schema = ignisExample.table(
    'note',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      ...generateTzColumnDefs(),
      ownerId: uuid('owner_id')
        .notNull()
        .default(sql`auth.uid()`),
      title: text('title').notNull(),
      content: text('content'),
      isPrivate: boolean('is_private').notNull().default(true),
    },
    def => [
      index('IDX_note_owner_id').on(def.ownerId),

      // `authUid` is Drizzle's `(select auth.uid())`, which reads `request.jwt.claims` - the setting
      // `withAuthContext` writes with `set_config(..., true)`. No auth context, no rows.
      pgPolicy('note_select_own', {
        for: 'select',
        to: authenticatedRole,
        using: sql`${authUid} = ${def.ownerId}`,
      }),
      pgPolicy('note_insert_own', {
        for: 'insert',
        to: authenticatedRole,
        withCheck: sql`${authUid} = ${def.ownerId}`,
      }),
      pgPolicy('note_update_own', {
        for: 'update',
        to: authenticatedRole,
        using: sql`${authUid} = ${def.ownerId}`,
        withCheck: sql`${authUid} = ${def.ownerId}`,
      }),
      pgPolicy('note_delete_own', {
        for: 'delete',
        to: authenticatedRole,
        using: sql`${authUid} = ${def.ownerId}`,
      }),
    ],
  );
}
