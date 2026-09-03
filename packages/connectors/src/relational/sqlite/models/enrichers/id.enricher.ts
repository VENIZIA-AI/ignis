import { CoreErrorCodes } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { HasDefault, HasRuntimeDefault, IsPrimaryKey, NotNull } from 'drizzle-orm';
import type {
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import { integer, text } from 'drizzle-orm/sqlite-core';
import type { TColumnDefinitions, TIdEnricherOptions } from '../common/types';

type TStringIdCol = HasRuntimeDefault<
  HasDefault<
    IsPrimaryKey<NotNull<SQLiteTextBuilderInitial<'id', [string, ...string[]], undefined>>>
  >
>;

// Drizzle marks an integer primary key `HasDefault` because SQLite fills the rowid itself.
type TNumberIdCol = IsPrimaryKey<HasDefault<NotNull<SQLiteIntegerBuilderInitial<'id'>>>>;

export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> =
  ColumnDefinitions & {
    id: TStringIdCol | TNumberIdCol;
  };

type TIdColumnDef<Opts extends TIdEnricherOptions | undefined = undefined> = Opts extends {
  id: infer IdOpts;
}
  ? IdOpts extends { dataType: 'string' }
    ? { id: TStringIdCol }
    : { id: TNumberIdCol }
  : { id: TNumberIdCol };

export const generateIdColumnDefs = <Opts extends TIdEnricherOptions | undefined>(
  opts?: Opts,
): TIdColumnDef<Opts> => {
  const { id = { dataType: 'number' } } = opts ?? {};

  switch (id.dataType) {
    case 'string': {
      return {
        id: text('id')
          .primaryKey()
          .$defaultFn(id.generator ?? (() => crypto.randomUUID())),
      } as TIdColumnDef<Opts>;
    }
    case 'number': {
      return {
        id: integer('id').primaryKey({ autoIncrement: id.autoIncrement ?? true }),
      } as TIdColumnDef<Opts>;
    }
    default: {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.NotImplemented,
        messageCode: CoreErrorCodes.NOT_SUPPORTED,
        message: `[enrichId] Id dataType '${(id as { dataType: string }).dataType}' is not supported on SQLite - it has no sequence, identity or bigint type; an INTEGER primary key is already a 64-bit rowid, so use dataType: 'number' or 'string'.`,
      });
    }
  }
};

export const enrichId = (baseColumns: TColumnDefinitions, opts?: TIdEnricherOptions) => {
  const defs = generateIdColumnDefs(opts);

  return { ...baseColumns, ...defs };
};
