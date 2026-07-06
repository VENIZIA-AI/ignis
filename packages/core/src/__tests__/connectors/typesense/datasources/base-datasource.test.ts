import { describe, test, expect } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { datasource, model, repository } from '@/base/metadata';
import { DataSourceDrivers } from '@/base/datasources';
import { BaseSearchDataSource } from '@/connectors/typesense/datasources';
import { ISearchDriver } from '@/connectors/typesense/driver';
import { ISearchDataSourceOptions } from '@/connectors/typesense/types';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  ISearchCollectionDefinition,
} from '@/connectors/typesense/models';
import { ISearchQueryDialect } from '@/connectors/typesense/repositories';
import { TypesenseQueryDialect } from '@/connectors/typesense';
import { MetadataRegistry } from '@/helpers/inversion';

/** Records every `ensureCollection` call so provisioning can be asserted on. */
class FakeSearchDataSource extends BaseSearchDataSource<{}> {
  ensureCalls: ISearchCollectionDefinition[] = [];

  constructor(opts: ISearchDataSourceOptions<{}>) {
    super(opts);
  }

  configure(): void {
    // no-op: this fixture never touches a real search engine.
  }

  getDriver(): ISearchDriver {
    throw getError({ message: '[FakeSearchDataSource][getDriver] Not needed for this test' });
  }

  getQueryDialect(): ISearchQueryDialect {
    return new TypesenseQueryDialect();
  }

  compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown {
    return opts.definition;
  }

  async ensureCollection(opts: { definition: ISearchCollectionDefinition }): Promise<void> {
    this.ensureCalls.push(opts.definition);
  }
}

// Distinct class identities per describe block - keeps registry entries isolated, since the model registry is a process-wide singleton.
class DiscoveryDataSource extends FakeSearchDataSource {}
class ProvisionDataSource extends FakeSearchDataSource {}

describe('BaseSearchDataSource - discoverCollections / getSchema', () => {
  @model({ type: 'entity' })
  class ProductDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'products',
      fields: [field.string('title', { searchable: true })],
    });
  }

  @model({ type: 'entity' })
  class CategoryDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'categories',
      fields: [field.string('title', { searchable: true })],
    });
  }

  const dualTable = pgTable('dual_entity', {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }),
  });

  /** Dual-schema shape: a pg entity that also carries a search index. Its `schema` is the real
   * pgTable - shape-guarded out of collection discovery - so only `searchCollection` is picked up. */
  @model({ type: 'entity' })
  class DualEntity extends BasePostgresEntity {
    static override schema = dualTable;
    static searchCollection = defineSearchCollection({
      name: 'dual-entity-search-name',
      fields: [field.string('title')],
    });
  }

  @model({ type: 'entity' })
  class UndiscoverableDocument extends BasePostgresEntity {
    // No `static searchCollection`, and the inherited `static schema` is unset - must be skipped, not throw.
  }

  @repository({ model: ProductDocument, dataSource: DiscoveryDataSource })
  class _ProductRepo {}

  @repository({ model: CategoryDocument, dataSource: DiscoveryDataSource })
  class _CategoryRepo {}

  @repository({ model: DualEntity, dataSource: DiscoveryDataSource })
  class _DualRepo {}

  @repository({ model: UndiscoverableDocument, dataSource: DiscoveryDataSource })
  class _UndiscoverableRepo {}

  const dataSource = new DiscoveryDataSource({ name: 'discovery-ds', config: {} });

  test('getSchema() maps every discoverable collection by name', () => {
    const schema = dataSource.getSchema();

    expect(Object.keys(schema).sort()).toEqual(
      ['categories', 'dual-entity-search-name', 'products'].sort(),
    );
  });

  test('dual-schema precedence: static searchCollection wins over the shape-guarded pgTable schema', () => {
    const schema = dataSource.getSchema();

    expect(schema['dual-entity-search-name']).toBe(DualEntity.searchCollection);
    // The pgTable itself is never mistaken for a collection - it has no `.name`/`.fields` shape.
    expect(schema['dual_entity']).toBeUndefined();
  });

  test('a class with neither static is skipped, not thrown', () => {
    expect(() => dataSource.getSchema()).not.toThrow();
  });

  test('@repository bindings were registered for every fixture repository', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _ProductRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _CategoryRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _DualRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _UndiscoverableRepo.name })).toBeDefined();
  });

  test('getSchema() is lazy and cached across calls', () => {
    const first = dataSource.getSchema();
    const second = dataSource.getSchema();

    expect(first).toBe(second);
  });

  test('hasDiscoverableModels() reflects registered bindings', () => {
    expect(dataSource.hasDiscoverableModels()).toBe(true);

    class UnusedDataSource extends FakeSearchDataSource {}
    const unusedDataSource = new UnusedDataSource({ name: 'unused-ds', config: {} });

    expect(unusedDataSource.hasDiscoverableModels()).toBe(false);
  });
});

describe('BaseSearchDataSource - provisionCollections', () => {
  @model({ type: 'entity' })
  class WidgetDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'widgets',
      fields: [field.string('title', { searchable: true })],
    });
  }

  @model({ type: 'entity' })
  class GadgetDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'gadgets',
      fields: [field.string('title', { searchable: true })],
    });
  }

  @repository({ model: WidgetDocument, dataSource: ProvisionDataSource })
  class _WidgetRepo {}

  @repository({ model: GadgetDocument, dataSource: ProvisionDataSource })
  class _GadgetRepo {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _WidgetRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _GadgetRepo.name })).toBeDefined();
  });

  test('provisionCollections() calls ensureCollection once per discovered collection', async () => {
    const dataSource = new ProvisionDataSource({ name: 'provision-ds', config: {} });

    await dataSource['provisionCollections']();

    expect(dataSource.ensureCalls.map(item => item.name).sort()).toEqual(
      ['gadgets', 'widgets'].sort(),
    );
  });

  test('provisionCollections() is skipped entirely when autoProvision is false', async () => {
    const dataSource = new ProvisionDataSource({
      name: 'provision-ds-skip',
      config: {},
      autoProvision: false,
    });

    await dataSource['provisionCollections']();

    expect(dataSource.ensureCalls).toEqual([]);
  });
});

describe('BaseSearchDataSource - autoDiscovery flag (branch-agnostic)', () => {
  class AutoDiscoveryDataSource extends FakeSearchDataSource {}

  @datasource({ driver: DataSourceDrivers.TYPESENSE, autoDiscovery: false })
  class DisabledAutoDiscoveryDataSource extends FakeSearchDataSource {}

  @model({ type: 'entity' })
  class LampDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'lamps',
      fields: [field.string('title', { searchable: true })],
    });
  }

  @repository({ model: LampDocument, dataSource: AutoDiscoveryDataSource })
  class _LampRepoEnabled {}

  @repository({ model: LampDocument, dataSource: DisabledAutoDiscoveryDataSource })
  class _LampRepoDisabled {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _LampRepoEnabled.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _LampRepoDisabled.name })).toBeDefined();
  });

  test('discovers normally when @datasource is absent (autoDiscovery unset)', () => {
    const dataSource = new AutoDiscoveryDataSource({ name: 'auto-discovery-ds', config: {} });
    expect(dataSource.getSchema()['lamps']).toBe(LampDocument.schema);
  });

  test('@datasource({ autoDiscovery: false }) returns {} - same behavior as postgres BasePostgresDataSource', () => {
    const dataSource = new DisabledAutoDiscoveryDataSource({
      name: 'disabled-auto-discovery-ds',
      config: {},
    });

    expect(dataSource.getSchema()).toEqual({});
  });
});

describe('BaseSearchDataSource - TDataSourceDriver accepts unknown engine strings (compile-time)', () => {
  // TDataSourceDriver accepts any string, not just known DataSourceDrivers members;
  // `tsc --noEmit` is the real gate here, `bun test` only proves it runs.
  @datasource({ driver: 'meilisearch' })
  class MeilisearchLikeDataSource extends FakeSearchDataSource {}

  test('a @datasource with an unrecognized driver string compiles and registers metadata', () => {
    const registry = MetadataRegistry.getInstance();
    const metadata = registry.getDataSourceMetadata({ target: MeilisearchLikeDataSource });

    expect(metadata?.driver).toBe('meilisearch');
  });
});

describe('BaseSearchDataSource - duplicate collection name (loud, not silent last-wins)', () => {
  class DuplicateNameDataSource extends FakeSearchDataSource {}

  @model({ type: 'entity' })
  class FirstDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'shared-collection-name',
      fields: [field.string('title')],
    });
  }

  @model({ type: 'entity' })
  class SecondDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'shared-collection-name',
      fields: [field.string('title')],
    });
  }

  @repository({ model: FirstDocument, dataSource: DuplicateNameDataSource })
  class _FirstDocRepo {}

  @repository({ model: SecondDocument, dataSource: DuplicateNameDataSource })
  class _SecondDocRepo {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _FirstDocRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _SecondDocRepo.name })).toBeDefined();
  });

  test('getSchema() throws naming both offending classes', () => {
    const dataSource = new DuplicateNameDataSource({ name: 'duplicate-name-ds', config: {} });

    expect(() => dataSource.getSchema()).toThrow(/shared-collection-name/);
    expect(() => dataSource.getSchema()).toThrow(/FirstDocument/);
  });
});
