// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { z } from 'zod';
import { describe, expect, test } from 'bun:test';

import { repository, controller as controllerDecorator } from '@venizia/ignis-kernel';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchRawAccess } from '@/search/core/controllers/raw-access';
import { SearchModes } from '@/search/core/repositories/common';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import {
  FakeSearchDataSource,
  ProductDocument,
  type TProductDocument,
} from '../repositories/fake-search-connector';

/**
 * `mode: 'raw'` and multi-search hand the engine their parameters as they are: the model's default filter and hidden fields
 * do not apply to them. Over HTTP every search controller refuses both (400) unless `modes.raw` is `{ use: true }`.
 */

// `FakeSearchEngineHelper.multiSearch()` returns `Promise<never>`, which no subclass override can widen, so a recorder is patched onto the fake instance.
class RawAccessDataSource extends FakeSearchDataSource {
  multiSearchCalls: unknown[] = [];

  constructor(opts: { name: string; config?: {} }) {
    super(opts);

    (this.fakeConnector as any).multiSearch = async (searchOpts: unknown) => {
      this.multiSearchCalls.push(searchOpts);

      return { results: [] };
    };
  }
}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: RawAccessDataSource })
class RawAccessProductRepository extends DefaultSearchRepository<TProductDocument> {}

const fakeContext = <TInput>(input: TInput) => ({
  req: { valid: () => input, header: () => undefined },
  header: () => undefined,
  json: (body: unknown) => body,
});

let sequence = 0;

const build = (opts: { modes?: unknown; scope?: () => unknown }) => {
  sequence += 1;
  const dataSource = new RawAccessDataSource({ name: `raw-access-ds-${sequence}`, config: {} });
  const repositoryInstance = new RawAccessProductRepository(dataSource);

  const BuiltController = SearchControllerFactory.build({
    repository: RawAccessProductRepository,
    routes: opts.scope
      ? { search: { use: true } }
      : { search: { use: true }, multiSearch: { use: true } },
    authenticate: { skip: true },
    scope: opts.scope as never,
    modes: opts.modes as never,
  });

  @controllerDecorator({ path: '/products' })
  class Controller extends BuiltController {}

  return { controller: new Controller(repositoryInstance), dataSource, repositoryInstance };
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

const RAW = { mode: SearchModes.RAW, params: { q: '*' } };
const KEYWORD = { mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] };
const MULTI = { searches: [{ collection: 'products', query: 'foo' }] };

describe('an unscoped controller that did not opt in', () => {
  test.each([
    ['no modes', undefined, false],
    ['modes without raw', {}, false],
    ['use: false', { raw: { use: false } }, false],
    ['use: true', { raw: { use: true } }, true],
  ])("lists mode 'raw' in the body schema only when it is on (%s)", (_name, modes, isListed) => {
    const { controller } = build({ modes });
    const config = controller.definitions.SEARCH;
    const body = config.request?.body;
    const content = body && 'content' in body ? body.content['application/json'] : undefined;
    const schema = content && 'schema' in content ? content.schema : undefined;

    if (!(schema instanceof z.ZodType)) {
      throw new Error('the search body has no zod schema');
    }

    expect(schema.safeParse(RAW).success).toBe(isListed);
    expect(schema.safeParse(KEYWORD).success).toBe(true);
  });

  test('refuses multi-search with 400, and the engine is not reached', async () => {
    const { controller, dataSource } = build({});

    const error = await refusal(
      controller['multiSearch']({ context: fakeContext(MULTI) as never }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('multi-search is not available on this search controller');
    expect(dataSource.multiSearchCalls).toHaveLength(0);
  });

  test('still serves the neutral modes', async () => {
    const { controller, dataSource } = build({});

    await controller['search']({ context: fakeContext(KEYWORD) as never });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });
});

describe('a controller that opts in with modes.raw', () => {
  test("serves mode 'raw' and multi-search", async () => {
    const { controller, dataSource } = build({ modes: { raw: { use: true } } });

    await controller['search']({ context: fakeContext(RAW) as never });
    await controller['multiSearch']({ context: fakeContext(MULTI) as never });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
    expect(dataSource.multiSearchCalls).toHaveLength(1);
  });

  test('the check of engineParams still applies', async () => {
    const { controller } = build({ modes: { raw: { use: true } } });

    const error = await refusal(
      controller['search']({
        context: fakeContext({ ...KEYWORD, engineParams: { ['filter_by']: 'x' } }) as never,
      }),
    );

    expect(error.message).toContain('engineParams is not available on this search controller');
  });
});

describe('a scoped controller', () => {
  test("refuses mode 'raw' as before", async () => {
    const { controller } = build({ scope: () => ({ status: 'm-a' }) });

    const error = await refusal(controller['search']({ context: fakeContext(RAW) as never }));

    expect(error.statusCode).toBe(400);
  });

  test('cannot opt in: the definition throws', () => {
    expect(() =>
      build({ scope: () => ({ status: 'm-a' }), modes: { raw: { use: true } } }),
    ).toThrow(/cannot allow mode 'raw'/);
  });
});

describe('server code keeps raw on the repository call', () => {
  test("repository.search({ mode: 'raw' }) reaches the engine whatever the controller allows", async () => {
    const { repositoryInstance, dataSource } = build({});

    await repositoryInstance.search(RAW as never);

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });
});

describe('modes.raw is read when the controller is defined', () => {
  test('only { use: true } opens it', () => {
    expect(SearchRawAccess.resolve({ scope: 's', raw: { use: true }, isScoped: false })).toBe(true);
    expect(SearchRawAccess.resolve({ scope: 's', raw: { use: false }, isScoped: false })).toBe(
      false,
    );
    expect(SearchRawAccess.resolve({ scope: 's', raw: undefined, isScoped: false })).toBe(false);
  });
});
