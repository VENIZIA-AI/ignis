import type { HasDefault, NotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { TColumnDefinitions, TTzEnricherOptions } from '../common/types';
import { isoTimestamp } from '../common/columns';

type TIsoTimestampColumn = ReturnType<typeof isoTimestamp>;

// `undefined` is the third state - the option key was left out entirely, so the enricher default
// decides. An options object that omits only `enable` is opted in: `{ enable?: true }` alone would
// resolve it to `undefined` here, because weak-type detection rejects a member with no `enable`.
type TIsEnabled<T> = T extends { enable: false } ? false : T extends object ? true : undefined;

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

export class PostgresTzEnricher {
  static generateColumnDefs<Opts extends TTzEnricherOptions | undefined>(
    opts?: Opts,
  ): TTzEnricherResult<Opts> {
    const {
      created = { columnName: 'created_at', withTimezone: true },
      modified = { enable: true, columnName: 'modified_at', withTimezone: true },
      deleted = { enable: false },
    } = opts ?? {};

    let rs = {
      createdAt: isoTimestamp(created.columnName, {
        withTimezone: created.withTimezone,
      })
        .default(sql`NOW()`)
        .notNull(),
    } as TTzEnricherResult<Opts>;

    if (modified.enable !== false) {
      rs = {
        ...rs,
        modifiedAt: isoTimestamp(modified.columnName, {
          withTimezone: modified.withTimezone,
        })
          .default(sql`NOW()`)
          .notNull()
          .$onUpdate(() => new Date().toISOString()),
      } as TTzEnricherResult<Opts>;
    }

    if (deleted.enable !== false) {
      rs = {
        ...rs,
        deletedAt: isoTimestamp(deleted.columnName, {
          withTimezone: deleted.withTimezone,
        }),
      } as TTzEnricherResult<Opts>;
    }

    return rs;
  }

  static enrich(opts: { baseSchema: TColumnDefinitions; opts?: TTzEnricherOptions }) {
    const { baseSchema, opts: enricherOpts } = opts;
    const defs = PostgresTzEnricher.generateColumnDefs(enricherOpts);
    return { ...baseSchema, ...defs };
  }
}

/** @deprecated Use PostgresTzEnricher.generateColumnDefs(opts). Removed in 0.5. */
export const generateTzColumnDefs = <Opts extends TTzEnricherOptions | undefined>(
  opts?: Opts,
): TTzEnricherResult<Opts> => PostgresTzEnricher.generateColumnDefs(opts);

/** @deprecated Use PostgresTzEnricher.enrich({ baseSchema, opts }). Removed in 0.5. */
export const enrichTz = (baseSchema: TColumnDefinitions, opts?: TTzEnricherOptions) =>
  PostgresTzEnricher.enrich({ baseSchema, opts });
