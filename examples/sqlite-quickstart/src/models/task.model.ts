import { model } from '@venizia/ignis';
import { ModelFactory, SqliteIdEnricher } from '@venizia/ignis-connectors/sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

declare module '@venizia/ignis' {
  interface IExecutionValues {
    tenantId?: string;
  }
}

export const taskTable = sqliteTable('tasks', {
  ...SqliteIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
});

/**
 * Each row belongs to a tenant. A system run sees every row without calling `resolve`; any other caller sees the
 * tenant its execution frame names, and nothing when it names none.
 *
 * This app has no authentication, so the frame is the only source of the tenant. With authentication, read the
 * user's own tenant first and let the frame's value only narrow it.
 */
@model({
  settings: {
    access: {
      resolve: ({ scope }) => {
        const tenantId = scope?.values.tenantId;

        return tenantId ? { tenantId } : null;
      },
    },
  },
})
export class Task extends ModelFactory.defineEntity({ table: taskTable }) {}
