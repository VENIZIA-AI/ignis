import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { Authentication } from '@/base/auth/authenticate/common/constants';
import type { IAuthUser } from '@/base/auth/authenticate/common/types';
import {
  AuthorizationDecisions,
  AuthorizationEnforcerTypes,
  type TAuthorizationDecision,
} from '@/base/auth/authorize/common/constants';
import type {
  IAuthorizationEnforcer,
  IAuthorizationSpec,
} from '@/base/auth/authorize/common/types';
import { AuthorizationEnforcerRegistry } from '@/base/auth/authorize/enforcers/enforcer-registry';
import { AuthorizationProvider } from '@/base/auth/authorize/providers/authorization.provider';
import { Container } from '@/helpers/inversion/container';

type TTestRule = { action: string; resource: string; effect: 'allow' | 'deny' };

/**
 * Zero-arg enforcer double: unlike a DI-resolved production enforcer, it needs no `@inject`
 * metadata to satisfy the "every container-instantiated param is decorated" rule.
 *
 * Implements the bare (default-generic) `IAuthorizationEnforcer` - `rules` arrives as `unknown` -
 * and casts internally, so its `evaluate`/`buildRules` signatures structurally match the
 * registry's `TClass<IAuthorizationEnforcer>` slot instead of fighting method-parameter variance
 * over a narrower `TRules`.
 */
class TestAuthorizationEnforcer implements IAuthorizationEnforcer {
  name = 'test';

  static rules: TTestRule[] = [];

  configure(): void {}

  async buildRules(): Promise<unknown> {
    return TestAuthorizationEnforcer.rules;
  }

  async evaluate(opts: {
    rules: unknown;
    request: { action: string; resource: string };
  }): Promise<TAuthorizationDecision> {
    const rules = opts.rules as TTestRule[];
    const matching = rules.filter(
      rule => rule.action === opts.request.action && rule.resource === opts.request.resource,
    );

    if (matching.length === 0) {
      return AuthorizationDecisions.ABSTAIN;
    }

    return matching.some(rule => rule.effect === 'deny')
      ? AuthorizationDecisions.DENY
      : AuthorizationDecisions.ALLOW;
  }

  static reset(): void {
    TestAuthorizationEnforcer.rules = [];
  }
}

/** Records instead of printing: the ALLOW-path assertions below are about which LEVEL the no-enforcer branch logs at, which a silenced logger cannot answer. */
class RecordingLogger implements ILogger {
  readonly lines: Array<{ sink: TLogLevel; message: string; args: AnyType[] }> = [];

  debug(message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: 'debug', message, args });
  }

  info(message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: 'info', message, args });
  }

  warn(message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: 'warn', message, args });
  }

  error(message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: 'error', message, args });
  }

  emerg(message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: 'emerg', message, args });
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]): void {
    this.lines.push({ sink: level, message, args });
  }

  for(_methodName: string): ILogger {
    return this;
  }
}

const createContext = (opts: { user?: IAuthUser; path?: string }) => {
  const store = new Map<string, unknown>();

  if (opts.user !== undefined) {
    store.set(Authentication.CURRENT_USER, opts.user);
  }

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: { path: opts.path ?? '/orders' },
    _store: store,
  };
};

const run = async (opts: {
  provider: AuthorizationProvider;
  spec: IAuthorizationSpec;
  context: ReturnType<typeof createContext>;
}): Promise<{ hasCalledNext: boolean; error?: unknown }> => {
  const middleware = opts.provider.value()({ spec: opts.spec });

  let hasCalledNext = false;
  const next = async () => {
    hasCalledNext = true;
  };

  try {
    // Partial fake cast to the real Hono Context the middleware expects, matching the existing
    // provider test style rather than reimplementing the full Context shape.
    await middleware(opts.context as AnyType, next);
    return { hasCalledNext };
  } catch (error) {
    return { hasCalledNext, error };
  }
};

describe('AuthorizationProvider - no-enforcer branch honours defaultDecision', () => {
  let registry: AuthorizationEnforcerRegistry;

  beforeEach(() => {
    registry = AuthorizationEnforcerRegistry.getInstance();
    registry.reset();
    TestAuthorizationEnforcer.reset();
  });

  afterEach(() => {
    registry.reset();
  });

  test('defaultDecision unset -> denies, naming the missing enforcer rather than a generic denial', async () => {
    const provider = new AuthorizationProvider();
    const context = createContext({ user: { userId: 'u1' } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: { action: 'read', resource: 'Order' },
      context,
    });

    expect(hasCalledNext).toBe(false);
    expect(isApplicationError(error)).toBe(true);
    if (isApplicationError(error)) {
      expect(error.statusCode).toBe(403);
      expect(error.normalized.code).toBe('core.authorization.enforcer_not_registered');
      expect(error.message.toLowerCase()).toContain('enforcer');
    }
  });

  test('defaultDecision: allow -> proceeds and logs a warning, not a debug line', async () => {
    // setOptions is the path AuthorizeComponent uses, so this exercises the real wiring rather
    // than a stub - options must be readable with zero enforcers registered.
    registry.setOptions({ options: { defaultDecision: AuthorizationDecisions.ALLOW } });

    const provider = new AuthorizationProvider();
    const logger = new RecordingLogger();
    provider.logger = logger;

    const context = createContext({ user: { userId: 'u1' } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: { action: 'read', resource: 'Order' },
      context,
    });

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);

    const debugLines = logger.lines.filter(line => line.sink === 'debug');
    const warnLines = logger.lines.filter(line => line.sink === 'warn');
    expect(debugLines.length).toBe(0);
    expect(warnLines.length).toBe(1);
    expect(warnLines[0].message).toContain('No enforcers registered');
  });

  test('alwaysAllowRoles still grants access - proves the branch was not moved', async () => {
    registry.setOptions({
      options: { defaultDecision: AuthorizationDecisions.DENY, alwaysAllowRoles: ['admin'] },
    });

    const provider = new AuthorizationProvider();
    const context = createContext({ user: { userId: 'u1', roles: ['admin'] } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: { action: 'read', resource: 'Order' },
      context,
    });

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
  });

  test('a voter returning ALLOW still grants access - proves the branch was not moved', async () => {
    const provider = new AuthorizationProvider();
    const context = createContext({ user: { userId: 'u1', principalType: 'user' } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: {
        action: 'read',
        resource: 'Order',
        voters: [async (): Promise<TAuthorizationDecision> => AuthorizationDecisions.ALLOW],
      },
      context,
    });

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
  });

  test('enforcers registered -> unchanged: a matching allow rule still authorizes', async () => {
    const container = new Container({ scope: 'no-enforcer-decision-test-allow' });
    TestAuthorizationEnforcer.rules = [{ action: 'read', resource: 'Order', effect: 'allow' }];
    registry.register({
      container,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'test',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const provider = new AuthorizationProvider();
    const context = createContext({ user: { userId: 'u1', principalType: 'user' } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: { action: 'read', resource: 'Order' },
      context,
    });

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
  });

  test('enforcers registered -> unchanged: ABSTAIN still resolves through defaultDecision (existing DENIED, not the new error)', async () => {
    const container = new Container({ scope: 'no-enforcer-decision-test-abstain' });
    TestAuthorizationEnforcer.rules = [];
    registry.register({
      container,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'test',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const provider = new AuthorizationProvider();
    const context = createContext({ user: { userId: 'u1', principalType: 'user' } });

    const { hasCalledNext, error } = await run({
      provider,
      spec: { action: 'read', resource: 'Order' },
      context,
    });

    expect(hasCalledNext).toBe(false);
    expect(isApplicationError(error)).toBe(true);
    if (isApplicationError(error)) {
      expect(error.normalized.code).toBe('core.authorization.denied');
    }
  });
});
