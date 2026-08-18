import { describe, test, expect } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

import { model, repository } from '@venizia/ignis-kernel';
import { TypesenseDataSource, TypesenseConnector, TypesenseQueryDialect } from '@/search/typesense';
import { compileTypesenseCollection } from '@/search/typesense/compiler';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import { BaseSearchEntity, defineSearchCollection, field } from '@/search/core/models';

/** Minimal fake Typesense client-shaped connector - records `ensureCollection`/`multiSearch`/synonym-set calls. */
class FakeTypesenseConnector {
  ensureCalls: unknown[] = [];
  multiSearchCalls: unknown[] = [];
  synonymSetCalls: Array<{ name: string; items: unknown }> = [];
  linkCalls: Array<{ collection: string; synonymSets: string[] }> = [];

  collection = {
    ensure: async (opts: { schema: unknown }): Promise<unknown> => {
      this.ensureCalls.push(opts.schema);
      return opts.schema;
    },
  };

  synonymSet = {
    upsert: async (opts: { name: string; items: unknown }): Promise<void> => {
      this.synonymSetCalls.push(opts);
    },
    link: async (opts: { collection: string; synonymSets: string[] }): Promise<void> => {
      this.linkCalls.push(opts);
    },
  };

  async ping(): Promise<boolean> {
    return true;
  }

  async multiSearch(opts: unknown): Promise<unknown> {
    this.multiSearchCalls.push(opts);
    return { results: [{ found: 1 }] };
  }
}

/** FakeTypesenseConnector implements only the methods these tests exercise; TypesenseConnector is a concrete class with a private `client` field, so no fake is structurally assignable to it - this is the single boundary cast every fake-connector injection in this file funnels through. */
const asTypesenseConnector = (fake: FakeTypesenseConnector): TypesenseConnector => fake as any;

// Prefixed, and every fixture datasource name in this package must stay unique: the registry keys
// `datasourceModels` by the CLASS NAME and the whole suite shares one realm-anchored
// MetadataRegistry, so a same-named class in another test file merges its models into this one's
// set. `AppSearchDataSource` did exactly that with search/repositories/integration-wiring.test.ts.
class TypesenseAppSearchDataSource extends TypesenseDataSource {}
class SkipProvisionDataSource extends TypesenseDataSource {}
class SynonymProvisionDataSource extends TypesenseDataSource {}

@model({ type: 'entity' })
class ProductDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products',
    fields: [field.string('title', { searchable: true })],
  });
}

@repository({ model: ProductDocument, dataSource: TypesenseAppSearchDataSource })
class TypesenseProductRepository {}

@model({ type: 'entity' })
class GizmoDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'gizmos',
    fields: [field.string('title')],
  });
}

@repository({ model: GizmoDocument, dataSource: SkipProvisionDataSource })
class GizmoRepo {}

@model({ type: 'entity' })
class WidgetDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'widgets',
    fields: [field.string('title')],
    synonyms: [
      { id: 'widget-synonyms', synonyms: ['widget', 'gadget', 'gizmo'] },
      { id: 'widget-oneway', synonyms: ['thingamajig'], root: 'widget' },
    ],
  });
}

@repository({ model: WidgetDocument, dataSource: SynonymProvisionDataSource })
class TypesenseWidgetRepository {}

describe('TypesenseDataSource', () => {
  // The mirror of the same guard in search/repositories/integration-wiring.test.ts. A merge can only
  // be seen by whichever of the two files the walk order puts LAST, and that order is not a
  // guarantee - so the exact-set assertion has to live in both.
  test('discovery holds exactly the collection this file declares - no same-named class merged in', () => {
    const dataSource = new TypesenseAppSearchDataSource({
      name: 'discovery-isolation-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    expect(Object.keys(dataSource.getSchema())).toEqual(['products']);
  });

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: TypesenseProductRepository.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: GizmoRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: TypesenseWidgetRepository.name })).toBeDefined();
  });

  test('configure() builds the connector-less path only when no connector is injected, and provisions the compiled schema', async () => {
    const fakeConnector = new FakeTypesenseConnector();

    const ds = new TypesenseAppSearchDataSource({
      name: 'app-search',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
      autoProvision: true,
    });

    await ds.configure();

    const definition = ProductDocument.schema;
    const expectedSchema = compileTypesenseCollection({ definition });

    expect(fakeConnector.ensureCalls).toEqual([expectedSchema]);
    expect(ds.getConnector()).toBe(asTypesenseConnector(fakeConnector));
  });

  test('getConnector() throws before configure() has run', () => {
    // Constructed as TypesenseDataSource itself, not a subclass: the shared base names the error after the runtime class, so only a direct instance pins the message an app actually sees.
    const ds = new TypesenseDataSource({
      name: 'no-connector-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
    });

    expect(() => ds.getConnector()).toThrow(/\[TypesenseDataSource\] Connector not initialized/);
    expect(() => ds.getConnector()).toThrow(/Name: no-connector-ds \| Call configure\(\) first/);
  });

  test('autoProvision: false skips ensureCollection entirely', async () => {
    const fakeConnector = new FakeTypesenseConnector();

    const ds = new SkipProvisionDataSource({
      name: 'skip-provision-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
      autoProvision: false,
    });

    await ds.configure();

    expect(fakeConnector.ensureCalls).toEqual([]);
  });

  test('provisionCollections creates one synonym set from the declarative synonyms and links it after ensureCollection', async () => {
    const fakeConnector = new FakeTypesenseConnector();

    const ds = new SynonymProvisionDataSource({
      name: 'synonym-provision-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
      autoProvision: true,
    });

    await ds.configure();

    expect(fakeConnector.ensureCalls.length).toBe(1);
    expect(fakeConnector.synonymSetCalls).toEqual([
      {
        name: 'widgets_synonyms',
        items: [
          { id: 'widget-synonyms', synonyms: ['widget', 'gadget', 'gizmo'] },
          { id: 'widget-oneway', synonyms: ['thingamajig'], root: 'widget' },
        ],
      },
    ]);
    expect(fakeConnector.linkCalls).toEqual([
      { collection: 'widgets', synonymSets: ['widgets_synonyms'] },
    ]);
  });

  test('configure() is re-entrant-safe: a second call skips re-provisioning, same connector instance', async () => {
    const fakeConnector = new FakeTypesenseConnector();

    const ds = new TypesenseAppSearchDataSource({
      name: 'reentrant-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
      autoProvision: true,
    });

    await ds.configure();
    expect(ds.getConnector()).toBe(asTypesenseConnector(fakeConnector));
    expect(fakeConnector.ensureCalls.length).toBe(1);

    await ds.configure();

    // No second provisioning pass, and the connector instance is unchanged.
    expect(fakeConnector.ensureCalls.length).toBe(1);
    expect(ds.getConnector()).toBe(asTypesenseConnector(fakeConnector));
  });

  test('getQueryDialect() returns a TypesenseQueryDialect', () => {
    const ds = new TypesenseAppSearchDataSource({
      name: 'query-dialect-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    expect(ds.getQueryDialect()).toBeInstanceOf(TypesenseQueryDialect);
  });

  test('compileCollection() delegates to compileTypesenseCollection', () => {
    const ds = new TypesenseAppSearchDataSource({
      name: 'compile-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    const definition = ProductDocument.schema;
    expect(ds.compileCollection({ definition })).toEqual(
      compileTypesenseCollection({ definition }),
    );
  });

  // Typesense inherits AbstractDataSource's NotSupported-by-default transaction members; search.vector, search.multi/search.union and synonyms are all shipped capabilities.
  test('getCapabilities() reports no transactions and the search capability flags', () => {
    const ds = new TypesenseAppSearchDataSource({
      name: 'capabilities-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    expect(ds.getCapabilities()).toEqual({
      transactions: false,
      search: {
        vector: true,
        multi: true,
        union: true,
        synonyms: true,
      },
    });
  });

  test('multiSearch() maps camelCase search params + commonParams to the engine wire (snake_case)', async () => {
    const fakeConnector = new FakeTypesenseConnector();
    const ds = new TypesenseAppSearchDataSource({
      name: 'multi-search-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
    });
    await ds.configure();

    await ds.multiSearch({
      searches: [
        { collection: 'products', query: 'shoes', filterBy: 'price:>100', queryBy: ['name'] },
        { collection: 'brands', query: 'shoe' },
      ],
      commonParams: { perPage: 20 },
      union: true,
    });

    // Friendly in (query/queryBy: string[]/filterBy/perPage) -> snake_case wire out (q/query_by/filter_by/per_page), the same mapping single-collection search() uses.
    expect(fakeConnector.multiSearchCalls).toEqual([
      {
        searches: [
          { collection: 'products', q: 'shoes', ['filter_by']: 'price:>100', ['query_by']: 'name' },
          { collection: 'brands', q: 'shoe' },
        ],
        union: true,
        commonParams: { ['per_page']: 20 },
      },
    ]);
  });

  test('beginTransaction() rejects with the standardized NotSupported error (501, core.not_supported)', async () => {
    const ds = new TypesenseAppSearchDataSource({
      name: 'no-transaction-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    let caught: unknown;
    try {
      await ds.beginTransaction();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
    expect((caught as ApplicationError).normalized.code).toBe('core.not_supported');
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

describe('barrel purity', () => {
  test('root barrel does not reach the typesense subtree', async () => {
    // `base/datasources` lives in the kernel package - the invariant (datasource abstractions
    // never mention the typesense connector) belongs there, not in this package.
    const rootIndex = await Bun.file('src/index.ts').text();
    const datasourcesIndex = await Bun.file('../kernel/src/base/datasources/index.ts').text();

    expect(rootIndex).not.toContain('typesense');
    expect(datasourcesIndex).not.toContain('typesense');
  });

  test('src/index.ts and the kernel base tree never import the typesense connector', async () => {
    // typesense is optional - only src/search/typesense/ and its sub-path consumers may reference
    // it; neutral code (the root barrel, the kernel's base tree) must never import it, even
    // transitively. This package has no local base tree of its own - that concept lives entirely
    // in the kernel package - so only the sibling check remains.
    const rootIndex = await Bun.file('src/index.ts').text();
    expect(rootIndex).not.toContain('search/typesense');

    for (const file of listTsFiles('../kernel/src/base')) {
      const content = await Bun.file(file).text();
      expect(content).not.toContain('search/typesense');
    }
  });

  test('the kernel base tree has zero search-named folders (T3: search dissolved into search/typesense)', () => {
    // This package has no local base tree of its own - see the two tests above - so the
    // invariant now guards the sibling kernel package: its base tree must never regrow a
    // `search`-named folder, which is the exact naming collision this migration exists to avoid.
    const hasSearchFolder = (dir: string): boolean => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);

        if (!statSync(fullPath).isDirectory()) {
          continue;
        }

        if (entry === 'search') {
          return true;
        }

        if (hasSearchFolder(fullPath)) {
          return true;
        }
      }

      return false;
    };

    expect(hasSearchFolder('../kernel/src/base')).toBe(false);
  });
});
