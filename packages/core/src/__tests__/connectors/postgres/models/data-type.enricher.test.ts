import { generateDataTypeColumnDefs } from '@/connectors/postgres/models';
import { describe, expect, test } from 'bun:test';
import { pgTable } from 'drizzle-orm/pg-core';

const defaultedTable = pgTable('metrics', {
  ...generateDataTypeColumnDefs({ defaultValue: { nValue: 0, tValue: '', boValue: false } }),
});

const undefaultedTable = pgTable('readings', {
  ...generateDataTypeColumnDefs(),
});

describe('the Postgres data-type enricher', () => {
  test('keeps falsy defaults - 0, empty string and false', () => {
    expect(defaultedTable.nValue.hasDefault).toBe(true);
    expect(defaultedTable.nValue.default).toBe(0);

    expect(defaultedTable.tValue.hasDefault).toBe(true);
    expect(defaultedTable.tValue.default).toBe('');

    expect(defaultedTable.boValue.hasDefault).toBe(true);
    expect(defaultedTable.boValue.default).toBe(false);
  });

  test('leaves a column without a default when none was supplied', () => {
    expect(undefaultedTable.nValue.hasDefault).toBe(false);
    expect(undefaultedTable.tValue.hasDefault).toBe(false);
    expect(undefaultedTable.boValue.hasDefault).toBe(false);
  });
});
