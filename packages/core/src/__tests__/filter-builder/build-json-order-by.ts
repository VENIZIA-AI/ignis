import { FilterBuilder } from '@/base/repositories/operators';
import { getTableColumns } from 'drizzle-orm';
import { jsonb, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

// Test schema with JSON column
const testTable = pgTable('test_table', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  metadata: jsonb('metadata'),
  data: jsonb('data'),
});

// Access private method for testing
class TestableFilterBuilder extends FilterBuilder {
  public testBuildJsonOrderBy(opts: { key: string; direction: string; tableName: string }) {
    const columns = getTableColumns(testTable);
    return (this as any).buildJsonOrderBy({
      ...opts,
      columns,
    });
  }
}

interface ITestCase {
  input: string;
  direction: string;
  shouldPass: boolean;
  description: string;
}

const testCases: ITestCase[] = [
  // Valid cases - should PASS
  {
    input: 'metadata.field',
    direction: 'ASC',
    shouldPass: true,
    description: 'Simple field path',
  },
  {
    input: 'metadata.nested_field',
    direction: 'DESC',
    shouldPass: true,
    description: 'Underscore in field name',
  },
  {
    input: 'data.items[0]',
    direction: 'ASC',
    shouldPass: true,
    description: 'Array index',
  },
  {
    input: 'metadata.items[0].name',
    direction: 'ASC',
    shouldPass: true,
    description: 'Array index with nested field',
  },
  {
    input: 'data.a.b.c.d',
    direction: 'ASC',
    shouldPass: true,
    description: 'Deep nesting',
  },
  {
    input: 'metadata._private',
    direction: 'ASC',
    shouldPass: true,
    description: 'Starts with underscore',
  },
  {
    input: 'data.field123',
    direction: 'ASC',
    shouldPass: true,
    description: 'Field with numbers',
  },

  // Invalid cases - should FAIL (SQL injection attempts)
  {
    input: 'metadata.field; DROP TABLE users;--',
    direction: 'ASC',
    shouldPass: false,
    description: 'SQL injection - semicolon and DROP',
  },
  {
    input: "metadata.field' OR '1'='1",
    direction: 'ASC',
    shouldPass: false,
    description: 'SQL injection - quotes',
  },
  {
    input: 'metadata[0; DROP TABLE]',
    direction: 'ASC',
    shouldPass: false,
    description: 'SQL injection in array index',
  },
  {
    input: 'metadata.field-name',
    direction: 'ASC',
    shouldPass: false,
    description: 'Hyphen in field name',
  },
  {
    input: 'metadata.field name',
    direction: 'ASC',
    shouldPass: false,
    description: 'Space in field name',
  },
  {
    input: 'metadata.フィールド',
    direction: 'ASC',
    shouldPass: false,
    description: 'Unicode characters',
  },
  {
    input: 'metadata.field UNION SELECT',
    direction: 'ASC',
    shouldPass: false,
    description: 'SQL injection - UNION',
  },
  {
    input: 'metadata.`field`',
    direction: 'ASC',
    shouldPass: false,
    description: 'Backticks',
  },
  {
    input: 'metadata."field"',
    direction: 'ASC',
    shouldPass: false,
    description: 'Double quotes',
  },
  {
    input: 'metadata.field()',
    direction: 'ASC',
    shouldPass: false,
    description: 'Parentheses',
  },
  {
    input: 'metadata.field/*comment*/',
    direction: 'ASC',
    shouldPass: false,
    description: 'SQL comment',
  },
  {
    input: 'metadata.field\nDROP',
    direction: 'ASC',
    shouldPass: false,
    description: 'Newline injection',
  },

  // Invalid cases - non-JSON column
  {
    input: 'name.field',
    direction: 'ASC',
    shouldPass: false,
    description: 'Non-JSON column (varchar)',
  },

  // Invalid cases - non-existent column
  {
    input: 'nonexistent.field',
    direction: 'ASC',
    shouldPass: false,
    description: 'Non-existent column',
  },
];

function runTests() {
  const filterBuilder = new TestableFilterBuilder();
  let passed = 0;
  let failed = 0;

  console.log('='.repeat(70));
  console.log('Testing buildJsonOrderBy (SQL injection prevention)');
  console.log('='.repeat(70));

  for (const testCase of testCases) {
    let result: { success: boolean; error?: string; sql?: string } = { success: false };

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
      const icon = testCase.shouldPass ? '✓' : '✓';
      const action = testCase.shouldPass ? 'ALLOWED' : 'BLOCKED';
      console.log(`${icon} PASS: "${testCase.input}" - ${action}`);
      console.log(`  Description: ${testCase.description}`);
      if (result.success) {
        console.log(`  SQL: ${result.sql?.substring(0, 80)}...`);
      } else {
        console.log(`  Error: ${result.error?.substring(0, 80)}...`);
      }
      passed++;
    } else {
      const expected = testCase.shouldPass ? 'should PASS' : 'should be BLOCKED';
      const got = result.success ? 'PASSED' : 'was BLOCKED';
      console.log(`✗ FAIL: "${testCase.input}" - ${expected} but ${got}`);
      console.log(`  Description: ${testCase.description}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
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
