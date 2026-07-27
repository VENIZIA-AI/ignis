import { getError } from '@venizia/ignis-helpers';
import type { PgIntegerBuilderInitial, PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { integer, text } from 'drizzle-orm/pg-core';
import { tryGetContext } from 'hono/context-storage';
import { Authentication } from '@/components/auth/authenticate/common';
import type {
  TColumnDefinitions,
  TUserAuditColumnOpts,
  TUserAuditEnricherOptions,
} from '../common/types';

export type TUserAuditEnricherResult<
  ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions,
> = ColumnDefinitions & {
  createdBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
  modifiedBy: PgIntegerBuilderInitial<string> | PgTextBuilderInitial<string, [string, ...string[]]>;
};

/** CAUTION: fire-and-forget promises may run outside async context, losing AUDIT_USER_ID. */
const getCurrentUserId = <T>(opts: { allowAnonymous: boolean; columnField: string }): T | null => {
  const context = tryGetContext();
  if (!context) {
    if (!opts.allowAnonymous) {
      throw getError({
        message: `[getCurrentUserId] Invalid request context to identify user | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous}`,
      });
    }

    return null;
  }

  const userId = context.get(Authentication.AUDIT_USER_ID);
  if (!userId && !opts.allowAnonymous) {
    throw getError({
      message: `[getCurrentUserId] No AUDIT_USER_ID found in request context | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous} | userId: ${userId}`,
    });
  }

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
      const userIdGetter = () =>
        getCurrentUserId<number>({
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
        getCurrentUserId<string>({
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
