import { describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers/core';
import { MeilisearchConnector } from '@/search/meilisearch/connector';

describe('values the engine or an error carries', () => {
  test('a synonym entry that is no string is dropped', async () => {
    const settings = { synonyms: { phone: ['mobile', 7, null, 'cell'] } };
    const connector = {
      assertNonEmpty: () => undefined,
      client: { index: () => ({ getSettings: async () => settings }) },
      getSynonyms: MeilisearchConnector.prototype.getSynonyms,
      runEngineCall: (opts: { run: () => Promise<unknown> }) => opts.run(),
    };

    const synonyms = await Reflect.apply(connector.getSynonyms, connector, [{ collection: 'c' }]);

    expect(synonyms).toEqual([{ id: 'phone', synonyms: ['mobile', 'cell'] }]);
  });

  test('import failure details that are no object are not spread into the progress', () => {
    const error = getError({ message: 'task failed', extra: { details: 'text' } });
    let caught: unknown;

    try {
      Reflect.apply(MeilisearchConnector.prototype['throwImportFailure'], {}, [
        { error, details: { totalCount: 2, processedCount: 1 } },
      ]);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
    expect(error.extra?.['details']).toEqual({ totalCount: 2, processedCount: 1 });
  });
});
