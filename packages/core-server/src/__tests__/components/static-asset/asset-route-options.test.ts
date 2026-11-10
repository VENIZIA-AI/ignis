import { StaticAssetRouteOptionsUtility } from '@/components/static-asset/utilities';
import { BodyLimits } from '@venizia/ignis-kernel';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, test } from 'bun:test';

/**
 * The upload route holds its own body limit: `maxFiles` files of `maxBytes` plus multipart framing, so it
 * works above the 5 MiB default and a chunked body, which declares no length, is counted too.
 */

const MAX_BYTES = 100;
const MAX_FILES = 2;
const CEILING =
  MAX_FILES * (MAX_BYTES + StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_PER_FILE) +
  StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_BASE;

const buildApp = () => {
  const app = new Hono();
  const middleware = StaticAssetRouteOptionsUtility.appendLengthGuard({
    middleware: undefined,
    maxBytes: MAX_BYTES,
    maxFiles: MAX_FILES,
  }) as unknown as MiddlewareHandler[];

  app.onError((error, context) =>
    context.json(
      { message: error.message },
      ((error as { statusCode?: number }).statusCode ?? 500) as never,
    ),
  );
  const [guard, limit] = middleware;

  app.post('/upload', guard, limit, async (context) => {
    const text = await context.req.text();

    return context.json({ length: text.length });
  });

  return app;
};

/** No Content-Length: only the counted stream can refuse it. */
const postChunked = (app: Hono, length: number) =>
  app.request('/upload', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(length)));
        controller.close();
      },
    }),
    duplex: 'half',
  } satisfies RequestInit & { duplex: 'half' });

describe('StaticAssetRouteOptionsUtility.appendLengthGuard', () => {
  test('answers the guard first, then the route limit', () => {
    const middleware = StaticAssetRouteOptionsUtility.appendLengthGuard({
      middleware: undefined,
      maxBytes: MAX_BYTES,
      maxFiles: MAX_FILES,
    });

    expect(middleware).toHaveLength(2);
  });

  test('keeps the application middleware ahead of both', () => {
    const own: MiddlewareHandler = async (_context, next) => next();
    const list = StaticAssetRouteOptionsUtility.appendLengthGuard({
      middleware: [own],
      maxBytes: MAX_BYTES,
      maxFiles: MAX_FILES,
    }) as unknown as MiddlewareHandler[];

    expect(list).toHaveLength(3);
    expect(list[0]).toBe(own);
  });

  test('a body up to the ceiling is accepted, chunked or not', async () => {
    const app = buildApp();

    const result = await postChunked(app, CEILING);
    expect(result.status).toBe(200);
  });

  test('a chunked body one byte over the ceiling is a 413', async () => {
    const app = buildApp();

    const result2 = await postChunked(app, CEILING + 1);
    expect(result2.status).toBe(413);
  });

  test('the ceiling is above the default limit when maxBytes is large', () => {
    const large = StaticAssetRouteOptionsUtility.appendLengthGuard({
      middleware: undefined,
      maxBytes: 20 * 1024 * 1024,
      maxFiles: 10,
    });

    // The limit is a route limit: the default stands aside for it.
    expect(large).toHaveLength(2);
    expect(BodyLimits.DEFAULT_MAX_SIZE).toBeLessThan(20 * 1024 * 1024);
  });
});
