// Must precede the controllers/factory import below: import order avoids a circular-import
// TDZ error (BaseRestController not yet defined when health-check's controller extends it) -
// same guard `repositories/integration-wiring.test.ts` uses for the CRUD factory.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';

import { repository } from '@/base/metadata';
import { SearchControllerFactory } from '@/connectors/typesense/controllers/factory';
import { DefaultSearchRepository } from '@/connectors/typesense/repositories';
import { SearchModes } from '@/connectors/typesense/repositories/common';
import { HTTP } from '@venizia/ignis-helpers';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

// Own datasource class (not reused from another test file): the model registry is a process-wide
// singleton keyed by class name - same convention `repositories/integration-wiring.test.ts` uses.
//
// `FakeSearchEngineHelper.multiSearch()` throws (unneeded by the repository-tier tests it was
// built for) with a zero-arg `(): Promise<never>` signature that can't be widened by a subclass
// override (return-type covariance forbids `Promise<unknown>` under `Promise<never>`) - patched
// onto the fake instance directly instead, the same connector-boundary `as any` FakeSearchDataSource
// itself already uses for getConnector().
class SearchFactoryDataSource extends FakeSearchDataSource {
  multiSearchCalls: Array<{ searches: unknown[]; union?: boolean; commonParams?: unknown }> = [];
  multiSearchResponse: unknown = { results: [{ found: 2, hits: [] }] };

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

// Distinctly named (not `ProductSearchRepository`, already used by the CRUD-factory wiring test
// loaded in the same process) - MetadataRegistry keys repository bindings by class name.
@repository({ model: ProductDocument, dataSource: SearchFactoryDataSource })
class SearchFactoryProductRepository extends DefaultSearchRepository {}

/** Minimal `TRouteContext`-shaped fake: records the JSON body/status the handler responds with. */
const fakeContext = <TInput>(input: TInput) => {
  let jsonBody: unknown;
  let jsonStatus: number | undefined;

  const context = {
    req: { valid: () => input },
    json: (body: unknown, status?: number) => {
      jsonBody = body;
      jsonStatus = status;
      return body;
    },
  };

  return { context: context as any, getJsonBody: () => jsonBody, getJsonStatus: () => jsonStatus };
};

describe('SearchControllerFactory.defineSearchController', () => {
  test('registers exactly the search + multiSearch POST routes', () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-1', config: {} });
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const ProductSearchController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'ProductSearchController', basePath: '/products' },
    });

    const controller = new ProductSearchController(repositoryInstance);
    controller['binding']();

    // OpenAPIHono.openapi() registers more than one internal `.routes` entry per call (pre-existing
    // Hono behavior, also visible on ControllerFactory.defineCrudController) - dedupe via Set, same
    // convention as `repositories/integration-wiring.test.ts`'s CRUD-factory route-count assertion.
    const distinctRoutes = new Set(
      controller.router.routes.map(route => `${route.method} ${route.path}`),
    );
    expect(distinctRoutes.size).toBe(2);
    expect(distinctRoutes).toContain('POST /search');
    expect(distinctRoutes).toContain('POST /multi-search');
  });

  test('routes.multiSearch.enabled: false disables only the multi-search route', () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-2', config: {} });
    const repositoryInstance = new SearchFactoryProductRepository(dataSource);

    const SearchOnlyController = SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: SearchFactoryProductRepository.name },
      controller: { name: 'SearchOnlyController', basePath: '/products' },
      routes: { multiSearch: { enabled: false } },
    });

    const controller = new SearchOnlyController(repositoryInstance);
    controller['binding']();

    const distinctRoutes = new Set(
      controller.router.routes.map(route => `${route.method} ${route.path}`),
    );
    expect(distinctRoutes).toEqual(new Set(['POST /search']));
  });

  test('POST /search dispatches to repository.search() and returns { found, hits }', async () => {
    const dataSource = new SearchFactoryDataSource({ name: 'factory-test-ds-3', config: {} });
    dataSource.fakeConnector.searchResponse = {
      found: 1,
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
    expect(getJsonBody()).toEqual({ found: 1, hits: [{ document: { id: '1', title: 'foo' } }] });
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

    const searches = [{ collection: 'products', q: 'foo' }];
    const { context, getJsonBody, getJsonStatus } = fakeContext({ searches, union: true });

    await controller['multiSearch']({ context });

    expect(dataSource.multiSearchCalls).toEqual([{ searches, union: true }]);
    expect(getJsonBody()).toEqual({ results: [{ found: 2, hits: [] }] });
    expect(getJsonStatus()).toBe(HTTP.ResultCodes.RS_2.Ok);
  });
});
