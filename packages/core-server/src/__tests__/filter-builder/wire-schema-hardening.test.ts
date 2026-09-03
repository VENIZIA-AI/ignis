import { describe, test, expect } from 'bun:test';
import { FilterSchema, InclusionSchema, LimitSchema, WhereSchema } from '@venizia/ignis-kernel';

/**
 * Pins three wire-schema decisions a caller could otherwise exploit. Each one reached the database
 * or the client before it was closed, so each is asserted on the schema itself rather than through
 * a repository - the schema is the boundary that has to hold.
 */
describe('query schema hardening', () => {
  describe('limit is a non-negative integer', () => {
    /**
     * Drizzle renders the LIMIT clause only when the value is `>= 0`, so a negative limit did not
     * page smaller - it removed the clause and returned the whole table.
     */
    test('rejects a negative limit', () => {
      expect(LimitSchema.safeParse(-1).success).toBe(false);
      expect(FilterSchema.safeParse({ limit: -1 }).success).toBe(false);
    });

    test('rejects a fractional limit, which would reach the driver as LIMIT 1.5', () => {
      expect(LimitSchema.safeParse(1.5).success).toBe(false);
    });

    test('still accepts zero and a whole page size', () => {
      expect(LimitSchema.safeParse(0).success).toBe(true);
      expect(LimitSchema.safeParse(10).success).toBe(true);
    });
  });

  describe('a malformed JSON query string is a validation failure', () => {
    /**
     * zod lets a thrown `SyntaxError` escape `safeParse`, so a bare `JSON.parse` inside the
     * transform bypassed the controller's validation hook: `?where=not-json` surfaced as a 500 with
     * a stack, for a malformed query string.
     */
    test('where does not throw on unparseable JSON', () => {
      const result = WhereSchema.safeParse('not-json');

      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('valid JSON');
    });

    test('filter does not throw on unparseable JSON', () => {
      expect(FilterSchema.safeParse('{"limit":').success).toBe(false);
    });

    test('a well-formed JSON string still parses', () => {
      const result = WhereSchema.safeParse(JSON.stringify({ status: 'active' }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ status: 'active' });
    });
  });

  /**
   * `shouldSkipDefaultFilter` stays on the internal `TInclusion` type and on repository options, so
   * server-side callers keep it. On the wire it would erase the `@model` defaultFilter that
   * implements soft-delete and the static visibility scopes.
   */
  test('include[].shouldSkipDefaultFilter is not accepted from a client', () => {
    const parsed = InclusionSchema.parse([
      { relation: 'categories', shouldSkipDefaultFilter: true },
    ]);

    expect(parsed?.[0]).not.toHaveProperty('shouldSkipDefaultFilter');
  });
});
