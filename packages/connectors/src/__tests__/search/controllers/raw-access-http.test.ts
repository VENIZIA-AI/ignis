// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';
import type { OpenAPIHono } from '@hono/zod-openapi';

import { repository } from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

/**
 * Raw mode and multi-search are closed by default, and they stay closed through the real router: the JSON validator, route
 * matching, content types and path spellings all run here. The cases come from the attack review of #1028; the unit tests in
 * `raw-access.test.ts` call the handlers with a fake context, so they never reach the validator or the route table.
 */

class HttpRawAccessDataSource extends FakeSearchDataSource {
  multiSearchCalls: Array<unknown> = [];

  constructor(opts: { name: string; config?: {} }) {
    super(opts);

    // `FakeSearchEngineHelper.multiSearch()` returns `Promise<never>`, so a recorder is patched onto the fake instance.
    (this.fakeConnector as any).multiSearch = async (searchOpts: unknown) => {
      this.multiSearchCalls.push(searchOpts);

      return { results: [] };
    };
  }
}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: HttpRawAccessDataSource })
class HttpRawAccessProductRepository extends DefaultSearchRepository {}

/** What a raw or multi-search request would ask the engine for: a filter the default filter and the model's visibility rules would never allow. */
const FORBIDDEN_FILTER = 'isActive:false';
const RAW_PARAMS = `{"q":"*","filter_by":"${FORBIDDEN_FILTER}"}`;

let sequence = 0;

/** The app's error middleware is not mounted here: a request the validator refuses (a ZodError) is a 400 there, and a refusal that carries a status keeps it. */
const answerErrors = (router: Pick<OpenAPIHono, 'onError'>) =>
  router.onError((error, context) => {
    const { statusCode, status, name } = error as {
      statusCode?: number;
      status?: number;
      name?: string;
    };
    const answered = statusCode ?? status ?? (name === 'ZodError' ? 400 : 500);

    return context.json({ error: String(error.message) }, answered as never);
  });

const mount = async (opts: { modes?: unknown } = {}) => {
  sequence += 1;

  const dataSource = new HttpRawAccessDataSource({
    name: `http-raw-access-ds-${sequence}`,
    config: {},
  });
  dataSource.fakeConnector.searchResponse = {
    found: 1,
    isFoundExact: true,
    hits: [{ document: { id: '1', title: 'foo', secret: 'S3CRET', isActive: true } }],
  } as never;

  const Controller = SearchControllerFactory.defineSearchController({
    entity: ProductDocument,
    repository: { name: HttpRawAccessProductRepository.name },
    controller: { name: `HttpRawAccessController${sequence}`, basePath: '/products' },
    modes: opts.modes as never,
  });

  const controller = new Controller(new HttpRawAccessProductRepository(dataSource));
  await controller.configure();

  const router = controller.getRouter();
  answerErrors(router);

  return { router, dataSource };
};

type TRequestOptions = {
  path?: string;
  method?: string;
  body?: string;
  /** `undefined` sends `application/json`; an empty string sends no content type. */
  contentType?: string;
  query?: string;
};

const send = async (
  opts: { router: Awaited<ReturnType<typeof mount>>['router'] } & TRequestOptions,
) => {
  const { router, path = '/search', method = 'POST', body, contentType, query = '' } = opts;
  const headers: Record<string, string> =
    contentType === undefined
      ? { 'content-type': 'application/json' }
      : contentType === ''
        ? {}
        : { 'content-type': contentType };

  const response = await router.request(`${path}${query}`, { method, headers, body });

  const text = await response.text();

  return { status: response.status, text };
};

const searchParamsSeen = (dataSource: HttpRawAccessDataSource) =>
  dataSource.fakeConnector.searchCalls.map((call) => JSON.stringify(call.params));

describe('a search controller that did not opt in', () => {
  /** [name, request, the status the router answers]. Every one of them must leave the engine untouched. */
  const refused: Array<[string, TRequestOptions, number]> = [
    ['mode raw', { body: `{"mode":"raw","params":${RAW_PARAMS}}` }, 400],
    ['mode RAW', { body: `{"mode":"RAW","params":${RAW_PARAMS}}` }, 400],
    ['mode " raw"', { body: `{"mode":" raw","params":${RAW_PARAMS}}` }, 400],
    ['mode ["raw"]', { body: `{"mode":["raw"],"params":${RAW_PARAMS}}` }, 400],
    [
      'a duplicate key where the last mode is raw',
      { body: `{"mode":"keyword","mode":"raw","params":${RAW_PARAMS}}` },
      400,
    ],
    [
      'a __proto__ that carries mode raw',
      { body: `{"__proto__":{"mode":"raw"},"params":${RAW_PARAMS}}` },
      400,
    ],
    [
      'mode in the query string only',
      { query: '?mode=raw', body: `{"params":${RAW_PARAMS}}` },
      400,
    ],
    [
      'mode raw as text/plain',
      { contentType: 'text/plain', body: `{"mode":"raw","params":${RAW_PARAMS}}` },
      415,
    ],
    [
      'mode raw with no content type',
      { contentType: '', body: `{"mode":"raw","params":${RAW_PARAMS}}` },
      415,
    ],
    [
      'a form body',
      { contentType: 'application/x-www-form-urlencoded', body: 'mode=raw&params=x' },
      415,
    ],
    [
      'mode raw as application/json with a charset',
      {
        contentType: 'application/json; charset=utf-8',
        body: `{"mode":"raw","params":${RAW_PARAMS}}`,
      },
      400,
    ],
    [
      'mode raw as application/vnd.api+json',
      { contentType: 'application/vnd.api+json', body: `{"mode":"raw","params":${RAW_PARAMS}}` },
      400,
    ],
    [
      'a percent-encoded /search',
      { path: '/%73earch', body: `{"mode":"raw","params":${RAW_PARAMS}}` },
      400,
    ],
    [
      '/search/ with a trailing slash',
      { path: '/search/', body: `{"mode":"raw","params":${RAW_PARAMS}}` },
      404,
    ],
    ['//search', { path: '//search', body: `{"mode":"raw","params":${RAW_PARAMS}}` }, 404],
    ['PUT /search', { method: 'PUT', body: `{"mode":"raw","params":${RAW_PARAMS}}` }, 404],
    ['GET /search', { method: 'GET', query: '?mode=raw' }, 404],
    [
      'POST /multi-search',
      {
        path: '/multi-search',
        body: `{"searches":[{"collection":"products","filterBy":"${FORBIDDEN_FILTER}"}]}`,
      },
      400,
    ],
    ['GET /multi-search', { path: '/multi-search', method: 'GET' }, 404],
    ['HEAD /multi-search', { path: '/multi-search', method: 'HEAD' }, 404],
    [
      '/multi-search/ with a trailing slash',
      { path: '/multi-search/', body: '{"searches":[{"collection":"products"}]}' },
      404,
    ],
    [
      '/MULTI-SEARCH in capitals',
      { path: '/MULTI-SEARCH', body: '{"searches":[{"collection":"products"}]}' },
      404,
    ],
    [
      '/multiSearch in camel case',
      { path: '/multiSearch', body: '{"searches":[{"collection":"products"}]}' },
      404,
    ],
    ['/count', { path: '/count', body: '{}' }, 404],
    ['/facets', { path: '/facets', body: '{}' }, 404],
    ['/suggest', { path: '/suggest', body: '{}' }, 404],
  ];

  test.each(refused)('refuses %s and never reaches the engine', async (_name, request, status) => {
    const { router, dataSource } = await mount();

    const result = await send({ router, ...request });

    expect(result.status).toBe(status);
    expect(searchParamsSeen(dataSource)).toEqual([]);
    expect(dataSource.multiSearchCalls).toHaveLength(0);
  });

  test('a duplicate key where the last mode is keyword runs as a keyword search, with the default filter and no smuggled params', async () => {
    const { router, dataSource } = await mount();

    const result = await send({
      router,
      body: `{"mode":"raw","mode":"keyword","query":"foo","queryBy":["title"],"params":${RAW_PARAMS}}`,
    });

    expect(result.status).toBe(200);

    const seen = searchParamsSeen(dataSource);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('isActive:=true');
    expect(seen[0]).not.toContain(FORBIDDEN_FILTER);
    expect(result.text).not.toContain('S3CRET');
  });

  test.each([
    ['params', `"params":${RAW_PARAMS}`],
    ['options.shouldSkipDefaultFilter', '"options":{"shouldSkipDefaultFilter":true}'],
    ['a __proto__', `"__proto__":{"mode":"raw","params":${RAW_PARAMS}}`],
    ['a constructor', '"constructor":{"prototype":{"mode":"raw"}}'],
  ])(
    'a keyword search that carries %s is stripped to a plain keyword search',
    async (_name, extra) => {
      const { router, dataSource } = await mount();

      const result = await send({
        router,
        body: `{"mode":"keyword","query":"foo","queryBy":["title"],${extra}}`,
      });

      expect(result.status).toBe(200);

      const seen = searchParamsSeen(dataSource);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain('isActive:=true');
      expect(seen[0]).not.toContain(FORBIDDEN_FILTER);
      expect(result.text).not.toContain('S3CRET');
    },
  );

  test.each([
    ['filter_by', `{"filter_by":"${FORBIDDEN_FILTER}"}`],
    ['a __proto__ that carries filter_by', `{"__proto__":{"filter_by":"${FORBIDDEN_FILTER}"}}`],
  ])('a keyword search with engineParams %s is refused with a 400', async (_name, engineParams) => {
    const { router, dataSource } = await mount();

    const result = await send({
      router,
      body: `{"mode":"keyword","query":"foo","queryBy":["title"],"engineParams":${engineParams}}`,
    });

    expect(result.status).toBe(400);
    expect(searchParamsSeen(dataSource)).toEqual([]);
  });
});

describe('opting in', () => {
  test('only a literal true opens raw mode, and the engine then gets the params as sent', async () => {
    const { router, dataSource } = await mount({ modes: { raw: { allow: true } } });

    const result = await send({ router, body: `{"mode":"raw","params":${RAW_PARAMS}}` });

    expect(result.status).toBe(200);
    expect(searchParamsSeen(dataSource)).toHaveLength(1);
    expect(searchParamsSeen(dataSource)[0]).toContain(FORBIDDEN_FILTER);
  });

  test.each([
    ['the string "true"', { raw: { allow: 'true' } }],
    ['the number 1', { raw: { allow: 1 } }],
    // A wrapper object is truthy but is not the literal `true`: the definition refuses it.
    // oxlint-disable-next-line no-new-wrappers
    ['a Boolean object', { raw: { allow: new Boolean(true) } }],
  ])('%s is refused when the controller is defined', (_name, modes) => {
    expect(() =>
      SearchControllerFactory.defineSearchController({
        entity: ProductDocument,
        repository: { name: HttpRawAccessProductRepository.name },
        controller: { name: `HttpRawAccessRejected${(sequence += 1)}`, basePath: '/products' },
        modes: modes as never,
      }),
    ).toThrow();
  });

  test('changing the definition options after the controller is defined does not open raw mode', async () => {
    sequence += 1;

    const definition = {
      entity: ProductDocument,
      repository: { name: HttpRawAccessProductRepository.name },
      controller: { name: `HttpRawAccessLate${sequence}`, basePath: '/products' },
    } as Parameters<typeof SearchControllerFactory.defineSearchController>[0];
    const Controller = SearchControllerFactory.defineSearchController(definition);
    (definition as { modes?: unknown }).modes = { raw: { allow: true } };

    const dataSource = new HttpRawAccessDataSource({
      name: `http-raw-access-late-${sequence}`,
      config: {},
    });
    const controller = new Controller(new HttpRawAccessProductRepository(dataSource));
    await controller.configure();

    const router = controller.getRouter();
    answerErrors(router);

    const response = await router.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"mode":"raw","params":${RAW_PARAMS}}`,
    });

    expect(response.status).toBe(400);
    expect(searchParamsSeen(dataSource)).toEqual([]);
  });
});
