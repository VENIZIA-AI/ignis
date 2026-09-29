import type { TWhere } from '@venizia/ignis-filter';
import { parseOrderEntry } from '@venizia/ignis-filter';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { assertKnownField } from '@/search/core/repositories/common/dialect-helpers';
import { describe, expect, test } from 'bun:test';
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * An error message quotes the key or entry a request sent. Printed raw, a newline splits the log
 * line and a control sequence reaches the terminal. Every quoted value must come out on one line,
 * with each unsafe character written as an escape.
 */
const table = pgTable('echoed_input_escape', {
  id: serial('id').primaryKey(),
  name: text('name'),
  metadata: jsonb('metadata'),
});

const dialect = new PostgresQueryDialect();
const TABLE = 'echoed_input_escape';

const UNSAFE: Array<{ label: string; raw: string; escaped: string }> = [
  { label: 'newline', raw: '\n', escaped: '\\u000a' },
  { label: 'carriage return', raw: '\r', escaped: '\\u000d' },
  { label: 'escape', raw: '\u001b', escaped: '\\u001b' },
  { label: 'NUL', raw: '\u0000', escaped: '\\u0000' },
  { label: 'DEL', raw: '\u007f', escaped: '\\u007f' },
  { label: 'next line (C1)', raw: '\u0085', escaped: '\\u0085' },
  { label: 'line separator', raw: '\u2028', escaped: '\\u2028' },
  { label: 'paragraph separator', raw: '\u2029', escaped: '\\u2029' },
];

/** Characters a message must never carry raw: C0, DEL, C1, U+2028, U+2029. */
const UNSAFE_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const messageOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to throw');
};

const expectSafe = (opts: { message: string; escaped: string }) => {
  expect(opts.message).not.toMatch(UNSAFE_PATTERN);
  expect(opts.message).toContain(opts.escaped);
};

describe.each(UNSAFE)(
  'a $label in a rejected key is escaped in the message',
  ({ raw, escaped }) => {
    test('toWhere: unknown column', () => {
      const message = messageOf(() =>
        dialect.toWhere({ tableName: TABLE, schema: table, where: { [`na${raw}me`]: 1 } }),
      );
      expectSafe({ message, escaped });
    });

    test('toWhere: unknown JSON column', () => {
      const message = messageOf(() =>
        dialect.toWhere({ tableName: TABLE, schema: table, where: { [`me${raw}ta.a`]: 1 } }),
      );
      expectSafe({ message, escaped });
    });

    test('toWhere: invalid JSON path component', () => {
      const message = messageOf(() =>
        dialect.toWhere({ tableName: TABLE, schema: table, where: { [`metadata.a${raw}b`]: 1 } }),
      );
      expectSafe({ message, escaped });
    });

    test('transformUpdate: unknown column', () => {
      const message = messageOf(() =>
        dialect.transformUpdate({ tableName: TABLE, schema: table, data: { [`na${raw}me`]: 1 } }),
      );
      expectSafe({ message, escaped });
    });

    test('transformUpdate: unknown JSON column', () => {
      const message = messageOf(() =>
        dialect.transformUpdate({
          tableName: TABLE,
          schema: table,
          data: { [`me${raw}ta.a`]: 1 },
        }),
      );
      expectSafe({ message, escaped });
    });

    test('search dialects: unknown field', () => {
      const message = messageOf(() =>
        assertKnownField({
          field: `na${raw}me`,
          engine: 'Typesense',
          capabilities: { fields: new Set(['name']) },
        }),
      );
      expectSafe({ message, escaped });
    });
  },
);

/** Order entries split on ASCII whitespace, so only characters that are not ASCII whitespace can reach the field. */
const UNSAFE_IN_ORDER = UNSAFE.filter(({ raw }) => !/\s/.test(raw) || raw.charCodeAt(0) > 0x7f);

describe.each(UNSAFE_IN_ORDER)(
  'a $label in an order entry is escaped in the message',
  ({ raw, escaped }) => {
    test('toOrderBy: unknown column', () => {
      const message = messageOf(() =>
        dialect.toOrderBy({ tableName: TABLE, schema: table, order: [`na${raw}me ASC`] }),
      );
      expectSafe({ message, escaped });
    });

    test('parseOrderEntry: invalid direction', () => {
      const message = messageOf(() => parseOrderEntry({ entry: `name AS${raw}C` }));
      expectSafe({ message, escaped });
    });
  },
);

test('positive control: a safe key is quoted unchanged', () => {
  const where: TWhere = { nope: 1 };
  const message = messageOf(() => dialect.toWhere({ tableName: TABLE, schema: table, where }));
  expect(message).toContain("key: 'nope'");
});
