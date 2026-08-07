import { describe, expect, test } from 'bun:test';
import { makeHelper } from './fake-client';
import { expectRejection } from '@/__tests__/rejection.helper';

/**
 * `/multi_search` is the single transport: `search()` is its arity-1 case and `multiSearch()` its
 * general one. The two share the transport and NOT the policy, which is what these tests pin.
 *
 * The transport exists because GET single-search caps its query string near 4000 characters, so a
 * `filter_by` built from an authorization scope stopped working somewhere around ninety ids - the
 * user could not search at all. Choosing per request would mean deciding on URL length, which is
 * only knowable after building the query; there is no decision point now, so none can be wrong.
 */

/** A Typesense-shaped response carrying `count` hits. */
const responseWith = (opts: {
  count: number;
  found?: number;
  cutoff?: boolean;
  timeMs?: number;
}) => {
  const { count, found, cutoff, timeMs } = opts;
  const response: Record<string, unknown> = {
    found: found ?? count,
    hits: Array.from({ length: count }, (_unused, index) => ({ document: { id: String(index) } })),
  };

  response['out_of'] = found ?? count;

  if (cutoff !== undefined) {
    response['search_cutoff'] = cutoff;
  }

  if (timeMs !== undefined) {
    response['search_time_ms'] = timeMs;
  }

  return response;
};

const entriesOf = (fake: { calls: Array<{ op: string; args: unknown[] }> }) => {
  const call = fake.calls.find(entry => entry.op === 'multiSearch.perform');
  return ((call?.args[0] as { searches?: Record<string, unknown>[] })?.searches ?? []) as Record<
    string,
    unknown
  >[];
};

const callCount = (fake: { calls: Array<{ op: string }> }) =>
  fake.calls.filter(call => call.op === 'multiSearch.perform').length;

describe('search() - one collection is the arity-1 case of the transport', () => {
  test('a page within the ceiling sends ONE entry and passes params through untouched', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 2 }) });

    await helper.search({ collection: 'products', params: { q: 'shoe', ['per_page']: 10 } });

    // Byte-identical params matter most for `mode: 'raw'`, which hands the caller's own engine
    // params straight through - only a page the engine would have refused gets rewritten.
    expect(entriesOf(fake)).toEqual([{ q: 'shoe', ['per_page']: 10, collection: 'products' }]);
  });

  test('the whole query travels in the request BODY, so no length ceiling applies', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 0 }) });

    // uuid-shaped on purpose: this is the authorization-scope filter that broke the GET path, and
    // a uuid costs ~39 characters once quoted and comma-joined, so 120 of them clear 4000.
    const ids = Array.from(
      { length: 120 },
      (_unused, index) => `\`3f2504e0-4f89-11d3-9a0c-${String(index).padStart(12, '0')}\``,
    ).join(',');

    await helper.search({
      collection: 'products',
      params: { q: '*', ['filter_by']: `organizerId:=[${ids}]` },
    });

    const [entry] = entriesOf(fake);
    expect(String(entry['filter_by']).length).toBeGreaterThan(4000);
  });
});

describe('search() - window splitting', () => {
  test('a page over 250 becomes consecutive windows of ONE call', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 250, found: 600 }) });

    await helper.search({ collection: 'products', params: { q: '*', ['per_page']: 600 } });

    expect(callCount(fake)).toBe(1);
    expect(entriesOf(fake).map(entry => [entry['offset'], entry['limit']])).toEqual([
      [0, 250],
      [250, 250],
      [500, 100],
    ]);
  });

  test('windows carry offset/limit only - never both pagination pairs', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 250 }) });

    await helper.search({ collection: 'products', params: { q: '*', ['per_page']: 300, page: 2 } });

    for (const entry of entriesOf(fake)) {
      expect(entry['per_page']).toBeUndefined();
      expect(entry['page']).toBeUndefined();
      expect(typeof entry['offset']).toBe('number');
      expect(typeof entry['limit']).toBe('number');
    }
  });

  test("windows start from the caller's own offset", async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 250 }) });

    await helper.search({ collection: 'products', params: { q: '*', offset: 1000, limit: 400 } });

    expect(entriesOf(fake).map(entry => entry['offset'])).toEqual([1000, 1250]);
  });

  test('hits from every window are concatenated in order', async () => {
    const { helper } = makeHelper({ searchResult: responseWith({ count: 250, found: 500 }) });

    const result = await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500 },
    });

    expect(result.hits).toHaveLength(500);
    expect(result.found).toBe(500);
  });
});

describe('search() - merge semantics', () => {
  test('isFoundExact is AND-folded: one cut-off window makes the whole total an estimate', async () => {
    const { helper } = makeHelper({
      multiSearchResult: {
        results: [
          responseWith({ count: 250, found: 500, cutoff: false }),
          responseWith({ count: 250, found: 500, cutoff: true }),
        ],
      },
    });

    const result = await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500 },
    });

    expect(result.isFoundExact).toBe(false);
  });

  test('every window exact -> the merged total is exact', async () => {
    const { helper } = makeHelper({
      multiSearchResult: {
        results: [
          responseWith({ count: 250, found: 500 }),
          responseWith({ count: 250, found: 500 }),
        ],
      },
    });

    const result = await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500 },
    });

    expect(result.isFoundExact).toBe(true);
  });

  test('searchTimeMs is the SLOWEST window, not the sum - the field is read as latency', async () => {
    const { helper } = makeHelper({
      multiSearchResult: {
        results: [
          responseWith({ count: 250, found: 500, timeMs: 12 }),
          responseWith({ count: 250, found: 500, timeMs: 30 }),
        ],
      },
    });

    const result = await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500 },
    });

    expect(result.searchTimeMs).toBe(30);
  });

  test('facetCounts come from the first window only - facets cover the whole result set', async () => {
    const facet: Record<string, unknown> = { counts: [{ value: 'nike', count: 7 }] };
    facet['field_name'] = 'brand';

    const withFacets = { ...responseWith({ count: 250, found: 500 }), ['facet_counts']: [facet] };
    const { helper } = makeHelper({
      multiSearchResult: { results: [withFacets, { ...withFacets }] },
    });

    const result = await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500 },
    });

    // Concatenating would report every count twice over.
    expect(result.facetCounts).toEqual([facet]);
  });
});

describe('search() - a page that cannot be served honestly is refused', () => {
  test('beyond the multi_search entry budget it refuses rather than truncating', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 250 }) });

    // 50 entries x 250 hits is the ceiling. Silently returning a short page would look complete -
    // the failure class this whole line of work exists to remove.
    const failure = helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 12_750 },
    });

    await expectRejection({ task: failure, message: /at most 50/ });
    expect(callCount(fake)).toBe(0);
  });

  test('the refusal is a catalogued 400', async () => {
    const { helper } = makeHelper({ searchResult: responseWith({ count: 250 }) });

    try {
      await helper.search({ collection: 'products', params: { q: '*', ['per_page']: 12_750 } });
      expect.unreachable('a page beyond the budget must be refused');
    } catch (error) {
      const failure = error as { statusCode?: number; normalized?: { code?: string } };
      expect(failure.statusCode).toBe(400);
      expect(failure.normalized?.code).toBe('core.search_engine.page_too_large');
    }
  });

  test('a GROUPED page over the ceiling is refused - groups span windows', async () => {
    const { helper } = makeHelper({ searchResult: responseWith({ count: 250 }) });

    // Concatenating duplicates groups and taking the first window drops the rest; merging by key
    // would mean re-deriving an ordering the engine never produced.
    const failure = helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 500, ['group_by']: 'brand' },
    });

    await expectRejection({ task: failure, message: /grouped search cannot be split/i });
  });

  test('a grouped page WITHIN the ceiling is untouched', async () => {
    const { helper, fake } = makeHelper({ searchResult: responseWith({ count: 10 }) });

    await helper.search({
      collection: 'products',
      params: { q: '*', ['per_page']: 100, ['group_by']: 'brand' },
    });

    expect(entriesOf(fake)).toHaveLength(1);
  });
});

describe('search() - per-entry errors arrive inside HTTP 200', () => {
  test('a failed entry THROWS - it must never read as an empty result', async () => {
    const { helper } = makeHelper({
      multiSearchResult: { results: [{ code: 400, error: 'Could not parse the filter query.' }] },
    });

    // Answering empty here would make a rejected filter indistinguishable from a genuine no-match,
    // and ISearchResult has nowhere to put the error.
    await expectRejection({
      task: helper.search({ collection: 'products', params: { q: '*' } }),
      message: /Could not parse the filter query/,
    });
  });

  test('a 5xx entry whose message says "not found" is NOT mistaken for a missing collection', async () => {
    const { helper } = makeHelper({
      multiSearchResult: { results: [{ code: 500, error: 'Index segment not found on disk' }] },
    });

    await expectRejection({
      task: helper.search({ collection: 'products', params: { q: '*' } }),
      message: /Index segment not found/,
    });
  });

  test('a missing collection still answers empty, as it always has', async () => {
    const { helper } = makeHelper({
      multiSearchResult: { results: [{ code: 404, error: "Collection 'nope' not found." }] },
    });

    const result = await helper.search({ collection: 'nope', params: { q: '*' } });

    expect(result.found).toBe(0);
    expect(result.hits).toEqual([]);
  });
});

describe('multiSearch() - same transport, different policy', () => {
  test('error entries pass through instead of throwing', async () => {
    const { helper } = makeHelper({
      multiSearchResult: {
        results: [
          { found: 1, hits: [] },
          { code: 400, error: 'bad filter' },
        ],
      },
    });

    // Its contract IS the raw envelope: callers index results[i] against searches[i] and inspect
    // entries themselves, so throwing would break code that already handles them.
    const result = await helper.multiSearch({
      searches: [
        { collection: 'a', q: '*' },
        { collection: 'b', q: '*' },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect((result.results[1] as { error?: string }).error).toBe('bad filter');
  });

  test("does NOT window-split - the 1:1 results/searches correspondence is the caller's index", async () => {
    const { helper, fake } = makeHelper({ multiSearchResult: { results: [] } });

    await helper.multiSearch({
      searches: [
        { collection: 'a', q: '*', ['per_page']: 500 },
        { collection: 'b', q: '*', ['per_page']: 500 },
      ],
    });

    // Merging windows back would mean synthesizing a SearchResponse the engine never returned, with
    // no honest value for request_params or page.
    expect(entriesOf(fake)).toHaveLength(2);
  });
});
