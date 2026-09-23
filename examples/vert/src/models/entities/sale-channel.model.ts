import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  many,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { boolean, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { saleChannelProductTable } from './sale-channel-product.model';

export const saleChannelTable = pgTable(
  'SaleChannel',
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
  },
  table => [
    unique('UQ_SaleChannel_code').on(table.code),
    index('IDX_SaleChannel_name').on(table.name),
    index('IDX_SaleChannel_isActive').on(table.isActive),
  ],
);

/** Many-to-many with Product through SaleChannelProduct. */
@model({ type: 'entity' })
export class SaleChannel extends ModelFactory.defineEntity({
  table: saleChannelTable,
  relations: () => ({
    saleChannelProducts: many(saleChannelProductTable, { relationName: 'saleChannel' }),
  }),
}) {}

export type TSaleChannel = TEntityObject<typeof SaleChannel>;
