import { describe, test, expect } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AnyType } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { datasource, model, repository } from '@/base/metadata';
import { BaseSearchDataSource } from '@/connectors/search/datasources';
import { ISearchConnector } from '@/connectors/search';
import { ISearchDataSourceOptions } from '@/connectors/search/datasources';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  ISearchCollectionDefinition,
} from '@/connectors/search/models';
import { ISearchQueryDialect } from '@/connectors/search/repositories/common';
import { MetadataRegistry } from '@/helpers/inversion';

/** Records every `ensureCollection` call so provisioning can be asserted on. */
class FakeSearchDataSource extends BaseSearchDataSource<{}> {
  ensureCalls: ISearchCollectionDefinition[] = [];

  constructor(opts: ISearchDataSourceOptions<{}> & { connector?: ISearchConnector }) {
    super(opts);
  }

  protected createConnector(): ISearchConnector {
    throw getError({ message: '[FakeSearchDataSource][createConnector] Not needed for this test' });
  }

  getQueryDialect(): ISearchQueryDialect {
    // The neutral datasource tier never calls the dialect; a stub keeps this test engine-free.
    return {
      build: () => ({ query: '*' }),
      toWhere: () => '',
      applySearchInput: () => undefined,
      toWireParams: () => ({}),
    };
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
  class ProductRepo {}

  @repository({ model: CategoryDocument, dataSource: DiscoveryDataSource })
  class CategoryRepo {}

  @repository({ model: DualEntity, dataSource: DiscoveryDataSource })
  class DualRepo {}

  @repository({ model: UndiscoverableDocument, dataSource: DiscoveryDataSource })
  class UndiscoverableRepo {}

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

    expect(registry.getRepositoryBinding({ name: ProductRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: CategoryRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: DualRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: UndiscoverableRepo.name })).toBeDefined();
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
  class WidgetRepo {}

  @repository({ model: GadgetDocument, dataSource: ProvisionDataSource })
  class GadgetRepo {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: WidgetRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: GadgetRepo.name })).toBeDefined();
  });

  test('provisionCollections() calls ensureCollection once per discovered collection', async () => {
    const dataSource = new ProvisionDataSource({
      name: 'provision-ds',
      config: {},
      autoProvision: true,
    });

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

  @datasource({ autoDiscovery: false })
  class DisabledAutoDiscoveryDataSource extends FakeSearchDataSource {}

  @model({ type: 'entity' })
  class LampDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'lamps',
      fields: [field.string('title', { searchable: true })],
    });
  }

  @repository({ model: LampDocument, dataSource: AutoDiscoveryDataSource })
  class LampRepoEnabled {}

  @repository({ model: LampDocument, dataSource: DisabledAutoDiscoveryDataSource })
  class LampRepoDisabled {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: LampRepoEnabled.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: LampRepoDisabled.name })).toBeDefined();
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

describe('BaseSearchDataSource - the engine is the datasource class, not a metadata field', () => {
  // A search datasource names no driver: `extends TypesenseDataSource` IS the engine reference and
  // carries the peer into the bundle. `@datasource()` with no driver must be legal - `tsc --noEmit`
  // is the real gate.
  @datasource()
  class EngineFromClassDataSource extends FakeSearchDataSource {}

  test('@datasource() with no driver registers metadata and leaves driver unset', () => {
    const registry = MetadataRegistry.getInstance();
    const metadata = registry.getDataSourceMetadata({ target: EngineFromClassDataSource });

    expect(metadata).toBeDefined();
    expect(metadata?.driver).toBeUndefined();
    expect(metadata?.autoDiscovery).toBe(true);
  });
});

describe('BaseSearchDataSource - multiSearch injects @model hidden fields into exclude_fields', () => {
  class MultiSearchDataSource extends FakeSearchDataSource {
    capturedSearches: Array<Record<string, unknown>> = [];
    discoverHiddenFieldsCalls = 0;

    /** Counts the registry/model walk so memoization is observable across requests. */
    protected override discoverHiddenFieldsByCollection(): Record<string, string[]> {
      this.discoverHiddenFieldsCalls += 1;
      return super.discoverHiddenFieldsByCollection();
    }

    override getQueryDialect(): ISearchQueryDialect {
      return {
        build: () => ({ query: '*' }),
        toWhere: () => '',
        applySearchInput: () => undefined,
        // Echo the neutral query verbatim so the merged excludeFields is observable on the captured entry.
        toWireParams: ({ query }) => ({ ...query }),
      };
    }

    override getConnector(): ISearchConnector {
      const capture = (searches: Array<Record<string, unknown>>): void => {
        this.capturedSearches = searches;
      };

      // Only multiSearch is exercised here; the rest of the surface is unreachable in this test.
      return {
        multiSearch: async (opts: { searches: Array<Record<string, unknown>> }) => {
          capture(opts.searches);
          return {};
        },
      } as AnyType;
    }
  }

  @model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
  class SecretDocument extends BaseSearchEntity {
    static override schema = defineSearchCollection({
      name: 'secret-collection',
      fields: [field.string('title'), field.string('secret')],
    });
  }

  @repository({ model: SecretDocument, dataSource: MultiSearchDataSource })
  class SecretRepo {}

  test('@repository binding was registered for the fixture repository', () => {
    const registry = MetadataRegistry.getInstance();
    expect(registry.getRepositoryBinding({ name: SecretRepo.name })).toBeDefined();
  });

  test("unions the collection's hiddenProperties into exclude_fields; unknown collections pass through", async () => {
    const dataSource = new MultiSearchDataSource({ name: 'multi-search-hidden-ds', config: {} });

    await dataSource.multiSearch({
      searches: [
        { collection: 'secret-collection', query: 'x', excludeFields: ['other'] },
        { collection: 'unknown-collection', query: 'y' },
      ],
    });

    // toSearchQueryParams comma-joins excludeFields; the injected 'secret' unions with caller 'other'.
    const known = dataSource.capturedSearches[0];
    expect(String(known['excludeFields']).split(',').sort()).toEqual(['other', 'secret']);

    // A collection with no discovered definition is left untouched - the caller owns exclusion there.
    const unknown = dataSource.capturedSearches[1];
    expect(unknown['excludeFields']).toBeUndefined();
  });

  test('injects hidden fields even when the caller passes no excludeFields', async () => {
    const dataSource = new MultiSearchDataSource({ name: 'multi-search-hidden-ds-2', config: {} });

    await dataSource.multiSearch({
      searches: [{ collection: 'secret-collection', query: 'x' }],
    });

    expect(dataSource.capturedSearches[0]['excludeFields']).toBe('secret');
  });

  test('the registry/model walk runs once per datasource, not once per multiSearch call', async () => {
    const dataSource = new MultiSearchDataSource({ name: 'multi-search-hidden-ds-3', config: {} });

    await dataSource.multiSearch({ searches: [{ collection: 'secret-collection', query: 'x' }] });
    await dataSource.multiSearch({ searches: [{ collection: 'secret-collection', query: 'y' }] });

    expect(dataSource.discoverHiddenFieldsCalls).toBe(1);
    // Parity: the memoized map still injects the hidden field on the second call.
    expect(dataSource.capturedSearches[0]['excludeFields']).toBe('secret');
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
  class FirstDocRepo {}

  @repository({ model: SecondDocument, dataSource: DuplicateNameDataSource })
  class SecondDocRepo {}

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: FirstDocRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: SecondDocRepo.name })).toBeDefined();
  });

  test('getSchema() throws naming both offending classes', () => {
    const dataSource = new DuplicateNameDataSource({ name: 'duplicate-name-ds', config: {} });

    expect(() => dataSource.getSchema()).toThrow(/shared-collection-name/);
    expect(() => dataSource.getSchema()).toThrow(/FirstDocument/);
  });
});

describe('BaseSearchDataSource - connector lifecycle (shared by every engine datasource)', () => {
  /** Counts createConnector() so the injected path is observably taken instead. */
  class LifecycleDataSource extends FakeSearchDataSource {
    createConnectorCalls = 0;

    protected override createConnector(): ISearchConnector {
      this.createConnectorCalls += 1;
      return { name: 'built-connector' } as AnyType;
    }
  }

  const injectedConnector = { name: 'injected-connector' } as AnyType as ISearchConnector;

  test('getConnector() before configure() throws the not-initialized error', () => {
    const dataSource = new LifecycleDataSource({ name: 'lifecycle-ds', config: {} });

    expect(() => dataSource.getConnector()).toThrow(/Connector not initialized/);
    expect(() => dataSource.getConnector()).toThrow(/Call configure\(\) first/);
    expect(() => dataSource.getConnector()).toThrow(/lifecycle-ds/);
  });

  test('an injected connector is used verbatim - createConnector() is never called', async () => {
    const dataSource = new LifecycleDataSource({
      name: 'injected-ds',
      config: {},
      connector: injectedConnector,
    });

    await dataSource.configure();

    expect(dataSource.getConnector()).toBe(injectedConnector);
    expect(dataSource.createConnectorCalls).toBe(0);
  });

  test('with no injected connector, configure() builds one through createConnector()', async () => {
    const dataSource = new LifecycleDataSource({ name: 'built-ds', config: {} });

    await dataSource.configure();

    expect(dataSource.createConnectorCalls).toBe(1);
    expect(dataSource.getConnector()).toEqual({ name: 'built-connector' } as AnyType);
  });

  test('configure() is re-entrant - a second call is a no-op, not a rebuild', async () => {
    const dataSource = new LifecycleDataSource({ name: 'reentrant-ds', config: {} });

    await dataSource.configure();
    const first = dataSource.getConnector();
    await dataSource.configure();

    expect(dataSource.createConnectorCalls).toBe(1);
    expect(dataSource.getConnector()).toBe(first);
  });
});

/** Recursively lists every .ts file under `dir` (relative to the package root). */
const listTsFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      files.push(...listTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
};

describe('BaseSearchDataSource - paradigm seam (connectors/search imports no engine)', () => {
  test('no file under src/connectors/search imports typesense or meilisearch', async () => {
    for (const file of listTsFiles('src/connectors/search')) {
      const content = await Bun.file(file).text();

      expect(content).not.toContain('connectors/typesense');
      expect(content).not.toContain('connectors/meilisearch');
      expect(content).not.toContain("from 'typesense");
      expect(content).not.toContain("from 'meilisearch");
    }
  });
});
