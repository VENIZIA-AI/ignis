import { expect, test } from 'bun:test';
import { ScopeThrough } from '@venizia/ignis-kernel';
import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
import { many, ModelFactory, one } from '@/relational/postgres/models';

/** `tsc --noEmit` is the real gate here: a misused `@ts-expect-error` fails the build, not `bun test`. */
const productTable = pgTable('through_types_product', { id: serial('id').primaryKey() });
const variantTable = pgTable('through_types_variant', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => productTable.id),
});

const VariantBase = ModelFactory.defineEntity({
  table: variantTable,
  relations: () => ({
    product: one(productTable),
    siblings: many(variantTable, { relationName: 'product' }),
  }),
});

test('ScopeThrough.of takes the name of a one relation of the entity, and nothing else', () => {
  const through = ScopeThrough.of({ entity: VariantBase, relation: 'product' });
  const name: string = 'product';

  // @ts-expect-error - a misspelled relation does not compile
  ScopeThrough.of({ entity: VariantBase, relation: 'prodcut' });
  // @ts-expect-error - a to-many relation does not compile
  ScopeThrough.of({ entity: VariantBase, relation: 'siblings' });
  // @ts-expect-error - a name held in a plain string does not compile
  ScopeThrough.of({ entity: VariantBase, relation: name });

  expect(through.relation).toBe('product');
});
