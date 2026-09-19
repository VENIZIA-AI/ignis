import { describe, expect, test } from 'bun:test';
import { integer, text } from 'drizzle-orm/pg-core';
import { getTableName } from 'drizzle-orm';
import { many, ModelFactory, one, toRelationConfigs } from '@/relational/postgres';
import type { TEntityObject } from '@/relational/postgres';
import { RelationTypes } from '@venizia/ignis-kernel';

const Feature = ModelFactory.defineEntity({
  name: 'PolicyFeature',
  columns: { policyId: text('policy_id').notNull(), code: text('code').notNull() },
});

const Policy = ModelFactory.defineEntity({
  name: 'Policy',
  columns: { title: text('title').notNull(), sequence: integer('sequence').notNull() },
  relations: () => ({ features: many(Feature.schema), owner: one(Feature.schema) }),
});

type TPolicy = TEntityObject<typeof Policy>;

describe('ModelFactory.defineEntity', () => {
  test('takes the table name once and fills the id column', () => {
    expect(Policy.TABLE_NAME).toBe('Policy');
    expect(getTableName(Policy.schema)).toBe('Policy');
    expect(Policy.schema.id.name).toBe('id');
  });

  test('mints a time-ordered id, so a caller never wires a generator for the common case', () => {
    const first = new Policy().schema.id.defaultFn?.();
    const second = new Policy().schema.id.defaultFn?.();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(String(second) > String(first)).toBe(true);
  });

  test('the instance reports the id type the repository tier reads', () => {
    expect(new Policy().getIdType()).toBe('string');
  });

  test('zod schemas come from the entity rather than each model rebuilding them', () => {
    const entity = new Policy();

    expect(entity.getSchema({ type: 'select' })).toBeDefined();
    expect(entity.getSchema({ type: 'create' })).toBeDefined();
    expect(entity.getSchema({ type: 'update' })).toBeDefined();
  });
});

describe('relations declared once', () => {
  test('the keyed form flattens to the array shape the query dialect reads', () => {
    const resolved = typeof Policy.relations === 'function' ? Policy.relations() : Policy.relations;

    expect(resolved).toEqual([
      { name: 'features', type: RelationTypes.MANY, schema: Feature.schema, metadata: undefined },
      { name: 'owner', type: RelationTypes.ONE, schema: Feature.schema, metadata: undefined },
    ]);
  });

  test('a relation name comes from its key, so the runtime name cannot drift from the type', () => {
    const configs = toRelationConfigs({
      relations: { children: many(Feature.schema, { relationName: 'parent' }) },
    });

    expect(configs).toEqual([
      {
        name: 'children',
        type: RelationTypes.MANY,
        schema: Feature.schema,
        metadata: { relationName: 'parent' },
      },
    ]);
  });

  test('a row carries its relations, typed - a many is an array and a one is not', () => {
    const row: TPolicy = {
      id: 'p1',
      title: 'Pro',
      sequence: 1,
      features: [{ id: 'f1', policyId: 'p1', code: 'SEATS' }],
      owner: { id: 'f2', policyId: 'p1', code: 'OWNER' },
    };

    expect(row.features?.[0].code).toBe('SEATS');
    expect(row.owner?.code).toBe('OWNER');
  });
});
