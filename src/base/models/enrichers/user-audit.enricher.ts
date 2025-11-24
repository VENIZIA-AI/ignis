import { integer, text } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export const enrichUserAudit = (
  baseSchema: TColumns,
  opts?: {
    created?: { dataType: 'string' | 'number'; columnName: string };
    modified?: { dataType: 'string' | 'number'; columnName: string };
  },
): TColumns => {
  const {
    created = { dataType: 'number', columnName: 'created_by' },
    modified = { dataType: 'number', columnName: 'modified_by' },
  } = opts ?? {};

  return Object.assign({}, baseSchema, {
    createdBy:
      created.dataType === 'number' ? integer(created.columnName) : text(created.columnName),
    modifiedBy:
      modified.dataType === 'number' ? integer(modified.columnName) : text(modified.columnName),
  });
};
