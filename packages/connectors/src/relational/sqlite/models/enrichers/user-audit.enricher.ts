import { AuditUserResolver } from '@/relational/core/models/enrichers';
import { getError } from '@venizia/ignis-helpers/core';
import type {
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import { integer, text } from 'drizzle-orm/sqlite-core';
import type {
  TColumnDefinitions,
  TUserAuditColumnOpts,
  TUserAuditEnricherOptions,
} from '../common/types';

type TSQLiteTextColumn = SQLiteTextBuilderInitial<string, [string, ...string[]], undefined>;

export type TUserAuditEnricherResult<
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
> = ColumnDefinitions & {
  createdBy: SQLiteIntegerBuilderInitial<string> | TSQLiteTextColumn;
  modifiedBy: SQLiteIntegerBuilderInitial<string> | TSQLiteTextColumn;
};

const buildUserAuditColumn = (opts: {
  columnOpts: TUserAuditColumnOpts;
  columnField: 'createdBy' | 'modifiedBy';
}) => {
  const { columnOpts, columnField } = opts;

  switch (columnOpts.dataType) {
    case 'number': {
      const col = integer(columnOpts.columnName).$type<number | null>();
      const userIdGetter = () =>
        AuditUserResolver.resolveAuditUserId<number>({
          columnField,
          allowAnonymous: columnOpts.allowAnonymous ?? true,
        });

      return columnField === 'createdBy'
        ? col.$default(userIdGetter)
        : col.$default(userIdGetter).$onUpdate(userIdGetter);
    }

    case 'string': {
      const col = text(columnOpts.columnName).$type<string | null>();
      const userIdGetter = () =>
        AuditUserResolver.resolveAuditUserId<string>({
          columnField,
          allowAnonymous: columnOpts.allowAnonymous ?? true,
        });

      return columnField === 'createdBy'
        ? col.$default(userIdGetter)
        : col.$default(userIdGetter).$onUpdate(userIdGetter);
    }

    default: {
      throw getError({
        message: `[enrichUserAudit] Invalid dataType for '${columnField}' | value: ${(columnOpts as TUserAuditColumnOpts).dataType} | valid: ['number', 'string']`,
      });
    }
  }
};

export class SqliteUserAuditEnricher {
  static generateColumnDefs(opts?: TUserAuditEnricherOptions) {
    const {
      created = { dataType: 'number', columnName: 'created_by', allowAnonymous: true },
      modified = { dataType: 'number', columnName: 'modified_by', allowAnonymous: true },
    } = opts ?? {};

    return {
      createdBy: buildUserAuditColumn({ columnOpts: created, columnField: 'createdBy' }),
      modifiedBy: buildUserAuditColumn({ columnOpts: modified, columnField: 'modifiedBy' }),
    };
  }

  static enrich<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(opts: {
    baseSchema: ColumnDefinitions;
    opts?: TUserAuditEnricherOptions;
  }): TUserAuditEnricherResult<ColumnDefinitions> {
    const { baseSchema, opts: enricherOpts } = opts;
    const defs = SqliteUserAuditEnricher.generateColumnDefs(enricherOpts);

    return { ...baseSchema, ...defs } as TUserAuditEnricherResult<ColumnDefinitions>;
  }
}

/** @deprecated Use SqliteUserAuditEnricher.generateColumnDefs(opts). Removed in 0.5. */
export const generateUserAuditColumnDefs = (opts?: TUserAuditEnricherOptions) =>
  SqliteUserAuditEnricher.generateColumnDefs(opts);

/** @deprecated Use SqliteUserAuditEnricher.enrich({ baseSchema, opts }). Removed in 0.5. */
export const enrichUserAudit = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions> =>
  SqliteUserAuditEnricher.enrich({ baseSchema, opts });
