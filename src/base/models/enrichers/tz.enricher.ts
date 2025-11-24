import { timestamp } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export const enrichTz = (
  baseSchema: TColumns,
  opts?: {
    created?: { columnName: string; withTimezone: boolean };
    modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  },
): TColumns => {
  const {
    created = { columnName: 'created_at', withTimezone: true },
    modified = { enable: true, columnName: 'modified_at', withTimezone: true },
  } = opts ?? {};

  const rs = Object.assign({}, baseSchema, {
    createdAt: timestamp(created.columnName, {
      mode: 'date',
      withTimezone: created.withTimezone,
    })
      .defaultNow()
      .notNull(),
  });

  if (!modified.enable) {
    return rs;
  }

  return Object.assign({}, rs, {
    modifiedAt: timestamp(modified.columnName, {
      mode: 'date',
      withTimezone: modified.withTimezone,
    })
      .defaultNow()
      .notNull()
      .$onUpdate(() => {
        return new Date();
      }),
  });
};
