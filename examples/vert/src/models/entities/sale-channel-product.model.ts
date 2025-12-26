import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { Product } from './product.model';
import { SaleChannel } from './sale-channel.model';

// ----------------------------------------------------------------
/**
 * SaleChannelProduct model (Junction Table)
 *
 * Implements many-to-many relationship between Product and SaleChannel.
 * - SaleChannelProduct belongsTo Product
 * - SaleChannelProduct belongsTo SaleChannel
 */
@model({ type: 'entity' })
export class SaleChannelProduct extends BaseEntity<typeof SaleChannelProduct.schema> {
  static override schema = pgTable(
    'SaleChannelProduct',
    {
      ...generateIdColumnDefs({ id: { dataType: 'string' } }),
      ...generateTzColumnDefs(),
      productId: uuid('product_id').notNull(),
      saleChannelId: uuid('sale_channel_id').notNull(),
    },
    def => [
      // Unique constraint to prevent duplicate product-channel combinations
      unique('UQ_SaleChannelProduct_productId_saleChannelId').on(def.productId, def.saleChannelId),
      // Indexes for faster lookups
      index('IDX_SaleChannelProduct_productId').on(def.productId),
      index('IDX_SaleChannelProduct_saleChannelId').on(def.saleChannelId),
      // Foreign keys
      foreignKey({
        columns: [def.productId],
        foreignColumns: [Product.schema.id],
        name: 'FK_SaleChannelProduct_productId_Product_id',
      }),
      foreignKey({
        columns: [def.saleChannelId],
        foreignColumns: [SaleChannel.schema.id],
        name: 'FK_SaleChannelProduct_saleChannelId_SaleChannel_id',
      }),
    ],
  );

  static override relations = (): TRelationConfig[] => [
    {
      name: 'product',
      type: RelationTypes.ONE,
      schema: Product.schema,
      metadata: {
        fields: [SaleChannelProduct.schema.productId],
        references: [Product.schema.id],
      },
    },
    {
      name: 'saleChannel',
      type: RelationTypes.ONE,
      schema: SaleChannel.schema,
      metadata: {
        fields: [SaleChannelProduct.schema.saleChannelId],
        references: [SaleChannel.schema.id],
      },
    },
  ];
}
