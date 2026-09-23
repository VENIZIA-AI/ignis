import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  many,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { index, integer, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';
import { saleChannelProductTable } from './sale-channel-product.model';

export const productTable = pgTable(
  'Product',
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price: integer('price').notNull().default(0),
    tags: varchar('tags', { length: 100 }).array(),
  },
  table => [unique('UQ_Product_code').on(table.code), index('IDX_Product_name').on(table.name)],
);

/**
 * Many-to-many with SaleChannel through SaleChannelProduct. The default filter hides products with
 * no price; a query passes `skipDefaultFilter: true` to see them.
 */
@model({
  type: 'entity',
  settings: { defaultFilter: { where: { price: { gt: 0 } }, limit: 100 } },
})
export class Product extends ModelFactory.defineEntity({
  table: productTable,
  relations: () => ({
    saleChannelProducts: many(saleChannelProductTable, { relationName: 'product' }),
  }),
}) {}

export type TProduct = TEntityObject<typeof Product>;
