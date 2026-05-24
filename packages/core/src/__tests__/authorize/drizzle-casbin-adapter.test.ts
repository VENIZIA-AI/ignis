import { describe, test, expect } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { IDataSource } from '@/base/datasources';
import {
  DrizzleCasbinAdapter,
  type IDrizzleCasbinEntities,
} from '@/components/auth/authorize/adapters/drizzle-casbin';

const dialect = new PgDialect();

const baseEntities = (overrides?: Partial<IDrizzleCasbinEntities>): IDrizzleCasbinEntities => ({
  permission: { tableName: 'permissions', principalType: 'Permission' },
  role: { tableName: 'roles', principalType: 'Role' },
  policyDefinition: { tableName: 'policy_definitions', principalType: 'PolicyDefinition' },
  ...overrides,
});

const createAdapter = (entities: IDrizzleCasbinEntities) => {
  const captured: string[] = [];
  const connector = {
    execute: async (query: SQL) => {
      captured.push(dialect.sqlToQuery(query).sql);
      return { rows: [] };
    },
  };
  const dataSource = { connector } as unknown as IDataSource;
  const adapter = new DrizzleCasbinAdapter({ dataSource, entities });
  return { adapter, captured };
};

describe('DrizzleCasbinAdapter - schema qualification', () => {
  test('defaults schema to "public" when schemaName is omitted', async () => {
    const { adapter, captured } = createAdapter(baseEntities());

    await adapter['buildDirectPolicies']({
      filter: { principalType: 'User', principalValue: 1 },
      rolePrincipal: 'Role',
    });

    expect(captured[0]).toContain('"public"."policy_definitions"');
    expect(captured[0]).toContain('"public"."permissions"');
  });

  test('honors an explicit schemaName per entity', async () => {
    const { adapter, captured } = createAdapter(
      baseEntities({
        permission: { schemaName: 'auth', tableName: 'permissions', principalType: 'Permission' },
        policyDefinition: {
          schemaName: 'auth',
          tableName: 'policy_definitions',
          principalType: 'PolicyDefinition',
        },
      }),
    );

    await adapter['buildDirectPolicies']({
      filter: { principalType: 'User', principalValue: 1 },
      rolePrincipal: 'Role',
    });

    expect(captured[0]).toContain('"auth"."policy_definitions"');
    expect(captured[0]).toContain('"auth"."permissions"');
  });

  test('group-policy query is schema-qualified', async () => {
    const { adapter, captured } = createAdapter(baseEntities());

    await adapter['buildGroupPolicies']({
      filter: { principalType: 'User', principalValue: 1 },
    });

    expect(captured[0]).toContain('"public"."policy_definitions"');
  });

  test('does not mutate the caller-provided entities object', () => {
    const entities = baseEntities();
    createAdapter(entities);

    expect(entities.permission.schemaName).toBeUndefined();
    expect(entities.policyDefinition.schemaName).toBeUndefined();
  });
});
