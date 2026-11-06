import { beforeEach, describe, expect, test } from 'bun:test';
import { ReadableSearchRepository, SearchModes } from '@/search/typesense/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

/**
 * A field list reaches the engine as one comma-joined string, so a hidden field can ride inside an element that looks like
 * a single allowed name. Every part of every list is checked.
 */
describe('the hidden-field check reads each part of a comma-joined list', () => {
  let dataSource: FakeSearchDataSource;
  let repository: ReadableSearchRepository;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'hidden-lists-ds', config: {} });
    repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  const refusal = async (task: Promise<unknown>): Promise<string> => {
    try {
      await task;
    } catch (error) {
      return (error as Error).message;
    }

    return '';
  };

  test.each([
    ['facetBy', { facetBy: ['title,secret'] }],
    ['facetBy', { facetBy: ['title, secret'] }],
    ['facetBy', { facetBy: ['secret'] }],
    ['groupBy', { groupBy: ['title,secret'] }],
    ['queryBy', { queryBy: ['title,secret'] }],
    ['queryBy', { queryBy: ['title', ' secret '] }],
    ['highlightFields', { highlightFields: ['title,secret'] }],
    ['highlightFullFields', { highlightFullFields: ['secret,title'] }],
  ])('%s: %j is refused and nothing reaches the engine', async (param, extra) => {
    const message = await refusal(
      repository.search({ mode: SearchModes.KEYWORD, query: 'a', ...extra }),
    );

    expect(message).toContain(`'${param}' names a hidden field`);
    expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
  });

  test.each([SearchModes.SEMANTIC, SearchModes.HYBRID])(
    '%s: a vector field list that names a hidden field is refused',
    async (mode) => {
      const message = await refusal(
        repository.search({
          mode,
          query: 'a',
          queryBy: ['title'],
          vectorField: 'embedding,secret',
          nearVector: [0.1],
        } as never),
      );

      expect(message).toContain("'vectorField' names a hidden field");
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    },
  );

  test('a facetQuery that names several fields is refused', async () => {
    const message = await refusal(
      repository.search({
        mode: SearchModes.KEYWORD,
        query: 'a',
        facetBy: ['title'],
        facetQuery: 'title,secret:x',
      }),
    );

    expect(message).toContain("'facetQuery' names a hidden field");
  });

  test('a list of visible fields still goes through, joined as before', async () => {
    await repository.search({
      mode: SearchModes.KEYWORD,
      query: 'a',
      queryBy: ['title', 'brand'],
      facetBy: ['brand', 'title'],
    });

    const [call] = dataSource.fakeConnector.searchCalls;
    const params = call.params as Record<string, unknown>;

    expect(params['query_by']).toBe('title,brand');
    expect(params['facet_by']).toBe('brand,title');
  });
});
