import { BaseAppErrorMiddleware } from '@/base/middlewares';
import { getError } from '@venizia/ignis-helpers/core';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, test } from 'bun:test';

const GENERIC = 'Internal Server Error';
const THROWN = 'Ledger %{ledger} is closed';
const CODE = 'server.sale.ledger.closed';

/** Answers one thrown value through the middleware in the named environment, with what was logged. */
const answer = async (opts: { thrown: Error; environment: string }) => {
  const logged: Array<string> = [];

  const record = (...args: Array<unknown>) => {
    logged.push(args.map(String).join(' '));
  };

  const logger = {
    debug: record,
    info: record,
    warn: record,
    error: record,
    emerg: record,
    log: record,
    for: () => logger,
  };
  const application = new Hono();
  application.use('*', requestId());
  application.get('/x', () => {
    throw opts.thrown;
  });
  application.onError(
    new BaseAppErrorMiddleware({ logger, environment: () => opts.environment }).value(),
  );

  const response = await application.request('/x');

  const result = await response.json();

  return { status: response.status, body: result, logged: logged.join('\n') };
};

const serverError = () =>
  getError({
    statusCode: 503,
    message: THROWN,
    messageCode: CODE,
    messageArgs: { ledger: 'L-9' },
  });

describe('a 5xx error response follows the public message policy', () => {
  test('production answers the generic message and keeps the status and the code', async () => {
    const { status, body, logged } = await answer({
      thrown: serverError(),
      environment: 'production',
    });

    expect(status).toBe(503);
    expect(body).toMatchObject({ message: GENERIC, statusCode: 503 });
    expect(body).toHaveProperty('normalized', { text: GENERIC, code: CODE, args: {} });
    expect(JSON.stringify(body)).not.toContain('Ledger');
    expect(JSON.stringify(body)).not.toContain('L-9');
    expect(logged).toContain(THROWN);
  });

  test('production answers the generic message for a foreign error with a 5xx statusCode', async () => {
    const thrown = Object.assign(new Error('upstream ledger refused'), { statusCode: 502 });
    const { status, body } = await answer({ thrown, environment: 'production' });

    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain('ledger');
  });

  test('the default log lines carry the message args, secrets masked', async () => {
    const thrown = getError({
      statusCode: 503,
      message: THROWN,
      messageArgs: { ledger: 'L-9', apiKey: 'sk_live_ARGS' },
    });
    const { logged } = await answer({ thrown, environment: 'production' });

    expect(logged).toContain('args: ');
    expect(logged).toContain('L-9');
    expect(logged).not.toContain('sk_live_ARGS');
  });

  for (const normalized of ['closed', null, { text: 'closed' }]) {
    test(`production keeps the code when a foreign error carries normalized ${JSON.stringify(normalized)}`, async () => {
      const thrown = Object.assign(new Error('ledger refused'), {
        statusCode: 502,
        messageCode: CODE,
        normalized,
      });
      const { status, body } = await answer({ thrown, environment: 'production' });

      expect(status).toBe(502);
      expect(body).toHaveProperty('normalized', { text: GENERIC, code: CODE, args: {} });
    });
  }

  for (const environment of ['staging', 'test', '']) {
    test(`"${environment}" is not a development environment`, async () => {
      const { body } = await answer({ thrown: serverError(), environment });

      expect(body).toHaveProperty('message', GENERIC);
    });
  }

  test('development answers the thrown message', async () => {
    const { body } = await answer({ thrown: serverError(), environment: 'development' });

    expect(body).toHaveProperty('message', 'Ledger L-9 is closed');
    expect(body).toHaveProperty('normalized.text', THROWN);
  });

  test('production keeps the message of a 4xx', async () => {
    const thrown = getError({ statusCode: 409, message: 'Order is already paid' });
    const { body } = await answer({ thrown, environment: 'production' });

    expect(body).toHaveProperty('message', 'Order is already paid');
  });
});

describe('an error status outside 400-599 answers 500', () => {
  for (const statusCode of [0, 99, 200, 302, 399, 600, 1000, -1, 404.5, Number.NaN]) {
    for (const environment of ['production', 'development'] as const) {
      test(`statusCode ${statusCode} in ${environment}`, async () => {
        const thrown = getError({ statusCode, message: 'Ledger is closed' });
        const { status, body } = await answer({ thrown, environment });

        expect(status).toBe(500);
        expect(body).toHaveProperty('statusCode', 500);
        expect(body).toHaveProperty(
          'message',
          environment === 'production' ? GENERIC : 'Ledger is closed',
        );
      });
    }
  }

  for (const statusCode of [400, 599]) {
    test(`statusCode ${statusCode} is kept`, async () => {
      const thrown = getError({ statusCode, message: 'Ledger is closed' });
      const { status } = await answer({ thrown, environment: 'development' });

      expect(status).toBe(statusCode);
    });
  }
});
