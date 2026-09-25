import { afterEach, describe, expect, test } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { HTTP } from '@venizia/ignis-helpers/common';
import { AppErrorMiddleware } from '@/base/middlewares/app-error/app-error.middleware';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/**
 * A form body is parsed by the spy only where it is logged. Parsing it anywhere else buffers a whole
 * upload before the route's own size checks and authentication run, and buys nothing: outside
 * development the body is never logged. JSON stays parsed everywhere, because its clean 400 on a
 * malformed payload is a contract.
 */
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const MALFORMED_MULTIPART = 'multipart/form-data; boundary=missing';

const buildServer = (opts: { environment: string }) => {
  process.env.NODE_ENV = opts.environment;
  const server = new OpenAPIHono();

  server.use('*', new RequestSpyMiddleware().value());
  // Answers without reading, so the status says whether the spy read the body first.
  server.post('/echo', context => context.json({ bodyUsed: context.req.raw.bodyUsed }));
  server.onError(new AppErrorMiddleware({ logger: LoggerFactory.getLogger(['spy-form']) }).value());

  return server;
};

const post = (opts: { server: OpenAPIHono; contentType: string; body: string | FormData }) =>
  opts.server.request('/echo', {
    method: 'POST',
    headers: opts.contentType ? { [HTTP.Headers.CONTENT_TYPE]: opts.contentType } : {},
    body: opts.body,
  });

describe('RequestSpyMiddleware - form bodies are parsed only where they are logged', () => {
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  for (const environment of ['production', 'staging']) {
    test(`a multipart body reaches the handler unread in '${environment}'`, async () => {
      const form = new FormData();
      form.append('files', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));

      const response = await post({
        server: buildServer({ environment }),
        contentType: '',
        body: form,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ bodyUsed: false });
    });

    test(`a malformed multipart body is left to the route in '${environment}'`, async () => {
      const response = await post({
        server: buildServer({ environment }),
        contentType: MALFORMED_MULTIPART,
        body: 'not a multipart body',
      });

      expect(response.status).toBe(200);
    });

    test(`an urlencoded body reaches the handler unread in '${environment}'`, async () => {
      const response = await post({
        server: buildServer({ environment }),
        contentType: HTTP.HeaderValues.APPLICATION_FORM_URLENCODED,
        body: 'name=IGNIS',
      });

      expect(await response.json()).toEqual({ bodyUsed: false });
    });

    test(`malformed JSON is still a clean 400 in '${environment}'`, async () => {
      const response = await post({
        server: buildServer({ environment }),
        contentType: HTTP.HeaderValues.APPLICATION_JSON,
        body: '{ not json',
      });

      expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    });
  }

  test('development still parses a multipart body, so a malformed one is a 400 there', async () => {
    const response = await post({
      server: buildServer({ environment: 'development' }),
      contentType: MALFORMED_MULTIPART,
      body: 'not a multipart body',
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.BadRequest);
  });

  test('parseBody itself parses a form in any environment - only value() decides not to call it', async () => {
    process.env.NODE_ENV = 'production';
    const spy = new RequestSpyMiddleware();
    const server = new OpenAPIHono();
    server.post('/parse', async context => context.json(await spy.parseBody({ req: context.req })));

    const response = await server.request('/parse', {
      method: 'POST',
      headers: { [HTTP.Headers.CONTENT_TYPE]: HTTP.HeaderValues.APPLICATION_FORM_URLENCODED },
      body: 'name=IGNIS',
    });

    expect(await response.json()).toEqual({ name: 'IGNIS' });
  });
});
