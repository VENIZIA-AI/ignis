import { PostgresPrincipalEnricher } from '@/relational/postgres/models';
import { describe, expect, test } from 'bun:test';
import { pgTable } from 'drizzle-orm/pg-core';

type TEquals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const assertType = <Check extends true>(): Check | undefined => undefined;

describe('the Postgres principal enricher discriminator column', () => {
  test('is nullable with the default value unless isNullableDiscriminator is false', () => {
    const table = pgTable('comments', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'number',
        defaultPolymorphic: 'User',
      }),
    });

    expect(table.principalType.notNull).toBe(false);
    expect(table.principalType.hasDefault).toBe(true);
    expect(table.principalType.default).toBe('User');
  });

  test('treats a null or undefined isNullableDiscriminator from an untyped caller as nullable', () => {
    const untyped = JSON.parse('null');
    const viaNull = pgTable('comments', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: untyped,
      }),
    });
    const viaUndefined = pgTable('replies', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: undefined,
      }),
    });

    expect(viaNull.principalType.notNull).toBe(false);
    expect(viaUndefined.principalType.notNull).toBe(false);
  });

  test('is NOT NULL with no default when isNullableDiscriminator is false and no default is given', () => {
    const table = pgTable('comments', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalType.notNull).toBe(true);
    expect(table.principalType.hasDefault).toBe(false);
  });

  test('keeps NOT NULL and the given default when isNullableDiscriminator is false', () => {
    const table = pgTable('comments', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        discriminator: 'owner',
        defaultPolymorphic: 'User',
        isNullableDiscriminator: false,
      }),
    });

    expect(table.ownerType.notNull).toBe(true);
    expect(table.ownerType.hasDefault).toBe(true);
    expect(table.ownerType.default).toBe('User');
    expect(table.ownerId.notNull).toBe(true);
  });

  test('does not change the id column nullability', () => {
    const table = pgTable('comments', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'number',
        isNullableId: true,
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalId.notNull).toBe(false);
    expect(table.principalType.notNull).toBe(true);
  });

  test('$inferInsert requires the type with isNullableDiscriminator: false and not by default', () => {
    const required = pgTable('replies', {
      ...PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: false,
      }),
    });
    const optional = pgTable('notes', {
      ...PostgresPrincipalEnricher.generateColumnDefs({ polymorphicIdType: 'string' }),
    });

    // @ts-expect-error principalType is required
    const missing: (typeof required)['$inferInsert'] = { principalId: 'u1' };
    const given: (typeof required)['$inferInsert'] = { principalId: 'u1', principalType: 'User' };
    const omitted: (typeof optional)['$inferInsert'] = { principalId: 'u1' };

    expect([missing, given, omitted]).toHaveLength(3);
  });

  test('a widened boolean flag takes the NOT NULL branch as one type, not a union', () => {
    const widened = (flag: boolean) =>
      PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: flag,
      });
    const strict = PostgresPrincipalEnricher.generateColumnDefs({
      polymorphicIdType: 'string',
      isNullableDiscriminator: false,
    });

    assertType<TEquals<ReturnType<typeof widened>['principalType'], typeof strict.principalType>>();

    expect(pgTable('t', widened(false)).principalType.notNull).toBe(true);
  });

  test('a widened boolean isNullableId takes the NOT NULL branch as one type, not a union', () => {
    const widened = (flag: boolean) =>
      PostgresPrincipalEnricher.generateColumnDefs({
        polymorphicIdType: 'string',
        isNullableId: flag,
      });
    const strict = PostgresPrincipalEnricher.generateColumnDefs({ polymorphicIdType: 'string' });

    assertType<TEquals<ReturnType<typeof widened>['principalId'], typeof strict.principalId>>();

    expect(pgTable('t', widened(false)).principalId.notNull).toBe(true);
  });
});

describe('the Postgres enrichPrincipal', () => {
  test('passes isNullableDiscriminator and isNullableId through with matching column types', () => {
    const schema = PostgresPrincipalEnricher.enrich({
      baseSchema: {},
      opts: { polymorphicIdType: 'number', isNullableId: true, isNullableDiscriminator: false },
    });
    const direct = PostgresPrincipalEnricher.generateColumnDefs({
      polymorphicIdType: 'number',
      isNullableId: true,
      isNullableDiscriminator: false,
    });

    assertType<TEquals<typeof schema.principalType, typeof direct.principalType>>();
    assertType<TEquals<typeof schema.principalId, typeof direct.principalId>>();

    const table = pgTable('comments', schema);
    expect(table.principalType.notNull).toBe(true);
    expect(table.principalId.notNull).toBe(false);
  });
});
