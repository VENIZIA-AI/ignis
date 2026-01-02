import { FilterBuilder } from '@/base/repositories/operators';

// Access private method for testing
class TestableFilterBuilder extends FilterBuilder {
  public testParseJsonPath(key: string) {
    return (this as any).parseJsonPath(key);
  }
}

interface ITestCase {
  input: string;
  expected: { columnName: string; path: string[] };
}

const testCases: ITestCase[] = [
  // Case 1: Simple JSON path - single level
  {
    input: 'metadata.field',
    expected: { columnName: 'metadata', path: ['field'] },
  },

  // Case 2: Nested JSON path - multiple levels
  {
    input: 'data.nested.value',
    expected: { columnName: 'data', path: ['nested', 'value'] },
  },

  // Case 3: Array index only
  {
    input: 'items[0]',
    expected: { columnName: 'items', path: ['0'] },
  },

  // Case 4: Array index with nested field
  {
    input: 'items[0].name',
    expected: { columnName: 'items', path: ['0', 'name'] },
  },

  // Case 5: Field then array index then field
  {
    input: 'data.items[0].value',
    expected: { columnName: 'data', path: ['items', '0', 'value'] },
  },

  // Case 6: Multiple array indices
  {
    input: 'matrix[0][1]',
    expected: { columnName: 'matrix', path: ['0', '1'] },
  },

  // Case 7: Deep nesting with dots only
  {
    input: 'a.b.c.d.e',
    expected: { columnName: 'a', path: ['b', 'c', 'd', 'e'] },
  },

  // Case 8: Complex mixed path
  {
    input: 'config.servers[0].ports[2].value',
    expected: { columnName: 'config', path: ['servers', '0', 'ports', '2', 'value'] },
  },

  // Case 9: Underscore in field names
  {
    input: 'user_data.first_name',
    expected: { columnName: 'user_data', path: ['first_name'] },
  },

  // Case 10: Single column name (edge case - no path)
  {
    input: 'metadata',
    expected: { columnName: 'metadata', path: [] },
  },

  // Case 11: Array at end
  {
    input: 'data.items[5]',
    expected: { columnName: 'data', path: ['items', '5'] },
  },

  // Case 12: Large array index
  {
    input: 'arr[999]',
    expected: { columnName: 'arr', path: ['999'] },
  },

  // Case 13: SQL injection attempt - semicolon
  {
    input: 'data.field; DROP TABLE users;--',
    expected: { columnName: 'data', path: ['field; DROP TABLE users;--'] },
  },

  // Case 14: SQL injection attempt - quotes
  {
    input: "data.field' OR '1'='1",
    expected: { columnName: 'data', path: ["field' OR '1'='1"] },
  },

  // Case 15: SQL injection attempt - in array index
  {
    input: 'data[0; DROP TABLE]',
    expected: { columnName: 'data', path: ['0; DROP TABLE'] },
  },

  // Case 16: Special chars - hyphen
  {
    input: 'data.field-name',
    expected: { columnName: 'data', path: ['field-name'] },
  },

  // Case 17: Special chars - space
  {
    input: 'data.field name',
    expected: { columnName: 'data', path: ['field name'] },
  },

  // Case 18: Special chars - unicode
  {
    input: 'data.フィールド',
    expected: { columnName: 'data', path: ['フィールド'] },
  },

  // Case 19: Empty brackets
  {
    input: 'data[]',
    expected: { columnName: 'data', path: [] },
  },

  // Case 20: Double dots
  {
    input: 'data..field',
    expected: { columnName: 'data', path: ['field'] },
  },

  // Case 21: Starts with dot
  {
    input: '.data.field',
    expected: { columnName: 'data', path: ['field'] },
  },

  // Case 22: Ends with dot
  {
    input: 'data.field.',
    expected: { columnName: 'data', path: ['field'] },
  },

  // Case 23: SQL injection - UNION
  {
    input: 'data.field UNION SELECT * FROM users',
    expected: { columnName: 'data', path: ['field UNION SELECT * FROM users'] },
  },

  // Case 24: Backticks
  {
    input: 'data.`field`',
    expected: { columnName: 'data', path: ['`field`'] },
  },

  // Case 25: Double quotes
  {
    input: 'data."field"',
    expected: { columnName: 'data', path: ['"field"'] },
  },

  // Case 26: Parentheses
  {
    input: 'data.field()',
    expected: { columnName: 'data', path: ['field()'] },
  },

  // Case 27: Null byte injection
  {
    input: 'data.field\x00',
    expected: { columnName: 'data', path: ['field\x00'] },
  },

  // Case 28: Newline injection
  {
    input: 'data.field\nDROP TABLE',
    expected: { columnName: 'data', path: ['field\nDROP TABLE'] },
  },

  // Case 29: Comment injection
  {
    input: 'data.field/*comment*/',
    expected: { columnName: 'data', path: ['field/*comment*/'] },
  },

  // Case 30: Empty string
  {
    input: '',
    expected: { columnName: '', path: [] },
  },
];

function runTests() {
  const filterBuilder = new TestableFilterBuilder();
  let passed = 0;
  let failed = 0;

  console.log('='.repeat(60));
  console.log('Testing parseJsonPath');
  console.log('='.repeat(60));

  for (const testCase of testCases) {
    const result = filterBuilder.testParseJsonPath(testCase.input);

    const isColumnMatch = result.columnName === testCase.expected.columnName;
    const isPathMatch =
      result.path.length === testCase.expected.path.length &&
      result.path.every((p: string, i: number) => p === testCase.expected.path[i]);

    if (isColumnMatch && isPathMatch) {
      console.log(`✓ PASS: "${testCase.input}"`);
      console.log(
        `  → columnName: "${result.columnName}", path: [${result.path.map((p: string) => `"${p}"`).join(', ')}]`,
      );
      passed++;
    } else {
      console.log(`✗ FAIL: "${testCase.input}"`);
      console.log(
        `  Expected: columnName: "${testCase.expected.columnName}", path: [${testCase.expected.path.map(p => `"${p}"`).join(', ')}]`,
      );
      console.log(
        `  Got:      columnName: "${result.columnName}", path: [${result.path.map((p: string) => `"${p}"`).join(', ')}]`,
      );
      failed++;
    }
    console.log();
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${testCases.length} total`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
