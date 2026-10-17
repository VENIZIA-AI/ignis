import { HttpResponseReader } from '@/base/repositories/common/response-reader';
import { describe, expect, test } from 'bun:test';

const respond = (opts: { status: number; body?: unknown; raw?: string }): Response =>
  new Response(opts.raw ?? JSON.stringify(opts.body), {
    status: opts.status,
    headers: { 'content-type': 'application/json' },
  });

describe('HttpResponseReader.toApplicationError', () => {
  test('carries the status, code, args, text and cause the server sent', async () => {
    const error = await HttpResponseReader.toApplicationError({
      response: respond({
        status: 422,
        body: {
          message: 'raw',
          normalized: {
            text: 'Name is required',
            code: 'validation.required',
            args: { field: 'name' },
          },
          details: { cause: [{ path: 'name', message: 'Required', code: 'invalid_type' }] },
        },
      }),
      context: '[Client][write] 422 | /tickets',
    });

    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('[Client][write] 422 | /tickets | Name is required');
    expect(error.normalized).toMatchObject({
      text: 'Name is required',
      code: 'validation.required',
      args: { field: 'name' },
    });
    expect(error.cause).toEqual([{ path: 'name', message: 'Required', code: 'invalid_type' }]);
  });

  test('adds requestId to extra and chains a relayed upstream id, nearest first', async () => {
    const error = await HttpResponseReader.toApplicationError({
      response: respond({
        status: 502,
        body: {
          message: 'upstream failed',
          requestId: 'r-2',
          extra: { requestId: 'r-1', upstreamRequestIds: ['r-0'] },
        },
      }),
      context: '[Client][read] 502 | /orders',
    });

    expect(error.extra).toEqual({ requestId: 'r-2', upstreamRequestIds: ['r-1', 'r-0'] });
  });

  test('a body that is not JSON keeps the context as message and HTTP <status> as text', async () => {
    const error = await HttpResponseReader.toApplicationError({
      response: respond({ status: 503, raw: '<html>Service Unavailable</html>' }),
      context: '[Client][read] 503 | /orders',
    });

    expect(error.message).toBe('[Client][read] 503 | /orders');
    expect(error.normalized?.text).toBe('HTTP 503');
    expect(error.extra).toBeUndefined();
  });

  test('unwraps the envelope under rootKey', async () => {
    const error = await HttpResponseReader.toApplicationError({
      response: respond({ status: 404, body: { error: { message: 'Not found' } } }),
      context: '[Client][read] 404 | /orders/9',
      rootKey: 'error',
    });

    expect(error.message).toBe('[Client][read] 404 | /orders/9 | Not found');
  });
});
