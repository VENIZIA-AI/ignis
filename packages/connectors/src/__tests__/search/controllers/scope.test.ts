// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import { repository, ScopeFilters } from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchModes } from '@/search/core/repositories/common';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

class SearchScopeDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: SearchScopeDataSource })
class SearchScopeProductRepository extends DefaultSearchRepository {}

/** Minimal `TRouteContext`-shaped fake: the validated body in, the JSON response out. */
const fakeContext = <TInput>(input: TInput) => {
  let jsonStatus: number | undefined;

  const context = {
    req: { valid: () => input, header: () => undefined },
    header: () => undefined,
    json: (body: unknown, status?: number) => {
      jsonStatus = status;
      return body;
    },
  };

  return { context: context as any, getJsonStatus: () => jsonStatus };
};

let sequence = 0;

const build = (opts: {
  scope?: (ctx: { context: unknown }) => unknown;
  routes?: Record<string, { enabled?: boolean }>;
}) => {
  sequence += 1;
  const dataSource = new SearchScopeDataSource({ name: `search-scope-ds-${sequence}`, config: {} });
  const repositoryInstance = new SearchScopeProductRepository(dataSource);

  const Controller = SearchControllerFactory.defineSearchController({
    entity: ProductDocument,
    repository: { name: SearchScopeProductRepository.name },
    controller: { name: 'ScopedProductSearchController', basePath: '/products' },
    routes: opts.routes ?? { multiSearch: { enabled: false } },
    scope: opts.scope as any,
  });

  return { controller: new Controller(repositoryInstance), dataSource };
};

const refusal = async (task: Promise<unknown>) => {
  try {
    await task;
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the request to be refused');
};

const lastFilterBy = (dataSource: SearchScopeDataSource) => {
  const call = dataSource.fakeConnector.searchCalls.at(-1);
  const params = (call?.params ?? {}) as Record<string, unknown>;
  return params['filter_by'];
};

describe('SearchControllerFactory - scope', () => {
  test('the scope is ANDed into the filter the engine receives', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    await controller['search']({
      context: fakeContext({ mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] }).context,
    });

    expect(lastFilterBy(dataSource)).toBe('(isActive:=true && status:=`m-a`)');
  });

  test('the client filter can narrow the scope, and sits inside the AND', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    await controller['search']({
      context: fakeContext({
        mode: SearchModes.KEYWORD,
        query: 'foo',
        queryBy: ['title'],
        filter: { where: { name: 'lamp' } },
      }).context,
    });

    const filterBy = String(lastFilterBy(dataSource));
    expect(filterBy).toContain('status:=`m-a`');
    expect(filterBy).toContain('name:=`lamp`');
    expect(filterBy).toContain('&&');
  });

  test('a client where that tries to widen the scope with an or cannot escape it', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    await controller['search']({
      context: fakeContext({
        mode: SearchModes.KEYWORD,
        query: 'foo',
        queryBy: ['title'],
        filter: { where: { or: [{ status: 'm-b' }, { status: 'm-a' }] } },
      }).context,
    });

    const filterBy = String(lastFilterBy(dataSource));
    expect(filterBy.indexOf('status:=`m-a`')).toBeGreaterThanOrEqual(0);
    expect(filterBy).toMatch(/^\(.*status:=`m-a`.*&&.*\(.*m-b.*\|\|.*m-a.*\)/);
  });

  test('the scope is applied to semantic and hybrid modes too', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    await controller['search']({
      context: fakeContext({
        mode: SearchModes.SEMANTIC,
        vectorField: 'embedding',
        nearVector: [0.1],
      }).context,
    });
    expect(String(lastFilterBy(dataSource))).toContain('status:=`m-a`');

    await controller['search']({
      context: fakeContext({
        mode: SearchModes.HYBRID,
        query: 'foo',
        queryBy: ['title'],
        vectorField: 'embedding',
        nearVector: [0.1],
      }).context,
    });
    expect(String(lastFilterBy(dataSource))).toContain('status:=`m-a`');
  });

  test('an async scope is awaited and receives the request context', async () => {
    let seen: unknown;
    const { controller, dataSource } = build({
      scope: async ({ context }) => {
        seen = context;
        return { status: 'm-async' };
      },
    });
    const { context } = fakeContext({
      mode: SearchModes.KEYWORD,
      query: 'foo',
      queryBy: ['title'],
    });

    await controller['search']({ context });

    expect(seen).toBe(context);
    expect(String(lastFilterBy(dataSource))).toContain('status:=`m-async`');
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
  ])(
    'a scope that resolves to %s refuses the request with 403 and searches nothing',
    async (_name, value) => {
      const { controller, dataSource } = build({ scope: () => value });

      const error = await refusal(
        controller['search']({
          context: fakeContext({ mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] })
            .context,
        }),
      );

      expect(error.statusCode).toBe(403);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    },
  );

  test('a scope that throws refuses the request with 403 and searches nothing', async () => {
    const { controller, dataSource } = build({
      scope: () => {
        throw new Error('no merchant in the session');
      },
    });

    const error = await refusal(
      controller['search']({
        context: fakeContext({ mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] })
          .context,
      }),
    );

    expect(error.statusCode).toBe(403);
    expect(error.message).toContain('could not be resolved');
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test('UNRESTRICTED applies no scope for the call', async () => {
    const { controller, dataSource } = build({ scope: () => ScopeFilters.UNRESTRICTED });

    await controller['search']({
      context: fakeContext({ mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] }).context,
    });

    expect(lastFilterBy(dataSource)).toBe('isActive:=true');
  });

  test('raw mode is refused with 400: its params cannot take a scope', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    const error = await refusal(
      controller['search']({
        context: fakeContext({ mode: SearchModes.RAW, params: { q: '*', ['filter_by']: '' } })
          .context,
      }),
    );

    expect(error.statusCode).toBe(400);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test('engineParams is refused with 400: it could overwrite filter_by', async () => {
    const { controller, dataSource } = build({ scope: () => ({ status: 'm-a' }) });

    const error = await refusal(
      controller['search']({
        context: fakeContext({
          mode: SearchModes.KEYWORD,
          query: 'foo',
          queryBy: ['title'],
          engineParams: { ['filter_by']: '' },
        }).context,
      }),
    );

    expect(error.statusCode).toBe(400);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test('defining a scoped controller without disabling multi-search throws', () => {
    expect(() =>
      SearchControllerFactory.defineSearchController({
        entity: ProductDocument,
        repository: { name: SearchScopeProductRepository.name },
        controller: { name: 'ScopedNoRoutes', basePath: '/products' },
        scope: () => ({ status: 'm-a' }),
      }),
    ).toThrow(/multiSearch\.enabled/);
  });

  test('the multi-search handler refuses a scoped controller even if called directly', async () => {
    const { controller } = build({ scope: () => ({ status: 'm-a' }) });

    const error = await refusal(
      controller['multiSearch']({
        context: fakeContext({ searches: [{ collection: 'products' }] }).context,
      }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('a controller without a scope behaves as before', async () => {
    const { controller, dataSource } = build({ routes: {} });

    await controller['search']({
      context: fakeContext({ mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] }).context,
    });

    const { context, getJsonStatus } = fakeContext({ mode: SearchModes.RAW, params: { q: '*' } });
    await controller['search']({ context });

    expect(lastFilterBy(dataSource)).toBeUndefined();
    expect(getJsonStatus()).toBe(HTTP.ResultCodes.RS_2.Ok);
  });
});
