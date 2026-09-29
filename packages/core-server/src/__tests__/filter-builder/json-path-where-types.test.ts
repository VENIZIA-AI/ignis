import { describe, expect, test } from 'bun:test';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type {
  TFilter,
  TIsoTimestamp,
  TJsonColumnKey,
  TJsonPathKey,
  TWhere,
} from '@venizia/ignis-filter';
import { PostgresFilterBuilder, isoTimestamp } from '@venizia/ignis-connectors/postgres';

/**
 * Compile-time proof for JSON-path keys in `TWhere<T>`: a dotted or bracketed key is accepted only
 * when it starts with a JSON column, so a typo or a path on a scalar, `Date` or isoTimestamp column
 * still fails `tsc`. Each `@ts-expect-error` is load-bearing - removing it must make `tsc` report a
 * real error on that line.
 *
 * A rejected key inside an object literal sits on its own line after a valid JSON-path property.
 * `tsc` reports an object literal's first excess property, so the directive is satisfied only when
 * the valid key above it is accepted and the error lands on the line it guards.
 */

const table = pgTable('json_path_where_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  score: integer('score'),
  metadata: jsonb('metadata'),
  settings: jsonb('settings').$type<{ theme: string; limits: { max: number } }>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  effectiveFrom: isoTimestamp('effective_from'),
});

/** `metadata` reads as `unknown`, `settings` as an object or null, `createdAt` as a `Date`, `effectiveFrom` as a `TIsoTimestamp` or null. */
type TRow = typeof table.$inferSelect;

/** Optional members: an optional JSON member must not add an `undefined.*` path. */
type TOptionalRow = {
  id: number;
  label?: string;
  payload?: { kind: string };
  extra?: unknown;
};

/** A member typed `any` reads like an untyped jsonb value. */
type TAnyMemberRow = {
  id: number;
  payload: any;
};

/** Members typed purely `TIsoTimestamp`: the brand is an object type, so only the explicit exclusion keeps them out. */
type TBrandedRow = {
  id: number;
  data: unknown;
  at: TIsoTimestamp;
  maybe?: TIsoTimestamp | null;
};

/** A row with a relation field, the shape a model type carries for `include`. */
type TRowWithRelation = TRow & { creator?: { id: number; name: string } };

describe('TJsonColumnKey<T> and TJsonPathKey<T>', () => {
  test('a jsonb column typed unknown and one typed as an object are JSON columns', () => {
    const columns: TJsonColumnKey<TRow>[] = ['metadata', 'settings'];
    expect(columns).toEqual(['metadata', 'settings']);
  });

  test('scalar, Date and isoTimestamp columns are not JSON columns', () => {
    // @ts-expect-error 'name' is a text column.
    const textColumn: TJsonColumnKey<TRow> = 'name';
    // @ts-expect-error 'score' is a number column.
    const numberColumn: TJsonColumnKey<TRow> = 'score';
    // @ts-expect-error 'createdAt' is a Date column - a Date is an object, not a JSON value.
    const dateColumn: TJsonColumnKey<TRow> = 'createdAt';
    // @ts-expect-error 'effectiveFrom' is an isoTimestamp column - its brand is an object type, not a JSON value.
    const isoColumn: TJsonColumnKey<TRow> = 'effectiveFrom';
    expect([textColumn, numberColumn, dateColumn, isoColumn]).toHaveLength(4);
  });

  test('a dot path and a bracket path on a JSON column are JSON-path keys', () => {
    const keys: TJsonPathKey<TRow>[] = [
      'metadata.a',
      'metadata.a.b.c',
      'metadata[0]',
      'metadata.items[0].name',
      'settings.limits.max',
    ];
    expect(keys).toHaveLength(5);
  });

  test('a path on a misspelled, text, number, Date or isoTimestamp column is not a JSON-path key', () => {
    // @ts-expect-error 'metdata' is not a column.
    const misspelled: TJsonPathKey<TRow> = 'metdata.a';
    // @ts-expect-error 'name' is a text column.
    const onText: TJsonPathKey<TRow> = 'name[0]';
    // @ts-expect-error 'score' is a number column.
    const onNumber: TJsonPathKey<TRow> = 'score.a';
    // @ts-expect-error 'createdAt' is a Date column.
    const onDate: TJsonPathKey<TRow> = 'createdAt.a';
    // @ts-expect-error 'effectiveFrom' is an isoTimestamp column.
    const onIsoTimestamp: TJsonPathKey<TRow> = 'effectiveFrom.a';
    // @ts-expect-error a bare column name carries no path.
    const bareColumn: TJsonPathKey<TRow> = 'metadata';
    expect([misspelled, onText, onNumber, onDate, onIsoTimestamp, bareColumn]).toHaveLength(6);
  });

  test('an optional JSON member is a JSON column and adds no undefined.* path', () => {
    const keys: TJsonPathKey<TOptionalRow>[] = ['payload.kind', 'extra.a'];
    // @ts-expect-error an optional member contributes its name, never the text 'undefined'.
    const undefinedPath: TJsonPathKey<TOptionalRow> = 'undefined.kind';
    // @ts-expect-error 'label' is an optional text member.
    const onOptionalText: TJsonPathKey<TOptionalRow> = 'label.a';
    expect([...keys, undefinedPath, onOptionalText]).toHaveLength(4);
  });

  test('a member typed any is a JSON column', () => {
    const keys: TJsonPathKey<TAnyMemberRow>[] = ['payload.a', 'payload[0]'];
    expect(keys).toHaveLength(2);
  });

  test('a member typed purely TIsoTimestamp is not a JSON column', () => {
    const columns: TJsonColumnKey<TBrandedRow>[] = ['data'];
    // @ts-expect-error 'at' is a TIsoTimestamp - its brand is an object type, not a JSON value.
    const branded: TJsonColumnKey<TBrandedRow> = 'at';
    // @ts-expect-error 'maybe' is an optional, nullable TIsoTimestamp.
    const optionalBranded: TJsonColumnKey<TBrandedRow> = 'maybe';
    // @ts-expect-error a path on a TIsoTimestamp member.
    const path: TJsonPathKey<TBrandedRow> = 'at.a';
    expect([...columns, branded, optionalBranded, path]).toHaveLength(4);
  });

  // Known limit, pinned as current behaviour and not as a goal: the key type cannot tell a relation
  // field from a JSON column, so a path through a relation type-checks. Changing this is deliberate.
  test('a relation-shaped object field is treated as a JSON column', () => {
    const key: TJsonPathKey<TRowWithRelation> = 'creator.name';
    const where: TWhere<TRowWithRelation> = { 'creator.name': 'alpha' };
    expect(key).toBe('creator.name');
    expect(where).toEqual({ 'creator.name': 'alpha' });
  });
});

describe('TWhere<T> accepts JSON-path keys on JSON columns', () => {
  test('an inline dotted key on a jsonb column typed unknown', () => {
    const where: TWhere<TRow> = { 'metadata.a.b': 'value' };
    expect(where).toEqual({ 'metadata.a.b': 'value' });
  });

  test('an inline dotted key on a jsonb column typed as an object', () => {
    const where: TWhere<TRow> = { 'settings.theme': 'dark', 'settings.limits.max': { gte: 10 } };
    expect(Object.keys(where)).toEqual(['settings.theme', 'settings.limits.max']);
  });

  test('index paths', () => {
    const where: TWhere<TRow> = { 'metadata[0]': 1, 'metadata.items[0].name': 'first' };
    expect(Object.keys(where)).toEqual(['metadata[0]', 'metadata.items[0].name']);
  });

  test('operators, a boolean and null on a JSON path', () => {
    const where: TWhere<TRow> = {
      'metadata.status': { inq: ['active', 'pending'] },
      'metadata.flag': true,
      'metadata.removedAt': null,
    };
    expect(where['metadata.flag']).toBe(true);
  });

  test('a JSON path beside a regular column', () => {
    const where: TWhere<TRow> = { name: 'alpha', 'metadata.a': 1 };
    expect(where.name).toBe('alpha');
  });

  test('a pre-built object literal with only JSON-path keys assigns to TWhere<T>', () => {
    const conditions = { 'metadata.a.b': 1, 'settings.theme': 'dark' };
    const where: TWhere<TRow> = conditions;
    expect(where).toBe(conditions);
  });

  test('JSON paths inside and / or', () => {
    const where: TWhere<TRow> = {
      and: [{ 'metadata.a': 1 }, { or: [{ 'settings.theme': 'dark' }, { 'metadata[0]': 'x' }] }],
    };
    expect(where.and).toHaveLength(2);
  });

  test('a JSON path in TFilter<T>.where', () => {
    const filter: TFilter<TRow> = { where: { 'metadata.a': 1 }, limit: 1 };
    expect(filter.limit).toBe(1);
  });

  test('a JSON path at a generic call site infers against the table schema', () => {
    const condition = new PostgresFilterBuilder().toWhere({
      tableName: 'json_path_where_types',
      schema: table,
      where: { 'metadata.a.b': 1, name: 'alpha' },
    });
    expect(condition).toBeDefined();
  });
});

describe('TWhere<T> still rejects what it rejected', () => {
  test('a misspelled JSON column', () => {
    const where: TWhere<TRow> = {
      'metadata.a': 1,
      // @ts-expect-error 'metdata' is not a column.
      'metdata.a': 1,
    };
    expect(where).toBeDefined();
  });

  test('a path on a number column', () => {
    const where: TWhere<TRow> = {
      'metadata.a': 1,
      // @ts-expect-error 'score' is a number column.
      'score.a': 1,
    };
    expect(where).toBeDefined();
  });

  test('a path on a Date column', () => {
    const where: TWhere<TRow> = {
      'metadata.a': 1,
      // @ts-expect-error 'createdAt' is a Date column.
      'createdAt.a': 1,
    };
    expect(where).toBeDefined();
  });

  test('a path on an isoTimestamp column', () => {
    const where: TWhere<TRow> = {
      'metadata.a': 1,
      // @ts-expect-error 'effectiveFrom' is an isoTimestamp column.
      'effectiveFrom.a': 1,
    };
    expect(where).toBeDefined();
  });

  // `tsc` reports a wrong value before an excess key, so the next two hold on either side of the
  // change: they guard that a JSON-path key never loosens the row's own columns.
  test('a wrong value on a regular column beside a JSON path', () => {
    const where: TWhere<TRow> = {
      'metadata.a': 1,
      // @ts-expect-error 'name' is a text column, not a number.
      name: 123,
    };
    expect(where).toBeDefined();
  });

  test('a wrong value on a regular column beside a JSON path inside and', () => {
    const where: TWhere<TRow> = {
      and: [
        {
          'settings.theme': 'dark',
          // @ts-expect-error 'score' is a number column, not a string.
          score: 'high',
        },
      ],
    };
    expect(where.and).toHaveLength(1);
  });

  test('a path on a column typed purely TIsoTimestamp', () => {
    const where: TWhere<TBrandedRow> = {
      'data.a': 1,
      // @ts-expect-error 'at' is a TIsoTimestamp column.
      'at.a': 1,
    };
    expect(where).toBeDefined();
  });
});

describe('TWhere<T> types a JSON-path value as unknown - only the key is checked', () => {
  test('any value on a JSON path compiles, inline and pre-built', () => {
    const inline: TWhere<TRow> = {
      'metadata.a': new Date(),
      'metadata.b': { between: [1, 2, 3] },
    };
    const conditions = { name: 'alpha', 'metadata.c': { notAnOperator: true } };
    const prebuilt: TWhere<TRow> = conditions;
    expect(Object.keys(inline)).toHaveLength(2);
    expect(prebuilt).toBe(conditions);
  });

  test('a where typed Record<string, unknown> assigns to TWhere<T> for a row with a JSON column', () => {
    const loose: Record<string, unknown> = { name: 'alpha', 'metadata.a': 1 };
    const where: TWhere<TRow> = loose;
    const nested: TWhere<TRow> = { and: [loose], or: [loose] };
    expect(where).toBe(loose);
    expect(nested.and).toEqual([loose]);
  });
});

describe('TWhere<any> and TWhere stay open', () => {
  test('TWhere<any> and TWhere accept any key and any value', () => {
    const loose: TWhere<any> = { anything: 1, 'a.b': { notAnOperator: true }, 'c[0]': [1] };
    const bare: TWhere = { 'x.y': { notAnOperator: true }, other: new Date() };
    expect(Object.keys(loose)).toHaveLength(3);
    expect(Object.keys(bare)).toHaveLength(2);
  });

  test('TWhere<any> takes a computed string key with an arbitrary object value', () => {
    const key: string = 'nested.key';
    const loose: TWhere<any> = { [key]: { $ne: null } };
    expect(loose[key]).toEqual({ $ne: null });
  });

  test('TWhere<any> assigns to TWhere<T>', () => {
    const loose: TWhere<any> = { 'metadata.a': { between: [1, 2, 3] }, unknownColumn: 1 };
    const strict: TWhere<TRow> = loose;
    expect(strict).toBe(loose);
  });
});
