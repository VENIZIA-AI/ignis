import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import type {
  IAuthenticationStrategy,
  IAuthUser,
  TAuthMode,
} from '@/base/auth/authenticate/common';
import { AuthenticationModes } from '@/base/auth/authenticate/common';
import { AuthenticationProvider } from '@/base/auth/authenticate/providers/authentication.provider';
import { AuthenticationStrategyRegistry } from '@/base/auth/authenticate/strategies/strategy-registry';

/**
 * A verified credential is not yet a user. A strategy that answers without a user id has not authenticated the request
 * in either mode, and in `any` mode the next strategy still gets its turn.
 */
const strategy = (user: Partial<IAuthUser> | Error): IAuthenticationStrategy => ({
  name: 'test',
  authenticate: async () => {
    if (user instanceof Error) {
      throw user;
    }

    return user as IAuthUser;
  },
});

const build = (opts: {
  strategies: Record<string, IAuthenticationStrategy>;
  names: string[];
  mode?: TAuthMode;
  /** Answers with the current user the middleware stored, to assert which strategy won. */
  echoUser?: boolean;
}) => {
  spyOn(AuthenticationStrategyRegistry, 'getInstance').mockReturnValue({
    resolveStrategy: ({ name }: { name: string }) => opts.strategies[name],
  } as unknown as AuthenticationStrategyRegistry);

  const app = new Hono();
  app.onError((error, context) => {
    return context.json(
      { message: error.message },
      ((error as { statusCode?: number }).statusCode ?? 500) as 401 | 500,
    );
  });
  app.get(
    '/profile',
    new AuthenticationProvider().value()({ strategies: opts.names, mode: opts.mode }),
    (context) =>
      context.json({
        ok: true,
        user: opts.echoUser ? context.get('auth.current.user') : undefined,
      }),
  );

  return app;
};

afterEach(() => {
  // `spyOn` on a static is restored by the runner at file end; reset explicitly for the next case.
  (
    AuthenticationStrategyRegistry.getInstance as unknown as { mockRestore?: () => void }
  ).mockRestore?.();
});

describe.each<TAuthMode>([AuthenticationModes.ANY, AuthenticationModes.ALL])(
  'authenticate, %s mode',
  (mode) => {
    test('a user with an id authenticates', async () => {
      const app = build({ strategies: { jwt: strategy({ userId: 'u-1' }) }, names: ['jwt'], mode });
      const response = await app.request('/profile');

      expect(response.status).toBe(200);
    });

    test('a verified credential without a user id does not authenticate', async () => {
      const app = build({
        strategies: {
          jwt: strategy({ purpose: 'password-reset', email: 'a@example.com' } as never),
        },
        names: ['jwt'],
        mode,
      });
      const response = await app.request('/profile');

      expect(response.status).toBe(401);
    });

    test.each([undefined, null, ''])(
      'an empty user id (%p) does not authenticate',
      async (userId) => {
        const app = build({
          strategies: { jwt: strategy({ userId } as never) },
          names: ['jwt'],
          mode,
        });
        const response = await app.request('/profile');

        expect(response.status).toBe(401);
      },
    );
  },
);

describe('authenticate, any mode with several strategies', () => {
  test('a strategy that answers without a user id leaves the next one its turn', async () => {
    const app = build({
      strategies: {
        first: strategy({ purpose: 'invite' } as never),
        second: strategy({ userId: 'u-2' }),
      },
      names: ['first', 'second'],
      echoUser: true,
    });
    const response = await app.request('/profile');
    const result = await response.json();
    const body = result as { user: { userId?: string } };

    expect(response.status).toBe(200);
    expect(body.user.userId).toBe('u-2');
  });

  test('no strategy yields a user id: 401', async () => {
    const app = build({
      strategies: {
        first: strategy({ purpose: 'invite' } as never),
        second: strategy(new Error('no credential')),
      },
      names: ['first', 'second'],
    });
    const response = await app.request('/profile');

    expect(response.status).toBe(401);
  });
});
