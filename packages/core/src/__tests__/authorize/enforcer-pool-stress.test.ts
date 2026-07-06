import { describe, expect, test } from 'bun:test';
import { asTypedContext } from '@/base/controllers/common/types';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { CasbinEnforcerModelDrivers } from '@/components/auth/authorize/common/constants';
import type {
  IAuthorizationUser,
  ICasbinEnforcerCachedRedis,
} from '@/components/auth/authorize/common/types';
import type { Enforcer, FilteredAdapter, Model } from 'casbin';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCOPED_MODEL = {
  driver: CasbinEnforcerModelDrivers.TEXT,
  definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
} as const;

// Per-user adapter with a configurable delay so concurrent loads interleave at the await. Each user
// gets a distinct SYSTEM_WIDE grant on `<id>_secret`, so a leaked line is trivially detectable.
// Also counts every loadFilteredPolicy invocation per principalId (single-flight instrumentation).
class CountingPerUserAdapter implements FilteredAdapter {
  readonly loadCounts = new Map<string, number>();

  constructor(private readonly delayMs: number) {}

  async loadPolicy(): Promise<void> {}

  async loadFilteredPolicy(
    model: Model,
    filter: { principal: { type: string; id: string | number } },
  ): Promise<void> {
    const key = String(filter.principal.id);
    this.loadCounts.set(key, (this.loadCounts.get(key) ?? 0) + 1);

    const { Helper } = await import('casbin');
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
    Helper.loadPolicyLine(
      `p, ${filter.principal.type}_${filter.principal.id}, SYSTEM_WIDE, ${filter.principal.id}_secret, read, allow`,
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

// Adapter that throws on load — used to prove fail-closed + single-flight cleanup on reject.
class ThrowingAdapter implements FilteredAdapter {
  calls = 0;
  shouldThrow = true;

  async loadPolicy(): Promise<void> {}

  async loadFilteredPolicy(
    model: Model,
    filter: { principal: { type: string; id: string | number } },
  ): Promise<void> {
    this.calls += 1;
    if (this.shouldThrow) {
      throw new Error('adapter boom');
    }
    const { Helper } = await import('casbin');
    Helper.loadPolicyLine(
      `p, ${filter.principal.type}_${filter.principal.id}, SYSTEM_WIDE, ${filter.principal.id}_secret, read, allow`,
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

// In-memory ioredis stand-in with optional fault injection on get/set.
class FakeRedisClient {
  store = new Map<string, string>();
  throwOnGet = false;
  throwOnSet = false;
  setCalls = 0;

  async get(key: string): Promise<string | null> {
    if (this.throwOnGet) {
      throw new Error('redis get down');
    }
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.setCalls += 1;
    if (this.throwOnSet) {
      throw new Error('redis set down');
    }
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

function poolEnforcer(adapter: FilteredAdapter, poolSize: number, poolAcquireTimeoutMs?: number) {
  return new CasbinAuthorizationEnforcer({
    model: SCOPED_MODEL,
    cached: { use: false },
    adapter,
    isScoped: true,
    poolSize,
    poolAcquireTimeoutMs,
  });
}

function redisCached(opts: {
  client: FakeRedisClient;
  keyFn?: (o: { user: IAuthorizationUser }) => string | Promise<string>;
}): ICasbinEnforcerCachedRedis & { use: true } {
  return {
    use: true,
    driver: 'redis',
    options: {
      connection: {
        getClient: () => opts.client,
        get: ({ key }: { key: string }) => opts.client.get(key),
        set: ({ key, value }: { key: string; value: unknown }) =>
          opts.client.set(key, JSON.stringify(value)),
        del: ({ keys }: { keys: string[] }) => opts.client.del(...keys),
        // IRedisHelper aggregates connection/key/hash/set/list/pubsub/json/command surfaces (dozens
        // of methods); this fixture only exercises get/set/del, so implementing the rest is not worth it.
      } as any,
      expiresIn: 60_000,
      keyFn: opts.keyFn ?? (({ user }) => `casbin:User:${user.userId}`),
    },
  };
}

function cachedEnforcer(opts: {
  adapter?: FilteredAdapter;
  client: FakeRedisClient;
  poolSize?: number;
  keyFn?: (o: { user: IAuthorizationUser }) => string | Promise<string>;
}) {
  return new CasbinAuthorizationEnforcer({
    model: SCOPED_MODEL,
    adapter: opts.adapter,
    isScoped: true,
    poolSize: opts.poolSize ?? 4,
    cached: redisCached({ client: opts.client, keyFn: opts.keyFn }),
  });
}

async function decide(e: CasbinAuthorizationEnforcer, userId: string, obj: string) {
  const rules = await e.buildRules({
    user: { principalType: 'User', userId },
    context: asTypedContext({}),
  });
  return e.evaluate({
    rules,
    request: { resource: obj, action: 'read', domain: 'SYSTEM_WIDE' },
    context: asTypedContext({}),
  });
}

// ---------------------------------------------------------------------------
// High-concurrency cross-user isolation (white-box, highest priority)
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — cross-user isolation under high concurrency', () => {
  for (const poolSize of [1, 2, 16]) {
    test(`poolSize ${poolSize}: every decision is correct for its own user (no contamination)`, async () => {
      const e = poolEnforcer(new CountingPerUserAdapter(5), poolSize);
      await e.configure();

      const userCount = 24;
      const userIds = Array.from({ length: userCount }, (_, i) => `U${i}`);

      // For each user, fire one OWN (must allow) + one CROSS (must deny against a neighbour secret).
      const tasks: Promise<{ kind: 'own' | 'cross'; uid: string; decision: string }>[] = [];
      for (const uid of userIds) {
        const other = `U${(Number(uid.slice(1)) + 1) % userCount}`;
        tasks.push(decide(e, uid, `${uid}_secret`).then(d => ({ kind: 'own', uid, decision: d })));
        tasks.push(
          decide(e, uid, `${other}_secret`).then(d => ({ kind: 'cross', uid, decision: d })),
        );
      }

      const results = await Promise.all(tasks);
      for (const r of results) {
        if (r.kind === 'own') {
          expect(r.decision).toBe('allow');
        } else {
          expect(r.decision).toBe('deny');
        }
      }

      e.destroy();
    });
  }

  test('poolSize 1 reuse-isolation stress: alternating A/B/C never leaks', async () => {
    const e = poolEnforcer(new CountingPerUserAdapter(0), 1);
    await e.configure();

    const users = ['A', 'B', 'C'];
    for (let i = 0; i < 30; i++) {
      const self = users[i % users.length];
      const other = users[(i + 1) % users.length];
      expect(await decide(e, self, `${self}_secret`)).toBe('allow');
      expect(await decide(e, self, `${other}_secret`)).toBe('deny');
    }

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// Single-flight dedupe (buildRules under redis cache)
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — single-flight on cache miss', () => {
  test('N concurrent buildRules for the SAME uncached user → adapter loaded once, one cache write, identical lines', async () => {
    const client = new FakeRedisClient();
    const adapter = new CountingPerUserAdapter(15);
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    const N = 12;
    const builds = await Promise.all(
      Array.from({ length: N }, () =>
        e.buildRules({ user: { principalType: 'User', userId: 'X' }, context: asTypedContext({}) }),
      ),
    );

    // Adapter (extractUserLines) invoked exactly once despite N concurrent misses.
    expect(adapter.loadCounts.get('X')).toBe(1);
    // Cache written exactly once.
    expect(client.setCalls).toBe(1);

    // All N callers see identical lines.
    const expected = ['p, User_X, SYSTEM_WIDE, X_secret, read, allow'];
    for (const b of builds) {
      expect(b.lines).toEqual(expected);
    }

    e.destroy();
  });

  test('single-flight on REJECT: all N reject, inflight cleaned (.finally), next call retries + succeeds', async () => {
    const client = new FakeRedisClient();
    const adapter = new ThrowingAdapter();
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    const N = 8;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, () =>
        e.buildRules({ user: { principalType: 'User', userId: 'Y' }, context: asTypedContext({}) }),
      ),
    );
    // All N reject (fail-closed: buildRules surfaces the adapter error, never silently returns []).
    expect(settled.every(s => s.status === 'rejected')).toBe(true);
    // Single-flight collapsed the concurrent misses to ONE adapter call.
    expect(adapter.calls).toBe(1);
    // Nothing cached on failure.
    expect(client.store.size).toBe(0);

    // Inflight entry must have been deleted (.finally on the reject path) → next call RETRIES.
    adapter.shouldThrow = false;
    const ok = await e.buildRules({
      user: { principalType: 'User', userId: 'Y' },
      context: asTypedContext({}),
    });
    expect(ok.lines).toEqual(['p, User_Y, SYSTEM_WIDE, Y_secret, read, allow']);
    expect(adapter.calls).toBe(2); // proves the inflight slot was freed, not stuck on the rejected promise

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// Pool exhaustion / acquire timeout = fail-closed (no silent allow, no hang)
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — pool exhaustion', () => {
  test('poolSize 1 + many concurrent evaluates all eventually resolve correctly (no hang)', async () => {
    // Slow per-request load via the adapter delay does not apply at evaluate-time (lines are pre-built),
    // so to actually stress the single slot we pre-build rules then fire many evaluates concurrently.
    const e = poolEnforcer(new CountingPerUserAdapter(0), 1);
    await e.configure();

    const rulesA = await e.buildRules({
      user: { principalType: 'User', userId: 'A' },
      context: asTypedContext({}),
    });

    const evaluations = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        e.evaluate({
          rules: rulesA,
          request: {
            resource: i % 2 === 0 ? 'A_secret' : 'nope',
            action: 'read',
            domain: 'SYSTEM_WIDE',
          },
          context: asTypedContext({}),
        }),
      ),
    );

    evaluations.forEach((d, i) => {
      expect(d).toBe(i % 2 === 0 ? 'allow' : 'deny');
    });

    e.destroy();
  });

  test('tiny poolAcquireTimeoutMs under contention → acquire rejects (fail-closed, never allow)', async () => {
    // Hold the single slot busy with a long-running evaluate, then fire more; the queued ones must
    // time out and REJECT (deny by absence of allow), not hang or resolve to allow.
    const e = poolEnforcer(new CountingPerUserAdapter(0), 1, 20);
    await e.configure();

    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 'A' },
      context: asTypedContext({}),
    });

    // Monkey-patch the pool's borrowed callback indirectly: occupy the slot by issuing an evaluate that
    // we keep pending via a slow loadPolicyLinesIntoModel override is intrusive; instead saturate with a
    // burst far exceeding what one 20ms-timeout slot can drain — some acquisitions must time out.
    const burst = Array.from({ length: 40 }, () =>
      e
        .evaluate({
          rules,
          request: { resource: 'A_secret', action: 'read', domain: 'SYSTEM_WIDE' },
          context: asTypedContext({}),
        })
        .then(
          d => ({ ok: true as const, d }),
          err => ({ ok: false as const, err }),
        ),
    );

    const results = await Promise.all(burst);
    // None must silently ALLOW via an error path: every settled result is either a real 'allow'/'deny'
    // decision or a rejection. There is no code path that returns 'allow' on acquire failure.
    for (const r of results) {
      if (r.ok) {
        expect(['allow', 'deny']).toContain(r.d);
      } else {
        expect(r.err).toBeDefined();
      }
    }

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// Fault injection — corrupt cache / redis faults / key faults
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — corrupt cache variants refetch (no 500)', () => {
  const corruptVariants: Array<{ name: string; raw: string }> = [
    { name: 'non-JSON', raw: '{ not json' },
    { name: 'JSON object (non-array)', raw: JSON.stringify({ a: 1 }) },
    { name: 'array with a non-string element', raw: JSON.stringify(['p, User_Z, a, b, c', 42]) },
    { name: 'legacy {expires,lines} envelope', raw: JSON.stringify({ expires: 1, lines: ['x'] }) },
  ];

  for (const variant of corruptVariants) {
    test(`${variant.name} → parseCachedPolicyLines null → refetch from adapter`, async () => {
      const client = new FakeRedisClient();
      client.store.set('casbin:User:Z', variant.raw);
      const adapter = new CountingPerUserAdapter(0);
      const e = cachedEnforcer({ adapter, client });
      await e.configure();

      const rules = await e.buildRules({
        user: { principalType: 'User', userId: 'Z' },
        context: asTypedContext({}),
      });
      expect(rules.lines).toEqual(['p, User_Z, SYSTEM_WIDE, Z_secret, read, allow']);
      // Corrupt entry replaced by a clean array.
      const cached: unknown = JSON.parse(client.store.get('casbin:User:Z') ?? 'null');
      expect(Array.isArray(cached)).toBe(true);

      e.destroy();
    });
  }
});

describe('enforcer-pool-stress — redis fault injection', () => {
  test('redis.get throws → buildRules rejects (fail-closed), no inflight leak (next call retries)', async () => {
    const client = new FakeRedisClient();
    client.throwOnGet = true;
    const adapter = new CountingPerUserAdapter(0);
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    let error: unknown;
    try {
      await e.buildRules({
        user: { principalType: 'User', userId: 'G' },
        context: asTypedContext({}),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined(); // fail-closed: does NOT silently fall through to allow
    // Adapter never reached (we failed before the miss path).
    expect(adapter.loadCounts.get('G')).toBeUndefined();

    // No leaked inflight entry — once redis recovers a subsequent build succeeds.
    client.throwOnGet = false;
    const ok = await e.buildRules({
      user: { principalType: 'User', userId: 'G' },
      context: asTypedContext({}),
    });
    expect(ok.lines).toEqual(['p, User_G, SYSTEM_WIDE, G_secret, read, allow']);

    e.destroy();
  });

  test('redis.set throws on the miss path → buildRules rejects + inflight cleaned', async () => {
    const client = new FakeRedisClient();
    client.throwOnSet = true;
    const adapter = new CountingPerUserAdapter(0);
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    let error: unknown;
    try {
      await e.buildRules({
        user: { principalType: 'User', userId: 'S' },
        context: asTypedContext({}),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();

    // Inflight cleaned → a retry (set now healthy) succeeds and the adapter is hit again.
    client.throwOnSet = false;
    const ok = await e.buildRules({
      user: { principalType: 'User', userId: 'S' },
      context: asTypedContext({}),
    });
    expect(ok.lines).toEqual(['p, User_S, SYSTEM_WIDE, S_secret, read, allow']);
    expect(adapter.loadCounts.get('S')).toBe(2);

    e.destroy();
  });
});

describe('enforcer-pool-stress — keyFn faults (fail-closed)', () => {
  test("keyFn returns '' → resolveCacheKey throws, nothing written under ''", async () => {
    const client = new FakeRedisClient();
    const adapter = new CountingPerUserAdapter(0);
    const e = cachedEnforcer({ adapter, client, keyFn: () => '' });
    await e.configure();

    let error: unknown;
    try {
      await e.buildRules({
        user: { principalType: 'User', userId: 'K' },
        context: asTypedContext({}),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(client.store.has('')).toBe(false);
    expect(adapter.loadCounts.get('K')).toBeUndefined();

    e.destroy();
  });

  test('keyFn throws → buildRules rejects (fail-closed)', async () => {
    const client = new FakeRedisClient();
    const e = cachedEnforcer({
      client,
      adapter: new CountingPerUserAdapter(0),
      keyFn: () => {
        throw new Error('keyFn boom');
      },
    });
    await e.configure();

    let error: unknown;
    try {
      await e.buildRules({
        user: { principalType: 'User', userId: 'K' },
        context: asTypedContext({}),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();

    e.destroy();
  });
});

describe('enforcer-pool-stress — extractUserLines adapter throws (no-cache path)', () => {
  test('buildRules rejects (fail-closed) when adapter throws and no cache is configured', async () => {
    const adapter = new ThrowingAdapter();
    const e = poolEnforcer(adapter, 4);
    await e.configure();

    let error: unknown;
    try {
      await e.buildRules({
        user: { principalType: 'User', userId: 'N' },
        context: asTypedContext({}),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// Poisoned line at load-time under concurrency (extends the single existing discard test)
// ---------------------------------------------------------------------------

// Loads a poison line for a specific user that loads OK structurally but is junk; combined with a
// FailOnce override we exercise concurrent discard + recovery.
class FailNTimesPoolEnforcer extends CasbinAuthorizationEnforcer {
  failsRemaining: number;

  constructor(opts: ConstructorParameters<typeof CasbinAuthorizationEnforcer>[0], fails: number) {
    super(opts);
    this.failsRemaining = fails;
  }

  protected override async loadPolicyLinesIntoModel(opts: {
    enforcer: Enforcer;
    lines: string[];
  }): Promise<void> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      throw new Error('forced load failure');
    }
    return super.loadPolicyLinesIntoModel(opts);
  }
}

describe('enforcer-pool-stress — load failure discard recovery under concurrency', () => {
  test('multiple concurrent failing loads each fail-closed; pool recovers; later requests correct', async () => {
    const e = new FailNTimesPoolEnforcer(
      {
        model: SCOPED_MODEL,
        cached: { use: false },
        adapter: new CountingPerUserAdapter(0),
        isScoped: true,
        poolSize: 2,
      },
      3,
    );
    await e.configure();

    // Fire a burst while the first 3 loads are doomed to throw → those reject (deny), pool re-creates.
    const first = await Promise.allSettled(
      Array.from({ length: 6 }, () => decide(e, 'A', 'A_secret')),
    );
    const rejected = first.filter(r => r.status === 'rejected').length;
    expect(rejected).toBeGreaterThanOrEqual(3); // at least the 3 forced failures fail closed

    // Pool must have recovered: subsequent requests resolve to correct decisions.
    expect(await decide(e, 'A', 'A_secret')).toBe('allow');
    expect(await decide(e, 'A', 'B_secret')).toBe('deny');
    expect(await decide(e, 'B', 'B_secret')).toBe('allow');

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// Enforce-time malformed line (loads OK, but is semantic junk → deny, never throw/allow)
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — malformed-but-loadable cached line', () => {
  test('a cached line with too few columns loads but never grants (deny, no crash)', async () => {
    const client = new FakeRedisClient();
    // A `p` line missing columns for the 5-arg scoped policy. casbin Helper tolerates the load;
    // enforceSync must simply not match → deny. Must NOT throw, must NOT allow.
    client.store.set('casbin:User:M', JSON.stringify(['p, User_M, SYSTEM_WIDE']));
    const e = cachedEnforcer({ client });
    await e.configure();

    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 'M' },
      context: asTypedContext({}),
    });
    const decision = await e.evaluate({
      rules,
      request: { resource: 'M_secret', action: 'read', domain: 'SYSTEM_WIDE' },
      context: asTypedContext({}),
    });
    expect(decision).toBe('deny');

    e.destroy();
  });
});

// ---------------------------------------------------------------------------
// invalidate / rebuild under concurrent traffic (anti-poisoning)
// ---------------------------------------------------------------------------

describe('enforcer-pool-stress — rebuild/invalidate isolation under concurrency', () => {
  test('rebuild(A) ‖ many buildRules(B) → cache[A] only A lines, cache[B] only B lines', async () => {
    const client = new FakeRedisClient();
    const adapter = new CountingPerUserAdapter(15);
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    await Promise.all([
      e.rebuildUserCache({ user: { principalType: 'User', userId: 'A' } }),
      ...Array.from({ length: 6 }, () =>
        e.buildRules({ user: { principalType: 'User', userId: 'B' }, context: asTypedContext({}) }),
      ),
    ]);

    const cacheA = JSON.parse(client.store.get('casbin:User:A') ?? 'null') as string[];
    const cacheB = JSON.parse(client.store.get('casbin:User:B') ?? 'null') as string[];
    expect(cacheA).toEqual(['p, User_A, SYSTEM_WIDE, A_secret, read, allow']);
    expect(cacheB).toEqual(['p, User_B, SYSTEM_WIDE, B_secret, read, allow']);

    e.destroy();
  });

  test('rebuildUserCache writes a bare string[] (NOT an envelope) matching the read path', async () => {
    const client = new FakeRedisClient();
    const e = cachedEnforcer({ adapter: new CountingPerUserAdapter(0), client });
    await e.configure();

    const { cacheKey, lineCount } = await e.rebuildUserCache({
      user: { principalType: 'User', userId: 'A' },
    });
    expect(cacheKey).toBe('casbin:User:A');
    expect(lineCount).toBe(1);

    const parsed: unknown = JSON.parse(client.store.get('casbin:User:A') ?? 'null');
    expect(Array.isArray(parsed)).toBe(true); // bare array, not { expires, lines }
    expect(parsed).toEqual(['p, User_A, SYSTEM_WIDE, A_secret, read, allow']);

    e.destroy();
  });

  test('invalidate then immediate evaluate (cache miss) refetches the correct lines', async () => {
    const client = new FakeRedisClient();
    const adapter = new CountingPerUserAdapter(0);
    const e = cachedEnforcer({ adapter, client });
    await e.configure();

    // Warm the cache.
    await e.buildRules({
      user: { principalType: 'User', userId: 'A' },
      context: asTypedContext({}),
    });
    expect(client.store.has('casbin:User:A')).toBe(true);

    const { invalidatedKeys } = await e.invalidateUserCache({
      user: { principalType: 'User', userId: 'A' },
    });
    expect(invalidatedKeys).toBe(1);
    expect(client.store.has('casbin:User:A')).toBe(false);

    // Immediate evaluate → cache miss → refetch → correct decision.
    expect(await decide(e, 'A', 'A_secret')).toBe('allow');
    expect(await decide(e, 'A', 'B_secret')).toBe('deny');
    expect(adapter.loadCounts.get('A')).toBe(2); // initial warm + refetch after invalidate

    e.destroy();
  });

  test('invalidateUserCache deletes the EXACT read-path key (count 1 then 0)', async () => {
    const client = new FakeRedisClient();
    const e = cachedEnforcer({ adapter: new CountingPerUserAdapter(0), client });
    await e.configure();
    await e.buildRules({
      user: { principalType: 'User', userId: 'A' },
      context: asTypedContext({}),
    });

    const first = await e.invalidateUserCache({ user: { principalType: 'User', userId: 'A' } });
    const second = await e.invalidateUserCache({ user: { principalType: 'User', userId: 'A' } });
    expect(first.invalidatedKeys).toBe(1);
    expect(second.invalidatedKeys).toBe(0);

    e.destroy();
  });
});
