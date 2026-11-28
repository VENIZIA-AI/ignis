import { describe, expect, test } from 'bun:test';
import { FilterSchema, InclusionSchema } from '@/schemas';

/** The issues of a refused input, or none when it parsed. */
const issuesOf = (input: unknown) => FilterSchema.safeParse(input).error?.issues ?? [];

describe('a filter refuses a key it does not have', () => {
  for (const [name, input, keys, path] of [
    ['a misspelt where', { wher: { id: 1 } }, ['wher'], []],
    ['a misspelt where in the JSON string form', '{"wher":{"id":1}}', ['wher'], []],
    [
      'an unknown include key',
      { include: [{ relation: 'a', scop: {} }] },
      ['scop'],
      ['include', 0],
    ],
    [
      'an unknown key in a nested scope',
      { include: [{ relation: 'a', scope: { limt: 1 } }] },
      ['limt'],
      ['include', 0, 'scope'],
    ],
    [
      'the server-only default filter switch',
      '{"include":[{"relation":"a","shouldSkipDefaultFilter":true}]}',
      ['shouldSkipDefaultFilter'],
      ['include', 0],
    ],
  ] as const) {
    test(`${name} is an issue that names it`, () => {
      expect(issuesOf(input)).toMatchObject([
        { code: 'unrecognized_keys', keys: [...keys], path: [...path] },
      ]);
    });
  }

  test('every filter key parses, in both forms, and an empty string is an empty filter', () => {
    const filter = {
      where: { anyColumn: 1, or: [{ other: 2 }] },
      fields: ['id'],
      include: [{ relation: 'a', scope: { where: { id: 1 }, limit: 1 } }],
      order: ['id ASC'],
      limit: 1,
      offset: 1,
      skip: 1,
    };

    expect(FilterSchema.safeParse(filter).data).toEqual(filter);
    expect(FilterSchema.safeParse(JSON.stringify(filter)).data).toEqual(filter);
    expect(FilterSchema.safeParse('').data).toEqual({});
    expect(InclusionSchema.safeParse([{ relation: 'a' }]).success).toBe(true);
  });
});
