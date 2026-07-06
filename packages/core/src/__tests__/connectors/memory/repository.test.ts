import { describe, test, expect, beforeEach } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { ApplicationError, getError, HTTP } from '@venizia/ignis-helpers';

import { model } from '@/base/metadata';
import { AbstractEntity, SchemaTypes, TSchemaType } from '@/base/models';
import { LockStrengths, TFilter, TLockOptions } from '@/base/repositories/common';
import { MemoryDataSource, MemoryRepository } from '@/connectors/memory';

/**
 * OPERATOR-COVERAGE SUITE for the shipped memory connector (`src/connectors/memory/`).
 *
 * `src/__tests__/base/reference-connector.test.ts` is the architecture-conformance gate (base-only
 * purity + wiring); this file is the behavior gate for the operator vocabulary the memory
 * connector actually implements: eq (implicit)/neq, gt/gte/lt/lte, like/ilike, inq/nin, between,
 * and/or, order, skip/limit, fields projection, envelopes, and the NotSupported paths.
 */

const ProductSelectSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  secret: z.string().optional(),
});

const ProductCreateSchema = ProductSelectSchema.partial({ id: true, isActive: true });

type TProductDocument = z.infer<typeof ProductSelectSchema>;

/** `defaultLimit: 3` proves the pagination fallback; no `defaultFilter` here - that combination is
 * already covered by `reference-connector.test.ts`, this file stays focused on the operator vocabulary. */
@model({ type: 'entity', settings: { hiddenProperties: ['secret'], defaultLimit: 3 } })
class MemoryOperatorProductEntity extends AbstractEntity {
  constructor() {
    super({ name: 'memory_operator_products' });
  }

  getSchema(opts: { type: TSchemaType }): z.ZodTypeAny {
    switch (opts.type) {
      case SchemaTypes.SELECT: {
        return ProductSelectSchema;
      }
      case SchemaTypes.CREATE: {
        return ProductCreateSchema;
      }
      case SchemaTypes.UPDATE: {
        return ProductCreateSchema.partial();
      }
      default: {
        throw getError({
          message: `[MemoryOperatorProductEntity][getSchema] Unsupported schema type | type: ${opts.type}`,
        });
      }
    }
  }
}

const expectNotSupported = (caught: unknown): void => {
  expect(caught).toBeInstanceOf(ApplicationError);
  const appError = caught as ApplicationError;
  expect(appError.statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
  expect(appError.messageCode).toBe('core.not_supported');
};

describe('MemoryRepository - operator coverage', () => {
  let dataSource: MemoryDataSource;
  let repository: MemoryRepository<TProductDocument>;

  // No `@repository`/`MetadataRegistry` binding - `entityClass` resolves the entity directly
  // (same pattern the typesense fake-driver suite uses), so `dataSource.configure()` is never
  // needed: `getStore()` provisions the collection lazily on first access.
  beforeEach(async () => {
    dataSource = new MemoryDataSource({ name: `memory-ops-ds-${crypto.randomUUID()}` });
    repository = new MemoryRepository<TProductDocument>(dataSource, {
      entityClass: MemoryOperatorProductEntity,
    });

    await repository.createAll({
      data: [
        { title: 'Alpha Phone', price: 100, category: 'electronics', tags: ['sale', 'new'] },
        { title: 'Beta Phone', price: 200, category: 'electronics', tags: ['sale'] },
        { title: 'Gamma Charger', price: 50, category: 'accessories', tags: [] },
        {
          title: 'Delta C++ Cable',
          price: 30,
          category: 'accessories',
          tags: ['new'],
          secret: 'shh',
        },
      ] as TProductDocument[],
      options: { shouldSkipDefaultFilter: true },
    });
  });

  const titlesOf = (documents: Array<{ title: string }>): string[] =>
    documents.map(document => document.title).sort();

  describe('equality - eq (implicit) / neq', () => {
    test('implicit eq matches an exact scalar', async () => {
      const found = await repository.find({ filter: { where: { category: 'accessories' } } });
      expect(titlesOf(found)).toEqual(['Delta C++ Cable', 'Gamma Charger']);
    });

    test('neq excludes an exact match', async () => {
      const found = await repository.find({
        filter: { where: { category: { neq: 'accessories' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });

    test('ne is accepted as an alias of neq', async () => {
      const found = await repository.find({
        filter: { where: { category: { ne: 'accessories' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });
  });

  describe('comparison - gt/gte/lt/lte', () => {
    test('gt', async () => {
      const found = await repository.find({ filter: { where: { price: { gt: 100 } }, limit: 10 } });
      expect(titlesOf(found)).toEqual(['Beta Phone']);
    });

    test('gte', async () => {
      const found = await repository.find({
        filter: { where: { price: { gte: 100 } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });

    test('lt', async () => {
      const found = await repository.find({ filter: { where: { price: { lt: 50 } }, limit: 10 } });
      expect(titlesOf(found)).toEqual(['Delta C++ Cable']);
    });

    test('lte', async () => {
      const found = await repository.find({ filter: { where: { price: { lte: 50 } }, limit: 10 } });
      expect(titlesOf(found)).toEqual(['Delta C++ Cable', 'Gamma Charger']);
    });

    test('range operators never match a missing/optional field - they exclude, not throw', async () => {
      const filter: TFilter<TProductDocument> = {
        // @ts-expect-error missingField is outside TProductDocument's keys - probes off-schema property handling, not the type-restricted vocabulary
        where: { missingField: { gt: 10 } },
        limit: 10,
      };

      const found = await repository.find({ filter });
      expect(found).toEqual([]);
    });
  });

  describe('pattern - like / ilike', () => {
    test('like: % matches any run of characters', async () => {
      const found = await repository.find({
        filter: { where: { title: { like: '%Phone' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });

    test('like: _ matches exactly one character', async () => {
      const found = await repository.find({
        filter: { where: { title: { like: 'A_pha Phone' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone']);
    });

    test('like: regex metacharacters in the pattern are escaped, not interpreted', async () => {
      // Unescaped, 'C++' would compile as an invalid quantifier chain - this only passes if the
      // connector escapes '+' before building the RegExp.
      const found = await repository.find({
        filter: { where: { title: { like: 'Delta C++ Cable' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Delta C++ Cable']);
    });

    test('ilike: case-insensitive match', async () => {
      const found = await repository.find({
        filter: { where: { title: { ilike: '%PHONE' } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });

    test('like against a non-string field excludes rather than throws', async () => {
      const found = await repository.find({
        filter: { where: { price: { like: '1%' } }, limit: 10 },
      });
      expect(found).toEqual([]);
    });
  });

  describe('array - inq / nin', () => {
    test('inq', async () => {
      const found = await repository.find({
        filter: { where: { category: { inq: ['electronics'] } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });

    test('nin', async () => {
      const found = await repository.find({
        filter: { where: { category: { nin: ['accessories'] } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Beta Phone']);
    });
  });

  describe('range - between', () => {
    test('between is inclusive on both ends', async () => {
      const found = await repository.find({
        filter: { where: { price: { between: [40, 150] } }, limit: 10 },
      });
      expect(titlesOf(found)).toEqual(['Alpha Phone', 'Gamma Charger']);
    });
  });

  describe('logical - and / or', () => {
    test('and', async () => {
      const found = await repository.find({
        filter: {
          where: { and: [{ category: 'electronics' }, { price: { gt: 150 } }] },
          limit: 10,
        },
      });
      expect(titlesOf(found)).toEqual(['Beta Phone']);
    });

    test('or', async () => {
      const found = await repository.find({
        filter: {
          where: { or: [{ category: 'accessories' }, { price: { gt: 150 } }] },
          limit: 10,
        },
      });
      expect(titlesOf(found)).toEqual(['Beta Phone', 'Delta C++ Cable', 'Gamma Charger']);
    });
  });

  describe('unsupported operators throw instead of silently degrading', () => {
    test('an operator outside the supported vocabulary throws', async () => {
      let caught: unknown;
      try {
        await repository.find({ filter: { where: { title: { regexp: '^A' } }, limit: 10 } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).message).toContain("Unsupported operator 'regexp'");
    });
  });

  describe('order', () => {
    test('single field ascending (default direction)', async () => {
      const found = await repository.find({ filter: { order: ['price'], limit: 10 } });
      expect(found.map(document => document.price)).toEqual([30, 50, 100, 200]);
    });

    test('single field descending', async () => {
      const found = await repository.find({ filter: { order: ['price DESC'], limit: 10 } });
      expect(found.map(document => document.price)).toEqual([200, 100, 50, 30]);
    });

    test('multi-field order - first field wins, second breaks ties', async () => {
      const found = await repository.find({
        filter: { order: ['category ASC', 'price DESC'], limit: 10 },
      });
      expect(found.map(document => `${document.category}:${document.price}`)).toEqual([
        'accessories:50',
        'accessories:30',
        'electronics:200',
        'electronics:100',
      ]);
    });
  });

  describe('pagination - skip/limit + defaultLimit', () => {
    test('skip + limit page through order-sorted results', async () => {
      const found = await repository.find({ filter: { order: ['price'], skip: 1, limit: 2 } });
      expect(found.map(document => document.price)).toEqual([50, 100]);
    });

    test('offset is an alias for skip', async () => {
      const found = await repository.find({ filter: { order: ['price'], offset: 1, limit: 2 } });
      expect(found.map(document => document.price)).toEqual([50, 100]);
    });

    test('an omitted limit falls back to @model settings.defaultLimit (3)', async () => {
      const found = await repository.find({ filter: {} });
      expect(found.length).toBe(3);
    });

    test('an explicit limit overrides defaultLimit', async () => {
      const found = await repository.find({ filter: { limit: 10 } });
      expect(found.length).toBe(4);
    });
  });

  describe('fields projection', () => {
    test('array form whitelists exactly the listed fields', async () => {
      const [found] = await repository.find({
        filter: { where: { title: 'Alpha Phone' }, fields: ['title', 'price'] },
      });
      expect(Object.keys(found).sort()).toEqual(['price', 'title']);
    });

    test('object form with any `true` entry whitelists those fields', async () => {
      const [found] = await repository.find({
        filter: { where: { title: 'Alpha Phone' }, fields: { title: true, price: true } },
      });
      expect(Object.keys(found).sort()).toEqual(['price', 'title']);
    });

    test('object form with only `false` entries blacklists those fields', async () => {
      const [found] = await repository.find({
        filter: { where: { title: 'Alpha Phone' }, fields: { tags: false } },
      });
      expect(Object.keys(found).sort()).not.toContain('tags');
      expect(found.title).toBe('Alpha Phone');
    });

    test('hiddenProperties are stripped even when explicitly requested via fields', async () => {
      const [found] = await repository.find({
        filter: { where: { title: 'Delta C++ Cable' }, fields: ['title', 'secret'] },
      });
      expect((found as Record<string, unknown>).secret).toBeUndefined();
      expect(found.title).toBe('Delta C++ Cable');
    });
  });

  describe('include (relations) is not supported', () => {
    test('find() with filter.include throws', async () => {
      let caught: unknown;
      try {
        await repository.find({ filter: { include: [{ relation: 'anything' }], limit: 10 } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).message).toContain('does not support "include"');
    });
  });

  describe('envelopes', () => {
    test('create() returns { count, data } and shouldReturn:false suppresses data', async () => {
      const { count, data } = await repository.create({
        data: { title: 'Epsilon', price: 10, category: 'misc' } as TProductDocument,
      });
      expect(count).toBe(1);
      expect(data.title).toBe('Epsilon');

      const suppressed = await repository.create({
        data: { title: 'Zeta', price: 10, category: 'misc' } as TProductDocument,
        options: { shouldReturn: false },
      });
      expect(suppressed).toEqual({ count: 1, data: null });
    });

    test('updateById()/deleteById() return { count, data }', async () => {
      const [existing] = await repository.find({ filter: { where: { title: 'Alpha Phone' } } });
      const id = existing.id;

      const updated = await repository.updateById({ id, data: { price: 999 } });
      expect(updated).toEqual({ count: 1, data: { ...existing, price: 999 } });

      const deleted = await repository.deleteById({ id });
      expect(deleted).toEqual({ count: 1, data: { ...existing, price: 999 } });
    });

    test('updateAll()/deleteAll() return { count, data: Array }', async () => {
      const updated = await repository.updateAll({
        data: { isActive: false },
        where: { category: 'electronics' },
      });
      expect(updated.count).toBe(2);
      expect(updated.data.every(document => document.isActive === false)).toBe(true);

      const deleted = await repository.deleteAll({ where: { category: 'electronics' } });
      expect(deleted.count).toBe(2);
    });

    test('find() with shouldQueryRange returns { data, range: { start, end, total } }', async () => {
      const { data, range } = await repository.find({
        filter: { order: ['price'], skip: 1, limit: 2 },
        options: { shouldQueryRange: true },
      });
      expect(data.map(document => document.price)).toEqual([50, 100]);
      expect(range).toEqual({ start: 1, end: 2, total: 4 });
    });

    test('updateById()/deleteById() on a missing id throw a 404', async () => {
      let caught: unknown;
      try {
        await repository.updateById({ id: 'does-not-exist', data: { price: 1 } });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).statusCode).toBe(HTTP.ResultCodes.RS_4.NotFound);
      expect((caught as ApplicationError).messageCode).toBe('core.not_found');
    });
  });

  describe('NotSupported paths - options.transaction / options.lock', () => {
    const fakeTransaction = { isActive: true, commit: async () => {}, rollback: async () => {} };
    const fakeLock: TLockOptions = { strength: LockStrengths.UPDATE };

    const verbs: Array<{ name: string; invoke: (options: object) => Promise<unknown> }> = [
      { name: 'count', invoke: options => repository.count({ where: {}, options }) },
      { name: 'existsWith', invoke: options => repository.existsWith({ where: {}, options }) },
      { name: 'find', invoke: options => repository.find({ filter: {}, options }) },
      { name: 'findOne', invoke: options => repository.findOne({ filter: {}, options }) },
      { name: 'findById', invoke: options => repository.findById({ id: 'x', options }) },
      {
        name: 'create',
        invoke: options =>
          repository.create({
            data: { title: 'X', price: 1, category: 'x' } as TProductDocument,
            options,
          }),
      },
      {
        name: 'createAll',
        invoke: options =>
          repository.createAll({
            data: [{ title: 'X', price: 1, category: 'x' } as TProductDocument],
            options,
          }),
      },
      {
        name: 'updateById',
        invoke: options => repository.updateById({ id: 'x', data: { price: 1 }, options }),
      },
      {
        name: 'updateAll',
        invoke: options => repository.updateAll({ data: { price: 1 }, where: {}, options }),
      },
      { name: 'deleteById', invoke: options => repository.deleteById({ id: 'x', options }) },
      { name: 'deleteAll', invoke: options => repository.deleteAll({ where: {}, options }) },
    ];

    for (const verb of verbs) {
      test(`${verb.name} rejects options.transaction`, async () => {
        let caught: unknown;
        try {
          await verb.invoke({ transaction: fakeTransaction });
        } catch (error) {
          caught = error;
        }
        expectNotSupported(caught);
      });

      test(`${verb.name} rejects options.lock`, async () => {
        let caught: unknown;
        try {
          await verb.invoke({ lock: fakeLock });
        } catch (error) {
          caught = error;
        }
        expectNotSupported(caught);
      });
    }
  });
});

/**
 * EDGE-CASE HARDENING SUITE - pins the pre-release where-matcher/repository fixes: bare-array `inq`
 * shorthand, Date value-equality, explicit `null` field values, `neq`/`nin` missing-field semantics,
 * LIKE escape sequences, NULLS LAST/FIRST sort placement, id-key consistency across find/update/
 * delete, id immutability through update verbs, non-array `and`/`or`, and read/write deep-cloning.
 */
describe('MemoryRepository - edge case hardening', () => {
  const EdgeSelectSchema = z.object({
    id: z.string(),
    name: z.string(),
    score: z.number().nullable().optional(),
    startedAt: z.date().optional(),
    metadata: z.object({ tags: z.array(z.string()) }).optional(),
  });
  const EdgeCreateSchema = EdgeSelectSchema.partial({ id: true });
  type TEdgeDocument = z.infer<typeof EdgeSelectSchema>;

  @model({ type: 'entity' })
  class MemoryEdgeCaseEntity extends AbstractEntity {
    constructor() {
      super({ name: 'memory_edge_case_docs' });
    }

    getSchema(opts: { type: TSchemaType }): z.ZodTypeAny {
      switch (opts.type) {
        case SchemaTypes.SELECT: {
          return EdgeSelectSchema;
        }
        case SchemaTypes.CREATE: {
          return EdgeCreateSchema;
        }
        case SchemaTypes.UPDATE: {
          return EdgeCreateSchema.partial();
        }
        default: {
          throw getError({
            message: `[MemoryEdgeCaseEntity][getSchema] Unsupported schema type | type: ${opts.type}`,
          });
        }
      }
    }
  }

  let dataSource: MemoryDataSource;
  let repository: MemoryRepository<TEdgeDocument>;

  beforeEach(() => {
    dataSource = new MemoryDataSource({ name: `memory-edge-ds-${crypto.randomUUID()}` });
    repository = new MemoryRepository<TEdgeDocument>(dataSource, {
      entityClass: MemoryEdgeCaseEntity,
    });
  });

  const namesOf = (documents: Array<{ name: string }>): string[] =>
    documents.map(document => document.name).sort();

  describe('bare-array condition is inq shorthand (finding #1)', () => {
    test('matches any element instead of reference-equaling the array', async () => {
      await repository.createAll({
        data: [
          { name: 'a', score: 1 },
          { name: 'b', score: 2 },
          { name: 'c', score: 3 },
        ] as TEdgeDocument[],
      });

      const found = await repository.find({ filter: { where: { score: [1, 3] }, limit: 10 } });
      expect(namesOf(found)).toEqual(['a', 'c']);
    });

    test('an empty array matches nothing', async () => {
      await repository.create({ data: { name: 'a', score: 1 } as TEdgeDocument });

      const found = await repository.find({ filter: { where: { score: [] }, limit: 10 } });
      expect(found).toEqual([]);
    });
  });

  describe('Date equality compares by value, not reference (finding #4)', () => {
    test('bare Date condition matches an equal-valued but distinct Date instance', async () => {
      const timestamp = new Date('2026-01-01T00:00:00.000Z');
      await repository.create({ data: { name: 'dated', startedAt: timestamp } as TEdgeDocument });

      const found = await repository.find({
        filter: { where: { startedAt: new Date(timestamp.getTime()) }, limit: 10 },
      });
      expect(namesOf(found)).toEqual(['dated']);
    });

    test('the eq operator on a Date field also compares by value', async () => {
      const timestamp = new Date('2026-02-02T00:00:00.000Z');
      await repository.create({ data: { name: 'dated2', startedAt: timestamp } as TEdgeDocument });

      const found = await repository.find({
        filter: { where: { startedAt: { eq: new Date(timestamp.getTime()) } }, limit: 10 },
      });
      expect(namesOf(found)).toEqual(['dated2']);
    });
  });

  describe('explicit null field values never match a range operator (finding #5)', () => {
    test('a null-valued field excludes rather than throws', async () => {
      await repository.create({ data: { name: 'nullscore', score: null } as TEdgeDocument });

      let caught: unknown;
      let found: TEdgeDocument[] = [];
      try {
        found = await repository.find({ filter: { where: { score: { gt: 0 } }, limit: 10 } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeUndefined();
      expect(found).toEqual([]);
    });
  });

  describe('neq/nin never match a missing field (finding #7)', () => {
    test('neq excludes documents where the field is entirely absent', async () => {
      await repository.createAll({
        data: [{ name: 'has-score', score: 5 }, { name: 'no-score' }] as TEdgeDocument[],
      });

      const found = await repository.find({ filter: { where: { score: { neq: 5 } }, limit: 10 } });
      expect(namesOf(found)).toEqual([]);
    });

    test('nin excludes documents where the field is entirely absent', async () => {
      await repository.createAll({
        data: [{ name: 'has-score', score: 5 }, { name: 'no-score' }] as TEdgeDocument[],
      });

      const found = await repository.find({
        filter: { where: { score: { nin: [1, 2, 3] } }, limit: 10 },
      });
      // `has-score` (5) is genuinely not in [1, 2, 3] so it matches; `no-score` is missing the
      // field entirely and must never match `nin`, regardless of the list contents.
      expect(namesOf(found)).toEqual(['has-score']);
    });
  });

  describe('LIKE honors \\% and \\_ as literal characters (finding #8)', () => {
    test('an escaped percent is matched literally, not as a wildcard', async () => {
      await repository.createAll({
        data: [{ name: '50% off' }, { name: '50X off' }] as TEdgeDocument[],
      });

      const found = await repository.find({
        filter: { where: { name: { like: '50\\% off' } }, limit: 10 },
      });
      expect(namesOf(found)).toEqual(['50% off']);
    });

    test('an escaped underscore is matched literally, not as a single-char wildcard', async () => {
      await repository.createAll({
        data: [{ name: 'a_b' }, { name: 'aXb' }] as TEdgeDocument[],
      });

      const found = await repository.find({
        filter: { where: { name: { like: 'a\\_b' } }, limit: 10 },
      });
      expect(namesOf(found)).toEqual(['a_b']);
    });
  });

  describe('sort null/undefined placement matches Postgres defaults (finding #9)', () => {
    test('ascending sorts null/undefined last', async () => {
      await repository.createAll({
        data: [
          { name: 'has-2', score: 2 },
          { name: 'missing' },
          { name: 'has-1', score: 1 },
          { name: 'is-null', score: null },
        ] as TEdgeDocument[],
      });

      const found = await repository.find({ filter: { order: ['score ASC'], limit: 10 } });
      expect(found.map(document => document.name)).toEqual([
        'has-1',
        'has-2',
        'missing',
        'is-null',
      ]);
    });

    test('descending sorts null/undefined first', async () => {
      await repository.createAll({
        data: [
          { name: 'has-2', score: 2 },
          { name: 'missing' },
          { name: 'has-1', score: 1 },
          { name: 'is-null', score: null },
        ] as TEdgeDocument[],
      });

      const found = await repository.find({ filter: { order: ['score DESC'], limit: 10 } });
      expect(
        found
          .slice(0, 2)
          .map(document => document.name)
          .sort(),
      ).toEqual(['is-null', 'missing']);
      expect(found.slice(2).map(document => document.name)).toEqual(['has-2', 'has-1']);
    });
  });

  describe('findById/updateById/deleteById share one id key (finding #11)', () => {
    test('a numeric id and its string form resolve to the same document everywhere', async () => {
      await repository.create({
        // @ts-expect-error id is deliberately numeric to test numeric/string id equivalence across find/update/delete
        data: { id: 42, name: 'numeric-id', score: 1 },
        options: { shouldReturn: false },
      });

      const viaNumber = await repository.findById({ id: 42 });
      const viaString = await repository.findById({ id: '42' });
      expect(viaNumber).not.toBeNull();
      expect(viaNumber).toEqual(viaString);

      const updated = await repository.updateById({ id: 42, data: { score: 9 } });
      expect(updated.data.score).toBe(9);

      const deleted = await repository.deleteById({ id: '42' });
      expect(deleted.count).toBe(1);

      const afterDelete = await repository.findById({ id: 42 });
      expect(afterDelete).toBeNull();
    });
  });

  describe('id is immutable through update verbs (finding #12)', () => {
    test('updateById ignores an attempt to change the id', async () => {
      const { data: created } = await repository.create({
        data: { name: 'immutable', score: 1 } as TEdgeDocument,
      });
      const originalId = created.id;

      const updated = await repository.updateById({
        id: originalId,
        data: { id: 'hijacked', score: 2 },
      });

      expect(updated.data.id).toBe(originalId);
      expect(await repository.findById({ id: originalId })).not.toBeNull();
      expect(await repository.findById({ id: 'hijacked' })).toBeNull();
    });

    test('updateAll ignores an attempt to change the id', async () => {
      const { data: created } = await repository.create({
        data: { name: 'immutable-all', score: 3 } as TEdgeDocument,
      });
      const originalId = created.id;

      await repository.updateAll({
        data: { id: 'hijacked-all', score: 4 },
        where: { name: 'immutable-all' },
      });

      const stillFound = await repository.findById({ id: originalId });
      expect(stillFound?.score).toBe(4);
      expect(await repository.findById({ id: 'hijacked-all' })).toBeNull();
    });
  });

  describe('and/or accept a non-array value (finding #13)', () => {
    test('and with a single clause object (not wrapped in an array) still applies', async () => {
      await repository.createAll({
        data: [
          { name: 'match', score: 5 },
          { name: 'no-match', score: 1 },
        ] as TEdgeDocument[],
      });

      const filter: TFilter<TEdgeDocument> = {
        // @ts-expect-error and is deliberately a bare clause object (not wrapped in an array) to test non-array leniency
        where: { and: { score: 5 } },
        limit: 10,
      };
      const found = await repository.find({ filter });
      expect(namesOf(found)).toEqual(['match']);
    });

    test('or with a single clause object (not wrapped in an array) still applies', async () => {
      await repository.createAll({
        data: [
          { name: 'match', score: 5 },
          { name: 'no-match', score: 1 },
        ] as TEdgeDocument[],
      });

      const filter: TFilter<TEdgeDocument> = {
        // @ts-expect-error or is deliberately a bare clause object (not wrapped in an array) to test non-array leniency
        where: { or: { score: 5 } },
        limit: 10,
      };
      const found = await repository.find({ filter });
      expect(namesOf(found)).toEqual(['match']);
    });
  });

  describe('read/write boundaries deep-clone nested values (finding #6)', () => {
    test('mutating a returned document leaves the stored document untouched', async () => {
      const { data: created } = await repository.create({
        data: { name: 'cloned', metadata: { tags: ['a', 'b'] } } as TEdgeDocument,
      });

      created.metadata!.tags.push('mutated');

      const id = created.id;
      const refetched = await repository.findById({ id });
      expect(refetched!.metadata!.tags).toEqual(['a', 'b']);
    });

    test('mutating the input passed to create() does not affect what is stored', async () => {
      const input = { name: 'input-clone', metadata: { tags: ['x'] } } as TEdgeDocument;
      const { data: created } = await repository.create({ data: input });
      input.metadata!.tags.push('after-create');

      const id = created.id;
      const refetched = await repository.findById({ id });
      expect(refetched!.metadata!.tags).toEqual(['x']);
    });
  });
});
