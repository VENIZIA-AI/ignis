import { HasDefault, NotNull } from 'drizzle-orm';
import { PgTimestampBuilderInitial, timestamp } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../common/types';

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

type IsEnabled<T> = T extends { enable: false }
  ? false
  : T extends { enable?: true }
    ? true
    : undefined;

export type TTzEnricherResult<Opts extends TTzEnricherOptions | undefined = undefined> = {
  createdAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>>;
} & (Opts extends TTzEnricherOptions
  ? IsEnabled<Opts['modified']> extends true
    ? { modifiedAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>> }
    : IsEnabled<Opts['modified']> extends false
      ? {}
      : { modifiedAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>> } // default for undefined modified
  : { modifiedAt: NotNull<HasDefault<PgTimestampBuilderInitial<string>>> }) & // default when opts is undefined
  (Opts extends TTzEnricherOptions
    ? IsEnabled<Opts['deleted']> extends true
      ? { deletedAt: PgTimestampBuilderInitial<string> }
      : {}
    : {}); // no deletedAt when opts is undefined

export const generateTzColumnDefs = <Opts extends TTzEnricherOptions | undefined>(
  opts?: Opts,
): TTzEnricherResult<Opts> => {
  const {
    created = { columnName: 'created_at', withTimezone: true },
    modified = { enable: true, columnName: 'modified_at', withTimezone: true },
    deleted = { enable: false },
  } = opts ?? {};

  let rs = {
    createdAt: timestamp(created.columnName, {
      mode: 'date',
      withTimezone: created.withTimezone,
    })
      .defaultNow()
      .notNull(),
  } as TTzEnricherResult<Opts>;

  if (modified.enable) {
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
  }

  if (deleted.enable) {
    rs = Object.assign({}, rs, {
      deletedAt: timestamp(deleted.columnName, {
        mode: 'date',
        withTimezone: deleted.withTimezone,
      }),
    });
  }

  return rs;
};

export const enrichTz = (baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions) => {
  const defs = generateTzColumnDefs(opts);
  return Object.assign({}, baseSchema, defs);
};
