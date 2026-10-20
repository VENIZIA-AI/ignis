import { generateIdColumnDefs } from '@/relational/postgres/models/enrichers/id.enricher';
import { describe, expect, test } from 'bun:test';
import { pgTable } from 'drizzle-orm/pg-core';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateIdColumnDefs - string ids', () => {
  test('default to a time-ordered UUID v7, so later rows sort after earlier ones', () => {
    const table = pgTable(
      'id_enricher_default',
      generateIdColumnDefs({ id: { dataType: 'string' } }),
    );

    const first = table.id.defaultFn?.();
    const second = table.id.defaultFn?.();

    expect(first).toMatch(UUID_V7);
    expect(String(second) > String(first)).toBe(true);
  });

  test('a caller-supplied generator still wins', () => {
    const table = pgTable(
      'id_enricher_custom',
      generateIdColumnDefs({ id: { dataType: 'string', generator: () => 'custom-id' } }),
    );

    expect(table.id.defaultFn?.()).toBe('custom-id');
  });
});
