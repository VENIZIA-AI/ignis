import { Sorts } from '@/base/repositories';
import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect';
import type { TConstValue } from '@venizia/ignis-helpers';
import { getTableColumns } from 'drizzle-orm';
import { jsonb, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

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
  }) {
    const columns = getTableColumns(testTable);
    // Element access reaches the private `buildJsonOrderBy` without a cast - TS does not enforce
    // private/protected access through it.
    return this['buildJsonOrderBy']({
      ...opts,
      columns,
    });
  }
}

interface ITestCase {
  input: string;
  direction: TConstValue<typeof Sorts>;
  shouldPass: boolean;
  description: string;
}

const testCases: ITestCase[] = [
  {
    input: 'metadata.field',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Simple field path',
  },
  {
    input: 'metadata.nested_field',
    direction: Sorts.DESC,
    shouldPass: true,
    description: 'Underscore in field name',
  },
  {
    input: 'data.items[0]',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Array index',
  },
  {
    input: 'metadata.items[0].name',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Array index with nested field',
  },
  {
    input: 'data.a.b.c.d',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Deep nesting',
  },
  {
    input: 'metadata._private',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Starts with underscore',
  },
  {
    input: 'data.field123',
    direction: Sorts.ASC,
    shouldPass: true,
    description: 'Field with numbers',
  },

  {
    input: 'metadata.field; DROP TABLE users;--',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - semicolon and DROP',
  },
  {
    input: "metadata.field' OR '1'='1",
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - quotes',
  },
  {
    input: 'metadata[0; DROP TABLE]',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection in array index',
  },
  {
    input: 'metadata.field-name',
    direction: Sorts.ASC,
    shouldPass: true,
    // Kebab-case is a legal JSON key, allowed on purpose: the component is interpolated inside a
    // quoted `'{...}'` array literal it cannot escape.
    description: 'Hyphen in field name (kebab-case)',
  },
  {
    input: 'metadata.field name',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Space in field name',
  },
  {
    input: 'metadata.フィールド',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Unicode characters',
  },
  {
    input: 'metadata.field UNION SELECT',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL injection - UNION',
  },
  {
    input: 'metadata.`field`',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Backticks',
  },
  {
    input: 'metadata."field"',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Double quotes',
  },
  {
    input: 'metadata.field()',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Parentheses',
  },
  {
    input: 'metadata.field/*comment*/',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'SQL comment',
  },
  {
    input: 'metadata.field\nDROP',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Newline injection',
  },

  {
    input: 'name.field',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Non-JSON column (varchar)',
  },

  {
    input: 'nonexistent.field',
    direction: Sorts.ASC,
    shouldPass: false,
    description: 'Non-existent column',
  },
];

interface ITestResult {
  success: boolean;
  error?: string;
  sql?: string;
}

const reportPassedCase = (opts: { testCase: ITestCase; result: ITestResult }): void => {
  const { testCase, result } = opts;

  const icon = testCase.shouldPass ? '✓' : '✓';
  const action = testCase.shouldPass ? 'ALLOWED' : 'BLOCKED';
  console.log(`${icon} PASS: "${testCase.input}" - ${action}`);
  console.log(`  Description: ${testCase.description}`);

  if (result.success) {
    console.log(`  SQL: ${result.sql?.substring(0, 80)}...`);
    return;
  }

  console.log(`  Error: ${result.error?.substring(0, 80)}...`);
};

const reportFailedCase = (opts: { testCase: ITestCase; result: ITestResult }): void => {
  const { testCase, result } = opts;

  const expected = testCase.shouldPass ? 'should PASS' : 'should be BLOCKED';
  const got = result.success ? 'PASSED' : 'was BLOCKED';
  console.log(`✗ FAIL: "${testCase.input}" - ${expected} but ${got}`);
  console.log(`  Description: ${testCase.description}`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
};

function runTests() {
  const filterBuilder = new TestableFilterBuilder();
  let passed = 0;
  let failed = 0;

  console.log('='.repeat(70));
  console.log('Testing buildJsonOrderBy (SQL injection prevention)');
  console.log('='.repeat(70));

  for (const testCase of testCases) {
    let result: { success: boolean; error?: string; sql?: string };

    try {
      const sql = filterBuilder.testBuildJsonOrderBy({
        key: testCase.input,
        direction: testCase.direction,
        tableName: 'test_table',
      });
      result = { success: true, sql: String(sql) };
    } catch (err: any) {
      result = { success: false, error: err.message };
    }

    const isTestPassed = result.success === testCase.shouldPass;

    if (isTestPassed) {
      reportPassedCase({ testCase, result });
      passed++;
    } else {
      reportFailedCase({ testCase, result });
      failed++;
    }

    console.log();
  }

  console.log('='.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed, ${testCases.length} total`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
