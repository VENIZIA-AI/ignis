// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import { repository } from '@venizia/ignis-kernel';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchEngineParams } from '@/search/core/controllers/engine-params';
import { SearchModes } from '@/search/core/repositories/common';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

/**
 * A search request's `engineParams` is refused (400) on every search controller, scoped or not, unless the controller
 * lists the parameters a caller may send. A parameter that selects rows or fields can never be listed.
 */

class EngineParamsDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: EngineParamsDataSource })
class EngineParamsProductRepository extends DefaultSearchRepository {}

const fakeContext = <TInput>(input: TInput) => ({
  req: { valid: () => input, header: () => undefined },
  header: () => undefined,
  json: (body: unknown) => body,
});

let sequence = 0;

const build = (opts: {
  scope?: () => unknown;
  allow?: string[];
  routes?: Record<string, { enabled?: boolean }>;
  isRawAllowed?: boolean;
}) => {
  sequence += 1;
  const dataSource = new EngineParamsDataSource({
    name: `engine-params-ds-${sequence}`,
    config: {},
  });
  const repositoryInstance = new EngineParamsProductRepository(dataSource);

  const Controller = SearchControllerFactory.defineSearchController({
    entity: ProductDocument,
    repository: { name: EngineParamsProductRepository.name },
    controller: { name: `EngineParamsController${sequence}`, basePath: '/products' },
    routes: opts.routes ?? (opts.scope ? { multiSearch: { enabled: false } } : undefined),
    scope: opts.scope as never,
    engineParams: opts.allow === undefined ? undefined : { allow: opts.allow },
    modes: opts.isRawAllowed ? { raw: { allow: true } } : undefined,
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

const keyword = (engineParams?: Record<string, unknown>) => ({
  mode: SearchModes.KEYWORD,
  query: 'foo',
  queryBy: ['title'],
  ...(engineParams === undefined ? {} : { engineParams }),
});

const KINDS = [
  ['an unscoped controller', () => build({}), () => build({ allow: ['typo_tokens_threshold'] })],
  [
    'a scoped controller',
    () => build({ scope: () => ({ status: 'm-a' }) }),
    () => build({ scope: () => ({ status: 'm-a' }), allow: ['typo_tokens_threshold'] }),
  ],
] as const;

describe.each(KINDS)('%s', (_name, plain, allowing) => {
  test('refuses engineParams with 400 and the engine is never reached', async () => {
    const { controller, dataSource } = plain();

    const error = await refusal(
      controller['search']({
        context: fakeContext(keyword({ ['filter_by']: 'isActive:=false' })) as never,
      }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('engineParams is not available on this search controller');
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test('refuses an empty engineParams too: the key itself is the request', async () => {
    const { controller } = plain();

    const error = await refusal(
      controller['search']({ context: fakeContext(keyword({})) as never }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('a request without engineParams works', async () => {
    const { controller, dataSource } = plain();

    await controller['search']({ context: fakeContext(keyword()) as never });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });

  test('with an allowlist, an allowed parameter reaches the engine', async () => {
    const { controller, dataSource } = allowing();

    await controller['search']({
      context: fakeContext(keyword({ ['typo_tokens_threshold']: 3 })) as never,
    });

    const params = (dataSource.fakeConnector.searchCalls.at(-1)?.params ?? {}) as Record<
      string,
      unknown
    >;
    expect(params['typo_tokens_threshold']).toBe(3);
  });

  test('with an allowlist, a parameter that is not on it is refused, whatever it is', async () => {
    const { controller, dataSource } = allowing();

    const error = await refusal(
      controller['search']({
        context: fakeContext(keyword({ ['typo_tokens_threshold']: 3, ['num_typos']: 2 })) as never,
      }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('num_typos');
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test.each(['filter_by', 'filterBy', 'FILTER_BY', 'include_fields', 'query_by', 'preset'])(
    'with an allowlist, the row and field parameter %s is still refused',
    async (name) => {
      const { controller, dataSource } = allowing();

      const error = await refusal(
        controller['search']({
          context: fakeContext(keyword({ ['typo_tokens_threshold']: 3, [name]: 'x' })) as never,
        }),
      );

      expect(error.statusCode).toBe(400);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    },
  );

  test('the same name in another spelling is the same name', async () => {
    const { controller, dataSource } = allowing();

    await controller['search']({
      context: fakeContext(keyword({ typoTokensThreshold: 3 })) as never,
    });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });
});

describe('multi-search on an unscoped controller', () => {
  const entry = (engineParams?: Record<string, unknown>) => ({
    collection: 'products',
    query: 'foo',
    queryBy: ['title'],
    ...(engineParams === undefined ? {} : { engineParams }),
  });

  test('refuses engineParams in any entry', async () => {
    const { controller } = build({ isRawAllowed: true });

    const error = await refusal(
      controller['multiSearch']({
        context: fakeContext({
          searches: [entry(), entry({ ['filter_by']: 'isActive:=false' })],
        }) as never,
      }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('engineParams is not available on this search controller');
  });

  /** The fake engine refuses every multi-search with this message: seeing it means the request got past the engineParams check. */
  const REACHED_THE_ENGINE = 'Not needed for this test';

  test('an entry without engineParams is not affected: the request reaches the engine', async () => {
    const { controller } = build({ isRawAllowed: true });

    const error = await refusal(
      controller['multiSearch']({ context: fakeContext({ searches: [entry()] }) as never }),
    );

    expect(error.message).toContain(REACHED_THE_ENGINE);
  });

  test('with an allowlist, an allowed entry parameter passes and the others are refused', async () => {
    const { controller } = build({ allow: ['typo_tokens_threshold'], isRawAllowed: true });

    const passed = await refusal(
      controller['multiSearch']({
        context: fakeContext({
          searches: [entry({ ['typo_tokens_threshold']: 1 })],
        }) as never,
      }),
    );
    const refused = await refusal(
      controller['multiSearch']({
        context: fakeContext({ searches: [entry({ ['sort_by']: 'price:asc' })] }) as never,
      }),
    );

    expect(passed.message).toContain(REACHED_THE_ENGINE);
    expect(refused.statusCode).toBe(400);
    expect(refused.message).toContain('engineParams');
  });
});

describe('the server keeps engineParams on the repository call', () => {
  test('repository.search passes engineParams to the engine, with no allowlist', async () => {
    sequence += 1;
    const dataSource = new EngineParamsDataSource({
      name: `engine-params-ds-${sequence}`,
      config: {},
    });
    const repositoryInstance = new EngineParamsProductRepository(dataSource);

    await repositoryInstance.search({
      mode: SearchModes.KEYWORD,
      query: 'foo',
      queryBy: ['title'],
      engineParams: { ['num_typos']: 1 },
    } as never);

    const params = (dataSource.fakeConnector.searchCalls.at(-1)?.params ?? {}) as Record<
      string,
      unknown
    >;
    expect(params['num_typos']).toBe(1);
  });
});

describe('an allowlist is validated when the controller is defined', () => {
  const define = (allow: unknown) =>
    SearchControllerFactory.defineSearchController({
      entity: ProductDocument,
      repository: { name: EngineParamsProductRepository.name },
      controller: { name: 'AllowlistProbe', basePath: '/products' },
      engineParams: { allow: allow as string[] },
    });

  test.each([
    'filter_by',
    'filterBy',
    'include_fields',
    'exclude_fields',
    'query_by',
    'facet_by',
    'group_by',
    'highlight_fields',
    'sort_by',
    'preset',
    'attributesToRetrieve',
    'filter',
  ])('%s can never be allowed: the definition throws', (name) => {
    expect(() => define([name])).toThrow(/can never be allowed/);
  });

  test('a list that is not a list, and an entry that is not a name, throw', () => {
    expect(() => define('typo_tokens_threshold')).toThrow(/must be a list/);
    expect(() => define([''])).toThrow(/engineParams\.allow holds/);
    expect(() => define([5])).toThrow(/engineParams\.allow holds/);
  });

  test('an empty list is the same as none', () => {
    expect(SearchEngineParams.resolveAllowlist({ scope: 's', allow: [] }).size).toBe(0);
  });

  test('a list of tuning names is accepted', () => {
    expect(() =>
      define(['typo_tokens_threshold', 'num_typos', 'drop_tokens_threshold']),
    ).not.toThrow();
  });
});
