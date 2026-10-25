import { enrichPrincipal, generatePrincipalColumnDefs } from '@/relational/sqlite/models';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { getTableConfig, sqliteTable } from 'drizzle-orm/sqlite-core';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/bun-sqlite';

type TEquals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const assertType = <Check extends true>(): Check | undefined => undefined;

// Emits the DDL the table definition implies, so a real insert exercises the column modifiers.
const createTableSql = (table: SQLiteTable) => {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const notNull = column.notNull ? ' NOT NULL' : '';
    const hasDefault = column.hasDefault ? ` DEFAULT '${String(column.default)}'` : '';
    return `"${column.name}" ${column.getSQLType()}${notNull}${hasDefault}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(', ')})`;
};

const open = (table: SQLiteTable) => {
  const sqlite = new Database(':memory:');
  sqlite.run(createTableSql(table));
  return { sqlite, db: drizzle(sqlite) };
};

describe('the SQLite principal enricher discriminator column', () => {
  test('is nullable with the default value unless isNullableDiscriminator is false', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({ polymorphicIdType: 'string', defaultPolymorphic: 'User' }),
    });

    expect(table.principalType.notNull).toBe(false);
    expect(table.principalType.hasDefault).toBe(true);
    expect(table.principalType.default).toBe('User');
  });

  test('treats a null or undefined isNullableDiscriminator from an untyped caller as nullable', () => {
    const untyped = JSON.parse('null');
    const viaNull = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: untyped,
      }),
    });
    const viaUndefined = sqliteTable('replies', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: undefined,
      }),
    });

    expect(viaNull.principalType.notNull).toBe(false);
    expect(viaUndefined.principalType.notNull).toBe(false);
  });

  test('is NOT NULL with no default when isNullableDiscriminator is false and no default is given', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalType.notNull).toBe(true);
    expect(table.principalType.hasDefault).toBe(false);
  });

  test('keeps NOT NULL and the given default when isNullableDiscriminator is false', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
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
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'number',
        isNullableId: true,
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalId.notNull).toBe(false);
    expect(table.principalType.notNull).toBe(true);
  });

  test('leaves the id column unchanged for a string id too', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableId: true,
        isNullableDiscriminator: false,
      }),
    });

    expect(table.principalId.notNull).toBe(false);
    expect(table.principalType.notNull).toBe(true);
  });

  test('rejects an insert without the type when isNullableDiscriminator is false', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: false,
      }),
    });
    const { sqlite, db } = open(table);

    // @ts-expect-error principalType is required
    const insertWithoutType = () => db.insert(table).values({ principalId: 'u1' }).run();

    expect(insertWithoutType).toThrow(/NOT NULL constraint failed/);

    db.insert(table).values({ principalId: 'u1', principalType: 'User' }).run();
    expect(db.select().from(table).all()).toEqual([{ principalId: 'u1', principalType: 'User' }]);
    sqlite.close();
  });

  test('stores the given default for an insert without the type', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        defaultPolymorphic: 'User',
        isNullableDiscriminator: false,
      }),
    });
    const { sqlite, db } = open(table);

    // @ts-expect-error principalType is required in the insert type
    db.insert(table).values({ principalId: 'u1' }).run();

    expect(db.select().from(table).all()).toEqual([{ principalId: 'u1', principalType: 'User' }]);
    sqlite.close();
  });

  test('stores the empty string for an insert without the type by default', () => {
    const table = sqliteTable('comments', {
      ...generatePrincipalColumnDefs({ polymorphicIdType: 'string' }),
    });
    const { sqlite, db } = open(table);

    db.insert(table).values({ principalId: 'u1' }).run();

    expect(db.select().from(table).all()).toEqual([{ principalId: 'u1', principalType: '' }]);
    sqlite.close();
  });

  test('$inferInsert requires the type with isNullableDiscriminator: false and not by default', () => {
    const required = sqliteTable('replies', {
      ...generatePrincipalColumnDefs({
        polymorphicIdType: 'string',
        isNullableDiscriminator: false,
      }),
    });
    const optional = sqliteTable('notes', {
      ...generatePrincipalColumnDefs({ polymorphicIdType: 'string' }),
    });

    // @ts-expect-error principalType is required
    const missing: (typeof required)['$inferInsert'] = { principalId: 'u1' };
    const given: (typeof required)['$inferInsert'] = { principalId: 'u1', principalType: 'User' };
    const omitted: (typeof optional)['$inferInsert'] = { principalId: 'u1' };

    expect([missing, given, omitted]).toHaveLength(3);
  });

  test('a widened boolean flag takes the NOT NULL branch as one type, not a union', () => {
    const widened = (flag: boolean) =>
      generatePrincipalColumnDefs({ polymorphicIdType: 'string', isNullableDiscriminator: flag });
    const strict = generatePrincipalColumnDefs({
      polymorphicIdType: 'string',
      isNullableDiscriminator: false,
    });

    assertType<TEquals<ReturnType<typeof widened>['principalType'], typeof strict.principalType>>();

    expect(sqliteTable('t', widened(false)).principalType.notNull).toBe(true);
  });

  test('a widened boolean isNullableId takes the NOT NULL branch as one type, not a union', () => {
    const widened = (flag: boolean) =>
      generatePrincipalColumnDefs({ polymorphicIdType: 'string', isNullableId: flag });
    const strict = generatePrincipalColumnDefs({ polymorphicIdType: 'string' });

    assertType<TEquals<ReturnType<typeof widened>['principalId'], typeof strict.principalId>>();

    expect(sqliteTable('t', widened(false)).principalId.notNull).toBe(true);
  });
});

describe('the SQLite enrichPrincipal', () => {
  test('passes isNullableDiscriminator and isNullableId through with matching column types', () => {
    const schema = enrichPrincipal(
      {},
      { polymorphicIdType: 'number', isNullableId: true, isNullableDiscriminator: false },
    );
    const direct = generatePrincipalColumnDefs({
      polymorphicIdType: 'number',
      isNullableId: true,
      isNullableDiscriminator: false,
    });

    assertType<TEquals<typeof schema.principalType, typeof direct.principalType>>();
    assertType<TEquals<typeof schema.principalId, typeof direct.principalId>>();

    const table = sqliteTable('comments', schema);
    expect(table.principalType.notNull).toBe(true);
    expect(table.principalId.notNull).toBe(false);
  });
});
