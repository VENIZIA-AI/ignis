// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { getError } from '@venizia/ignis-helpers/core';
import type { IAuthenticationStrategy, IAuthUser } from '@venizia/ignis-kernel';
import type { OpenAPIHono } from '@hono/zod-openapi';

import {
  Authentication,
  AuthenticationStrategyRegistry,
  repository,
  controller as controllerDecorator,
} from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchControllerOptionsUtility } from '@/search/core/controllers/options';
import type { ISearchControllerOptions } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/core/repositories';
import type { TypesenseDataSource } from '@/search/typesense/datasources';

import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentWithDefaultQueryBy,
  type TProductDocument,
} from '../repositories/fake-search-connector';

/**
 * `query` (fixed, default, allow.tuning), `response` and the required `authenticate`, through the real router: the strict
 * `engineParams` body, the status of every refusal, and the wire params the engine receives.
 */

class QuerySettingsDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: QuerySettingsDataSource })
class QuerySettingsProductRepository extends DefaultSearchRepository<
  TProductDocument,
  TypesenseDataSource
> {}

@repository({ model: ProductDocumentWithDefaultQueryBy, dataSource: QuerySettingsDataSource })
class QuerySettingsDefaultByRepository extends DefaultSearchRepository<
  TProductDocument,
  TypesenseDataSource
> {}

const HITS = [
  { document: { id: '1', title: 'cheap', name: 'a', secret: 'S', isActive: true, price: 0 } },
  { document: { id: '2', title: 'dear', name: 'b', secret: 'S', isActive: true, price: 9 } },
];

let sequence = 0;

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

/** The wire params of the last engine call. */
const wire = (dataSource: QuerySettingsDataSource) =>
  (dataSource.fakeConnector.searchCalls.at(-1)?.params ?? {}) as Record<string, unknown>;

const mount = async (opts: {
  options?: Record<string, unknown>;
  authenticate?: ISearchControllerOptions['authenticate'];
  routes?: ISearchControllerOptions['routes'];
  repositoryClass?: typeof QuerySettingsProductRepository;
  found?: number;
}) => {
  sequence += 1;
  const RepositoryClass = opts.repositoryClass ?? QuerySettingsProductRepository;
  const dataSource = new QuerySettingsDataSource({ name: `query-settings-ds-${sequence}` });
  dataSource.fakeConnector.searchResponse = {
    found: opts.found ?? 2,
    isFoundExact: true,
    hits: HITS,
  } as never;

  const BuiltController = SearchControllerFactory.build({
    repository: RepositoryClass,
    routes: opts.routes ?? { search: { use: true } },
    authenticate: opts.authenticate ?? { skip: true },
    ...opts.options,
  } as ISearchControllerOptions<typeof QuerySettingsProductRepository>);

  @controllerDecorator({ path: '/products' })
  class Controller extends BuiltController {}

  const controller = new Controller(new RepositoryClass(dataSource));
  await controller.configure();

  const router = controller.getRouter();
  answerErrors(router);

  const send = async (body: unknown, headers: Record<string, string> = {}) => {
    const response = await router.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    const responseBody = await response.json();

    return {
      status: response.status,
      headers: response.headers,
      json: responseBody as { error?: string; hits?: Array<{ document: unknown }> },
    };
  };

  return { dataSource, send, router, controller };
};

const keyword = (extra: Record<string, unknown> = {}) => ({
  mode: 'keyword',
  query: 'foo',
  ...extra,
});

describe('precedence: fixed > client > default > the model', () => {
  test('queryBy: fixed wins and a client queryBy is a 400; the client beats a default; a default beats the model', async () => {
    const fixed = await mount({ options: { query: { fixed: { queryBy: ['title'] } } } });

    const fixedResponse = await fixed.send(keyword());

    expect(fixedResponse.status).toBe(200);
    expect(wire(fixed.dataSource)['query_by']).toBe('title');

    const refused = await fixed.send(keyword({ queryBy: ['name'] }));

    expect(refused.status).toBe(400);
    expect(refused.json.error).toContain('queryBy is fixed');

    const open = await mount({ options: { query: { default: { queryBy: ['title'] } } } });

    await open.send(keyword({ queryBy: ['name'] }));
    expect(wire(open.dataSource)['query_by']).toBe('name');
    await open.send(keyword());
    expect(wire(open.dataSource)['query_by']).toBe('title');

    const modelDefault = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { default: { queryBy: ['name'] } } },
    });

    await modelDefault.send(keyword());
    expect(wire(modelDefault.dataSource)['query_by']).toBe('name');

    const onlyModel = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { default: { order: ['name'] } } },
    });

    await onlyModel.send(keyword());
    expect(wire(onlyModel.dataSource)['query_by']).toBe('title,name');
  });

  test('a hybrid body needs no queryBy when the server chooses it: fixed, else the model list', async () => {
    const hybrid = {
      mode: 'hybrid',
      query: 'foo',
      vectorField: 'embedding',
      nearVector: [1, 0, 0, 0],
    };
    const fixed = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { fixed: { queryBy: ['title'] } } },
    });
    const served = await fixed.send(hybrid);

    expect(served.status).toBe(200);
    expect(wire(fixed.dataSource)['query_by']).toBe('title');

    const modelList = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { default: { order: ['name'] } } },
    });
    const fromModel = await modelList.send(hybrid);

    expect(fromModel.status).toBe(200);
    expect(wire(modelList.dataSource)['query_by']).toBe('title,name');
  });

  test('queryByWeights are keyed and written in the order of the effective queryBy', async () => {
    const fixed = await mount({
      options: {
        query: { fixed: { queryBy: ['title', 'name'], queryByWeights: { name: 1, title: 3 } } },
      },
    });

    await fixed.send(keyword());
    expect(wire(fixed.dataSource)['query_by_weights']).toBe('3,1');
    const refusedWeights = await fixed.send(keyword({ queryByWeights: [1, 1] }));

    expect(refusedWeights.status).toBe(400);

    // A default weight set that does not cover the client's queryBy is dropped; one that covers it is used.
    const defaults = await mount({
      options: { query: { default: { queryByWeights: { title: 2, name: 1 } } } },
    });

    await defaults.send(keyword({ queryBy: ['name', 'title'] }));
    expect(wire(defaults.dataSource)['query_by_weights']).toBe('1,2');
    await defaults.send(keyword({ queryBy: ['status'] }));
    expect(wire(defaults.dataSource)['query_by_weights']).toBeUndefined();

    // A fixed weight set that does not cover a client queryBy is a 400.
    const fixedWeights = await mount({
      options: { query: { fixed: { queryByWeights: { title: 2 } } } },
    });

    const refusedQueryBy = await fixedWeights.send(keyword({ queryBy: ['title', 'name'] }));

    expect(refusedQueryBy.status).toBe(400);
  });

  test('order: fixed wins and a client order is a 400; the client beats a default; a default fills in', async () => {
    const fixed = await mount({ options: { query: { fixed: { order: ['name DESC'] } } } });

    await fixed.send(keyword({ queryBy: ['title'] }));
    expect(wire(fixed.dataSource)['sort_by']).toBe('name:desc');
    const refusedOrder = await fixed.send(
      keyword({ queryBy: ['title'], filter: { order: ['title'] } }),
    );

    expect(refusedOrder.status).toBe(400);

    const open = await mount({ options: { query: { default: { order: ['name ASC'] } } } });

    await open.send(keyword({ queryBy: ['title'], filter: { order: ['title DESC'] } }));
    expect(wire(open.dataSource)['sort_by']).toBe('title:desc');
    await open.send(keyword({ queryBy: ['title'] }));
    expect(wire(open.dataSource)['sort_by']).toBe('name:asc');
  });

  test('a default tuning.sortBy is one sort with order: a client order replaces it, a fixed one makes a client order a 400', async () => {
    const sortBy = '_text_match:desc,createdAt:desc';
    const open = await mount({ options: { query: { default: { tuning: { sortBy } } } } });

    await open.send(keyword({ queryBy: ['title'] }));
    expect(wire(open.dataSource)['sort_by']).toBe(sortBy);

    await open.send(keyword({ queryBy: ['title'], filter: { order: ['title DESC'] } }));
    expect(wire(open.dataSource)['sort_by']).toBe('title:desc');

    const fixed = await mount({ options: { query: { fixed: { tuning: { sortBy } } } } });
    const refused = await fixed.send(keyword({ queryBy: ['title'], filter: { order: ['title'] } }));

    expect(refused.status).toBe(400);
  });

  test('tuning: fixed and default values reach the engine, an allowed client key beats the default, a fixed key cannot be sent', async () => {
    const { send, dataSource } = await mount({
      options: {
        query: {
          fixed: { tuning: { maxCandidates: 4 } },
          default: { tuning: { numTypos: 2, typoTokensThreshold: 1 } },
          allow: { tuning: ['numTypos'] },
        },
      },
    });

    await send(keyword({ queryBy: ['title'] }));
    expect(wire(dataSource)['max_candidates']).toBe(4);
    expect(wire(dataSource)['num_typos']).toBe(2);
    expect(wire(dataSource)['typo_tokens_threshold']).toBe(1);

    await send(keyword({ queryBy: ['title'], engineParams: { numTypos: 0 } }));
    expect(wire(dataSource)['num_typos']).toBe(0);

    // `maxCandidates` is fixed, so it is not in the body schema.
    const refusedFixedKey = await send(
      keyword({ queryBy: ['title'], engineParams: { maxCandidates: 9 } }),
    );

    expect(refusedFixedKey.status).toBe(400);
  });

  test('a keyed list knob becomes the positional list of queryBy', async () => {
    const { send, dataSource } = await mount({
      options: {
        query: {
          fixed: { queryBy: ['title', 'name'], tuning: { numTypos: { title: 1, name: 0 } } },
        },
      },
    });

    await send(keyword());
    expect(wire(dataSource)['num_typos']).toBe('1,0');
  });
});

describe('the engineParams of the body are the allowed tuning names', () => {
  test('an allowed name reaches the engine as its wire name; another name, or its wire spelling, is a 400', async () => {
    const { send, dataSource } = await mount({
      options: { query: { allow: { tuning: ['typoTokensThreshold'] } } },
    });

    const allowed = await send(
      keyword({ queryBy: ['title'], engineParams: { typoTokensThreshold: 2 } }),
    );

    expect(allowed.status).toBe(200);
    expect(wire(dataSource)['typo_tokens_threshold']).toBe(2);

    for (const engineParams of [{ ['typo_tokens_threshold']: 2 }, { numTypos: 1 }]) {
      const refused = await send(keyword({ queryBy: ['title'], engineParams }));

      expect(refused.status).toBe(400);
    }
  });

  test('without allow.tuning, engineParams is a 400 as before', async () => {
    const { send } = await mount({});

    const refused = await send(keyword({ engineParams: { numTypos: 1 } }));

    expect(refused.status).toBe(400);
  });
});

describe('what the definition refuses', () => {
  const refuses = (options: Record<string, unknown>, pattern: RegExp, extra = {}) =>
    expect(() =>
      SearchControllerFactory.build({
        repository: QuerySettingsProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        ...extra,
        ...options,
      } as never),
    ).toThrow(pattern);

  test.each([
    [
      'a name that is fixed and allowed',
      { query: { fixed: { tuning: { numTypos: 1 } }, allow: { tuning: ['numTypos'] } } },
      /fixed and also in allow\.tuning/,
    ],
    [
      'order and tuning.sortBy in one layer',
      { query: { default: { order: ['name'], tuning: { sortBy: 'name:asc' } } } },
      /order and tuning\.sortBy are both set/,
    ],
    [
      'a weight for a field that is not in queryBy',
      { query: { fixed: { queryBy: ['title'], queryByWeights: { title: 1, name: 2 } } } },
      /queryByWeights names a field that is not in queryBy/,
    ],
    [
      'weights that skip a queryBy field',
      { query: { fixed: { queryBy: ['title', 'name'], queryByWeights: { title: 1 } } } },
      /queryByWeights must name every queryBy field/,
    ],
    [
      'a field the model does not have',
      { query: { fixed: { queryBy: ['nothing'] } } },
      /names a field the model does not have/,
    ],
    [
      'a queryBy field that is not text',
      { query: { fixed: { queryBy: ['isActive'] } } },
      /not text/,
    ],
    ['an unknown setting', { query: { fixed: { limit: 3 } } }, /unknown setting 'limit'/],
    [
      'a fixed setting with raw mode',
      { query: { fixed: { queryBy: ['title'] } }, modes: { raw: { use: true } } },
      /cannot be used with modes\.raw/,
    ],
    [
      'a default setting with multi-search',
      { query: { default: { queryBy: ['title'] } }, routes: { multiSearch: { use: true } } },
      /cannot be used with routes\.multiSearch/,
    ],
    [
      'a response with raw mode',
      {
        response: { use: true, document: z.object({}), transform: () => [] },
        modes: { raw: { use: true } },
      },
      /response cannot be used with modes\.raw/,
    ],
    [
      'a name no allow list can hold',
      { query: { allow: { tuning: ['sortBy'] } } },
      /can never be allowed/,
    ],
  ])('%s', (_name, options, pattern) => {
    refuses(options, pattern, 'routes' in options ? { routes: undefined } : {});
  });
});

describe('hidden fields', () => {
  test('a static list that names a hidden field, or a dotted child of one, is refused when the controller is built', () => {
    for (const query of [
      { fixed: { queryBy: ['secret'] } },
      { default: { order: ['secret DESC'] } },
      {
        fixed: { queryBy: ['title'], queryByWeights: { title: 1 } },
        default: { order: ['secret'] },
      },
    ]) {
      expect(() =>
        SearchControllerFactory.build({
          repository: QuerySettingsProductRepository,
          authenticate: { skip: true },
          routes: { search: { use: true } },
          query,
        } as never),
      ).toThrow(/names a hidden field \| field: secret/);
    }
  });

  test('a function that returns a hidden field answers 500, and the message names the field', async () => {
    const { send, dataSource } = await mount({
      options: { query: { fixed: () => ({ queryBy: ['secret'] }) } },
    });
    const refused = await send(keyword());

    expect(refused.status).toBe(500);
    expect(refused.json.error).toContain('hidden field');
    expect(refused.json.error).toContain('secret');
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test('a scope may still filter on a hidden field', async () => {
    const { send } = await mount({
      options: { scope: () => ({ secret: 'S' }), query: { fixed: { queryBy: ['title'] } } },
    });

    const response = await send(keyword());

    expect(response.status).toBe(200);
  });
});

describe('a scope that matches nothing', () => {
  test('an empty or is an answer of no rows, not a 403', async () => {
    const { send, dataSource } = await mount({
      options: { scope: () => ({ or: [] }), query: { fixed: { queryBy: ['title'] } } },
    });
    const empty = await send(keyword());

    expect(empty.status).toBe(200);
    expect(empty.json.hits).toEqual([]);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });
});

describe('function sources', () => {
  test('receive the scoped, extended body and may depend on it', async () => {
    const seen: unknown[] = [];
    const { send, dataSource } = await mount({
      options: {
        scope: () => ({ status: 'live' }),
        request: { body: { extend: { digitsOnly: z.boolean().optional() } } },
        query: {
          default: ({ input }: { input: Record<string, unknown> }) => {
            seen.push(input);

            return { queryBy: ['title'], tuning: { numTypos: input['digitsOnly'] ? 0 : 2 } };
          },
        },
      },
    });

    await send(keyword({ digitsOnly: true }));

    const input = seen[0] as { digitsOnly?: boolean; filter?: { where?: unknown } };

    expect(input.digitsOnly).toBe(true);
    expect(input.filter?.where).toEqual({ status: 'live' });
    expect(wire(dataSource)['num_typos']).toBe(0);

    await send(keyword());
    expect(wire(dataSource)['num_typos']).toBe(2);
  });

  test('a function that throws, or returns what is not an object, answers 500', async () => {
    for (const source of [
      () => {
        throw new Error('boom');
      },
      () => 'nope',
    ]) {
      const { send } = await mount({ options: { query: { default: source } } });
      const refused = await send(keyword());

      expect(refused.status).toBe(500);
    }
  });

  test("a tuning value the engine refuses is the server's 500, not the client's 400", async () => {
    const { send, dataSource } = await mount({
      options: { query: { fixed: { queryBy: ['title'], tuning: { numTypos: -1 } } } },
    });
    const refused = await send(keyword());

    expect(refused.status).toBe(500);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });
});

describe('response transform', () => {
  const PublicProduct = z.object({ id: z.string(), title: z.string() });
  const keep = (predicate: (price: number) => boolean) => ({
    use: true,
    document: PublicProduct,
    transform: ({ hits }: { hits: Array<{ document: Record<string, unknown> }> }) =>
      hits
        .filter((hit) => predicate(hit.document['price'] as number))
        .map((hit) => ({
          ...hit,
          document: { id: hit.document['id'], title: hit.document['title'], secret: 'dropped' },
        })),
  });

  test('may drop hits; the range keeps the engine page, the count is the response, the total is found', async () => {
    const { send } = await mount({ found: 40, options: { response: keep((price) => price > 0) } });
    const result = await send(keyword({ queryBy: ['title'], filter: { offset: 10, limit: 2 } }));

    expect(result.status).toBe(200);
    // The schema drops the `secret` the transform added.
    expect(result.json.hits).toEqual([{ document: { id: '2', title: 'dear' } }]);
    expect(result.headers.get('content-range')).toBe('records 10-11/40');
    expect(result.headers.get('x-response-count')).toBe('1');
  });

  test('a page whose hits are all dropped prints records */found and a count of 0', async () => {
    const { send } = await mount({ found: 40, options: { response: keep(() => false) } });
    const result = await send(keyword({ queryBy: ['title'], filter: { offset: 10, limit: 2 } }));

    expect(result.json.hits).toEqual([]);
    expect(result.headers.get('content-range')).toBe('records */40');
    expect(result.headers.get('x-response-count')).toBe('0');
  });

  test('a document the schema refuses, a transform that throws, or no list answers 500', async () => {
    for (const transform of [
      ({ hits }: { hits: unknown[] }) =>
        hits.map((hit) => ({ ...(hit as object), document: { id: 1 } })),
      () => {
        throw new Error('boom');
      },
      () => 'nope',
    ]) {
      const { send } = await mount({
        options: { response: { use: true, document: PublicProduct, transform } as never },
      });

      const refused = await send(keyword({ queryBy: ['title'] }));

      expect(refused.status).toBe(500);
    }
  });

  test('{ use: false } and no response give the body and headers of a controller without the option', async () => {
    const plain = await mount({});
    const off = await mount({ options: { response: { use: false } } });
    const body = keyword({ queryBy: ['title'], filter: { offset: 3, limit: 2 } });
    const first = await plain.send(body);
    const second = await off.send(body);

    expect(second.json).toEqual(first.json);
    expect(second.headers.get('content-range')).toBe(first.headers.get('content-range'));
    expect(second.headers.get('x-response-count')).toBe(first.headers.get('x-response-count'));
    expect(first.json.hits).toHaveLength(2);
  });
});

describe('authenticate', () => {
  test('is required, and a route is open only by { skip: true }', () => {
    for (const authenticate of [undefined, {}, { strategies: [] }]) {
      expect(() =>
        SearchControllerFactory.build({
          repository: QuerySettingsProductRepository,
          routes: { search: { use: true } },
          authenticate,
        } as never),
      ).toThrow(/authenticate/);
    }
  });

  describe('JWT only, with a jwt strategy registered', () => {
    // A stand-in for the real strategy: it admits one bearer token and refuses everything else with a 401.
    const jwt: IAuthenticationStrategy = {
      name: 'jwt',
      authenticate: async (context) => {
        if (context.req.header('authorization') === 'Bearer good-token') {
          return { userId: 'user-1' } as IAuthUser;
        }

        throw getError({ statusCode: 401, message: 'bad token' });
      },
    };

    afterEach(() => {
      (
        AuthenticationStrategyRegistry.getInstance as unknown as { mockRestore?: () => void }
      ).mockRestore?.();
    });

    const mountJwt = () => {
      spyOn(AuthenticationStrategyRegistry, 'getInstance').mockReturnValue({
        resolveStrategy: ({ name }: { name: string }) => (name === 'jwt' ? jwt : undefined),
        reportUnregistered: () => {},
      } as unknown as AuthenticationStrategyRegistry);

      return mount({ authenticate: { strategies: [Authentication.STRATEGY_JWT] } });
    };

    test('the route configs carry the strategy', () => {
      const configs = SearchControllerFactory.defineRouteConfigs({
        selectSchema: z.object({}),
        authenticate: { strategies: [Authentication.STRATEGY_JWT] },
      });

      expect(configs.SEARCH.authenticate).toEqual({ strategies: ['jwt'] });
    });

    test('a valid token is served, a request without a token or with another scheme is a 401', async () => {
      const { send } = await mountJwt();
      const served = await send(keyword(), { authorization: 'Bearer good-token' });
      const anonymous = await send(keyword());
      const basic = await send(keyword(), { authorization: 'Basic dXNlcjpwYXNz' });

      expect(served.status).toBe(200);
      expect(anonymous.status).toBe(401);
      expect(basic.status).toBe(401);
    });
  });

  test('{ skip: true } drops authorize, as it does for any route', () => {
    const resolved = SearchControllerOptionsUtility.resolve({
      scope: 's',
      entityClass: ProductDocument,
      options: {
        authenticate: { skip: true },
        authorize: { rules: [] } as never,
        routes: { search: { use: true } },
        hasScope: false,
      },
    });

    expect(resolved.authorize).toBeUndefined();
    expect(resolved.authenticate).toEqual({});
  });

  test('{ skip: true } serves the route without a token', async () => {
    const { send } = await mount({ authenticate: { skip: true } });
    const served = await send(keyword());

    expect(served.status).toBe(200);
  });
});

describe('the default is unchanged', () => {
  test('a controller built with none of query, response or allow sends the engine what it sent before', async () => {
    const { send, dataSource } = await mount({});

    await send(keyword({ queryBy: ['title', 'name'], queryByWeights: [2, 1] }));
    expect(wire(dataSource)).toMatchObject({
      q: 'foo',
      ['query_by']: 'title,name',
      ['query_by_weights']: '2,1',
    });
    expect(wire(dataSource)['num_typos']).toBeUndefined();
  });

  test('semantic and hybrid requests reach the engine with their own params and nothing the options add', async () => {
    const { send, dataSource } = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
    });

    await send({
      mode: 'semantic',
      vectorField: 'embedding',
      nearVector: [1, 0, 0, 0],
      filter: { limit: 3 },
    });
    expect(wire(dataSource)['vector_query']).toContain('embedding:([1, 0, 0, 0]');
    expect(wire(dataSource)['query_by']).toBeUndefined();
    expect(wire(dataSource)['num_typos']).toBeUndefined();
    expect(wire(dataSource)['sort_by']).toBeUndefined();

    await send({
      mode: 'hybrid',
      query: 'foo',
      queryBy: ['title'],
      vectorField: 'embedding',
      nearVector: [1, 0, 0, 0],
    });
    expect(wire(dataSource)['query_by']).toBe('title');
    expect(wire(dataSource)['vector_query']).toContain('embedding:([1, 0, 0, 0]');
    expect(wire(dataSource)['num_typos']).toBeUndefined();
  });
});

describe('a toggle that is not { use: boolean } is refused when the controller is defined', () => {
  test.each([
    ['routes.search as true', { routes: { search: true } }, /routes\.search must be/],
    [
      'routes.search use "false"',
      { routes: { search: { use: 'false' } } },
      /routes\.search must be/,
    ],
    ['modes.raw use "yes"', { modes: { raw: { use: 'yes' } } }, /modes\.raw must be/],
    ['modes.raw use 1', { modes: { raw: { use: 1 } } }, /modes\.raw must be/],
    ['modes.raw null', { modes: { raw: null } }, /modes\.raw must be/],
    ['modes.raw without use', { modes: { raw: {} } }, /modes\.raw must be/],
    [
      'modes.raw a Boolean object',
      // oxlint-disable-next-line no-new-wrappers
      { modes: { raw: { use: new Boolean(true) } } },
      /modes\.raw must be/,
    ],
    ['response use "true"', { response: { use: 'true' } }, /response must be/],
  ])('%s', (_name, options, pattern) => {
    expect(() =>
      SearchControllerFactory.build({
        repository: QuerySettingsProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        ...options,
      } as never),
    ).toThrow(pattern);
  });
});

describe('server-origin refusals answer 500 and client-origin ones 400', () => {
  test('a fixed order the engine refuses, and a function order that is not an entry, answer 500', async () => {
    const tooMany = await mount({
      options: {
        query: { fixed: { order: ['name', 'title', 'status', 'isActive'] } },
      },
    });
    const refused = await tooMany.send(keyword({ queryBy: ['title'] }));

    expect(refused.status).toBe(500);

    const notEntry = await mount({ options: { query: { fixed: () => ({ order: [''] }) } } });
    const badEntry = await notEntry.send(keyword({ queryBy: ['title'] }));

    expect(badEntry.status).toBe(500);
  });

  test('a fixed keyed knob does not fail a semantic request, which has no queryBy to align to', async () => {
    const { send } = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { fixed: { tuning: { numTypos: { title: 1, name: 0 } } } } },
    });
    const served = await send({
      mode: 'semantic',
      vectorField: 'embedding',
      nearVector: [1, 0, 0, 0],
    });

    expect(served.status).toBe(200);
  });

  test('a fixed keyed set that does not cover a list the server chose is a 500, the client queryBy a 400', async () => {
    const { send } = await mount({
      repositoryClass: QuerySettingsDefaultByRepository as never,
      options: { query: { fixed: { queryByWeights: { title: 2 } } } },
    });
    // No queryBy from the client: the model's list (title, name) is the one the weights must cover.
    const serverList = await send(keyword());
    const clientList = await send(keyword({ queryBy: ['title', 'name'] }));

    expect(serverList.status).toBe(500);
    expect(clientList.status).toBe(400);
  });

  test('allow.tuning takes camelCase names only', () => {
    expect(() =>
      SearchControllerFactory.build({
        repository: QuerySettingsProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        query: { allow: { tuning: ['num_typos'] } },
      } as never),
    ).toThrow(/write the camelCase name/);
  });
});
