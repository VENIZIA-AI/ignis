import { integer, serial, uuid } from 'drizzle-orm/pg-core';
import { TColumns, TEnricher } from '../types';

export type TIdEnricherOptions = {
  id?: { columnName?: string } & (
    | { dataType: 'string' }
    | { dataType: 'number'; startWith?: number }
  );
};

export const enrichId: TEnricher<TIdEnricherOptions> = (
  baseColumns: TColumns,
  opts?: TIdEnricherOptions,
): TColumns => {
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
      return Object.assign({}, baseColumns);
    }
  }
};
