import { integer, text } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export type TUserAuditEnricherOptions = {
  created?: { dataType: 'string' | 'number'; columnName: string };
  modified?: { dataType: 'string' | 'number'; columnName: string };
};

/* export type TUserAuditEnricherResult<ColumnDefinitions extends TColumns = TColumns> =
  ColumnDefinitions & {
    createdBy:
      | PgIntegerBuilderInitial<string>
      | PgTextBuilderInitial<string, [string, ...string[]]>;
    modifiedBy:
      | PgIntegerBuilderInitial<string>
      | PgTextBuilderInitial<string, [string, ...string[]]>;
  }; */

export const enrichUserAudit = <ColumnDefinitions extends TColumns = TColumns>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
) => {
  const {
    created = { dataType: 'number', columnName: 'created_by' },
    modified = { dataType: 'number', columnName: 'modified_by' },
  } = opts ?? {};

  const rs = Object.assign({}, baseSchema, {
    createdBy:
      created.dataType === 'number' ? integer(created.columnName) : text(created.columnName),
    modifiedBy:
      modified.dataType === 'number' ? integer(modified.columnName) : text(modified.columnName),
  });

  return rs;
};
