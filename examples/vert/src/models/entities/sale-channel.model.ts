import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { boolean, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { SaleChannelProduct } from './sale-channel-product.model';

// ----------------------------------------------------------------
/**
 * SaleChannel model
 *
 * Demonstrates many-to-many relationship with Product through SaleChannelProduct.
 * - SaleChannel hasMany SaleChannelProduct
 */
@model({ type: 'entity' })
export class SaleChannel extends BaseEntity<typeof SaleChannel.schema> {
  static override schema = pgTable(
    'SaleChannel',
    {
      ...generateIdColumnDefs({ id: { dataType: 'string' } }),
      ...generateTzColumnDefs(),
      code: text('code').notNull(),
      name: text('name').notNull(),
      description: text('description'),
      isActive: boolean('is_active').notNull().default(true),
    },
    def => [
      unique('UQ_SaleChannel_code').on(def.code),
      index('IDX_SaleChannel_name').on(def.name),
      index('IDX_SaleChannel_isActive').on(def.isActive),
    ],
  );

  static override relations = (): TRelationConfig[] => [
    {
      name: 'saleChannelProducts',
      type: RelationTypes.MANY,
      schema: SaleChannelProduct.schema,
      metadata: {
        relationName: 'saleChannel', // Points to the 'one' relation name on SaleChannelProduct
      },
    },
  ];
}
