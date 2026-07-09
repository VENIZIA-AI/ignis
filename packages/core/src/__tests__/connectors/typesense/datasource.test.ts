import { describe, test, expect } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';

import { model, repository } from '@/base/metadata';
import {
  TypesenseDataSource,
  TypesenseConnector,
  TypesenseQueryDialect,
} from '@/connectors/typesense';
import { compileTypesenseCollection } from '@/connectors/typesense/compiler';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseSearchEntity, defineSearchCollection, field } from '@/connectors/typesense/models';

/** Minimal fake Typesense client-shaped connector - records `ensureCollection`/`multiSearch`/synonym-set calls. */
class FakeTypesenseConnector {
  ensureCalls: unknown[] = [];
  multiSearchCalls: unknown[] = [];
  synonymSetCalls: Array<{ name: string; items: unknown }> = [];
  linkCalls: Array<{ collection: string; synonymSets: string[] }> = [];

  async ensureCollection(opts: { schema: unknown }): Promise<unknown> {
    this.ensureCalls.push(opts.schema);
    return opts.schema;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async multiSearch(opts: unknown): Promise<unknown> {
    this.multiSearchCalls.push(opts);
    return { results: [{ found: 1 }] };
  }

  async upsertSynonymSet(opts: { name: string; items: unknown }): Promise<void> {
    this.synonymSetCalls.push(opts);
  }

  async linkSynonymSets(opts: { collection: string; synonymSets: string[] }): Promise<void> {
    this.linkCalls.push(opts);
  }
}

/** FakeTypesenseConnector only implements the methods these tests exercise (`ensureCollection`,
 * `ping`, `multiSearch`, synonym sets); TypesenseConnector is a concrete class with a private
 * `client` field, so no fake can be structurally assignable to it - this is the single boundary
 * cast every fake-connector injection in this file funnels through. */
const asTypesenseConnector = (fake: FakeTypesenseConnector): TypesenseConnector => fake as any;

class AppSearchDataSource extends TypesenseDataSource {}
class NoConnectorDataSource extends TypesenseDataSource {}
class SkipProvisionDataSource extends TypesenseDataSource {}
class SynonymProvisionDataSource extends TypesenseDataSource {}

@model({ type: 'entity' })
class ProductDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products',
    fields: [field.string('title', { searchable: true })],
  });
}

@repository({ model: ProductDocument, dataSource: AppSearchDataSource })
class _ProductRepo {}

@model({ type: 'entity' })
class GizmoDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'gizmos',
    fields: [field.string('title')],
  });
}

@repository({ model: GizmoDocument, dataSource: SkipProvisionDataSource })
class _GizmoRepo {}

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
class _WidgetRepo {}

describe('TypesenseDataSource', () => {
  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _ProductRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _GizmoRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _WidgetRepo.name })).toBeDefined();
  });

  test('configure() builds the connector-less path only when no connector is injected, and provisions the compiled schema', async () => {
    const fakeConnector = new FakeTypesenseConnector();

    const ds = new AppSearchDataSource({
      name: 'app-search',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
    });

    await ds.configure();

    const definition = ProductDocument.schema;
    const expectedSchema = compileTypesenseCollection({ definition });

    expect(fakeConnector.ensureCalls).toEqual([expectedSchema]);
    expect(ds.getConnector()).toBe(asTypesenseConnector(fakeConnector));
  });

  test('getConnector() throws before configure() has run', () => {
    const ds = new NoConnectorDataSource({
      name: 'no-connector-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
    });

    expect(() => ds.getConnector()).toThrow(/\[TypesenseDataSource\] Connector not initialized/);
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

    const ds = new AppSearchDataSource({
      name: 'reentrant-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(fakeConnector),
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
    const ds = new AppSearchDataSource({
      name: 'query-dialect-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    expect(ds.getQueryDialect()).toBeInstanceOf(TypesenseQueryDialect);
  });

  test('compileCollection() delegates to compileTypesenseCollection', () => {
    const ds = new AppSearchDataSource({
      name: 'compile-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      connector: asTypesenseConnector(new FakeTypesenseConnector()),
    });

    const definition = ProductDocument.schema;
    expect(ds.compileCollection({ definition })).toEqual(
      compileTypesenseCollection({ definition }),
    );
  });

  // Typesense adds no transaction support - it inherits AbstractDataSource's NotSupported-by-default
  // beginTransaction()/getCapabilities(). search.vector is true - Phase 2 landed first-class VECTOR
  // fields (client-provided + server-side auto-embedding). search.multi/search.union are true -
  // Phase 4 landed federated + union multi-search. synonyms is true - Phase 5 landed first-class
  // multi-way/one-way synonym sets (declarative + runtime, auto-provisioned).
  test('getCapabilities() reports no transactions and the search capability flags', () => {
    const ds = new AppSearchDataSource({
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
    const ds = new AppSearchDataSource({
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

    // Friendly in (query/queryBy: string[]/filterBy/perPage) -> snake_case wire out
    // (q/query_by/filter_by/per_page), same mapping single-collection search() uses.
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
    const ds = new AppSearchDataSource({
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
    expect((caught as ApplicationError).messageCode).toBe('core.not_supported');
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
    const rootIndex = await Bun.file('src/index.ts').text();
    const datasourcesIndex = await Bun.file('src/base/datasources/index.ts').text();

    expect(rootIndex).not.toContain('typesense');
    expect(datasourcesIndex).not.toContain('typesense');
  });

  test('src/index.ts and src/base/** never import the typesense connector', async () => {
    // typesense is optional - only src/connectors/typesense/ and its sub-path consumers may
    // reference it; neutral code (src/base, root barrel) must never import it, even transitively.
    const rootIndex = await Bun.file('src/index.ts').text();
    expect(rootIndex).not.toContain('connectors/typesense');

    for (const file of listTsFiles('src/base')) {
      const content = await Bun.file(file).text();
      expect(content).not.toContain('connectors/typesense');
    }
  });

  test('src/base has zero search-named folders (T3: search dissolved into connectors/typesense)', () => {
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

    expect(hasSearchFolder('src/base')).toBe(false);
  });
});
