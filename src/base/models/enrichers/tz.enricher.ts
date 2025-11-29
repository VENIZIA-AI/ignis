import { timestamp } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

/* export type TTzEnricherResult<ColumnDefinitions extends TColumns = TColumns> = ColumnDefinitions & {
  createdAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>>;
  modifiedAt?: NotNull<HasDefault<PgTimestampBuilderInitial<string>>>;
}; */

export const enrichTz = <ColumnDefinitions extends TColumns = TColumns>(
  baseSchema: ColumnDefinitions,
  opts?: TTzEnricherOptions,
) => {
  const {
    created = { columnName: 'created_at', withTimezone: true },
    modified = { enable: true, columnName: 'modified_at', withTimezone: true },
  } = opts ?? {};

  let rs = Object.assign({}, baseSchema, {
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

  rs = Object.assign({}, rs, {
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

  return rs;
};
