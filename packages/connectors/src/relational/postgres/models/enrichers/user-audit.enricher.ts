import { getError } from '@venizia/ignis-helpers/core';
import type { PgIntegerBuilderInitial, PgTextBuilderInitial } from 'drizzle-orm/pg-core';
import { integer, text } from 'drizzle-orm/pg-core';
import { AuditUserResolver } from '@/relational/core/models/enrichers';
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

export class PostgresUserAuditEnricher {
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
    const defs = PostgresUserAuditEnricher.generateColumnDefs(enricherOpts);
    return { ...baseSchema, ...defs } as TUserAuditEnricherResult<ColumnDefinitions>;
  }
}

/** @deprecated Use PostgresUserAuditEnricher.generateColumnDefs(opts). Removed in 0.5. */
export const generateUserAuditColumnDefs = (opts?: TUserAuditEnricherOptions) =>
  PostgresUserAuditEnricher.generateColumnDefs(opts);

/** @deprecated Use PostgresUserAuditEnricher.enrich({ baseSchema, opts }). Removed in 0.5. */
export const enrichUserAudit = <ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions>(
  baseSchema: ColumnDefinitions,
  opts?: TUserAuditEnricherOptions,
): TUserAuditEnricherResult<ColumnDefinitions> =>
  PostgresUserAuditEnricher.enrich({ baseSchema, opts });
