import { describe, test, expect } from 'bun:test';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationEnforcerTypes,
  AuthorizationPolicyVariants,
  AuthorizationRoles,
  CasbinDomainMatchingFunctions,
  CasbinEnforcerCachedDrivers,
  CasbinEnforcerModelDrivers,
  CasbinRuleVariants,
} from '@venizia/ignis-kernel';

/** Covers the numeric/string isAllow|isDeny|isAbstain helpers and the const-classes' isValid/SCHEME_SET that constants.test.ts never touches. */

describe('AuthorizationDecisions.isAllow', () => {
  test('string "allow" (case-insensitive)', () => {
    expect(AuthorizationDecisions.isAllow('allow')).toBe(true);
    expect(AuthorizationDecisions.isAllow('ALLOW')).toBe(true);
    expect(AuthorizationDecisions.isAllow('Allow')).toBe(true);
  });

  test('other strings are not allow', () => {
    expect(AuthorizationDecisions.isAllow('deny')).toBe(false);
    expect(AuthorizationDecisions.isAllow('abstain')).toBe(false);
    expect(AuthorizationDecisions.isAllow('')).toBe(false);
  });

  test('numeric > 0 is allow; <= 0 is not', () => {
    expect(AuthorizationDecisions.isAllow(1)).toBe(true);
    expect(AuthorizationDecisions.isAllow(42)).toBe(true);
    expect(AuthorizationDecisions.isAllow(0)).toBe(false);
    expect(AuthorizationDecisions.isAllow(-1)).toBe(false);
  });
});

describe('AuthorizationDecisions.isDeny', () => {
  test('string "deny" (case-insensitive)', () => {
    expect(AuthorizationDecisions.isDeny('deny')).toBe(true);
    expect(AuthorizationDecisions.isDeny('DENY')).toBe(true);
    expect(AuthorizationDecisions.isDeny('Deny')).toBe(true);
  });

  test('other strings are not deny', () => {
    expect(AuthorizationDecisions.isDeny('allow')).toBe(false);
    expect(AuthorizationDecisions.isDeny('abstain')).toBe(false);
  });

  test('numeric < 0 is deny; >= 0 is not', () => {
    expect(AuthorizationDecisions.isDeny(-1)).toBe(true);
    expect(AuthorizationDecisions.isDeny(-99)).toBe(true);
    expect(AuthorizationDecisions.isDeny(0)).toBe(false);
    expect(AuthorizationDecisions.isDeny(1)).toBe(false);
  });
});

describe('AuthorizationDecisions.isAbstain', () => {
  test('string "abstain" (case-insensitive)', () => {
    expect(AuthorizationDecisions.isAbstain('abstain')).toBe(true);
    expect(AuthorizationDecisions.isAbstain('ABSTAIN')).toBe(true);
    expect(AuthorizationDecisions.isAbstain('Abstain')).toBe(true);
  });

  test('other strings are not abstain', () => {
    expect(AuthorizationDecisions.isAbstain('allow')).toBe(false);
    expect(AuthorizationDecisions.isAbstain('deny')).toBe(false);
  });

  test('numeric === 0 is abstain; non-zero is not', () => {
    expect(AuthorizationDecisions.isAbstain(0)).toBe(true);
    expect(AuthorizationDecisions.isAbstain(1)).toBe(false);
    expect(AuthorizationDecisions.isAbstain(-1)).toBe(false);
  });

  test('the three numeric predicates partition the number line', () => {
    for (const n of [-5, -1, 0, 1, 5]) {
      const flags = [
        AuthorizationDecisions.isAllow(n),
        AuthorizationDecisions.isDeny(n),
        AuthorizationDecisions.isAbstain(n),
      ].filter(Boolean);
      expect(flags).toHaveLength(1);
    }
  });
});

describe('AuthorizationActions.isValid + SCHEME_SET', () => {
  test('valid actions', () => {
    for (const a of ['create', 'read', 'update', 'delete', 'execute']) {
      expect(AuthorizationActions.isValid(a)).toBe(true);
      expect(AuthorizationActions.SCHEME_SET.has(a)).toBe(true);
    }
  });

  test('invalid actions', () => {
    expect(AuthorizationActions.isValid('superpower')).toBe(false);
    expect(AuthorizationActions.SCHEME_SET.has('superpower')).toBe(false);
  });

  test('coarse lattice tiers are valid actions', () => {
    expect(AuthorizationActions.isValid('manage')).toBe(true);
    expect(AuthorizationActions.isValid('write')).toBe(true);
  });
});

describe('AuthorizationDecisions.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    expect(AuthorizationDecisions.isValid('allow')).toBe(true);
    expect(AuthorizationDecisions.isValid('deny')).toBe(true);
    expect(AuthorizationDecisions.isValid('abstain')).toBe(true);
    expect(AuthorizationDecisions.isValid('ALLOW')).toBe(false);
    expect(AuthorizationDecisions.isValid('reject')).toBe(false);
    expect(AuthorizationDecisions.SCHEME_SET.has('abstain')).toBe(true);
  });
});

describe('AuthorizationEnforcerTypes.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    expect(AuthorizationEnforcerTypes.isValid('casbin')).toBe(true);
    expect(AuthorizationEnforcerTypes.isValid('custom')).toBe(true);
    expect(AuthorizationEnforcerTypes.isValid('rbac')).toBe(false);
    expect(AuthorizationEnforcerTypes.SCHEME_SET.has('casbin')).toBe(true);
    expect(AuthorizationEnforcerTypes.SCHEME_SET.size).toBe(2);
  });
});

describe('CasbinEnforcerCachedDrivers.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    expect(CasbinEnforcerCachedDrivers.isValid('redis')).toBe(true);
    expect(CasbinEnforcerCachedDrivers.isValid('memcached')).toBe(false);
    expect(CasbinEnforcerCachedDrivers.SCHEME_SET.has('redis')).toBe(true);
  });
});

describe('CasbinEnforcerModelDrivers.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    expect(CasbinEnforcerModelDrivers.isValid('file')).toBe(true);
    expect(CasbinEnforcerModelDrivers.isValid('text')).toBe(true);
    expect(CasbinEnforcerModelDrivers.isValid('json')).toBe(false);
    expect(CasbinEnforcerModelDrivers.SCHEME_SET.size).toBe(2);
  });
});

describe('CasbinRuleVariants — casbin line prefixes', () => {
  test('exposes the policy/grouping prefixes the model declares', () => {
    expect(CasbinRuleVariants.P).toBe('p');
    expect(CasbinRuleVariants.G).toBe('g');
    expect(CasbinRuleVariants.G2).toBe('g2');
    expect(CasbinRuleVariants.G3).toBe('g3');
    expect(CasbinRuleVariants.G4).toBe('g4');
    expect(CasbinRuleVariants.G5).toBe('g5');
  });
});

describe('CasbinDomainMatchingFunctions.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    for (const fn of ['keyMatch', 'keyMatch2', 'keyMatch3', 'keyMatch4', 'regexMatch']) {
      expect(CasbinDomainMatchingFunctions.isValid(fn)).toBe(true);
    }
    expect(CasbinDomainMatchingFunctions.isValid('globMatch')).toBe(false);
    expect(CasbinDomainMatchingFunctions.SCHEME_SET.size).toBe(5);
  });
});

describe('AuthorizationDomainScopes.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    expect(AuthorizationDomainScopes.isValid('ANY_MEMBER')).toBe(true);
    expect(AuthorizationDomainScopes.isValid('SYSTEM_WIDE')).toBe(true);
    expect(AuthorizationDomainScopes.isValid('any_member')).toBe(false);
    expect(AuthorizationDomainScopes.SCHEME_SET.size).toBe(2);
  });
});

describe('AuthorizationPolicyVariants.isValid + SCHEME_SET', () => {
  test('valid + invalid', () => {
    for (const v of [
      'grant',
      'assign_role',
      'join_domain',
      'role_inherits',
      'resource_inherits',
      'action_inherits',
      'domain_inherits',
    ]) {
      expect(AuthorizationPolicyVariants.isValidAction(v)).toBe(true);
    }
    expect(AuthorizationPolicyVariants.isValidAction('revoke')).toBe(false);
    expect(AuthorizationPolicyVariants.ACTION_SCHEME_SET.size).toBe(7);
  });
});

describe('AuthorizationRoles.isValid + SCHEME_SET', () => {
  test('valid identifiers (priority-padded + name)', () => {
    expect(AuthorizationRoles.isValid('999_super-admin')).toBe(true);
    expect(AuthorizationRoles.isValid('900_admin')).toBe(true);
    expect(AuthorizationRoles.isValid('010_user')).toBe(true);
    expect(AuthorizationRoles.isValid('001_guest')).toBe(true);
    expect(AuthorizationRoles.isValid('000_unknown-user')).toBe(true);
  });

  test('invalid identifiers', () => {
    expect(AuthorizationRoles.isValid('admin')).toBe(false);
    expect(AuthorizationRoles.isValid('900admin')).toBe(false);
    expect(AuthorizationRoles.isValid('')).toBe(false);
    expect(AuthorizationRoles.SCHEME_SET.size).toBe(5);
  });
});
