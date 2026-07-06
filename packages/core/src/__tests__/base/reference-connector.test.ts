// Must precede the controllers/factory import below: import order avoids a circular-import
// TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@/base/applications';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, test, expect } from 'bun:test';
import { ApplicationError, getError, HTTP } from '@venizia/ignis-helpers';
import { z } from '@hono/zod-openapi';

import { ControllerFactory } from '@/base/controllers/factory';
import { model, repository } from '@/base/metadata';
import { AbstractEntity, SchemaTypes, TSchemaType } from '@/base/models';
import { ICrudRepository } from '@/base/repositories/common';
import { AbstractRepository } from '@/base/repositories/core';
import { MetadataRegistry } from '@/helpers/inversion';

import { MemoryDataSource, MemoryRepository } from '@/connectors/memory';

/**
 * SHIPPED-CONNECTOR CONFORMANCE PROOF
 *
 * `src/connectors/memory/` was promoted from a fixture-only reference connector into a shipped,
 * first-class connector (an in-memory engine for prototyping and tests - the LoopBack
 * memory-connector role). This suite still answers the original question with a machine-checked
 * test instead of a design doc: "if I add opensearch/meilisearch/h2/mysql/mongodb, does creating
 * connectors/<engine> just work by extending src/base alone?" If this suite ever needs to touch a
 * file outside `src/connectors/memory` + `src/base` to pass, that touch IS the finding - a gap in
 * `src/base`, not a bug in the memory connector.
 *
 * Operator-level behavior (every where-operator, order, fields, envelopes, NotSupported paths) is
 * covered separately in `src/__tests__/connectors/memory/repository.test.ts` - this file stays
 * scoped to base-only purity + wiring.
 */

const MemorySelectSchema = z.object({
  id: z.string(),
  title: z.string(),
  secret: z.string().optional(),
  isActive: z.boolean().default(true),
});

const MemoryCreateSchema = z.object({
  title: z.string(),
  secret: z.string().optional(),
  isActive: z.boolean().optional(),
});

const MemoryUpdateSchema = MemoryCreateSchema.partial();

type TMemoryDocument = z.infer<typeof MemorySelectSchema>;

/** Test entity - proves @model settings (hiddenProperties/defaultFilter/defaultLimit) flow through
 * the shipped connector untouched. `getIdType()` is left inherited from AbstractEntity ('string'). */
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['secret'],
    defaultFilter: { where: { isActive: true } },
    defaultLimit: 2,
  },
})
class MemoryEntityFixture extends AbstractEntity {
  static readonly COLLECTION_NAME = 'memory_products';

  constructor() {
    super({ name: MemoryEntityFixture.COLLECTION_NAME });
  }

  getSchema(opts: { type: TSchemaType }): z.ZodTypeAny {
    switch (opts.type) {
      case SchemaTypes.SELECT: {
        return MemorySelectSchema;
      }
      case SchemaTypes.CREATE: {
        return MemoryCreateSchema;
      }
      case SchemaTypes.UPDATE: {
        return MemoryUpdateSchema;
      }
      default: {
        throw getError({
          message: `[MemoryEntityFixture][getSchema] Unsupported schema type | type: ${opts.type}`,
        });
      }
    }
  }
}

// Own datasource/repository binding (not reused from another test file): the model registry is a
// process-wide singleton keyed by class name, and getBoundModelClasses() is keyed by dataSource class.
@repository({ model: MemoryEntityFixture, dataSource: MemoryDataSource })
class MemoryProductRepository extends MemoryRepository<TMemoryDocument> {}

const MEMORY_CONNECTOR_DIR = path.join(__dirname, '../../connectors/memory');

/** Every `.ts` source file under the shipped connector, read for the purity assertions below -
 * mirrors the old fixture-source grep, scaled to a real multi-file connector. */
const collectConnectorSources = (dir: string): Array<{ filePath: string; source: string }> => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: Array<{ filePath: string; source: string }> = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectConnectorSources(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push({ filePath: entryPath, source: fs.readFileSync(entryPath, 'utf-8') });
    }
  }

  return files;
};

const CONNECTOR_SOURCES = collectConnectorSources(MEMORY_CONNECTOR_DIR);

/** Mirrors the typesense not-supported-transaction suite's assertion helper - same shape, same convention. */
const expectNotSupported = (caught: unknown): void => {
  expect(caught).toBeInstanceOf(ApplicationError);
  const appError = caught as ApplicationError;
  expect(appError.statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
  expect(appError.messageCode).toBe('core.not_supported');
};

describe('Memory connector - base-only conformance proof', () => {
  describe('A. Purity - connector imports only @/base, @/utilities, @venizia/ignis-helpers, zod family, and itself', () => {
    test('the shipped connector has more than one source file (the suite is exercising the real tree)', () => {
      expect(CONNECTOR_SOURCES.length).toBeGreaterThan(1);
    });

    test('no connector source references @/connectors/postgres or @/connectors/typesense', () => {
      for (const { source } of CONNECTOR_SOURCES) {
        expect(source.includes('@/connectors/postgres')).toBe(false);
        expect(source.includes('@/connectors/typesense')).toBe(false);
      }
    });

    test('every import specifier across the connector resolves to an allowed prefix', () => {
      const allowedPrefixes = [
        '@/base',
        '@/utilities',
        '@/connectors/memory',
        '@venizia/ignis-helpers',
        '@hono/zod-openapi',
        'zod',
      ];
      const importPattern = /(?:from|import)\s+['"]([^'"]+)['"]/g;

      let totalSpecifiers = 0;

      for (const { filePath, source } of CONNECTOR_SOURCES) {
        const specifiers = [...source.matchAll(importPattern)].map(match => match[1]);
        totalSpecifiers += specifiers.length;

        for (const specifier of specifiers) {
          // A relative specifier ('./where-matcher') never leaves the connector's own directory
          // tree, so it can't reach postgres/typesense - only absolute '@/...' specifiers need the
          // prefix check.
          const isAllowed =
            specifier.startsWith('.') ||
            allowedPrefixes.some(
              prefix => specifier === prefix || specifier.startsWith(`${prefix}/`),
            );

          if (!isAllowed) {
            throw getError({
              message: `[reference-connector.test][purity] Disallowed import '${specifier}' in ${filePath}`,
            });
          }
        }
      }

      // Fails closed: if the regex ever stops matching real imports, this catches it too.
      expect(totalSpecifiers).toBeGreaterThan(0);
    });
  });

  describe('B. CRUD behavior over the Map store', () => {
    test('create -> find -> updateById -> deleteById round-trips through the store', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-crud' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      const { data: created } = await repositoryInstance.create({
        data: { title: 'Widget', isActive: true } as TMemoryDocument,
      });
      expect(created.title).toBe('Widget');
      expect(typeof created.id).toBe('string');

      const found = await repositoryInstance.findById({ id: created.id });
      expect(found?.title).toBe('Widget');

      const { data: updated } = await repositoryInstance.updateById({
        id: created.id,
        data: { title: 'Widget v2' },
      });
      expect(updated.title).toBe('Widget v2');

      const { data: deleted } = await repositoryInstance.deleteById({ id: created.id });
      expect(deleted.title).toBe('Widget v2');

      const afterDelete = await repositoryInstance.findById({ id: created.id });
      expect(afterDelete).toBeNull();
    });

    test('hiddenFields never appear in create/find/update/delete outputs', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-hidden' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      const { data: created } = await repositoryInstance.create({
        data: { title: 'Secretive', secret: 'shh', isActive: true } as TMemoryDocument,
      });
      expect((created as Record<string, unknown>).secret).toBeUndefined();

      const found = await repositoryInstance.findById({ id: created.id });
      expect((found as Record<string, unknown> | null)?.secret).toBeUndefined();

      const { data: updated } = await repositoryInstance.updateById({
        id: created.id,
        data: { secret: 'still-hidden' },
      });
      expect((updated as Record<string, unknown>).secret).toBeUndefined();

      const { data: deleted } = await repositoryInstance.deleteById({ id: created.id });
      expect((deleted as Record<string, unknown>).secret).toBeUndefined();
    });

    test('defaultFilter excludes soft-hidden rows unless shouldSkipDefaultFilter', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-default-filter' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      await repositoryInstance.create({
        data: { title: 'Visible', isActive: true } as TMemoryDocument,
      });
      await repositoryInstance.create({
        data: { title: 'Hidden', isActive: false } as TMemoryDocument,
      });

      const visible = await repositoryInstance.find({ filter: {} });
      expect(visible.map(document => document.title)).toEqual(['Visible']);

      const all = await repositoryInstance.find({
        filter: {},
        options: { shouldSkipDefaultFilter: true },
      });
      expect(all.length).toBe(2);
    });

    test('defaultLimit caps find() results when filter omits limit', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-default-limit' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      for (let index = 0; index < 5; index++) {
        await repositoryInstance.create({
          data: { title: `Item ${index}`, isActive: true } as TMemoryDocument,
        });
      }

      // @model settings.defaultLimit is 2 on MemoryEntityFixture.
      const capped = await repositoryInstance.find({ filter: {} });
      expect(capped.length).toBe(2);

      const uncapped = await repositoryInstance.find({ filter: { limit: 10 } });
      expect(uncapped.length).toBe(5);
    });

    test('shouldQueryRange returns { data, range: { start, end, total } }', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-range' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      for (let index = 0; index < 5; index++) {
        await repositoryInstance.create({
          data: { title: `Item ${index}`, isActive: true } as TMemoryDocument,
        });
      }

      const { data, range } = await repositoryInstance.find({
        filter: { limit: 10 },
        options: { shouldQueryRange: true },
      });

      expect(data.length).toBe(5);
      expect(range).toEqual({ start: 0, end: 4, total: 5 });
    });

    test('gt/gte/lt/lte + and where operators flow through the where language', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-operators' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      for (const title of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
        await repositoryInstance.create({ data: { title, isActive: true } as TMemoryDocument });
      }

      const greaterThan = await repositoryInstance.find({
        filter: { where: { title: { gt: 'Bravo' } }, limit: 10 },
      });
      expect(greaterThan.map(document => document.title).sort()).toEqual(['Charlie', 'Delta']);

      const lessThan = await repositoryInstance.find({
        filter: { where: { title: { lt: 'Bravo' } }, limit: 10 },
      });
      expect(lessThan.map(document => document.title)).toEqual(['Alpha']);

      const andRange = await repositoryInstance.find({
        filter: {
          where: { and: [{ title: { gte: 'Bravo' } }, { title: { lte: 'Charlie' } }] },
          limit: 10,
        },
      });
      expect(andRange.map(document => document.title).sort()).toEqual(['Bravo', 'Charlie']);
    });
  });

  describe('C. Capability model', () => {
    test('getCapabilities().transactions is false (inherited default, no override)', () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-capabilities' });
      expect(dataSource.getCapabilities()).toEqual({ transactions: false });
    });

    test('beginTransaction() rejects with statusCode 501 + messageCode core.not_supported', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-tx' });

      let caught: unknown;
      try {
        await dataSource.beginTransaction();
      } catch (error) {
        caught = error;
      }

      expectNotSupported(caught);
    });

    test('options.transaction on a verb throws the same NotSupported error', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-tx-verb' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);
      const fakeTransaction = { isActive: true, commit: async () => {}, rollback: async () => {} };

      let caught: unknown;
      try {
        await repositoryInstance.find({ filter: {}, options: { transaction: fakeTransaction } });
      } catch (error) {
        caught = error;
      }

      expectNotSupported(caught);
    });
  });

  describe('D. Provisioning via base discovery helpers', () => {
    test('configure() provisions a collection for the bound entity using getBoundModelClasses/discoverDefinitions', () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-provision' });
      expect(dataSource.hasCollection({ name: MemoryEntityFixture.COLLECTION_NAME })).toBe(false);

      dataSource.configure();

      expect(dataSource.hasCollection({ name: MemoryEntityFixture.COLLECTION_NAME })).toBe(true);
      expect(dataSource.getSchema()[MemoryEntityFixture.COLLECTION_NAME]).toEqual({
        name: MemoryEntityFixture.COLLECTION_NAME,
      });
    });
  });

  describe('E. ControllerFactory wiring - AbstractRepository flows through with zero casts', () => {
    test('defineCrudController accepts the memory repository and count/find return data from the Map store', async () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-factory' });
      dataSource.configure();

      // Typed as the engine-neutral AbstractRepository - the money shot: no cast down to a
      // connector-specific repository type is needed for the factory to accept it.
      const repositoryInstance: AbstractRepository<TMemoryDocument, TMemoryDocument> =
        new MemoryProductRepository(dataSource);

      await repositoryInstance.createAll({
        data: [
          { title: 'Alpha', isActive: true } as TMemoryDocument,
          { title: 'Bravo', isActive: true } as TMemoryDocument,
        ],
      });

      const MemoryProductController = ControllerFactory.defineCrudController({
        entity: MemoryEntityFixture,
        repository: { name: MemoryProductRepository.name },
        controller: {
          name: 'MemoryProductController',
          basePath: '/memory/products',
          enabledRoutes: ['count', 'find', 'findById', 'create', 'updateById', 'deleteById'],
        },
      });

      const controller = new MemoryProductController(repositoryInstance);
      controller['binding']();

      const distinctRoutes = new Set(
        controller.router.routes.map(route => `${route.method} ${route.path}`),
      );
      expect(distinctRoutes.size).toBe(6);

      const countResponse = await controller.router.request('/count?where=%7B%7D');
      expect(countResponse.status).toBe(200);
      const countBody = (await countResponse.json()) as { count: number };
      expect(countBody.count).toBe(2);

      const findResponse = await controller.router.request('/');
      expect(findResponse.status).toBe(200);
      const findBody = (await findResponse.json()) as { data: TMemoryDocument[] };
      expect(findBody.data.map(document => document.title).sort()).toEqual(['Alpha', 'Bravo']);
    });
  });

  describe('F. Type-level conformance', () => {
    test('MemoryRepository satisfies ICrudRepository<TMemoryDocument> with no cast', () => {
      const dataSource = new MemoryDataSource({ name: 'memory-ds-type-level' });
      dataSource.configure();
      const repositoryInstance = new MemoryProductRepository(dataSource);

      const conforms: ICrudRepository<TMemoryDocument> = repositoryInstance;

      expect(conforms).toBe(repositoryInstance);
      expect(conforms.getEntity().name).toBe(MemoryEntityFixture.COLLECTION_NAME);
    });
  });

  describe('sanity - repository binding is actually registered (guards the whole suite)', () => {
    test('MetadataRegistry has the @repository binding for MemoryProductRepository', () => {
      const registry = MetadataRegistry.getInstance();
      const binding = registry.getRepositoryBinding({ name: MemoryProductRepository.name });

      expect(binding).toBeDefined();
      expect(binding?.model).toBe(MemoryEntityFixture);
      expect(binding?.dataSource).toBe(MemoryDataSource);
    });
  });
});
