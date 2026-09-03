import {
  datasource,
  DEFAULT_LIMIT,
  MetadataRegistry,
  model,
  RelationTypes,
  ScopeFilterMissingBehaviors,
} from '@venizia/ignis-kernel';
import { createRelations } from '@/relational/core/repositories/dialect/relation';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * `@model` settings.scopeFilter reaches every repository verb (see `pglite-scope-filter.test.ts`)
 * but NEVER reached a relation loaded through `include` - `toInclude()` only ever read
 * `defaultFilter`. A tenant-scoped parent with `include: [...]` handed back every OTHER tenant's
 * child rows. This file proves the leak was real (the `openProducts` sibling relation below has no
 * `scopeFilter` and is the permanent positive control) and that `toInclude()` now closes it by
 * resolving each relation's OWN `scopeFilter` from its OWN `@model` settings.
 */
const MERCHANT_TABLE = 'scope_include_merchant';
const PRODUCT_TABLE = 'scope_include_product';
const PRODUCT_OPEN_TABLE = 'scope_include_product_open';
const PRODUCT_ALLOW_TABLE = 'scope_include_product_allow';
const REVIEW_TABLE = 'scope_include_review';

const merchantTable = pgTable(MERCHANT_TABLE, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
});

const productTable = pgTable(PRODUCT_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id').notNull(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
});

/** Identical shape to `productTable`, deliberately given no `scopeFilter` - the sibling relation that proves a leak is possible and stays unaffected by this fix. */
const productOpenTable = pgTable(PRODUCT_OPEN_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id').notNull(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
});

/** Same shape again, scoped with `onMissing: 'allow'` - the opt-out branch. */
const productAllowTable = pgTable(PRODUCT_ALLOW_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: integer('merchant_id').notNull(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
});

/** A relation of a relation - child of `productTable` - to prove nested `include` is scoped too. */
const reviewTable = pgTable(REVIEW_TABLE, {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull(),
  tenant: text('tenant').notNull(),
  body: text('body').notNull(),
});

const merchantRelationsConfig: TRelationConfig[] = [
  {
    name: 'products',
    type: RelationTypes.MANY,
    schema: productTable,
    metadata: { relationName: 'merchantOfProduct' },
  },
  {
    name: 'openProducts',
    type: RelationTypes.MANY,
    schema: productOpenTable,
    metadata: { relationName: 'merchantOfProductOpen' },
  },
  {
    name: 'allowProducts',
    type: RelationTypes.MANY,
    schema: productAllowTable,
    metadata: { relationName: 'merchantOfProductAllow' },
  },
];

const productRelationsConfig: TRelationConfig[] = [
  {
    name: 'merchantOfProduct',
    type: RelationTypes.ONE,
    schema: merchantTable,
    metadata: { fields: [productTable.merchantId], references: [merchantTable.id] },
  },
  {
    name: 'reviews',
    type: RelationTypes.MANY,
    schema: reviewTable,
    metadata: { relationName: 'productOfReview' },
  },
];

const productOpenRelationsConfig: TRelationConfig[] = [
  {
    name: 'merchantOfProductOpen',
    type: RelationTypes.ONE,
    schema: merchantTable,
    metadata: { fields: [productOpenTable.merchantId], references: [merchantTable.id] },
  },
];

const productAllowRelationsConfig: TRelationConfig[] = [
  {
    name: 'merchantOfProductAllow',
    type: RelationTypes.ONE,
    schema: merchantTable,
    metadata: { fields: [productAllowTable.merchantId], references: [merchantTable.id] },
  },
];

const reviewRelationsConfig: TRelationConfig[] = [
  {
    name: 'productOfReview',
    type: RelationTypes.ONE,
    schema: productTable,
    metadata: { fields: [reviewTable.productId], references: [productTable.id] },
  },
];

class ScopeResolutionError extends Error {}

/** `'__throw__'` simulates a resolver failure; `null` simulates "no request context" (onMissing: deny). */
type TTenantState = TNullable<string> | '__throw__';

let currentMerchantTenant: TTenantState = 'tenant-a';
let currentProductTenant: TTenantState = 'tenant-a';
let currentAllowProductTenant: TNullable<string> = null;
let currentReviewTenant: TTenantState = 'tenant-a';

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        if (currentMerchantTenant === '__throw__') {
          throw new ScopeResolutionError('merchant scope resolution blew up');
        }
        return currentMerchantTenant == null
          ? currentMerchantTenant
          : { tenant: currentMerchantTenant };
      },
    },
  },
})
class ScopeIncludeMerchantEntity extends BasePostgresEntity {
  static override TABLE_NAME = MERCHANT_TABLE;
  static override schema = merchantTable;
  static override relations = (): TRelationConfig[] => merchantRelationsConfig;
}

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        if (currentProductTenant === '__throw__') {
          throw new ScopeResolutionError('product scope resolution blew up');
        }
        return currentProductTenant == null
          ? currentProductTenant
          : { tenant: currentProductTenant };
      },
    },
    // Exercises "shouldSkipDefaultFilter bypasses defaultFilter, never scopeFilter" from the relation side.
    defaultFilter: { where: { name: { neq: 'hidden-by-default' } } },
  },
})
class ScopeIncludeProductEntity extends BasePostgresEntity {
  static override TABLE_NAME = PRODUCT_TABLE;
  static override schema = productTable;
  static override relations = (): TRelationConfig[] => productRelationsConfig;
}

/** No `settings.scopeFilter` at all - the control group for "a child with no scopeFilter is unaffected". */
@model({ type: 'entity' })
class ScopeIncludeProductOpenEntity extends BasePostgresEntity {
  static override TABLE_NAME = PRODUCT_OPEN_TABLE;
  static override schema = productOpenTable;
  static override relations = (): TRelationConfig[] => productOpenRelationsConfig;
}

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () =>
        currentAllowProductTenant == null
          ? currentAllowProductTenant
          : { tenant: currentAllowProductTenant },
      onMissing: ScopeFilterMissingBehaviors.ALLOW,
    },
  },
})
class ScopeIncludeProductAllowEntity extends BasePostgresEntity {
  static override TABLE_NAME = PRODUCT_ALLOW_TABLE;
  static override schema = productAllowTable;
  static override relations = (): TRelationConfig[] => productAllowRelationsConfig;
}

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        if (currentReviewTenant === '__throw__') {
          throw new ScopeResolutionError('review scope resolution blew up');
        }
        return currentReviewTenant == null ? currentReviewTenant : { tenant: currentReviewTenant };
      },
    },
  },
})
class ScopeIncludeReviewEntity extends BasePostgresEntity {
  static override TABLE_NAME = REVIEW_TABLE;
  static override schema = reviewTable;
  static override relations = (): TRelationConfig[] => [];
}

const merchantRelationsBuilt = createRelations({
  source: merchantTable,
  relations: merchantRelationsConfig,
});
const productRelationsBuilt = createRelations({
  source: productTable,
  relations: productRelationsConfig,
});
const productOpenRelationsBuilt = createRelations({
  source: productOpenTable,
  relations: productOpenRelationsConfig,
});
const productAllowRelationsBuilt = createRelations({
  source: productAllowTable,
  relations: productAllowRelationsConfig,
});
const reviewRelationsBuilt = createRelations({
  source: reviewTable,
  relations: reviewRelationsConfig,
});

@datasource({ driver: PGliteDriver })
class ScopeIncludeDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ScopeIncludeDataSource.name,
      config: {},
      schema: {
        [MERCHANT_TABLE]: merchantTable,
        [PRODUCT_TABLE]: productTable,
        [PRODUCT_OPEN_TABLE]: productOpenTable,
        [PRODUCT_ALLOW_TABLE]: productAllowTable,
        [REVIEW_TABLE]: reviewTable,
        merchantRelations: merchantRelationsBuilt.relations,
        productRelations: productRelationsBuilt.relations,
        productOpenRelations: productOpenRelationsBuilt.relations,
        productAllowRelations: productAllowRelationsBuilt.relations,
        reviewRelations: reviewRelationsBuilt.relations,
      },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

interface IProductRow {
  id: number;
  merchantId: number;
  tenant: string;
  name: string;
  reviews?: Array<{ id: number; productId: number; tenant: string; body: string }>;
}

interface IMerchantRow {
  id: number;
  tenant: string;
  name: string;
  products?: IProductRow[];
  openProducts?: IProductRow[];
  allowProducts?: IProductRow[];
}

let client: PGlite;
let dataSource: ScopeIncludeDataSource;
let merchantRepository: DefaultCRUDRepository<typeof merchantTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${MERCHANT_TABLE} (
      id serial primary key,
      tenant text not null,
      name text not null
    );
    CREATE TABLE ${PRODUCT_TABLE} (
      id serial primary key,
      merchant_id integer not null,
      tenant text not null,
      name text not null
    );
    CREATE TABLE ${PRODUCT_OPEN_TABLE} (
      id serial primary key,
      merchant_id integer not null,
      tenant text not null,
      name text not null
    );
    CREATE TABLE ${PRODUCT_ALLOW_TABLE} (
      id serial primary key,
      merchant_id integer not null,
      tenant text not null,
      name text not null
    );
    CREATE TABLE ${REVIEW_TABLE} (
      id serial primary key,
      product_id integer not null,
      tenant text not null,
      body text not null
    );
  `);

  dataSource = new ScopeIncludeDataSource({ client });

  merchantRepository = new DefaultCRUDRepository<typeof merchantTable>(dataSource as AnyType, {
    entityClass: ScopeIncludeMerchantEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/**
 * Merchant 1 is tenant-a; merchant 2 is tenant-b. Every child table gets one row correctly scoped
 * to merchant 1's tenant-a, one row WRONGLY attached to merchant 1 but tagged tenant-b (the leak
 * shape), and one row that only belongs to merchant 2. `scope_include_product` additionally seeds a
 * `hidden-by-default` row to exercise `defaultFilter` independently of `scopeFilter`.
 */
const seed = async (): Promise<void> => {
  await client.exec(`
    TRUNCATE TABLE ${MERCHANT_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${PRODUCT_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${PRODUCT_OPEN_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${PRODUCT_ALLOW_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${REVIEW_TABLE} RESTART IDENTITY CASCADE;

    INSERT INTO ${MERCHANT_TABLE} (tenant, name) VALUES
      ('tenant-a', 'Merchant A'),
      ('tenant-b', 'Merchant B');

    INSERT INTO ${PRODUCT_TABLE} (merchant_id, tenant, name) VALUES
      (1, 'tenant-a', 'a-product'),
      (1, 'tenant-b', 'leaked-b-product-under-a'),
      (1, 'tenant-a', 'hidden-by-default'),
      (2, 'tenant-b', 'b-product');

    INSERT INTO ${PRODUCT_OPEN_TABLE} (merchant_id, tenant, name) VALUES
      (1, 'tenant-a', 'open-a-product'),
      (1, 'tenant-b', 'open-leaked-b-product-under-a'),
      (2, 'tenant-b', 'open-b-product');

    INSERT INTO ${PRODUCT_ALLOW_TABLE} (merchant_id, tenant, name) VALUES
      (1, 'tenant-a', 'allow-a-product'),
      (1, 'tenant-b', 'allow-b-product-under-a');

    INSERT INTO ${REVIEW_TABLE} (product_id, tenant, body) VALUES
      (1, 'tenant-a', 'good a review'),
      (1, 'tenant-b', 'leaked b review under a-product');
  `);
};

beforeEach(async () => {
  currentMerchantTenant = 'tenant-a';
  currentProductTenant = 'tenant-a';
  currentAllowProductTenant = null;
  currentReviewTenant = 'tenant-a';
  await seed();
});

describe('toInclude - each child model registered its own @model settings', () => {
  test('scoped, unscoped, allow-on-missing and nested models are registered independently', () => {
    const registry = MetadataRegistry.getInstance();

    expect(
      registry.getModelEntry({ name: PRODUCT_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeDefined();
    expect(
      registry.getModelEntry({ name: PRODUCT_OPEN_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeUndefined();
    expect(
      registry.getModelEntry({ name: PRODUCT_ALLOW_TABLE })?.metadata.settings?.scopeFilter
        ?.onMissing,
    ).toBe(ScopeFilterMissingBehaviors.ALLOW);
    expect(
      registry.getModelEntry({ name: REVIEW_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeDefined();

    expect(typeof ScopeIncludeProductEntity).toBe('function');
    expect(typeof ScopeIncludeProductOpenEntity).toBe('function');
    expect(typeof ScopeIncludeProductAllowEntity).toBe('function');
    expect(typeof ScopeIncludeReviewEntity).toBe('function');
  });
});

describe('toInclude - the leak, proven closed', () => {
  test('positive control: the unscoped sibling relation DOES leak tenant-B rows under tenant-A merchant', async () => {
    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: { where: { id: 1 }, include: [{ relation: 'openProducts' }] },
    });

    // Proves the seed data can leak at all - if this assertion ever stops holding, the "fixed"
    // assertion below would be meaningless (nothing to catch).
    expect(merchant.openProducts?.map(row => row.name).sort()).toEqual([
      'open-a-product',
      'open-leaked-b-product-under-a',
    ]);
  });

  test('the fix: a scoped relation excludes the other tenant despite sharing the parent FK', async () => {
    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: { where: { id: 1 }, include: [{ relation: 'products' }] },
    });

    expect(merchant.products?.map(row => row.name)).toEqual(['a-product']);
  });
});

describe('toInclude - relation-level shouldSkipDefaultFilter removes defaultFilter, never scopeFilter', () => {
  test('defaultFilter is bypassed but the tenant scope still excludes the other tenant', async () => {
    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: {
        where: { id: 1 },
        include: [{ relation: 'products', shouldSkipDefaultFilter: true }],
      },
    });

    expect(merchant.products?.map(row => row.name).sort()).toEqual([
      'a-product',
      'hidden-by-default',
    ]);
  });
});

describe("toInclude - onMissing: 'deny' (the default) vs 'allow'", () => {
  test('deny starves the relation when the scope cannot be resolved', async () => {
    currentProductTenant = null;

    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: { where: { id: 1 }, include: [{ relation: 'products' }] },
    });

    expect(merchant.products).toEqual([]);
  });

  test('allow applies no scope at all when the resolver returns null', async () => {
    currentAllowProductTenant = null;

    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: { where: { id: 1 }, include: [{ relation: 'allowProducts' }] },
    });

    expect(merchant.allowProducts?.map(row => row.name).sort()).toEqual([
      'allow-a-product',
      'allow-b-product-under-a',
    ]);
  });
});

describe('toInclude - a child with no scopeFilter is unaffected', () => {
  test('functionally unaffected: every tenant under the parent FK is still returned', async () => {
    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: { where: { id: 1 }, include: [{ relation: 'openProducts' }] },
    });

    expect(merchant.openProducts?.map(row => row.name).sort()).toEqual([
      'open-a-product',
      'open-leaked-b-product-under-a',
    ]);
  });

  test('byte-identical: with no scopeFilter, the compiled query options carry no `where` at all', () => {
    // `IRelationalQueryDialect` (the neutral port) exposes only `build`/`toWhere`/etc - `toInclude`
    // and `resolveRelations` are concrete `FilterBuilder` surface, so this reads the real Postgres
    // dialect class directly, same as `scope-filter.test.ts` does for `toWhere`.
    const dialect = new PostgresQueryDialect();
    const relations = dialect.resolveRelations({ schema: merchantTable });

    const built = dialect.toInclude({ include: [{ relation: 'openProducts' }], relations });

    // A MANY relation always carries the resolved row limit - that is unrelated to scopeFilter and
    // unchanged by this fix. The proof is the ABSENCE of a `where` key: nothing was synthesized.
    const expectedLimit =
      dialect.resolveDefaultLimit({ schema: productOpenTable }) ?? DEFAULT_LIMIT;
    expect(built.openProducts).toEqual({ limit: expectedLimit });
  });
});

describe('toInclude - a relation of a relation is scoped at every level', () => {
  test('nested include applies the review scope under the already-scoped product', async () => {
    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: {
        where: { id: 1 },
        include: [
          {
            relation: 'products',
            scope: { where: { id: 1 }, include: [{ relation: 'reviews' }] },
          },
        ],
      },
    });

    const [product] = merchant.products ?? [];
    expect(product?.name).toBe('a-product');
    expect(product?.reviews?.map(review => review.body)).toEqual(['good a review']);
  });

  test('nested include denies when the nested scope cannot be resolved', async () => {
    currentReviewTenant = null;

    const [merchant] = await merchantRepository.find<IMerchantRow>({
      filter: {
        where: { id: 1 },
        include: [
          {
            relation: 'products',
            scope: { where: { id: 1 }, include: [{ relation: 'reviews' }] },
          },
        ],
      },
    });

    const [product] = merchant.products ?? [];
    expect(product?.reviews).toEqual([]);
  });
});

describe('toInclude - a throwing resolver propagates instead of silently un-scoping', () => {
  test("find() rejects with the child relation's own resolver error", async () => {
    currentProductTenant = '__throw__';
    let caught: unknown;

    try {
      await merchantRepository.find<IMerchantRow>({
        filter: { where: { id: 1 }, include: [{ relation: 'products' }] },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScopeResolutionError);
  });
});
