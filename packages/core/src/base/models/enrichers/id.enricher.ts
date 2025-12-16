import { HasDefault, IsIdentity, IsPrimaryKey, NotNull, sql } from 'drizzle-orm';
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
    | { dataType: 'string' }
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

export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> =
  ColumnDefinitions & {
    id:
      | TPrimaryKey<PgTextBuilderInitial<'id', [string, ...string[]]>>
      | TPrimaryKey<PgIntegerBuilderInitial<'id'>>
      | TPrimaryKey<PgSerialBuilderInitial<'id'>>;
  };

type TIdColumnDef<Opts extends TIdEnricherOptions | undefined = undefined> = Opts extends {
  id: infer IdOpts;
}
  ? IdOpts extends { dataType: 'string' }
    ? { id: IsPrimaryKey<NotNull<HasDefault<PgTextBuilderInitial<'id', [string, ...string[]]>>>> }
    : IdOpts extends { dataType: 'number' }
      ? { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> }
      : IdOpts extends { dataType: 'big-number' }
        ? IdOpts extends { numberMode: 'number' }
          ? { id: IsIdentity<IsPrimaryKey<NotNull<PgBigInt53BuilderInitial<'id'>>>, 'always'> }
          : { id: IsIdentity<IsPrimaryKey<NotNull<PgBigInt64BuilderInitial<'id'>>>, 'always'> }
        : { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> }
  : { id: IsIdentity<IsPrimaryKey<NotNull<PgIntegerBuilderInitial<'id'>>>, 'always'> };

export const generateIdColumnDefs = <Opts extends TIdEnricherOptions | undefined>(
  opts?: Opts,
): TIdColumnDef<Opts> => {
  const { id = { dataType: 'number' } } = opts ?? {};

  switch (id.dataType) {
    case 'string': {
      return {
        id: text('id')
          .default(sql`uuid_generate_v4()`)
          .primaryKey(),
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
  return Object.assign({}, baseColumns, defs);
};
