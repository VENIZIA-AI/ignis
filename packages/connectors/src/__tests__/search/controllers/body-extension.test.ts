// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, spyOn, test } from 'bun:test';
import { z } from '@hono/zod-openapi';

import { repository, controller as controllerDecorator } from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import {
  FakeSearchDataSource,
  ProductDocument,
  type TProductDocument,
} from '../repositories/fake-search-connector';

class BodyExtensionDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: BodyExtensionDataSource })
class BodyExtensionProductRepository extends DefaultSearchRepository<TProductDocument> {}

let sequence = 0;

const answerErrors = (router: { onError: (handler: never) => unknown }) =>
  router.onError(((error: { name?: string; statusCode?: number; message: string }, context: any) =>
    context.json(
      { error: String(error.message) },
      error.statusCode ?? (error.name === 'ZodError' ? 400 : 500),
    )) as never);

const mount = async (opts: { extend?: boolean } = {}) => {
  sequence += 1;
  const dataSource = new BodyExtensionDataSource({
    name: `body-extension-ds-${sequence}`,
    config: {},
  });
  dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] } as never;
  const seen: Array<{ ids: string[]; mode: string }> = [];

  const BuiltController = opts.extend
    ? SearchControllerFactory.build({
        repository: BodyExtensionProductRepository,
        routes: { search: true },
        request: { body: { extend: { ids: z.array(z.string().min(1)).max(3) } } },
        // `input.ids` is a string[] only because the controller's own `extend` says so.
        scope: ({ input }) => {
          seen.push({ ids: input.ids, mode: input.mode });

          return { status: { inq: input.ids } };
        },
      })
    : SearchControllerFactory.build({
        repository: BodyExtensionProductRepository,
        routes: { search: true },
        scope: () => ({ status: 'active' }),
      });

  @controllerDecorator({ path: '/products' })
  class Controller extends BuiltController {}

  const repositoryInstance = new BodyExtensionProductRepository(dataSource);
  const controller = new Controller(repositoryInstance);
  await controller.configure();
  const router = controller.getRouter();
  answerErrors(router);

  return { router, dataSource, seen, repositoryInstance };
};

/** The `filter_by` of the last search the engine saw. */
const lastFilterBy = (dataSource: BodyExtensionDataSource) => {
  const params = (dataSource.fakeConnector.searchCalls.at(-1)?.params ?? {}) as Record<
    string,
    unknown
  >;

  return String(params['filter_by']);
};

const post = async (opts: {
  router: Awaited<ReturnType<typeof mount>>['router'];
  body: unknown;
}) => {
  const response = await opts.router.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts.body),
  });

  const text = await response.text();

  return { status: response.status, text };
};

describe('SearchControllerFactory - request.body.extend', () => {
  test('an extra key reaches the scope, typed from the extension, in every mode it can be searched in', async () => {
    const { router, dataSource, seen } = await mount({ extend: true });

    const answered = await post({
      router,
      body: { mode: 'keyword', query: 'foo', ids: ['a', 'b'] },
    });

    expect(answered.status).toBe(200);
    expect(seen).toEqual([{ ids: ['a', 'b'], mode: 'keyword' }]);
    expect(lastFilterBy(dataSource)).toContain('status');
  });

  test('an invalid extra value is a 400 and the engine is not asked', async () => {
    const { router, dataSource, seen } = await mount({ extend: true });

    for (const ids of [['a', ''], 'a', ['a', 'b', 'c', 'd'], undefined]) {
      const answered = await post({ router, body: { mode: 'keyword', query: 'foo', ids } });

      expect(answered.status).toBe(400);
    }

    expect(seen).toEqual([]);
    expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
  });

  test('the extra key is validated for raw too, so the type holds for every mode', async () => {
    const { router } = await mount({ extend: true });
    const answered = await post({ router, body: { mode: 'raw', params: {} } });

    expect(answered.status).toBe(400);
  });

  test('the OpenAPI document shows the extra key on every mode', async () => {
    const { router } = await mount({ extend: true });
    const document = router.getOpenAPIDocument({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
    });
    const text = JSON.stringify(document.paths);

    expect(text).toContain('"ids"');
    expect(text.split('"ids"').length - 1).toBeGreaterThanOrEqual(4);
  });

  test('the OpenAPI document keeps the description of every mode', async () => {
    const { router } = await mount({ extend: true });
    const text = JSON.stringify(
      router.getOpenAPIDocument({ openapi: '3.0.0', info: { title: 't', version: '1' } }).paths,
    );

    for (const description of [
      'Keyword full-text search',
      'Vector / semantic search',
      'Hybrid keyword + vector search',
      'Raw engine passthrough',
    ]) {
      expect(text, description).toContain(description);
    }
  });

  test('the extra keys stop at the scope: the repository never receives them', async () => {
    const { router, repositoryInstance, seen } = await mount({ extend: true });
    const received: unknown[] = [];
    const original = repositoryInstance.search.bind(repositoryInstance);
    spyOn(repositoryInstance, 'search').mockImplementation((input: never) => {
      received.push(input);

      return original(input);
    });

    const answered = await post({ router, body: { mode: 'keyword', query: 'foo', ids: ['a'] } });

    expect(answered.status).toBe(200);
    expect(seen.length).toBe(1);
    expect(received.length).toBe(1);
    expect(Object.keys(received[0] as object)).not.toContain('ids');
    expect((received[0] as { query?: string }).query).toBe('foo');
  });

  test('no option: the body is the base body, an unknown key is dropped, and a scope still works', async () => {
    const { router, dataSource } = await mount();
    const document = router.getOpenAPIDocument({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
    });

    expect(JSON.stringify(document.paths)).not.toContain('"ids"');

    const answered = await post({ router, body: { mode: 'keyword', query: 'foo', ids: ['a'] } });

    expect(answered.status).toBe(200);
    expect(lastFilterBy(dataSource)).toContain('active');
  });

  test('a key the base body already has is refused when the controller is built', () => {
    expect(() =>
      SearchControllerFactory.build({
        repository: BodyExtensionProductRepository,
        routes: { search: true },
        request: { body: { extend: { query: z.string() } } },
      }),
    ).toThrow(/already has/);
  });
});
