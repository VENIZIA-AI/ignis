import { describe, expect, test } from 'bun:test';
import { TypesenseImportActions } from '@/search/typesense/common';
import { TypesenseConnector } from '@/search/typesense/connector';
import { createFakeClient, makeHelper } from './fake-client';

const collect = async (opts: { lines: AsyncIterable<string> }): Promise<string[]> => {
  const lines: string[] = [];
  for await (const line of opts.lines) {
    lines.push(line);
  }

  return lines;
};

const chunksOf = (parts: Array<string | Uint8Array>) =>
  async function* () {
    for (const part of parts) {
      yield part;
    }
  };

/** The wire parameters of an export, as the engine names them (snake_case keys are not writable as object literal names). */
const wire = (opts: { filter?: string; include?: string; exclude?: string }) => {
  const params: Record<string, unknown> = {};
  if (opts.filter !== undefined) {
    params['filter_by'] = opts.filter;
  }
  if (opts.include !== undefined) {
    params['include_fields'] = opts.include;
  }
  if (opts.exclude !== undefined) {
    params['exclude_fields'] = opts.exclude;
  }
  return params;
};

/** The error a call rejected with; the test fails if it resolved. */
const rejection = async (opts: { promise: Promise<unknown> }) => {
  try {
    await opts.promise;
  } catch (error) {
    return error as {
      statusCode: number;
      message: string;
      responses?: unknown;
      extra?: Record<string, unknown>;
    };
  }

  throw new Error('expected the call to reject');
};

describe('TypesenseConnector.streamDocuments', () => {
  test('yields one line per document, across chunk boundaries, without the newline', async () => {
    const { helper } = makeHelper({
      exportChunks: chunksOf(['{"id":"1"}\n{"id', '":"2"}\n{"id":"3"}\n']),
    });

    const lines = await collect({ lines: helper.streamDocuments({ collection: 'products' }) });

    expect(lines).toEqual(['{"id":"1"}', '{"id":"2"}', '{"id":"3"}']);
  });

  test('a multi-byte character split between two byte chunks is read whole', async () => {
    const bytes = new TextEncoder().encode('{"title":"chào 🔐"}\n');
    const cut = bytes.indexOf(0xf0) + 2;
    const { helper } = makeHelper({
      exportChunks: chunksOf([bytes.slice(0, cut), bytes.slice(cut)]),
    });

    const lines = await collect({ lines: helper.streamDocuments({ collection: 'products' }) });

    expect(lines).toEqual(['{"title":"chào 🔐"}']);
  });

  test('blank lines are dropped and a last line without a newline is yielded', async () => {
    const { helper } = makeHelper({ exportChunks: chunksOf(['{"id":"1"}\n\n\n{"id":"2"}']) });

    const lines = await collect({ lines: helper.streamDocuments({ collection: 'products' }) });

    expect(lines).toEqual(['{"id":"1"}', '{"id":"2"}']);
  });

  test('an empty export yields nothing', async () => {
    const { helper } = makeHelper();

    const lines = await collect({ lines: helper.streamDocuments({ collection: 'products' }) });

    expect(lines).toEqual([]);
  });

  test('a 2 GB export is read with bounded memory: the reader is never more than two chunks ahead', async () => {
    // A line of 1 000 bytes plus its newline, in 64 KB chunks cut at other offsets, so a line spans two chunks.
    const line = `${'x'.repeat(996)}"}`.padStart(1000, '{');
    const lineBytes = line.length + 1;
    const chunkBytes = 65_536;
    const chunkCount = 32_000;
    const body = `${line}\n`.repeat(Math.ceil((chunkBytes * 2) / lineBytes));
    let producedBytes = 0;
    let producedChunks = 0;
    let consumedBytes = 0;
    let maxAheadBytes = 0;

    const { helper, fake } = makeHelper({
      exportChunks: () =>
        (async function* () {
          for (let index = 0; index < chunkCount; index += 1) {
            const start = (index * chunkBytes) % lineBytes;
            const chunk = body.slice(start, start + chunkBytes);
            producedChunks += 1;
            producedBytes += chunk.length;
            yield chunk;
          }
        })(),
    });

    let lines = 0;
    for await (const read of helper.streamDocuments({ collection: 'products' })) {
      lines += 1;
      consumedBytes += read.length + 1;
      maxAheadBytes = Math.max(maxAheadBytes, producedBytes - consumedBytes);
    }

    expect(fake.calls.some((call) => call.op === 'documents.export')).toBe(false);
    expect(fake.calls.filter((call) => call.op === 'documents.exportStream')).toHaveLength(1);
    expect(producedChunks).toBe(chunkCount);
    // About 2 GB went through, line by line.
    expect(producedBytes).toBeGreaterThan(2_000_000_000);
    expect(lines).toBeGreaterThan(1_900_000);
    // Chunks are pulled one at a time: what was produced but not yet read as lines is a partial line and one chunk.
    expect(maxAheadBytes).toBeLessThanOrEqual(2 * chunkBytes);
  }, 300_000);

  test('the export parameters are filter_by, include_fields and exclude_fields', async () => {
    const { helper, fake } = makeHelper();

    await collect({
      lines: helper.streamDocuments({
        collection: 'products',
        filterBy: 'price:>10',
        includeFields: ['id', 'title'],
        excludeFields: ['embedding'],
      }),
    });

    const call = fake.calls.find((entry) => entry.op === 'documents.exportStream');
    expect(call?.args[1]).toEqual(
      wire({ filter: 'price:>10', include: 'id,title', exclude: 'embedding' }),
    );
  });

  test('a failure before the first line is the mapped error: a 404 is not_found, a 500 the 503', async () => {
    const missing = makeHelper({
      throwOn: { 'documents.exportStream': { httpStatus: 404, message: 'Not Found' } },
    });
    const broken = makeHelper({
      throwOn: { 'documents.exportStream': { httpStatus: 500, message: 'boom' } },
    });

    const first = await rejection({
      promise: collect({ lines: missing.helper.streamDocuments({ collection: 'products' }) }),
    });
    const second = await rejection({
      promise: collect({ lines: broken.helper.streamDocuments({ collection: 'products' }) }),
    });

    expect(first.statusCode).toBe(404);
    expect(second.statusCode).toBe(503);
  });

  test('a failure in the middle throws the 503 from the loop, after the lines already read', async () => {
    const { helper } = makeHelper({
      exportChunks: () =>
        (async function* () {
          yield '{"id":"1"}\n';
          throw new Error('connection reset');
        })(),
    });
    const seen: string[] = [];

    const error = await rejection({
      promise: (async () => {
        for await (const line of helper.streamDocuments({ collection: 'products' })) {
          seen.push(line);
        }
      })(),
    });

    expect(seen).toEqual(['{"id":"1"}']);
    expect(error.statusCode).toBe(503);
    expect(error.message).not.toContain('connection reset');
  });

  test('an empty collection name is refused before any call', async () => {
    const { helper, fake } = makeHelper();

    const error = await rejection({
      promise: collect({ lines: helper.streamDocuments({ collection: ' ' }) }),
    });

    expect(error.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('TypesenseConnector.exportDocuments - excludeFields', () => {
  test('sends exclude_fields next to include_fields and filter_by', async () => {
    const { helper, fake } = makeHelper({ exportResult: '{"id":"1"}\n' });

    const exported = await helper.exportDocuments({
      collection: 'products',
      filterBy: 'price:>10',
      includeFields: ['id'],
      excludeFields: ['embedding', 'vector'],
    });

    expect(exported).toBe('{"id":"1"}\n');
    expect(fake.calls.find((call) => call.op === 'documents.export')?.args[1]).toEqual(
      wire({ filter: 'price:>10', include: 'id', exclude: 'embedding,vector' }),
    );
  });

  test('without any of them the parameters are empty, as before', async () => {
    const { helper, fake } = makeHelper();

    await helper.exportDocuments({ collection: 'products' });

    expect(fake.calls.find((call) => call.op === 'documents.export')?.args[1]).toEqual({});
  });
});

describe('TypesenseConnector - a per-call timeoutMs', () => {
  test('export, stream, import, schema read, create and patch each run on a client with that timeout', async () => {
    const { helper, fake, callFake, timeouts } = makeHelper({
      importResponse: [{ success: true }],
    });

    await helper.exportDocuments({ collection: 'products', timeoutMs: 600_000 });
    await collect({
      lines: helper.streamDocuments({ collection: 'products', timeoutMs: 450_000 }),
    });
    await helper.importDocuments({
      collection: 'products',
      documents: [{ id: '1' }],
      action: TypesenseImportActions.UPSERT,
      timeoutMs: 300_000,
    });
    await helper.getCollection({ name: 'products', timeoutMs: 30_000 });
    await helper.createCollection({ schema: { name: 'copy', fields: [] }, timeoutMs: 20_000 });
    await helper.patchCollectionSchema({ name: 'products', fields: [], timeoutMs: 120_000 });

    expect(timeouts).toEqual([600, 450, 300, 30, 20, 120]);
    // Every one of them ran on the call client, none on the connector's own.
    expect(fake.calls).toHaveLength(0);
    expect(callFake.calls.map((call) => call.op)).toEqual([
      'documents.export',
      'documents.exportStream',
      'documents.import',
      'collections.retrieve',
      'collections.create',
      'collections.update',
    ]);
  });

  test('without createClient, a connector given its own client refuses timeoutMs instead of building another', () => {
    const fake = createFakeClient();
    const helper = new TypesenseConnector({
      name: 'own-client',
      nodes: [{ host: 'localhost', port: 8108 }],
      apiKey: 'k',
      client: fake.client,
    });

    return rejection({
      promise: helper.exportDocuments({ collection: 'products', timeoutMs: 1000 }),
    }).then((error) => {
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('timeoutMs needs createClient');
      expect(fake.calls).toHaveLength(0);
    });
  });

  test('without timeoutMs no extra client is built: the connector keeps its own', async () => {
    const { helper, timeouts } = makeHelper({ importResponse: [{ success: true }] });

    await helper.exportDocuments({ collection: 'products' });
    await helper.importDocuments({ collection: 'products', documents: [{ id: '1' }] });
    await helper.patchCollectionSchema({ name: 'products', fields: [] });

    expect(timeouts).toEqual([]);
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'timeoutMs %p is refused before any call',
    async (timeoutMs) => {
      const { helper, fake, timeouts } = makeHelper();

      const error = await rejection({
        promise: helper.exportDocuments({ collection: 'products', timeoutMs }),
      });

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Invalid timeoutMs');
      expect(fake.calls).toHaveLength(0);
      expect(timeouts).toEqual([]);
    },
  );
});

describe('TypesenseConnector.importDocuments - throwOnFail', () => {
  const documents = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

  test('by default a rejected row is in the result and nothing throws', async () => {
    const { helper } = makeHelper({ importResponse: [{ success: true }, { success: false }] });

    const result = await helper.importDocuments({
      collection: 'products',
      documents,
      batchSize: 2,
    });

    expect(result.count).toEqual({ success: 2, fail: 2 });
  });

  test('with throwOnFail a rejected row throws a 422 after the last batch, with counts and responses', async () => {
    const { helper, fake } = makeHelper({
      importResponse: [{ success: true }, { success: false }],
    });

    const error = await rejection({
      promise: helper.importDocuments({
        collection: 'products',
        documents,
        batchSize: 2,
        throwOnFail: true,
      }),
    });

    // Every batch ran: the failure is reported once, after the last.
    expect(fake.calls.filter((call) => call.op === 'documents.import')).toHaveLength(2);
    expect(error.statusCode).toBe(422);
    expect(error.message).toContain('2 of 4 documents were rejected');
    expect(error.extra?.['details']).toEqual({
      totalCount: 4,
      processedCount: 4,
      successCount: 2,
      failCount: 2,
    });
    expect(error.responses).toHaveLength(4);
    // The responses carry the rejected documents: they stay off `extra`, which goes on the wire.
    expect(Object.keys(error.extra ?? {})).toEqual(['details']);
  });

  test('with throwOnFail and no rejected row it resolves as before', async () => {
    const { helper } = makeHelper({ importResponse: [{ success: true }] });

    const result = await helper.importDocuments({
      collection: 'products',
      documents,
      batchSize: 2,
      throwOnFail: true,
    });

    expect(result.count.fail).toBe(0);
  });
});

describe('TypesenseConnector.findDocument', () => {
  test('returns the document', async () => {
    const { helper } = makeHelper({ documentById: { '1': { id: '1', title: 'Shoe' } } });

    const found = await helper.findDocument<{ id: string; title: string }>({
      collection: 'products',
      id: '1',
    });

    expect(found?.title).toBe('Shoe');
  });

  test('returns null for a missing document, where getDocument throws 404', async () => {
    const { helper } = makeHelper({
      throwOn: { 'documents.retrieve': { httpStatus: 404, message: 'Not Found' } },
    });

    const missing = await helper.findDocument({ collection: 'products', id: '9' });
    expect(missing).toBeNull();
    const error = await rejection({
      promise: helper.getDocument({ collection: 'products', id: '9' }),
    });
    expect(error.statusCode).toBe(404);
  });

  test('any other failure still throws: a 500 is the 503, a 400 is a 400', async () => {
    const broken = makeHelper({
      throwOn: { 'documents.retrieve': { httpStatus: 500, message: 'boom' } },
    });
    const bad = makeHelper({
      throwOn: { 'documents.retrieve': { httpStatus: 400, message: 'bad id' } },
    });

    const first = await rejection({
      promise: broken.helper.findDocument({ collection: 'p', id: '1' }),
    });
    const second = await rejection({
      promise: bad.helper.findDocument({ collection: 'p', id: '1' }),
    });

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(400);
  });

  test('is on the document facade as find', async () => {
    const { helper } = makeHelper({
      throwOn: { 'documents.retrieve': { httpStatus: 404, message: 'Not Found' } },
    });

    const missing = await helper.document.find({ collection: 'products', id: '9' });

    expect(missing).toBeNull();
  });

  test('an empty id is refused before any call', async () => {
    const { helper, fake } = makeHelper();

    const error = await rejection({
      promise: helper.findDocument({ collection: 'products', id: '' }),
    });

    expect(error.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('TypesenseConnector.updateByFilter - an empty document', () => {
  test('is refused as a 400 before the engine is called', async () => {
    const { helper, fake } = makeHelper();

    const error = await rejection({
      promise: helper.updateByFilter({
        collection: 'products',
        document: {},
        filterBy: 'price:>1',
      }),
    });

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Empty document');
    expect(fake.calls.some((call) => call.op === 'documents.update')).toBe(false);
  });

  test('a document with a field still goes through', async () => {
    const { helper, fake } = makeHelper({ numUpdated: 3 });

    const result = await helper.updateByFilter({
      collection: 'products',
      document: { price: 1 },
      filterBy: 'price:>1',
    });

    expect(result.updatedCount).toBe(3);
    expect(fake.calls.some((call) => call.op === 'documents.update')).toBe(true);
  });
});
