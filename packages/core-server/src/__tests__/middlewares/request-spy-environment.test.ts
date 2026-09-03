// Set BEFORE the import: `RequestSpyMiddleware` reads `NODE_ENV` in its constructor, and the
// constructor runs when a test builds one - but the module-level import has to see the same value
// the rest of the file assumes.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { RequestSpyMiddleware } from '@/base/middlewares/request-spy/request-spy.middleware';

/**
 * Body logging is fail-CLOSED on environment.
 *
 * It used to test `env !== 'production'`, so an unset `NODE_ENV` and every pre-production name that
 * carries real user data - `staging`, `uat`, `alpha`, `beta`, and the abbreviation `prod` - logged
 * full request bodies at info level. Redaction is no defence: it masks secret-SHAPED keys, and a
 * `nationalId` or a `cardNumber` is not one.
 *
 * `BaseAppErrorMiddleware.isProduction` has always been documented fail-closed. This pins the same
 * posture for the spy.
 */
const SENSITIVE_BODY = {
  firstName: 'A',
  nationalId: '079123456789',
  cardNumber: '4111111111111111',
};

const captureLoggedLines = async (opts: { environment?: string }): Promise<string> => {
  if (opts.environment === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = opts.environment;
  }

  const middleware = new RequestSpyMiddleware();
  const captured: AnyType[][] = [];

  (middleware as AnyType).logger = {
    info: (...args: AnyType[]) => {
      captured.push(args);
    },
    error: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
  };

  const application = new Hono();
  application.use(middleware.value());
  application.post('/users', context => context.json({ ok: true }));

  await application.request('/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(SENSITIVE_BODY),
  });

  return JSON.stringify(captured);
};

describe('RequestSpyMiddleware body logging', () => {
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  for (const environment of ['staging', 'uat', 'alpha', 'beta', 'prod', 'production']) {
    test(`does NOT log the body in '${environment}'`, async () => {
      const logged = await captureLoggedLines({ environment });
      expect(logged).not.toContain(SENSITIVE_BODY.nationalId);
      expect(logged).not.toContain(SENSITIVE_BODY.cardNumber);
    });
  }

  test('does NOT log the body when NODE_ENV is unset', async () => {
    const logged = await captureLoggedLines({ environment: undefined });
    expect(logged).not.toContain(SENSITIVE_BODY.nationalId);
  });

  for (const environment of ['local', 'development', 'dev', 'debug', 'sit']) {
    test(`logs the body in '${environment}', which is what the flag is for`, async () => {
      const logged = await captureLoggedLines({ environment });
      expect(logged).toContain(SENSITIVE_BODY.nationalId);
    });
  }
});
