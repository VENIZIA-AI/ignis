import { describe, test, expect } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';

import { model, repository } from '@/base/metadata';
import {
  TypesenseDataSource,
  TypesenseDriver,
  TypesenseQueryDialect,
} from '@/connectors/typesense';
import { compileTypesenseCollection } from '@/connectors/typesense/compiler';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseSearchEntity, defineSearchCollection, field } from '@/connectors/typesense/models';

/** Minimal fake Typesense client-shaped driver - records `ensureCollection` calls. */
class FakeTypesenseDriver {
  ensureCalls: unknown[] = [];

  async ensureCollection(opts: { schema: unknown }): Promise<unknown> {
    this.ensureCalls.push(opts.schema);
    return opts.schema;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

/** FakeTypesenseDriver only implements the two methods these tests exercise (`ensureCollection`,
 * `ping`); TypesenseDriver is a concrete class with a private `client` field, so no fake can be
 * structurally assignable to it - this is the single boundary cast every fake-driver injection in
 * this file funnels through. */
const asTypesenseDriver = (fake: FakeTypesenseDriver): TypesenseDriver => fake as any;

class AppSearchDataSource extends TypesenseDataSource {}
class NoDriverDataSource extends TypesenseDataSource {}
class SkipProvisionDataSource extends TypesenseDataSource {}

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

describe('TypesenseDataSource', () => {
  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _ProductRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _GizmoRepo.name })).toBeDefined();
  });

  test('configure() builds the driver-less path only when no driver is injected, and provisions the compiled schema', async () => {
    const fakeDriver = new FakeTypesenseDriver();

    const ds = new AppSearchDataSource({
      name: 'app-search',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(fakeDriver),
    });

    await ds.configure();

    const definition = ProductDocument.schema;
    const expectedSchema = compileTypesenseCollection({ definition });

    expect(fakeDriver.ensureCalls).toEqual([expectedSchema]);
    expect(ds.getDriver()).toBe(asTypesenseDriver(fakeDriver));
  });

  test('getDriver() throws before configure() has run', () => {
    const ds = new NoDriverDataSource({
      name: 'no-driver-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
    });

    expect(() => ds.getDriver()).toThrow(/\[TypesenseDataSource\] Driver not initialized/);
  });

  test('autoProvision: false skips ensureCollection entirely', async () => {
    const fakeDriver = new FakeTypesenseDriver();

    const ds = new SkipProvisionDataSource({
      name: 'skip-provision-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(fakeDriver),
      autoProvision: false,
    });

    await ds.configure();

    expect(fakeDriver.ensureCalls).toEqual([]);
  });

  test('configure() is re-entrant-safe: a second call skips re-provisioning, same driver instance', async () => {
    const fakeDriver = new FakeTypesenseDriver();

    const ds = new AppSearchDataSource({
      name: 'reentrant-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(fakeDriver),
    });

    await ds.configure();
    expect(ds.getDriver()).toBe(asTypesenseDriver(fakeDriver));
    expect(fakeDriver.ensureCalls.length).toBe(1);

    await ds.configure();

    // No second provisioning pass, and the driver instance is unchanged.
    expect(fakeDriver.ensureCalls.length).toBe(1);
    expect(ds.getDriver()).toBe(asTypesenseDriver(fakeDriver));
  });

  test('getQueryDialect() returns a TypesenseQueryDialect', () => {
    const ds = new AppSearchDataSource({
      name: 'query-dialect-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(new FakeTypesenseDriver()),
    });

    expect(ds.getQueryDialect()).toBeInstanceOf(TypesenseQueryDialect);
  });

  test('compileCollection() delegates to compileTypesenseCollection', () => {
    const ds = new AppSearchDataSource({
      name: 'compile-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(new FakeTypesenseDriver()),
    });

    const definition = ProductDocument.schema;
    expect(ds.compileCollection({ definition })).toEqual(
      compileTypesenseCollection({ definition }),
    );
  });

  // Typesense adds no transaction support - it inherits AbstractDataSource's NotSupported-by-default
  // beginTransaction()/getCapabilities().
  test('getCapabilities() defaults to { transactions: false } - Typesense adds no override', () => {
    const ds = new AppSearchDataSource({
      name: 'capabilities-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(new FakeTypesenseDriver()),
    });

    expect(ds.getCapabilities()).toEqual({ transactions: false });
  });

  test('beginTransaction() rejects with the standardized NotSupported error (501, core.not_supported)', async () => {
    const ds = new AppSearchDataSource({
      name: 'no-transaction-ds',
      config: { nodes: [{ host: 'localhost', port: 8108 }], apiKey: 'xyz' },
      driver: asTypesenseDriver(new FakeTypesenseDriver()),
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
