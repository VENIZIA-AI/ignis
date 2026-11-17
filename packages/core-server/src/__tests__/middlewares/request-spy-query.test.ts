import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { RedactUtility } from '@venizia/ignis-helpers/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/** The query string is logged on every request in every environment: credential-looking parameters must not reach the line. */
const logRequest = async (url: string): Promise<string> => {
  const middleware = new RequestSpyMiddleware();
  const captured: unknown[][] = [];

  const logger: ILogger = {
    info: (...args: unknown[]) => {
      captured.push(args);
    },
    error: () => {},
    warn: () => {},
    debug: () => {},
    emerg: () => {},
    log: () => {},
    for: () => logger,
  };
  middleware.logger = logger;

  const application = new Hono();
  application.use(middleware.value());
  application.get('/callback', (context) => context.json({ ok: true }));

  await application.request(url);

  // What the logger prints for a `%j` argument.
  return JSON.stringify(
    captured.map((args) => args.map((arg) => RedactUtility.toJsonSafe({ value: arg }))),
  );
};

describe('RequestSpyMiddleware - the logged query string', () => {
  test('an OAuth callback code and state are masked', async () => {
    const line = await logRequest('/callback?code=AUTHCODE123&state=STATE456&page=2');

    expect(line).not.toContain('AUTHCODE123');
    expect(line).not.toContain('STATE456');
    expect(line).toContain('"page":"2"');
  });

  test.each(['jwt', 'signature', 'sessionId', 'access_token', 'api_key'])(
    'a %s parameter is masked',
    async (name) => {
      const line = await logRequest(`/callback?${name}=SECRETVALUE`);

      expect(line).not.toContain('SECRETVALUE');
    },
  );

  test('ordinary parameters are logged as before', async () => {
    const line = await logRequest('/callback?page=2&sort=name&q=shoes');

    expect(line).toContain('"page":"2"');
    expect(line).toContain('"q":"shoes"');
  });
});
