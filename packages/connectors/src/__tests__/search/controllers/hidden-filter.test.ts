// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import { repository } from '@venizia/ignis-kernel';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { SearchModes } from '@/search/core/repositories/common';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import { FakeSearchDataSource, ProductDocument } from '../repositories/fake-search-connector';

/**
 * A search request's own filter cannot name a field the model hides: its `where` and `order` answer 400 and the engine is not
 * reached. The model `ProductDocument` hides `secret`. Server code calling the repository is not held to it.
 */

class HiddenFilterDataSource extends FakeSearchDataSource {}

// Distinctly named: the model registry is keyed by class name across the whole test process.
@repository({ model: ProductDocument, dataSource: HiddenFilterDataSource })
class HiddenFilterProductRepository extends DefaultSearchRepository {}

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
      expect(error.message).toContain('Column NOT FOUND');
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
