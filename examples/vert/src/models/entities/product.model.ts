import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { index, integer, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';
import { SaleChannelProduct } from './sale-channel-product.model';

// ----------------------------------------------------------------
/**
 * Product model
 *
 * Demonstrates many-to-many relationship with SaleChannel through SaleChannelProduct.
 * - Product hasMany SaleChannelProduct
 */
@model({ type: 'entity' })
export class Product extends BaseEntity<typeof Product.schema> {
  static override schema = pgTable(
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
    def => [unique('UQ_Product_code').on(def.code), index('IDX_Product_name').on(def.name)],
  );

  static override relations = (): TRelationConfig[] => [
    {
      name: 'saleChannelProducts',
      type: RelationTypes.MANY,
      schema: SaleChannelProduct.schema,
      metadata: {
        relationName: 'product', // Points to the 'one' relation name on SaleChannelProduct
      },
    },
  ];
}
