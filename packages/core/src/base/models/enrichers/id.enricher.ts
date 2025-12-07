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
import { getError } from '@vez/ignis-helpers';

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string' }
    | {
        dataType: 'number' | 'big-number';
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

export const generateIdColumnDefs = (opts?: TIdEnricherOptions) => {
  const { id = { dataType: 'number' } } = opts ?? {};

  switch (id.dataType) {
    case 'string': {
      return {
        id: text('id')
          .default(sql`uuid_generate_v4()`)
          .primaryKey(),
      };
    }
    case 'number': {
      return {
        id: integer('id').primaryKey().generatedAlwaysAsIdentity(id.sequenceOptions),
      };
    }
    case 'big-number': {
      const numberMode = id.numberMode ?? 'number';

      return {
        id: bigint('id', { mode: numberMode })
          .primaryKey()
          .generatedAlwaysAsIdentity(id.sequenceOptions),
      };
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
