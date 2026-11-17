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

/** The column definitions with `createdBy` and `modifiedBy` user columns added. */
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

/** Adds `createdBy` and `modifiedBy` columns filled from the current audit user; `modifiedBy` is refreshed on update. A `dataType` other than `number` or `string` throws. */
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
