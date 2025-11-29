import { getError } from '@/helpers';
import { integer, serial, uuid } from 'drizzle-orm/pg-core';
import { TColumns } from '../types';

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string' }
    | { dataType: 'number'; startWith?: number }
  );
};

/* export type TIdEnricherResult<ColumnDefinitions extends TColumns = TColumns> = ColumnDefinitions & {
  id:
    | TPrimaryKey<PgUUIDBuilderInitial<'id'>>
    | TPrimaryKey<PgIntegerBuilderInitial<'id'>>
    | TPrimaryKey<PgSerialBuilderInitial<'id'>>;
}; */

export const enrichId = <ColumnDefinitions extends TColumns = TColumns>(
  baseColumns: ColumnDefinitions,
  opts?: TIdEnricherOptions,
) => {
  const { id = { dataType: 'number' } } = opts ?? {};

  switch (id.dataType) {
    case 'string': {
      return Object.assign({}, baseColumns, {
        id: uuid('id').primaryKey(),
      });
    }
    case 'number': {
      if (id.startWith !== null && id.startWith !== undefined) {
        return Object.assign({}, baseColumns, {
          id: integer('id').primaryKey().generatedAlwaysAsIdentity({
            startWith: id.startWith,
          }),
        });
      }

      return Object.assign({}, baseColumns, {
        id: serial('id').primaryKey(),
      });
    }
    default: {
      throw getError({
        message: `[enrichId] Invalid id dataType`,
      });
    }
  }
};
