import { describe, expect, test } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers';
import { HTTP, LoggerFactory } from '@venizia/ignis-helpers';
import { AppErrorMiddleware } from '@/base/middlewares/app-error/app-error.middleware';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/** A chunked request carries no `Content-Length`; gating the body parse on that header's PRESENCE
 * skips every streamed body - malformed payloads then blow up deeper as a 500 instead of a clean 400. */
const buildServer = () => {
  const server = new OpenAPIHono();
  const spy = new RequestSpyMiddleware();

  server.use('*', spy.value());
  server.post('/echo', context => {
    return context.json({ ok: true });
  });

  // The real handler: without it an ApplicationError thrown by the middleware surfaces as a bare
  // 500 and the test would never see the status the middleware actually chose.
  server.onError(new AppErrorMiddleware({ logger: LoggerFactory.getLogger(['spy-test']) }).value());

  return server;
};

const postChunked = async (opts: { body: string; contentType: string }) => {
  const { body, contentType } = opts;

  // A ReadableStream body makes the request chunked: no Content-Length is emitted.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  return buildServer().request('/echo', {
    method: 'POST',
    headers: { [HTTP.Headers.CONTENT_TYPE]: contentType },
    body: stream,
    // Required by the runtime for a streamed request body.
    duplex: 'half',
  } as AnyType);
};

describe('RequestSpyMiddleware - a chunked body is still parsed', () => {
  test('valid JSON sent without a Content-Length reaches the handler', async () => {
    const response = await postChunked({
      body: JSON.stringify({ hello: 'world' }),
      contentType: 'application/json',
    });

    expect(response.status).toBe(200);
  });

  test('MALFORMED JSON sent without a Content-Length is a clean 400, not a 500', async () => {
    const response = await postChunked({
      body: '{ not json',
      contentType: 'application/json',
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
  });
});

describe('RequestSpyMiddleware - an empty body is still not parsed', () => {
  test('Content-Length: 0 short-circuits without touching the body', async () => {
    const response = await buildServer().request('/echo', {
      method: 'POST',
      headers: {
        [HTTP.Headers.CONTENT_TYPE]: 'application/json',
        [HTTP.Headers.CONTENT_LENGTH]: '0',
      },
    });

    expect(response.status).toBe(200);
  });

  test('a request with no content-type at all short-circuits', async () => {
    const response = await buildServer().request('/echo', { method: 'POST' });

    expect(response.status).toBe(200);
  });
});

describe('RequestSpyMiddleware - a tracker must never reject the request it tracks', () => {
  test('a request whose client IP cannot be determined is still served', async () => {
    // No socket (unix socket, some proxies, an in-process call): getConnInfo yields nothing and no
    // x-forwarded-for is set. Logging the IP is a best-effort concern - failing to derive one must
    // not turn every request into a 400.
    const response = await buildServer().request('/echo', { method: 'POST' });

    expect(response.status).toBe(200);
  });

  test('an x-forwarded-for still identifies the client', async () => {
    const response = await buildServer().request('/echo', {
      method: 'POST',
      headers: { ['x-forwarded-for']: '203.0.113.7' },
    });

    expect(response.status).toBe(200);
  });
});
