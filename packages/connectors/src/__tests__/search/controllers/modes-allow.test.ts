// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { repository, controller as controllerDecorator } from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchModes } from '@/search/core/repositories/common';
import { DefaultSearchRepository } from '@/search/typesense/repositories';
import {
  FakeSearchDataSource,
  ProductDocument,
  type TProductDocument,
} from '../repositories/fake-search-connector';

/**
 * `modes.allow` through the real router: the body schema is the one source, so the validator refuses a mode that is not
 * listed and the OpenAPI document shows only the listed ones. `raw` is in both only when `modes.raw` is on.
 */

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: FakeSearchDataSource })
class ModesAllowProductRepository extends DefaultSearchRepository<TProductDocument> {}

let sequence = 0;

const answerErrors = (router: Pick<OpenAPIHono, 'onError'>) =>
  router.onError((error, context) => {
    const { statusCode, status, name } = error as {
      statusCode?: number;
      status?: number;
      name?: string;
    };

    return context.json(
      { error: String(error.message) },
      (statusCode ?? status ?? (name === 'ZodError' ? 400 : 500)) as never,
    );
  });

const mount = async (opts: { modes?: unknown }) => {
  sequence += 1;

  const dataSource = new FakeSearchDataSource({ name: `modes-allow-ds-${sequence}`, config: {} });
  dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] } as never;

  const BuiltController = SearchControllerFactory.build({
    repository: ModesAllowProductRepository,
    routes: { search: { use: true } },
    authenticate: { skip: true },
    modes: opts.modes as never,
  });

  @controllerDecorator({ path: '/products' })
  class Controller extends BuiltController {}

  const controller = new Controller(new ModesAllowProductRepository(dataSource));
  await controller.configure();

  const router = controller.getRouter();
  answerErrors(router);

  return { router, dataSource };
};

const BODIES = {
  keyword: { mode: SearchModes.KEYWORD, query: 'foo', queryBy: ['title'] },
  semantic: { mode: SearchModes.SEMANTIC, vectorField: 'embedding', nearVector: [0.1, 0.2] },
  hybrid: {
    mode: SearchModes.HYBRID,
    query: 'foo',
    queryBy: ['title'],
    vectorField: 'embedding',
    nearVector: [0.1, 0.2],
  },
  raw: { mode: SearchModes.RAW, params: { q: '*' } },
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

  return response.status;
};

const documentText = (router: Awaited<ReturnType<typeof mount>>['router']) =>
  JSON.stringify(
    router.getOpenAPIDocument({ openapi: '3.0.0', info: { title: 't', version: '1' } }).paths,
  );

const DESCRIPTIONS = {
  keyword: 'Keyword full-text search',
  semantic: 'Vector / semantic search',
  hybrid: 'Hybrid keyword + vector search',
  raw: 'Raw engine passthrough',
};

describe('modes.allow left out', () => {
  test('serves keyword, semantic and hybrid, refuses raw, and the document lists those three', async () => {
    const { router } = await mount({});

    const result = await post({ router, body: BODIES.keyword });
    expect(result).toBe(200);
    const result2 = await post({ router, body: BODIES.semantic });
    expect(result2).toBe(200);
    const result3 = await post({ router, body: BODIES.hybrid });
    expect(result3).toBe(200);
    const result4 = await post({ router, body: BODIES.raw });
    expect(result4).toBe(400);

    const text = documentText(router);

    expect(text).toContain(DESCRIPTIONS.keyword);
    expect(text).toContain(DESCRIPTIONS.semantic);
    expect(text).toContain(DESCRIPTIONS.hybrid);
    expect(text).not.toContain(DESCRIPTIONS.raw);
  });
});

describe('modes.allow: [keyword]', () => {
  test('the validator refuses every other mode and the engine is not reached', async () => {
    const { router, dataSource } = await mount({ modes: { allow: [SearchModes.KEYWORD] } });

    const result = await post({ router, body: BODIES.keyword });
    expect(result).toBe(200);

    const reached = dataSource.fakeConnector.searchCalls.length;

    const result2 = await post({ router, body: BODIES.semantic });
    expect(result2).toBe(400);
    const result3 = await post({ router, body: BODIES.hybrid });
    expect(result3).toBe(400);
    const result4 = await post({ router, body: BODIES.raw });
    expect(result4).toBe(400);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(reached);
  });

  test('the OpenAPI document lists keyword only', async () => {
    const { router } = await mount({ modes: { allow: [SearchModes.KEYWORD] } });
    const text = documentText(router);

    expect(text).toContain(DESCRIPTIONS.keyword);
    expect(text).not.toContain(DESCRIPTIONS.semantic);
    expect(text).not.toContain(DESCRIPTIONS.hybrid);
    expect(text).not.toContain(DESCRIPTIONS.raw);
  });
});

describe('modes.allow with modes.raw', () => {
  test('serves the listed modes and raw, and nothing else; the document follows', async () => {
    const { router } = await mount({
      modes: { allow: [SearchModes.KEYWORD, SearchModes.HYBRID], raw: { use: true } },
    });

    const result = await post({ router, body: BODIES.keyword });
    expect(result).toBe(200);
    const result2 = await post({ router, body: BODIES.hybrid });
    expect(result2).toBe(200);
    const result3 = await post({ router, body: BODIES.raw });
    expect(result3).toBe(200);
    const result4 = await post({ router, body: BODIES.semantic });
    expect(result4).toBe(400);

    const text = documentText(router);

    expect(text).toContain(DESCRIPTIONS.keyword);
    expect(text).toContain(DESCRIPTIONS.hybrid);
    expect(text).toContain(DESCRIPTIONS.raw);
    expect(text).not.toContain(DESCRIPTIONS.semantic);
  });
});

describe('modes.allow is checked when the controller is built', () => {
  test.each([
    ['an empty list', [], 'non-empty list'],
    ['a duplicate', ['keyword', 'keyword'], 'twice'],
    ['raw, which is its own toggle', ['raw'], 'modes.raw'],
    ['an unknown name', ['fuzzy'], 'cannot allow'],
    ['something that is not a list', 'keyword', 'non-empty list'],
  ])('%s is refused', (_name, allow, message) => {
    expect(() =>
      SearchControllerFactory.build({
        repository: ModesAllowProductRepository,
        routes: { search: { use: true } },
        authenticate: { skip: true },
        modes: { allow } as never,
      }),
    ).toThrow(message);
  });
});

describe('modes.allow is typed from the mode names', () => {
  test('a typo does not compile', () => {
    // Never called: the type error is the test.
    const typo = () =>
      SearchControllerFactory.build({
        repository: ModesAllowProductRepository,
        routes: { search: { use: true } },
        authenticate: { skip: true },
        // @ts-expect-error 'keywords' is not a mode name
        modes: { allow: ['keywords'] },
      });

    expect(typeof typo).toBe('function');
  });
});
