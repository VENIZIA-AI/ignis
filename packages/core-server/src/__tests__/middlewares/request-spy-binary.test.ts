import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/**
 * The spy never drains a body it does not own, in any environment. A handler that streams
 * `req.raw.body` on - an upload proxy - receives every byte unchanged, and a text body stays
 * readable after the spy, including one an earlier middleware already read.
 */
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Bytes that are not valid UTF-8, so a text round trip would change them.
const BINARY = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x80, 0x00, 0xc3, 0x28]);

const buildServer = (opts: {
  environment: string;
  captured?: AnyType[][];
  readsBodyFirst?: boolean;
}) => {
  process.env.NODE_ENV = opts.environment;
  const middleware = new RequestSpyMiddleware();

  if (opts.captured) {
    const captured = opts.captured;
    (middleware as AnyType).logger = {
      info: (...args: AnyType[]) => captured.push(args),
      error: () => {},
      warn: () => {},
      debug: () => {},
      trace: () => {},
    };
  }

  const server = new Hono();
  // Registered ahead of the spy, as a webhook signature check is: it reads through Hono's cache.
  if (opts.readsBodyFirst) {
    server.use(async (context, next) => {
      await context.req.text();
      await next();
    });
  }
  server.use(middleware.value());
  // Reads the RAW stream, as a proxy does.
  server.put('/upload', async context => {
    const bytes = new Uint8Array(await new Response(context.req.raw.body).arrayBuffer());
    return context.json({ bytes: Array.from(bytes) });
  });
  server.post('/text', async context => context.json({ text: await context.req.raw.text() }));
  server.post('/signed', async context => context.json({ text: await context.req.text() }));

  return server;
};

describe('RequestSpyMiddleware - bodies it does not parse reach the handler untouched', () => {
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  for (const environment of ['production', 'development']) {
    test(`a binary upload streams through byte for byte in '${environment}'`, async () => {
      const response = await buildServer({ environment }).request('/upload', {
        method: 'PUT',
        headers: { 'content-type': XLSX_TYPE, 'content-length': String(BINARY.length) },
        body: BINARY,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ bytes: Array.from(BINARY) });
    });

    test(`a text body is still readable from the raw request in '${environment}'`, async () => {
      const response = await buildServer({ environment }).request('/text', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: 'id,name\n1,IGNIS',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ text: 'id,name\n1,IGNIS' });
    });

    test(`a text body an earlier middleware read reaches the handler intact in '${environment}'`, async () => {
      const response = await buildServer({ environment, readsBodyFirst: true }).request('/signed', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'signed payload',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ text: 'signed payload' });
    });
  }

  test('development logs a binary body as its size and type, never its bytes', async () => {
    const captured: AnyType[][] = [];

    await buildServer({ environment: 'development', captured }).request('/upload', {
      method: 'PUT',
      headers: { 'content-type': XLSX_TYPE, 'content-length': String(BINARY.length) },
      body: BINARY,
    });

    const logged = JSON.stringify(captured);
    expect(logged).toContain(`${BINARY.length} bytes`);
    expect(logged).toContain(XLSX_TYPE);
  });

  test('development still logs a text body', async () => {
    const captured: AnyType[][] = [];

    await buildServer({ environment: 'development', captured }).request('/text', {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: 'id,name\n1,IGNIS',
    });

    expect(JSON.stringify(captured)).toContain('1,IGNIS');
  });
});
