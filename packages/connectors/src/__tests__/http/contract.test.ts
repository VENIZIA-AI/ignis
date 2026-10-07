import { expectRejection } from '../rejection.helper';
import { HttpResponseReader } from '@/http/common/readers';
import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { ApplicationError, MessageCode } from '@venizia/ignis-helpers/core';
import { afterEach, describe, expect, test } from 'bun:test';

/**
 * Where the connector meets the IGNIS server and the browser: the error envelope as the server
 * wraps it, the body types `fetch` labels itself, ids that name another route, per-call headers
 * and abort, and bodies that are empty or not JSON.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type TAttempt = {
  url: string;
  method: string;
  headers: Record<string, string>;
  signal?: AbortSignal | null;
};

type TStubResponse = { status: number; text?: string; headers?: Record<string, string> };

const stubFetch = (responses: Array<TStubResponse>) => {
  const attempts: Array<TAttempt> = [];
  let index = 0;

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    attempts.push({
      url: String(url),
      method: init?.method ?? 'GET',
      // Through `Request`, as fetch does: it is what writes a FormData's multipart content-type.
      headers: Object.fromEntries(new Request(String(url), init).headers.entries()),
      signal: init?.signal,
    });

    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;

    return new Response(spec.text ?? null, { status: spec.status, headers: spec.headers });
  }) as never;

  return attempts;
};

const BASE_URL = 'https://api.example.com';

const rejectionOf = async (task: Promise<unknown>): Promise<ApplicationError> => {
  try {
    await task;
  } catch (error) {
    return error as ApplicationError;
  }

  throw new Error('expected a rejection');
};

const ENVELOPE = {
  message: 'Name taken',
  statusCode: 409,
  normalized: { text: 'Name taken', code: 'user.name.taken', args: { name: 'x' } },
  requestId: 'req-1',
};

describe('the error envelope, as the server sends it', () => {
  test('wrapped under the configured rootKey, it is unwrapped', async () => {
    stubFetch([{ status: 409, text: JSON.stringify({ error: ENVELOPE }) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL, errorRootKey: 'error' });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.statusCode).toBe(409);
    expect(error.normalized.code).toBe('user.name.taken');
    expect(error.normalized.args).toEqual({ name: 'x' });
    expect(error.extra?.requestId).toBe('req-1');
  });

  test('wrapped, with no rootKey configured, it is not guessed at', async () => {
    stubFetch([{ status: 409, text: JSON.stringify({ error: ENVELOPE }) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.code).not.toBe('user.name.taken');
  });

  test('a rootKey that is absent from the body falls back to the body itself', async () => {
    stubFetch([{ status: 409, text: JSON.stringify(ENVELOPE) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL, errorRootKey: 'error' });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.code).toBe('user.name.taken');
  });

  test("normalized.text is the server's; message adds where it failed", async () => {
    stubFetch([{ status: 409, text: JSON.stringify(ENVELOPE) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.text).toBe('Name taken');
    expect(error.message).toContain('[http][read] 409');
    expect(error.message).toContain('Name taken');
  });

  test("a 422's per-field issues are the error's cause", async () => {
    const cause = [{ path: 'email', message: 'Invalid email', code: 'invalid_string' }];
    stubFetch([
      {
        status: 422,
        text: JSON.stringify({ ...ENVELOPE, statusCode: 422, details: { path: '/users', cause } }),
      },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(
      dataSource.write({ paths: ['users'], method: 'POST', body: { email: 'x' } }),
    );

    expect(error.cause).toEqual(cause);
  });

  test("the server's extra comes through whole, beside the requestId", async () => {
    const extra = { details: { blockers: [{ id: 1 }], total: 1 } };
    stubFetch([{ status: 409, text: JSON.stringify({ ...ENVELOPE, extra }) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(
      dataSource.write({ paths: ['products'], method: 'PATCH', body: {} }),
    );

    expect(error.extra).toEqual({ ...extra, requestId: 'req-1' });
  });
});

describe('HttpResponseReader', () => {
  test('parseContentRange reads a page and an empty page, and nothing else', () => {
    expect(HttpResponseReader.parseContentRange({ header: 'records 0-24/137' })).toEqual({
      skip: 0,
      total: 137,
    });
    expect(HttpResponseReader.parseContentRange({ header: 'records */137' })).toEqual({
      total: 137,
    });
    expect(HttpResponseReader.parseContentRange({ header: 'records 0-24/*' })).toBeUndefined();
    expect(HttpResponseReader.parseContentRange({ header: null })).toBeUndefined();
  });

  test('readErrorEnvelope takes only well-typed fields', () => {
    const read = HttpResponseReader.readErrorEnvelope({
      body: { error: { ...ENVELOPE, normalized: { code: 7, args: ['a'] }, details: 'x' } },
      rootKey: 'error',
    });

    expect(read.message).toBe('Name taken');
    expect(read.normalized).toEqual({ text: undefined, code: undefined, args: undefined });
    expect(read.details).toBeUndefined();
    expect(HttpResponseReader.readErrorEnvelope({ body: 'Bad Gateway' })).toEqual({});
  });
});

describe('a body fetch labels itself keeps the label fetch writes', () => {
  test('FormData drops a configured content-type, so fetch can write the boundary', async () => {
    const attempts = stubFetch([{ status: 201, text: '{"id":"1"}' }]);
    const dataSource = new HttpDataSource({
      baseUrl: BASE_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    const form = new FormData();
    form.append('file', new Blob(['a']), 'a.txt');
    await dataSource.write({ paths: ['files'], method: 'POST', body: form });

    expect(attempts[0].headers['content-type']).toStartWith('multipart/form-data; boundary=');
  });

  test('a JSON body still gets application/json', async () => {
    const attempts = stubFetch([{ status: 201, text: '{"id":"1"}' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    await dataSource.write({ paths: ['files'], method: 'POST', body: { name: 'a' } });

    expect(attempts[0].headers['content-type']).toBe('application/json');
  });
});

describe('an id that names another route is refused before a request is spent', () => {
  for (const id of ['', '.', '..']) {
    test(`id '${id}'`, async () => {
      const attempts = stubFetch([{ status: 200, text: '[]' }]);
      const repository = new HttpRepository({
        dataSource: new HttpDataSource({ baseUrl: BASE_URL }),
        resource: 'users',
      });

      await expectRejection({ task: repository.deleteById({ id }), message: /Invalid id/ });
      expect(attempts).toHaveLength(0);
    });
  }

  test('an id carrying a dot among other characters is sent', async () => {
    const attempts = stubFetch([{ status: 200, text: '{"id":"a.b"}' }]);
    const repository = new HttpRepository({
      dataSource: new HttpDataSource({ baseUrl: BASE_URL }),
      resource: 'users',
    });

    await repository.findById({ id: 'a.b' });

    expect(attempts[0].url).toStartWith(`${BASE_URL}/users/a.b`);
  });
});

describe('a call adds its own headers and an abort signal', () => {
  const buildRepository = () =>
    new HttpRepository({
      dataSource: new HttpDataSource({ baseUrl: BASE_URL, headers: { 'x-locale': 'en' } }),
      resource: 'users',
    });

  test('a read verb sends both', async () => {
    const attempts = stubFetch([
      { status: 200, text: '[]', headers: { 'content-range': 'records */0' } },
    ]);
    const controller = new AbortController();

    await buildRepository().find({
      filter: {},
      options: { headers: { 'x-locale': 'vi' }, signal: controller.signal },
    });

    expect(attempts[0].headers['x-locale']).toBe('vi');
    expect(attempts[0].signal).toBe(controller.signal);
  });

  test('a write verb sends both', async () => {
    const attempts = stubFetch([{ status: 200, text: '{"id":"1"}' }]);
    const controller = new AbortController();

    await buildRepository().updateById({
      id: '1',
      data: { name: 'a' },
      options: { headers: { 'x-trace': 't-1' }, signal: controller.signal },
    });

    expect(attempts[0].headers['x-trace']).toBe('t-1');
    expect(attempts[0].signal).toBe(controller.signal);
  });

  test('an aborted signal rejects the call', async () => {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return new Response('[]');
    }) as never;

    const controller = new AbortController();
    controller.abort();

    await expectRejection({
      task: buildRepository().find({ filter: {}, options: { signal: controller.signal } }),
      message: /abort/i,
    });
  });
});

describe('a body that is empty or not JSON', () => {
  test('a 204 on a one-row read is null', async () => {
    stubFetch([{ status: 204 }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const rs = await dataSource.read({ paths: ['users', '1'], shape: 'one' });

    expect(rs.data).toBeNull();
  });

  test('an empty list body throws an ApplicationError, not a SyntaxError', async () => {
    stubFetch([{ status: 200 }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error).toBeInstanceOf(ApplicationError);
  });

  test('a non-JSON 2xx on a write is a 502 naming the body', async () => {
    stubFetch([{ status: 200, text: '<html>proxy page</html>' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(
      dataSource.write({ paths: ['users'], method: 'POST', body: {} }),
    );

    expect(error.statusCode).toBe(502);
    expect(error.message).toContain('not JSON');
    expect(error.message).not.toContain('proxy page');
  });

  test('a bigint in a JSON body is a 400, not a TypeError', async () => {
    const attempts = stubFetch([{ status: 201, text: '{}' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(
      dataSource.write({ paths: ['users'], method: 'POST', body: { id: 1n } }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('The request body');
    expect(attempts).toHaveLength(0);
  });

  test('a bigint in a query is a 400 naming the parameter', async () => {
    stubFetch([{ status: 200, text: '[]' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(
      dataSource.read({ paths: ['users'], query: { filter: { where: { id: 1n } } } }),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("'filter'");
  });
});

describe('a missing Content-Range names the cross-origin cause', () => {
  test('count says to expose Content-Range', async () => {
    stubFetch([{ status: 200, text: '[]' }]);
    const repository = new HttpRepository({
      dataSource: new HttpDataSource({ baseUrl: BASE_URL }),
      resource: 'users',
    });

    await expectRejection({
      task: repository.count({ where: {} }),
      message: /Access-Control-Expose-Headers/,
    });
  });
});

describe('review cases', () => {
  test('a Blob keeps a per-call content-type, and a configured one', async () => {
    const attempts = stubFetch([{ status: 201, text: '{}' }]);
    const dataSource = new HttpDataSource({
      baseUrl: BASE_URL,
      headers: { 'content-type': 'application/octet-stream' },
    });

    await dataSource.write({ paths: ['files'], method: 'POST', body: new Blob(['a']) });
    await dataSource.write({
      paths: ['files'],
      method: 'POST',
      body: new Blob(['a']),
      headers: { 'content-type': 'image/png' },
    });

    expect(attempts.map(attempt => attempt.headers['content-type'])).toEqual([
      'application/octet-stream',
      'image/png',
    ]);
  });

  test('FormData drops even a per-call content-type: only fetch knows the boundary', async () => {
    const attempts = stubFetch([{ status: 201, text: '{}' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    await dataSource.write({
      paths: ['files'],
      method: 'POST',
      body: new FormData(),
      headers: { 'content-type': 'multipart/form-data' },
    });

    expect(attempts[0].headers['content-type']).toStartWith('multipart/form-data; boundary=');
  });

  test('a non-object under the rootKey reads the body as it stands', async () => {
    stubFetch([
      { status: 502, text: JSON.stringify({ error: 'Bad Gateway', message: 'upstream down' }) },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL, errorRootKey: 'error' });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.text).toBe('upstream down');
  });

  test('with no rootKey configured, a wrapped envelope reads as no code at all', async () => {
    stubFetch([{ status: 409, text: JSON.stringify({ error: ENVELOPE }) }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.code).toBe(MessageCode.DEFAULT);
    expect(error.extra).toBeUndefined();
  });

  test("an upstream requestId in the server's extra is kept beside this request's", async () => {
    stubFetch([
      {
        status: 409,
        text: JSON.stringify({
          ...ENVELOPE,
          requestId: 'req-B',
          extra: { requestId: 'req-A', k: 1 },
        }),
      },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.extra).toEqual({ k: 1, requestId: 'req-B', upstreamRequestIds: ['req-A'] });
  });

  test('every hop of a relay chain keeps its id, nearest first', async () => {
    stubFetch([
      {
        status: 409,
        text: JSON.stringify({
          ...ENVELOPE,
          requestId: 'a',
          extra: { requestId: 'b', upstreamRequestIds: ['c'] },
        }),
      },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.extra).toEqual({ requestId: 'a', upstreamRequestIds: ['b', 'c'] });
  });

  test('a non-JSON error with no text reads as HTTP <status>, never the log line', async () => {
    stubFetch([{ status: 502, text: '<html>proxy</html>' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.text).toBe('HTTP 502');
  });

  test("with no top-level requestId, the server's extra.requestId stays where it is", async () => {
    stubFetch([
      { status: 409, text: JSON.stringify({ message: 'x', extra: { requestId: 'req-A' } }) },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.extra).toEqual({ requestId: 'req-A' });
  });

  test("an empty normalized.text falls back to the server's message", async () => {
    stubFetch([
      { status: 400, text: JSON.stringify({ message: 'Real message', normalized: { text: '' } }) },
    ]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.normalized.text).toBe('Real message');
  });

  test('a call aborted during the refresh is not sent again, and the hooks saw its signal', async () => {
    const attempts = stubFetch([{ status: 401 }, { status: 200, text: '[]' }]);
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;

    const dataSource = new HttpDataSource({
      baseUrl: BASE_URL,
      onUnauthorized: context => {
        seenSignal = context.signal;
        controller.abort();
        return true;
      },
    });

    await expectRejection({
      task: dataSource.read({ paths: ['users'], signal: controller.signal }),
      message: /abort/i,
    });
    expect(attempts).toHaveLength(1);
    expect(seenSignal).toBe(controller.signal);
  });

  test('a per-call Headers instance is merged like a record', async () => {
    const attempts = stubFetch([{ status: 200, text: '[]' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL, headers: { 'x-locale': 'en' } });

    await dataSource.read({ paths: ['users'], headers: new Headers({ 'X-Locale': 'vi' }) });

    expect(attempts[0].headers['x-locale']).toBe('vi');
  });

  test('a 204 on a one-row read counts no row', async () => {
    stubFetch([{ status: 204 }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const rs = await dataSource.read({ paths: ['users', '1'], shape: 'one' });

    expect(rs.dataLength).toBe(0);
  });

  test('a non-JSON 2xx on a read is a 502, not a SyntaxError', async () => {
    stubFetch([{ status: 200, text: '<html>proxy page</html>' }]);
    const dataSource = new HttpDataSource({ baseUrl: BASE_URL });

    const error = await rejectionOf(dataSource.read({ paths: ['users'] }));

    expect(error.statusCode).toBe(502);
  });
});

describe('list extras, asked for by name', () => {
  const marked = (body: unknown, names: string) => ({
    status: 200,
    text: JSON.stringify(body),
    headers: { 'x-response-extra': names },
  });

  const buildRepository = () =>
    new HttpRepository({
      dataSource: new HttpDataSource({ baseUrl: BASE_URL }),
      resource: 'items',
    });

  test('find sends plain, grouped and switched-off extras in one header, and reads the marked body', async () => {
    const attempts = stubFetch([
      marked({ data: [{ id: 1 }], extra: { facets: { status: 2 }, counts: 1 } }, 'facets,counts'),
    ]);

    const result = await buildRepository().find({
      filter: {},
      options: { extra: { facets: ['status', 'tag'], counts: true, lots: false } },
    });

    expect(attempts[0].headers['x-request-extra']).toBe('facets(status,tag),counts,-lots');
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.extra.facets?.status).toBe(2);
  });

  test('a find that names no extra sends no header', async () => {
    const attempts = stubFetch([{ status: 200, text: '[]' }]);

    await buildRepository().find({ filter: {} });

    expect(attempts[0].headers['x-request-extra']).toBeUndefined();
  });

  test('count, existsWith and findOne ask for the rows alone, every default off', async () => {
    const attempts = stubFetch([
      { status: 200, text: '[]', headers: { 'content-range': 'records */0' } },
    ]);
    const repository = buildRepository();

    await repository.count({ where: {} });
    await repository.existsWith({ where: {} });
    await repository.findOne({ filter: {} });

    expect(attempts.map(attempt => attempt.headers['x-request-extra'])).toEqual(['-*', '-*', '-*']);
  });

  test('an unmarked { data, extra } body is not unwrapped as a list', async () => {
    stubFetch([{ status: 200, text: JSON.stringify({ data: [1, 2], extra: { note: 'x' } }) }]);

    await expectRejection({
      task: new HttpDataSource({ baseUrl: BASE_URL }).read({ paths: ['items'] }),
      message: /neither an array/,
    });
  });
});

describe('write extras', () => {
  test('a write marked by the server reads { data, extra }', async () => {
    const attempts = stubFetch([
      {
        status: 200,
        text: JSON.stringify({ data: [{ id: 1 }], extra: { counts: { declared: 1 } } }),
        headers: { 'x-response-extra': 'counts' },
      },
    ]);

    const result = await new HttpDataSource({ baseUrl: BASE_URL }).write({
      paths: ['items', 'bulk'],
      method: 'POST',
      body: {},
      extra: { counts: true },
    });

    expect(attempts[0].headers['x-request-extra']).toBe('counts');
    expect(result).toMatchObject({ data: [{ id: 1 }], extra: { counts: { declared: 1 } } });
  });

  test('an unmarked row with data and extra columns comes back as written', async () => {
    const row = { id: 1, data: [1], extra: { note: 'x' } };
    stubFetch([{ status: 200, text: JSON.stringify(row) }]);

    const result = await new HttpDataSource({ baseUrl: BASE_URL }).write({
      paths: ['items'],
      method: 'POST',
      body: {},
    });

    expect(result.data).toEqual(row);
    expect(result.extra).toBeUndefined();
  });
});
