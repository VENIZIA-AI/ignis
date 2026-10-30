import { ContextUtility, asTypedContext } from '@/base/controllers/context';
import {
  RequestDomainResolver,
  readDeclarative,
  resolveRequestDomain,
} from '@/base/auth/authorize/providers/request-domain';
import type { TContext } from '@/base/controllers/common/types';
import { InjectableUtility, pickRegistrationOptions } from '@/base/metadata/injectable';
import { EmojiFaviconMiddleware, emojiFavicon } from '@/base/middlewares/emoji-favicon';
import { ModelUtility, snakeToCamel } from '@/base/models/common';
import { ArtifactTypes } from '@/helpers/inversion';
import { ErrorUtility, throwNotSupported } from '@/utilities';
import { z } from '@hono/zod-openapi';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { Env } from 'hono';

/**
 * Each public function that moved into a class stays exported as a deprecated alias until 0.5. The
 * alias must answer exactly as the class does; the mapping test in `namespace-mapping.test.ts`
 * checks the shapes, this file checks the behaviour of the ones that are not covered elsewhere.
 */

const toContext = (opts: { header?: string; param?: string; query?: string; value?: unknown }) => {
  return {
    req: {
      header: () => opts.header,
      param: () => opts.param,
      query: () => opts.query,
    },
    get: () => opts.value,
  } as unknown as TContext<Env, string>;
};

describe('RequestDomainResolver and its deprecated functions', () => {
  const sources = ['param', 'header', 'query', 'context'] as const;

  test('readDeclarative reads each source as the class does', () => {
    const context = toContext({ header: 'h', param: 'p', query: 'q', value: 7 });

    for (const from of sources) {
      const source = { from, key: 'tenant', type: 'Merchant' };

      expect(readDeclarative({ source, context })).toBe(
        RequestDomainResolver.readDeclarative({ source, context }),
      );
    }
    expect(
      RequestDomainResolver.readDeclarative({
        source: { from: 'context', key: 'tenant', type: 'Merchant' },
        context,
      }),
    ).toBe('7');
    expect(
      RequestDomainResolver.readDeclarative({
        source: { from: 'header', key: 'tenant', type: 'Merchant' },
        context: toContext({}),
      }),
    ).toBeNull();
  });

  test('resolveRequestDomain resolves each precedence step as the class does', async () => {
    const context = toContext({ param: '42' });
    const specs = [
      { domain: { from: 'param' as const, key: 'id', type: 'Merchant' } },
      { domain: async () => ({ type: 'Organizer', id: '9' }) },
      { domain: async () => null },
      {},
    ];
    const options = { domainResolver: async () => ({ type: 'Global', id: '1' }) };

    for (const spec of specs) {
      for (const authorizeOptions of [null, options]) {
        const opts = { spec, context, options: authorizeOptions } as Parameters<
          typeof resolveRequestDomain
        >[0];

        const fromFunction = await resolveRequestDomain(opts);
        const fromClass = await RequestDomainResolver.resolveRequestDomain(opts);

        expect(fromFunction).toBe(fromClass);
      }
    }

    const declared = await RequestDomainResolver.resolveRequestDomain({
      spec: specs[0] as never,
      context,
      options: null,
    });
    expect(declared).toBe('Merchant_42');
  });
});

describe('ContextUtility.asTypedContext and the deprecated asTypedContext', () => {
  test('both hand back the same context', () => {
    const context = { marker: true };

    expect(asTypedContext(context)).toBe(context as never);
    expect(ContextUtility.asTypedContext({ context })).toBe(asTypedContext(context));
  });
});

describe('ModelUtility.snakeToCamel and the deprecated snakeToCamel', () => {
  test('both rename the keys of a parsed object', () => {
    const snakeKey = 'first_name';
    const shape = { [snakeKey]: z.string(), age: z.number() };
    const input = { [snakeKey]: 'Ada', age: 36 };

    expect(snakeToCamel(shape).parse(input)).toEqual({ firstName: 'Ada', age: 36 });
    expect(snakeToCamel(shape).parse(input)).toEqual(
      ModelUtility.snakeToCamel({ shape }).parse(input),
    );
  });
});

describe('InjectableUtility.pickRegistrationOptions and the deprecated pickRegistrationOptions', () => {
  test('both copy the registration defaults and leave an absent option absent', () => {
    const metadata = { scope: 'singleton' as const, order: 3, type: ArtifactTypes.SERVICE };

    expect(pickRegistrationOptions({ metadata })).toEqual({ scope: 'singleton', order: 3 });
    expect(pickRegistrationOptions({ metadata })).toEqual(
      InjectableUtility.pickRegistrationOptions({ metadata }),
    );
    expect('binding' in InjectableUtility.pickRegistrationOptions({ metadata })).toBe(false);
  });
});

describe('EmojiFaviconMiddleware.create and the deprecated emojiFavicon', () => {
  const toBody = async (opts: { middleware: ReturnType<typeof emojiFavicon>; path: string }) => {
    const application = new Hono();
    application.use(opts.middleware);
    application.get('/other', (context) => context.text('other'));

    const response = await application.request(opts.path);
    const body = await response.text();
    return { type: response.headers.get('content-type'), body };
  };

  test('both serve the svg on /favicon.ico and let other paths through', async () => {
    const icon = '🔥';

    for (const path of ['/favicon.ico', '/other']) {
      const fromFunction = await toBody({ middleware: emojiFavicon({ icon }), path });
      const fromClass = await toBody({ middleware: EmojiFaviconMiddleware.create({ icon }), path });

      expect(fromFunction).toEqual(fromClass);
    }

    const favicon = await toBody({ middleware: emojiFavicon({ icon }), path: '/favicon.ico' });
    expect(favicon.type).toBe('image/svg+xml');
  });
});

describe('ErrorUtility.throwNotSupported and the deprecated throwNotSupported', () => {
  const toLogger = (opts: { scopes: string[] }) => {
    return {
      for: (scope: string) => {
        opts.scopes.push(scope);
        return { warn: () => undefined };
      },
    } as unknown as ILogger;
  };

  test('both throw the same 501 and log under the method name', () => {
    const scopes: string[] = [];
    const logger = toLogger({ scopes });
    const opts = { scope: 'Probe', feature: 'Transactions', logger };

    const toError = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error as { statusCode: number; message: string };
      }
      throw new Error('did not throw');
    };

    const old = toError(() => throwNotSupported(opts));
    const next = toError(() => ErrorUtility.throwNotSupported(opts));

    expect(old.statusCode).toBe(501);
    expect(next.statusCode).toBe(old.statusCode);
    expect(next.message).toBe(old.message);
    expect(scopes).toEqual(['throwNotSupported', 'throwNotSupported']);
  });
});
