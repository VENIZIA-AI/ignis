import { describe, expect, test } from 'bun:test';
import { FilterSchema, QuerySchemaFactory, WhereSchema } from '@/schemas';

/** A `where` nested `depth` levels deep: depth 1 is a flat condition. */
const nested = (depth: number, key: 'and' | 'or' = 'and'): Record<string, unknown> => {
  let node: Record<string, unknown> = { name: 'apple' };

  for (let level = 1; level < depth; level += 1) {
    node = { [key]: [node] };
  }

  return node;
};

describe('the where schema bounds the nesting of and / or', () => {
  test('a flat where and a nesting at the default limit (20) parse', () => {
    expect(WhereSchema.safeParse({ name: 'apple' }).success).toBe(true);
    expect(WhereSchema.safeParse(nested(20)).success).toBe(true);
    expect(WhereSchema.safeParse(nested(20, 'or')).success).toBe(true);
  });

  test('one level deeper is a validation issue that names the limit', () => {
    const result = WhereSchema.safeParse(nested(21));

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('nested deeper than 20 levels');
  });

  test('a mixed and / or chain counts both', () => {
    let node: Record<string, unknown> = { name: 'apple' };

    for (let level = 1; level < 21; level += 1) {
      node = level % 2 === 0 ? { and: [node] } : { or: [node] };
    }

    expect(WhereSchema.safeParse(node).success).toBe(false);
  });

  test('wide is not deep: many siblings at one level parse', () => {
    const wide = { and: Array.from({ length: 500 }, (_unused, index) => ({ id: index })) };

    expect(WhereSchema.safeParse(wide).success).toBe(true);
  });

  test('a deep chain is refused fast, without walking it with the recursive schema', () => {
    const hostile = nested(3300);
    const started = performance.now();
    const result = WhereSchema.safeParse(hostile);

    expect(result.success).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });

  test('a deep chain that is a JSON string is refused too, and so is the same filter', () => {
    const where = nested(40);

    expect(WhereSchema.safeParse(JSON.stringify(where)).success).toBe(false);
    expect(FilterSchema.safeParse({ where }).success).toBe(false);
    expect(FilterSchema.safeParse(JSON.stringify({ where })).success).toBe(false);
  });

  test('an include scope is bounded as well', () => {
    const filter = { include: [{ relation: 'posts', scope: { where: nested(40) } }] };

    expect(FilterSchema.safeParse(filter).success).toBe(false);
  });

  test('the limit is configurable through limits.whereDepth', () => {
    const strict = QuerySchemaFactory.build({ limits: { whereDepth: 3 } });
    const lax = QuerySchemaFactory.build({ limits: { whereDepth: 50 } });

    expect(strict.WhereSchema.safeParse(nested(3)).success).toBe(true);
    expect(strict.WhereSchema.safeParse(nested(4)).success).toBe(false);
    expect(lax.WhereSchema.safeParse(nested(50)).success).toBe(true);
  });

  test('values that are not a where are left to the schema: no depth issue for a malformed string', () => {
    const result = WhereSchema.safeParse('not-json');

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('where must be valid JSON');
  });
});
