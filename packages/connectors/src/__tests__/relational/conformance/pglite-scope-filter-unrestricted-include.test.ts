import {
  datasource,
  MetadataRegistry,
  model,
  RelationTypes,
  ScopeFilters,
} from '@venizia/ignis-kernel';
import { createRelations } from '@/relational/core/repositories/dialect/relation';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * `ScopeFilters.UNRESTRICTED` under `include`: each relation resolves its OWN `scopeFilter`
 * (`pglite-scope-filter-include.test.ts` already proves that isolation for the two-state case), so
 * an unrestricted parent must not widen a still-scoped child, and a scoped parent must not narrow an
 * unrestricted child. Both directions, plus a three-level nested mix, are proven here against a real
 * engine.
 */
const MERCHANT_TABLE = 'scope_unrestricted_merchant';
const PRODUCT_TABLE = 'scope_unrestricted_product';
const REVIEW_TABLE = 'scope_unrestricted_review';

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

const reviewRelationsConfig: TRelationConfig[] = [
  {
    name: 'productOfReview',
    type: RelationTypes.ONE,
    schema: productTable,
    metadata: { fields: [reviewTable.productId], references: [productTable.id] },
  },
];

type TScopeState = TNullable<string> | typeof ScopeFilters.UNRESTRICTED;

let currentMerchantScope: TScopeState = 'tenant-a';
let currentProductScope: TScopeState = 'tenant-a';
let currentReviewScope: TScopeState = 'tenant-a';

const resolveScope = (state: TScopeState) => {
  if (state === ScopeFilters.UNRESTRICTED) {
    return ScopeFilters.UNRESTRICTED;
  }

  return state == null ? state : { tenant: state };
};

@model({
  type: 'entity',
  settings: { scopeFilter: { resolve: () => resolveScope(currentMerchantScope) } },
})
class ScopeUnrestrictedMerchantEntity extends BasePostgresEntity {
  static override TABLE_NAME = MERCHANT_TABLE;
  static override schema = merchantTable;
  static override relations = (): TRelationConfig[] => merchantRelationsConfig;
}

@model({
  type: 'entity',
  settings: { scopeFilter: { resolve: () => resolveScope(currentProductScope) } },
})
class ScopeUnrestrictedProductEntity extends BasePostgresEntity {
  static override TABLE_NAME = PRODUCT_TABLE;
  static override schema = productTable;
  static override relations = (): TRelationConfig[] => productRelationsConfig;
}

@model({
  type: 'entity',
  settings: { scopeFilter: { resolve: () => resolveScope(currentReviewScope) } },
})
class ScopeUnrestrictedReviewEntity extends BasePostgresEntity {
  static override TABLE_NAME = REVIEW_TABLE;
  static override schema = reviewTable;
  static override relations = (): TRelationConfig[] => reviewRelationsConfig;
}

const merchantRelationsBuilt = createRelations({
  source: merchantTable,
  relations: merchantRelationsConfig,
});
const productRelationsBuilt = createRelations({
  source: productTable,
  relations: productRelationsConfig,
});
const reviewRelationsBuilt = createRelations({
  source: reviewTable,
  relations: reviewRelationsConfig,
});

@datasource({ driver: PGliteDriver })
class ScopeUnrestrictedIncludeDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ScopeUnrestrictedIncludeDataSource.name,
      config: {},
      schema: {
        [MERCHANT_TABLE]: merchantTable,
        [PRODUCT_TABLE]: productTable,
        [REVIEW_TABLE]: reviewTable,
        merchantRelations: merchantRelationsBuilt.relations,
        productRelations: productRelationsBuilt.relations,
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

interface IReviewRow {
  id: number;
  productId: number;
  tenant: string;
  body: string;
}

interface IProductRow {
  id: number;
  merchantId: number;
  tenant: string;
  name: string;
  reviews?: IReviewRow[];
}

interface IMerchantRow {
  id: number;
  tenant: string;
  name: string;
  products?: IProductRow[];
}

let client: PGlite;
let dataSource: ScopeUnrestrictedIncludeDataSource;
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
    CREATE TABLE ${REVIEW_TABLE} (
      id serial primary key,
      product_id integer not null,
      tenant text not null,
      body text not null
    );
  `);

  dataSource = new ScopeUnrestrictedIncludeDataSource({ client });

  merchantRepository = new DefaultCRUDRepository<typeof merchantTable>(dataSource as AnyType, {
    entityClass: ScopeUnrestrictedMerchantEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/**
 * Merchant 1 is tenant-a, merchant 2 is tenant-b. Each merchant has one product correctly tagged
 * tenant-a and one tagged tenant-b, independent of which merchant it belongs to - proving product
 * scoping follows the `tenant` column, not the parent FK. Only product 1 (under merchant 1) has
 * reviews, one tagged each tenant, to exercise the three-level mix.
 */
const seed = async (): Promise<void> => {
  await client.exec(`
    TRUNCATE TABLE ${MERCHANT_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${PRODUCT_TABLE} RESTART IDENTITY CASCADE;
    TRUNCATE TABLE ${REVIEW_TABLE} RESTART IDENTITY CASCADE;

    INSERT INTO ${MERCHANT_TABLE} (tenant, name) VALUES
      ('tenant-a', 'Merchant A'),
      ('tenant-b', 'Merchant B');

    INSERT INTO ${PRODUCT_TABLE} (merchant_id, tenant, name) VALUES
      (1, 'tenant-a', 'a-product-under-m1'),
      (1, 'tenant-b', 'leaked-b-product-under-m1'),
      (2, 'tenant-b', 'b-product-under-m2'),
      (2, 'tenant-a', 'a-product-under-m2');

    INSERT INTO ${REVIEW_TABLE} (product_id, tenant, body) VALUES
      (1, 'tenant-a', 'good-a-review'),
      (1, 'tenant-b', 'cross-tenant-review-under-a-product');
  `);
};

beforeEach(async () => {
  currentMerchantScope = 'tenant-a';
  currentProductScope = 'tenant-a';
  currentReviewScope = 'tenant-a';
  await seed();
});

describe('toInclude - each child model registered its own @model settings', () => {
  test('merchant, product, and review are registered independently', () => {
    const registry = MetadataRegistry.getInstance();

    expect(
      registry.getModelEntry({ name: MERCHANT_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeDefined();
    expect(
      registry.getModelEntry({ name: PRODUCT_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeDefined();
    expect(
      registry.getModelEntry({ name: REVIEW_TABLE })?.metadata.settings?.scopeFilter,
    ).toBeDefined();

    expect(typeof ScopeUnrestrictedProductEntity).toBe('function');
    expect(typeof ScopeUnrestrictedReviewEntity).toBe('function');
  });
});

describe('toInclude - parent UNRESTRICTED, child scoped: the child stays scoped', () => {
  test("every merchant is returned, but each one's products stay narrowed to the child's own scope", async () => {
    currentMerchantScope = ScopeFilters.UNRESTRICTED;
    currentProductScope = 'tenant-a';

    const merchants = await merchantRepository.find<IMerchantRow>({
      filter: { order: ['id asc'], include: [{ relation: 'products' }] },
    });

    expect(merchants.map(merchant => merchant.name)).toEqual(['Merchant A', 'Merchant B']);
    expect(merchants[0].products?.map(product => product.name)).toEqual(['a-product-under-m1']);
    expect(merchants[1].products?.map(product => product.name)).toEqual(['a-product-under-m2']);
  });
});

describe('toInclude - parent scoped, child UNRESTRICTED: the child is unscoped, the parent stays scoped', () => {
  test('only the in-scope merchant is returned, but it sees every tenant among its own products', async () => {
    currentMerchantScope = 'tenant-a';
    currentProductScope = ScopeFilters.UNRESTRICTED;

    const merchants = await merchantRepository.find<IMerchantRow>({
      filter: { order: ['id asc'], include: [{ relation: 'products' }] },
    });

    expect(merchants.map(merchant => merchant.name)).toEqual(['Merchant A']);
    expect(merchants[0].products?.map(product => product.name).sort()).toEqual([
      'a-product-under-m1',
      'leaked-b-product-under-m1',
    ]);
  });
});

describe('toInclude - nested include, three levels, mixed', () => {
  test('unrestricted parent -> scoped child -> unrestricted grandchild', async () => {
    currentMerchantScope = ScopeFilters.UNRESTRICTED;
    currentProductScope = 'tenant-a';
    currentReviewScope = ScopeFilters.UNRESTRICTED;

    const merchants = await merchantRepository.find<IMerchantRow>({
      filter: {
        order: ['id asc'],
        include: [{ relation: 'products', scope: { include: [{ relation: 'reviews' }] } }],
      },
    });

    expect(merchants.map(merchant => merchant.name)).toEqual(['Merchant A', 'Merchant B']);

    const [merchantA, merchantB] = merchants;
    expect(merchantA.products?.map(product => product.name)).toEqual(['a-product-under-m1']);
    expect(merchantA.products?.[0].reviews?.map(review => review.body).sort()).toEqual([
      'cross-tenant-review-under-a-product',
      'good-a-review',
    ]);

    expect(merchantB.products?.map(product => product.name)).toEqual(['a-product-under-m2']);
    expect(merchantB.products?.[0].reviews).toEqual([]);
  });

  test('scoped parent -> unrestricted child -> scoped grandchild', async () => {
    currentMerchantScope = 'tenant-a';
    currentProductScope = ScopeFilters.UNRESTRICTED;
    currentReviewScope = 'tenant-a';

    const merchants = await merchantRepository.find<IMerchantRow>({
      filter: {
        order: ['id asc'],
        include: [{ relation: 'products', scope: { include: [{ relation: 'reviews' }] } }],
      },
    });

    expect(merchants.map(merchant => merchant.name)).toEqual(['Merchant A']);
    expect(merchants[0].products?.map(product => product.name).sort()).toEqual([
      'a-product-under-m1',
      'leaked-b-product-under-m1',
    ]);

    const productWithReviews = merchants[0].products?.find(
      product => product.name === 'a-product-under-m1',
    );
    expect(productWithReviews?.reviews?.map(review => review.body)).toEqual(['good-a-review']);

    const productWithoutReviews = merchants[0].products?.find(
      product => product.name === 'leaked-b-product-under-m1',
    );
    expect(productWithoutReviews?.reviews).toEqual([]);
  });
});
