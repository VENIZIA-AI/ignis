import { describe, expect, test } from 'bun:test';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CasbinRuleVariants } from '@venizia/ignis-kernel';

/** `registerMatchers` run on a stand-in enforcer whose `g` role manager is `roleManager`. */
const register = (roleManager: unknown): Promise<void> => {
  const enforcer = {
    addNamedDomainMatchingFunc: async () => undefined,
    addFunction: async () => undefined,
    setNamedRoleManager: () => undefined,
    getNamedRoleManager: (name: string) =>
      name === CasbinRuleVariants.G ? roleManager : undefined,
    buildRoleLinks: async () => undefined,
  };

  return CasbinAuthorizationEnforcer.prototype['registerMatchers'].call(
    { options: { isScoped: true } },
    { enforcer, casbin: { Util: { keyMatchFunc: () => true } } } as never,
  );
};

describe('the scoped casbin model and its g role manager', () => {
  test('a role manager of its own with addDomainHierarchy is used', async () => {
    const calls: unknown[] = [];

    await register({ addDomainHierarchy: async (manager: unknown) => calls.push(manager) });

    expect(calls).toHaveLength(1);
  });

  test('one without it is refused', async () => {
    for (const roleManager of [undefined, {}, { addDomainHierarchy: 'yes' }]) {
      let caught: unknown;

      try {
        await register(roleManager);
      } catch (error) {
        caught = error;
      }

      expect(String(caught)).toContain('does not expose addDomainHierarchy()');
    }
  });
});
