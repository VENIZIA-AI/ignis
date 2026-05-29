import { HasDefault, NotNull, sql } from 'drizzle-orm';
import { TColumnDefinitions } from '../common/types';
import { isoTimestamp } from '../common/columns';

type TIsoTimestampColumn = ReturnType<typeof isoTimestamp>;

export type TTzEnricherOptions = {
  created?: { columnName: string; withTimezone: boolean };
  modified?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
  deleted?: { enable: false } | { enable?: true; columnName: string; withTimezone: boolean };
};

type TIsEnabled<T> = T extends { enable: false }
  ? false
  : T extends { enable?: true }
    ? true
    : undefined;

export type TTzEnricherResult<Opts extends TTzEnricherOptions | undefined = undefined> = {
  createdAt: NotNull<HasDefault<TIsoTimestampColumn>>;
} & (Opts extends TTzEnricherOptions
  ? TIsEnabled<Opts['modified']> extends true
    ? { modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>> }
    : TIsEnabled<Opts['modified']> extends false
      ? {}
      : { modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>> } // default for undefined modified
  : { modifiedAt: NotNull<HasDefault<TIsoTimestampColumn>> }) & // default when opts is undefined
  (Opts extends TTzEnricherOptions
    ? TIsEnabled<Opts['deleted']> extends true
      ? { deletedAt: TIsoTimestampColumn }
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
    createdAt: isoTimestamp(created.columnName, {
      withTimezone: created.withTimezone,
    })
      // .default(new Date().toISOString())
      .default(sql`NOW()`)
      .notNull(),
  } as TTzEnricherResult<Opts>;

  if (modified.enable) {
    rs = {
      ...rs,
      modifiedAt: isoTimestamp(modified.columnName, {
        withTimezone: modified.withTimezone,
      })
        // .default(new Date().toISOString())
        .default(sql`NOW()`)
        .notNull()
        .$onUpdate(() => new Date().toISOString()),
    } as TTzEnricherResult<Opts>;
  }

  if (deleted.enable) {
    rs = {
      ...rs,
      deletedAt: isoTimestamp(deleted.columnName, {
        withTimezone: deleted.withTimezone,
      }),
    } as TTzEnricherResult<Opts>;
  }

  return rs;
};

export const enrichTz = (baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions) => {
  const defs = generateTzColumnDefs(opts);
  return { ...baseSchema, ...defs };
};
