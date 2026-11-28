import { describe, expect, test } from 'bun:test';
import { CustomGrantExpander } from '@/components/auth/authorize/adapters/custom-grant-expander';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/common';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { CasbinEnforcerModelDrivers, type ICasbinEnforcerOptions } from '@venizia/ignis-kernel';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Context } from 'hono';

/** Options whose `cached` is written as a JSON or JavaScript config would write it, typed or not. */
const enforcerOptions = (cached: { use: unknown }): ICasbinEnforcerOptions => {
  const options: ICasbinEnforcerOptions = {
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    isScoped: true,
  };
  Reflect.set(options, 'cached', cached);

  return options;
};

describe('CasbinAuthorizationEnforcer - the cached toggle', () => {
  test('configure refuses a use that is not a boolean', async () => {
    const enforcer = new CasbinAuthorizationEnforcer(enforcerOptions({ use: 'false' }));
    const [outcome] = await Promise.allSettled([enforcer.configure()]);

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: { message: expect.stringContaining('A toggle must be') },
    });
  });

  test('configure still refuses options with no cached', async () => {
    const options = enforcerOptions({ use: false });
    Reflect.deleteProperty(options, 'cached');
    const enforcer = new CasbinAuthorizationEnforcer(options);
    const [outcome] = await Promise.allSettled([enforcer.configure()]);

    expect(outcome.status).toBe('rejected');
  });

  test('building rules and invalidating the cache refuse it too', async () => {
    const enforcer = new CasbinAuthorizationEnforcer(enforcerOptions({ use: 'false' }));
    const user = { userId: 'u1', principalType: 'User' };
    const calls = [
      () => enforcer.buildRules({ user, context: new Context(new Request('http://localhost/')) }),
      () => enforcer.invalidateUserCache({ user }),
    ];

    for (const call of calls) {
      const [outcome] = await Promise.allSettled([call()]);

      expect(outcome).toMatchObject({
        status: 'rejected',
        reason: { message: expect.stringContaining('A toggle must be') },
      });
    }
  });
});

const dataSource: ICasbinPolicySource = {};

const entities = (softDelete: IScopedCasbinEntities['softDelete']): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition' },
  permission: { tableName: 'Permission' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant'],
  softDelete,
});

/** The clause each of the two builders adds for one `softDelete` setting. */
const clauses = (of: IScopedCasbinEntities) => {
  const adapter = new ScopedCasbinAdapter({ dataSource, entities: of });
  const expander = new CustomGrantExpander({ dataSource, entities: of });

  return [
    () => adapter['softDeleteClause']({ alias: 'p' }),
    () => expander['softDeleteClause']({ alias: 'p' }),
  ];
};

describe('scoped casbin - the softDelete toggle', () => {
  test('both query builders refuse a use that is not a boolean', () => {
    const refused = entities(undefined);
    Reflect.set(refused, 'softDelete', { use: 'false', columnName: 'deleted_at' });

    for (const clause of clauses(refused)) {
      expect(clause).toThrow('A toggle must be');
    }
  });

  test('absent and off add no clause, on adds one', () => {
    const dialect = new PgDialect();
    const textOf = (softDelete: IScopedCasbinEntities['softDelete']) =>
      clauses(entities(softDelete)).map((clause) => dialect.sqlToQuery(clause()).sql);

    expect(textOf(undefined)).toEqual(['', '']);
    expect(textOf({ use: false })).toEqual(['', '']);

    for (const text of textOf({ use: true, columnName: 'deleted_at' })) {
      expect(text).toContain('"deleted_at" IS NULL');
    }
  });
});
