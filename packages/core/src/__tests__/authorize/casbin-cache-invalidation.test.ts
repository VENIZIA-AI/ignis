import { describe, expect, test } from 'bun:test';
import {
  AuthorizationDecisions,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  CasbinAuthorizationEnforcer,
  CasbinEnforcerModelDrivers,
  type IAuthorizationEnforcer,
  type ICasbinEnforcerOptions,
  type TAuthorizationDecision,
} from '@/components/auth/authorize';
import { Container } from '@/helpers/inversion';
import { BaseHelper } from '@venizia/ignis-helpers';
import type { FilteredAdapter, Model } from 'casbin';
import { createFreshRegistry } from './helpers';

// Minimal RBAC model (no domain) — enough to extract p/g policy lines after a filtered load.
const MODEL = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act, eft

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
`;

// None of these tests exercise a context-dependent normalizer/domain resolver, so an empty stub
// stands in for the full Hono-backed TContext that buildRules requires.
const fakeContext = {} as any;

// In-memory stand-in for the ioredis client. Implements only the commands the enforcer touches.
class FakeRedisClient {
  store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}

// FilteredAdapter that loads a fixed set of casbin policy lines, ignoring the filter.
class FakeFilteredAdapter implements FilteredAdapter {
  constructor(private lines: string[]) {}

  async loadPolicy(): Promise<void> {}

  async loadFilteredPolicy(model: Model): Promise<void> {
    const { Helper } = await import('casbin');
    for (const line of this.lines) {
      Helper.loadPolicyLine(line, model);
    }
  }

  isFiltered(): boolean {
    return true;
  }

  async savePolicy(): Promise<boolean> {
    return true;
  }

  async addPolicy(): Promise<void> {}
  async removePolicy(): Promise<void> {}
  async removeFilteredPolicy(): Promise<void> {}
}

// Per-user adapter with a delay, so two concurrent loads interleave at the await — used to expose
// cross-user contamination of the shared casbin model.
class DelayedPerUserAdapter implements FilteredAdapter {
  constructor(private delayMs: number) {}

  async loadPolicy(): Promise<void> {}

  async loadFilteredPolicy(
    model: Model,
    filter: { principal: { type: string; id: string | number } },
  ): Promise<void> {
    const { Helper } = await import('casbin');
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    Helper.loadPolicyLine(
      `p, ${filter.principal.type}_${filter.principal.id}, secret_${filter.principal.id}, read, allow`,
      model,
    );
  }

  isFiltered(): boolean {
    return true;
  }

  async savePolicy(): Promise<boolean> {
    return true;
  }

  async addPolicy(): Promise<void> {}
  async removePolicy(): Promise<void> {}
  async removeFilteredPolicy(): Promise<void> {}
}

const redisOptions = (opts: {
  client: FakeRedisClient;
  adapter?: FilteredAdapter;
}): ICasbinEnforcerOptions => ({
  model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
  adapter: opts.adapter,
  cached: {
    use: true,
    driver: 'redis',
    options: {
      // Fake implements only the 4 methods the redis cache path touches (getClient/get/set/del);
      // the full IRedisHelper surface (hash/set/list/pubsub/json/command ops) is out of scope here.
      connection: {
        getClient: () => opts.client,
        get: ({ key }: { key: string }) => opts.client.get(key),
        set: ({ key, value }: { key: string; value: unknown }) =>
          opts.client.set(key, JSON.stringify(value)),
        del: ({ keys }: { keys: string[] }) => opts.client.del(...keys),
      } as any,
      expiresIn: 60_000,
      keyFn: ({ user }) => `casbin:User:${user.userId}`,
    },
  },
});

describe('CasbinAuthorizationEnforcer — cache invalidation', () => {
  describe('invalidateUserCache', () => {
    test('deletes the user cache key and reports the deleted count', async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:42', JSON.stringify(['p, User_42, data, read, allow']));

      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client }));

      const result = await enforcer.invalidateUserCache({
        user: { principalType: 'User', userId: 42 },
      });

      expect(client.store.has('casbin:User:42')).toBe(false);
      expect(result.invalidatedKeys).toBe(1);
    });

    test('reports zero when the user has no cached entry', async () => {
      const client = new FakeRedisClient();
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client }));

      const result = await enforcer.invalidateUserCache({
        user: { principalType: 'User', userId: 99 },
      });

      expect(result.invalidatedKeys).toBe(0);
    });

    test('throws when the enforcer is not using the redis cache driver', async () => {
      const enforcer = new CasbinAuthorizationEnforcer({
        model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
        cached: { use: false },
      });

      let error: unknown;
      try {
        await enforcer.invalidateUserCache({ user: { principalType: 'User', userId: 1 } });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });

    test('throws (and writes nothing) when keyFn returns an empty cache key', async () => {
      const client = new FakeRedisClient();
      const enforcer = new CasbinAuthorizationEnforcer({
        model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
        cached: {
          use: true,
          driver: 'redis',
          options: {
            // Fake implements only the 4 methods the redis cache path touches (getClient/get/set/
            // del); the full IRedisHelper surface (hash/set/list/pubsub/json/command ops) is out
            // of scope here.
            connection: {
              getClient: () => client,
              get: ({ key }: { key: string }) => client.get(key),
              set: ({ key, value }: { key: string; value: unknown }) =>
                client.set(key, JSON.stringify(value)),
              del: ({ keys }: { keys: string[] }) => client.del(...keys),
            } as any,
            expiresIn: 60_000,
            keyFn: () => '',
          },
        },
      });

      let error: unknown;
      try {
        await enforcer.invalidateUserCache({ user: { principalType: 'User', userId: 1 } });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(client.store.has('')).toBe(false);
    });
  });

  describe('rebuildUserCache', () => {
    test('reloads policies from the adapter and re-caches them as a line array', async () => {
      const client = new FakeRedisClient();
      const adapter = new FakeFilteredAdapter([
        'p, User_42, data, read, allow',
        'g, User_42, role_admin',
      ]);

      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client, adapter }));
      await enforcer.configure();

      const result = await enforcer.rebuildUserCache({
        user: { principalType: 'User', userId: 42 },
      });

      const cached = JSON.parse(client.store.get('casbin:User:42') ?? 'null') as string[];

      expect(result.cacheKey).toBe('casbin:User:42');
      expect(result.lineCount).toBe(2);
      expect(Array.isArray(cached)).toBe(true);
      expect(cached).toContain('p, User_42, data, read, allow');
      expect(cached).toContain('g, User_42, role_admin');
    });

    test('replaces a stale cached entry', async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:42', JSON.stringify(['p, User_42, stale, read, allow']));

      const adapter = new FakeFilteredAdapter(['p, User_42, data, read, allow']);
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client, adapter }));
      await enforcer.configure();

      await enforcer.rebuildUserCache({ user: { principalType: 'User', userId: 42 } });

      const cached = JSON.parse(client.store.get('casbin:User:42') ?? 'null') as string[];
      expect(cached).not.toContain('p, User_42, stale, read, allow');
      expect(cached).toContain('p, User_42, data, read, allow');
    });

    test('concurrent rebuild(A) + buildRules(B) must NOT cross-contaminate caches', async () => {
      const client = new FakeRedisClient();
      const adapter = new DelayedPerUserAdapter(20);
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client, adapter }));
      await enforcer.configure();

      // Run an eager rebuild for A at the same time as a normal cache-miss build for B.
      // With the shared-model design these interleave and each cache ends up with BOTH users' lines.
      await Promise.all([
        enforcer.rebuildUserCache({ user: { principalType: 'User', userId: 'A' } }),
        enforcer.buildRules({ user: { principalType: 'User', userId: 'B' }, context: fakeContext }),
      ]);

      const cacheA = JSON.parse(client.store.get('casbin:User:A') ?? 'null') as string[];
      const cacheB = JSON.parse(client.store.get('casbin:User:B') ?? 'null') as string[];

      // Each user's cache must hold ONLY their own policy line — no leakage of the other user's grant.
      expect(cacheA).toEqual(['p, User_A, secret_A, read, allow']);
      expect(cacheB).toEqual(['p, User_B, secret_B, read, allow']);
    });
  });

  describe('loadPoliciesWithRedisCache — resilience', () => {
    test('loads policy lines from a healthy cache entry without touching the adapter', async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:42', JSON.stringify(['g, User_42, role_admin']));

      // No adapter wired: a cache hit must not need it.
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client }));
      await enforcer.configure();

      await enforcer.buildRules({
        user: { principalType: 'User', userId: 42 },
        context: fakeContext,
      });

      // Unchanged entry → still the same cached array.
      expect(JSON.parse(client.store.get('casbin:User:42') ?? 'null')).toEqual([
        'g, User_42, role_admin',
      ]);
    });

    test('discards a corrupted cache entry and refetches from the adapter', async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:42', '{ this is not valid json');

      const adapter = new FakeFilteredAdapter(['p, User_42, data, read, allow']);
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client, adapter }));
      await enforcer.configure();

      await enforcer.buildRules({
        user: { principalType: 'User', userId: 42 },
        context: fakeContext,
      });

      // Corrupt entry replaced with a fresh, well-formed line array.
      const cached = JSON.parse(client.store.get('casbin:User:42') ?? 'null') as string[];
      expect(cached).toContain('p, User_42, data, read, allow');
    });

    test('discards a non-array cache payload and refetches from the adapter', async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:42', JSON.stringify({ unexpected: 'shape' }));

      const adapter = new FakeFilteredAdapter(['p, User_42, data, read, allow']);
      const enforcer = new CasbinAuthorizationEnforcer(redisOptions({ client, adapter }));
      await enforcer.configure();

      await enforcer.buildRules({
        user: { principalType: 'User', userId: 42 },
        context: fakeContext,
      });

      const cached = JSON.parse(client.store.get('casbin:User:42') ?? 'null') as string[];
      expect(Array.isArray(cached)).toBe(true);
      expect(cached).toContain('p, User_42, data, read, allow');
    });
  });
});

// No-arg fake enforcers for registry-level delegation tests (avoids DI param-decorator setup).
class FakeInvalidatableEnforcer extends BaseHelper implements IAuthorizationEnforcer {
  name = 'fake-invalidatable';
  static lastInvalidateUser: unknown = null;
  static lastRebuildUser: unknown = null;

  constructor() {
    super({ scope: FakeInvalidatableEnforcer.name });
  }

  configure(): void {}
  buildRules(): unknown {
    return {};
  }
  evaluate(): TAuthorizationDecision {
    return AuthorizationDecisions.ALLOW;
  }

  async invalidateUserCache(opts: { user: unknown }) {
    FakeInvalidatableEnforcer.lastInvalidateUser = opts.user;
    return { invalidatedKeys: 1 };
  }

  async rebuildUserCache(opts: { user: unknown }) {
    FakeInvalidatableEnforcer.lastRebuildUser = opts.user;
    return { cacheKey: 'casbin:User:7', lineCount: 0 };
  }
}

class FakePlainEnforcer extends BaseHelper implements IAuthorizationEnforcer {
  name = 'fake-plain';

  constructor() {
    super({ scope: FakePlainEnforcer.name });
  }

  configure(): void {}
  buildRules(): unknown {
    return {};
  }
  evaluate(): TAuthorizationDecision {
    return AuthorizationDecisions.ALLOW;
  }
}

describe('AuthorizationEnforcerRegistry — cache invalidation delegation', () => {
  test('invalidateUserCache delegates to the resolved enforcer', async () => {
    FakeInvalidatableEnforcer.lastInvalidateUser = null;
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'reg-invalidate' });
    container.bind({ key: AuthorizeBindingKeys.OPTIONS }).toValue({ defaultDecision: 'deny' });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: FakeInvalidatableEnforcer,
          name: 'fake',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const result = await registry.invalidateUserCache({
      user: { principalType: 'User', userId: 7 },
    });

    expect(result.invalidatedKeys).toBe(1);
    expect((FakeInvalidatableEnforcer.lastInvalidateUser as { userId: number }).userId).toBe(7);
  });

  test('rebuildUserCache delegates to the resolved enforcer', async () => {
    FakeInvalidatableEnforcer.lastRebuildUser = null;
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'reg-rebuild' });
    container.bind({ key: AuthorizeBindingKeys.OPTIONS }).toValue({ defaultDecision: 'deny' });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: FakeInvalidatableEnforcer,
          name: 'fake',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const result = await registry.rebuildUserCache({
      user: { principalType: 'User', userId: 7 },
    });

    expect(result.cacheKey).toBe('casbin:User:7');
    expect((FakeInvalidatableEnforcer.lastRebuildUser as { userId: number }).userId).toBe(7);
  });

  test('throws when the resolved enforcer does not support cache invalidation', async () => {
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'reg-plain' });
    container.bind({ key: AuthorizeBindingKeys.OPTIONS }).toValue({ defaultDecision: 'deny' });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: FakePlainEnforcer,
          name: 'plain',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    let error: unknown;
    try {
      await registry.invalidateUserCache({
        user: { principalType: 'User', userId: 7 },
        enforcerName: 'plain',
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
  });
});
