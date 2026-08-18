import { resolveAuditUserId } from '@/relational/core/models/enrichers';
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
        resolveAuditUserId<number>({
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
        resolveAuditUserId<string>({
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

export const generateUserAuditColumnDefs = (opts?: TUserAuditEnricherOptions) => {
  const {
    created = { dataType: 'number', columnName: 'created_by', allowAnonymous: true },
    modified = { dataType: 'number', columnName: 'modified_by', allowAnonymous: true },
  } = opts ?? {};

  return {
    createdBy: buildUserAuditColumn({ columnOpts: created, columnField: 'createdBy' }),
    modifiedBy: buildUserAuditColumn({ columnOpts: modified, columnField: 'modifiedBy' }),
  };
};

export const enrichUserAudit = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions> => {
  const defs = generateUserAuditColumnDefs(opts);

  return { ...baseSchema, ...defs } as TUserAuditEnricherResult<ColumnDefinitions>;
};
