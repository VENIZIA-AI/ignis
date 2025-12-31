import { HasDefault, HasRuntimeDefault, IsIdentity, IsPrimaryKey, NotNull } from 'drizzle-orm';
import {
  bigint,
  integer,
  PgBigInt53BuilderInitial,
  PgBigInt64BuilderInitial,
  PgIntegerBuilderInitial,
  PgSequenceOptions,
  PgSerialBuilderInitial,
  PgTextBuilderInitial,
  text,
} from 'drizzle-orm/pg-core';
import { TColumnDefinitions, TPrimaryKey } from '../common/types';
import { getError } from '@venizia/ignis-helpers';

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string'; generator?: () => string }
    | {
        dataType: 'number';
        sequenceOptions?: PgSequenceOptions;
      }
    | {
        dataType: 'big-number';
        numberMode: 'number' | 'bigint';
        sequenceOptions?: PgSequenceOptions;
      }
  );
};

// Type aliases for id column definitions
type TStringIdCol = HasRuntimeDefault<
  HasDefault<IsPrimaryKey<NotNull<PgTextBuilderInitial<'id', [string, ...string[]]>>>>
>;
type TNumberIdCol = IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'>;
type TBigInt53IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt53BuilderInitial<'id'>>>, 'always'>;
type TBigInt64IdCol = IsIdentity<IsPrimaryKey<NotNull<PgBigInt64BuilderInitial<'id'>>>, 'always'>;

export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> =
  ColumnDefinitions & {
    id: TStringIdCol | TNumberIdCol | TPrimaryKey<PgSerialBuilderInitial<'id'>>;
  };

type TIdColumnDef<Opts extends TIdEnricherOptions | undefined = undefined> = Opts extends {
  id: infer IdOpts;
}
  ? IdOpts extends { dataType: 'string' }
    ? { id: TStringIdCol }
    : IdOpts extends { dataType: 'number' }
      ? { id: TNumberIdCol }
      : IdOpts extends { dataType: 'big-number' }
        ? IdOpts extends { numberMode: 'number' }
          ? { id: TBigInt53IdCol }
          : { id: TBigInt64IdCol }
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
        id: integer('id').primaryKey().generatedAlwaysAsIdentity(id.sequenceOptions),
      } as TIdColumnDef<Opts>;
    }
    case 'big-number': {
      return {
        id: bigint('id', { mode: id.numberMode ?? 'number' })
          .primaryKey()
          .generatedAlwaysAsIdentity(id.sequenceOptions),
      } as TIdColumnDef<Opts>;
    }
    default: {
      throw getError({
        message: `[enrichId] Invalid id dataType`,
      });
    }
  }
};

export const enrichId = (baseColumns: TColumnDefinitions, opts?: TIdEnricherOptions) => {
  const defs = generateIdColumnDefs(opts);
  return { ...baseColumns, ...defs };
};
