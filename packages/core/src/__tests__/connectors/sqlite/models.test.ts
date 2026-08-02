import { SchemaTypes } from '@/base/models';
import type { TTableInsert, TTableObject } from '@/connectors/sqlite/models';
import {
  BaseSqliteEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generatePrincipalColumnDefs,
  generateTzColumnDefs,
  getIdType,
} from '@/connectors/sqlite/models';
import { describe, expect, test } from 'bun:test';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

const numberIdTable = sqliteTable('notes', {
  ...generateIdColumnDefs(),
  ...generateTzColumnDefs(),
  body: text('body').notNull(),
});

const stringIdTable = sqliteTable('documents', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
});

const softDeletableTable = sqliteTable('archives', {
  ...generateIdColumnDefs(),
  ...generateTzColumnDefs({ deleted: { columnName: 'deleted_at' } }),
});

const defaultedTable = sqliteTable('metrics', {
  ...generateIdColumnDefs(),
  ...generateDataTypeColumnDefs({ defaultValue: { nValue: 0, tValue: '', boValue: false } }),
});

/** `Date` parsing of a zone-less value follows the host zone, so the assertion has to pin one. */
const withTimeZone = <T>(opts: { timeZone: string; handler: () => T }): T => {
  const { timeZone, handler } = opts;
  const previous = process.env.TZ;
  process.env.TZ = timeZone;

  try {
    return handler();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
};

class Note extends BaseSqliteEntity<typeof numberIdTable> {
  static override TABLE_NAME = 'notes';
  static override schema = numberIdTable;
}

class SqliteDocument extends BaseSqliteEntity<typeof stringIdTable> {
  static override TABLE_NAME = 'documents';
  static override schema = stringIdTable;
}

type TAreEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// A `false` on any of these lines fails to compile - `bun run typecheck` is the real gate here.
const isSelectRowShaped: TAreEqual<
  TTableObject<typeof numberIdTable>,
  { id: number; createdAt: string; modifiedAt: string; body: string }
> = true;
const isStringIdSelectRowShaped: TAreEqual<
  TTableObject<typeof stringIdTable>,
  { id: string; title: string }
> = true;
const isInsertIdOptional: TAreEqual<TTableInsert<typeof numberIdTable>['id'], number | undefined> =
  true;
const isInsertBodyRequired: TAreEqual<TTableInsert<typeof numberIdTable>['body'], string> = true;
const isSoftDeleteColumnNullableText: TAreEqual<
  TTableObject<typeof softDeletableTable>['deletedAt'],
  string | null
> = true;

describe('a sqliteTable round-trips through the SQLite model types', () => {
  test('$inferSelect keeps every enriched column with its storage-class type', () => {
    expect(isSelectRowShaped).toBe(true);
    expect(isStringIdSelectRowShaped).toBe(true);
  });

  test('$inferInsert makes engine-filled columns optional and plain ones required', () => {
    expect(isInsertIdOptional).toBe(true);
    expect(isInsertBodyRequired).toBe(true);

    const persist: TTableInsert<typeof numberIdTable> = { body: 'hello' };
    expect(persist.body).toBe('hello');
  });

  test('getIdType reports number for an integer primary key and string for a text one', () => {
    expect(getIdType({ entity: numberIdTable })).toBe('number');
    expect(getIdType({ entity: stringIdTable })).toBe('string');

    expect(new Note().getIdType()).toBe('number');
    expect(new SqliteDocument().getIdType()).toBe('string');
  });

  test('the entity base derives a zod select schema through drizzle-zod', () => {
    const schema = new SqliteDocument().getSchema<{ parse: (value: unknown) => unknown }>({
      type: SchemaTypes.SELECT,
    });

    expect(schema.parse({ id: 'abc', title: 'IGNIS' })).toEqual({ id: 'abc', title: 'IGNIS' });
  });

  test('the string id generator supplies a value without a round trip to the engine', () => {
    expect(typeof stringIdTable.id.defaultFn?.()).toBe('string');
  });

  test('the integer id is an AUTOINCREMENT rowid, not an application-side default', () => {
    expect(numberIdTable.id.getSQLType()).toBe('integer');
    expect(numberIdTable.id.defaultFn).toBeUndefined();
  });

  test('the tz enricher stores ISO 8601 text, since SQLite has no date storage class', () => {
    expect(numberIdTable.createdAt.getSQLType()).toBe('text');
    expect(numberIdTable.createdAt.mapToDriverValue(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(numberIdTable.createdAt.mapFromDriverValue('1970-01-01T00:00:00Z')).toBe(
      '1970-01-01T00:00:00.000Z',
    );
  });

  test('an omitted `enable` opts the tz column in, matching what the option type promises', () => {
    expect(isSoftDeleteColumnNullableText).toBe(true);
    expect(softDeletableTable.deletedAt).toBeDefined();
    expect(softDeletableTable.deletedAt.name).toBe('deleted_at');

    const modifiedOnly = generateTzColumnDefs({ modified: { columnName: 'modified_at' } });
    expect(Object.keys(modifiedOnly)).toContain('modifiedAt');
  });

  test('an explicit `enable: false` still drops the tz column', () => {
    const defs = generateTzColumnDefs({ modified: { enable: false }, deleted: { enable: false } });

    expect(Object.keys(defs)).toEqual(['createdAt']);
  });

  test('a zone-less driver value reads back as UTC, not shifted by the host offset', () => {
    const read = withTimeZone({
      timeZone: 'Asia/Bangkok',
      handler: () => ({
        spaceSeparated: numberIdTable.createdAt.mapFromDriverValue('2026-08-02 10:00:00'),
        isoWithoutZone: numberIdTable.createdAt.mapFromDriverValue('2026-08-02T10:00:00'),
        explicitOffset: numberIdTable.createdAt.mapFromDriverValue('2026-08-02T10:00:00+07:00'),
      }),
    });

    expect(read.spaceSeparated).toBe('2026-08-02T10:00:00.000Z');
    expect(read.isoWithoutZone).toBe('2026-08-02T10:00:00.000Z');
    expect(read.explicitOffset).toBe('2026-08-02T03:00:00.000Z');
  });

  test('a value that is no timestamp at all still throws instead of reading back as NaN', () => {
    expect(() => numberIdTable.createdAt.mapFromDriverValue('not-a-timestamp')).toThrowError(
      /Invalid date string/,
    );
  });

  test('the data-type enricher keeps falsy defaults - 0, empty string and false', () => {
    expect(defaultedTable.nValue.hasDefault).toBe(true);
    expect(defaultedTable.nValue.default).toBe(0);

    expect(defaultedTable.tValue.hasDefault).toBe(true);
    expect(defaultedTable.tValue.default).toBe('');

    expect(defaultedTable.boValue.hasDefault).toBe(true);
    expect(defaultedTable.boValue.default).toBe(false);
  });

  test('the data-type enricher maps every Postgres column onto a SQLite storage class', () => {
    const kvTable = sqliteTable('kv', {
      ...generateIdColumnDefs(),
      ...generateDataTypeColumnDefs(),
    });

    expect(kvTable.nValue.getSQLType()).toBe('real');
    expect(kvTable.bValue.getSQLType()).toBe('blob');
    expect(kvTable.jValue.getSQLType()).toBe('text');
    expect(kvTable.boValue.getSQLType()).toBe('integer');
  });

  test('the principal enricher emits the polymorphic id and type pair', () => {
    const defs = generatePrincipalColumnDefs({ polymorphicIdType: 'string' });

    expect(Object.keys(defs).sort()).toEqual(['principalId', 'principalType']);
  });

  test('an unsupported id dataType throws NotSupported instead of emitting wrong DDL', () => {
    expect(() => generateIdColumnDefs({ id: { dataType: 'big-number' } } as never)).toThrowError(
      /not supported on SQLite/,
    );
  });
});
