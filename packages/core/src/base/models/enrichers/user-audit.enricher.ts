import { getError } from '@venizia/ignis-helpers';
import { integer, PgIntegerBuilderInitial, PgTextBuilderInitial, text } from 'drizzle-orm/pg-core';
import { TColumnDefinitions } from '../common/types';

type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';
  columnName: string;
};

export type TUserAuditEnricherOptions = {
  created?: TUserAuditColumnOpts;
  modified?: TUserAuditColumnOpts;
};

export type TUserAuditEnricherResult<
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
> = ColumnDefinitions & {
  createdBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
  modifiedBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
};

const buildUserAuditColumn = (opts: {
  columnOpts: TUserAuditColumnOpts;
  columnField: 'createdBy' | 'modifiedBy';
}) => {
  const { columnOpts, columnField } = opts;
  switch (columnOpts.dataType) {
    case 'number': {
      return integer(columnOpts.columnName);
    }
    case 'string': {
      return text(columnOpts.columnName);
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
    created = { dataType: 'number', columnName: 'created_by' },
    modified = { dataType: 'number', columnName: 'modified_by' },
  } = opts ?? {};

  return {
    createdBy: buildUserAuditColumn({
      columnOpts: created,
      columnField: 'createdBy',
    }),
    modifiedBy: buildUserAuditColumn({
      columnOpts: modified,
      columnField: 'modifiedBy',
    }),
  };
};

export const enrichUserAudit = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions> => {
  const defs = generateUserAuditColumnDefs(opts);
  return { ...baseSchema, ...defs } as TUserAuditEnricherResult<ColumnDefinitions>;
};
