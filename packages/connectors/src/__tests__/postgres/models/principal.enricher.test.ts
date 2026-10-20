import { generatePrincipalColumnDefs } from '@/relational/postgres/models';
import { describe, expect, test } from 'bun:test';
import { pgTable } from 'drizzle-orm/pg-core';

describe('the Postgres principal enricher discriminator column', () => {
  test('is nullable with the default value unless isNullableDiscriminator is false', () => {
    const table = pgTable('comments', {
      ...generatePrincipalColumnDefs({ polymorphicIdType: 'number', defaultPolymorphic: 'User' }),
    });

    expect(table.principalType.notNull).toBe(false);
    expect(table.principalType.hasDefault).toBe(true);
    expect(table.principalType.default).toBe('User');
  });

  test('adds NOT NULL with isNullableDiscriminator: false and keeps the default', () => {
    const table = pgTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        discriminator: 'owner',
        defaultPolymorphic: 'User',
        isNullableDiscriminator: false,
      }),
    });

    expect(table.ownerType.notNull).toBe(true);
    expect(table.ownerType.default).toBe('User');
    expect(table.ownerId.notNull).toBe(true);
  });

  test('does not change the id column nullability', () => {
    const table = pgTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'number',
        isNullableId: true,
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalId.notNull).toBe(false);
    expect(table.principalType.notNull).toBe(true);
  });
});
