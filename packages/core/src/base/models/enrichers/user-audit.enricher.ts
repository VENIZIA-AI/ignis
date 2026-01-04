import { getError } from '@venizia/ignis-helpers';
import { integer, PgIntegerBuilderInitial, PgTextBuilderInitial, text } from 'drizzle-orm/pg-core';
import { tryGetContext } from 'hono/context-storage';
import { Authentication } from '@/components/auth/authenticate/common';
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

/**
 * Get current user ID from Hono context storage.
 * Returns null if context unavailable (background jobs, migrations, tests).
 */
const getCurrentUserId = <T>(): T | null => {
  const context = tryGetContext();
  if (!context) {
    return null;
  }

  const userId = context.get(Authentication.AUDIT_USER_ID);
  return (userId as T) ?? null;
};

const buildUserAuditColumn = (opts: {
  columnOpts: TUserAuditColumnOpts;
  columnField: 'createdBy' | 'modifiedBy';
}) => {
  const { columnOpts, columnField } = opts;

  switch (columnOpts.dataType) {
    case 'number': {
      const col = integer(columnOpts.columnName).$type<number | null>();

      if (columnField === 'createdBy') {
        // Only set on creation
        return col.$default(() => getCurrentUserId());
      }

      // Set on creation AND update
      return col.$default(() => getCurrentUserId()).$onUpdate(() => getCurrentUserId());
    }

    case 'string': {
      const col = text(columnOpts.columnName).$type<string | null>();

      if (columnField === 'createdBy') {
        // Only set on creation
        return col.$default(() => getCurrentUserId());
      }

      // Set on creation AND update
      return col.$default(() => getCurrentUserId()).$onUpdate(() => getCurrentUserId());
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
