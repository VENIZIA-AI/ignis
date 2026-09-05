// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import { repository } from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/typesense/repositories';
import { SearchModes } from '@/search/core/repositories/common';
import { HTTP } from '@venizia/ignis-helpers/common';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

// Own datasource class: the model registry is a process-wide singleton keyed by class name.
// `FakeSearchEngineHelper.multiSearch()` returns `Promise<never>`, which no subclass override can widen, so it is patched onto the fake instance directly.
class SearchFactoryDataSource extends FakeSearchDataSource {
  multiSearchCalls: Array<{ searches: unknown[]; union?: boolean; commonParams?: unknown }> = [];
  multiSearchResponse: unknown = { results: [{ found: 2, isFoundExact: true, hits: [] }] };

  constructor(opts: { name: string; config?: {}; autoProvision?: boolean }) {
    super(opts);

    (this.fakeConnector as any).multiSearch = async (searchOpts: {
      searches: unknown[];
      union?: boolean;
      commonParams?: unknown;
    }) => {
      this.multiSearchCalls.push(searchOpts);
      return this.multiSearchResponse;
    };
  }
}

// Distinctly named because MetadataRegistry keys repository bindings by class name and the CRUD-factory wiring test loaded in the same process already uses `ProductSearchRepository`.
@repository({ model: ProductDocument, dataSource: SearchFactoryDataSource })
class SearchFactoryProductRepository extends DefaultSearchRepository {}

/** Minimal `TRouteContext`-shaped fake: records the JSON body/status the handler responds with. */
const fakeContext = <TInput>(input: TInput, requestHeaders: Record<string, string> = {}) => {
  let jsonBody: unknown;
  let jsonStatus: number | undefined;
  const responseHeaders: Record<string, string> = {};

  const context = {
    req: {
      valid: () => input,
      header: (name: string) => requestHeaders[name.toLowerCase()],
    },
    header: (name: string, value: string) => {
      responseHeaders[name.toLowerCase()] = value;
    },
    json: (body: unknown, status?: number) => {
      jsonBody = body;
      jsonStatus = status;
      return body;
    },
  };

  return {
    context: context as any,
    responseHeaders,
    getJsonBody: () => jsonBody,
    getJsonStatus: () => jsonStatus,
  };
};

describe('SearchControllerFactory.defineSearchController', () => {
  test('registers exactly the search + multiSearch POST routes', async () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-1', config: {} });
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const ProductSearchController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'ProductSearchController', basePath: '/products' },
    });

    const controller = new ProductSearchController(repositoryInstance);
    await controller['binding']();

    // OpenAPIHono.openapi() registers more than one internal `.routes` entry per call (pre-existing Hono behavior), so route counts dedupe via Set.
    const distinctRoutes = new Set(
      controller.router.routes.map(route => `${route.method} ${route.path}`),
    );
    expect(distinctRoutes.size).toBe(2);
    expect(distinctRoutes).toContain('POST /search');
    expect(distinctRoutes).toContain('POST /multi-search');
  });

  test('routes.multiSearch.enabled: false disables only the multi-search route', async () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-2', config: {} });
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const SearchOnlyController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'SearchOnlyController', basePath: '/products' },
      routes: { multiSearch: { enabled: false } },
    });

    const controller = new SearchOnlyController(repositoryInstance);
    await controller['binding']();

    const distinctRoutes = new Set(
      controller.router.routes.map(route => `${route.method} ${route.path}`),
    );
    expect(distinctRoutes).toEqual(new Set(['POST /search']));
  });

  test('POST /search dispatches to repository.search() and returns { found, hits }', async () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-3', config: {} });
    dataSource.fakeConnector.searchResponse = {
      found: 1,
      isFoundExact: true,
      hits: [{ document: { id: '1', title: 'foo' } }],
    };
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const ProductSearchController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'ProductSearchController', basePath: '/products' },
    });
    const controller = new ProductSearchController(repositoryInstance);

    const { context, getJsonBody, getJsonStatus } = fakeContext({
      mode: SearchModes.KEYWORD,
      query: 'foo',
      queryBy: ['title'],
    });

    await controller['search']({ context });

    expect(dataSource.fakeConnector.searchCalls.length).toBe(1);
    expect(dataSource.fakeConnector.searchCalls[0]?.collection).toBe('products');
    expect(getJsonBody()).toEqual({
      found: 1,
      isFoundExact: true,
      hits: [{ document: { id: '1', title: 'foo' } }],
    });
    expect(getJsonStatus()).toBe(HTTP.ResultCodes.RS_2.Ok);
  });

  test('POST /multi-search dispatches to dataSource.multiSearch() and returns its result verbatim', async () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-4', config: {} });
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const ProductSearchController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'ProductSearchController', basePath: '/products' },
    });
    const controller = new ProductSearchController(repositoryInstance);

    const searches = [{ collection: 'products', query: 'foo' }];
    const { context, getJsonBody, getJsonStatus } = fakeContext({ searches, union: true });

    await controller['multiSearch']({ context });

    // The controller passes the friendly body through; the datasource maps `query` -> wire `q` and injects the collection's @model hiddenProperties (`secret`) into exclude_fields.
    expect(dataSource.multiSearchCalls).toEqual([
      {
        searches: [{ collection: 'products', q: 'foo', ['exclude_fields']: 'secret' }],
        union: true,
      },
    ]);
    expect(getJsonBody()).toEqual({ results: [{ found: 2, isFoundExact: true, hits: [] }] });
    expect(getJsonStatus()).toBe(HTTP.ResultCodes.RS_2.Ok);
  });
});

describe('AbstractSearchController list headers', () => {
  const twoHits = [
    { document: { id: '1', title: 'foo' } },
    { document: { id: '2', title: 'bar' } },
  ];

  const makeController = (opts: {
    name: string;
    found: number;
    isFoundExact: boolean;
    hits: Array<{ document: { id: string; title: string } }>;
  }) => {
    const dataSource = new SearchFactoryDataSource({ name: opts.name, config: {} });
    dataSource.fakeConnector.searchResponse = {
      found: opts.found,
      isFoundExact: opts.isFoundExact,
      hits: opts.hits,
    };
    const Controller = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: `${opts.name}-controller`, basePath: '/products' },
    });
    return new Controller(new SearchFactoryProductRepository(dataSource));
  };

  test('POST /search sets Content-Range from offset and found, X-Response-Count from the page, and keeps the body', async () => {
    const controller = makeController({
      name: 'factory-test-ds-headers-1',
      found: 7,
      isFoundExact: false,
      hits: twoHits,
    });
    const { context, responseHeaders, getJsonBody } = fakeContext({
      mode: SearchModes.KEYWORD,
      query: 'foo',
      queryBy: ['title'],
      filter: { offset: 3, limit: 2 },
    });

    await controller['search']({ context });

    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records 3-4/7');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('2');
    expect(responseHeaders[HTTP.Headers.RESPONSE_FORMAT]).toBe('array');
    // The body keeps its shape: `isFoundExact` has no place in a `{ count, data }` envelope.
    expect(getJsonBody()).toEqual({ found: 7, isFoundExact: false, hits: twoHits });
  });

  test('POST /search in raw mode derives the start from page and per_page', async () => {
    const controller = makeController({
      name: 'factory-test-ds-headers-2',
      found: 7,
      isFoundExact: true,
      hits: twoHits,
    });
    // Raw params are the engine wire form; the snake_case keys are assigned through string access so no object-literal key carries them.
    const rawParams: Record<string, unknown> = { q: 'foo', page: 2 };
    rawParams['query_by'] = 'title';
    rawParams['per_page'] = 2;
    const { context, responseHeaders } = fakeContext({ mode: SearchModes.RAW, params: rawParams });

    await controller['search']({ context });

    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records 2-3/7');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('2');
  });

  test('an empty search page reports records */found', async () => {
    const controller = makeController({
      name: 'factory-test-ds-headers-3',
      found: 0,
      isFoundExact: true,
      hits: [],
    });
    const { context, responseHeaders } = fakeContext({
      mode: SearchModes.KEYWORD,
      query: 'zzz',
      queryBy: ['title'],
      filter: { offset: 0, limit: 2 },
    });

    await controller['search']({ context });

    expect(responseHeaders[HTTP.Headers.CONTENT_RANGE]).toBe('records */0');
    expect(responseHeaders[HTTP.Headers.RESPONSE_COUNT_DATA]).toBe('0');
  });
});
