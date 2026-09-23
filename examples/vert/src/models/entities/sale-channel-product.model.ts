import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  one,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { productTable } from './product.model';
import { saleChannelTable } from './sale-channel.model';

/** The junction table between Product and SaleChannel. */
export const saleChannelProductTable = pgTable(
  'SaleChannelProduct',
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    productId: text('product_id').notNull(),
    saleChannelId: text('sale_channel_id').notNull(),
  },
  table => [
    unique('UQ_SaleChannelProduct_productId_saleChannelId').on(
      table.productId,
      table.saleChannelId,
    ),
    index('IDX_SaleChannelProduct_productId').on(table.productId),
    index('IDX_SaleChannelProduct_saleChannelId').on(table.saleChannelId),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productTable.id],
      name: 'FK_SaleChannelProduct_productId_Product_id',
    }),
    foreignKey({
      columns: [table.saleChannelId],
      foreignColumns: [saleChannelTable.id],
      name: 'FK_SaleChannelProduct_saleChannelId_SaleChannel_id',
    }),
  ],
);

/** Each `one()` reads its columns off the matching foreign key. */
@model({ type: 'entity' })
export class SaleChannelProduct extends ModelFactory.defineEntity({
  table: saleChannelProductTable,
  relations: () => ({ product: one(productTable), saleChannel: one(saleChannelTable) }),
}) {}

export type TSaleChannelProduct = TEntityObject<typeof SaleChannelProduct>;
