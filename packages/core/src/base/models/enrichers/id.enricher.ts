import { sql } from 'drizzle-orm';
import {
  bigint,
  integer,
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
        numberMode?: 'number' | 'bigint';
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
    ? { id: ReturnType<ReturnType<ReturnType<typeof text>['default']>['primaryKey']> }
    : IdOpts extends { dataType: 'number' }
      ? {
          id: ReturnType<
            ReturnType<ReturnType<typeof integer>['primaryKey']>['generatedAlwaysAsIdentity']
          >;
        }
      : IdOpts extends { dataType: 'big-number' }
        ? {
            id: ReturnType<
              ReturnType<ReturnType<typeof bigint>['primaryKey']>['generatedAlwaysAsIdentity']
            >;
          }
        : { id: ReturnType<ReturnType<ReturnType<typeof text>['default']>['primaryKey']> } // default to number
  : { id: ReturnType<ReturnType<ReturnType<typeof text>['default']>['primaryKey']> };

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
