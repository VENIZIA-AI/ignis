import { expectRejection } from '../rejection.helper';
import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { afterEach, describe, expect, test } from 'bun:test';

/**
 * The write half of the http connector: a body and per-request headers on any method, the count a
 * write answers, the server's own error carried back, and the IGNIS CRUD routes behind the
 * repository's write verbs.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type TAttempt = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: RequestInit['body'];
};

type TStubResponse = { status: number; body?: unknown; headers?: Record<string, string> };

const stubFetch = (responses: Array<TStubResponse>) => {
  const attempts: Array<TAttempt> = [];
  let index = 0;

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    attempts.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
      body: init?.body,
    });

    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;

    return new Response(spec.body === undefined ? null : JSON.stringify(spec.body), {
      status: spec.status,
      headers: { 'content-type': 'application/json', ...spec.headers },
    });
  }) as never;

  return attempts;
};

const BASE_URL = 'https://api.example.com';

const buildDataSource = (opts?: { onUnauthorized?: () => boolean }) =>
  new HttpDataSource({ baseUrl: BASE_URL, onUnauthorized: opts?.onUnauthorized });

type TTicket = { id: string; title: string; status?: string };

const buildRepository = () =>
  new HttpRepository<TTicket>({ dataSource: buildDataSource(), resource: 'tickets' });

const captureError = async (task: Promise<unknown>) => {
  try {
    await task;
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to reject');
};

describe('HttpDataSource.request - a body and headers on any method', () => {
  test('a plain object goes out as JSON with a json content-type, on PUT', async () => {
    const attempts = stubFetch([{ status: 200, body: { id: 't1' } }]);

    await buildDataSource().request({
      paths: ['tickets', 't1'],
      method: 'PUT',
      body: { title: 'replaced' },
    });

    expect(attempts[0].method).toBe('PUT');
    expect(attempts[0].body).toBe(JSON.stringify({ title: 'replaced' }));
    expect(attempts[0].headers['content-type']).toBe('application/json');
  });

  test('an array goes out as JSON too', async () => {
    const attempts = stubFetch([{ status: 200, body: [] }]);

    await buildDataSource().request({ paths: ['tickets'], method: 'POST', body: [{ id: 'a' }] });

    expect(attempts[0].body).toBe(JSON.stringify([{ id: 'a' }]));
  });

  test('a string body is sent as is, with the content-type the caller names', async () => {
    const attempts = stubFetch([{ status: 200, body: {} }]);

    await buildDataSource().request({
      paths: ['imports'],
      method: 'POST',
      body: 'a,b\n1,2',
      headers: { 'content-type': 'text/csv' },
    });

    expect(attempts[0].body).toBe('a,b\n1,2');
    expect(attempts[0].headers['content-type']).toBe('text/csv');
  });

  test('FormData is sent as is, and no content-type is forced over its boundary', async () => {
    const attempts = stubFetch([{ status: 200, body: {} }]);
    const form = new FormData();
    form.set('file', new Blob(['x']), 'x.txt');

    await buildDataSource().request({ paths: ['uploads'], method: 'POST', body: form });

    expect(attempts[0].body).toBe(form);
    expect(attempts[0].headers['content-type']).toBeUndefined();
  });

  test('per-request headers are sent, and the connector still owns x-request-count', async () => {
    const attempts = stubFetch([{ status: 200, body: {} }]);

    await buildDataSource().request({
      paths: ['tickets'],
      method: 'POST',
      body: { title: 'a' },
      headers: { 'Idempotency-Key': 'k-1' },
    });

    expect(attempts[0].headers['idempotency-key']).toBe('k-1');
    expect(attempts[0].headers['x-request-count']).toBe('false');
  });

  test('a per-request x-request-count is refused before anything is sent', async () => {
    const attempts = stubFetch([{ status: 200, body: {} }]);

    await expectRejection({
      task: buildDataSource().request({
        paths: ['tickets'],
        headers: { 'X-Request-Count': 'true' },
      }),
      message: /x-request-count is owned by HttpDataSource/,
    });
    expect(attempts).toHaveLength(0);
  });

  test('the 401 retry sends the same body again', async () => {
    const attempts = stubFetch([
      { status: 401, body: {} },
      { status: 201, body: { id: 't1' } },
    ]);

    await buildDataSource({ onUnauthorized: () => true }).request({
      paths: ['tickets'],
      method: 'POST',
      body: { title: 'a' },
    });

    expect(attempts).toHaveLength(2);
    expect(attempts[1].method).toBe('POST');
    expect(attempts[1].body).toBe(JSON.stringify({ title: 'a' }));
  });
});

describe('HttpDataSource.write - rows, count and the server error', () => {
  test('answers the body and the x-response-count count', async () => {
    stubFetch([
      { status: 200, body: [{ id: 'a' }, { id: 'b' }], headers: { 'x-response-count': '2' } },
    ]);

    const rs = await buildDataSource().write<Array<{ id: string }>>({
      paths: ['tickets'],
      method: 'PATCH',
      body: { where: { id: { inq: ['a', 'b'] } }, status: 'closed' },
    });

    expect(rs).toEqual({ data: [{ id: 'a' }, { id: 'b' }], count: 2 });
  });

  test('a non-2xx write throws with the server status, message and message code', async () => {
    stubFetch([
      {
        status: 409,
        body: {
          message: 'A ticket with this title already exists',
          statusCode: 409,
          normalized: { text: 'A ticket with this title already exists', code: 'ticket.duplicate' },
          requestId: 'req-1',
        },
      },
    ]);

    const error = await captureError(
      buildDataSource().write({ paths: ['tickets'], method: 'POST', body: { title: 'a' } }),
    );

    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('A ticket with this title already exists');
    expect(error.normalized.code).toBe('ticket.duplicate');
  });

  test('a failed read carries the server message too', async () => {
    stubFetch([{ status: 403, body: { message: 'Not allowed to read tickets', statusCode: 403 } }]);

    const error = await captureError(buildDataSource().read({ paths: ['tickets'] }));

    expect(error.statusCode).toBe(403);
    expect(error.message).toContain('Not allowed to read tickets');
  });

  test('a read can POST its filter to a list route written to take it in the body', async () => {
    const attempts = stubFetch([
      { status: 200, body: [{ id: 'a' }], headers: { 'content-range': 'records 0-0/1' } },
    ]);
    const filter = { where: { id: { inq: ['a', 'b'] } } };

    const rs = await buildDataSource().read<Array<{ id: string }>>({
      paths: ['tickets', 'list', 'find'],
      method: 'POST',
      body: { filter },
    });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets/list/find`, method: 'POST' });
    expect(JSON.parse(String(attempts[0].body))).toEqual({ filter });
    expect(rs).toMatchObject({ data: [{ id: 'a' }], total: 1, hasRange: true });
  });

  test('the server normalized.args come through, so a translated message can fill its placeholders', async () => {
    stubFetch([
      {
        status: 409,
        body: {
          message: 'A category named Ticket already exists.',
          normalized: {
            text: 'A category named %{name} already exists.',
            code: 'category.duplicate',
            args: { name: 'Ticket' },
          },
        },
      },
    ]);

    const write = await captureError(
      buildDataSource().write({ paths: ['categories'], method: 'POST', body: { name: 'Ticket' } }),
    );
    expect(write.normalized.code).toBe('category.duplicate');
    expect(write.normalized.args).toEqual({ name: 'Ticket' });

    const read = await captureError(buildDataSource().read({ paths: ['categories'] }));
    expect(read.normalized.args).toEqual({ name: 'Ticket' });
  });

  test('args that are not a plain object are left out rather than passed through', async () => {
    stubFetch([
      {
        status: 400,
        body: { message: 'Bad', normalized: { code: 'bad', args: ['not', 'a', 'record'] } },
      },
    ]);

    const error = await captureError(buildDataSource().read({ paths: ['tickets'] }));

    expect(error.normalized.code).toBe('bad');
    expect(error.normalized.args).toEqual({});
  });
});

describe('HttpRepository - the write verbs map to the IGNIS CRUD routes', () => {
  test('create is POST / with the data as the body', async () => {
    const attempts = stubFetch([
      { status: 201, body: { id: 't1', title: 'a' }, headers: { 'x-response-count': '1' } },
    ]);

    const rs = await buildRepository().create({ data: { id: 't1', title: 'a' } });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets`, method: 'POST' });
    expect(attempts[0].body).toBe(JSON.stringify({ id: 't1', title: 'a' }));
    expect(rs).toEqual({ count: 1, data: { id: 't1', title: 'a' } });
  });

  test('updateById is PATCH /:id, and the id is URL-encoded', async () => {
    const attempts = stubFetch([
      { status: 200, body: { id: 'a/b', title: 'x' }, headers: { 'x-response-count': '1' } },
    ]);

    await buildRepository().updateById({ id: 'a/b', data: { title: 'x' } });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets/a%2Fb`, method: 'PATCH' });
    expect(attempts[0].body).toBe(JSON.stringify({ title: 'x' }));
  });

  test('updateAll is PATCH / with where in the body beside the data', async () => {
    const attempts = stubFetch([{ status: 200, body: [], headers: { 'x-response-count': '0' } }]);
    const where = { status: 'open' };

    await buildRepository().updateAll({ where, data: { status: 'closed' } });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets`, method: 'PATCH' });
    expect(JSON.parse(String(attempts[0].body))).toEqual({ where, status: 'closed' });
  });

  test('updateBy is the same route', async () => {
    const attempts = stubFetch([{ status: 200, body: [], headers: { 'x-response-count': '0' } }]);

    await buildRepository().updateBy({ where: { status: 'open' }, data: { status: 'closed' } });

    expect(attempts[0].method).toBe('PATCH');
  });

  test('deleteById is DELETE /:id', async () => {
    const attempts = stubFetch([
      { status: 200, body: { id: 't1', title: 'a' }, headers: { 'x-response-count': '1' } },
    ]);

    const rs = await buildRepository().deleteById({ id: 't1' });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets/t1`, method: 'DELETE' });
    expect(rs).toEqual({ count: 1, data: { id: 't1', title: 'a' } });
  });

  test('deleteAll is DELETE / with where in the body, so a long id list fits', async () => {
    const attempts = stubFetch([{ status: 200, body: [], headers: { 'x-response-count': '0' } }]);
    const ids = Array.from({ length: 2000 }, (_, index) => `id-${index}`);

    await buildRepository().deleteAll({ where: { id: { inq: ids } } });

    expect(attempts[0]).toMatchObject({ url: `${BASE_URL}/tickets`, method: 'DELETE' });
    expect(JSON.parse(String(attempts[0].body))).toEqual({ where: { id: { inq: ids } } });
  });

  test('deleteBy is the same route', async () => {
    const attempts = stubFetch([{ status: 200, body: [], headers: { 'x-response-count': '0' } }]);

    await buildRepository().deleteBy({ where: { status: 'closed' } });

    expect(attempts[0].method).toBe('DELETE');
  });

  test('an empty bulk where is refused before any request, as the server would refuse it', async () => {
    const attempts = stubFetch([{ status: 200, body: [] }]);

    await expectRejection({
      task: buildRepository().updateAll({ where: {}, data: { status: 'closed' } }),
      message: /where is required/,
    });
    await expectRejection({
      task: buildRepository().deleteAll({ where: {} }),
      message: /where is required/,
    });
    expect(attempts).toHaveLength(0);
  });

  test('shouldReturn: false answers the count and no data', async () => {
    stubFetch([{ status: 200, body: { id: 't1' }, headers: { 'x-response-count': '1' } }]);

    const rs = await buildRepository().deleteById({ id: 't1', options: { shouldReturn: false } });

    expect(rs).toEqual({ count: 1, data: null });
  });
});
