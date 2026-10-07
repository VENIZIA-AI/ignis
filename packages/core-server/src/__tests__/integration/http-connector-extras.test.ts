// Import order guard: see controllers/route-registration.test.ts.
import '@/base/applications';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { Logger } from '@venizia/ignis-helpers/winston';
import { buildDataRange } from '@venizia/ignis-kernel/repository';
import { HttpDataSource, HttpRepository } from '@venizia/ignis-connectors/http';
import type { TRouteContext } from '@/base/controllers';
import { BaseRestController } from '@/base/controllers';
import { AppErrorMiddleware } from '@/base/middlewares';

/**
 * List extras against a real server, read through the http connector: the client names what it
 * wants - a plain extra, a group with its keys, a default switched off - and the server computes
 * exactly that.
 */

type TItem = { id: number };

const ROWS: Array<TItem> = [{ id: 1 }, { id: 2 }];
const facetCalls: Array<Array<string>> = [];
const calls = { counts: 0, summary: 0 };

const readLimit = (context: TRouteContext): number => {
  const filter: { limit?: number } = JSON.parse(context.req.query('filter') ?? '{}');
  return filter.limit ?? ROWS.length;
};

class ExtrasController extends BaseRestController {
  constructor() {
    super({ scope: ExtrasController.name, path: '/', isStrict: false });
  }

  override binding(): ValueOrPromise<void> {
    this.bindRoute({ configs: { method: HTTP.Methods.GET, path: '/products', responses: {} } }).to({
      handler: async (context: TRouteContext) => {
        const data = ROWS.slice(0, readLimit(context));
        const body = await this.respond({
          context,
          format: 'array',
          payload: { count: data.length, data },
          range: buildDataRange({ skip: 0, dataLength: data.length, total: ROWS.length }),
          extra: {
            counts: {
              isDefault: true,
              compute: () => {
                calls.counts += 1;
                return { total: ROWS.length };
              },
            },
            summary: () => {
              calls.summary += 1;
              return 'summary';
            },
            facets: {
              keys: ['status', 'category', 'tag'],
              compute: ({ keys }) => {
                facetCalls.push(keys);
                return Object.fromEntries(keys.map(key => [key, { [key]: 1 }]));
              },
            },
          },
        });
        return context.json(body, 200);
      },
    });

    this.bindRoute({ configs: { method: HTTP.Methods.GET, path: '/failing', responses: {} } }).to({
      handler: async (context: TRouteContext) => {
        const body = await this.respond({
          context,
          format: 'array',
          payload: { count: ROWS.length, data: ROWS },
          extra: {
            slow: async () => {
              await Bun.sleep(5);
              throw new Error('slow failed');
            },
            conflict: () => {
              throw getError({ statusCode: 409, message: 'The figures are being rebuilt' });
            },
          },
        });
        return context.json(body, 200);
      },
    });

    this.bindRoute({ configs: { method: HTTP.Methods.POST, path: '/bulk', responses: {} } }).to({
      handler: async (context: TRouteContext) => {
        const body = await this.respond({
          context,
          format: 'array',
          payload: { count: ROWS.length, data: ROWS },
          extra: { counts: { isDefault: true, compute: () => ({ declared: ROWS.length }) } },
        });
        return context.json(body, 200);
      },
    });
  }
}

const logger = Logger.get('http-extras-test');
logger.error = () => undefined;
logger.log = () => undefined;

let server: Bun.Server<undefined>;
let baseUrl: string;
let dataSource: HttpDataSource;
let products: HttpRepository<TItem>;

beforeAll(async () => {
  const controller = new ExtrasController();
  await controller.configure();

  const app = new Hono();
  app.route('/', controller.getRouter());
  app.onError(new AppErrorMiddleware({ logger }).value());
  server = Bun.serve({ port: 0, fetch: app.fetch });

  baseUrl = `http://127.0.0.1:${server.port}`;
  dataSource = new HttpDataSource({ baseUrl });
  products = new HttpRepository<TItem>({ dataSource, resource: 'products' });
});

afterAll(async () => {
  await server.stop(true);
});

const failureOf = async (task: Promise<unknown>) => {
  const caught = await task.catch((error: unknown) => error);
  if (!isApplicationError(caught)) {
    throw new Error(`expected an ApplicationError, got: ${String(caught)}`);
  }
  return caught;
};

describe('what is computed is what was asked for, plus the defaults', () => {
  test('a group computes the keys asked for, in one call, typed on the client', async () => {
    const page = await products.find({
      filter: {},
      options: { shouldQueryRange: true, extra: { facets: ['status', 'tag'] } },
    });

    expect(page.data).toEqual(ROWS);
    expect(page.range.total).toBe(2);
    expect(page.extra.facets?.status).toEqual({ status: 1 });
    expect(page.extra.facets?.tag).toEqual({ tag: 1 });
    expect(page.extra.counts).toEqual({ total: 2 });
    expect(facetCalls.at(-1)).toEqual(['status', 'tag']);
  });

  test('a plain lazy extra runs only when named', async () => {
    const before = calls.summary;

    await products.find({ filter: {}, options: { shouldQueryRange: true } });
    expect(calls.summary).toBe(before);

    const page = await products.find({ filter: {}, options: { extra: { summary: true } } });
    expect(page.extra.summary).toBe('summary');
    expect(calls.summary).toBe(before + 1);
  });

  test('a default switched off is not computed', async () => {
    const before = calls.counts;

    const page = await products.find({ filter: {}, options: { extra: { counts: false } } });

    expect(page.data).toEqual(ROWS);
    expect(calls.counts).toBe(before);
  });

  test('count, existsWith and findOne compute no default', async () => {
    const before = calls.counts;

    expect(await products.count({ where: {} })).toEqual({ count: 2 });
    expect(await products.existsWith({ where: {} })).toBe(true);
    expect((await products.findOne({ filter: {} }))?.id).toBe(1);
    expect(calls.counts).toBe(before);
  });

  test('limit 0 reads the extras without rows', async () => {
    const page = await products.find({
      filter: { limit: 0 },
      options: { shouldQueryRange: true, extra: { facets: ['category'] } },
    });

    expect(page.data).toEqual([]);
    expect(page.extra.facets?.category).toEqual({ category: 1 });
  });

  test('with x-request-count: true the body is { count, data, extra }, marked', async () => {
    const response = await fetch(`${baseUrl}/products`, {
      headers: { 'x-request-count': 'true', 'x-request-extra': '-counts,summary' },
    });

    expect(response.headers.get('x-response-extra')).toBe('summary');
    expect(await response.json()).toEqual({ count: 2, data: ROWS, extra: { summary: 'summary' } });
  });
});

describe('a request that names what the route does not offer is a 400', () => {
  const cases: Array<[Record<string, boolean | Array<string>>, RegExp]> = [
    [{ nope: true }, /This route offers: counts, summary, facets/],
    [{ facets: [] }, /Extra 'facets' needs keys: status, category, tag/],
    [{ facets: ['price'] }, /Unknown key for extra 'facets': price/],
  ];

  for (const [extra, message] of cases) {
    test(JSON.stringify(extra), async () => {
      const caught = await failureOf(products.find({ filter: {}, options: { extra } }));

      expect(caught.statusCode).toBe(400);
      expect(caught.normalized.text).toMatch(message);
    });
  }
});

describe('an extra that fails', () => {
  test("fails the response with the extra's own status, and leaves nothing unhandled", async () => {
    const failing = new HttpRepository<TItem>({ dataSource, resource: 'failing' });

    const caught = await failureOf(
      failing.find({ filter: {}, options: { extra: { slow: true, conflict: true } } }),
    );
    await Bun.sleep(20);

    expect(caught.statusCode).toBe(409);
    expect(caught.normalized.text).toBe('The figures are being rebuilt');
  });
});

describe('a write answers extras the same way', () => {
  test('the default rides on the write, read through write()', async () => {
    const result = await dataSource.write({
      paths: ['bulk'],
      method: 'POST',
      body: {},
      extra: { counts: true },
    });

    expect(result).toMatchObject({ data: ROWS, count: 2, extra: { counts: { declared: 2 } } });
  });
});
