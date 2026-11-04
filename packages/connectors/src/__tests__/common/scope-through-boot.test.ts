import {
  AbstractEntity,
  MetadataRegistry,
  RelationTypes,
  ScopeThrough,
} from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';
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

/** An entity that declares no relations: the types accept no name for it, so every test name is built at runtime. */
const NO_RELATIONS = { relationDefinitions: undefined };

const through = (relation: string) => {
  // @ts-expect-error - a name built at runtime skips the types; the boot check is what catches it
  return ScopeThrough.of({ entity: NO_RELATIONS, relation });
};

const oneOf = (opts: { name: string; schema: TTableSchemaWithId }): TRelationConfig => {
  return { name: opts.name, type: RelationTypes.ONE, schema: opts.schema };
};

const registry = MetadataRegistry.getInstance();

/** Registered under the table name, the way a model is, so the parent is found by the same lookup the repository uses. */
const register = (opts: {
  schema: TTableSchemaWithId;
  access: object;
  relations?: TRelationConfig[];
}) => {
  registry.getAllModels().set(getTableName(opts.schema), {
    target: Entity as never,
    metadata: { settings: { access: opts.access } } as never,
    schema: opts.schema,
    relationsResolver: () => opts.relations ?? [],
  } as never);
};

const parent = () => register({ schema: productTable, access: { resolve: () => null } });

const child = (opts: {
  schema: TTableSchemaWithId;
  relation: string;
  target: TTableSchemaWithId;
}) => {
  register({
    schema: opts.schema,
    access: { through: through(opts.relation) },
    relations: [oneOf({ name: opts.relation, schema: opts.target })],
  });
};

const check = (logger?: RecordingLogger) => {
  ScopeFilterUtility.assertScopeFilterSupported({ asyncContextEnabled: true, logger });
};

describe('ScopeFilterUtility.assertScopeFilterSupported - access.through', () => {
  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('passes for a chain of two hops that ends in a resolver', () => {
    parent();
    child({ schema: variantTable, relation: 'product', target: productTable });
    child({ schema: optionTable, relation: 'variant', target: variantTable });

    expect(check).not.toThrow();
  });

  test('refuses a model that declares both a resolver and a through, or neither', () => {
    register({
      schema: variantTable,
      access: { resolve: () => null, through: through('product') },
    });
    expect(check).toThrow(/boot_variant.*resolve or through/);

    registry.getAllModels().clear();
    register({ schema: variantTable, access: {} });
    expect(check).toThrow(/boot_variant.*resolve or through/);
  });

  test('refuses columns and write on a through model', () => {
    parent();
    register({
      schema: variantTable,
      access: { through: through('product'), columns: ['productId'] },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });

    expect(check).toThrow(/boot_variant.*columns and write/);
  });

  test('refuses onMissing on a through model: a parent that resolves no scope always denies', () => {
    parent();
    register({
      schema: variantTable,
      access: { through: through('product'), onMissing: 'allow' },
      relations: [oneOf({ name: 'product', schema: productTable })],
    });

    expect(check).toThrow(/boot_variant.*onMissing/);
  });

  test('refuses a relation the model does not declare, and names it', () => {
    parent();
    register({ schema: variantTable, access: { through: through('prodcut') } });

    expect(check).toThrow(/boot_variant.*prodcut/);
  });

  test('refuses a to-many relation', () => {
    parent();
    register({
      schema: productTable,
      access: { through: through('variants') },
      relations: [
        {
          name: 'variants',
          type: RelationTypes.MANY,
          schema: variantTable,
          metadata: { relationName: 'product' },
        },
      ],
    });

    expect(check).toThrow(/boot_product.*variants/);
  });

  test('refuses a parent that has no access of its own', () => {
    register({ schema: productTable, access: { resolve: () => null } });
    registry.getAllModels().get('boot_product')!.metadata = { settings: {} } as never;
    child({ schema: variantTable, relation: 'product', target: productTable });

    expect(check).toThrow(/boot_variant.*no access/);
  });

  test('refuses a cycle', () => {
    child({ schema: categoryTable, relation: 'parent', target: categoryTable });

    expect(check).toThrow(/boot_category.*cycle/);
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
        schema: table,
        access: { through: through('parent') },
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

    expect(check).toThrow(/boot_level_6.*deeper than 5/);

    registry.getAllModels().delete('boot_level_6');

    expect(check).not.toThrow();
  });

  test('warns, without failing, when the foreign key has no index', () => {
    parent();
    child({ schema: looseVariantTable, relation: 'product', target: productTable });
    const logger = new RecordingLogger();

    expect(() => check(logger)).not.toThrow();
    expect(logger.countAt({ level: 'warn' })).toBe(1);
    expect(logger.calls[0].args[0]).toBe('boot_loose_variant');
  });

  test('does not warn when the foreign key is indexed', () => {
    parent();
    child({ schema: variantTable, relation: 'product', target: productTable });
    const logger = new RecordingLogger();

    check(logger);

    expect(logger.countAt({ level: 'warn' })).toBe(0);
  });
});
