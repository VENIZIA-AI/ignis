// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import {
  controller as controllerDecorator,
  CrudControllerFactory,
  repository,
  model,
} from '@venizia/ignis-kernel';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchModes } from '@/search/core/repositories/common';
import { BaseSearchEntity, SearchCollectionFactory, field } from '@/search/core/models';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import {
  FakeSearchDataSource,
  ProductDocument,
  type TProductDocument,
} from '../repositories/fake-search-connector';

/**
 * A search request's own filter cannot name a field the model hides: its `where` and `order` answer 400 and the engine is not
 * reached. The model `ProductDocument` hides `secret`. Server code calling the repository is not held to it.
 */

class HiddenFilterDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: HiddenFilterDataSource })
class HiddenFilterProductRepository extends DefaultSearchRepository<TProductDocument> {}

// A model that hides one nested field of a dotted document (`meta.pin`), as an engine with nested fields reads it.
@model({
  type: 'entity',
  tableName: 'hidden_filter_nested_docs',
  settings: { properties: { hidden: ['meta.pin'] } },
})
class HiddenFilterNestedDocument extends BaseSearchEntity {
  static override schema = SearchCollectionFactory.define({
    name: 'hidden_filter_nested_docs',
    fields: [
      field.string('title', { searchable: true }),
      field.string('meta.pin'),
      field.string('meta.other'),
      field.string('status'),
    ],
  });
}

@repository({ model: HiddenFilterNestedDocument, dataSource: HiddenFilterDataSource })
class HiddenFilterNestedRepository extends DefaultSearchRepository {}

const fakeContext = <TInput>(input: TInput) => ({
  req: { valid: () => input, header: () => undefined },
  header: () => undefined,
  json: (body: unknown) => body,
});

let sequence = 0;

const build = (opts: { scope?: () => unknown } = {}) => {
  sequence += 1;
  const dataSource = new HiddenFilterDataSource({
    name: `hidden-filter-ds-${sequence}`,
    config: {},
  });
  const repositoryInstance = new HiddenFilterProductRepository(dataSource);

  const Controller = SearchControllerFactory.defineSearchController({
    entity: ProductDocument,
    repository: { name: HiddenFilterProductRepository.name },
    controller: { name: `HiddenFilterController${sequence}`, basePath: '/products' },
    routes: opts.scope ? { multiSearch: { enabled: false } } : undefined,
    scope: opts.scope as never,
  });

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

const keyword = (filter?: Record<string, unknown>) => ({
  mode: SearchModes.KEYWORD,
  query: 'foo',
  queryBy: ['title'],
  ...(filter === undefined ? {} : { filter }),
});

describe.each([
  ['an unscoped controller', () => build()],
  ['a scoped controller', () => build({ scope: () => ({ status: 'm-a' }) })],
])('%s', (_name, make) => {
  test.each([
    ['a where', { where: { secret: 'x' } }],
    ['a where operator', { where: { secret: { neq: 'x' } } }],
    ['a where in an or', { where: { or: [{ title: 'a' }, { secret: 'x' }] } }],
    ['an order', { order: ['secret DESC'] }],
  ])(
    'refuses %s on the hidden field with 400, and the engine is not reached',
    async (_label, filter) => {
      const { controller, dataSource } = make();

      const error = await refusal(
        controller['search']({ context: fakeContext(keyword(filter)) as never }),
      );

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Field NOT FOUND');
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    },
  );

  test('serves a filter on a visible field', async () => {
    const { controller, dataSource } = make();

    await controller['search']({
      context: fakeContext(keyword({ where: { title: 'lamp' }, order: ['title ASC'] })) as never,
    });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });
});

describe('server code', () => {
  test('repository.search filters and sorts on a hidden field', async () => {
    const { repositoryInstance, dataSource } = build();

    await repositoryInstance.search({
      mode: SearchModes.KEYWORD,
      query: 'foo',
      queryBy: ['title'],
      filter: { where: { secret: 'x' }, order: ['secret DESC'] },
    } as never);

    const params = (dataSource.fakeConnector.searchCalls.at(-1)?.params ?? {}) as Record<
      string,
      unknown
    >;
    expect(String(params['filter_by'])).toContain('secret');
  });
});

/** The refusal of a hidden field is the text the engine's dialect gives for a field the collection does not declare. */
describe('byte for byte the error of an undeclared field', () => {
  const failure = async (body: object, entity: 'product' | 'nested' = 'product') => {
    sequence += 1;
    const dataSource = new HiddenFilterDataSource({
      name: `hidden-filter-bytes-${sequence}`,
      config: {},
    });
    const isNested = entity === 'nested';
    const repositoryInstance = isNested
      ? new HiddenFilterNestedRepository(dataSource)
      : new HiddenFilterProductRepository(dataSource);
    const Controller = SearchControllerFactory.defineSearchController({
      entity: isNested ? HiddenFilterNestedDocument : ProductDocument,
      repository: {
        name: isNested ? HiddenFilterNestedRepository.name : HiddenFilterProductRepository.name,
      },
      controller: { name: `HiddenFilterBytes${sequence}`, basePath: '/x' },
    });
    const controller = new Controller(repositoryInstance as never);

    return refusal(controller['search']({ context: fakeContext(body) as never }));
  };

  test.each([
    ['where', { where: { secret: 'x' } }],
    ['where, in an or', { where: { or: [{ secret: 'x' }] } }],
    ['where, in an and given as an object', { where: { and: { secret: 'x' } } }],
    ['order', { order: ['secret DESC'] }],
  ])('a hidden field in the %s', async (_name, filter) => {
    const hidden = await failure(keyword(filter));
    const undeclared = await failure(
      keyword(JSON.parse(JSON.stringify(filter).replaceAll('secret', 'nope'))),
    );

    expect(hidden.statusCode).toBe(undeclared.statusCode);
    expect(hidden.message).toBe(undeclared.message.replaceAll('nope', 'secret'));
    expect(hidden.message).toContain('Field NOT FOUND');
    expect(hidden.message).not.toContain('hidden');
  });
});

describe('a hidden nested field', () => {
  const run = async (filter: Record<string, unknown>) => {
    sequence += 1;
    const dataSource = new HiddenFilterDataSource({
      name: `hidden-filter-nested-${sequence}`,
      config: {},
    });
    const Controller = SearchControllerFactory.defineSearchController({
      entity: HiddenFilterNestedDocument,
      repository: { name: HiddenFilterNestedRepository.name },
      controller: { name: `HiddenFilterNested${sequence}`, basePath: '/x' },
    });
    const controller = new Controller(new HiddenFilterNestedRepository(dataSource) as never);

    await controller['search']({ context: fakeContext(keyword(filter)) as never });

    return dataSource;
  };

  test.each([
    ['the field itself', 'meta.pin'],
    ['the field with a deeper path', 'meta.pin.x'],
    ['the parent object, which holds it', 'meta'],
  ])(
    'is refused by %s, in a where and in an order, and the engine is not reached',
    async (_name, key) => {
      for (const filter of [{ where: { [key]: '1111' } }, { order: [`${key} DESC`] }]) {
        const error = await refusal(run(filter));

        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('NOT FOUND');
      }
    },
  );

  test('a sibling field, and a name that only shares the prefix, are served', async () => {
    const dataSource = await run({ where: { 'meta.other': 'x' }, order: ['meta.other ASC'] });

    expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
  });
});

describe('a CRUD controller over a search repository', () => {
  test('refuses a hidden field in the count where, and the engine is not reached', async () => {
    sequence += 1;
    const dataSource = new HiddenFilterDataSource({
      name: `hidden-filter-crud-${sequence}`,
      config: {},
    });
    const Controller = CrudControllerFactory.build({
      repository: HiddenFilterNestedRepository,
      routes: { count: true },
    });

    @controllerDecorator({ path: '/x' })
    class HiddenFilterCrudController extends Controller {}

    const crudController = new HiddenFilterCrudController(
      new HiddenFilterNestedRepository(dataSource),
    );

    expect(() =>
      crudController.assertRequestFilter({ filter: { where: { 'meta.pin': '1111' } } }),
    ).toThrow('NOT FOUND');
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });
});
