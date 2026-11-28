import { CurrentUser } from '@/common/current-user';
import { model } from '@venizia/ignis';
import {
  ModelFactory,
  PostgresIdEnricher,
  type TEntityObject,
} from '@venizia/ignis-connectors/postgres';
import { index, pgTable, text } from 'drizzle-orm/pg-core';

export const noteTable = pgTable(
  'notes',
  {
    ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
  },
  (table) => [index('notes_owner_id_idx').on(table.ownerId)],
);

/**
 * A note, visible and writable only to its owner. The row scope is ANDed into every query of the repository and checked
 * on every write; with no signed-in user it matches nothing. A seed runs in a system execution frame, which lifts it.
 */
@model({
  settings: {
    access: {
      resolve: () => {
        const ownerId = CurrentUser.readId();

        return ownerId ? { ownerId } : undefined;
      },
    },
  },
})
export class Note extends ModelFactory.defineEntity({ table: noteTable }) {}

export type TNote = TEntityObject<typeof Note>;
