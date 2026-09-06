import { describe, expect, test } from 'bun:test';
import type { Env } from 'hono';
import type { TFilter, TWhere } from '@venizia/ignis-filter';
import type { AbstractEntity } from '@/base/models';
import type { AbstractRepository } from '@/base/repositories';
import type { TRouteContext } from '@/base/controllers/common';
import { ReadableCrudController } from '@/base/controllers/factory/crud';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';

type TRow = { id: string; tenantId: string; status?: string };

/** Evaluates the two field conditions and the `and` nesting the base-where seam produces - enough to prove a row is in or out of scope. */
const matches = (opts: { row: TRow; where?: TWhere<TRow> }): boolean => {
  const { row, where } = opts;

  if (!where) {
    return true;
  }

  const clauses = where.and ?? [];
  const isNestedMatched = clauses.every(clause => matches({ row, where: clause }));
  const isIdMatched = where.id === undefined || where.id === row.id;
  const isTenantMatched = where.tenantId === undefined || where.tenantId === row.tenantId;
  const isStatusMatched = where.status === undefined || where.status === row.status;

  return isNestedMatched && isIdMatched && isTenantMatched && isStatusMatched;
};

/** Records every read the controller performs and answers from `rows`; the read verbs are the only members under test. */
class RecordingRepository {
  readonly calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  rows: Array<TRow> = [];

  async count(opts: { where?: TWhere<TRow> }) {
    this.calls.push({ method: 'count', args: { ...opts } });
    return { count: this.rows.filter(row => matches({ row, where: opts.where })).length };
  }

  async find(opts: { filter?: TFilter<TRow> }) {
    this.calls.push({ method: 'find', args: { ...opts } });
    const data = this.rows.filter(row => matches({ row, where: opts.filter?.where }));
    return { data, range: { start: 0, end: Math.max(data.length - 1, 0), total: data.length } };
  }

  async findOne(opts: { filter?: TFilter<TRow> }) {
    this.calls.push({ method: 'findOne', args: { ...opts } });
    return this.rows.find(row => matches({ row, where: opts.filter?.where })) ?? null;
  }

  async findById(opts: { id: string }) {
    this.calls.push({ method: 'findById', args: { ...opts } });
    return this.rows.find(row => row.id === opts.id) ?? null;
  }
}

class ItemsController extends ReadableCrudController<
  AbstractEntity<TAnyObjectSchema>,
  Env,
  {},
  '/',
  {},
  TRow,
  TRow
> {
  constructor(repository: RecordingRepository) {
    super({
      scope: 'ItemsController',
      path: '/items',
      // The recorder implements the four read verbs under test, not the whole persistable contract.
      repository: repository as unknown as AbstractRepository<TRow, TRow>,
      definitions: {},
    });
  }

  binding() {
    // No routes: the verbs are called directly.
  }
}

/** Narrows every read to one tenant - the override a consumer wrote by copying `find` instead. */
class TenantItemsController extends ItemsController {
  override async getBaseWhere(): Promise<TWhere<TRow> | undefined> {
    return { tenantId: 'acme' };
  }
}

/** Minimal `TRouteContext` fake: serves the validated query/param and records the response body - the only members the read verbs touch. */
const fakeContext = (opts: { query?: unknown; param?: unknown } = {}) => {
  const bodies: Array<unknown> = [];
  const fake = {
    req: {
      header: () => undefined,
      valid: (target: string) => (target === 'param' ? (opts.param ?? {}) : (opts.query ?? {})),
    },
    header: () => undefined,
    json: (body: unknown) => {
      bodies.push(body);
      return body;
    },
  };

  // The read verbs touch four members of Hono's context; the rest of it is irrelevant here.
  return { context: fake as unknown as TRouteContext, bodies };
};

const callOf = (opts: { repository: RecordingRepository; method: string }) => {
  return opts.repository.calls.find(call => call.method === opts.method);
};

describe('ReadableCrudController base where - default', () => {
  test('find passes the request filter through untouched', async () => {
    const repository = new RecordingRepository();
    const controller = new ItemsController(repository);
    const filter: TFilter<TRow> = { where: { status: 'active' }, limit: 5 };
    const { context } = fakeContext({ query: { filter } });

    await controller.find({ context });

    // Same object, not an equal copy: nothing was rebuilt around it.
    expect(callOf({ repository, method: 'find' })?.args['filter']).toBe(filter);
  });

  test('count passes the request where through untouched', async () => {
    const repository = new RecordingRepository();
    const controller = new ItemsController(repository);
    const where: TWhere<TRow> = { status: 'active' };
    const { context } = fakeContext({ query: { where } });

    await controller.count({ context });

    expect(callOf({ repository, method: 'count' })?.args['where']).toBe(where);
  });

  test('findOne passes the request filter through untouched', async () => {
    const repository = new RecordingRepository();
    const controller = new ItemsController(repository);
    const filter: TFilter<TRow> = { where: { status: 'active' } };
    const { context } = fakeContext({ query: { filter } });

    await controller.findOne({ context });

    expect(callOf({ repository, method: 'findOne' })?.args['filter']).toBe(filter);
  });

  test('findById still reads through repository.findById', async () => {
    const repository = new RecordingRepository();
    repository.rows = [{ id: 'r1', tenantId: 'acme' }];
    const controller = new ItemsController(repository);
    const { context, bodies } = fakeContext({ param: { id: 'r1' } });

    await controller.findById({ context });

    expect(repository.calls.map(call => call.method)).toEqual(['findById']);
    expect(bodies[0]).toEqual({ count: 1, data: { id: 'r1', tenantId: 'acme' } });
  });
});

describe('ReadableCrudController base where - overridden', () => {
  test('find ANDs the base where with the request where', async () => {
    const repository = new RecordingRepository();
    repository.rows = [
      { id: 'r1', tenantId: 'acme', status: 'active' },
      { id: 'r2', tenantId: 'other', status: 'active' },
    ];
    const controller = new TenantItemsController(repository);
    const filter: TFilter<TRow> = { where: { status: 'active' }, limit: 5 };
    const { context, bodies } = fakeContext({ query: { filter } });

    await controller.find({ context });

    expect(callOf({ repository, method: 'find' })?.args['filter']).toEqual({
      where: { and: [{ tenantId: 'acme' }, { status: 'active' }] },
      limit: 5,
    });
    expect(bodies[0]).toEqual({ count: 1, data: [repository.rows[0]] });
  });

  test('find with no request where sends the base where alone', async () => {
    const repository = new RecordingRepository();
    const controller = new TenantItemsController(repository);
    const { context } = fakeContext({ query: {} });

    await controller.find({ context });

    expect(callOf({ repository, method: 'find' })?.args['filter']).toEqual({
      where: { tenantId: 'acme' },
    });
  });

  test('count ANDs the base where with the request where', async () => {
    const repository = new RecordingRepository();
    repository.rows = [
      { id: 'r1', tenantId: 'acme', status: 'active' },
      { id: 'r2', tenantId: 'other', status: 'active' },
    ];
    const controller = new TenantItemsController(repository);
    const { context, bodies } = fakeContext({ query: { where: { status: 'active' } } });

    await controller.count({ context });

    expect(callOf({ repository, method: 'count' })?.args['where']).toEqual({
      and: [{ tenantId: 'acme' }, { status: 'active' }],
    });
    expect(bodies[0]).toEqual({ count: 1 });
  });

  test('findOne ANDs the base where with the request where', async () => {
    const repository = new RecordingRepository();
    repository.rows = [
      { id: 'r1', tenantId: 'other', status: 'active' },
      { id: 'r2', tenantId: 'acme', status: 'active' },
    ];
    const controller = new TenantItemsController(repository);
    const { context, bodies } = fakeContext({ query: { filter: { where: { status: 'active' } } } });

    await controller.findOne({ context });

    expect(callOf({ repository, method: 'findOne' })?.args['filter']).toEqual({
      where: { and: [{ tenantId: 'acme' }, { status: 'active' }] },
    });
    expect(bodies[0]).toEqual({ count: 1, data: repository.rows[1] });
  });

  test('findById inside the scope answers the row', async () => {
    const repository = new RecordingRepository();
    repository.rows = [{ id: 'r1', tenantId: 'acme' }];
    const controller = new TenantItemsController(repository);
    const { context, bodies } = fakeContext({ param: { id: 'r1' } });

    await controller.findById({ context });

    expect(callOf({ repository, method: 'findOne' })?.args['filter']).toEqual({
      where: { and: [{ tenantId: 'acme' }, { id: 'r1' }] },
    });
    expect(bodies[0]).toEqual({ count: 1, data: repository.rows[0] });
  });

  test('findById outside the scope answers the not-found body of a missing id', async () => {
    const repository = new RecordingRepository();
    repository.rows = [{ id: 'r1', tenantId: 'other' }];
    const missing = fakeContext({ param: { id: 'missing' } });
    const outOfScope = fakeContext({ param: { id: 'r1' } });

    await new ItemsController(repository).findById({ context: missing.context });
    await new TenantItemsController(repository).findById({ context: outOfScope.context });

    expect(outOfScope.bodies[0]).toEqual(missing.bodies[0]);
    expect(outOfScope.bodies[0]).toEqual({ count: 0, data: null });
  });
});
