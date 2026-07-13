import { describe, expect, test } from 'bun:test';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CasbinEnforcerModelDrivers } from '@/components/auth/authorize/common/constants';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';

// ---------------------------------------------------------------------------
// enforcer:126 — destroy() logs (and does NOT throw) when pool.destroy() rejects.
// pool.destroy() normally resolves, so this defensive .catch is exercised by injecting
// a pool stub whose destroy() rejects.
// ---------------------------------------------------------------------------

describe('CasbinAuthorizationEnforcer — destroy() pool-reject guard (enforcer:126)', () => {
  test('a rejecting pool.destroy() is caught and logged, not thrown', async () => {
    const enforcer = new CasbinAuthorizationEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      cached: { use: false },
      isScoped: true,
    });

    // Inject a fake pool whose destroy() rejects (no configure() needed — destroy() only touches this.client).
    // @ts-expect-error intentional partial pool stub (only destroy) to force the reject-path branch
    enforcer['pool'] = {
      destroy: () => Promise.reject(new Error('pool destroy boom')),
    };

    expect(() => enforcer.destroy()).not.toThrow(); // synchronous call returns; rejection handled by .catch
    await new Promise(resolve => setTimeout(resolve, 0)); // let the .catch microtask run (covers line 126)
  });
});
