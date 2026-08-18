// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, test, expect } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { ControllerFactory } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { model, repository } from '@venizia/ignis-kernel';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { BaseSearchEntity, defineSearchCollection, field } from '@/search/core/models';
import { DefaultSearchRepository } from '@/search/typesense/repositories';
import { MetadataRegistry } from '@venizia/ignis-kernel';

import { FakeSearchDataSource } from './fake-search-connector';

// Own datasource class (not reused from another test file): the model registry is a process-wide singleton keyed by class name.
class AppSearchDataSource extends FakeSearchDataSource {}

/** Stub SQL datasource - no real pool/connection, only exercises registry-driven discovery. */
class AppSqlDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

// --- Scenario 1: a pure search entity + @repository over the search branch ------------------

@model({ type: 'entity' })
class ProductDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'wiring-product-doc',
    fields: [field.string('title', { searchable: true })],
  });
}

@repository({ model: ProductDocument, dataSource: AppSearchDataSource })
class ProductSearchRepository extends DefaultSearchRepository {}

// --- Scenario 2: a dual-schema entity (pg `schema` + `searchCollection`) --------------------

const dualProductTable = pgTable('wiring_dual_product', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }),
});

@model({ type: 'entity' })
class Product extends BasePostgresEntity {
  static override schema = dualProductTable;
  static searchCollection = defineSearchCollection({
    name: 'wiring-dual-product-search',
    fields: [field.string('title', { searchable: true })],
  });
}

// Underscore-prefixed: registered purely for the @repository decorator's side effect (binding registration), never constructed directly.
@repository({ model: Product, dataSource: AppSqlDataSource })
class ProductSqlRepository {}

@repository({ model: Product, dataSource: AppSearchDataSource })
class ProductDualSearchRepository {}

// --- Scenario 3: class name / collection name diverge, no `tableName` alignment ------------
// Class name and collection name diverge on purpose - settings are keyed by class, not name, so a name-keyed lookup would silently lose hiddenProperties/defaultFilter here.
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['secretCode'],
    defaultFilter: { where: { isActive: true } },
  },
})
class SprocketDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'sprockets',
    fields: [field.string('title', { searchable: true }), field.string('secretCode')],
  });
}

@repository({ model: SprocketDocument, dataSource: AppSearchDataSource })
class SprocketSearchRepository extends DefaultSearchRepository {}

describe('End-to-end search wiring - dual-schema, @repository, controller factory', () => {
  describe('1. @repository auto-injection over the search branch', () => {
    test('a no-constructor repository class gets the datasource injected at param[0]', () => {
      const registry = MetadataRegistry.getInstance();
      const injects = registry.getInjectMetadata({ target: ProductSearchRepository });
      const injectAtIndex0 = injects?.find(entry => entry.index === 0);

      expect(injectAtIndex0).toBeDefined();
      expect(injectAtIndex0?.key).toBe('datasources.AppSearchDataSource');
      expect(injectAtIndex0?.isOptional).toBe(false);
    });

    test('constructing with the injected-shape datasource resolves the collection end to end', () => {
      const dataSource = new AppSearchDataSource({ name: 'wiring-search-ds-1', config: {} });
      const productSearchRepository = new ProductSearchRepository(dataSource);

      expect(productSearchRepository.collectionName).toBe('wiring-product-doc');
    });

    test('the registered repository binding round-trips model + dataSource', () => {
      const registry = MetadataRegistry.getInstance();
      const binding = registry.getRepositoryBinding({ name: ProductSearchRepository.name });

      expect(binding).toBeDefined();
      expect(binding?.model).toBe(ProductDocument);
      expect(binding?.dataSource).toBe(AppSearchDataSource);
    });
  });

  describe('2. Dual-schema entity discovered independently by each datasource', () => {
    test('the pg-branch stub datasource discovers only the Drizzle schema', () => {
      const sqlDataSource = new AppSqlDataSource({ name: 'wiring-sql-ds', config: {} });

      expect(sqlDataSource.hasDiscoverableModels()).toBe(true);

      const schema = sqlDataSource.getSchema();
      expect(schema['Product']).toBe(dualProductTable);
      expect(schema['wiring-dual-product-search']).toBeUndefined();
    });

    test('the search-branch datasource discovers only the search collection', () => {
      const searchDataSource = new AppSearchDataSource({ name: 'wiring-search-ds-2', config: {} });
      const schema = searchDataSource.getSchema();

      expect(schema['wiring-dual-product-search']).toBe(Product.searchCollection);
      // Search discovery reads searchCollection first; Product's own `schema` is a pgTable that fails the collection shape guard, so it is never picked up as a fallback.
      expect(schema['Product']).toBeUndefined();
    });

    // `datasourceModels` is keyed by the datasource CLASS NAME, so a same-named class in another
    // test file merges its models into this one's set - and the whole suite shares one
    // realm-anchored MetadataRegistry. An exact set, not a spot check: a spot check stays green
    // through a merge and leaves the collision to be discovered by whichever assertion the next
    // walk order happens to break.
    test('discovery holds exactly the collections this file declares - no same-named class merged in', () => {
      const searchDataSource = new AppSearchDataSource({ name: 'wiring-search-ds-7', config: {} });

      expect(Object.keys(searchDataSource.getSchema()).sort()).toEqual([
        'sprockets',
        'wiring-dual-product-search',
        'wiring-product-doc',
      ]);
    });

    test('both @repository bindings were registered for the dual-schema entity', () => {
      const registry = MetadataRegistry.getInstance();

      expect(registry.getRepositoryBinding({ name: ProductSqlRepository.name })).toBeDefined();
      expect(
        registry.getRepositoryBinding({ name: ProductDualSearchRepository.name }),
      ).toBeDefined();
    });
  });

  describe('3. ControllerFactory.defineCrudController over a search entity/repository', () => {
    test('constructs without throwing and mounts the six CRUD routes', async () => {
      const dataSource = new AppSearchDataSource({ name: 'wiring-search-ds-3', config: {} });
      const repositoryInstance = new ProductSearchRepository(dataSource);

      const ProductSearchController = ControllerFactory.defineCrudController({
        // The factory's `entity` param is the engine-neutral AbstractEntity, so a search entity/repository flows through with no cast at all.
        entity: ProductDocument,
        repository: { name: ProductSearchRepository.name },
        controller: {
          name: 'ProductSearchController',
          basePath: '/search/products',
          enabledRoutes: ['count', 'find', 'findById', 'create', 'updateById', 'deleteById'],
        },
      });

      const controller = new ProductSearchController(repositoryInstance);

      await controller['binding']();

      const distinctRoutes = new Set(
        controller.router.routes.map(route => `${route.method} ${route.path}`),
      );
      expect(distinctRoutes.size).toBe(6);
    });
  });

  describe('4. Name/tableName divergence - settings resolved by class, discovery unaffected', () => {
    test('datasource discovery keys by collection name regardless of the model-registry key', () => {
      const dataSource = new AppSearchDataSource({ name: 'wiring-search-ds-4', config: {} });
      const schema = dataSource.getSchema();

      expect(schema['sprockets']).toBe(SprocketDocument.schema);
    });

    test('find() applies hiddenProperties (exclude_fields) and defaultFilter (filter_by) on the wire', async () => {
      const dataSource = new AppSearchDataSource({ name: 'wiring-search-ds-5', config: {} });
      const repositoryInstance = new SprocketSearchRepository(dataSource);

      await repositoryInstance.find({ filter: { where: { title: 'foo' } } });

      const [call] = dataSource.fakeConnector.searchCalls;
      expect(call.collection).toBe('sprockets');

      const params = call.params as Record<string, unknown>;
      expect(params['exclude_fields']).toBe('secretCode');
      expect(params['filter_by']).toBe('(isActive:=true && title:=`foo`)');
    });

    test('deleteAll with no where falls back to filter-delete (defaultWhere), not truncate', async () => {
      const dataSource = new AppSearchDataSource({ name: 'wiring-search-ds-6', config: {} });
      const repositoryInstance = new SprocketSearchRepository(dataSource);
      dataSource.fakeConnector.deleteByFilterResponse = 2;

      const result = await repositoryInstance.deleteAll();

      expect(result).toEqual({ count: 2, data: null });
      expect(dataSource.fakeConnector.deleteByFilterCalls[0]?.filterBy).toBe('isActive:=true');
      expect(dataSource.fakeConnector.deleteAllDocumentsCalls.length).toBe(0);
    });
  });
});
