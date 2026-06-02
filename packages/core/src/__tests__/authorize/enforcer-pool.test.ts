import { describe, expect, test } from 'bun:test';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { CasbinEnforcerModelDrivers } from '@/components/auth/authorize/common/constants';
import type { Enforcer, FilteredAdapter, Model } from 'casbin';

// Per-user adapter with a delay so two loads interleave; each user gets a distinct secret resource.
// Emits the 5-column SCOPED policy line `p = sub, dom, obj, act, eft` with dom = SYSTEM_WIDE so the
// matcher's `p.dom == "SYSTEM_WIDE"` branch grants regardless of membership.
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

function poolEnforcer(adapter: FilteredAdapter, poolSize = 4) {
  return new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter,
    isScoped: true,
    poolSize,
  });
}

async function decide(e: CasbinAuthorizationEnforcer, userId: string, obj: string) {
  const rules = await e.buildRules({ user: { principalType: 'User', userId }, context: {} as any });
  return e.evaluate({
    rules,
    request: { resource: obj, action: 'read', domain: 'SYSTEM_WIDE' },
    context: {} as any,
  });
}

describe('CasbinAuthorizationEnforcer — pool isolation (§9 race fix)', () => {
  test('concurrent evaluates for different users never cross-contaminate decisions', async () => {
    const e = poolEnforcer(new DelayedPerUserAdapter(15), 4);
    await e.configure();

    // A may access A_secret; B may access B_secret. Each must be allowed on its own, denied on the other.
    const [aOwn, aOther, bOwn, bOther] = await Promise.all([
      decide(e, 'A', 'A_secret'),
      decide(e, 'A', 'B_secret'),
      decide(e, 'B', 'B_secret'),
      decide(e, 'B', 'A_secret'),
    ]);
    expect(aOwn).toBe('allow');
    expect(aOther).toBe('deny');
    expect(bOwn).toBe('allow');
    expect(bOther).toBe('deny');
  });

  test('reuse isolation: a pooled enforcer serving user B does not leak user A policies', async () => {
    // poolSize 1 forces the SAME enforcer instance to be reused across users.
    const e = poolEnforcer(new DelayedPerUserAdapter(0), 1);
    await e.configure();
    expect(await decide(e, 'A', 'A_secret')).toBe('allow');
    expect(await decide(e, 'B', 'A_secret')).toBe('deny'); // reused enforcer must not still hold A's grant
    expect(await decide(e, 'B', 'B_secret')).toBe('allow');
  });
});

// Forces exactly ONE failure inside the pool.use() callback (during the per-request load step) by
// overriding loadPolicyLinesIntoModel to throw on its first call, then delegating to super afterwards.
// This exercises the discard path: pool.use() must DESTROY the borrowed enforcer + rethrow (request
// fails closed), the pool then RE-CREATES capacity, and the next valid request still resolves. Wired to
// the load step (not extraction) because that is the step that actually runs on a borrowed pool enforcer.
class FailOncePoolEnforcer extends CasbinAuthorizationEnforcer {
  private failsRemaining = 1;

  protected override async loadPolicyLinesIntoModel(opts: {
    enforcer: Enforcer;
    lines: string[];
  }): Promise<void> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      throw new Error('forced one-time load failure');
    }
    return super.loadPolicyLinesIntoModel(opts);
  }
}

describe('CasbinAuthorizationEnforcer — discard recovery', () => {
  test('a load failure discards the enforcer (request fails closed) and the pool recovers', async () => {
    // poolSize 1: the same single slot must be discarded then re-created — proving capacity recovery.
    const e = new FailOncePoolEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      cached: { use: false },
      adapter: new DelayedPerUserAdapter(0),
      isScoped: true,
      poolSize: 1,
    });
    await e.configure();

    // First request: load step throws inside pool.use → enforcer discarded, error rethrown (fail-closed).
    let error: unknown;
    try {
      await decide(e, 'A', 'A_secret');
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();

    // Pool must have re-created capacity: a subsequent valid request resolves to the correct decisions,
    // with no leaked/stale state from the failed borrow.
    expect(await decide(e, 'A', 'A_secret')).toBe('allow');
    expect(await decide(e, 'A', 'B_secret')).toBe('deny');
  });
});

describe('CasbinAuthorizationEnforcer — fail-closed', () => {
  test('evaluate throws (fail-closed) after the pool is destroyed', async () => {
    const e = poolEnforcer(new DelayedPerUserAdapter(0), 1);
    await e.configure();
    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 'A' },
      context: {} as any,
    });
    e.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    let error: unknown;
    try {
      await e.evaluate({
        rules,
        request: { resource: 'A_secret', action: 'read', domain: 'SYSTEM_WIDE' },
        context: {} as any,
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
  });
});
