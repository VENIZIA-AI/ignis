import { describe, expect, test } from 'bun:test';
import { QueryOperators, type TWhere } from '@venizia/ignis-filter';
import { MeilisearchQueryDialect } from '@/connectors/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/connectors/typesense/repositories/dialect/query-dialect';
import type { ISearchQueryDialect } from '@/connectors/search/repositories/common';

/**
 * The operator x engine classification table, and the checks that keep it honest.
 *
 * Every operator must land in exactly one of:
 *   (a) expressible          -> compiles
 *   (b) not expressible here -> a CATALOGUED 400 naming both the operator and the engine
 * and never in (c) silently wrong - which is what `or: []` compiling to `''` used to be.
 *
 * `canExpress` is the published form of that table, and it is only worth trusting if it is
 * COMPLETE (every member of the vocabulary has a cell) and TRUE (each cell matches what the
 * engine's own `switch` actually does). Both are asserted here, so a third engine cannot
 * reintroduce (c) by leaving an operator unclassified, and no cell can drift from its code.
 */

const CATALOGUED_UNSUPPORTED_OPERATOR = 'core.search_engine.unsupported_operator';

const typesense = new TypesenseQueryDialect();
const meilisearch = new MeilisearchQueryDialect();

type TEngineName = 'Typesense' | 'Meilisearch';

const DIALECTS: Array<{ name: TEngineName; dialect: ISearchQueryDialect }> = [
  { name: 'Typesense', dialect: typesense },
  { name: 'Meilisearch', dialect: meilisearch },
];

/**
 * The pinned classification. Spelled out per engine rather than read back from `canExpress`, so
 * flipping a cell takes a deliberate edit in BOTH places - a table derived from the code it is
 * meant to check would agree with it unconditionally.
 */
const EXPECTED: Record<string, Record<TEngineName, boolean>> = {
  [QueryOperators.EQ]: { Typesense: true, Meilisearch: true },
  [QueryOperators.NE]: { Typesense: true, Meilisearch: true },
  [QueryOperators.NEQ]: { Typesense: true, Meilisearch: true },
  [QueryOperators.GT]: { Typesense: true, Meilisearch: true },
  [QueryOperators.GTE]: { Typesense: true, Meilisearch: true },
  [QueryOperators.LT]: { Typesense: true, Meilisearch: true },
  [QueryOperators.LTE]: { Typesense: true, Meilisearch: true },

  [QueryOperators.LIKE]: { Typesense: false, Meilisearch: false },
  [QueryOperators.NOT_LIKE]: { Typesense: false, Meilisearch: false },
  [QueryOperators.ILIKE]: { Typesense: false, Meilisearch: false },
  [QueryOperators.NOT_ILIKE]: { Typesense: false, Meilisearch: false },
  [QueryOperators.REGEXP]: { Typesense: false, Meilisearch: false },
  [QueryOperators.IREGEXP]: { Typesense: false, Meilisearch: false },

  [QueryOperators.IS]: { Typesense: true, Meilisearch: true },
  [QueryOperators.IS_NOT]: { Typesense: true, Meilisearch: true },

  [QueryOperators.IN]: { Typesense: true, Meilisearch: true },
  [QueryOperators.INQ]: { Typesense: true, Meilisearch: true },
  [QueryOperators.NIN]: { Typesense: true, Meilisearch: true },

  // THE asymmetry this table exists to protect. Meilisearch has native EXISTS; Typesense cannot
  // test presence at all. Levelling these to the intersection would delete behaviour that works
  // today - exactly the regression a naive "mirror Typesense onto Meilisearch" would cause.
  [QueryOperators.EXISTS]: { Typesense: false, Meilisearch: true },
  [QueryOperators.NOT_EXISTS]: { Typesense: false, Meilisearch: true },

  [QueryOperators.BETWEEN]: { Typesense: true, Meilisearch: true },
  // De Morgan rewrite on both engines; relational supports it, so leaving it (b) would have
  // been a divergence logged rather than closed.
  [QueryOperators.NOT_BETWEEN]: { Typesense: true, Meilisearch: true },

  [QueryOperators.CONTAINS]: { Typesense: false, Meilisearch: false },
  [QueryOperators.CONTAINED_BY]: { Typesense: false, Meilisearch: false },
  [QueryOperators.OVERLAPS]: { Typesense: false, Meilisearch: false },

  [QueryOperators.NOT]: { Typesense: false, Meilisearch: false },

  [QueryOperators.AND]: { Typesense: true, Meilisearch: true },
  [QueryOperators.OR]: { Typesense: true, Meilisearch: true },
};

/** A VALID operand per operator, so an (a) cell that throws is a real disagreement and not a bad sample. */
const SAMPLE_OPERAND: Record<string, unknown> = {
  [QueryOperators.EQ]: 'x',
  [QueryOperators.NE]: 'x',
  [QueryOperators.NEQ]: 'x',
  [QueryOperators.GT]: 1,
  [QueryOperators.GTE]: 1,
  [QueryOperators.LT]: 1,
  [QueryOperators.LTE]: 1,
  [QueryOperators.LIKE]: '%x%',
  [QueryOperators.NOT_LIKE]: '%x%',
  [QueryOperators.ILIKE]: '%x%',
  [QueryOperators.NOT_ILIKE]: '%x%',
  [QueryOperators.REGEXP]: '^x',
  [QueryOperators.IREGEXP]: '^x',
  // Non-null deliberately: `is: null` is a VALUE-level limit on Typesense, asserted on its own below.
  [QueryOperators.IS]: 'x',
  [QueryOperators.IS_NOT]: 'x',
  // Non-empty deliberately: an empty list is ABSORBING, which is a different assertion entirely.
  [QueryOperators.IN]: ['x'],
  [QueryOperators.INQ]: ['x'],
  [QueryOperators.NIN]: ['x'],
  [QueryOperators.EXISTS]: true,
  [QueryOperators.NOT_EXISTS]: true,
  [QueryOperators.BETWEEN]: [1, 2],
  [QueryOperators.NOT_BETWEEN]: [1, 2],
  [QueryOperators.CONTAINS]: ['x'],
  [QueryOperators.CONTAINED_BY]: ['x'],
  [QueryOperators.OVERLAPS]: ['x'],
  [QueryOperators.NOT]: 'x',
};

/** `and`/`or` are structural: they take a clause list, not a field operand. */
const STRUCTURAL = new Set<string>([QueryOperators.AND, QueryOperators.OR]);

type TProbe = { threw: false } | { threw: true; message: string; code?: string };

const probe = (dialect: ISearchQueryDialect, where: TWhere): TProbe => {
  try {
    dialect.compileWhere({ where });
    return { threw: false };
  } catch (error) {
    const failure = error as Error & { normalized?: { code?: string } };
    return { threw: true, message: failure.message, code: failure.normalized?.code };
  }
};

const probeOperator = (dialect: ISearchQueryDialect, operator: string): TProbe =>
  probe(
    dialect,
    STRUCTURAL.has(operator)
      ? ({ [operator]: [{ name: 'x' }] } as TWhere)
      : ({ name: { [operator]: SAMPLE_OPERAND[operator] } } as TWhere),
  );

describe('operator capability matrix - completeness', () => {
  test('every operator in the vocabulary has a cell, and no cell is stale', () => {
    const unclassified = [...QueryOperators.SCHEME_SET].filter(
      operator => EXPECTED[operator] === undefined,
    );

    expect(
      unclassified,
      'these operators have no classification - an unclassified operator falls through to a default branch, which is how case (c) returns',
    ).toEqual([]);

    const stale = Object.keys(EXPECTED).filter(
      operator => !QueryOperators.SCHEME_SET.has(operator),
    );

    expect(stale, 'these cells classify operators QueryOperators no longer defines').toEqual([]);
  });

  for (const { name, dialect } of DIALECTS) {
    test(`${name}: answers canExpress for every operator in the vocabulary`, () => {
      const unanswered = [...QueryOperators.SCHEME_SET].filter(
        operator => typeof dialect.canExpress({ operator }) !== 'boolean',
      );

      expect(unanswered).toEqual([]);
    });
  }
});

describe('operator capability matrix - the published table is what the engine does', () => {
  for (const { name, dialect } of DIALECTS) {
    for (const operator of QueryOperators.SCHEME_SET) {
      const expected = EXPECTED[operator]?.[name];

      test(`${name}: canExpress('${operator}') === ${expected}`, () => {
        expect(dialect.canExpress({ operator })).toBe(expected);
      });

      test(`${name}: '${operator}' behaves as classified`, () => {
        const outcome = probeOperator(dialect, operator);

        if (expected) {
          expect(
            outcome,
            `[${name}] '${operator}' is classified expressible but compiling it threw`,
          ).toEqual({ threw: false });
          return;
        }

        expect(
          outcome.threw,
          `[${name}] '${operator}' is classified unsupported but compiled anyway - the caller would get a filter that does not mean what they asked for`,
        ).toBe(true);

        if (!outcome.threw) {
          return;
        }

        // (b) is only actionable if a client can branch on it: catalogued code, and BOTH the
        // operator and the engine named - which engine backs the collection is what decides this.
        expect(outcome.code, `[${name}] '${operator}' must reject with a catalogued code`).toBe(
          CATALOGUED_UNSUPPORTED_OPERATOR,
        );
        expect(outcome.message).toContain(`operator: '${operator}'`);
        // The explicit `engine:` token, not a bare substring - every message already carries the
        // dialect's class name, so `toContain('Typesense')` would pass without the engine ever
        // being named as the deciding factor.
        expect(outcome.message).toContain(`engine: '${name}'`);
      });
    }
  }
});

describe('operator capability matrix - value-level limits the operator table cannot carry', () => {
  /**
   * `canExpress` answers per OPERATOR, so it cannot say "expressible for a value, not for null".
   * Typesense has no null at all: `is: null`, `isn: null`, `exists` and `notExists` are one
   * limitation wearing four names, and all of them reject with the same catalogued code.
   */
  test('Typesense: `is: null` is refused even though `is` is classified expressible', () => {
    expect(typesense.canExpress({ operator: QueryOperators.IS })).toBe(true);

    const outcome = probe(typesense, { name: { is: null } });

    expect(outcome.threw).toBe(true);
    if (!outcome.threw) {
      return;
    }

    expect(outcome.code).toBe(CATALOGUED_UNSUPPORTED_OPERATOR);
    expect(outcome.message).toContain('Typesense');
    expect(outcome.message).toMatch(/no null representation/);
  });

  test('Typesense: `isn: null` is refused for the same stated reason', () => {
    const outcome = probe(typesense, { name: { isn: null } });

    expect(outcome.threw).toBe(true);
    if (!outcome.threw) {
      return;
    }

    expect(outcome.code).toBe(CATALOGUED_UNSUPPORTED_OPERATOR);
    expect(outcome.message).toMatch(/no null representation/);
  });

  /** Meilisearch DOES have null, and this is the behaviour a naive engine-mirroring would delete. */
  test('Meilisearch: `is: null` compiles to IS NULL', () => {
    expect(meilisearch.compileWhere({ where: { name: { is: null } } })).toEqual({
      outcome: 'filter',
      filterBy: 'name IS NULL',
    });
  });

  test('Meilisearch: `exists` compiles to EXISTS', () => {
    expect(meilisearch.compileWhere({ where: { name: { exists: true } } })).toEqual({
      outcome: 'filter',
      filterBy: 'name EXISTS',
    });
  });
});
