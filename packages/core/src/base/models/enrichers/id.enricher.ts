import { getError } from '@/helpers';
import {
  integer,
  PgIntegerBuilderInitial,
  PgSerialBuilderInitial,
  PgUUIDBuilderInitial,
  serial,
  uuid,
} from 'drizzle-orm/pg-core';
import { TColumnDefinitions, TPrimaryKey } from '../types';

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string' }
    | { dataType: 'number'; startWith?: number }
  );
};

export type TIdEnricherResult<ColumnDefinitions extends TColumnDefinitions = TColumnDefinitions> = ColumnDefinitions & {
  id:
    | TPrimaryKey<PgUUIDBuilderInitial<'id'>>
    | TPrimaryKey<PgIntegerBuilderInitial<'id'>>
    | TPrimaryKey<PgSerialBuilderInitial<'id'>>;
};

export const generateIdColumnDefs = (opts?: TIdEnricherOptions) => {
  const { id = { dataType: 'number' } } = opts ?? {};

  switch (id.dataType) {
    case 'string': {
      return { id: uuid('id').primaryKey() };
    }
    case 'number': {
      if (id.startWith !== null && id.startWith !== undefined) {
        return {
          id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: id.startWith }),
        };
      }

      return { id: serial('id').primaryKey() };
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
