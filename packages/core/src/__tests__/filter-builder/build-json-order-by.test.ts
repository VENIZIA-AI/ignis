import { describe, test, expect } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import { jsonb, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import type { AnyType, TConstValue } from '@venizia/ignis-helpers/common';

import { Sorts } from '@/base/repositories';
import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect';

const testTable = pgTable('test_table', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  metadata: jsonb('metadata'),
  data: jsonb('data'),
});

class TestableFilterBuilder extends PostgresFilterBuilder {
  public testBuildJsonOrderBy(opts: {
    key: string;
    direction: TConstValue<typeof Sorts>;
    tableName: string;
  }): SQL {
    const columns = getTableColumns(testTable);

    // Element access reaches the protected `buildJsonOrderBy` without a cast - TS does not enforce
    // private/protected access through it.
    return this['buildJsonOrderBy']({
      ...opts,
      columns,
    });
  }
}

/** `sql.raw` output has no meaningful `toString` - the emitted text lives in the chunk values. */
const toRawSql = (value: SQL): string => {
  const chunks = (value as AnyType).queryChunks as { value: string[] }[];

  return chunks.map(chunk => chunk.value.join('')).join('');
};

interface ITestCaseBase {
  input: string;
  direction: TConstValue<typeof Sorts>;
  description: string;
}

// An allowed key must emit the exact SQL, and a blocked key must be rejected for the stated reason:
// a key blocked by accident is not a passing case.
type TTestCase =
  | (ITestCaseBase & { shouldPass: true; expectedSql: string })
  | (ITestCaseBase & { shouldPass: false; expectedError: RegExp });

const testCases: TTestCase[] = [
  {
    input: 'metadata.field',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Simple field path',
    expectedSql: `"metadata" #> '{field}' ASC`,
  },
  {
    input: 'metadata.nested_field',
    direction: Sorts.DESC,
    shouldPass: true,
    description: 'Underscore in field name',
    expectedSql: `"metadata" #> '{nested_field}' DESC`,
  },
  {
    input: 'data.items[0]',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Array index',
    expectedSql: `"data" #> '{items,0}' ASC`,
  },
  {
    input: 'metadata.items[0].name',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Array index with nested field',
    expectedSql: `"metadata" #> '{items,0,name}' ASC`,
  },
  {
    input: 'data.a.b.c.d',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Deep nesting',
    expectedSql: `"data" #> '{a,b,c,d}' ASC`,
  },
  {
    input: 'metadata._private',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Starts with underscore',
    expectedSql: `"metadata" #> '{_private}' ASC`,
  },
  {
    input: 'data.field123',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Field with numbers',
    expectedSql: `"data" #> '{field123}' ASC`,
  },

  {
    input: 'metadata.field; DROP TABLE users;--',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - semicolon and DROP',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: "metadata.field' OR '1'='1",
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - quotes',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata[0; DROP TABLE]',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection in array index',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.field-name',
    direction: Sorts.ASC,
    shouldPass: true,
    // Kebab-case is a legal JSON key, allowed on purpose: the component is interpolated inside a
    // quoted `'{...}'` array literal it cannot escape.
    description: 'Hyphen in field name (kebab-case)',
    expectedSql: `"metadata" #> '{field-name}' ASC`,
  },
  {
    input: 'metadata.field name',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Space in field name',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.フィールド',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Unicode characters',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.field UNION SELECT',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - UNION',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.`field`',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Backticks',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata."field"',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Double quotes',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.field()',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Parentheses',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.field/*comment*/',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL comment',
    expectedError: /Invalid JSON path component/,
  },
  {
    input: 'metadata.field\nDROP',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Newline injection',
    expectedError: /Invalid JSON path component/,
  },

  {
    input: 'name.field',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Non-JSON column (varchar)',
    expectedError: /Column 'name' is not a JSON column/,
  },

  {
    input: 'nonexistent.field',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Non-existent column',
    expectedError: /Column NOT FOUND \| key: 'nonexistent'/,
  },
];

describe('FilterBuilder.buildJsonOrderBy - SQL injection prevention', () => {
  const filterBuilder = new TestableFilterBuilder();

  for (const testCase of testCases) {
    const action = testCase.shouldPass ? 'allows' : 'blocks';

    test(`${action} ${testCase.description}: ${JSON.stringify(testCase.input)}`, () => {
      const build = () =>
        filterBuilder.testBuildJsonOrderBy({
          key: testCase.input,
          direction: testCase.direction,
          tableName: 'test_table',
        });

      if (!testCase.shouldPass) {
        let caught: unknown;

        try {
          build();
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeDefined();
        expect((caught as Error).message).toMatch(testCase.expectedError);

        return;
      }

      expect(toRawSql(build())).toBe(testCase.expectedSql);
    });
  }
});
