import { describe, test, expect } from 'bun:test';

import { parseJsonPath } from '@venizia/ignis-connectors/relational';

interface ITestCase {
  input: string;
  expected: { columnName: string; path: string[] };
}

const testCases: ITestCase[] = [
  {
    input: 'metadata.field',
    expected: { columnName: 'metadata', path: ['field'] },
  },

  {
    input: 'data.nested.value',
    expected: { columnName: 'data', path: ['nested', 'value'] },
  },

  {
    input: 'items[0]',
    expected: { columnName: 'items', path: ['0'] },
  },

  {
    input: 'items[0].name',
    expected: { columnName: 'items', path: ['0', 'name'] },
  },

  {
    input: 'data.items[0].value',
    expected: { columnName: 'data', path: ['items', '0', 'value'] },
  },

  {
    input: 'matrix[0][1]',
    expected: { columnName: 'matrix', path: ['0', '1'] },
  },

  {
    input: 'a.b.c.d.e',
    expected: { columnName: 'a', path: ['b', 'c', 'd', 'e'] },
  },

  {
    input: 'config.servers[0].ports[2].value',
    expected: { columnName: 'config', path: ['servers', '0', 'ports', '2', 'value'] },
  },

  {
    input: 'user_data.first_name',
    expected: { columnName: 'user_data', path: ['first_name'] },
  },

  {
    input: 'metadata',
    expected: { columnName: 'metadata', path: [] },
  },

  {
    input: 'data.items[5]',
    expected: { columnName: 'data', path: ['items', '5'] },
  },

  {
    input: 'arr[999]',
    expected: { columnName: 'arr', path: ['999'] },
  },

  {
    input: 'data.field; DROP TABLE users;--',
    expected: { columnName: 'data', path: ['field; DROP TABLE users;--'] },
  },

  {
    input: "data.field' OR '1'='1",
    expected: { columnName: 'data', path: ["field' OR '1'='1"] },
  },

  {
    input: 'data[0; DROP TABLE]',
    expected: { columnName: 'data', path: ['0; DROP TABLE'] },
  },

  {
    input: 'data.field-name',
    expected: { columnName: 'data', path: ['field-name'] },
  },

  {
    input: 'data.field name',
    expected: { columnName: 'data', path: ['field name'] },
  },

  {
    input: 'data.フィールド',
    expected: { columnName: 'data', path: ['フィールド'] },
  },

  {
    input: 'data[]',
    expected: { columnName: 'data', path: [] },
  },

  {
    input: 'data..field',
    expected: { columnName: 'data', path: ['field'] },
  },

  {
    input: '.data.field',
    expected: { columnName: 'data', path: ['field'] },
  },

  {
    input: 'data.field.',
    expected: { columnName: 'data', path: ['field'] },
  },

  {
    input: 'data.field UNION SELECT * FROM users',
    expected: { columnName: 'data', path: ['field UNION SELECT * FROM users'] },
  },

  {
    input: 'data.`field`',
    expected: { columnName: 'data', path: ['`field`'] },
  },

  {
    input: 'data."field"',
    expected: { columnName: 'data', path: ['"field"'] },
  },

  {
    input: 'data.field()',
    expected: { columnName: 'data', path: ['field()'] },
  },

  {
    input: 'data.field\x00',
    expected: { columnName: 'data', path: ['field\x00'] },
  },

  {
    input: 'data.field\nDROP TABLE',
    expected: { columnName: 'data', path: ['field\nDROP TABLE'] },
  },

  {
    input: 'data.field/*comment*/',
    expected: { columnName: 'data', path: ['field/*comment*/'] },
  },

  {
    input: '',
    expected: { columnName: '', path: [] },
  },
];

// parseJsonPath only splits: it never rejects. Injection payloads are expected to survive intact
// here, because rejection is validateJsonPathComponents' job further down the chain.
describe('parseJsonPath', () => {
  for (const testCase of testCases) {
    test(`parses ${JSON.stringify(testCase.input)}`, () => {
      const result = parseJsonPath({ key: testCase.input });

      expect(result.columnName).toBe(testCase.expected.columnName);
      expect(result.path).toEqual(testCase.expected.path);
    });
  }
});
