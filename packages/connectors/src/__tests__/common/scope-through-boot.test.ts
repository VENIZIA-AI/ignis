import {
  AbstractEntity,
  MetadataRegistry,
  RelationTypes,
  ScopeThroughBrand,
  type IScopeThrough,
} from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { index, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { ScopeFilterUtility } from '@/common';
import type { TTableSchemaWithId } from '@/relational/core/models/common';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { RecordingLogger } from '../relational/transaction/recording-logger';

/**
 * A `through` declaration that cannot work fails at boot, naming the model: a name built at runtime
 * skips the types, and a bad chain would otherwise show up as a wrong scope.
 */
const productTable = pgTable('boot_product', {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
});

const variantTable = pgTable(
  'boot_variant',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references((): AnyPgColumn => productTable.id),
  },
  (table) => [index('boot_variant_product_idx').on(table.productId)],
);

const optionTable = pgTable('boot_option', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id')
    .notNull()
    .references((): AnyPgColumn => variantTable.id),
});

/** A table whose parent is itself: the smallest real cycle. */
const categoryTable = pgTable(
  'boot_category',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id').references((): AnyPgColumn => categoryTable.id),
  },
  (table) => [index('boot_category_parent_idx').on(table.parentId)],
);

/** The same child with no index on its foreign key. */
const looseVariantTable = pgTable('boot_loose_variant', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references((): AnyPgColumn => productTable.id),
});

class Entity extends AbstractEntity {
  getSchema<T = unknown>(): T {
    return {} as T;
  }
}

const brand = (relation: string): IScopeThrough => {
  return { [ScopeThroughBrand.KEY]: true, relation };
};

const oneOf = (opts: { name: string; schema: TTableSchemaWithId }): TRelationConfig => {
  return { name: opts.name, type: RelationTypes.ONE, schema: opts.schema };
};

const registry = MetadataRegistry.getInstance();

const register = (opts: {
  name: string;
  schema: object;
  access: object;
  relations?: TRelationConfig[];
}) => {
  registry.getAllModels().set(opts.name, {
    target: Entity as never,
    metadata: { settings: { access: opts.access } } as never,
    schema: opts.schema,
    relationsResolver: () => opts.relations ?? [],
  } as never);
};

const parent = () =>
  register({ name: 'Product', schema: productTable, access: { resolve: () => null } });

const check = (logger?: RecordingLogger) => {
  ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true, logger });
};

describe('ScopeFilterUtility.assertScopeFilterSupported - access.through', () => {
  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('passes for a chain of two hops that ends in a resolver', () => {
    parent();
    register({
      name: 'Variant',
      schema: variantTable,
      access: { through: brand('product') },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });
    register({
      name: 'Option',
      schema: optionTable,
      access: { through: brand('variant') },
      relations: [oneOf({ name: 'variant', schema: variantTable })],
    });

    expect(check).not.toThrow();
  });

  test('refuses a model that declares both a resolver and a through, or neither', () => {
    register({
      name: 'Both',
      schema: variantTable,
      access: { resolve: () => null, through: brand('product') },
    });
    expect(check).toThrow(/Both.*resolve or through/);

    registry.getAllModels().clear();
    register({ name: 'Neither', schema: variantTable, access: { onMissing: 'deny' } });
    expect(check).toThrow(/Neither.*resolve or through/);
  });

  test('refuses columns and write on a through model', () => {
    parent();
    register({
      name: 'Variant',
      schema: variantTable,
      access: { through: brand('product'), columns: ['productId'] },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });

    expect(check).toThrow(/Variant.*columns and write/);
  });

  test('refuses a relation the model does not declare, and names it', () => {
    parent();
    register({ name: 'Variant', schema: variantTable, access: { through: brand('prodcut') } });

    expect(check).toThrow(/Variant.*prodcut/);
  });

  test('refuses a to-many relation', () => {
    parent();
    register({
      name: 'Product',
      schema: productTable,
      access: { through: brand('variants') },
      relations: [
        {
          name: 'variants',
          type: RelationTypes.MANY,
          schema: variantTable,
          metadata: { relationName: 'product' },
        },
      ],
    });

    expect(check).toThrow(/Product.*variants/);
  });

  test('refuses a parent that has no access of its own', () => {
    register({ name: 'Product', schema: productTable, access: { resolve: () => null } });
    registry.getAllModels().get('Product')!.metadata = { settings: {} } as never;
    register({
      name: 'Variant',
      schema: variantTable,
      access: { through: brand('product') },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });

    expect(check).toThrow(/Variant.*no access/);
  });

  test('refuses a cycle', () => {
    register({
      name: 'Category',
      schema: categoryTable,
      access: { through: brand('parent') },
      relations: [oneOf({ name: 'parent', schema: categoryTable })],
    });

    expect(check).toThrow(/Category.*cycle/);
  });

  test('refuses a chain longer than the limit and passes one at the limit', () => {
    const chain: TTableSchemaWithId[] = [productTable];

    parent();

    for (let level = 1; level <= 6; level++) {
      const table = pgTable(`boot_level_${level}`, {
        id: serial('id').primaryKey(),
        parentId: integer('parent_id').notNull(),
      });
      const above = chain[level - 1];

      chain.push(table);
      register({
        name: `Level${level}`,
        schema: table,
        access: { through: brand('parent') },
        relations: [
          {
            name: 'parent',
            type: RelationTypes.ONE,
            schema: above,
            metadata: { fields: [table.parentId], references: [above.id] },
          },
        ],
      });
    }

    expect(check).toThrow(/Level6.*deeper than 5/);

    registry.getAllModels().delete('Level6');

    expect(check).not.toThrow();
  });

  test('warns, without failing, when the foreign key has no index', () => {
    parent();
    register({
      name: 'LooseVariant',
      schema: looseVariantTable,
      access: { through: brand('product') },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });
    const logger = new RecordingLogger();

    expect(() => check(logger)).not.toThrow();
    expect(logger.countAt({ level: 'warn' })).toBe(1);
    expect(logger.calls[0].args[0]).toBe('LooseVariant');
  });

  test('does not warn when the foreign key is indexed', () => {
    parent();
    register({
      name: 'Variant',
      schema: variantTable,
      access: { through: brand('product') },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });
    const logger = new RecordingLogger();

    check(logger);

    expect(logger.countAt({ level: 'warn' })).toBe(0);
  });
});
