import { HttpResponseReader } from '@/base/repositories/common/response-reader';
import { NativeFetcher, UrlFetchError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { afterAll, describe, expect, test } from 'bun:test';

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: () =>
    Response.json(
      { message: 'raw', normalized: { text: 'Name is required', code: 'validation.required' } },
      { status: 422 },
    ),
});

afterAll(async () => {
  await server.stop(true);
});

describe('HttpResponseReader.fromFetchError', () => {
  test("reads the server's envelope from the body a fetcher's refused answer kept", async () => {
    const failure = await RejectionHelper.rejectionOf({
      task: new NativeFetcher({ name: 'n' }).get({ url: `http://127.0.0.1:${server.port}/` }),
    });

    if (!(failure instanceof UrlFetchError)) {
      throw new Error('expected a UrlFetchError');
    }

    const error = await HttpResponseReader.fromFetchError({
      error: failure,
      context: '[Client][write] 422 | /tickets',
    });

    expect(error.statusCode).toBe(422);
    expect(error.normalized.text).toBe('Name is required');
    expect(error.normalized.code).toBe('validation.required');
  });

  test('an error that kept no body is described by its status alone', async () => {
    const error = await HttpResponseReader.fromFetchError({
      error: new UrlFetchError({ message: 'x', status: 503, url: 'http://x' }),
      context: '[Client][read] 503 | /tickets',
    });

    expect(error.statusCode).toBe(503);
    expect(error.normalized.text).toBe('HTTP 503');
  });

  test('a hand-built error with a status no Response takes (0) is a bad gateway, not a RangeError', async () => {
    const error = await HttpResponseReader.fromFetchError({
      error: new UrlFetchError({ message: 'x', status: 0, url: 'http://x' }),
      context: '[Client][read] 0 | /tickets',
    });

    expect(error.statusCode).toBe(502);
  });
});
